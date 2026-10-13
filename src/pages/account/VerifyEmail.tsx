import { useCallback, useEffect, useState } from "react"
import { api, readError } from "../../api/client"
import { Alert, primaryButton, ScreenTitle, secondaryButton } from "../../components/account-ui"

interface VerifyEmailProps {
  token: string | null
  onDone: () => void
  onResend: () => void
}

type Phase = "verifying" | "success" | "error"

/**
 * Consumes a verification token exactly once. The token is sent to the API
 * and then dropped from component state; it is never persisted.
 */
export default function VerifyEmail({ token, onDone, onResend }: VerifyEmailProps) {
  const [phase, setPhase] = useState<Phase>(token ? "verifying" : "error")
  const [message, setMessage] = useState(
    token ? "" : "This verification link is missing or has already been used.",
  )

  const verify = useCallback(async () => {
    if (!token) {
      setPhase("error")
      return
    }
    setPhase("verifying")
    try {
      await api.auth.verifyEmail(token)
      setPhase("success")
    } catch (cause) {
      setMessage(readError(cause, "This verification link is not valid."))
      setPhase("error")
    }
  }, [token])

  useEffect(() => {
    void verify()
  }, [verify])

  return (
    <section className="mx-auto w-full max-w-md px-6 py-16 space-y-6">
      <ScreenTitle title="Verify your email" subtitle="Confirming your address…" />
      {phase === "verifying" && <Alert tone="info">Checking your verification link…</Alert>}
      {phase === "success" && (
        <>
          <Alert tone="success">Your email address is verified. You can use every Neighborly feature now.</Alert>
          <button type="button" className={primaryButton()} onClick={onDone}>
            Continue
          </button>
        </>
      )}
      {phase === "error" && (
        <>
          <Alert tone="error">{message}</Alert>
          <button type="button" className={primaryButton()} onClick={onResend}>
            Send a new link
          </button>
          <button type="button" className={secondaryButton()} onClick={onDone}>
            Back to sign in
          </button>
        </>
      )}
    </section>
  )
}