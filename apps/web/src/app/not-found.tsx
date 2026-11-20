import Link from "next/link";
import { buttonClass } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-xl space-y-4 px-4 py-24">
      <h1 className="font-heading text-4xl font-semibold">{en.errors.notFoundTitle}</h1>
      <p className="text-muted">{en.errors.notFoundBody}</p>
      <Link href="/" className={buttonClass("primary")}>
        {en.errors.notFoundLink}
      </Link>
    </main>
  );
}
