import type { Metadata } from "next";
import { signOut } from "@/auth";
import { DeleteAccount } from "@/components/delete-account";
import { PageTitle } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

export const metadata: Metadata = { title: "Privacy" };

const t = en.app.privacy;

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/" });
}

export default function PrivacyPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <PageTitle>{t.title}</PageTitle>
        <p className="text-lg text-muted">{t.intro}</p>
      </div>

      <section aria-labelledby="stored-title" className="space-y-2">
        <h2 id="stored-title" className="font-heading text-2xl font-semibold">
          {t.storedTitle}
        </h2>
        <ul className="max-w-[65ch] list-disc space-y-1 ps-5">
          {t.stored.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="not-stored-title" className="space-y-2">
        <h2 id="not-stored-title" className="font-heading text-2xl font-semibold">
          {t.notStoredTitle}
        </h2>
        <ul className="max-w-[65ch] list-disc space-y-1 ps-5">
          {t.notStored.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sent-title" className="space-y-2">
        <h2 id="sent-title" className="font-heading text-2xl font-semibold">
          {t.sentTitle}
        </h2>
        <p className="max-w-[65ch]">{t.sent}</p>
      </section>

      <section aria-labelledby="retention-title" className="space-y-2">
        <h2 id="retention-title" className="font-heading text-2xl font-semibold">
          {t.retentionTitle}
        </h2>
        <p className="max-w-[65ch]">{t.retention}</p>
      </section>

      <DeleteAccount signOutAction={signOutAction} />
    </div>
  );
}
