import { useEffect, useState, type FormEvent } from "react"
import { api, ApiError } from "../api/client"
import { Button, Icon } from "../components/ui"

interface AuthActionProps {
  mode: "forgot" | "reset" | "verify"
  onNavigate: (page: "landing" | "home") => void
}

export default function AuthAction({ mode, onNavigate }: AuthActionProps) {
  const token = new URLSearchParams(window.location.search).get("token") ?? ""
  const [busy, setBusy] = useState(mode === "verify")
  const [error, setError] = useState("")
  const [complete, setComplete] = useState(false)

  useEffect(() => {
    if (mode !== "verify") return
    if (!token) {
      setError("This verification link is incomplete.")
      setBusy(false)
      return
    }
    api.auth.confirmEmail(token)
      .then(() => setComplete(true))
      .catch((cause: unknown) => setError(cause instanceof ApiError ? cause.message : "Email verification failed."))
      .finally(() => setBusy(false))
  }, [mode, token])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    setError("")
    try {
      if (mode === "forgot") {
        await api.auth.forgotPassword(String(data.get("email")))
      } else {
        const password = String(data.get("password"))
        if (password !== String(data.get("confirmation"))) throw new Error("Passwords do not match.")
        if (!token) throw new Error("This password reset link is incomplete.")
        await api.auth.resetPassword(token, password)
      }
      setComplete(true)
    } catch (cause: unknown) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : "The request could not be completed.")
    } finally {
      setBusy(false)
    }
  }

  const title = mode === "forgot" ? "Reset your password" : mode === "reset" ? "Choose a new password" : "Verify your email"
  return <main className="flex min-h-screen items-center justify-center bg-[#FAFAF7] px-4 py-12">
    <section className="w-full max-w-md rounded-3xl border border-[#E8E6DF] bg-white p-7 shadow-sm">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F0FBF3] text-[#2D6A4F]"><Icon name="shield" size={21} /></span>
      <h1 className="mt-5 font-display text-2xl font-semibold text-[#1B2A4A]">{title}</h1>
      {busy && mode === "verify" ? <p className="mt-3 text-sm text-[#5C6E8A]">Checking your verification link…</p> : complete ? <div role="status" className="mt-4"><p className="rounded-xl bg-[#F0FBF3] p-3 text-sm text-[#1B4332]">{mode === "forgot" ? "If an active account matches that email, a reset link is on its way." : mode === "reset" ? "Your password was changed and all previous sessions were signed out." : "Your email address is verified."}</p><Button className="mt-5" fullWidth onClick={() => onNavigate(mode === "verify" && api.auth.hasSession() ? "home" : "landing")}>Continue to Neighborly</Button></div> : mode === "verify" ? <>{error && <p role="alert" className="mt-4 rounded-xl bg-[#FFF5F2] p-3 text-sm text-[#C4512D]">{error}</p>}<Button className="mt-5" variant="outline" fullWidth onClick={() => onNavigate("landing")}>Back to sign in</Button></> : <form onSubmit={submit} className="mt-5 space-y-4">
        {mode === "forgot" ? <label className="block text-sm font-medium text-[#5C6E8A]">Email address<input name="email" type="email" autoComplete="email" required className="mt-1 h-12 w-full rounded-xl border border-[#E8E6DF] px-4 text-[#1B2A4A]" /></label> : <><label className="block text-sm font-medium text-[#5C6E8A]">New password<input name="password" type="password" autoComplete="new-password" minLength={12} required className="mt-1 h-12 w-full rounded-xl border border-[#E8E6DF] px-4 text-[#1B2A4A]" /></label><label className="block text-sm font-medium text-[#5C6E8A]">Confirm password<input name="confirmation" type="password" autoComplete="new-password" minLength={12} required className="mt-1 h-12 w-full rounded-xl border border-[#E8E6DF] px-4 text-[#1B2A4A]" /></label></>}
        {error && <p role="alert" className="rounded-xl bg-[#FFF5F2] p-3 text-sm text-[#C4512D]">{error}</p>}
        <Button type="submit" fullWidth loading={busy}>{mode === "forgot" ? "Send reset link" : "Update password"}</Button>
        <Button type="button" variant="ghost" fullWidth onClick={() => onNavigate("landing")}>Back to sign in</Button>
      </form>}
    </section>
  </main>
}
