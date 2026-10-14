import { useCallback, useEffect, useState } from "react"
import { api, readStatus } from "../../api/client"
import type { BorrowDispute, BorrowRequest } from "../../api/types"
import { Alert, ScreenTitle, secondaryButton } from "../../components/account-ui"
import { ItemCard, date } from "./BorrowMarketplace"
import { StatusPill } from "./BorrowDetail"

const SCOPES = [
  { id: "borrowed", label: "I'm borrowing" },
  { id: "lent", label: "I'm lending" },
  { id: "all", label: "Everything" }
] as const

interface BorrowListsProps {
  onNavigate: (page: string, id?: string) => void
}

/**
 * My borrowed items, my lent items, and the items I have listed to lend.
 * Three scopes over one API, so a member always sees the side they are acting
 * from rather than a merged list they have to parse.
 */
export default function BorrowLists({ onNavigate }: BorrowListsProps) {
  const [tab, setTab] = useState<"requests" | "items">("requests")
  const [scope, setScope] = useState<(typeof SCOPES)[number]["id"]>("borrowed")
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [rows, setRows] = useState<BorrowRequest[] | null>(null)
  const [items, setItems] = useState<Awaited<ReturnType<typeof api.borrow.myItems>> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadRequests = useCallback(async () => {
    try {
      setRows(await api.borrow.listRequests({ scope, overdueOnly: overdueOnly || undefined }))
      setError(null)
    } catch (cause) {
      setError(readStatus(cause, "Your borrowings could not be loaded."))
      setRows([])
    }
  }, [scope, overdueOnly])

  const loadItems = useCallback(async () => {
    try {
      setItems(await api.borrow.myItems())
      setError(null)
    } catch (cause) {
      setError(readStatus(cause, "Your items could not be loaded."))
      setItems([])
    }
  }, [])

  useEffect(() => {
    if (tab === "requests") void loadRequests()
    else void loadItems()
  }, [tab, loadRequests, loadItems])

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-12 space-y-6">
      <ScreenTitle
        title="Borrowing"
        subtitle="Everything you are borrowing, lending, and offering to lend."
      />

      <nav aria-label="Borrowing sections" className="flex flex-wrap gap-2">
        {(["requests", "items"] as const).map(id => (
          <button
            key={id}
            type="button"
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
            className={
              tab === id
                ? "rounded-full bg-[#2D6A4F] px-4 py-2 text-sm font-semibold text-white"
                : "rounded-full border border-[#D8DED8] bg-white px-4 py-2 text-sm text-[#1B2A4A] hover:bg-[#F4F6F2]"
            }
          >
            {id === "requests" ? "Borrowings" : "Items I lend"}
          </button>
        ))}
      </nav>

      {error && <Alert tone="error">{error}</Alert>}

      {tab === "requests" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {SCOPES.map(entry => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setScope(entry.id)}
                className={
                  scope === entry.id
                    ? "rounded-full border border-[#2D6A4F] px-3 py-1.5 text-sm font-medium text-[#2D6A4F]"
                    : "rounded-full border border-[#D8DED8] px-3 py-1.5 text-sm text-[#5A6B85]"
                }
              >
                {entry.label}
              </button>
            ))}
            <label className="flex items-center gap-2 min-h-11 text-sm text-[#1B2A4A] cursor-pointer">
              <input
                type="checkbox"
                checked={overdueOnly}
                onChange={event => setOverdueOnly(event.target.checked)}
                // The box itself is enlarged to 28px so it clears the 24px
                // minimum target on its own, rather than relying on the
                // label's padding to make the hit area large enough.
                className="w-7 h-7 accent-[#2D6A4F] cursor-pointer shrink-0"
              />
              Overdue only
            </label>
          </div>

          {rows && rows.length === 0 && (
            <Alert tone="info">
              Nothing here yet. Find something in the borrow marketplace, or list an item of your own.
            </Alert>
          )}

          {rows && rows.length > 0 && (
            <ul className="space-y-3">
              {rows.map(row => (
                <li key={row.id} className="rounded-2xl border border-[#E8E6DF] bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-[#1B2A4A]">{row.listing.title}</p>
                      <p className="text-xs text-[#5A6B85]">
                        {date(row.startAt)} → {date(row.endAt)} · you are the {row.role}
                      </p>
                    </div>
                    <StatusPill status={row.status} />
                  </div>
                  <button
                    type="button"
                    className="mt-3 rounded-xl border border-[#D8DED8] px-3 py-1.5 text-sm hover:bg-[#F4F6F2]"
                    onClick={() => onNavigate("borrow-detail", row.id)}
                  >
                    Open
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "items" && (
        <>
          <button
            type="button"
            className="self-start rounded-xl bg-[#2D6A4F] px-4 py-2 text-sm font-semibold text-white"
            onClick={() => onNavigate("borrow-create")}
          >
            List another item
          </button>
          {items && items.length === 0 && (
            <Alert tone="info">
              You have not listed anything to lend yet. Most neighbors start with one tool they would
              otherwise store.
            </Alert>
          )}
          {items && items.length > 0 && (
            <ul className="grid gap-4 md:grid-cols-2">
              {items.map(item => (
                <li key={item.id} className="space-y-2">
                  <ItemCard item={item} onNavigate={onNavigate} />
                  <p className="text-xs text-[#5A6B85]">
                    {item.status === "PUBLISHED" ? "Listed" : "Hidden"} ·{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => onNavigate("borrow-edit", item.id)}
                    >
                      Edit
                    </button>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <button type="button" className={secondaryButton()} onClick={() => onNavigate("borrow")}>
        Browse the marketplace
      </button>
    </section>
  )
}

export type { BorrowDispute }