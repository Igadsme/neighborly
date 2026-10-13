import { useCallback, useEffect, useState } from "react"
import { api, readError, readStatus } from "../../api/client"
import type {
  ApiRequestDetail,
  ApiRequestSummary,
  ApiScopedOffer,
  RequestMatch,
  RequestStatusEvent,
} from "../../api/types"
import {
  Alert,
  Field,
  inputClass,
  primaryButton,
  ScreenTitle,
  secondaryButton,
} from "../../components/account-ui"
import { StatusPill, formatBudget } from "./RequestFeed"

interface RequestDetailProps {
  requestId: string
  viewerId: string | null
  onNavigate: (page: string, id?: string) => void
}

/**
 * One request, with the actions the caller is actually allowed to take.
 * Ownership is decided by the API, so the screen simply hides what does not
 * apply rather than pretending a control would succeed.
 */
export default function RequestDetail({ requestId, viewerId, onNavigate }: RequestDetailProps) {
  const [request, setRequest] = useState<ApiRequestDetail | null>(null)
  const [offers, setOffers] = useState<ApiScopedOffer[] | null>(null)
  const [matches, setMatches] = useState<RequestMatch[] | null>(null)
  const [history, setHistory] = useState<RequestStatusEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [offerMessage, setOfferMessage] = useState("")
  const [offerAmount, setOfferAmount] = useState("")
  const [offerError, setOfferError] = useState<string | null>(null)
  const [compare, setCompare] = useState<string[]>([])

  const load = useCallback(async () => {
    setError(null)
    try {
      const detail = await api.requests.get(requestId)
      setRequest(detail as ApiRequestDetail)
      if (viewerId) {
        // Both reads are authorized endpoints; a 403 simply means the caller
        // is neither the requester nor an offerer, which is not an error
        // worth shouting about on this screen.
        const [received, history] = await Promise.all([
          api.requests.offersForRequest(requestId).catch(() => [] as ApiScopedOffer[]),
          api.requests.statusHistory(requestId).catch(() => [] as RequestStatusEvent[]),
        ])
        setOffers(received)
        setHistory(history)
      }
    } catch (cause) {
      setError(readStatus(cause, "That request could not be loaded."))
      setRequest(null)
    }
  }, [requestId, viewerId])

  useEffect(() => {
    void load()
  }, [load])

  async function transition(action: () => Promise<ApiRequestSummary>) {
    setBusy(true)
    setError(null)
    setNotice("")
    try {
      await action()
      await load()
      setNotice("Request updated.")
    } catch (cause) {
      setError(readStatus(cause, "That change could not be applied."))
    } finally {
      setBusy(false)
    }
  }

  async function loadMatches() {
    setBusy(true)
    setError(null)
    try {
      const rows = await api.requests.matches(requestId, 20)
      setMatches(rows)
      if (rows.length === 0) setNotice("No listings match this request right now.")
    } catch (cause) {
      setError(readStatus(cause, "Matches could not be computed."))
    } finally {
      setBusy(false)
    }
  }

  async function submitOffer(event: React.FormEvent) {
    event.preventDefault()
    setOfferError(null)
    if (offerMessage.trim().length < 2) {
      setOfferError("Tell the requester what you are offering.")
      return
    }
    const amount = offerAmount.trim() === "" ? undefined : Number(offerAmount)
    if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) {
      setOfferError("Amount must be a positive number.")
      return
    }
    setBusy(true)
    try {
      await api.requests.createOffer(requestId, {
        message: offerMessage.trim(),
        ...(amount !== undefined ? { amountCents: Math.round(amount * 100) } : {}),
      })
      setOfferMessage("")
      setOfferAmount("")
      setNotice("Offer sent.")
      await load()
    } catch (cause) {
      setOfferError(readStatus(cause, "That offer could not be sent."))
    } finally {
      setBusy(false)
    }
  }

  async function decide(offer: ApiScopedOffer, action: "accept" | "reject") {
    setBusy(true)
    setError(null)
    setNotice("")
    try {
      if (action === "accept") {
        await api.requests.acceptOffer(requestId, offer.id)
        setNotice("Offer accepted. A conversation and transaction were created.")
      } else {
        await api.requests.rejectOffer(requestId, offer.id)
        setNotice("Offer declined.")
      }
      setCompare([])
      await load()
    } catch (cause) {
      setError(readStatus(cause, "That offer could not be updated."))
    } finally {
      setBusy(false)
    }
  }

  if (error && !request) {
    return (
      <section className="mx-auto w-full max-w-3xl px-6 py-16 space-y-6">
        <ScreenTitle title="Request unavailable" />
        <Alert tone="error">{error}</Alert>
        <button type="button" className={secondaryButton()} onClick={() => onNavigate("requests")}>
          Back to requests
        </button>
      </section>
    )
  }

  if (!request) {
    return (
      <section className="mx-auto w-full max-w-3xl px-6 py-16">
        <Alert tone="info">Loading request…</Alert>
      </section>
    )
  }

  const owner = viewerId && request.requester?.id === viewerId
  const status = request.status ?? "PUBLISHED"
  const canOffer = status === "PUBLISHED" && !owner && viewerId

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-12 space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold text-[#1B2A4A]">{request.title}</h1>
          <StatusPill status={status} />
        </div>
        <p className="text-sm text-[#5A6B85]">
          Posted by {request.requester?.profile?.displayName || request.requester?.profile?.firstName || "a neighbor"}
          {request.category?.name ? ` · ${request.category.name}` : ""}
        </p>
      </header>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <section className="rounded-2xl border border-[#E8E6DF] bg-white p-5 space-y-3">
        <p className="whitespace-pre-wrap text-sm text-[#1B2A4A]">{request.description}</p>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[#5A6B85]">
          <div>
            <dt className="inline font-medium text-[#1B2A4A]">Budget: </dt>
            <dd className="inline">{formatBudget(request as ApiRequestSummary)}</dd>
          </div>
          {request.neighborhood && (
            <div>
              <dt className="inline font-medium text-[#1B2A4A]">Near: </dt>
              <dd className="inline">{request.neighborhood}</dd>
            </div>
          )}
          {request.deadline && (
            <div>
              <dt className="inline font-medium text-[#1B2A4A]">Needed by: </dt>
              <dd className="inline">{new Date(request.deadline).toLocaleDateString()}</dd>
            </div>
          )}
          {request.urgency && (
            <div>
              <dt className="inline font-medium text-[#1B2A4A]">Urgency: </dt>
              <dd className="inline">{request.urgency}</dd>
            </div>
          )}
          {/* The requester sees a coarse area only; exact coordinates are
              never sent to any client. */}
          {request.approximateLocation && (
            <div>
              <dt className="inline font-medium text-[#1B2A4A]">Approximate area: </dt>
              <dd className="inline">
                {request.approximateLocation.lat.toFixed(1)}, {request.approximateLocation.lng.toFixed(1)}
              </dd>
            </div>
          )}
        </dl>
      </section>

      {owner && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">Manage</h2>
          <div className="flex flex-wrap gap-2">
            {status === "DRAFT" && (
              <Action label="Publish" disabled={busy} onClick={() => transition(() => api.requests.publish(request.id))} />
            )}
            {status === "PUBLISHED" && (
              <>
                <Action label="Pause" disabled={busy} onClick={() => transition(() => api.requests.pause(request.id))} />
                <Action label="Mark fulfilled" disabled={busy} onClick={() => transition(() => api.requests.fulfill(request.id))} />
                <Action label="Cancel" danger disabled={busy} onClick={() => transition(() => api.requests.cancel(request.id))} />
              </>
            )}
            {status === "PAUSED" && (
              <Action label="Resume" disabled={busy} onClick={() => transition(() => api.requests.resume(request.id))} />
            )}
            <Action label="Edit" disabled={busy} onClick={() => onNavigate("request-edit", request.id)} />
            <Action label="Find matching listings" disabled={busy} onClick={loadMatches} />
          </div>

          {history.length > 0 && (
            <details className="rounded-xl border border-[#D8DED8] bg-white p-4">
              <summary className="cursor-pointer text-sm font-medium text-[#1B2A4A]">
                Status history ({history.length})
              </summary>
              <ol className="mt-3 space-y-1 text-xs text-[#5A6B85]">
                {history.map((entry, index) => (
                  <li key={index}>
                    {new Date(entry.createdAt).toLocaleString()} — {entry.toStatus}
                    {entry.note ? ` (${entry.note})` : ""}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </section>
      )}

      {matches && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">
            Recommended matches
          </h2>
          {matches.length === 0 ? (
            <Alert tone="info">No listings match this request right now.</Alert>
          ) : (
            <ul className="space-y-3">
              {matches.map(match => (
                <li
                  key={match.listingId}
                  className="rounded-2xl border border-[#E8E6DF] bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-[#1B2A4A]">{match.listing.title}</p>
                      <p className="text-xs text-[#5A6B85]">{match.listing.neighborhood ?? "Nearby"}</p>
                    </div>
                    <span className="rounded-full bg-[#EEF6F1] px-2.5 py-1 text-xs font-semibold text-[#1E4A36]">
                      {match.score}% match
                    </span>
                  </div>
                  {/* Explainable ranking: the API returns the signals that
                      produced the score rather than a bare number. */}
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {match.reasons.map(reason => (
                      <li
                        key={reason}
                        className="rounded-full border border-[#D8DED8] px-2 py-0.5 text-[11px] text-[#5A6B85]"
                      >
                        {reason}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="mt-3 rounded-xl border border-[#D8DED8] px-3 py-1.5 text-sm hover:bg-[#F4F6F2]"
                    onClick={() => onNavigate("listing", match.listingId)}
                  >
                    View listing
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {canOffer && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">Make an offer</h2>
          <form onSubmit={submitOffer} className="space-y-4" noValidate>
            <Field id="offer-amount" label="Amount ($)">
              <input
                id="offer-amount"
                inputMode="decimal"
                value={offerAmount}
                onChange={event => setOfferAmount(event.target.value)}
                className={inputClass(null)}
              />
            </Field>
            <Field id="offer-message" label="Message to the requester" error={offerError}>
              <textarea
                id="offer-message"
                rows={3}
                value={offerMessage}
                onChange={event => setOfferMessage(event.target.value)}
                aria-invalid={Boolean(offerError)}
                className={inputClass(offerError)}
              />
            </Field>
            <button type="submit" className={primaryButton()} disabled={busy}>
              {busy ? "Sending…" : "Send offer"}
            </button>
          </form>
        </section>
      )}

      {offers && offers.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">
            {owner ? `Offers received (${offers.length})` : "Your offer"}
          </h2>
          <ul className="space-y-3">
            {offers.map(offer => (
              <li key={offer.id} className="rounded-2xl border border-[#E8E6DF] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[#1B2A4A]">
                      {offer.amountCents != null ? `$${(offer.amountCents / 100).toFixed(2)}` : "Open amount"}
                    </p>
                    {owner && (
                      <p className="text-xs text-[#5A6B85]">
                        From{" "}
                        {offer.offerer?.profile?.displayName ||
                          offer.offerer?.profile?.firstName ||
                          "a neighbor"}
                      </p>
                    )}
                  </div>
                  <span className="rounded-full bg-[#F1F3EF] px-2.5 py-1 text-xs font-semibold text-[#5A6B85]">
                    {offer.status}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[#1B2A4A]">{offer.message}</p>
                {owner && (offer.status === "PENDING" || offer.status === "COUNTERED") && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-[#5A6B85]">
                      <input
                        type="checkbox"
                        checked={compare.includes(offer.id)}
                        onChange={event =>
                          setCompare(current =>
                            event.target.checked
                              ? [...current, offer.id]
                              : current.filter(id => id !== offer.id),
                          )
                        }
                        className="h-4 w-4 accent-[#2D6A4F]"
                      />
                      Compare
                    </label>
                    <Action label="Accept" disabled={busy} onClick={() => decide(offer, "accept")} />
                    <Action label="Decline" disabled={busy} onClick={() => decide(offer, "reject")} />
                  </div>
                )}
                {!owner && (offer.status === "PENDING" || offer.status === "COUNTERED") && (
                  <div className="mt-3">
                    <Action
                      label="Withdraw offer"
                      danger
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true)
                        try {
                          await api.requests.withdrawOffer(offer.id)
                          await load()
                        } catch (cause) {
                          setError(readError(cause, "That offer could not be withdrawn."))
                        } finally {
                          setBusy(false)
                        }
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>

          {owner && compare.length > 1 && (
            <div className="rounded-2xl border border-[#D8DED8] bg-white p-4">
              <h3 className="font-display text-base font-semibold text-[#1B2A4A]">
                Comparing {compare.length} offers
              </h3>
              <ul className="mt-2 space-y-1 text-sm text-[#5A6B85]">
                {compare.map(id => {
                  const offer = offers.find(row => row.id === id)
                  if (!offer) return null
                  return (
                    <li key={id}>
                      {offer.amountCents != null ? `$${(offer.amountCents / 100).toFixed(2)}` : "Open"} —{" "}
                      {offer.message.slice(0, 60)}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </section>
      )}
    </section>
  )
}

function Action({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        danger
          ? "rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          : "rounded-lg border border-[#D8DED8] px-3 py-1.5 text-sm text-[#1B2A4A] hover:bg-[#F4F6F2] disabled:opacity-50"
      }
    >
      {label}
    </button>
  )
}