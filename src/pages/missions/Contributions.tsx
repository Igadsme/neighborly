import { useCallback, useEffect, useState } from "react"
import { api, readStatus } from "../../api/client"
import type { ContributionRecord } from "../../api/types"
import { Alert, ScreenTitle, secondaryButton } from "../../components/account-ui"

/**
 * A member's community record.
 *
 * The framing matters more than the numbers: this is a record of time spent,
 * not an impact estimate. Nothing here is redeemable, and the screen says so
 * rather than leaving a member to wonder.
 */
export default function Contributions({ onNavigate }: { onNavigate: (page: string, id?: string) => void }) {
  const [record, setRecord] = useState<ContributionRecord | null>(null)
  const [catalogue, setCatalogue] = useState<Array<{ code: string; label: string; explanation: string }>>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [mine, all] = await Promise.all([api.missions.contributions(), api.missions.badgeCatalogue()])
      setRecord(mine)
      setCatalogue(all)
      setError(null)
    } catch (cause) {
      setError(readStatus(cause, "Your community record could not be loaded."))
      setRecord(null)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const held = new Set(record?.badges.map(badge => badge.code) ?? [])

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 space-y-6">
      <ScreenTitle
        title="Community contributions"
        subtitle="Verified participation only. Nothing here is worth anything except the record."
      />

      {error && <Alert tone="error">{error}</Alert>}
      {record === null && !error && <Alert tone="info">Loading your record…</Alert>}

      {record && (
        <>
          {!record.showContributions && (
            <Alert tone="info">
              You have chosen not to show contributions publicly. This page is still yours.
            </Alert>
          )}

          <section className="rounded-2xl border border-[#E8E6DF] bg-white p-5">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-[#5A6B85]">Verified missions</dt>
                <dd className="text-2xl font-semibold text-[#1B2A4A]">{record.verifiedMissionCount}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#5A6B85]">Missions organized</dt>
                <dd className="text-2xl font-semibold text-[#1B2A4A]">{record.organizedCount}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#5A6B85]">Badges held</dt>
                <dd className="text-2xl font-semibold text-[#1B2A4A]">{record.badges.length}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-[#5C6E8A]">
              A mission counts once attendance was confirmed by someone other than the person being
              credited, and only after the organizer completed it. Joining is never enough.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">Badges</h2>
            {record.badges.length === 0 && (
              <p className="text-sm text-[#5A6B85]">No badges yet. Verified attendance earns the first one.</p>
            )}
            <ul className="space-y-2">
              {record.badges.map(badge => (
                <li key={badge.code} className="rounded-2xl border border-[#E8E6DF] bg-white p-4">
                  <p className="text-sm font-semibold text-[#1B2A4A]">{badge.label}</p>
                  <p className="mt-1 text-xs text-[#5A6B85]">{badge.explanation}</p>
                  {badge.awardedAt && (
                    <p className="mt-1 text-xs text-[#5C6E8A]">
                      Earned {new Date(badge.awardedAt).toLocaleDateString()}
                    </p>
                  )}
                </li>
              ))}
            </ul>

            {catalogue.some(entry => !held.has(entry.code)) && (
              <details className="rounded-xl border border-[#D8DED8] bg-white p-3">
                <summary className="cursor-pointer text-sm text-[#5A6B85]">
                  What else there is to earn
                </summary>
                <ul className="mt-2 space-y-2">
                  {catalogue
                    .filter(entry => !held.has(entry.code))
                    .map(entry => (
                      <li key={entry.code}>
                        <span className="text-sm font-medium text-[#1B2A4A]">{entry.label}</span>
                        <span className="block text-xs text-[#5A6B85]">{entry.explanation}</span>
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">Participation history</h2>
            {record.participation.length === 0 && (
              <p className="text-sm text-[#5A6B85]">You have not joined a mission yet.</p>
            )}
            <ul className="space-y-2">
              {record.participation.map(row => (
                <li key={row.id} className="rounded-2xl border border-[#E8E6DF] bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      className="text-sm font-medium text-[#1B2A4A] underline"
                      onClick={() => onNavigate("mission-detail", row.mission.id)}
                    >
                      {row.mission.title}
                    </button>
                    <span className="rounded-full bg-[#F1F3EF] px-2 py-0.5 text-[11px] font-semibold text-[#5A6B85]">
                      {row.status.toLowerCase().replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#5C6E8A]">
                    {new Date(row.mission.startAt).toLocaleDateString()}
                    {row.verifiedAt ? ` · verified ${new Date(row.verifiedAt).toLocaleDateString()}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryButton()} onClick={() => onNavigate("missions")}>
          Find a mission
        </button>
        <button type="button" className={secondaryButton()} onClick={() => onNavigate("passport-me")}>
          View my passport
        </button>
      </div>
    </main>
  )
}