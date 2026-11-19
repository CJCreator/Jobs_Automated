# Architecture decision records

One file per decision. A decision is changed by a new ADR that supersedes it, never by editing an accepted one in place (typo fixes aside).

**Status values:** `Accepted` (decided by the owner), `Proposed` (open, needs the owner's call), `Superseded by NNNN`.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-product-scope.md) | Product: Rolewright, India, English, three user segments, v1 scope | Accepted |
| [0002](0002-monorepo-layout.md) | Monorepo: `apps/web` + `packages/engine` | Accepted |
| [0003](0003-bring-your-own-key.md) | Bring your own key, session-only; free trial on our keys | Accepted (provider list and trial size Proposed) |
| [0004](0004-data-protection-dpdp.md) | Data protection: consent, notice, retention, export, erasure | Accepted |
| [0005](0005-fact-gate-hard-export-gate.md) | The fact gate is a hard export gate | Accepted |
| [0006](0006-authentication.md) | Sign-in: Google and email link | Accepted |
| [0007](0007-application-tracker.md) | Tracker rebuilt in the app on Postgres; legacy web UI retired | Accepted |
| [0008](0008-notifications.md) | Reminders in-app only for now | Accepted |
| [0009](0009-hosting.md) | Hosting | Proposed |
| [0010](0010-analytics.md) | Privacy-first event analytics | Accepted |
| [0011](0011-mobile-pwa.md) | Responsive web, installable as a PWA | Accepted |
| [0012](0012-engine-migration.md) | Engine kept whole; resume logic ported to the app behind parity tests | Accepted |
| [0013](0013-upstream-relationship.md) | Fork of career-ops: attribution, no upstream updates | Accepted |
| [0014](0014-open-source-or-private.md) | Public open source or private repository | Proposed |
| [0015](0015-cover-letters-interview-prep.md) | Cover letters and interview prep packs from confirmed facts | Accepted |
| [0016](0016-success-metrics.md) | Success measured as ATS keyword match and callbacks, separately | Accepted |

Template: [`template.md`](template.md).
