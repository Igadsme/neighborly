import { useState } from "react"
import { api, readError } from "../../api/client"
import {
  Alert,
  Field,
  inputClass,
  passwordProblem,
  primaryButton,
  ScreenTitle,
  secondaryButton,
} from "../../components/account-ui"

interface ResetPasswordProps {
  token: string | null
  onDone: () => void
}

type Phase = "form" | "done" | "invalid"

/**
 * Step two of recovery. The token arrives in the URL fragment-free query
 * of a same-origin link and is exchanged once; it is never written to
 * storage and never included in an error message.
 */
export default function ResetPassword({ token, onDone }: ResetPasswordProps) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [strengthError, setStrengthError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [phase, setPhase] = useState<Phase>(token ? "form" : "invalid")

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!token) {
      setPhase("invalid")
      return
    }
    const problem = passwordProblem(password)
    if (problem) {
      setStrengthError(problem)
      setSubmitError(null)
      return
    }
    if (password !== confirm) {
      setStrengthError(null)
      setSubmitError("The two passwords do not match.")
      return
    }
    setStrengthError(null)
    setSubmitError(null)
    setSubmitting(true)
    try {
      await api.auth.resetPassword(token, password)
      setPhase("done")
    } catch (cause) {
      setSubmitError(readError(cause, "Unable to reset your password. Request a new link."))
    } finally {
      setSubmitting(false)
    }
  }

  if (phase === "invalid") {
    return (
      <main className="mx-auto w-full max-w-md px-6 py-16 space-y-6">
        <ScreenTitle title="Reset link unavailable" />
        <Alert tone="error">
          This reset link is missing or has already been used. Request a new one to continue.
        </Alert>
        <button type="button" className={secondaryButton()} onClick={onDone}>
          Request a new link
        </button>
      </main>
    )
  }

  if (phase === "done") {
    return (
      <main className="mx-auto w-full max-w-md px-6 py-16 space-y-6">
        <ScreenTitle title="Password updated" />
        <Alert tone="success">
          Your password is changed and every other session has been signed out. Sign in with
          your new password.
        </Alert>
        <button type="button" className={primaryButton()} onClick={onDone}>
          Go to sign in
        </button>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <ScreenTitle title="Choose a new password" subtitle="This ends your other sessions." />
      <form className="mt-8 space-y-5" onSubmit={submit} noValidate>
        <Field
          id="password"
          label="New password"
          error={strengthError}
          hint="At least 12 characters with upper case, lower case, and a number."
        >
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(strengthError)}
            aria-describedby="password-hint"
            className={inputClass(strengthError)}
          />
        </Field>
        <Field id="confirm" label="Confirm new password" error={submitError}>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            aria-invalid={Boolean(submitError)}
            className={inputClass(submitError)}
          />
        </Field>
        <button type="submit" className={primaryButton()} disabled={submitting}>
          {submitting ? "Updating…" : "Update password"}
        </button>
      </form>
    </main>
  )
}