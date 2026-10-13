import { useCallback, useEffect, useState } from "react"
import { api, readStatus } from "../../api/client"
import type { MissionCategory, MissionPage } from "../../api/types"
import { Alert, ScreenTitle, secondaryButton } from "../../components/account-ui"

const CATEGORIES: Array<{ id: MissionCategory; label: string }> = [
  { id: "CLEANUP", label: "Cleanup" },
  { id: "GARDENING", label: "Gardening" },
  { id: "DONATION", label: "Donation drive" },
  { id: "VOLUNTEER", label: "Volunteering" },
  { id: "ASSISTANCE", label: "Local assistance" },
  { id: "IMPROVEMENT", label: "Community improvement" }
]

type Scope = "all" | "joined" | "mine"

interface MissionFeedProps {
  onNavigate: (page: string, id?: string) => void
  canOrganize: boolean
}

/**
 * Mission discovery.
 *
 * Three scopes on one screen rather than three screens, because the question
 * being asked is always the same: what can I do, and what have I already said
 * I'll do. Slots left are shown honestly, including zero, so a full mission
 * reads as full rather than as unavailable.
 */
export default function MissionFeed({ onNavigate, canOrganize }: MissionFeedProps) {
  const [scope, setScope] = useState<Scope>("all")
  const [category, setCategory] = useState<MissionCategory | "">("")
  const [neighborhood, setNeighborhood] = useState("")
  const [page, setPage] = useState<MissionPage | null>(null)
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const query = {
        category: category || undefined,
        neighborhood: neighborhood.trim() || undefined,
        limit: 12,
        offset
      }
      const result =
        scope === "joined"
          ? await api.missions.joined(query)
          : scope === "mine"
            ? await api.missions.mine(query)
            : await api.missions.list(query)
      setPage(result)
      setError(null)
    } catch (cause) {
      setError(readStatus(cause, "Missions could not be loaded."))
      setPage(null)
    }
  }, [scope, category, neighborhood, offset])

  useEffect(() => {
    void load()
  }, [load])

  // Any filter change starts again from the first page; keeping the old offset
  // would show an empty page and read as "nothing here".
  function changeFilter(next: () => void) {
    setOffset(0)
    next()
  }

  const SCOPES: Array<{ id: Scope; label: string; needsAuth: boolean }> = [
    { id: "all", label: "Discover", needsAuth: false },
    { id: "joined", label: "Joined", needsAuth: true },
    { id: "mine", label: "Organizing", needsAuth: true }
  ]

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <ScreenTitle
          title="Neighborhood missions"
          subtitle="Real activities, with a real place to be and a real number of people."
        />
        {canOrganize && (
          <button type="button" className={secondaryButton()} onClick={() => onNavigate("mission-create")}>
            Organize a mission
          </button>
        )}
      </header>

      <nav aria-label="Mission scope" className="flex flex-wrap gap-2">
        {SCOPES.map(entry => (
          <button
            key={entry.id}
            type="button"
            aria-current={scope === entry.id ? "page" : undefined}
            disabled={entry.needsAuth && !canOrganize}
            onClick={() => changeFilter(() => setScope(entry.id))}
            className={
              scope === entry.id
                ? "rounded-full bg-[#2D6A4F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                : "rounded-full border border-[#D8DED8] bg-white px-4 py-2 text-sm text-[#1B2A4A] hover:bg-[#F4F6F2] disabled:opacity-40"
            }
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <section className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-[#5A6B85]" htmlFor="mission-category">
            Category
          </label>
          <select
            id="mission-category"
            value={category}
            onChange={event => changeFilter(() => setCategory(event.target.value as MissionCategory | ""))}
            className="mt-1 rounded-xl border border-[#D8DED8] px-3 py-2 text-sm"
          >
            <option value="">Any category</option>
            {CATEGORIES.map(entry => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[#5A6B85]" htmlFor="mission-neighborhood">
            Neighborhood
          </label>
          <input
            id="mission-neighborhood"
            value={neighborhood}
            onChange={event => changeFilter(() => setNeighborhood(event.target.value))}
            placeholder="Riverside"
            className="mt-1 rounded-xl border border-[#D8DED8] px-3 py-2 text-sm"
          />
        </div>
      </section>

      {error && <Alert tone="error">{error}</Alert>}
      {page === null && !error && <Alert tone="info">Loading missions…</Alert>}

      {page && page.items.length === 0 && (
        <p className="text-sm text-[#5A6B85]">
          {scope === "mine"
            ? "You have not organized a mission yet."
            : scope === "joined"
              ? "You have not joined a mission yet."
              : "No missions match those filters."}
        </p>
      )}

      {page && page.items.length > 0 && (
        <ul className="space-y-4">
          {page.items.map(mission => (
            <li key={mission.id} className="rounded-2xl border border-[#E8E6DF] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">{mission.title}</h2>
                  <p className="text-xs text-[#8A9AB5]">
                    {CATEGORIES.find(entry => entry.id === mission.category)?.label ?? mission.category}
                    {" · "}
                    {new Date(mission.startAt).toLocaleString()}
                    {mission.neighborhood ? ` · ${mission.neighborhood}` : ""}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    mission.status === "COMPLETED"
                      ? "bg-[#EEF6F1] text-[#1E4A36]"
                      : mission.status === "CANCELLED"
                        ? "bg-[#F6EDED] text-[#8A3B3B]"
                        : "bg-[#F1F3EF] text-[#5A6B85]"
                  }`}
                >
                  {mission.status.toLowerCase()}
                </span>
              </div>

              <p className="mt-2 line-clamp-3 text-sm text-[#1B2A4A]">{mission.description}</p>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#5A6B85]">
                {/* Zero is stated rather than hidden: a full mission reads as
                    full, and the waitlist is a real outcome. */}
                <span>
                  {mission.slotsLeft > 0
                    ? `${mission.slotsLeft} of ${mission.capacity} places left`
                    : `Full (${mission.capacity}) — waitlist open`}
                </span>
                {mission.requiresApproval && <span>Organizer approval required</span>}
                <span>
                  Organized by{" "}
                  {mission.organizer?.profile?.displayName ||
                    mission.organizer?.profile?.firstName ||
                    "a neighbor"}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={secondaryButton()}
                  onClick={() => onNavigate("mission-detail", mission.id)}
                >
                  View mission
                </button>
                {scope === "mine" && (
                  <button
                    type="button"
                    className={secondaryButton()}
                    onClick={() => onNavigate("mission-manage", mission.id)}
                  >
                    Manage
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {page && page.total > page.limit && (
        <nav aria-label="Mission pages" className="flex items-center gap-3 text-sm">
          <button
            type="button"
            className={secondaryButton()}
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - page.limit))}
          >
            Previous
          </button>
          <span className="text-[#5A6B85]">
            {page.offset + 1}–{Math.min(page.offset + page.limit, page.total)} of {page.total}
          </span>
          <button
            type="button"
            className={secondaryButton()}
            disabled={offset + page.limit >= page.total}
            onClick={() => setOffset(offset + page.limit)}
          >
            Next
          </button>
        </nav>
      )}
    </main>
  )
}