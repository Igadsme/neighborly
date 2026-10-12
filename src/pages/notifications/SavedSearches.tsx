import { useCallback, useEffect, useState } from "react"
import { api, readError } from "../../api/client"
import type { ApiSavedSearch, SavedSearchAlert } from "../../api/types"
import { Alert, Field, ScreenTitle, inputClass, primaryButton, secondaryButton } from "../../components/account-ui"
import { subscribeRealtime } from "../../lib/realtime"

interface SavedSearchesProps {
  onNavigate: (page: string, id?: string) => void
}

type Draft = { query: string; categoryId: string; neighborhood: string; maxPrice: string }

/**
 * Saved-search management.
 *
 * This completes the Milestone 4 deferral: the criteria were already
 * persisted and had a create and delete API, but there was no way to see or
 * change them. Editing goes through the existing update endpoint, so an alert
 * rule is changed in one place rather than duplicated in the client.
 */
export default function SavedSearches({ onNavigate }: SavedSearchesProps) {
  const [rows, setRows] = useState<ApiSavedSearch[] | null>(null)
  const [alerts, setAlerts] = useState<SavedSearchAlert[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>({ query: "", categoryId: "", neighborhood: "", maxPrice: "" })
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")

  const load = useCallback(async () => {
    try {
      const [searches, alertRows] = await Promise.all([
        api.listings.savedSearches(),
        api.notifications.savedSearchAlerts()
      ])
      setRows(searches)
      setAlerts(alertRows)
      setError(null)
    } catch (cause) {
      setError(readError(cause, "Saved searches could not be loaded."))
      setRows([])
    }
  }, [])

  useEffect(() => {
    void load()
    const subscription = subscribeRealtime({ onNotification: () => void load() })
    return () => subscription.disconnect()
  }, [load])

  function startEdit(row: ApiSavedSearch) {
    const filters = (row.filters ?? {}) as Record<string, unknown>
    setEditing(row.id)
    setError(null)
    setNotice("")
    setDraft({
      query: row.query ?? "",
      categoryId: typeof filters.categoryId === "string" ? filters.categoryId : "",
      neighborhood: typeof filters.neighborhood === "string" ? filters.neighborhood : "",
      maxPrice: typeof filters.maxPriceCents === "number" ? String(filters.maxPriceCents / 100) : ""
    })
  }

  async function saveEdit() {
    if (!editing) return
    setError(null)
    try {
      await api.listings.updateSavedSearch(editing, {
        query: draft.query.trim(),
        filters: {
          ...(draft.categoryId ? { categoryId: draft.categoryId } : {}),
          ...(draft.neighborhood.trim() ? { neighborhood: draft.neighborhood.trim() } : {}),
          ...(draft.maxPrice.trim() ? { maxPriceCents: Math.round(Number(draft.maxPrice) * 100) } : {})
        }
      })
      setEditing(null)
      setNotice("Saved search updated. Future alerts use the new criteria.")
      await load()
    } catch (cause) {
      setError(readError(cause, "That saved search could not be updated."))
    }
  }

  async function remove(row: ApiSavedSearch) {
    setError(null)
    try {
      await api.listings.deleteSavedSearch(row.id)
      setNotice("Saved search deleted.")
      await load()
    } catch (cause) {
      setError(readError(cause, "That saved search could not be deleted."))
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 space-y-8">
      <ScreenTitle
        title="Saved searches"
        subtitle="You are alerted when a new listing matches what you are watching."
      />

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">Your searches</h2>
        {!rows && <Alert tone="info">Loading saved searches…</Alert>}
        {rows && rows.length === 0 && (
          <Alert tone="info">
            You have no saved searches. Save one from Explore to get alerted.
          </Alert>
        )}
        {rows && rows.length > 0 && (
          <ul className="space-y-3">
            {rows.map(row => (
              <li key={row.id} className="rounded-2xl border border-[#E8E6DF] bg-white p-4">
                {editing === row.id ? (
                  <form
                    className="space-y-3"
                    onSubmit={event => {
                      event.preventDefault()
                      void saveEdit()
                    }}
                    noValidate
                  >
                    <Field id={`search-query-${row.id}`} label="Search terms">
                      <input
                        id={`search-query-${row.id}`}
                        value={draft.query}
                        onChange={event => setDraft(current => ({ ...current, query: event.target.value }))}
                        className={inputClass(null)}
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field id={`search-neighborhood-${row.id}`} label="Neighborhood">
                        <input
                          id={`search-neighborhood-${row.id}`}
                          value={draft.neighborhood}
                          onChange={event =>
                            setDraft(current => ({ ...current, neighborhood: event.target.value }))
                          }
                          className={inputClass(null)}
                        />
                      </Field>
                      <Field id={`search-max-${row.id}`} label="Maximum price ($)">
                        <input
                          id={`search-max-${row.id}`}
                          inputMode="decimal"
                          value={draft.maxPrice}
                          onChange={event => setDraft(current => ({ ...current, maxPrice: event.target.value }))}
                          className={inputClass(null)}
                        />
                      </Field>
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" className={primaryButton()}>
                        Save criteria
                      </button>
                      <button
                        type="button"
                        className={secondaryButton()}
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#1B2A4A]">
                        {row.query || "All listings"}
                      </p>
                      <p className="text-xs text-[#5A6B85]">{describeFilters(row.filters)}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-[#D8DED8] px-3 py-1.5 text-sm hover:bg-[#F4F6F2]"
                        onClick={() => startEdit(row)}
                      >
                        Edit criteria
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                        onClick={() => remove(row)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">Recent alerts</h2>
        {alerts.length === 0 ? (
          <Alert tone="info">No alerts yet. They appear when a new listing matches.</Alert>
        ) : (
          <ul className="space-y-2">
            {alerts.map(alert => (
              <li key={alert.id}>
                <button
                  type="button"
                  onClick={async () => {
                    if (!alert.readAt) {
                      await api.notifications.markSavedSearchAlertRead(alert.id).catch(() => undefined)
                    }
                    await load()
                    // An alert for a listing its owner has since removed must
                    // not send the reader to a dead page.
                    if (alert.listing && alert.listing.status === 'PUBLISHED' && !alert.listing.deletedAt) {
                      onNavigate("listing", alert.listingId)
                    }
                  }}
                  className={`w-full rounded-2xl border p-4 text-left hover:bg-[#F4F6F2] ${
                    alert.readAt ? "border-[#E8E6DF] bg-white" : "border-[#C9DDD2] bg-[#F2F8F4]"
                  }`}
                >
                  <p className="text-sm font-semibold text-[#1B2A4A]">
                    {alert.listing?.title ?? "A listing you saved is no longer available"}
                  </p>
                  <p className="mt-1 text-xs text-[#8A9AB5]">
                    {new Date(alert.createdAt).toLocaleString()}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

export function describeFilters(filters: unknown): string {
  const parsed = (filters ?? {}) as Record<string, unknown>
  const parts: string[] = []
  if (typeof parsed.neighborhood === "string" && parsed.neighborhood) {
    parts.push(`in ${parsed.neighborhood}`)
  }
  if (typeof parsed.maxPriceCents === "number") {
    parts.push(`under $${(parsed.maxPriceCents / 100).toFixed(0)}`)
  }
  if (typeof parsed.minPriceCents === "number") {
    parts.push(`over $${(parsed.minPriceCents / 100).toFixed(0)}`)
  }
  return parts.length > 0 ? parts.join(", ") : "Any listing"
}