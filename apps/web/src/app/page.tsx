import Link from "next/link";
import { DiffText } from "@/components/diff-text";
import { Badge, buttonClass, Card } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

const t = en.landing;

export default function LandingPage() {
  return (
    <>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <span className="font-heading text-2xl font-semibold text-brand">{en.product}</span>
        <Link href="/sign-in" className={buttonClass("secondary")}>
          {t.signIn}
        </Link>
      </header>

      <main id="main" tabIndex={-1}>
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center lg:gap-14 lg:pt-16">
          <div className="space-y-6">
            <h1 className="font-heading text-4xl font-semibold leading-tight text-ink sm:text-5xl">{t.headline}</h1>
            <p className="max-w-[60ch] text-lg text-muted">{t.lead}</p>
            <Link href="/sign-in" className={buttonClass("primary", "md", "text-lg")}>
              {t.signIn}
            </Link>
          </div>

          <Card aria-labelledby="example-title" role="group" className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 id="example-title" className="font-heading text-xl font-semibold">
                {t.exampleTitle}
              </h2>
              <Badge tone="brand">{t.exampleLabel}</Badge>
            </div>
            <p className="text-sm text-muted">{t.exampleContext}</p>
            <DiffText before={t.exampleBefore} after={t.exampleAfter} />
            <Badge tone="ok">{t.exampleOk}</Badge>
            <div className="space-y-2 border-t border-line pt-4">
              <Badge tone="danger">{t.exampleBlocked}</Badge>
              <p className="text-sm text-muted">{t.exampleBlockedNote}</p>
            </div>
          </Card>
        </section>

        <section aria-labelledby="steps-title" className="border-y border-line bg-surface">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
            <h2 id="steps-title" className="font-heading text-3xl font-semibold">
              {t.stepsTitle}
            </h2>
            <ol className="mt-8 grid gap-8 md:grid-cols-3">
              {t.steps.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft font-heading text-lg font-semibold text-brand"
                  >
                    {i + 1}
                  </span>
                  <div className="space-y-1">
                    <h3 className="font-heading text-xl font-semibold">{step.title}</h3>
                    <p className="max-w-[48ch] text-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3">
          <div className="space-y-2">
            <h2 className="font-heading text-2xl font-semibold">{t.promiseTitle}</h2>
            <p className="max-w-[40ch] text-lg">{t.promise}</p>
          </div>
          <div className="space-y-2">
            <h2 className="font-heading text-2xl font-semibold">{t.audienceTitle}</h2>
            <p className="max-w-[40ch] text-muted">{t.audience}</p>
          </div>
          <div className="space-y-2">
            <h2 className="font-heading text-2xl font-semibold">{t.howKeyTitle}</h2>
            <p className="max-w-[40ch] text-muted">{t.howKey}</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <p className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-muted sm:px-6">{t.footer}</p>
      </footer>
    </>
  );
}
