import { useCallback, useEffect, useState, type FormEvent } from "react"
import { api, ApiError } from "../api/client"
import type { ApiTransaction, NeedRequestRecord } from "../api/types"

const modes = ["BUY", "BORROW", "RENT", "HIRE", "TRADE", "SKILL_SWAP", "FREE"] as const

export default function Requests() {
  const [items, setItems] = useState<NeedRequestRecord[]>([])
  const [transactions, setTransactions] = useState<ApiTransaction[]>([])
  const [categories, setCategories] = useState<Array<{ id: string; name: string; slug: string }>>([])
  const [userId, setUserId] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [offerRequest, setOfferRequest] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [reviewingTransaction, setReviewingTransaction] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [requests, currentUser, categoryItems, exchanges] = await Promise.all([
        api.requests.list(),
        api.auth.me(),
        api.categories.list(),
        api.transactions.list(),
      ])
      setItems(requests)
      setUserId(currentUser.id)
      setCategories(categoryItems)
      setTransactions(exchanges)
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "Requests could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSaving(true)
    setError("")
    try {
      await api.requests.create({
        categoryId: String(data.get("categoryId")),
        title: String(data.get("title")),
        description: String(data.get("description")),
        budgetCents: data.get("budget")
          ? Math.round(Number(data.get("budget")) * 100)
          : undefined,
        radiusMiles: Number(data.get("radiusMiles")) || 10,
        deadline: data.get("deadline") ? new Date(String(data.get("deadline"))).toISOString() : undefined,
        urgency: String(data.get("urgency") || ""),
        mode: String(data.get("mode")) as (typeof modes)[number],
      })
      setShowCreate(false)
      setNotice("Your need request was published.")
      await load()
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "Your request could not be published.")
    } finally {
      setSaving(false)
    }
  }

  async function submitOffer(event: FormEvent<HTMLFormElement>, requestId: string) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSaving(true)
    setError("")
    try {
      await api.requests.createOffer(requestId, {
        message: String(data.get("message")),
        amountCents: data.get("amount")
          ? Math.round(Number(data.get("amount")) * 100)
          : undefined,
      })
      setOfferRequest(null)
      setNotice("Your offer was sent to the requester.")
      await load()
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "Your offer could not be sent.")
    } finally {
      setSaving(false)
    }
  }

  async function decideOffer(offerId: string, action: "accept" | "reject") {
    setSaving(true)
    setError("")
    try {
      if (action === "accept") {
        await api.requests.acceptOffer(offerId)
        setNotice("Offer accepted. A private conversation and transaction are ready.")
      } else {
        await api.requests.rejectOffer(offerId)
        setNotice("Offer declined.")
      }
      await load()
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "The offer could not be updated.")
    } finally {
      setSaving(false)
    }
  }

  async function scheduleExchange(event: FormEvent<HTMLFormElement>, transactionId: string) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSaving(true)
    setError("")
    try {
      await api.transactions.schedule(transactionId, {
        startsAt: new Date(String(data.get("startsAt"))).toISOString(),
        locationNote: String(data.get("locationNote") || ""),
      })
      setNotice("Exchange scheduled. Both participants can now see the update.")
      await load()
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "The exchange could not be scheduled.")
    } finally {
      setSaving(false)
    }
  }

  async function advanceExchange(transaction: ApiTransaction, status: "IN_PROGRESS" | "COMPLETED") {
    setSaving(true)
    setError("")
    try {
      await api.transactions.transition(transaction.id, status)
      setNotice(status === "COMPLETED" ? "Exchange marked complete. You can now review your neighbor." : "Exchange marked in progress.")
      await load()
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "The transaction status could not be changed.")
    } finally {
      setSaving(false)
    }
  }

  async function submitReview(event: FormEvent<HTMLFormElement>, transaction: ApiTransaction, subjectId: string) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSaving(true)
    setError("")
    try {
      await api.transactions.review(transaction.id, {
        subjectId,
        rating: Number(data.get("rating")),
        body: String(data.get("body")),
      })
      setReviewingTransaction("")
      setNotice("Your review was submitted.")
      await load()
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "Your review could not be submitted.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] pb-24">
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-[#1B2A4A]">Neighbor requests</h1>
            <p className="mt-1 text-sm text-[#8A9AB5]">Tell your neighborhood what you need—or help someone find it.</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="rounded-xl bg-[#2D6A4F] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1B4332]">
            Post a request
          </button>
        </div>

        {notice && <div role="status" className="mb-4 rounded-xl border border-[#74C69D] bg-[#F0FBF3] p-3 text-sm text-[#1B4332]">{notice}</div>}
        {error && (
          <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[#E8694A]/30 bg-[#FFF5F2] p-3 text-sm text-[#C4512D]">
            <span>{error}</span><button onClick={() => void load()} className="font-semibold underline">Retry</button>
          </div>
        )}

        {transactions.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 font-display text-xl font-semibold text-[#1B2A4A]">Your exchanges</h2>
            <div className="space-y-3">
              {transactions.map(transaction => {
                const other = transaction.participants.find(participant => participant.userId !== userId)
                const reviewed = transaction.reviews.some(review => review.authorId === userId && review.subjectId === other?.userId)
                return (
                  <article key={transaction.id} className="rounded-2xl border border-[#E8E6DF] bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div><h3 className="text-sm font-semibold text-[#1B2A4A]">Exchange with a neighbor</h3><p className="mt-1 text-xs text-[#8A9AB5]">Status: {transaction.status.replace("_", " ")}</p></div>
                      {transaction.status === "SCHEDULED" && <button disabled={saving} onClick={() => void advanceExchange(transaction, "IN_PROGRESS")} className="rounded-lg bg-[#2D6A4F] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Start exchange</button>}
                      {transaction.status === "IN_PROGRESS" && <button disabled={saving} onClick={() => void advanceExchange(transaction, "COMPLETED")} className="rounded-lg bg-[#2D6A4F] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Mark complete</button>}
                      {transaction.status === "COMPLETED" && !reviewed && <button onClick={() => setReviewingTransaction(reviewingTransaction === transaction.id ? "" : transaction.id)} className="rounded-lg border border-[#2D6A4F]/30 px-3 py-2 text-xs font-semibold text-[#2D6A4F]">Leave a review</button>}
                      {reviewed && <span className="text-xs font-medium text-[#2D6A4F]">Review submitted</span>}
                    </div>
                    {transaction.appointments.map(appointment => <p key={appointment.id} className="mt-2 text-xs text-[#5C6E8A]">Scheduled {new Date(appointment.startsAt).toLocaleString()}{appointment.locationNote ? ` · ${appointment.locationNote}` : ""}</p>)}
                    {transaction.status === "ACCEPTED" && (
                      <form onSubmit={event => void scheduleExchange(event, transaction.id)} className="mt-4 grid gap-3 rounded-xl bg-[#FAFAF7] p-3 sm:grid-cols-2">
                        <label className="text-xs font-semibold text-[#5C6E8A]">Meetup date and time<input required name="startsAt" type="datetime-local" min={new Date().toISOString().slice(0, 16)} className="mt-1 block h-10 w-full rounded-lg border border-[#E8E6DF] bg-white px-2 text-sm" /></label>
                        <label className="text-xs font-semibold text-[#5C6E8A]">Public meetup note (optional)<input name="locationNote" maxLength={180} placeholder="e.g. Main entrance of the library" className="mt-1 block h-10 w-full rounded-lg border border-[#E8E6DF] bg-white px-3 text-sm" /></label>
                        <button disabled={saving} className="rounded-lg bg-[#2D6A4F] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 sm:col-span-2 sm:justify-self-end">Schedule exchange</button>
                      </form>
                    )}
                    {reviewingTransaction === transaction.id && other && (
                      <form onSubmit={event => void submitReview(event, transaction, other.userId)} className="mt-4 grid gap-3 rounded-xl bg-[#FAFAF7] p-3 sm:grid-cols-[120px_1fr_auto]">
                        <label className="text-xs font-semibold text-[#5C6E8A]">Rating<select name="rating" required className="mt-1 block h-10 w-full rounded-lg border border-[#E8E6DF] bg-white px-2 text-sm">{[5, 4, 3, 2, 1].map(rating => <option key={rating} value={rating}>{rating} stars</option>)}</select></label>
                        <label className="text-xs font-semibold text-[#5C6E8A]">Your review<textarea name="body" required minLength={3} maxLength={2000} rows={2} className="mt-1 block w-full rounded-lg border border-[#E8E6DF] bg-white p-2 text-sm" /></label>
                        <button disabled={saving} className="self-end rounded-lg bg-[#2D6A4F] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Submit review</button>
                      </form>
                    )}
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {loading ? (
          <div className="space-y-3" aria-label="Loading requests">
            {[0, 1, 2].map(item => <div key={item} className="h-36 animate-pulse rounded-2xl bg-white" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-[#E8E6DF] bg-white p-10 text-center">
            <h2 className="font-display text-xl font-semibold text-[#1B2A4A]">No open requests nearby yet</h2>
            <p className="mt-2 text-sm text-[#8A9AB5]">Start the neighborhood exchange by posting the first need.</p>
            <button onClick={() => setShowCreate(true)} className="mt-5 rounded-xl bg-[#2D6A4F] px-4 py-2.5 text-sm font-semibold text-white">Create a request</button>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map(item => {
              const mine = item.requesterId === userId
              const name = item.requester?.profile?.firstName ?? "A neighbor"
              return (
                <article key={item.id} className="rounded-2xl border border-[#E8E6DF] bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-[#F0FBF3] px-2.5 py-1 text-xs font-semibold text-[#2D6A4F]">{item.category?.name ?? "Neighbor request"}</span>
                        <span className="rounded-lg bg-[#F5F4EF] px-2.5 py-1 text-xs font-semibold text-[#5C6E8A]">{item.mode.replace("_", " ")}</span>
                        {item.urgency && <span className="text-xs text-[#C4512D]">{item.urgency}</span>}
                      </div>
                      <h2 className="font-display text-xl font-semibold text-[#1B2A4A]">{item.title}</h2>
                    </div>
                    {item.budgetCents != null && <p className="text-lg font-bold text-[#1B2A4A]">Up to ${(item.budgetCents / 100).toLocaleString()}</p>}
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[#5C6E8A]">{item.description}</p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#F5F4EF] pt-3 text-xs text-[#8A9AB5]">
                    <span>{mine ? "Your request" : `${name} · ${item.requester?.profile?.neighborhood ?? "Nearby"}`} · within {item.radiusMiles} mi</span>
                    {item.deadline && <span>Needed by {new Date(item.deadline).toLocaleDateString()}</span>}
                    {!mine && <button onClick={() => setOfferRequest(offerRequest === item.id ? null : item.id)} className="rounded-lg bg-[#E8694A] px-3 py-2 font-semibold text-white">Make an offer</button>}
                  </div>
                  {!mine && offerRequest === item.id && (
                    <form className="mt-4 grid gap-3 rounded-xl bg-[#FAFAF7] p-4" onSubmit={event => void submitOffer(event, item.id)}>
                      <label className="text-xs font-semibold text-[#5C6E8A]">Offer amount (optional)
                        <input name="amount" type="number" min="0" step="0.01" className="mt-1 block h-10 w-full rounded-lg border border-[#E8E6DF] bg-white px-3 text-sm" />
                      </label>
                      <label className="text-xs font-semibold text-[#5C6E8A]">Message
                        <textarea name="message" required minLength={2} rows={3} className="mt-1 block w-full rounded-lg border border-[#E8E6DF] bg-white p-3 text-sm" placeholder="How can you help?" />
                      </label>
                      <button disabled={saving} className="justify-self-end rounded-lg bg-[#2D6A4F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Sending…" : "Send offer"}</button>
                    </form>
                  )}
                  {mine && Boolean(item.offers?.length) && (
                    <div className="mt-4 space-y-2 border-t border-[#F5F4EF] pt-4">
                      <h3 className="text-sm font-semibold text-[#1B2A4A]">Offers ({item.offers?.length})</h3>
                      {item.offers?.map(offer => (
                        <div key={offer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#FAFAF7] p-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#1B2A4A]">{offer.offerer?.profile?.firstName ?? "Neighbor"}{offer.amountCents != null ? ` · $${(offer.amountCents / 100).toFixed(2)}` : ""}</p>
                            <p className="text-sm text-[#5C6E8A]">{offer.message}</p>
                            <p className="mt-1 text-xs text-[#8A9AB5]">{offer.status}</p>
                          </div>
                          {(offer.status === "PENDING" || offer.status === "COUNTERED") && (
                            <div className="flex gap-2">
                              <button disabled={saving} onClick={() => void decideOffer(offer.id, "reject")} className="rounded-lg border border-[#E8E6DF] px-3 py-2 text-xs font-semibold text-[#5C6E8A] disabled:opacity-50">Decline</button>
                              <button disabled={saving} onClick={() => void decideOffer(offer.id, "accept")} className="rounded-lg bg-[#2D6A4F] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Accept</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-3 md:items-center">
          <form onSubmit={event => void createRequest(event)} className="max-h-[90vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold text-[#1B2A4A]">Post a need request</h2>
              <button type="button" onClick={() => setShowCreate(false)} aria-label="Close" className="text-xl text-[#8A9AB5]">×</button>
            </div>
            <label className="block text-xs font-semibold text-[#5C6E8A]">What do you need?
              <input name="title" required minLength={3} maxLength={140} className="mt-1 block h-10 w-full rounded-lg border border-[#E8E6DF] px-3 text-sm" />
            </label>
            <label className="block text-xs font-semibold text-[#5C6E8A]">Details
              <textarea name="description" required minLength={10} rows={4} className="mt-1 block w-full rounded-lg border border-[#E8E6DF] p-3 text-sm" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-[#5C6E8A]">Category
                <select name="categoryId" required className="mt-1 block h-10 w-full rounded-lg border border-[#E8E6DF] px-2 text-sm">
                  <option value="">Choose</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-[#5C6E8A]">Exchange type
                <select name="mode" className="mt-1 block h-10 w-full rounded-lg border border-[#E8E6DF] px-2 text-sm">{modes.map(mode => <option key={mode} value={mode}>{mode.replace("_", " ")}</option>)}</select>
              </label>
              <label className="text-xs font-semibold text-[#5C6E8A]">Budget (optional)
                <input name="budget" type="number" min="0" step="0.01" className="mt-1 block h-10 w-full rounded-lg border border-[#E8E6DF] px-3 text-sm" />
              </label>
              <label className="text-xs font-semibold text-[#5C6E8A]">Radius (miles)
                <input name="radiusMiles" type="number" min="1" max="100" defaultValue="10" className="mt-1 block h-10 w-full rounded-lg border border-[#E8E6DF] px-3 text-sm" />
              </label>
              <label className="text-xs font-semibold text-[#5C6E8A]">Needed by (optional)
                <input name="deadline" type="datetime-local" className="mt-1 block h-10 w-full rounded-lg border border-[#E8E6DF] px-2 text-sm" />
              </label>
              <label className="text-xs font-semibold text-[#5C6E8A]">Urgency
                <select name="urgency" className="mt-1 block h-10 w-full rounded-lg border border-[#E8E6DF] px-2 text-sm"><option value="">Flexible</option><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-[#E8E6DF] px-4 py-2 text-sm font-semibold text-[#5C6E8A]">Cancel</button>
              <button disabled={saving || categories.length === 0} className="rounded-lg bg-[#2D6A4F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Publishing…" : "Publish request"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
