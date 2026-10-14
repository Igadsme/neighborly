import { useCallback, useEffect, useState } from "react"
import { api, readStatus } from "../../api/client"
import { Alert, ScreenTitle, secondaryButton } from "../../components/account-ui"

interface StaffQueueProps {
  onNavigate: (page: string, id?: string) => void
}

type Tab = "reviews" | "verifications" | "appeals"

/**
 * Staff moderation queue.
 *
 * Everything here is behind the existing `StaffRoleAssignment` check on the
 * server; this screen simply shows what that staff member may act on. Actions
 * are never hidden-and-guessed: they call the real endpoints and report the
 * real outcome.
 */
export default function StaffQueue({ onNavigate }: StaffQueueProps) {
  const [tab, setTab] = useState<Tab>("reviews")
  const [reviews, setReviews] = useState<Awaited<ReturnType<typeof api.passport.staff.reviewQueue>> | null>(null)
  const [verifications, setVerifications] = useState<Awaited<ReturnType<typeof api.passport.staff.pendingVerifications>> | null>(null)
  const [appeals, setAppeals] = useState<Array<{ id: string; user: { profile?: { firstName?: string | null } | null }; subjectType: string; reason: string; status: string }> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ kind: "hide" | "restore" | "resolve" | "reject"; id: string; label: string } | null>(null)
  const [reason, setReason] = useState("")

  const loadReviews = useCallback(async () => {
    try {
      setReviews(await api.passport.staff.reviewQueue())
      setError(null)
    } catch (cause) {
      setError(readStatus(cause, "The review queue could not be loaded."))
      setReviews([])
    }
  }, [])

  const loadVerifications = useCallback(async () => {
    try {
      setVerifications(await api.passport.staff.pendingVerifications())
      setError(null)
    } catch (cause) {
      setError(readStatus(cause, "Verification requests could not be loaded."))
      setVerifications([])
    }
  }, [])

  const loadAppeals = useCallback(async () => {
    try {
      setAppeals(await api.passport.staff.appeals())
      setError(null)
    } catch (cause) {
      setError(readStatus(cause, "Appeals could not be loaded."))
      setAppeals([])
    }
  }, [])

  useEffect(() => {
    if (tab === "reviews") void loadReviews()
    if (tab === "verifications") void loadVerifications()
    if (tab === "appeals") void loadAppeals()
  }, [tab, loadReviews, loadVerifications, loadAppeals])

  async function act(action: () => Promise<unknown>, message: string, reload: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setNotice("")
    try {
      await action()
      setNotice(message)
      await reload()
    } catch (cause) {
      setError(readStatus(cause, "That action could not be applied."))
    } finally {
      setBusy(false)
    }
  }

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: "reviews", label: "Reported reviews" },
    { id: "verifications", label: "Verifications" },
    { id: "appeals", label: "Appeals" }
  ]

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-12 space-y-6">
      <ScreenTitle
        title="Moderation queue"
        subtitle="Reported reviews, verification requests, and member appeals."
      />

      <nav aria-label="Moderation sections" className="flex flex-wrap gap-2">
        {TABS.map(entry => (
          <button
            key={entry.id}
            type="button"
            aria-current={tab === entry.id ? "page" : undefined}
            onClick={() => setTab(entry.id)}
            className={
              tab === entry.id
                ? "rounded-full bg-[#2D6A4F] px-4 py-2 text-sm font-semibold text-white"
                : "rounded-full border border-[#D8DED8] bg-white px-4 py-2 text-sm text-[#1B2A4A] hover:bg-[#F4F6F2]"
            }
          >
            {entry.label}
          </button>
        ))}
      </nav>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {/* Every moderation action records a reason, so it is asked for in the
          page rather than in a blocking dialog the moderator can dismiss. */}
      {pending && (
        <form
          className="space-y-3 rounded-2xl border border-[#D8DED8] bg-white p-4"
          onSubmit={event => {
            event.preventDefault()
            if (reason.trim().length < 3) {
              setError("Give a reason; it is stored with the action.")
              return
            }
            const target = pending
            setPending(null)
            void act(
              async () => {
                if (target.kind === "hide") await api.passport.staff.hideReview(target.id, reason.trim())
                else if (target.kind === "restore") await api.passport.staff.restoreReview(target.id, reason.trim())
                else
                  await api.passport.staff.resolveAppeal(target.id, {
                    status: target.kind === "resolve" ? "RESOLVED" : "REJECTED",
                    resolution: reason.trim()
                  })
              },
              target.kind === "hide"
                ? "Review hidden. It stays on record with its reason."
                : target.kind === "restore"
                  ? "Review restored."
                  : target.kind === "resolve"
                    ? "Appeal resolved."
                    : "Appeal rejected.",
              tab === "reviews" ? loadReviews : tab === "appeals" ? loadAppeals : loadVerifications
            )
          }}
          noValidate
        >
          <label className="block text-sm text-[#1B2A4A]" htmlFor="moderation-reason">
            Reason for {pending.label}
          </label>
          <textarea
            id="moderation-reason"
            rows={2}
            value={reason}
            onChange={event => setReason(event.target.value)}
            className="w-full rounded-xl border border-[#D8DED8] px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-lg bg-[#2D6A4F] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              disabled={busy}
            >
              {busy ? "Applying…" : "Confirm"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-[#D8DED8] px-3 py-1.5 text-sm"
              onClick={() => setPending(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {tab === "reviews" && (
        <>
          {reviews === null && <Alert tone="info">Loading the queue…</Alert>}
          {reviews && reviews.length === 0 && (
            <Alert tone="info">Nothing waiting for review.</Alert>
          )}
          {reviews && reviews.length > 0 && (
            <ul className="space-y-4">
              {reviews.map(row => (
                <li key={row.id} className="rounded-2xl border border-[#E8E6DF] bg-white p-4">
                  <p className="text-sm font-medium text-[#1B2A4A]">
                    Reported for {String(row.reason).toLowerCase().replace(/_/g, " ")}
                  </p>
                  {row.details && <p className="mt-1 text-sm text-[#5A6B85]">{row.details}</p>}
                  <p className="mt-1 text-xs text-[#5C6E8A]">
                    Reported by {row.reporter?.profile?.displayName || row.reporter?.profile?.firstName || "a neighbor"}{" "}
                    · {new Date(row.createdAt).toLocaleDateString()}
                  </p>
                  {row.review && (
                    <blockquote className="mt-3 rounded-xl border border-[#E8E6DF] bg-[#FAFAF7] p-3 text-sm text-[#1B2A4A]">
                      {row.review.body}
                    </blockquote>
                  )}
                  {row.review && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <ActionButton
                        label="Hide review"
                        disabled={busy}
                        onClick={() => {
                          setReason("")
                          setPending({ kind: "hide", id: row.review!.id, label: "hiding this review" })
                        }}
                      />
                      <ActionButton
                        label="Restore review"
                        disabled={busy}
                        onClick={() => {
                          setReason("")
                          setPending({ kind: "restore", id: row.review!.id, label: "restoring this review" })
                        }}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "verifications" && (
        <>
          {verifications === null && <Alert tone="info">Loading requests…</Alert>}
          {verifications && verifications.length === 0 && (
            <Alert tone="info">No verification requests waiting.</Alert>
          )}
          {verifications && verifications.length > 0 && (
            <ul className="space-y-4">
              {verifications.map(row => (
                <li key={row.id} className="rounded-2xl border border-[#E8E6DF] bg-white p-4">
                  <p className="text-sm font-medium text-[#1B2A4A]">
                    {row.user?.profile?.displayName || row.user?.profile?.firstName || "A member"} asked
                    for {String(row.method).toLowerCase().replace(/_/g, " ")}
                  </p>
                  {row.statement && <p className="mt-1 text-sm text-[#5A6B85]">{row.statement}</p>}
                  <p className="mt-1 text-xs text-[#5C6E8A]">
                    {new Date(row.createdAt).toLocaleDateString()}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionButton
                      label="Approve"
                      disabled={busy}
                      onClick={() =>
                        act(
                          () =>
                            api.passport.staff.reviewVerification(row.id, {
                              status: "APPROVED",
                              note: "Checked against community context"
                            }),
                          "Approved.",
                          loadVerifications
                        )
                      }
                    />
                    <ActionButton
                      label="Decline"
                      disabled={busy}
                      onClick={() =>
                        act(
                          () =>
                            api.passport.staff.reviewVerification(row.id, {
                              status: "REJECTED",
                              note: "Not enough to act on"
                            }),
                          "Declined.",
                          loadVerifications
                        )
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "appeals" && (
        <>
          {appeals === null && <Alert tone="info">Loading appeals…</Alert>}
          {appeals && appeals.length === 0 && <Alert tone="info">No appeals waiting.</Alert>}
          {appeals && appeals.length > 0 && (
            <ul className="space-y-4">
              {appeals.map(row => (
                <li key={row.id} className="rounded-2xl border border-[#E8E6DF] bg-white p-4">
                  <p className="text-sm font-medium text-[#1B2A4A]">
                    {row.user?.profile?.firstName || "A member"} ·{" "}
                    {row.subjectType.toLowerCase()} appeal
                  </p>
                  <p className="mt-1 text-sm text-[#5A6B85]">{row.reason}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionButton
                      label="Resolve in their favor"
                      disabled={busy}
                      onClick={() => {
                        setReason("")
                        setPending({ kind: "resolve", id: row.id, label: "resolving this appeal" })
                      }}
                    />
                    <ActionButton
                      label="Reject appeal"
                      disabled={busy}
                      onClick={() => {
                        setReason("")
                        setPending({ kind: "reject", id: row.id, label: "rejecting this appeal" })
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <button type="button" className={secondaryButton()} onClick={() => onNavigate("home")}>
        Back to Neighborly
      </button>
    </section>
  )
}

function ActionButton({
  label,
  onClick,
  disabled
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-[#D8DED8] px-3 py-1.5 text-sm text-[#1B2A4A] hover:bg-[#F4F6F2] disabled:opacity-50"
    >
      {label}
    </button>
  )
}
