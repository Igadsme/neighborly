import { useCallback, useEffect, useState } from "react"
import { api, readError } from "../../api/client"
import type { BorrowAvailability, BorrowableItem, BorrowItemPage } from "../../api/types"
import { Alert, Field, ScreenTitle, inputClass, primaryButton, secondaryButton } from "../../components/account-ui"

const PAGE_SIZE = 12

interface BorrowMarketplaceProps {
  onNavigate: (page: string, id?: string) => void
}

/**
 * The borrow marketplace.
 *
 * Every filter is a query parameter, so the count is global rather than the
 * length of one page. Availability is a filter, not a promise: an item can be
 * booked a second after this page loads, which is why approving still fails
 * predictably if two neighbors want the same weekend.
 */
export default function BorrowMarketplace({ onNavigate }: BorrowMarketplaceProps) {
  const [search, setSearch] = useState("")
  const [applied, setApplied] = useState("")
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState<BorrowItemPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setPage(
        await api.borrow.listItems({
          query: applied || undefined,
          availableNow: true,
          limit: PAGE_SIZE,
          offset
        })
      )
      setError(null)
    } catch (cause) {
      setError(readError(cause, "Borrowable items could not be loaded."))
      setPage(null)
    } finally {
      setLoading(false)
    }
  }, [applied, offset])

  useEffect(() => {
    void load()
  }, [load])

  const pageCount = page ? Math.max(1, Math.ceil(page.total / PAGE_SIZE)) : 1
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12 space-y-6">
      <ScreenTitle
        title="Borrow"
        subtitle="Borrow a tool or an item from a neighbor, and lend yours when you are not using it."
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <Field id="borrow-search" label="Search items">
            <input
              id="borrow-search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  setOffset(0)
                  setApplied(search.trim())
                }
              }}
              placeholder="drill, ladder, sewing machine…"
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
        <button type="button" className={secondaryButton()} onClick={() => onNavigate("borrow-create")}>
          List an item to lend
        </button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {loading && !page && <Alert tone="info">Loading items…</Alert>}
      {page && !loading && page.items.length === 0 && (
        <Alert tone="info">Nothing matches that search right now. Try a broader term.</Alert>
      )}

      {page && page.items.length > 0 && (
        <>
          <p className="text-sm text-[#5C6E8A]">
            <span className="font-bold text-[#1B2A4A]">{page.total}</span> items available to borrow
          </p>
          <ul className="grid gap-4 md:grid-cols-2">
            {page.items.map(item => (
              <li key={item.id}>
                <ItemCard item={item} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </>
      )}

      {page && pageCount > 1 && (
        <nav aria-label="Borrow pages" className="flex items-center justify-center gap-3 pt-2">
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

export function ItemCard({
  item,
  onNavigate,
}: {
  item: BorrowableItem
  onNavigate: (page: string, id?: string) => void
}) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-[#E8E6DF] bg-white p-4">
      <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">{item.title}</h2>
      <p className="mt-1 text-sm text-[#5A6B85]">
        Lent by {item.seller?.profile?.displayName || item.seller?.profile?.firstName || "a neighbor"}
        {item.neighborhood ? ` · ${item.neighborhood}` : ""}
      </p>
      <p className="mt-2 line-clamp-2 text-sm text-[#5A6B85]">{item.description}</p>
      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#5A6B85]">
        {item.maxBorrowDays != null && (
          <div>
            <dt className="inline font-medium text-[#1B2A4A]">Up to: </dt>
            <dd className="inline">{item.maxBorrowDays} days</dd>
          </div>
        )}
        {item.depositCents != null && item.depositCents > 0 && (
          <div>
            <dt className="inline font-medium text-[#1B2A4A]">Deposit: </dt>
            {/* Stated for transparency. No payment is processed here. */}
            <dd className="inline">${(item.depositCents / 100).toFixed(0)} agreed in person</dd>
          </div>
        )}
      </dl>
      <button
        type="button"
        className="mt-4 self-start rounded-xl border border-[#D8DED8] px-4 py-2 text-sm font-medium text-[#1B2A4A] hover:bg-[#F4F6F2]"
        onClick={() => onNavigate("borrow-item", item.id)}
      >
        View and request
      </button>
    </article>
  )
}

/**
 * The availability calendar.
 *
 * Booked dates are shown as anonymous blocks: the calendar is public, and
 * who booked an item is not.
 */
export function AvailabilityCalendar({
  listingId,
  viewerId,
  onChanged,
}: {
  listingId: string
  viewerId: string | null
  onChanged?: () => void
}) {
  const [calendar, setCalendar] = useState<BorrowAvailability | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setCalendar(await api.borrow.availability(listingId))
      setError(null)
    } catch (cause) {
      setError(readError(cause, "Availability could not be loaded."))
    }
  }, [listingId])

  useEffect(() => {
    void load()
  }, [load])

  async function block() {
    if (!start || !end) {
      setError("Choose a start and end date for the window.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.borrow.addWindow(listingId, {
        kind: "UNAVAILABLE",
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(end).toISOString(),
        note: note || undefined
      })
      setStart("")
      setEnd("")
      setNote("")
      await load()
      onChanged?.()
    } catch (cause) {
      setError(readError(cause, "That window could not be saved."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">Availability</h2>
      {error && <Alert tone="error">{error}</Alert>}
      {!calendar && <Alert tone="info">Loading the calendar…</Alert>}

      {calendar && (
        <>
          <p className="text-xs text-[#5A6B85]">
            {calendar.minNoticeHours > 0
              ? `This lender needs at least ${calendar.minNoticeHours} hours notice before a pickup.`
              : "No notice is needed before a pickup."}
          </p>

          {calendar.reserved.length === 0 && calendar.windows.length === 0 ? (
            <p className="text-sm text-[#5A6B85]">Open the whole time.</p>
          ) : (
            <ul className="space-y-1 text-sm text-[#1B2A4A]">
              {calendar.reserved.map(block => (
                <li
                  key={`${block.startAt}-${block.endAt}`}
                  className="rounded-lg border border-[#D8DED8] px-3 py-2"
                >
                  Booked {date(block.startAt)} → {date(block.endAt)}
                </li>
              ))}
              {calendar.windows.map(window => (
                <li
                  key={window.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E8C8C0] px-3 py-2"
                >
                  <span className="text-[#7A2A1B]">
                    Unavailable {date(window.startsAt)} → {date(window.endsAt)}
                    {window.note ? ` · ${window.note}` : ""}
                  </span>
                  {viewerId ? (
                    <button
                      type="button"
                      className="text-xs text-[#7A2A1B] underline"
                      onClick={async () => {
                        await api.borrow.removeWindow(listingId, window.id).catch(() => undefined)
                        await load()
                      }}
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {viewerId && (
            <form
              className="space-y-2 rounded-xl border border-[#D8DED8] p-3"
              onSubmit={event => {
                event.preventDefault()
                void block()
              }}
              noValidate
            >
              <p className="text-sm font-medium text-[#1B2A4A]">Mark dates unavailable</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field id="window-start" label="From">
                  <input
                    id="window-start"
                    type="date"
                    value={start}
                    onChange={event => setStart(event.target.value)}
                    className={inputClass(null)}
                  />
                </Field>
                <Field id="window-end" label="To">
                  <input
                    id="window-end"
                    type="date"
                    value={end}
                    onChange={event => setEnd(event.target.value)}
                    className={inputClass(null)}
                  />
                </Field>
              </div>
              <Field id="window-note" label="Note (optional)">
                <input
                  id="window-note"
                  value={note}
                  onChange={event => setNote(event.target.value)}
                  placeholder="Away that week"
                  className={inputClass(null)}
                />
              </Field>
              <button type="submit" className={primaryButton()} disabled={busy}>
                {busy ? "Saving…" : "Block these dates"}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  )
}

export function date(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}