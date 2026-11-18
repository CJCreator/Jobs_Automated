import { Fragment } from "react";
import { diffWords } from "@/lib/diff.mjs";
import { en } from "@/i18n/en";

/**
 * Word-level diff. Removed and added words are struck through or underlined
 * and bold, wrapped in <del>/<ins>, and announced to screen readers, so the
 * meaning never depends on colour.
 */
export function DiffText({ before, after }: { before: string; after: string }) {
  const parts = diffWords(before, after);
  return (
    <p className="leading-relaxed">
      {parts.map((part, i) => {
        if (part.type === "same") return <Fragment key={i}>{part.text}</Fragment>;
        const lead = part.text.match(/^\s*/)?.[0] ?? "";
        const body = part.text.trim();
        const trail = part.text.slice(lead.length + body.length);
        if (!body) return <Fragment key={i}>{part.text}</Fragment>;
        return (
          <Fragment key={i}>
            {lead}
            {part.type === "remove" ? (
              <del className="diff-remove">
                <span className="sr-only">{en.common.removed}: </span>
                {body}
              </del>
            ) : (
              <ins className="diff-add">
                <span className="sr-only">{en.common.added}: </span>
                {body}
              </ins>
            )}
            {trail}
          </Fragment>
        );
      })}
    </p>
  );
}
