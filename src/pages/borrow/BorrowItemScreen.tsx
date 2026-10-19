import { useCallback, useEffect, useState } from "react"
import { api, readStatus } from "../../api/client"
import type { BorrowableItem } from "../../api/types"
import {
  Alert,
  Field,
  inputClass,
  primaryButton,
  ScreenTitle,
  secondaryButton
} from "../../components/account-ui"
import { AvailabilityCalendar, date } from "./BorrowMarketplace"

interface BorrowItemScreenProps {
  listingId: string
  viewerId: string | null
  onNavigate: (page: string, id?: string) => void
}

/**
 * One borrowable item, with the request form the borrower needs and the
 * lifecycle controls the owner needs. Which controls appear is decided by
 * the server's state and by the caller's role, so nothing on this screen
 * offers an action the API would refuse.
 */
export default function BorrowItemScreen({
  listingId,
  viewerId,
  onNavigate
}: BorrowItemScreenProps) {
  const [item, setItem] = useState<BorrowableItem | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [startAt, setStartAt] = useState(defaultStart())
  const [endAt, setEndAt] = useState(defaultEnd())
  const [message, setMessage] = useState("")

  const load = useCallback(async () => {
    try {
      setItem(await api.borrow.item(listingId))
      setError(null)
    } catch (cause) {
      setError(readStatus(cause, "That item could not be loaded."))
      setItem(null)
    }
  }, [listingId])

  useEffect(() => {
    void load()
  }, [load])

  async function submitRequest(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!startAt || !endAt) {
      setError("Choose both a pickup and a return date.")
      return
    }
    if (new Date(endAt) <= new Date(startAt)) {
      setError("The return date must be after the pickup date.")
      return
    }
    setBusy(true)
    try {
      const created = await api.borrow.createRequest(listingId, {
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        message: message || undefined
      })
      onNavigate("borrow-detail", created.id)
    } catch (cause) {
      setError(readStatus(cause, "That request could not be sent."))
    } finally {
      setBusy(false)
    }
  }

  async function publishChange(publish: boolean) {
    setBusy(true)
    setError(null)
    try {
      await (publish ? api.borrow.publish(item!.id) : api.borrow.unpublish(item!.id))
      setNotice(publish ? "Your item is listed." : "Your item is hidden from the marketplace.")
      await load()
    } catch (cause) {
      setError(readStatus(cause, "That change could not be applied."))
    } finally {
      setBusy(false)
    }
  }

  if (error && !item) {
    return (
      <section className="mx-auto w-full max-w-3xl px-6 py-16 space-y-4">
        <ScreenTitle title="Item unavailable" />
        <Alert tone="error">{error}</Alert>
        <button type="button" className={secondaryButton()} onClick={() => onNavigate("borrow")}>
          Back to borrow
        </button>
      </section>
    )
  }

  if (!item) {
    return (
      <section className="mx-auto w-full max-w-3xl px-6 py-16">
        <Alert tone="info">Loading item…</Alert>
      </section>
    )
  }

  const isOwner = Boolean(viewerId && item.sellerId === viewerId)
  const canRequest = Boolean(viewerId) && !isOwner && item.status === "PUBLISHED"

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-12 space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold text-[#1B2A4A]">{item.title}</h1>
          <span className="rounded-full bg-[#EEF6F1] px-2.5 py-1 text-xs font-semibold text-[#1E4A36]">
            {item.status === "PUBLISHED" ? "Available" : "Not listed"}
          </span>
        </div>
        <p className="text-sm text-[#5A6B85]">
          Lent by{" "}
          <button
            type="button"
            className="underline"
            onClick={() => onNavigate("profile", item.sellerId)}
          >
            {item.seller?.profile?.displayName || item.seller?.profile?.firstName || "a neighbor"}
          </button>
          {item.neighborhood ? ` · ${item.neighborhood}` : ""}
        </p>
      </header>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <section className="rounded-2xl border border-[#E8E6DF] bg-white p-5 space-y-3">
        <p className="whitespace-pre-wrap text-sm text-[#1B2A4A]">{item.description}</p>
        {item.usageInstructions && (
          <div>
            <h2 className="text-sm font-semibold text-[#1B2A4A]">Usage instructions</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm text-[#5A6B85]">{item.usageInstructions}</p>
          </div>
        )}
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[#5A6B85]">
          {item.condition && (
            <div>
              <dt className="inline font-medium text-[#1B2A4A]">Condition: </dt>
              <dd className="inline">{item.condition.replace(/_/g, " ")}</dd>
            </div>
          )}
          {item.maxBorrowDays != null && (
            <div>
              <dt className="inline font-medium text-[#1B2A4A]">Maximum: </dt>
              <dd className="inline">{item.maxBorrowDays} days</dd>
            </div>
          )}
          {item.depositCents != null && item.depositCents > 0 && (
            <div>
              <dt className="inline font-medium text-[#1B2A4A]">Deposit: </dt>
              {/* Stated for transparency only; Neighborly never takes payment. */}
              <dd className="inline">${(item.depositCents / 100).toFixed(0)}, agreed in person</dd>
            </div>
          )}
          {item.approximateLocation && (
            <div>
              <dt className="inline font-medium text-[#1B2A4A]">Approximate area: </dt>
              <dd className="inline">
                {item.approximateLocation.lat.toFixed(1)}, {item.approximateLocation.lng.toFixed(1)}
              </dd>
            </div>
          )}
        </dl>
      </section>

      <AvailabilityCalendar listingId={item.id} viewerId={isOwner ? viewerId : null} onChanged={load} />

      {isOwner && (
        <section className="space-y-2">
          <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">Manage your item</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={secondaryButton()}
              disabled={busy}
              onClick={() => publishChange(item.status !== "PUBLISHED")}
            >
              {item.status === "PUBLISHED" ? "Unpublish" : "Publish"}
            </button>
            <button
              type="button"
              className={secondaryButton()}
              disabled={busy}
              onClick={() => onNavigate("borrow-edit", item.id)}
            >
              Edit details
            </button>
            <button
              type="button"
              className={secondaryButton()}
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await api.borrow.archive(item.id)
                  onNavigate("borrow-mine")
                } catch (cause) {
                  setError(readStatus(cause, "That item could not be archived."))
                } finally {
                  setBusy(false)
                }
              }}
            >
              Archive
            </button>
          </div>
        </section>
      )}

      {canRequest && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">Request to borrow</h2>
          <form onSubmit={submitRequest} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="borrow-start" label="Pick up on">
                <input
                  id="borrow-start"
                  type="date"
                  value={startAt}
                  min={defaultStart()}
                  onChange={event => setStartAt(event.target.value)}
                  className={inputClass(null)}
                />
              </Field>
              <Field id="borrow-end" label="Return by">
                <input
                  id="borrow-end"
                  type="date"
                  value={endAt}
                  min={startAt || defaultStart()}
                  onChange={event => setEndAt(event.target.value)}
                  className={inputClass(null)}
                />
              </Field>
            </div>
            <Field id="borrow-message" label="Message to the lender (optional)">
              <textarea
                id="borrow-message"
                rows={3}
                value={message}
                onChange={event => setMessage(event.target.value)}
                placeholder="What you are working on, and when you can collect."
                className={inputClass(null)}
              />
            </Field>
            <p className="text-xs text-[#5A6B85]">
              Borrowing {date(startAt)} → {date(endAt)}.
              {item.maxBorrowDays != null ? ` Up to ${item.maxBorrowDays} days.` : ""}
            </p>
            <button type="submit" className={primaryButton()} disabled={busy}>
              {busy ? "Sending…" : "Send request"}
            </button>
          </form>
        </section>
      )}

      {!viewerId && (
        <Alert tone="info">Sign in to request this item.</Alert>
      )}
    </section>
  )
}

function isoDay(offset: number) {
  const date = new Date(Date.now() + offset * 86_400_000)
  return date.toISOString().slice(0, 10)
}

function defaultStart() {
  return isoDay(2)
}

function defaultEnd() {
  return isoDay(5)
}