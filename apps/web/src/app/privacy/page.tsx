import type { Metadata } from "next";
import Link from "next/link";
import { PrivacyNotice } from "@/components/privacy-notice";
import { buttonClass } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

export const metadata: Metadata = { title: en.notice.pageTitle };
// The grievance contact comes from environment variables read per request.
export const dynamic = "force-dynamic";

export default function PublicPrivacyPage() {
  return (
    <>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="font-heading text-2xl font-semibold text-brand">
          {en.product}
        </Link>
        <Link href="/sign-in" className={buttonClass("secondary")}>
          {en.notice.signInLink}
        </Link>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8 sm:px-6">
        <PrivacyNotice />
      </main>
    </>
  );
}
