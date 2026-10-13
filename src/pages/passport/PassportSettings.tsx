import { useCallback, useEffect, useState } from "react"
import { api, readStatus } from "../../api/client"
import type {
  AppealRow,
  MyReview,
  PassportPrivacy,
  ReviewableExchange,
  VerificationRecord
} from "../../api/types"
import {
  Alert,
  Field,
  inputClass,
  primaryButton,
  ScreenTitle,
  secondaryButton
} from "../../components/account-ui"

type Tab = "reviews" | "privacy" | "verification" | "appeals"

/**
 * The member's own passport tools.
 *
 * One screen with four tabs rather than four screens, because they are all
 * answers to the same question: what you have said about yourself and what you
 * have chosen to show.
 */
export default function PassportSettings({ onNavigate }: { onNavigate: (page: string, id?: string) => void }) {
  const [tab, setTab] = useState<Tab>("reviews")
  const [mine, setMine] = useState<MyReview[] | null>(null)
  const [reviewable, setReviewable] = useState<ReviewableExchange[] | null>(null)
  const [privacy, setPrivacy] = useState<PassportPrivacy | null>(null)
  const [records, setRecords] = useState<{ records: VerificationRecord[]; emailVerified: boolean } | null>(null)
  const [appeals, setAppeals] = useState<AppealRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [statement, setStatement] = useState("")

  const loadReviews = useCallback(async () => {
    try {
      const [written, pending] = await Promise.all([
        api.passport.reviews.mine(),
        api.passport.reviews.reviewable()
      ])
      setMine(written)
      setReviewable(pending)
      setError(null)
    } catch (cause) {
      setError(readStatus(cause, "Your reviews could not be loaded."))
      setMine([])
      setReviewable([])
    }
  }, [])

  const loadPrivacy = useCallback(async () => {
    try {
      setPrivacy(await api.passport.privacy())
      setError(null)
    } catch (cause) {
      setError(readStatus(cause, "Your privacy settings could not be loaded."))
    }
  }, [])

  const loadVerifications = useCallback(async () => {
    try {
      setRecords(await api.passport.verifications())
      setError(null)
    } catch (cause) {
      setError(readStatus(cause, "Verifications could not be loaded."))
      setRecords({ records: [], emailVerified: false })
    }
  }, [])

  const loadAppeals = useCallback(async () => {
    try {
      setAppeals(await api.passport.myAppeals())
    } catch (cause) {
      setError(readStatus(cause, "Appeals could not be loaded."))
      setAppeals([])
    }
  }, [])

  useEffect(() => {
    if (tab === "reviews") void loadReviews()
    if (tab === "privacy") void loadPrivacy()
    if (tab === "verification") void loadVerifications()
    if (tab === "appeals") void loadAppeals()
  }, [tab, loadReviews, loadPrivacy, loadVerifications, loadAppeals])

  async function writeReview(exchange: ReviewableExchange, rating: number, body: string) {
    if (!exchange.counterparty) return
    if (body.trim().length < 10) {
      setError("Write at least 10 characters.")
      return
    }
    setBusy(true)
    setError(null)
    setNotice("")
    try {
      const created = await api.passport.reviews.create({
        transactionId: exchange.transactionId,
        subjectId: exchange.counterparty.id,
        rating,
        body: body.trim()
      })
      setNotice(created.publicationNote)
      await loadReviews()
    } catch (cause) {
      setError(readStatus(cause, "That review could not be saved."))
    } finally {
      setBusy(false)
    }
  }

  async function savePrivacy() {
    if (!privacy) return
    setBusy(true)
    setError(null)
    setNotice("")
    try {
      setPrivacy(await api.passport.updatePrivacy(privacy))
      setNotice("Privacy settings saved.")
    } catch (cause) {
      setError(readStatus(cause, "Those settings could not be saved."))
    } finally {
      setBusy(false)
    }
  }

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: "reviews", label: "Reviews" },
    { id: "privacy", label: "Privacy" },
    { id: "verification", label: "Verification" },
    { id: "appeals", label: "Appeals" }
  ]

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 space-y-6">
      <ScreenTitle
        title="Your passport"
        subtitle="What you have said about yourself, and what you have chosen to show."
      />

      <nav aria-label="Passport sections" className="flex flex-wrap gap-2">
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

      {tab === "reviews" && (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">Waiting for your review</h2>
            {reviewable === null && <Alert tone="info">Loading completed exchanges…</Alert>}
            {reviewable && reviewable.length === 0 && (
              <p className="text-sm text-[#5A6B85]">
                Nothing to review. A review opens once an exchange is complete.
              </p>
            )}
            {reviewable?.map(exchange => (
              <ReviewComposer
                key={exchange.transactionId}
                exchange={exchange}
                busy={busy}
                onSubmit={(rating, body) => writeReview(exchange, rating, body)}
              />
            ))}
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">Your reviews</h2>
            {mine === null && <Alert tone="info">Loading your reviews…</Alert>}
            {mine && mine.length === 0 && (
              <p className="text-sm text-[#5A6B85]">You have not reviewed anyone yet.</p>
            )}
            {mine && mine.length > 0 && (
              <ul className="space-y-3">
                {mine.map(review => (
                  <li key={review.id} className="rounded-2xl border border-[#E8E6DF] bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-[#2D6A4F]" aria-label={`${review.rating} out of 5`}>
                        {"★".repeat(review.rating)}
                        <span className="text-[#5C6E8A]">{"★".repeat(5 - review.rating)}</span>
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          review.visible
                            ? "bg-[#EEF6F1] text-[#1E4A36]"
                            : "bg-[#F1F3EF] text-[#5A6B85]"
                        }`}
                      >
                        {review.status.toLowerCase()}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[#1B2A4A]">{review.body}</p>
                    {/* The reason a review is not visible is always stated,
                        so nobody is left guessing. */}
                    <p className="mt-1 text-xs text-[#5C6E8A]">{review.publicationNote}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === "privacy" && (
        <section className="space-y-4">
          {!privacy ? (
            <Alert tone="info">Loading privacy settings…</Alert>
          ) : (
            <form
              className="space-y-4"
              onSubmit={event => {
                event.preventDefault()
                void savePrivacy()
              }}
              noValidate
            >
              {(
                [
                  ["showRatings", "Show my public rating summary"],
                  ["showTenure", "Show how long I have been a neighbor"],
                  ["showNeighborhood", "Show my neighborhood"],
                  ["showCity", "Show my city"],
                  ["showTrustSignals", "Show my trust signals"],
                  ["showContributions", "Show my community contributions"]
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-[#1B2A4A]">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[#2D6A4F]"
                    checked={privacy[key]}
                    onChange={event =>
                      setPrivacy(current =>
                        current ? { ...current, [key]: event.target.checked } : current
                      )
                    }
                  />
                  {label}
                </label>
              ))}

              <label className="flex items-center gap-2 text-sm text-[#1B2A4A]">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[#2D6A4F]"
                  checked={privacy.leaderboardOptIn}
                  onChange={event =>
                    setPrivacy(current =>
                      current ? { ...current, leaderboardOptIn: event.target.checked } : current
                    )
                  }
                />
                List me on the public neighbor leaderboard
              </label>
              <p className="-mt-2 text-xs text-[#5C6E8A]">
                Off by default. Only verified activity counts toward a leaderboard.
              </p>

              <Field
                id="review-window"
                label="Review publication window (days)"
                hint="How long a review waits for the other person before it appears on your profile."
              >
                <input
                  id="review-window"
                  type="number"
                  min={1}
                  max={90}
                  value={privacy.reviewWindowDays}
                  onChange={event =>
                    setPrivacy(current =>
                      current ? { ...current, reviewWindowDays: Number(event.target.value) } : current
                    )
                  }
                  className={inputClass(null)}
                />
              </Field>

              <button type="submit" className={primaryButton()} disabled={busy}>
                {busy ? "Saving…" : "Save settings"}
              </button>
            </form>
          )}
        </section>
      )}

      {tab === "verification" && (
        <section className="space-y-4">
          {!records ? (
            <Alert tone="info">Loading verifications…</Alert>
          ) : (
            <>
              <div className="rounded-2xl border border-[#E8E6DF] bg-white p-4">
                <p className="text-sm font-medium text-[#1B2A4A]">Email address</p>
                <p className="text-sm text-[#5A6B85]">
                  {records.emailVerified
                    ? "Confirmed. This says nothing about who you are in the real world."
                    : "Not confirmed yet."}
                </p>
                {!records.emailVerified && (
                  <p className="mt-1 text-xs text-[#5C6E8A]">
                    Confirm from account settings. It cannot be granted from this page.
                  </p>
                )}
              </div>

              {records.records.length === 0 && (
                <p className="text-sm text-[#5A6B85]">
                  No other verification requests. Neighborly does not collect identity documents,
                  selfies, or biometrics, and no badge here means a background check was done.
                </p>
              )}

              {records.records.map(record => (
                <div
                  key={record.id}
                  className="rounded-2xl border border-[#E8E6DF] bg-white p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[#1B2A4A]">{record.label}</p>
                    <span className="rounded-full bg-[#F1F3EF] px-2 py-0.5 text-[11px] font-semibold text-[#5A6B85]">
                      {record.status.toLowerCase()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#5A6B85]">{record.explanation}</p>
                  {record.statement && (
                    <p className="mt-1 text-xs text-[#5C6E8A]">Your note: {record.statement}</p>
                  )}
                </div>
              ))}

              <form
                className="space-y-3 rounded-xl border border-[#D8DED8] p-4"
                onSubmit={async event => {
                  event.preventDefault()
                  if (statement.trim().length < 10) {
                    setError("Tell a moderator why, in a sentence or two.")
                    return
                  }
                  setBusy(true)
                  setError(null)
                  try {
                    await api.passport.submitVerification({
                      method: "COMMUNITY_REFERENCE",
                      statement: statement.trim()
                    })
                    setNotice("Sent for moderator review.")
                    setStatement("")
                    await loadVerifications()
                  } catch (cause) {
                    setError(readStatus(cause, "That request could not be sent."))
                  } finally {
                    setBusy(false)
                  }
                }}
                noValidate
              >
                <p className="text-sm font-medium text-[#1B2A4A]">
                  Ask a moderator to confirm the neighborhood knows you
                </p>
                <p className="text-xs text-[#5A6B85]">
                  A moderator reads your note and decides. This is their statement about you, not a
                  background check and not something you can grant yourself.
                </p>
                <label className="block text-sm text-[#1B2A4A]" htmlFor="reference-statement">
                  Why do you live here?
                </label>
                <textarea
                  id="reference-statement"
                  rows={2}
                  value={statement}
                  onChange={event => setStatement(event.target.value)}
                  className="w-full rounded-xl border border-[#D8DED8] px-3 py-2 text-sm"
                />
                <button type="submit" className={secondaryButton()} disabled={busy}>
                  Request community reference
                </button>
              </form>
            </>
          )}
        </section>
      )}

      {tab === "appeals" && (
        <section className="space-y-3">
          {!appeals ? (
            <Alert tone="info">Loading appeals…</Alert>
          ) : appeals.length === 0 ? (
            <p className="text-sm text-[#5A6B85]">
              You have not appealed anything. If a moderator hides one of your reviews or turns down
              a verification, you can ask them to look again.
            </p>
          ) : (
            <ul className="space-y-3">
              {appeals.map(appeal => (
                <li key={appeal.id} className="rounded-2xl border border-[#E8E6DF] bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[#1B2A4A]">
                      {appeal.subjectType.toLowerCase()} appeal
                    </p>
                    <span className="rounded-full bg-[#F1F3EF] px-2 py-0.5 text-[11px] font-semibold text-[#5A6B85]">
                      {appeal.status.toLowerCase().replace("_", " ")}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#5A6B85]">{appeal.reason}</p>
                  {appeal.resolution && (
                    <p className="mt-1 text-xs text-[#1E4A36]">Resolution: {appeal.resolution}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <button type="button" className={secondaryButton()} onClick={() => onNavigate("passport-me")}>
        View my public passport
      </button>
    </main>
  )
}

function ReviewComposer({
  exchange,
  busy,
  onSubmit
}: {
  exchange: ReviewableExchange
  busy: boolean
  onSubmit: (rating: number, body: string) => void
}) {
  const [rating, setRating] = useState(5)
  const [body, setBody] = useState("")
  return (
    <form
      className="space-y-3 rounded-2xl border border-[#E8E6DF] bg-white p-4"
      onSubmit={event => {
        event.preventDefault()
        onSubmit(rating, body)
      }}
      noValidate
    >
      <p className="text-sm font-medium text-[#1B2A4A]">
        Exchange with{" "}
        {exchange.counterparty?.profile?.displayName ||
          exchange.counterparty?.profile?.firstName ||
          "a neighbor"}
      </p>
      <p className="text-xs text-[#5C6E8A]">
        Completed {new Date(exchange.completedAt).toLocaleDateString()}
      </p>
      <Field id={`rating-${exchange.transactionId}`} label="Rating">
        <select
          id={`rating-${exchange.transactionId}`}
          value={rating}
          onChange={event => setRating(Number(event.target.value))}
          className={inputClass(null)}
        >
          {[5, 4, 3, 2, 1].map(value => (
            <option key={value} value={value}>
              {value} star{value === 1 ? "" : "s"}
            </option>
          ))}
        </select>
      </Field>
      <Field id={`body-${exchange.transactionId}`} label="What was it like?">
        <textarea
          id={`body-${exchange.transactionId}`}
          rows={3}
          value={body}
          onChange={event => setBody(event.target.value)}
          className={inputClass(null)}
        />
      </Field>
      <button type="submit" className={primaryButton()} disabled={busy}>
        {busy ? "Saving…" : "Write review"}
      </button>
      <p className="text-xs text-[#5C6E8A]">
        Your review appears once they review too, or after your publication window closes. It is not
        a way to pressure anyone.
      </p>
    </form>
  )
}