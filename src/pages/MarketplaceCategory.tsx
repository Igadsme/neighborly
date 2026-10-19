import { useEffect, useState } from "react"
import { api, ApiError } from "../api/client"
import type { ApiListing } from "../api/types"
import { mapApiListing } from "../api/listing-mapper"
import { Button, ListingCard } from "../components/ui"

type Page = "listing" | "create"

interface MarketplaceCategoryProps {
  title: string
  description: string
  categoryTerms: string[]
  onNavigate: (page: Page, listingId?: string) => void
}

export default function MarketplaceCategory({
  title,
  description,
  categoryTerms,
  onNavigate,
}: MarketplaceCategoryProps) {
  const [query, setQuery] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [listings, setListings] = useState<ApiListing[]>([])
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [categoryUnavailable, setCategoryUnavailable] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError("")
    Promise.all([api.categories.list(), api.listings.favorites()])
      .then(([categories, favorites]) => {
        if (!active) return
        const category = categories.find((item) =>
          categoryTerms.some((term) =>
            item.name.toLowerCase().includes(term.toLowerCase()),
          ),
        )
        setSavedIds(new Set(favorites.map((favorite) => favorite.listing.id)))
        setCategoryId(category?.id ?? "")
        setCategoryUnavailable(!category)
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof ApiError
              ? cause.message
              : "Marketplace data could not be loaded.",
          )
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [categoryTerms, retry])

  useEffect(() => {
    if (!categoryId) {
      setListings([])
      return
    }
    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError("")
      api.listings
        .list({ categoryId, query: query.trim() || undefined, limit: 48, sort: "newest" })
        .then((results) => active && setListings(results))
        .catch((cause: unknown) => {
          if (active)
            setError(
              cause instanceof ApiError
                ? cause.message
                : "Listings could not be loaded.",
            )
        })
        .finally(() => active && setLoading(false))
    }, 200)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [categoryId, query, retry])

  return (
    <main className="min-h-screen bg-[#FAFAF7] pb-24 md:pb-0">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#2D6A4F]">Neighborly marketplace</p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-[#1B2A4A]">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm text-[#5C6E8A]">{description}</p>
          </div>
          <Button variant="primary" size="sm" onClick={() => onNavigate("create")}>
            Post a listing
          </Button>
        </header>

        <label className="mb-6 block">
          <span className="sr-only">Search {title.toLowerCase()}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${title.toLowerCase()}…`}
            className="h-12 w-full rounded-2xl border border-[#E8E6DF] bg-white px-4 text-sm text-[#1B2A4A] placeholder:text-[#C5CCDA] focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/20 md:max-w-xl"
          />
        </label>

        {error && (
          <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E8694A]/20 bg-[#FFF5F2] p-4 text-sm text-[#C4512D]">
            <span>{error}</span>
            <button onClick={() => setRetry((value) => value + 1)} className="font-semibold underline">Retry</button>
          </div>
        )}

        {categoryUnavailable && !loading ? (
          <div className="rounded-2xl border border-dashed border-[#E8E6DF] bg-white p-8">
            <h2 className="font-semibold text-[#1B2A4A]">{title} catalog is not configured</h2>
            <p className="mt-2 text-sm text-[#5C6E8A]">
              There is no matching persisted marketplace category yet. This page does not substitute demo records for real inventory.
            </p>
          </div>
        ) : loading ? (
          <div className="listing-grid" aria-label={`Loading ${title.toLowerCase()}`}>
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-64 animate-pulse rounded-2xl bg-white" />
            ))}
          </div>
        ) : listings.length ? (
          <div className="listing-grid">
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={mapApiListing(listing, savedIds.has(listing.id))}
                onClick={() => onNavigate("listing", listing.id)}
                onSavedChange={async (saved) => {
                  const result = await api.listings.toggleFavorite(listing.id)
                  if (result.saved !== saved)
                    throw new Error("Favorite state did not match the server response.")
                  setSavedIds((current) => {
                    const next = new Set(current)
                    if (saved) next.add(listing.id)
                    else next.delete(listing.id)
                    return next
                  })
                }}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#E8E6DF] bg-white p-10 text-center">
            <h2 className="font-display text-xl font-semibold text-[#1B2A4A]">No matching listings</h2>
            <p className="mt-2 text-sm text-[#8A9AB5]">
              {query ? "Try a different search." : `No published listings are available in ${title.toLowerCase()} yet.`}
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
