import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react"

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground leading-relaxed">{hint}</p> : null}
    </div>
  )
}

export function NumberInput({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="number"
      inputMode="decimal"
      className={`h-11 w-full rounded-md border border-border bg-input px-3 font-mono text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 ${className}`}
      {...props}
    />
  )
}

export function TextInput({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="text"
      className={`h-11 w-full rounded-md border border-border bg-input px-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 ${className}`}
      {...props}
    />
  )
}

export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`h-11 w-full rounded-md border border-border bg-input px-3 text-base text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30 ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}

export function SubmitButton({
  children,
  loading,
}: {
  children: ReactNode
  loading?: boolean
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="h-11 w-full rounded-md bg-primary px-4 font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {loading ? "计算中…" : children}
    </button>
  )
}

export function ErrorText({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-negative/40 bg-negative-muted/40 px-3 py-2 text-sm text-negative-foreground"
    >
      {message}
    </p>
  )
}

export function Stat({
  label,
  value,
  mono = true,
  tone,
}: {
  label: string
  value: ReactNode
  mono?: boolean
  tone?: "positive" | "negative"
}) {
  const toneClass =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : "text-foreground"
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-background/40 p-4">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`text-xl ${mono ? "font-mono" : "font-semibold"} ${toneClass}`}>
        {value}
      </span>
    </div>
  )
}

export function VerdictBanner({
  positive,
  title,
  detail,
}: {
  positive: boolean
  title: string
  detail?: string
}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-lg border p-4 ${
        positive
          ? "border-positive/50 bg-positive-muted/40"
          : "border-negative/50 bg-negative-muted/40"
      }`}
    >
      <span
        className={`text-base font-semibold ${
          positive ? "text-positive" : "text-negative"
        }`}
      >
        {positive ? "✅ 有优势，可考虑下注" : "⛔ 无优势，不该下"}
      </span>
      <span className="text-sm text-foreground">{title}</span>
      {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
    </div>
  )
}
