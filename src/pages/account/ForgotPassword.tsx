import { useState } from "react"
import { api, ApiError, readError } from "../../api/client"
import {
  Alert,
  emailProblem,
  Field,
  inputClass,
  primaryButton,
  ScreenTitle,
  secondaryButton,
} from "../../components/account-ui"

interface ForgotPasswordProps {
  onBack: () => void
  onSubmitted: (email: string) => void
}

/**
 * Step one of recovery. The response is deliberately identical whether or
 * not the address exists, so this screen never confirms that an account
 * is registered.
 */
export default function ForgotPassword({ onBack, onSubmitted }: ForgotPasswordProps) {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const problem = emailProblem(email)
    setError(problem)
    if (problem) return
    setSubmitting(true)
    try {
      await api.auth.forgotPassword(email.trim())
      setDone(true)
      onSubmitted(email.trim())
    } catch (cause) {
      setError(readError(cause, "Unable to start password recovery. Try again."))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-md px-6 py-16">
      <ScreenTitle
        title="Reset your password"
        subtitle="We will email you a link to choose a new one."
      />
      <div className="mt-8 space-y-5">
        {done ? (
          <Alert tone="success">
            If an account exists for {email}, a reset link is on its way. The link expires
            in 30 minutes.
          </Alert>
        ) : (
          <form className="space-y-5" onSubmit={submit} noValidate>
            <Field id="email" label="Email address" error={error}>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "email-error" : undefined}
                className={inputClass(error)}
              />
            </Field>
            <button type="submit" className={primaryButton()} disabled={submitting}>
              {submitting ? "Sending…" : "Email me a reset link"}
            </button>
          </form>
        )}
        <button type="button" className={secondaryButton()} onClick={onBack}>
          Back to sign in
        </button>
      </div>
    </section>
  )
}

export { ApiError }