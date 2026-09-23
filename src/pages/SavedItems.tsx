import { useEffect, useState } from "react"
import {
  ListingCard,
  SectionHeader,
  Badge,
  Button,
  Icon,
  EmptyState,
  TabBar,
} from "../components/ui"
import type { Listing } from "../data"
import { api, ApiError } from "../api/client"
import type { ApiSavedSearch } from "../api/types"
import { listingFromApi } from "../lib/view"

type Page = "explore" | "listing"

interface SavedItemsProps {
  onNavigate: (p: Page, id?: string) => void
}

const collections = [{ id: "all", label: "All saved" }]

export default function SavedItems({ onNavigate }: SavedItemsProps) {
  const [activeCollection, setActiveCollection] = useState("all")
  const [activeTab, setActiveTab] = useState("Saved Listings")
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [comparingIds, setComparingIds] = useState<string[]>([])
  const [savedListings, setSavedListings] = useState<Listing[]>([])
  const [savedSearches, setSavedSearches] = useState<ApiSavedSearch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    Promise.all([api.listings.favorites(), api.listings.savedSearches()])
      .then(([favorites, searches]) => {
        if (!active) return
        setSavedListings(favorites.map((favorite) => listingFromApi(favorite.listing, true)))
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
  }, [])

  const priceDropListings = savedListings

  const toggleCompare = (id: string) => {
    setComparingIds((prev) =>
      prev.includes(id)
        ? prev.filter((i) => i !== id)
        : prev.length < 3
          ? [...prev, id]
          : prev,
    )
  }

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
            {/* Collections */}
            <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide pb-1">
              {collections.map((col) => (
                <button
                  key={col.id}
                  onClick={() => setActiveCollection(col.id)}
                  className={`flex items-center gap-2 flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                    activeCollection === col.id
                      ? "bg-[#2D6A4F] text-white border-[#2D6A4F]"
                      : "bg-white text-[#5C6E8A] border-[#E8E6DF] hover:border-[#2D6A4F]/30"
                  }`}
                >
                  {col.label}
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                      activeCollection === col.id
                        ? "bg-white/20 text-white"
                        : "bg-[#F5F4EF] text-[#8A9AB5]"
                    }`}
                  >
                    {savedListings.length}
                  </span>
                </button>
              ))}
              <button className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border border-dashed border-[#E8E6DF] text-[#C5CCDA] hover:border-[#2D6A4F]/30 hover:text-[#2D6A4F] transition-all bg-white">
                <Icon name="plus" size={12} />
                New collection
              </button>
            </div>

            {/* Compare bar */}
            {comparingIds.length > 0 && (
              <div className="bg-[#1B2A4A] text-white rounded-2xl p-4 mb-6 flex items-center justify-between animate-fade-in">
                <div>
                  <p className="font-semibold text-sm">
                    Comparing {comparingIds.length} item
                    {comparingIds.length > 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-white/60">
                    Select up to 3 items to compare side-by-side
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setComparingIds([])}
                    className="text-xs text-white/60 hover:text-white"
                  >
                    Clear
                  </button>
                  <button className="bg-[#2D6A4F] text-white text-xs font-semibold px-4 py-2 rounded-xl hover:bg-[#40916C] transition-colors">
                    Compare →
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="bg-white rounded-2xl border border-[#E8E6DF] p-8 text-center text-sm text-[#8A9AB5]">
                Loading saved items…
              </div>
            ) : error ? (
              <div className="bg-[#FFF5F2] border border-[#E8694A]/20 rounded-2xl p-5 text-sm text-[#C4512D]">
                {error}
              </div>
            ) : savedListings.length > 0 ? (
              <div className="listing-grid">
                {savedListings.map((listing) => (
                  <div key={listing.id} className="relative">
                    <ListingCard
                      listing={listing}
                      onClick={() => onNavigate("listing", listing.id)}
                      onSavedChange={(saved) => {
                        api.listings
                          .toggleFavorite(listing.id)
                          .then(() => {
                            if (!saved)
                              setSavedListings((items) =>
                                items.filter((item) => item.id !== listing.id),
                              )
                          })
                          .catch((cause: unknown) => {
                            setError(
                              cause instanceof ApiError
                                ? cause.message
                                : "Could not update this saved item.",
                            )
                          })
                      }}
                    />
                    <button
                      onClick={() => toggleCompare(listing.id)}
                      className={`absolute top-2 left-2 text-xs font-semibold px-2 py-1 rounded-lg border transition-all ${
                        comparingIds.includes(listing.id)
                          ? "bg-[#1B2A4A] text-white border-[#1B2A4A]"
                          : "bg-white/90 text-[#8A9AB5] border-[#E8E6DF] hover:border-[#1B2A4A]"
                      }`}
                    >
                      {comparingIds.includes(listing.id)
                        ? "✓ Compare"
                        : "Compare"}
                    </button>
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
            ) : savedSearches.length === 0 ? (
              <EmptyState
                title="No saved searches yet"
                description="Save a search from Explore to receive matching listings."
                action={() => onNavigate("explore")}
                actionLabel="Browse listings"
                icon={<Icon name="search" size={24} />}
              />
            ) : (
              savedSearches.map((search) => (
                <div
                  key={search.query}
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
                          {typeof search.filters.neighborhood === "string"
                            ? search.filters.neighborhood
                            : "All neighborhoods"}
                        </span>
                        <span>
                          Saved{" "}
                          {new Date(search.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant="green" size="sm">
                        <Icon name="bell" size={9} /> Saved
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      size="xs"
                      onClick={() => onNavigate("explore")}
                    >
                      View results →
                    </Button>
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
            <SectionHeader
              title="Price drops"
              subtitle="Saved items that recently dropped in price"
            />
            <div className="space-y-4">
              {priceDropListings.length === 0 ? (
                <EmptyState
                  title="No price alerts yet"
                  description="Price alerts will appear when a saved listing changes price."
                  action={() => setActiveTab("Saved Listings")}
                  actionLabel="View saved listings"
                  icon={<Icon name="bell" size={24} />}
                />
              ) : (
                priceDropListings.map((listing) => (
                  <div
                    key={listing.id}
                    onClick={() => onNavigate("listing", listing.id)}
                    className="flex gap-4 bg-white rounded-2xl border border-[#E8E6DF] p-4 cursor-pointer card-hover"
                  >
                    <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-[#F5F4EF]">
                      {listing.images[0] && (
                        <img
                          src={`${
                            listing.images[0].startsWith("http")
                              ? listing.images[0]
                              : `https://images.unsplash.com/${listing.images[0]}`
                          }?w=160&h=160&fit=crop&auto=format`}
                          alt={listing.title}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-sm text-[#1B2A4A] line-clamp-1">
                        {listing.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-lg font-bold text-[#1B2A4A]">
                          ${listing.price?.toLocaleString()}
                        </span>
                        <span className="text-sm text-[#C5CCDA] line-through">
                          ${((listing.price || 0) + 100).toLocaleString()}
                        </span>
                        <Badge variant="coral" size="sm">
                          ↓ $100 off
                        </Badge>
                      </div>
                      <p className="text-xs text-[#8A9AB5] mt-1">
                        {listing.neighborhood} · {listing.distance}
                      </p>
                      <p className="text-xs text-[#E8694A] font-medium mt-1">
                        Price dropped {listing.postedAt}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* New listings alerts */}
            <SectionHeader
              title="New listing alerts"
              subtitle="New items matching your saved searches"
              className="mt-8"
            />
            <div className="bg-white rounded-2xl border border-[#E8E6DF] p-5 text-sm text-[#8A9AB5]">
              New-match alerts will appear here once saved-search notifications
              are enabled.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
