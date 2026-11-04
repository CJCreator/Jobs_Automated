import fs from 'node:fs';
import path from 'node:path';

function writeDoc(relPath, content) {
  const fullPath = path.resolve(relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n', 'utf8');
  console.log(`Generated: ${relPath}`);
}

// 1. DesignSystem.md
writeDoc('docs/frontend/DesignSystem.md', `# Design System & Style Tokens — career-ops

## Purpose
Establishes the visual language, design tokens, color palette, typography, and layout rules for career-ops web and documents.

## Scope
Applies to \`web/\`, HTML CV templates, and PDF rendering engines.

## Overview
The career-ops design language is inspired by high-end editorial and terminal tools: warm neutral surfaces, deep zinc text, monospace data accents, and a distinctive burnt orange highlight.

## Diagrams

\`\`\`mermaid
flowchart LR
    Tokens["Design Tokens"] --> Canvas["Surfaces\nLight: #f7f6f3\nDark: #0a0a0a"]
    Tokens --> Type["Typography\nDisplay: Space Grotesk\nBody: DM Sans"]
    Tokens --> Accent["Accent\nBurnt Orange: hsl(26 73% 51%)"]
    Tokens --> Semantic["Semantic Feedback\nEmerald (>=4.0)\nAmber (3.0-3.9)\nRose (<3.0)"]
\`\`\`

## Technical Details

### Color Tokens
- **Background Light**: \`#f7f6f3\` (warm, editorial off-white).
- **Background Dark**: \`#0a0a0a\` / \`#161616\` (deep charcoal/zinc).
- **Accent Primary**: \`hsl(26 73% 51%)\` (burnt orange).
- **Text Primary Light**: \`#18181b\` (zinc-900).
- **Text Primary Dark**: \`#f4f4f5\` (zinc-100).

### Typography
- **Headings / Numbers**: Space Grotesk (geometric, technical).
- **Body Prose**: DM Sans (high readability at small sizes).
- **Monospace**: JetBrains Mono or system monospace (for reports, JSON, and diffs).

## Best Practices
- Avoid pure harsh blacks (\`#000000\`) and pure whites (\`#ffffff\`) on primary reading canvases.
- Maintain high contrast ratios (WCAG AAA) for all critical score badges and status labels.

## Examples
\`\`\`css
/* globals.css token definition */
:root {
  --background: #f7f6f3;
  --foreground: #18181b;
  --primary: hsl(26 73% 51%);
  --font-display: 'Space Grotesk', sans-serif;
  --font-sans: 'DM Sans', sans-serif;
}
\`\`\`

## Future Enhancements
- User-selectable themes (Minimalist, Terminal Monochrome, Executive Navy).
`);

// 2. ComponentLibrary.md
writeDoc('docs/frontend/ComponentLibrary.md', `# Component Library & Primitives — career-ops

## Purpose
Catalogs the core UI primitives, compound components, and interactive widgets in \`web/src/components/\`.

## Scope
Covers primitive components in \`web/src/components/ui/\` and domain components.

## Overview
All UI components adhere to accessible, composable compound component patterns built with React 19, TypeScript, and Tailwind CSS v4.

## Diagrams

\`\`\`mermaid
classDiagram
    class Tabs {
      +TabsList
      +TabsTrigger
      +TabsContent
    }
    class Drawer {
      +DrawerTrigger
      +DrawerContent
      +DrawerHeader
      +DrawerClose
    }
    class ScoreGauge {
      +score: number
      +size: sm | md | lg
      +showLabel: boolean
    }
    class Toast {
      +useToast()
      +toast({ title, description, variant })
    }
\`\`\`

## Technical Details

### Primitive Registry (\`web/src/components/ui/\`)
1. **\`tabs.tsx\`**:
   - Compound component managing active tab state with accessible ARIA tablist semantics.
   - Used for Table/Board toggles and CV view modes.
2. **\`drawer.tsx\`**:
   - Slide-over drawer with backdrop blur for inspecting job dossiers and reports without losing kanban context.
3. **\`score-gauge.tsx\`**:
   - SVG circular score gauge displaying 1.0–5.0 evaluation ratings with automatic color grading.
4. **\`toast.tsx\`**:
   - Toast notification provider managing status transition alerts and copy confirmations.
5. **\`tooltip.tsx\`**:
   - Accessible hover tooltips for ATS keyword badges and quick action controls.

## Best Practices
- Never use inline styling; always use Tailwind utility classes composed via \`clsx\` and \`tailwind-merge\`.
- All interactive elements must support keyboard navigation (\`Tab\`, \`Enter\`, \`Esc\`).

## Examples
\`\`\`tsx
import { ScoreGauge } from '@/components/ui/score-gauge';

export function JobCard({ job }) {
  return (
    <div className="p-4 border rounded-lg bg-card">
      <h3 className="font-semibold">{job.company}</h3>
      <ScoreGauge score={job.score} size="md" />
    </div>
  );
}
\`\`\`

## Future Enhancements
- Command palette (\`Cmd+K\`) for rapid global keyboard navigation.
`);

// 3. StateManagement.md
writeDoc('docs/frontend/StateManagement.md', `# Frontend State Management — career-ops

## Purpose
Details how state is initialized, cached, mutated, and synchronized with the local filesystem in the Web UI.

## Scope
Covers React 19 server actions, optimistic UI updates, client hooks, and local storage persistence.

## Overview
career-ops avoids bloated client-side state stores (Redux, MobX). Instead, it relies on React Server Components for data fetching, Server Actions for optimistic mutations, and lightweight React Context for ephemeral client state.

## Diagrams

\`\`\`mermaid
flowchart TD
    UserAction["User drags card to 'Applied'"] --> Optimistic["Update Local State (Optimistic UI)"]
    Optimistic --> Action["Execute Server Action"]
    Action --> BackgroundCLI["CLI Script (set-status.mjs)"]
    BackgroundCLI --> Disk["Write data/applications.md"]
    Disk --> Revalidate["revalidatePath('/pipeline')"]
    Revalidate --> FreshRSC["Server Components Stream Fresh Data"]
    FreshRSC --> SyncDone["State in Full Sync"]
\`\`\`

## Technical Details

### State Patterns
1. **Server-Side File State**:
   - Application data is fetched directly on the server during page rendering using \`fs/promises\`.
   - Next.js caching ensures fast page transitions while honoring \`revalidatePath\`.
2. **Optimistic Status Transitions**:
   - The Kanban board uses React's \`useOptimistic\` hook to update column state instantly before the server acknowledges the disk write.
3. **Local Storage Preferences**:
   - Remembers user preferences (active view mode: Table vs. Kanban; evaluation detail level: Full vs. Essentials) locally in browser \`localStorage\`.

## Best Practices
- Never duplicate disk data in client React state; fetch at the server level.
- Always provide rollback logic if a Server Action fails.

## Examples
\`\`\`tsx
const [optimisticJobs, setOptimisticJobs] = useOptimistic(
  jobs,
  (state, update: { id: number; status: string }) =>
    state.map(job => (job.id === update.id ? { ...job, status: update.status } : job))
);
\`\`\`

## Future Enhancements
- File system watcher integration triggering automated client-side refreshes via WebSockets.
`);

// 4. RoutingArchitecture.md
writeDoc('docs/frontend/RoutingArchitecture.md', `# Routing Architecture — career-ops

## Purpose
Documents the Next.js App Router tree, page layouts, route groups, and dynamic routing conventions.

## Scope
Applies to \`web/src/app/\`.

## Overview
The web application uses Next.js 16 App Router. Routes are organized around the candidate's core operating workflow: Inbox, Pipeline, Discovery, Resume Studio, and Analytics.

## Diagrams

\`\`\`mermaid
flowchart TD
    Root["/ (Dashboard & Action Queue)"] --> Pipeline["/pipeline (Kanban & Table Tracker)"]
    Root --> Explore["/explore (Discovery & Scanners)"]
    Root --> CV["/cv (CV Studio & LaTeX Preview)"]
    Root --> Analytics["/analytics (Funnel & Sankey Metrics)"]
    Root --> Scheduled["/scheduled-scans (Background Jobs)"]
    Root --> Config["/config (Profile & Portal Settings)"]
    Pipeline --> Detail["/pipeline/[id] (Job Dossier & Report)"]
\`\`\`

## Technical Details

### Route Tree Map
- \`/\`: Today's action queue, pending tasks, follow-up alerts, and pipeline summary.
- \`/pipeline\`: Full application tracker with Table and Kanban board views.
- \`/pipeline/[id]\`: Deep inspection view for a specific application report and tailored PDF.
- \`/explore\`: Interactive zero-token scanner search and public ATS harvest viewer.
- \`/cv\`: Master CV editor (\`cv.md\`), PDF uploader, and fact verification inspector.
- \`/analytics\`: Funnel velocity, interview conversion rates, and rejection latency charts.
- \`/scheduled-scans\`: Configuration for local cron-like background portal sweeps.
- \`/config\`: Candidate profile settings, archetype definitions, and portal config.

## Best Practices
- Use \`loading.tsx\` for instant visual transitions with skeleton fallbacks.
- Implement \`error.tsx\` boundary handlers for graceful filesystem error containment.

## Examples
\`\`\`typescript
// Dynamic route parameter extraction
export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const { id } = await params;
  const report = await getReportForApp(parseInt(id, 10));
  return <JobDossierView report={report} />;
}
\`\`\`

## Future Enhancements
- Multi-profile routing (\`/profile/[profileId]/pipeline\`) for dual-career candidates.
`);

// 5. DashboardDesign.md
writeDoc('docs/frontend/DashboardDesign.md', `# Dashboard Design & TUI Specifications — career-ops

## Purpose
Details the design specifications, keyboard navigation, and architecture of the Go Bubbletea terminal TUI in \`dashboard/\`.

## Scope
Applies to \`dashboard/main.go\` and \`dashboard/internal/\`.

## Overview
For power users who prefer the terminal, career-ops provides an ultra-fast, zero-dependency Go TUI dashboard. It compiles into a standalone binary and visualizes application stages with keyboard-driven productivity.

## Diagrams

\`\`\`mermaid
flowchart TD
    Init["dashboard/main.go (Launch)"] --> Load["Parse applications.md & status-log.tsv"]
    Load --> ViewRouter{"Active View State"}
    ViewRouter --> PipelineView["Pipeline View (Table with Status Filters)"]
    ViewRouter --> ReportView["Report Viewer (Markdown Preview)"]
    ViewRouter --> ProgressView["Progress Metrics (Funnel Breakdown)"]
    ViewRouter --> StatsView["Stats View (Lifetime Totals)"]
\`\`\`

## Technical Details

### Architecture & Packages
- **Framework**: Charm Bubbletea (\`github.com/charmbracelet/bubbletea\`).
- **Styling**: Lipgloss (\`github.com/charmbracelet/lipgloss\`).
- **Data Parser**: Custom Markdown table parser in \`dashboard/internal/data/tracker.go\`.

### Keyboard Controls
- \`Tab\` / \`Shift+Tab\`: Cycle through status filter tabs (All, Applied, Interview, Top >= 4, Skip, Rejected).
- \`j\` / \`k\` or \`Down\` / \`Up\`: Navigate rows.
- \`Enter\`: Open full markdown evaluation report.
- \`s\`: Open interactive status picker.
- \`d\` / \`D\`: Open generated PDF in system viewer.
- \`q\` / \`Ctrl+C\`: Quit dashboard.

## Best Practices
- Handle missing files gracefully: if \`applications.md\` cannot be read, preserve previous state and display an inline banner rather than crashing.

## Examples
\`\`\`bash
# Build and serve Go TUI dashboard
npm run serve:dashboard
\`\`\`

## Future Enhancements
- Cross-compiled single-binary releases distributed via Homebrew and Scoop.
`);

console.log('Frontend docs generation complete.');

