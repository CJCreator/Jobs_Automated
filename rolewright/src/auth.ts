// Sign-in (Auth.js v5). Sessions are signed, encrypted JWT cookies; the only
// thing the app reads from one is our own users.id, which every data route
// passes to withUser.
//
// Providers are switched on by environment variables, so a deployment only
// offers what it has credentials for.

import NextAuth, { type DefaultSession, type NextAuthConfig } from "next-auth";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { getDb } from "@/lib/db/index.mjs";
import * as repo from "@/lib/db/repo.mjs";

declare module "next-auth" {
  interface Session {
    user: { id: string; email: string } & DefaultSession["user"];
  }
}

const isProduction = process.env.NODE_ENV === "production";
const devLogin = process.env.ROLEWRIGHT_DEV_LOGIN === "1";

// Checked only when the flag is set, so `next build` (which runs with
// NODE_ENV=production and imports this file) is unaffected by default.
if (devLogin && isProduction) {
  throw new Error(
    "ROLEWRIGHT_DEV_LOGIN=1 lets anyone sign in as any email address without proof. " +
      "It is for local development only and must not be set when NODE_ENV is production. Remove it and restart.",
  );
}

const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
const emailEnabled = Boolean(process.env.AUTH_RESEND_KEY && process.env.EMAIL_FROM);

// Development only. In production Auth.js refuses every request without a
// secret (MissingSecret), which is the "required" check; failing here instead
// would break `next build` on a machine that has no secret.
const DEV_ONLY_SECRET = "rolewright-development-only-secret-never-use-in-production";

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
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET || (isProduction ? undefined : DEV_ONLY_SECRET),
  pages: { signIn: "/sign-in", error: "/sign-in" },
  callbacks: {
    signIn({ account, profile }) {
      if (account?.provider === "google") return profile?.email_verified === true;
      return true;
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

export const { handlers, auth, signIn, signOut } = NextAuth(config);
