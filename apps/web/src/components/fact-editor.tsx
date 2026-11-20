"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { Bullet, Education, Extra, Facts, Job, Skill, Source } from "@/lib/client/types";
import { PlusIcon } from "@/components/ui/icons";
import { cn } from "@/components/ui/cn";
import { Badge, Button, Card, Checkbox, Field, Input, Textarea } from "@/components/ui/primitives";
import { en } from "@/i18n/en";

const t = en.app.resume;
const newId = () => globalThis.crypto.randomUUID();
const today = () => new Date().toISOString().slice(0, 10);

interface Props {
  facts: Facts;
  onChange: (next: Facts) => void;
  announce: (message: string) => void;
}

function Section({
  id,
  title,
  onConfirmAll,
  children,
}: {
  id: string;
  title: string;
  onConfirmAll?: () => void;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-title`} tabIndex={-1} className="font-heading text-2xl font-semibold">
          {title}
        </h2>
        {onConfirmAll ? (
          <Button variant="secondary" size="sm" onClick={onConfirmAll} aria-label={`${t.confirmAll}: ${title}`}>
            {t.confirmAll}
          </Button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** One editable item. The bar on its start edge, and the checkbox text, show whether it is confirmed. */
function Item({
  confirmed,
  label = true,
  source,
  children,
}: {
  confirmed: boolean;
  label?: boolean;
  source?: Source;
  children: ReactNode;
}) {
  const notFound = source === "model";
  return (
    <Card className={cn("space-y-4 border-s-4 p-4! sm:p-5!", confirmed ? "border-s-ok" : "border-s-warn")}>
      {label || notFound ? (
        <div className="flex flex-wrap justify-end gap-2">
          {notFound ? <Badge tone="danger">{t.notInResume}</Badge> : null}
          {label ? <Badge tone={confirmed ? "ok" : "warn"}>{confirmed ? en.common.confirmed : t.needsCheck}</Badge> : null}
        </div>
      ) : null}
      {notFound ? <p className="text-sm text-muted">{t.notInResumeHint}</p> : null}
      {children}
    </Card>
  );
}

function ConfirmBox({ id, checked, what, onChange }: { id: string; checked: boolean; what: string; onChange: (v: boolean) => void }) {
  return (
    <Checkbox
      id={id}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      label={
        <>
          {en.common.confirmed}
          <span className="sr-only">{`: ${what}`}</span>
        </>
      }
    />
  );
}

const snippet = (s: string) => (s.length > 60 ? `${s.slice(0, 57)}...` : s);

export function FactEditor({ facts, onChange, announce }: Props) {
  const focusId = useRef<string | null>(null);
  useEffect(() => {
    if (focusId.current) {
      document.getElementById(focusId.current)?.focus();
      focusId.current = null;
    }
  }, [facts]);

  const set = (patch: Partial<Facts>) => onChange({ ...facts, ...patch });

  /* ----- contact ----- */
  const setContact = (patch: Partial<Facts["contact"]>) => set({ contact: { ...facts.contact, ...patch } });

  /* ----- experience ----- */
  const setJob = (id: string, patch: Partial<Job>) =>
    set({ experience: facts.experience.map((j) => (j.id === id ? { ...j, ...patch } : j)) });
  const editJob = (id: string, patch: Partial<Job>) => setJob(id, { ...patch, source: "user" });
  const setBullet = (jobId: string, bid: string, patch: Partial<Bullet>) =>
    set({
      experience: facts.experience.map((j) =>
        j.id === jobId ? { ...j, bullets: j.bullets.map((b) => (b.id === bid ? { ...b, ...patch } : b)) } : j,
      ),
    });
  const addJob = () => {
    const id = newId();
    focusId.current = `job-${id}-company`;
    set({
      experience: [
        ...facts.experience,
        { id, company: "", title: "", location: "", start: "", end: "", confirmed: false, source: "user", bullets: [] },
      ],
    });
  };
  const addBullet = (jobId: string) => {
    const id = newId();
    focusId.current = `bullet-${id}`;
    set({
      experience: facts.experience.map((j) =>
        j.id === jobId ? { ...j, bullets: [...j.bullets, { id, text: "", confirmed: false, source: "user" }] } : j,
      ),
    });
  };

  /* ----- education ----- */
  const setEdu = (id: string, patch: Partial<Education>) =>
    set({ education: facts.education.map((e) => (e.id === id ? { ...e, ...patch, source: "user" } : e)) });
  const addEdu = () => {
    const id = newId();
    focusId.current = `edu-${id}-school`;
    set({ education: [...facts.education, { id, school: "", degree: "", field: "", year: "", confirmed: false, source: "user" }] });
  };

  /* ----- skills ----- */
  const setSkill = (id: string, patch: Partial<Skill>) =>
    set({ skills: facts.skills.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const addSkill = () => {
    const id = newId();
    focusId.current = `skill-${id}`;
    set({ skills: [...facts.skills, { id, name: "", confirmed: false, source: "user" }] });
  };

  /* ----- extras ----- */
  const setExtra = (id: string, patch: Partial<Extra>) =>
    set({ extras: facts.extras.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const addExtra = () => {
    const id = newId();
    focusId.current = `extra-${id}`;
    set({ extras: [...facts.extras, { id, text: "", confirmed: false, source: "user", statedAt: today() }] });
  };

  // "Confirm all" never confirms an item the upload does not contain.
  const bulk = <T extends { confirmed: boolean; source?: Source }>(item: T): T =>
    item.source === "model" ? item : { ...item, confirmed: true };
  const skippedIn = (items: { confirmed: boolean; source?: Source }[]) =>
    items.filter((i) => i.source === "model" && !i.confirmed).length;
  const confirmAll = (section: string, patch: Partial<Facts>, skipped = 0) => {
    set(patch);
    announce(skipped > 0 ? t.confirmAllSkipped(section, skipped) : t.confirmAllDone(section));
  };

  const s = t.sections;

  return (
    <div className="space-y-10">
      {/* Contact */}
      <Section
        id="sec-contact"
        title={s.contact}
        onConfirmAll={() => confirmAll(s.contact, { contact: { ...facts.contact, confirmed: true } })}
      >
        <Item confirmed={facts.contact.confirmed}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="contact-name" label={t.fields.name}>
              {(f) => <Input id={f.id} autoComplete="off" value={facts.contact.name} onChange={(e) => setContact({ name: e.target.value })} />}
            </Field>
            <Field id="contact-email" label={t.fields.email}>
              {(f) => <Input id={f.id} type="email" autoComplete="off" value={facts.contact.email} onChange={(e) => setContact({ email: e.target.value })} />}
            </Field>
            <Field id="contact-phone" label={t.fields.phone}>
              {(f) => <Input id={f.id} type="tel" autoComplete="off" value={facts.contact.phone} onChange={(e) => setContact({ phone: e.target.value })} />}
            </Field>
            <Field id="contact-location" label={t.fields.location}>
              {(f) => <Input id={f.id} autoComplete="off" value={facts.contact.location} onChange={(e) => setContact({ location: e.target.value })} />}
            </Field>
          </div>
          <Field id="contact-links" label={t.fields.links}>
            {(f) => (
              <Textarea
                id={f.id}
                rows={3}
                value={facts.contact.links.join("\n")}
                onChange={(e) => setContact({ links: e.target.value.split("\n") })}
              />
            )}
          </Field>
          <ConfirmBox id="contact-confirmed" checked={facts.contact.confirmed} what={s.contact} onChange={(v) => setContact({ confirmed: v })} />
        </Item>
      </Section>

      {/* Summary */}
      <Section
        id="sec-summary"
        title={s.summary}
        onConfirmAll={() => confirmAll(s.summary, { summary: bulk(facts.summary) }, skippedIn([facts.summary]))}
      >
        <Item confirmed={facts.summary.confirmed} source={facts.summary.source}>
          <Field id="summary-text" label={t.fields.summary}>
            {(f) => (
              <Textarea
                id={f.id}
                rows={5}
                value={facts.summary.text}
                onChange={(e) => set({ summary: { ...facts.summary, text: e.target.value, source: "user" } })}
              />
            )}
          </Field>
          <ConfirmBox
            id="summary-confirmed"
            checked={facts.summary.confirmed}
            what={s.summary}
            onChange={(v) => set({ summary: { ...facts.summary, confirmed: v } })}
          />
        </Item>
      </Section>

      {/* Experience */}
      <Section
        id="sec-experience"
        title={s.experience}
        onConfirmAll={() =>
          confirmAll(
            s.experience,
            { experience: facts.experience.map((j) => ({ ...bulk(j), bullets: j.bullets.map(bulk) })) },
            skippedIn(facts.experience) + skippedIn(facts.experience.flatMap((j) => j.bullets)),
          )
        }
      >
        <div className="space-y-5">
          {facts.experience.map((job, ji) => (
            <Item key={job.id} confirmed={job.confirmed} source={job.source}>
              <h3 className="font-heading text-xl font-semibold">{t.jobHeading(ji + 1)}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id={`job-${job.id}-company`} label={t.fields.company}>
                  {(f) => <Input id={f.id} autoComplete="off" value={job.company} onChange={(e) => editJob(job.id, { company: e.target.value })} />}
                </Field>
                <Field id={`job-${job.id}-title`} label={t.fields.title}>
                  {(f) => <Input id={f.id} autoComplete="off" value={job.title} onChange={(e) => editJob(job.id, { title: e.target.value })} />}
                </Field>
                <Field id={`job-${job.id}-location`} label={t.fields.jobLocation}>
                  {(f) => <Input id={f.id} autoComplete="off" value={job.location} onChange={(e) => editJob(job.id, { location: e.target.value })} />}
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field id={`job-${job.id}-start`} label={t.fields.start}>
                    {(f) => <Input id={f.id} autoComplete="off" value={job.start} onChange={(e) => editJob(job.id, { start: e.target.value })} />}
                  </Field>
                  <Field id={`job-${job.id}-end`} label={t.fields.end}>
                    {(f) => <Input id={f.id} autoComplete="off" value={job.end} onChange={(e) => editJob(job.id, { end: e.target.value })} />}
                  </Field>
                </div>
              </div>
              <ConfirmBox
                id={`job-${job.id}-confirmed`}
                checked={job.confirmed}
                what={`${job.title || t.fields.title}, ${job.company || t.fields.company}`}
                onChange={(v) => setJob(job.id, { confirmed: v })}
              />

              <div className="space-y-3 border-t border-line pt-4">
                <h4 className="font-semibold">{t.bulletsHeading}</h4>
                {job.bullets.length === 0 ? <p className="text-muted">{t.noBullets}</p> : null}
                <ul className="space-y-3">
                  {job.bullets.map((b) => (
                    <li key={b.id}>
                      <Item confirmed={b.confirmed} source={b.source}>
                        <Field id={`bullet-${b.id}`} label={t.fields.bullet}>
                          {(f) => (
                            <Textarea
                              id={f.id}
                              rows={3}
                              value={b.text}
                              onChange={(e) => setBullet(job.id, b.id, { text: e.target.value, source: "user" })}
                            />
                          )}
                        </Field>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <ConfirmBox
                            id={`bullet-${b.id}-confirmed`}
                            checked={b.confirmed}
                            what={snippet(b.text)}
                            onChange={(v) => setBullet(job.id, b.id, { confirmed: v })}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              focusId.current = `add-bullet-${job.id}`;
                              setJob(job.id, { bullets: job.bullets.filter((x) => x.id !== b.id) });
                            }}
                          >
                            {t.removeBullet}
                            <span className="sr-only">{`: ${snippet(b.text)}`}</span>
                          </Button>
                        </div>
                      </Item>
                    </li>
                  ))}
                </ul>
                <Button id={`add-bullet-${job.id}`} variant="secondary" size="sm" onClick={() => addBullet(job.id)}>
                  <PlusIcon />
                  {t.addBullet}
                </Button>
              </div>

              <div className="border-t border-line pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    focusId.current = "add-job";
                    set({ experience: facts.experience.filter((j) => j.id !== job.id) });
                  }}
                >
                  {t.removeJob}
                  <span className="sr-only">{`: ${job.title} ${job.company}`}</span>
                </Button>
              </div>
            </Item>
          ))}
        </div>
        <Button id="add-job" variant="secondary" onClick={addJob}>
          <PlusIcon />
          {t.addJob}
        </Button>
      </Section>

      {/* Education */}
      <Section
        id="sec-education"
        title={s.education}
        onConfirmAll={() => confirmAll(s.education, { education: facts.education.map(bulk) }, skippedIn(facts.education))}
      >
        <div className="space-y-4">
          {facts.education.map((e, i) => (
            <Item key={e.id} confirmed={e.confirmed} source={e.source}>
              <h3 className="font-heading text-xl font-semibold">{t.eduHeading(i + 1)}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id={`edu-${e.id}-school`} label={t.fields.school}>
                  {(f) => <Input id={f.id} autoComplete="off" value={e.school} onChange={(ev) => setEdu(e.id, { school: ev.target.value })} />}
                </Field>
                <Field id={`edu-${e.id}-degree`} label={t.fields.degree}>
                  {(f) => <Input id={f.id} autoComplete="off" value={e.degree} onChange={(ev) => setEdu(e.id, { degree: ev.target.value })} />}
                </Field>
                <Field id={`edu-${e.id}-field`} label={t.fields.field}>
                  {(f) => <Input id={f.id} autoComplete="off" value={e.field} onChange={(ev) => setEdu(e.id, { field: ev.target.value })} />}
                </Field>
                <Field id={`edu-${e.id}-year`} label={t.fields.year}>
                  {(f) => <Input id={f.id} autoComplete="off" value={e.year} onChange={(ev) => setEdu(e.id, { year: ev.target.value })} />}
                </Field>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <ConfirmBox
                  id={`edu-${e.id}-confirmed`}
                  checked={e.confirmed}
                  what={e.school || t.fields.school}
                  onChange={(v) => set({ education: facts.education.map((x) => (x.id === e.id ? { ...x, confirmed: v } : x)) })}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    focusId.current = "add-edu";
                    set({ education: facts.education.filter((x) => x.id !== e.id) });
                  }}
                >
                  {t.removeEducation}
                  <span className="sr-only">{`: ${e.school}`}</span>
                </Button>
              </div>
            </Item>
          ))}
        </div>
        <Button id="add-edu" variant="secondary" onClick={addEdu}>
          <PlusIcon />
          {t.addEducation}
        </Button>
      </Section>

      {/* Skills */}
      <Section
        id="sec-skills"
        title={s.skills}
        onConfirmAll={() => confirmAll(s.skills, { skills: facts.skills.map(bulk) }, skippedIn(facts.skills))}
      >
        {facts.skills.length === 0 ? <p className="text-muted">{t.noSkills}</p> : null}
        <ul className="grid gap-3 sm:grid-cols-2">
          {facts.skills.map((k) => (
            <li key={k.id}>
              <Item confirmed={k.confirmed} label={false} source={k.source}>
                <Field id={`skill-${k.id}`} label={t.fields.skill}>
                  {(f) => <Input id={f.id} autoComplete="off" value={k.name} onChange={(e) => setSkill(k.id, { name: e.target.value, source: "user" })} />}
                </Field>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <ConfirmBox id={`skill-${k.id}-confirmed`} checked={k.confirmed} what={k.name} onChange={(v) => setSkill(k.id, { confirmed: v })} />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      focusId.current = "add-skill";
                      set({ skills: facts.skills.filter((x) => x.id !== k.id) });
                    }}
                  >
                    {en.common.remove}
                    <span className="sr-only">{` ${t.fields.skill}: ${k.name}`}</span>
                  </Button>
                </div>
              </Item>
            </li>
          ))}
        </ul>
        <Button id="add-skill" variant="secondary" onClick={addSkill}>
          <PlusIcon />
          {t.addSkill}
        </Button>
      </Section>

      {/* Additional facts */}
      <Section
        id="sec-extras"
        title={s.extras}
        onConfirmAll={() => confirmAll(s.extras, { extras: facts.extras.map((x) => ({ ...x, confirmed: true })) })}
      >
        {facts.extras.length === 0 ? <p className="max-w-[65ch] text-muted">{t.noExtras}</p> : null}
        <ul className="space-y-4">
          {facts.extras.map((x) => (
            <li key={x.id}>
              <Item confirmed={x.confirmed}>
                <Field id={`extra-${x.id}`} label={t.fields.extra} hint={x.statedAt ? t.extraStated(x.statedAt) : undefined}>
                  {(f) => (
                    <Textarea
                      id={f.id}
                      rows={2}
                      aria-describedby={f.describedBy}
                      value={x.text}
                      onChange={(e) => setExtra(x.id, { text: e.target.value })}
                    />
                  )}
                </Field>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <ConfirmBox id={`extra-${x.id}-confirmed`} checked={x.confirmed} what={snippet(x.text)} onChange={(v) => setExtra(x.id, { confirmed: v })} />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      focusId.current = "add-extra";
                      set({ extras: facts.extras.filter((y) => y.id !== x.id) });
                    }}
                  >
                    {t.removeExtra}
                    <span className="sr-only">{`: ${snippet(x.text)}`}</span>
                  </Button>
                </div>
              </Item>
            </li>
          ))}
        </ul>
        <Button id="add-extra" variant="secondary" onClick={addExtra}>
          <PlusIcon />
          {t.addExtra}
        </Button>
      </Section>

      {/* Cannot confirm */}
      <Section id="sec-cannot" title={s.cannotConfirm}>
        <p className="max-w-[65ch] text-muted">{t.cannotConfirmHelp}</p>
        {facts.cannotConfirm.length === 0 ? (
          <p className="text-muted">{t.noClaims}</p>
        ) : (
          <ul className="space-y-2">
            {facts.cannotConfirm.map((claim) => (
              <li key={claim} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-2">
                <span className="min-w-0">{claim}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={t.removeClaim(claim)}
                  onClick={() => {
                    focusId.current = "sec-cannot-title";
                    set({ cannotConfirm: facts.cannotConfirm.filter((c) => c !== claim) });
                  }}
                >
                  {en.common.remove}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
