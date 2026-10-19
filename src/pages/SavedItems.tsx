import { useEffect, useState } from "react"
import {
  ListingCard,
  Badge,
  Button,
  Icon,
  EmptyState,
  TabBar,
} from "../components/ui"
import type { Listing } from "../data"
import { api, ApiError } from "../api/client"
import type { ApiFavorite, ApiSavedSearch } from "../api/types"
import { mapApiListing } from "../api/listing-mapper"

type Page = "explore" | "listing"

interface SavedItemsProps {
  onNavigate: (p: Page, entityId?: string) => void
  onRunSavedSearch: (search: ApiSavedSearch) => void
}

export default function SavedItems({
  onNavigate,
  onRunSavedSearch,
}: SavedItemsProps) {
  const [activeTab, setActiveTab] = useState("Saved Listings")
  const [savedListings, setSavedListings] = useState<Listing[]>([])
  const [savedSearches, setSavedSearches] = useState<ApiSavedSearch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [retryToken, setRetryToken] = useState(0)
  const [busySearchId, setBusySearchId] = useState("")

  async function removeSavedSearch(search: ApiSavedSearch) {
    setBusySearchId(search.id)
    setError("")
    try {
      await api.listings.deleteSavedSearch(search.id)
      setSavedSearches((current) =>
        current.filter((item) => item.id !== search.id),
      )
    } catch (cause: unknown) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Saved search could not be removed.",
      )
    } finally {
      setBusySearchId("")
    }
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    setError("")
    Promise.all([api.listings.favorites(), api.listings.savedSearches()])
      .then(([favorites, searches]) => {
        if (!active) return
        setSavedListings(favorites.map((favorite) => mapApiListing(favorite.listing, true)))
        setSavedSearches(searches)
      })
      .catch((cause: unknown) => {
        if (!active) return
        setError(
          cause instanceof ApiError
            ? cause.message
            : "Saved items could not be loaded.",
        )
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [retryToken])

  return (
    <div className="min-h-screen bg-[#FAFAF7] pb-24 md:pb-0">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-semibold text-[#1B2A4A]">
              Saved items
            </h1>
            <p className="text-[#8A9AB5] mt-1">
              {savedListings.length} items saved · {savedSearches.length} saved
              searches
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate("explore")}
          >
            <Icon name="plus" size={13} />
            Browse more
          </Button>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <TabBar
            tabs={["Saved Listings", "Saved Searches", "Price Alerts"]}
            active={activeTab}
            onChange={setActiveTab}
          />
        </div>

        {/* Saved Listings tab */}
        {activeTab === "Saved Listings" && (
          <>
            {loading ? (
              <div className="bg-white rounded-2xl border border-[#E8E6DF] p-8 text-center text-sm text-[#8A9AB5]">
                Loading saved items…
              </div>
            ) : error ? (
              <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-[#E8694A]/20 bg-[#FFF5F2] p-5 text-sm text-[#C4512D]">
                <span>{error}</span>
                <button onClick={() => setRetryToken((token) => token + 1)} className="font-semibold underline">
                  Retry
                </button>
              </div>
            ) : savedListings.length > 0 ? (
              <div className="listing-grid">
                {savedListings.map((listing) => (
                  <div key={listing.id} className="relative">
                    <ListingCard
                      listing={listing}
                      onClick={() => onNavigate("listing", listing.id)}
                      onSavedChange={async (saved) => {
                        try {
                          const result = await api.listings.toggleFavorite(
                            listing.id,
                          )
                          if (result.saved !== saved)
                            throw new Error("Favorite state mismatch")
                          if (!saved)
                            setSavedListings((items) =>
                              items.filter((item) => item.id !== listing.id),
                            )
                        } catch (cause: unknown) {
                          setError(
                            cause instanceof ApiError
                              ? cause.message
                              : "Could not update this saved item.",
                          )
                          throw cause
                        }
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No saved listings yet"
                description="Browse listings and tap the heart icon to save items you love. They'll appear here."
                action={() => onNavigate("explore")}
                actionLabel="Browse listings"
                icon={<Icon name="heart" size={24} />}
              />
            )}
          </>
        )}

        {/* Saved Searches tab */}
        {activeTab === "Saved Searches" && (
          <div className="space-y-3">
            {loading ? (
              <div className="bg-white rounded-2xl border border-[#E8E6DF] p-8 text-center text-sm text-[#8A9AB5]">
                Loading saved searches…
              </div>
            ) : error ? (
              <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-[#E8694A]/20 bg-[#FFF5F2] p-5 text-sm text-[#C4512D]">
                <span>{error}</span>
                <button onClick={() => setRetryToken((token) => token + 1)} className="font-semibold underline">
                  Retry
                </button>
              </div>
            ) : savedSearches.length === 0 ? (
              <EmptyState
                title="No saved searches yet"
                description="Save search metadata from Explore. New-match notifications are not available yet."
                action={() => onNavigate("explore")}
                actionLabel="Browse listings"
                icon={<Icon name="search" size={24} />}
              />
            ) : (
              savedSearches.map((search) => (
                <div
                  key={search.id}
                  className="bg-white rounded-2xl border border-[#E8E6DF] p-5"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon
                          name="search"
                          size={13}
                          className="text-[#8A9AB5]"
                        />
                        <p className="font-semibold text-sm text-[#1B2A4A]">
                          "{search.query}"
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[#8A9AB5]">
                        <span className="flex items-center gap-1">
                          <Icon name="mapPin" size={10} />
                          {typeof search.filters.category === "string"
                            ? search.filters.category
                            : "All categories"}
                        </span>
                        <span>
                          Saved{" "}
                          {new Date(search.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant="green" size="sm">Saved search</Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="primary" size="xs" onClick={() => onRunSavedSearch(search)}>
                      Restore search
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      loading={busySearchId === search.id}
                      disabled={Boolean(busySearchId)}
                      onClick={() => void removeSavedSearch(search)}
                    >
                      Remove
                    </Button>
                    <span className="self-center text-xs text-[#8A9AB5]">
                      New-match alerts are not available.
                    </span>
                  </div>
                </div>
              ))
            )}

            <div className="text-center pt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate("explore")}
              >
                <Icon name="plus" size={14} />
                Save a new search
              </Button>
            </div>
          </div>
        )}

        {/* Price Alerts tab */}
        {activeTab === "Price Alerts" && (
          <div>
            <div className="rounded-2xl border border-[#E8E6DF] bg-white p-8">
              <h2 className="font-display text-xl font-semibold text-[#1B2A4A]">
                Price and match alerts are unavailable
              </h2>
              <p className="mt-2 text-sm text-[#5C6E8A]">
                Neighborly does not yet record price history or deliver saved-search notifications. Saved listings remain available in the Saved Listings tab.
              </p>
              <Button variant="soft" size="xs" className="mt-4" onClick={() => setActiveTab("Saved Listings")}>
                View saved listings
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
