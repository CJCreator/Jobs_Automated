// Small UI primitives shared by every screen. No UI library.

import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "./cn";
import { AlertIcon, BlockIcon, CheckIcon, InfoIcon } from "./icons";

/* ---------- Button ---------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 min-w-6";
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "btn-fill bg-brand text-brand-ink hover:opacity-90 border border-transparent",
  secondary: "bg-surface text-ink border border-line hover:bg-brand-soft",
  ghost: "bg-transparent text-brand hover:bg-brand-soft border border-transparent",
  danger: "btn-fill bg-danger text-danger-ink border border-transparent hover:opacity-90",
};
const buttonSizes = { md: "min-h-11 px-4 py-2 text-base", sm: "min-h-8 px-3 py-1 text-sm" };

export function buttonClass(variant: ButtonVariant = "primary", size: "md" | "sm" = "md", extra?: string) {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], extra);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  /**
   * Work is in progress. Unlike `disabled`, the button stays focusable, so a
   * keyboard user who pressed it is not thrown to the top of the page when the
   * work ends.
   */
  loading?: boolean;
}

export function Button({ variant = "primary", size = "md", className, type = "button", loading, onClick, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      aria-disabled={loading || undefined}
      onClick={loading ? (e) => e.preventDefault() : onClick}
      className={buttonClass(variant, size, cn(loading && "cursor-progress opacity-70", className))}
      {...rest}
    />
  );
}

/* ---------- Field, Label, Input, Textarea, Select ---------- */

export function Label({ htmlFor, children, className }: { htmlFor: string; children: ReactNode; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("block font-semibold text-ink", className)}>
      {children}
    </label>
  );
}

interface FieldRenderProps {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
}

/** Label, hint and error text, wired to the control with ids. */
export function Field({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: (p: FieldRenderProps) => ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-sm font-medium text-danger">
          <BlockIcon className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

const controlClass =
  "block w-full rounded-lg border bg-surface px-3 py-2 text-base text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(controlClass, "min-h-11", rest["aria-invalid"] ? "border-danger" : "border-line", className)}
      {...rest}
    />
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(controlClass, "min-h-24 leading-relaxed", rest["aria-invalid"] ? "border-danger" : "border-line", className)}
      {...rest}
    />
  );
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(controlClass, "min-h-11", "border-line", className)} {...rest} />;
}

/* ---------- Checkbox ---------- */

export function Checkbox({
  id,
  label,
  className,
  describedBy,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "id"> & {
  id: string;
  label: ReactNode;
  describedBy?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <input
        id={id}
        type="checkbox"
        aria-describedby={describedBy}
        className="mt-0.5 size-6 shrink-0 cursor-pointer accent-brand disabled:cursor-not-allowed"
        {...rest}
      />
      <label htmlFor={id} className="cursor-pointer leading-snug">
        {label}
      </label>
    </div>
  );
}

/* ---------- Badge ---------- */

type Tone = "ok" | "warn" | "danger" | "neutral" | "brand";
const toneClass: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok border-ok",
  warn: "bg-warn-soft text-warn border-warn",
  danger: "bg-danger-soft text-danger border-danger",
  neutral: "bg-surface text-muted border-line",
  brand: "bg-brand-soft text-brand border-brand",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const icon = tone === "ok" ? <CheckIcon /> : tone === "warn" ? <AlertIcon /> : tone === "danger" ? <BlockIcon /> : null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-semibold", toneClass[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

/* ---------- Card ---------- */

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-line bg-surface p-5 sm:p-6", className)} {...rest} />;
}

/* ---------- Notice ---------- */

type NoticeTone = "info" | "warn" | "danger" | "ok";
const noticeClass: Record<NoticeTone, string> = {
  info: "border-brand bg-brand-soft",
  warn: "border-warn bg-warn-soft",
  danger: "border-danger bg-danger-soft",
  ok: "border-ok bg-ok-soft",
};
const noticeIconClass: Record<NoticeTone, string> = {
  info: "text-brand",
  warn: "text-warn",
  danger: "text-danger",
  ok: "text-ok",
};

export function Notice({
  tone = "info",
  title,
  children,
  role,
  className,
}: {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  role?: "status" | "alert";
  className?: string;
}) {
  const Icon = tone === "ok" ? CheckIcon : tone === "info" ? InfoIcon : tone === "warn" ? AlertIcon : BlockIcon;
  return (
    <div role={role} className={cn("flex gap-3 rounded-lg border-s-4 border p-4", noticeClass[tone], className)}>
      <Icon className={cn("mt-1 shrink-0", noticeIconClass[tone])} />
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-ink">{children}</div> : null}
      </div>
    </div>
  );
}

/* ---------- Spinner, VisuallyHidden, Skeleton ---------- */

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="1.1em" height="1.1em" aria-hidden="true" focusable="false" className={cn("spin", className)}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 00-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton", className)} />;
}

/** Skeleton block with an accessible loading label for the whole region. */
export function LoadingBlock({ label, lines = 3 }: { label: string; lines?: number }) {
  return (
    <div role="status" aria-busy="true" className="space-y-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-5", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

export function ErrorBlock({ message, retryLabel, onRetry }: { message: string; retryLabel: string; onRetry: () => void }) {
  return (
    <Notice tone="danger" role="alert" title={message}>
      <Button variant="secondary" size="sm" onClick={onRetry} className="mt-2">
        {retryLabel}
      </Button>
    </Notice>
  );
}

export function PageTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h1 id={id} tabIndex={-1} className="font-heading text-3xl font-semibold text-ink sm:text-4xl">
      {children}
    </h1>
  );
}
