"use client";

import { useEffect, useRef, type ChangeEvent, type KeyboardEvent } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatComposerProps {
  input: string;
  setInput: (val: string) => void;
  busy: boolean;
  inputMaxPx: number;
  onSubmit: (e?: React.FormEvent) => void;
  onAbort?: () => void;
}

export function ChatComposer({
  input,
  setInput,
  busy,
  inputMaxPx,
  onSubmit,
  onAbort,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const nextH = Math.min(el.scrollHeight, inputMaxPx);
    el.style.height = `${Math.max(nextH, 40)}px`;
    el.style.overflowY = el.scrollHeight > inputMaxPx ? "auto" : "hidden";
  }, [input, inputMaxPx]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !busy) {
        onSubmit();
      }
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (input.trim() && !busy) {
          onSubmit(e);
        }
      }}
      className="relative flex items-end gap-2 border-t border-border bg-surface p-3"
    >
      <textarea
        ref={textareaRef}
        rows={1}
        value={input}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask a question or issue a command (e.g. /help, /scan)..."
        disabled={busy}
        className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
      />

      <Button
        type="submit"
        size="sm"
        disabled={!input.trim() || busy}
        className="h-10 shrink-0 px-3.5 bg-brand hover:bg-brand-hover text-brand-foreground font-medium rounded-lg"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
      </Button>
    </form>
  );
}

