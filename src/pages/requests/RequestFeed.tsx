import { useCallback, useEffect, useState } from "react"
import { api, readError } from "../../api/client"
import type { ApiRequestSummary, RequestPage, RequestStatus } from "../../api/types"
import {
  Alert,
  Field,
  inputClass,
  primaryButton,
  ScreenTitle,
  secondaryButton,
} from "../../components/account-ui"

interface RequestFeedProps {
  onNavigate: (page: string, id?: string) => void
}

const PAGE_SIZE = 12

const SORTS: Array<{ id: NonNullable<Parameters<typeof api.requests.list>[0]>["sort"]; label: string }> = [
  { id: "newest", label: "Newest" },
  { id: "deadline", label: "Soonest deadline" },
  { id: "budget_desc", label: "Highest budget" },
  { id: "budget_asc", label: "Lowest budget" },
  { id: "relevance", label: "Best match" },
]

/**
 * Public "I need" feed. Every filter is a query parameter, so the results
 * and the count are global rather than filtered after one page was fetched.
 */
export default function RequestFeed({ onNavigate }: RequestFeedProps) {
  const [search, setSearch] = useState("")
  const [applied, setApplied] = useState("")
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("newest")
  const [openOnly, setOpenOnly] = useState(true)
  const [page, setPage] = useState<RequestPage | null>(null)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setPage(
        await api.requests.list({
          query: applied || undefined,
          sort,
          openOnly,
          limit: PAGE_SIZE,
          offset,
        }),
      )
    } catch (cause) {
      setError(readError(cause, "Requests could not be loaded."))
      setPage(null)
    } finally {
      setLoading(false)
    }
  }, [applied, sort, openOnly, offset])

  useEffect(() => {
    void load()
  }, [load])

  const pageCount = page ? Math.max(1, Math.ceil(page.total / PAGE_SIZE)) : 1
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12 space-y-6">
      <ScreenTitle
        title="I need"
        subtitle="Neighbors post what they are looking for and nearby providers make an offer."
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <Field id="request-search" label="Search requests">
            <input
              id="request-search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  setOffset(0)
                  setApplied(search.trim())
                }
              }}
              placeholder="desk, bicycle, childcare…"
              className={inputClass(null)}
            />
          </Field>
        </div>
        <button
          type="button"
          className={primaryButton()}
          onClick={() => {
            setOffset(0)
            setApplied(search.trim())
          }}
        >
          Search
        </button>
        <div>
          <Field id="request-sort" label="Sort by">
            <select
              id="request-sort"
              value={sort}
              onChange={event => {
                setOffset(0)
                setSort(event.target.value as (typeof SORTS)[number]["id"])
              }}
              className={inputClass(null)}
            >
              {SORTS.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-[#1B2A4A]">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={event => {
              setOffset(0)
              setOpenOnly(event.target.checked)
            }}
            className="h-5 w-5 accent-[#2D6A4F]"
          />
          Still open
        </label>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {loading && !page && <Alert tone="info">Loading requests…</Alert>}

      {page && !loading && page.items.length === 0 && (
        <Alert tone="info">
          No requests match those filters. Try a wider search or clear the filters.
        </Alert>
      )}

      {page && page.items.length > 0 && (
        <>
          <p className="text-sm text-[#5C6E8A]">
            <span className="font-bold text-[#1B2A4A]">{page.total}</span> requests
          </p>
          <ul className="grid gap-4 md:grid-cols-2">
            {page.items.map(request => (
              <li key={request.id}>
                <RequestCard request={request} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </>
      )}

      {page && pageCount > 1 && (
        <nav aria-label="Request pages" className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            className={secondaryButton()}
            disabled={currentPage <= 1 || loading}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Previous
          </button>
          <span className="text-sm text-[#5C6E8A]">
            Page {currentPage} of {pageCount}
          </span>
          <button
            type="button"
            className={secondaryButton()}
            disabled={currentPage >= pageCount || loading}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next
          </button>
        </nav>
      )}
    </main>
  )
}

export function RequestCard({
  request,
  onNavigate,
}: {
  request: ApiRequestSummary
  onNavigate: (page: string, id?: string) => void
}) {
  return (
    <article className="h-full rounded-2xl border border-[#E8E6DF] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">{request.title}</h2>
        {request.status && <StatusPill status={request.status} />}
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-[#5A6B85]">{request.description}</p>
      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#5A6B85]">
        <div>
          <dt className="inline font-medium text-[#1B2A4A]">Budget: </dt>
          <dd className="inline">{formatBudget(request)}</dd>
        </div>
        {request.neighborhood && (
          <div>
            <dt className="inline font-medium text-[#1B2A4A]">Near: </dt>
            <dd className="inline">{request.neighborhood}</dd>
          </div>
        )}
        {request.deadline && (
          <div>
            <dt className="inline font-medium text-[#1B2A4A]">By: </dt>
            <dd className="inline">{new Date(request.deadline).toLocaleDateString()}</dd>
          </div>
        )}
      </dl>
      <button
        type="button"
        className="mt-4 rounded-xl border border-[#D8DED8] px-4 py-2 text-sm font-medium text-[#1B2A4A] hover:bg-[#F4F6F2]"
        onClick={() => onNavigate("request-detail", request.id)}
      >
        View request
      </button>
    </article>
  )
}

export function StatusPill({ status }: { status: RequestStatus }) {
  const tones: Record<string, string> = {
    DRAFT: "bg-[#F1F3EF] text-[#5A6B85]",
    PUBLISHED: "bg-[#EEF6F1] text-[#1E4A36]",
    PAUSED: "bg-[#FFF6E5] text-[#7A5210]",
    FULFILLED: "bg-[#EAF1FB] text-[#1B3E6F]",
    CANCELLED: "bg-[#F7ECEA] text-[#7A2A1B]",
    EXPIRED: "bg-[#F1F3EF] text-[#5A6B85]",
    CLOSED: "bg-[#F1F3EF] text-[#5A6B85]",
  }
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${tones[status] ?? tones.DRAFT}`}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

export function formatBudget(request: ApiRequestSummary) {
  const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`
  if (request.budgetCents == null && request.minBudgetCents == null) return "Open to offers"
  if (request.budgetCents != null && request.minBudgetCents != null) {
    return `${money(request.minBudgetCents)} – ${money(request.budgetCents)}`
  }
  if (request.budgetCents != null) return `Up to ${money(request.budgetCents)}`
  return `From ${money(request.minBudgetCents!)}`
}

