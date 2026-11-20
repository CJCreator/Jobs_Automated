import { PageTitle } from "@/components/ui/primitives";
import { en } from "@/i18n/en";
import { grievanceContact, NOTICE_VERSION } from "@/lib/notice.mjs";

const t = en.app.privacy;
const n = en.notice;

const h2 = "font-heading text-2xl font-semibold";

export function PrivacyNotice() {
  const contact = grievanceContact();
  return (
    <>
      <div className="space-y-3">
        <PageTitle>{t.title}</PageTitle>
        <p className="text-lg text-muted">{t.intro}</p>
        <p className="text-sm text-muted" data-testid="notice-version">
          {n.versionLabel}: {NOTICE_VERSION}
        </p>
      </div>

      <section aria-labelledby="stored-title" className="space-y-2">
        <h2 id="stored-title" className={h2}>
          {t.storedTitle}
        </h2>
        <ul className="max-w-[65ch] list-disc space-y-1 ps-5">
          {t.stored.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="not-stored-title" className="space-y-2">
        <h2 id="not-stored-title" className={h2}>
          {t.notStoredTitle}
        </h2>
        <ul className="max-w-[65ch] list-disc space-y-1 ps-5">
          {t.notStored.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sent-title" className="space-y-2">
        <h2 id="sent-title" className={h2}>
          {t.sentTitle}
        </h2>
        <p className="max-w-[65ch]">{t.sent}</p>
      </section>

      <section aria-labelledby="recipients-title" className="space-y-2">
        <h2 id="recipients-title" className={h2}>
          {t.recipientsTitle}
        </h2>
        <ul className="max-w-[65ch] list-disc space-y-1 ps-5">
          {t.recipients.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="retention-title" className="space-y-2">
        <h2 id="retention-title" className={h2}>
          {t.retentionTitle}
        </h2>
        <p className="max-w-[65ch]">{t.retention}</p>
        <p className="max-w-[65ch]" data-testid="export-line">
          {t.exportLine}
        </p>
      </section>

      <section aria-labelledby="contact-title" className="space-y-2">
        <h2 id="contact-title" className={h2}>
          {n.contactTitle}
        </h2>
        {contact.set ? (
          <>
            <p className="max-w-[65ch]">{n.contactIntro}</p>
            <p>
              {contact.name}
              {" · "}
              <a href={`mailto:${contact.email}`} className="inline-block min-h-8 py-1 text-brand underline underline-offset-4">
                {contact.email}
              </a>
            </p>
          </>
        ) : (
          <p data-testid="grievance-unset" className="max-w-[65ch] font-semibold">
            {n.contactUnset}
          </p>
        )}
      </section>
    </>
  );
}
