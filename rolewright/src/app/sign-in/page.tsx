import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn, signInMethods } from "@/auth";
import { Button, Card, Field, Input, Notice } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

export const metadata: Metadata = { title: "Sign in" };

const t = en.signIn;

async function googleAction() {
  "use server";
  await signIn("google", { redirectTo: "/app" });
}

async function emailAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return;
  await signIn("resend", { email, redirectTo: "/app" });
}

async function devAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return;
  await signIn("dev", { email, redirectTo: "/app" });
}

export default async function SignInPage() {
  const session = await auth();
  if (session) redirect("/app");
  const methods = signInMethods();
  const any = methods.google || methods.email || methods.dev;

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-md space-y-6 px-4 py-12 sm:py-20">
      <div className="space-y-2">
        <p className="font-heading text-2xl font-semibold text-brand">{en.product}</p>
        <h1 className="font-heading text-3xl font-semibold">{t.title}</h1>
        {any ? <p className="text-muted">{t.intro}</p> : null}
      </div>

      {!any ? (
        <Notice tone="warn" title={t.notConfigured} />
      ) : (
        <Card className="space-y-6">
          {methods.google ? (
            <form action={googleAction}>
              <Button type="submit" variant="secondary" className="w-full">
                {t.google}
              </Button>
            </form>
          ) : null}

          {methods.google && methods.email ? (
            <p aria-hidden="true" className="text-center text-sm text-muted">
              {t.or}
            </p>
          ) : null}

          {methods.email ? (
            <form action={emailAction} className="space-y-3">
              <Field id="signin-email" label={t.emailLabel} hint={t.emailHelp}>
                {(f) => (
                  <Input
                    id={f.id}
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    aria-describedby={f.describedBy}
                  />
                )}
              </Field>
              <Button type="submit" className="w-full">
                {t.emailButton}
              </Button>
            </form>
          ) : null}

          {methods.dev ? (
            <form action={devAction} className="space-y-3 border-t border-line pt-6">
              <h2 className="font-heading text-xl font-semibold">{t.devHeading}</h2>
              <Notice tone="warn">{t.devWarning}</Notice>
              <Field id="dev-email" label={t.emailLabel}>
                {(f) => <Input id={f.id} name="email" type="email" autoComplete="email" required />}
              </Field>
              <Button type="submit" variant="secondary" className="w-full">
                {t.devButton}
              </Button>
            </form>
          ) : null}
        </Card>
      )}

      <Link href="/" className="inline-block min-h-8 py-1 text-brand underline underline-offset-4">
        {t.back}
      </Link>
    </main>
  );
}
