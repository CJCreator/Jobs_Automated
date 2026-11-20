import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

export const metadata: Metadata = { title: en.checkEmail.title };

const t = en.checkEmail;

// Every email-link request the sign-in page accepts ends here: link sent, address not allowed to sign up, requests
// limited, or the limiter down. The page reads nothing from the request, so it cannot show
// which of those happened or whether the address has an account.
export default function CheckEmailPage() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-md space-y-6 px-4 py-12 sm:py-20">
      <div className="space-y-2">
        <p className="font-heading text-2xl font-semibold text-brand">{en.product}</p>
        <h1 className="font-heading text-3xl font-semibold">{t.title}</h1>
        <p className="text-muted">{t.body}</p>
      </div>

      <Notice tone="info">
        <p>{t.delay}</p>
        <p>{t.limited}</p>
      </Notice>

      <Link href="/sign-in" className="inline-block min-h-8 py-1 text-brand underline underline-offset-4">
        {t.back}
      </Link>
    </main>
  );
}
