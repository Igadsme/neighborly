/**
 * Shared pieces for the account screens: password strength rules that
 * mirror the server DTOs, a small field wrapper that keeps labels and
 * error text associated for screen readers, and the existing design
 * tokens so these screens match the rest of the app.
 */
import type { ReactNode } from "react"

export const PASSWORD_MIN = 12

/** Same rule the API enforces, so the message matches the 400 response. */
export function passwordProblem(password: string): string | null {
  if (!password) return "Choose a password."
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`
  if (password.length > 128) return "Use at most 128 characters."
  if (!/[a-z]/.test(password)) return "Add a lowercase letter."
  if (!/[A-Z]/.test(password)) return "Add an uppercase letter."
  if (!/[0-9]/.test(password)) return "Add a number."
  return null
}

export function emailProblem(email: string): string | null {
  if (!email.trim()) return "Enter your email address."
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Enter a valid email address."
  return null
}

interface FieldProps {
  id: string
  label: string
  error?: string | null
  hint?: string
  children: ReactNode
}

export function Field({ id, label, error, hint, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-[#1B2A4A]">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-[#5A6B85]">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}

export function inputClass(error?: string | null) {
  return [
    "w-full rounded-xl border px-4 py-3 text-sm outline-none transition",
    "focus:ring-2 focus:ring-[#2D6A4F]/30",
    error ? "border-red-400 bg-red-50/40" : "border-[#D8DED8] bg-white",
  ].join(" ")
}

export function primaryButton() {
  return [
    "w-full rounded-xl bg-[#2D6A4F] px-5 py-3 font-semibold text-white transition",
    "hover:bg-[#245640] disabled:cursor-not-allowed disabled:opacity-60",
  ].join(" ")
}

export function secondaryButton() {
  return [
    "w-full rounded-xl border border-[#D8DED8] bg-white px-5 py-3 font-semibold text-[#1B2A4A] transition",
    "hover:bg-[#F4F6F2] disabled:cursor-not-allowed disabled:opacity-60",
  ].join(" ")
}

export function Alert({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const tones = {
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-[#B9D8C7] bg-[#EEF6F1] text-[#1E4A36]",
    info: "border-[#D8DED8] bg-[#F6F8F4] text-[#1B2A4A]",
  }
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}
    >
      {children}
    </div>
  )
}

export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="space-y-1">
      <h1 className="font-display text-2xl font-semibold text-[#1B2A4A]">{title}</h1>
      {subtitle && <p className="text-sm text-[#5A6B85]">{subtitle}</p>}
    </header>
  )
}

export function describeDevice(userAgent: string | null) {
  if (!userAgent) return "Unknown device"
  if (/iphone|ipad|android/i.test(userAgent)) return "Mobile device"
  if (/edg\//i.test(userAgent)) return "Microsoft Edge"
  if (/chrome\//i.test(userAgent)) return "Chrome"
  if (/safari\//i.test(userAgent)) return "Safari"
  if (/firefox\//i.test(userAgent)) return "Firefox"
  return "Browser"
}

export function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}