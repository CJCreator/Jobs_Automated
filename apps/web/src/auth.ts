// Sign-in (Auth.js v5). Sessions are signed, encrypted JWT cookies; the only
// thing the app reads from one is our own users.id, which every data route
// passes to withUser.
//
// Providers are switched on by environment variables, so a deployment only
// offers what it has credentials for.

import { headers } from "next/headers";
import NextAuth, { AuthError, type DefaultSession, type NextAuthConfig } from "next-auth";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { getDb } from "@/lib/db/index.mjs";
import * as repo from "@/lib/db/repo.mjs";
import { assertSafeEnv, devLoginEnabled, strictEnv } from "@/lib/server/env-guard.mjs";
import { takeRateLimit } from "@/lib/server/rate-limit";
import { HttpError } from "@/lib/server/http";
import { allowEmailLink, gateSignInAction } from "@/lib/server/signin-limit.mjs";
import { maySignIn, signupMode } from "@/lib/server/signup-gate.mjs";

declare module "next-auth" {
  interface Session {
    user: { id: string; email: string } & DefaultSession["user"];
  }
}

// Every page and route that needs a session imports this module, so a
// production server with the development sign-in, the mock AI or no secret
// fails here, before it can answer anything. Skipped during `next build`.
assertSafeEnv(process.env);

const devLogin = devLoginEnabled(process.env);

const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
const emailEnabled = Boolean(process.env.AUTH_RESEND_KEY && process.env.EMAIL_FROM);

// Development only: in production assertSafeEnv above has already refused to
// run without AUTH_SECRET.
const DEV_ONLY_SECRET = "rolewright-development-only-secret-never-use-in-production";

// A stolen or copied cookie works until it expires (signing out does not
// revoke it), so sessions are kept short.
const SESSION_MAX_AGE_S = 7 * 24 * 60 * 60;

/** Which sign-in methods this deployment offers. */
export function signInMethods(): { google: boolean; email: boolean; dev: boolean } {
  return { google: googleEnabled, email: emailEnabled, dev: devLogin };
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]{1,190}\.[A-Za-z]{2,}$/;

type DbUser = { id: string; email: string; name: string | null; image: string | null; emailVerified: Date | string | null };

function toAdapterUser(u: DbUser): AdapterUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? null,
    image: u.image ?? null,
    emailVerified: u.emailVerified ? new Date(u.emailVerified) : null,
  };
}

const orNull = (u: DbUser | null | undefined) => (u ? toAdapterUser(u) : null);

// Only what JWT sessions need: users, linked accounts and email-link tokens.
// Every id handed back is OUR users.id (a UUID), never the one Auth.js proposes.
const adapter: Adapter = {
  async createUser(user) {
    // Second layer behind the signIn callback: a path that skipped it still
    // creates no row for an address the sign-up gate refuses.
    if (!maySignIn({ email: user.email, existingUser: false }, process.env)) {
      throw new Error("Sign-ups are closed to this address.");
    }
    const db = await getDb();
    const created = await repo.upsertUserByEmail(db, {
      email: user.email,
      name: user.name ?? null,
      image: user.image ?? null,
      emailVerified: user.emailVerified ?? null,
    });
    return toAdapterUser(created);
  },
  async getUser(id) {
    return orNull(await repo.getUserById(await getDb(), id));
  },
  async getUserByEmail(email) {
    return orNull(await repo.getUserByEmail(await getDb(), email));
  },
  async getUserByAccount({ provider, providerAccountId }) {
    return orNull(await repo.getUserByAccount(await getDb(), provider, providerAccountId));
  },
  async updateUser(user) {
    const updated = await repo.updateUser(await getDb(), user.id, {
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      image: user.image ?? undefined,
      emailVerified: user.emailVerified ?? undefined,
    });
    if (!updated) throw new Error("User not found.");
    return toAdapterUser(updated);
  },
  async linkAccount(account) {
    await repo.linkAccount(await getDb(), {
      userId: account.userId,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
    });
  },
  async createVerificationToken(token) {
    const saved = await repo.createVerificationToken(await getDb(), token);
    return { identifier: saved.identifier, token: saved.token, expires: new Date(saved.expires) };
  },
  async useVerificationToken({ identifier, token }) {
    const used = await repo.useVerificationToken(await getDb(), { identifier, token });
    return used ? { identifier: used.identifier, token: used.token, expires: new Date(used.expires) } : null;
  },
};

const providers: NextAuthConfig["providers"] = [];

if (googleEnabled) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Google only vouches for addresses it has verified (checked in signIn
      // below), so someone who first signed in by email link can later use
      // Google for the same address instead of being locked out.
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

if (emailEnabled) {
  providers.push(Resend({ apiKey: process.env.AUTH_RESEND_KEY, from: process.env.EMAIL_FROM }));
}

if (devLogin) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Development sign-in",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
        if (!EMAIL_RE.test(email) || email.length > 254) return null;
        const user = await repo.upsertUserByEmail(await getDb(), { email });
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  );
}

const config: NextAuthConfig = {
  adapter,
  providers,
  // Credentials sign-in only works with JWT sessions, and an adapter would
  // otherwise switch the default to database sessions.
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_S },
  secret: process.env.AUTH_SECRET || (strictEnv(process.env) ? undefined : DEV_ONLY_SECRET),
  pages: { signIn: "/sign-in", error: "/sign-in" },
  callbacks: {
    // Auth.js calls this twice for an email link: when the link is requested
    // (before any token is stored or email sent) and when it is opened. Both
    // calls resolve the same address and ask the same question, so they agree.
    async signIn({ user, account, profile, email: emailStep }) {
      // The development sign-in is exempt, and only when it is actually enabled.
      if (account?.provider === "dev" && devLogin) return true;
      const google = account?.provider === "google";
      if (google && profile?.email_verified !== true) return false;
      const email = String((google ? profile?.email : user?.email) ?? "").trim().toLowerCase();
      if (!email) return false;
      // Auth.js signs a linked Google account in by providerAccountId, so look
      // the user up by account first; their Google address may have changed.
      const db = await getDb();
      const linked =
        google && account?.providerAccountId ? await repo.getUserByAccount(db, "google", account.providerAccountId) : null;
      const existing = linked ?? (await repo.getUserByEmail(db, email));
      const allowed = maySignIn({ email, existingUser: Boolean(existing) }, process.env);
      // In closed mode an unknown address gets the same "check your email"
      // page as a known one, so the response does not reveal who has an
      // account. Returning a string makes Auth.js redirect before it creates
      // a token or sends an email.
      const verifyRequest = account
        ? `/api/auth/verify-request?${new URLSearchParams({ provider: account.provider, type: "email" })}`
        : null;
      if (!allowed && verifyRequest && emailStep?.verificationRequest && signupMode(process.env) === "closed") {
        return verifyRequest;
      }
      // Email-link sends are limited per address. This is the only point before both the token
      // is stored and the email is sent: Auth.js starts sendVerificationRequest and
      // createVerificationToken together (Promise.all in send-token.js), so a refusal inside the
      // adapter would not stop the email. Only addresses the gate admitted spend a send, and a
      // limited address gets the same "check your email" page as any other.
      if (allowed && verifyRequest && emailStep?.verificationRequest) {
        try {
          if (!(await allowEmailLink({ email, take: takeRateLimit }))) return verifyRequest;
        } catch {
          // Limiter unavailable: send nothing, and answer as for any other address (a thrown
          // error would read as AccessDenied and show which addresses are known).
          console.warn("[auth] email-link limiter unavailable");
          return verifyRequest;
        }
      }
      return allowed;
    },
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      const uid = typeof token.uid === "string" ? token.uid : token.sub;
      if (uid) session.user.id = uid;
      return session;
    },
  },
  // Auth.js's own logs can carry an email address or a provider's response;
  // keep only the error's name and the warning code.
  logger: {
    error(error) {
      console.error(`[auth] error ${error.name}`);
    },
    warn(code) {
      console.warn(`[auth] warning ${code}`);
    },
    debug() {},
  },
};

const nextAuth = NextAuth(config);
export const { handlers, auth, signOut } = nextAuth;

/**
 * The sign-in page's server actions call this, and Auth.js runs in-process on that path, so the
 * route's POST gate never sees them: count them here. The route calls handlers.POST, not this,
 * so nothing is counted twice. A refusal becomes a bare AuthError (no cause), which the page
 * turns into its generic "sign-in failed" redirect.
 */
export async function signIn(...args: Parameters<typeof nextAuth.signIn>): ReturnType<typeof nextAuth.signIn> {
  try {
    await gateSignInAction({ headers: await headers(), take: takeRateLimit });
  } catch (err) {
    if (err instanceof HttpError) {
      console.warn(`[rolewright] sign-in action ${err.status} ${err.code}`);
      throw new AuthError("Sign-in limited.");
    }
    throw err;
  }
  return nextAuth.signIn(...args);
}
