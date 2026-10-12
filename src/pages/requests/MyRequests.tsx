import { useCallback, useEffect, useState } from "react"
import { api, readStatus } from "../../api/client"
import type { ApiRequestSummary, RequestStatus } from "../../api/types"
import { Alert, ScreenTitle } from "../../components/account-ui"
import { RequestCard } from "./RequestFeed"

const FILTERS: Array<{ id: RequestStatus | "ALL"; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "PUBLISHED", label: "Live" },
  { id: "DRAFT", label: "Drafts" },
  { id: "PAUSED", label: "Paused" },
  { id: "FULFILLED", label: "Fulfilled" },
  { id: "EXPIRED", label: "Expired" },
]

export interface MyRequestsProps {
  onNavigate: (page: string, id?: string) => void
}

/** Owner view of every request, filtered by status. */
export default function MyRequests({ onNavigate }: MyRequestsProps) {
  const [filter, setFilter] = useState<RequestStatus | "ALL">("ALL")
  const [rows, setRows] = useState<ApiRequestSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setRows(await api.requests.mine(filter === "ALL" ? {} : { status: filter }))
    } catch (cause) {
      setError(readStatus(cause, "Your requests could not be loaded."))
      setRows([])
    }
  }, [filter])

  useEffect(() => {
    setRows(null)
    void load()
  }, [load])

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12 space-y-6">
      <ScreenTitle
        title="My requests"
        subtitle="Track what you have asked for and the offers you received."
      />

      <nav aria-label="Filter requests by status" className="flex flex-wrap gap-2">
        {FILTERS.map(entry => (
          <button
            key={entry.id}
            type="button"
            aria-current={filter === entry.id ? "page" : undefined}
            onClick={() => setFilter(entry.id)}
            className={
              filter === entry.id
                ? "rounded-full bg-[#2D6A4F] px-4 py-2 text-sm font-semibold text-white"
                : "rounded-full border border-[#D8DED8] bg-white px-4 py-2 text-sm text-[#1B2A4A] hover:bg-[#F4F6F2]"
            }
          >
            {entry.label}
          </button>
        ))}
      </nav>

      {error && <Alert tone="error">{error}</Alert>}
      {!rows && <Alert tone="info">Loading your requests…</Alert>}
      {rows && rows.length === 0 && (
        <Alert tone="info">
          Nothing here yet. Post what you need and it will show up in this list.
        </Alert>
      )}

      {rows && rows.length > 0 && (
        <>
          <p className="text-sm text-[#5A6B85]">
            <span className="font-bold text-[#1B2A4A]">{rows.length}</span> requests
          </p>
          <ul className="grid gap-4 md:grid-cols-2">
            {rows.map(request => (
              <li key={request.id} className="space-y-2">
                <RequestCard request={request} onNavigate={onNavigate} />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-[#D8DED8] px-3 py-1.5 text-sm hover:bg-[#F4F6F2]"
                    onClick={() => onNavigate("request-edit", request.id)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-[#D8DED8] px-3 py-1.5 text-sm hover:bg-[#F4F6F2]"
                    onClick={() => onNavigate("request-detail", request.id)}
                  >
                    Manage
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}

