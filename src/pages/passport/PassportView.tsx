import { useCallback, useEffect, useState } from "react"
import { api, readStatus } from "../../api/client"
import type { Passport, ReviewRow } from "../../api/types"
import { Alert, ScreenTitle, secondaryButton } from "../../components/account-ui"

interface PassportViewProps {
  userId: string
  viewerId: string | null
  onNavigate: (page: string, id?: string) => void
}

/**
 * A public passport.
 *
 * The screen's job is to be honest: unavailable metrics say so rather than
 * showing a zero that reads like a judgement, and every badge links to the
 * sentence explaining what it is based on.
 */
export default function PassportView({ userId, viewerId, onNavigate }: PassportViewProps) {
  const [passport, setPassport] = useState<Passport | null>(null)
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [profile, reviewRows] = await Promise.all([
        api.passport.member(userId),
        api.passport.reviews.subject(userId)
      ])
      setPassport(profile)
      setReviews(reviewRows)
      setError(null)
    } catch (cause) {
      setError(readStatus(cause, "That passport could not be loaded."))
      setPassport(null)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  if (error && !passport) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16 space-y-4">
        <ScreenTitle title="Passport unavailable" />
        <Alert tone="error">{error}</Alert>
      </main>
    )
  }

  if (!passport) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <Alert tone="info">Loading passport…</Alert>
      </main>
    )
  }

  const isSelf = viewerId === userId
  const earned = passport.trustSignals.filter(signal => signal.earned)
  const withheld = passport.trustSignals.filter(signal => !signal.earned)

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {passport.avatarUrl ? (
            <img
              src={passport.avatarUrl}
              alt=""
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-[#E8E6DF]" aria-hidden="true" />
          )}
          <div>
            <h1 className="font-display text-2xl font-semibold text-[#1B2A4A]">{passport.displayName}</h1>
            <p className="text-sm text-[#5A6B85]">
              {[passport.city, passport.neighborhood].filter(Boolean).join(" · ") ||
                "Location not shared"}
            </p>
            {passport.memberSince && (
              <p className="text-xs text-[#8A9AB5]">
                Neighbor since{" "}
                {new Date(passport.memberSince).toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric"
                })}
                {passport.accountAgeDays != null ? ` · ${passport.accountAgeDays} days` : ""}
              </p>
            )}
          </div>
        </div>
        {isSelf && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={secondaryButton()}
              onClick={() => onNavigate("passport-edit")}
            >
              Edit passport
            </button>
            <button
              type="button"
              className={secondaryButton()}
              onClick={() => onNavigate("passport-privacy")}
            >
              Privacy
            </button>
          </div>
        )}
      </header>

      {passport.withdrawn && (
        <Alert tone="error">
          This account is not active, so its trust signals are withdrawn.
        </Alert>
      )}

      {passport.bio && <p className="text-sm text-[#1B2A4A]">{passport.bio}</p>}

      <section className="rounded-2xl border border-[#E8E6DF] bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">Activity</h2>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Exchanges" value={passport.counts.completedExchanges} />
          <Stat label="Borrowings" value={passport.counts.completedBorrowings} />
          <Stat label="Times lent" value={passport.counts.borrowingsAsLender} />
          <Stat label="Times borrowed" value={passport.counts.borrowingsAsBorrower} />
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">Ratings</h2>
        {!passport.rating ? (
          <p className="text-sm text-[#5A6B85]">
            This member has chosen not to show ratings publicly.
          </p>
        ) : passport.rating.tooFewToRate ? (
          // Saying "not enough reviews" is more honest than printing an
          // average derived from one or two reviews.
          <p className="text-sm text-[#5A6B85]">
            Not enough published reviews yet to show a rating ({passport.rating.count} so far).
          </p>
        ) : (
          <div className="rounded-2xl border border-[#E8E6DF] bg-white p-4">
            <p className="text-2xl font-semibold text-[#1B2A4A]">{passport.rating.average}</p>
            <p className="text-xs text-[#8A9AB5]">from {passport.rating.count} published reviews</p>
            <ul className="mt-2 space-y-1">
              {(["5", "4", "3", "2", "1"] as const).map(star => {
                const count = passport.rating!.distribution[star]
                return (
                  <li key={star} className="flex items-center gap-2 text-xs text-[#5A6B85]">
                    <span className="w-3">{star}</span>
                    <span
                      aria-hidden="true"
                      className="h-2 rounded-full bg-[#2D6A4F]"
                      style={{ width: `${passport.rating!.count ? (count / passport.rating!.count) * 100 : 0}%` }}
                    />
                    <span className="sr-only">
                      {count} {star}-star reviews
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">Trust signals</h2>
        {passport.trustSignals.length === 0 ? (
          <p className="text-sm text-[#5A6B85]">This member has chosen not to show trust signals.</p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-2">
              {earned.map(signal => (
                <li key={signal.key}>
                  <details className="group">
                    <summary className="cursor-pointer list-none rounded-full bg-[#EEF6F1] px-3 py-1 text-xs font-semibold text-[#1E4A36]">
                      {signal.label}
                    </summary>
                    <p className="mt-1 max-w-xs rounded-lg border border-[#E8E6DF] bg-white p-2 text-xs text-[#5A6B85]">
                      {signal.explanation}
                      {signal.count != null && ` (${signal.count})`}
                    </p>
                  </details>
                </li>
              ))}
            </ul>
            {withheld.length > 0 && (
              <details className="rounded-xl border border-[#D8DED8] bg-white p-3">
                <summary className="cursor-pointer text-sm text-[#5A6B85]">
                  {withheld.length} signal{withheld.length === 1 ? "" : "s"} not earned
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-[#5A6B85]">
                  {withheld.map(signal => (
                    <li key={signal.key}>
                      <span className="font-medium text-[#1B2A4A]">{signal.label}</span> —{" "}
                      {signal.explanation}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>

      {passport.verifications.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">Verification</h2>
          <ul className="space-y-2">
            {passport.verifications.map(row => (
              <li key={row.method} className="rounded-xl border border-[#E8E6DF] bg-white p-3">
                <p className="text-sm font-medium text-[#1B2A4A]">{row.label}</p>
                {/* No badge here says "identity verified", because none of
                    these processes check a real-world identity. */}
                <p className="text-xs text-[#5A6B85]">{row.explanation}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">Reviews</h2>
        {reviews === null && <Alert tone="info">Loading reviews…</Alert>}
        {reviews && reviews.length === 0 && (
          <p className="text-sm text-[#5A6B85]">No published reviews yet.</p>
        )}
        {reviews && reviews.length > 0 && (
          <ul className="space-y-3">
            {reviews.map(review => (
              <li key={review.id} className="rounded-2xl border border-[#E8E6DF] bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-[#1B2A4A]">
                    {review.author?.profile?.displayName ||
                      review.author?.profile?.firstName ||
                      "A neighbor"}
                  </p>
                  <span className="text-sm text-[#2D6A4F]" aria-label={`${review.rating} out of 5`}>
                    {"★".repeat(review.rating)}
                    <span className="text-[#C5CCDA]">{"★".repeat(5 - review.rating)}</span>
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#8A9AB5]">
                  {review.context}
                  {review.itemTitle ? ` · ${review.itemTitle}` : ""} ·{" "}
                  {new Date(review.createdAt).toLocaleDateString()}
                  {review.edited ? " · edited" : ""}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[#1B2A4A]">{review.body}</p>
                {viewerId && viewerId !== review.author?.id && (
                  <button
                    type="button"
                    className="mt-2 text-xs text-[#5A6B85] underline"
                    onClick={async () => {
                      const reason = window.prompt("Why are you reporting this review?")
                      if (!reason) return
                      await api.passport.reviews
                        .report(review.id, { reason: "OTHER", details: reason })
                        .catch(() => undefined)
                    }}
                  >
                    Report this review
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-[#5A6B85]">{label}</dt>
      {/* Zero is a real fact, so it is shown rather than replaced with a dash. */}
      <dd className="text-xl font-semibold text-[#1B2A4A]">{value}</dd>
    </div>
  )
}