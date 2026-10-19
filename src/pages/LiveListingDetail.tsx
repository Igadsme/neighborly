import { useEffect, useState } from "react"
import { ApiError, api } from "../api/client"
import type { ApiListing } from "../api/types"

interface Props {
  listingId: string
  onNavigate: (page: string, entityId?: string, conversationId?: string) => void
}

export default function LiveListingDetail({ listingId, onNavigate }: Props) {
  const [listing, setListing] = useState<ApiListing | null>(null)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [contacting, setContacting] = useState(false)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError("")
    Promise.all([api.listings.get(listingId), api.listings.favorites()])
      .then(([detail, favorites]) => {
        if (!active) return
        setListing(detail)
        setSaved(favorites.some(item => item.listing.id === listingId))
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof ApiError ? cause.message : "Listing could not be loaded.")
      })
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [listingId, retry])

  async function toggleSaved() {
    if (saving) return
    setSaving(true)
    setError("")
    try {
      const result = await api.listings.toggleFavorite(listingId)
      setSaved(result.saved)
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "Saved status could not be updated.")
    } finally {
      setSaving(false)
    }
  }

  async function messageSeller() {
    const sellerId = listing?.seller?.id
    if (!sellerId) {
      setError("This listing does not have an available seller contact.")
      return
    }
    setContacting(true)
    setError("")
    try {
      const conversation = await api.conversations.create(sellerId)
      onNavigate("messages", undefined, conversation.id)
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "A conversation could not be started.")
    } finally {
      setContacting(false)
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-5xl animate-pulse px-4 py-8"><div className="h-80 rounded-3xl bg-white" /><div className="mt-5 h-8 w-2/3 rounded bg-white" /><div className="mt-3 h-24 rounded bg-white" /></div>
  }

  if (error && !listing) {
    return <div className="mx-auto max-w-3xl px-4 py-20 text-center"><h1 className="font-display text-2xl font-semibold text-[#1B2A4A]">Listing unavailable</h1><p role="alert" className="mt-2 text-sm text-[#C4512D]">{error}</p><button onClick={() => setRetry(value => value + 1)} className="mt-5 rounded-xl bg-[#2D6A4F] px-4 py-2 text-sm font-semibold text-white">Retry</button></div>
  }
  if (!listing) return null

  const seller = listing.seller?.profile
  const sellerName = [seller?.firstName, seller?.lastName].filter(Boolean).join(" ") || "Neighbor"
  const price = listing.priceCents == null ? "Price negotiable" : listing.priceCents === 0 ? "Free" : `$${(listing.priceCents / 100).toLocaleString()}`
  const imageUrls = listing.images?.flatMap(image => image.url ? [image.url] : []) ?? []

  return (
    <div className="min-h-screen bg-[#FAFAF7] pb-24">
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
        <button onClick={() => onNavigate("explore")} className="mb-4 text-sm font-medium text-[#2D6A4F]">← Back to Explore</button>
        {error && <p role="alert" className="mb-4 rounded-xl bg-[#FFF5F2] p-3 text-sm text-[#C4512D]">{error}</p>}
        <div className="grid gap-6 lg:grid-cols-[1fr_330px]">
          <div>
            <div className="flex h-64 items-center justify-center overflow-hidden rounded-3xl bg-[#F0F1ED] md:h-[440px]">
              {imageUrls[0] ? <img src={imageUrls[0]} alt={listing.title} className="h-full w-full object-cover" /> : <div className="text-center text-sm text-[#8A9AB5]"><span className="mb-2 block text-3xl">◇</span>Photos aren’t available for this listing yet</div>}
            </div>
            <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="rounded-lg bg-[#DDEEFF] px-2.5 py-1 text-xs font-semibold text-[#2B5F8E]">{listing.category?.name ?? "Marketplace"}</span>
                <h1 className="mt-3 font-display text-2xl font-semibold text-[#1B2A4A] md:text-3xl">{listing.title}</h1>
              </div>
              <p className="text-2xl font-bold text-[#1B2A4A]">{price}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-[#8A9AB5]">
              {listing.condition && <span>{listing.condition}</span>}
              {(listing.neighborhood || listing.city) && <span>{[listing.neighborhood, listing.city].filter(Boolean).join(", ")}</span>}
              {listing.createdAt && <span>Posted {new Date(listing.createdAt).toLocaleDateString()}</span>}
            </div>
            <section className="mt-6 rounded-2xl border border-[#E8E6DF] bg-white p-5">
              <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">Description</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[#5C6E8A]">{listing.description}</p>
            </section>
            <section className="mt-4 rounded-2xl border border-[#E8E6DF] bg-white p-5">
              <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">Seller</h2>
              <p className="mt-2 text-sm font-medium text-[#1B2A4A]">{sellerName}</p>
              <p className="mt-1 text-xs text-[#8A9AB5]">{seller?.neighborhood ?? listing.neighborhood ?? "Neighborhood not provided"}</p>
              <p className="mt-3 text-xs text-[#8A9AB5]">Trust metrics are not available yet; no unverified ratings are shown.</p>
            </section>
          </div>
          <aside className="h-fit rounded-3xl border border-[#E8E6DF] bg-white p-5 shadow-sm lg:sticky lg:top-24">
            <p className="text-2xl font-bold text-[#1B2A4A]">{price}</p>
            <p className="mt-1 text-sm text-[#8A9AB5]">Listed by {sellerName}</p>
            <button disabled={saving} onClick={() => void toggleSaved()} className="mt-5 w-full rounded-xl border border-[#E8E6DF] px-4 py-3 text-sm font-semibold text-[#5C6E8A] disabled:opacity-50">{saving ? "Updating…" : saved ? "♥ Saved" : "♡ Save listing"}</button>
            <button disabled={contacting} onClick={() => void messageSeller()} className="mt-3 w-full rounded-xl bg-[#2D6A4F] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{contacting ? "Opening conversation…" : "Message seller"}</button>
            <p className="mt-4 text-xs leading-relaxed text-[#8A9AB5]">Keep communication in Neighborly and do not share payment details or private addresses in public.</p>
          </aside>
        </div>
      </div>
    </div>
  )
}
