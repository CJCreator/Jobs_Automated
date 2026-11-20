# Component Library & Primitives — career-ops

## Purpose
Catalogs the core UI primitives, compound components, and interactive widgets in `web/src/components/`.

## Scope
Covers primitive components in `web/src/components/ui/` and domain components.

## Overview
All UI components adhere to accessible, composable compound component patterns built with React 19, TypeScript, and Tailwind CSS v4.

## Diagrams

```mermaid
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
```

## Technical Details

### Primitive Registry (`web/src/components/ui/`)
1. **`tabs.tsx`**:
   - Compound component managing active tab state with accessible ARIA tablist semantics.
   - Used for Table/Board toggles and CV view modes.
2. **`drawer.tsx`**:
   - Slide-over drawer with backdrop blur for inspecting job dossiers and reports without losing kanban context.
3. **`score-gauge.tsx`**:
   - SVG circular score gauge displaying 1.0–5.0 evaluation ratings with automatic color grading.
4. **`toast.tsx`**:
   - Toast notification provider managing status transition alerts and copy confirmations.
5. **`tooltip.tsx`**:
   - Accessible hover tooltips for ATS keyword badges and quick action controls.

## Best Practices
- Never use inline styling; always use Tailwind utility classes composed via `clsx` and `tailwind-merge`.
- All interactive elements must support keyboard navigation (`Tab`, `Enter`, `Esc`).

## Examples
```tsx
import { ScoreGauge } from '@/components/ui/score-gauge';

export function JobCard({ job }) {
  return (
    <div className="p-4 border rounded-lg bg-card">
      <h3 className="font-semibold">{job.company}</h3>
      <ScoreGauge score={job.score} size="md" />
    </div>
  );
}
```

## Future Enhancements
- Command palette (`Cmd+K`) for rapid global keyboard navigation.
