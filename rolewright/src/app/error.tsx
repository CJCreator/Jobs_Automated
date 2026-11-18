"use client";

import Link from "next/link";
import { Button, buttonClass } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-xl space-y-4 px-4 py-24">
      <h1 className="font-heading text-4xl font-semibold">{en.errors.errorTitle}</h1>
      <p className="text-muted">{en.errors.errorBody}</p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={reset}>{en.common.retry}</Button>
        <Link href="/" className={buttonClass("secondary")}>
          {en.errors.notFoundLink}
        </Link>
      </div>
    </main>
  );
}
