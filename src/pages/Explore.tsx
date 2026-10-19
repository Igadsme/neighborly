import { useEffect, useState } from "react"
import {
  ListingCard,
  Chip,
  Badge,
  Button,
  Icon,
  Toggle,
  TabBar,
} from "../components/ui"
import type { Listing } from "../data"
import { api, ApiError } from "../api/client"
import { mapApiListing } from "../api/listing-mapper"
import type { ApiSavedSearch } from "../api/types"

type Page = "listing"

interface ExploreProps {
  onNavigate: (p: Page, entityId?: string) => void
  initialCategory?: string
  initialSearch?: ApiSavedSearch | null
}

const conditions = ["Any", "New", "Like New", "Good", "Fair", "For Parts"]
const sortOptions = [
  { value: "newest", label: "Newest first" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
]

const suggestedSearches = [
  "West Elm furniture near Decatur",
  "Photography services",
  "Free items this week",
  "Apartments under $1,500",
]

export default function Explore({
  onNavigate,
  initialCategory,
  initialSearch,
}: ExploreProps) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState(initialCategory || "All")
  const [condition, setCondition] = useState("Any")
  const [minPrice, setMinPrice] = useState("")
  const [maxPrice, setMaxPrice] = useState("")
  const [distance, setDistance] = useState(10)
  const [freeOnly, setFreeOnly] = useState(false)
  const [deliveryOnly, setDeliveryOnly] = useState(false)
  const [view, setView] = useState<"grid" | "list">("grid")
  const [sort, setSort] = useState("relevance")
  const [showFilters, setShowFilters] = useState(true)
  const [searched, setSearched] = useState(true)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [alertSaved, setAlertSaved] = useState(false)
  const [savingSearch, setSavingSearch] = useState(false)
  const [liveListings, setLiveListings] = useState<Listing[]>([])
  const [categoryItems, setCategoryItems] = useState<Array<{
    id: string
    name: string
  }>>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [actionError, setActionError] = useState("")
  const [retryToken, setRetryToken] = useState(0)
  const categoryOptions = [
    "All",
    ...categoryItems.map((item) => item.name),
    "Free",
  ]

  useEffect(() => {
    api.categories
      .list()
      .then(setCategoryItems)
      .catch(() => setCategoryItems([]))
  }, [])

  useEffect(() => {
    if (!initialSearch) return
    const filters = initialSearch.filters
    const filterText = (value: unknown) =>
      typeof value === "string" || typeof value === "number"
        ? String(value)
        : ""
    const savedCondition = filterText(filters.condition)
    setQuery(initialSearch.query)
    setCategory(filterText(filters.category) || "All")
    setCondition(conditions.includes(savedCondition) ? savedCondition : "Any")
    setMinPrice(filterText(filters.minPrice))
    setMaxPrice(filterText(filters.maxPrice))
    setFreeOnly(filters.freeOnly === true)
    setDeliveryOnly(filters.deliveryOnly === true)
    setAlertSaved(false)
  }, [initialSearch])

  useEffect(() => {
    let current = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      setLoadError("")
      const selectedCategory = categoryItems.find(
        (item) => item.name.toLowerCase() === category.toLowerCase(),
      )
      Promise.all([
        api.listings.list({
          query: query.trim() || undefined,
          categoryId: selectedCategory?.id,
          minPriceCents: minPrice
            ? Math.round(Number(minPrice) * 100)
            : undefined,
          maxPriceCents: maxPrice
            ? Math.round(Number(maxPrice) * 100)
            : undefined,
          condition: condition === "Any" ? undefined : condition,
          freeOnly: freeOnly || category === "Free",
          deliveryAvailable: deliveryOnly || undefined,
          sort: sort === "price_asc" || sort === "price_desc" ? sort : "newest",
          limit: 48,
          offset: 0,
        }),
        api.listings.favorites(),
      ])
        .then(([results, favorites]) => {
          if (!current) return
          const savedIds = new Set(
            favorites.map((favorite) => favorite.listing.id),
          )
          setLiveListings(
            results.map((listing) =>
              mapApiListing(listing, savedIds.has(listing.id)),
            ),
          )
        })
        .catch((cause: unknown) => {
          if (!current) return
          setLoadError(
            cause instanceof ApiError
              ? cause.message
              : "Listings could not be loaded.",
          )
        })
        .finally(() => current && setLoading(false))
    }, 250)
    return () => {
      current = false
      window.clearTimeout(timer)
    }
  }, [
    category,
    categoryItems,
    condition,
    deliveryOnly,
    freeOnly,
    maxPrice,
    minPrice,
    query,
    retryToken,
    sort,
  ])

  const activeFilters: string[] = []
  if (category !== "All") activeFilters.push(category)
  if (condition !== "Any") activeFilters.push(condition)
  if (maxPrice) activeFilters.push(`Under $${maxPrice}`)
  if (freeOnly) activeFilters.push("Free only")
  if (deliveryOnly) activeFilters.push("Delivery available")

  const filteredListings = liveListings

  const saveCurrentSearch = async () => {
    setActionError("")
    setSavingSearch(true)
    try {
      await api.listings.saveSearch(query.trim(), {
        category,
        condition,
        minPrice,
        maxPrice,
        freeOnly,
        deliveryOnly,
      })
      setAlertSaved(true)
    } catch (cause: unknown) {
      setActionError(
        cause instanceof ApiError
          ? cause.message
          : "Search could not be saved.",
      )
    } finally {
      setSavingSearch(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] pb-24 md:pb-0">
      {/* Search header */}
      <div className="bg-white border-b border-[#E8E6DF] sticky top-16 z-40">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4">
          {/* Search input */}
          <div className="relative mb-3">
            <Icon
              name="search"
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8A9AB5] pointer-events-none"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setSearched(true)
                  setShowSuggestions(false)
                }
              }}
              placeholder="Search for anything nearby..."
              className="w-full h-12 pl-12 pr-40 bg-[#F5F4EF] rounded-2xl text-sm text-[#1B2A4A] placeholder:text-[#C5CCDA] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#2D6A4F]/20 transition-all"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <button
                type="button"
                disabled
                title="Map discovery is not available yet"
                className="flex items-center gap-1.5 text-xs font-semibold text-[#8A9AB5] bg-[#EEF0F5] px-3 py-1.5 rounded-lg cursor-not-allowed"
              >
                <Icon name="map" size={13} />
                Map unavailable
              </button>
              <button
                onClick={() => {
                  setSearched(true)
                  setShowSuggestions(false)
                }}
                className="bg-[#2D6A4F] text-white text-sm font-semibold px-4 py-1.5 rounded-xl hover:bg-[#1B4332] transition-colors"
              >
                Search
              </button>
            </div>

            {/* Suggestions dropdown */}
            {showSuggestions && !searched && (
              <div className="absolute top-14 left-0 right-0 bg-white border border-[#E8E6DF] rounded-2xl shadow-xl z-50 p-4">
                <p className="text-xs font-semibold text-[#8A9AB5] uppercase tracking-wide mb-3">
                  Example searches
                </p>
                {suggestedSearches.slice(0, 2).map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setQuery(s)
                      setSearched(true)
                      setShowSuggestions(false)
                    }}
                    className="flex items-center gap-3 w-full p-2 rounded-xl hover:bg-[#F5F4EF] text-sm text-[#1B2A4A] text-left"
                  >
                    <Icon name="search" size={13} className="text-[#C5CCDA]" />
                    {s}
                  </button>
                ))}
                <p className="text-xs font-semibold text-[#8A9AB5] uppercase tracking-wide mb-3 mt-4">
                  More examples
                </p>
                {suggestedSearches.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setQuery(s)
                      setSearched(true)
                      setShowSuggestions(false)
                    }}
                    className="flex items-center gap-3 w-full p-2 rounded-xl hover:bg-[#F5F4EF] text-sm text-[#2D6A4F] text-left"
                  >
                    <Icon name="zap" size={13} className="text-[#52B788]" />
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Category pills */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {categoryOptions.map((cat) => (
              <Chip
                key={cat}
                active={category === cat}
                onClick={() => setCategory(cat)}
              >
                {cat}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        <div className="flex gap-6">
          {/* Filters sidebar */}
          {showFilters && (
            <aside className="hidden md:block w-64 flex-shrink-0">
              <div className="bg-white rounded-2xl border border-[#E8E6DF] p-5 sticky top-40">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-semibold text-[#1B2A4A]">Filters</h3>
                  <button className="text-xs text-[#E8694A] font-medium hover:underline">
                    Clear all
                  </button>
                </div>

                {/* Price range */}
                <div className="mb-5">
                  <label className="block text-xs font-semibold text-[#5C6E8A] uppercase tracking-wide mb-3">
                    Price range
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      value={minPrice}
                      onChange={(e) => setMinPrice(e.target.value)}
                      className="flex-1 h-9 px-3 bg-[#F5F4EF] border border-[#E8E6DF] rounded-lg text-sm text-[#1B2A4A] focus:outline-none focus:border-[#2D6A4F]"
                    />
                    <span className="flex items-center text-[#C5CCDA] text-sm">
                      –
                    </span>
                    <input
                      type="number"
                      placeholder="Max"
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(e.target.value)}
                      className="flex-1 h-9 px-3 bg-[#F5F4EF] border border-[#E8E6DF] rounded-lg text-sm text-[#1B2A4A] focus:outline-none focus:border-[#2D6A4F]"
                    />
                  </div>
                </div>

                {/* Distance */}
                <div className="mb-5">
                  <label className="block text-xs font-semibold text-[#5C6E8A] uppercase tracking-wide mb-3">
                    Distance: within{" "}
                    <span className="text-[#2D6A4F]">{distance} miles</span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={50}
                    value={distance}
                    onChange={(e) => setDistance(parseInt(e.target.value))}
                    disabled
                    aria-describedby="radius-unavailable"
                    className="w-full cursor-not-allowed opacity-50"
                  />
                  <p
                    id="radius-unavailable"
                    className="mt-2 text-xs text-[#8A9AB5]"
                  >
                    Radius search needs precise location and is not available
                    yet.
                  </p>
                  <div className="flex justify-between text-xs text-[#C5CCDA] mt-1">
                    <span>1 mi</span>
                    <span>25 mi</span>
                    <span>50 mi</span>
                  </div>
                </div>

                {/* Condition */}
                <div className="mb-5">
                  <label className="block text-xs font-semibold text-[#5C6E8A] uppercase tracking-wide mb-3">
                    Condition
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {conditions.map((c) => (
                      <button
                        key={c}
                        onClick={() => setCondition(c)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                          condition === c
                            ? "bg-[#2D6A4F] text-white border-[#2D6A4F]"
                            : "bg-white text-[#5C6E8A] border-[#E8E6DF] hover:border-[#2D6A4F]/40"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Toggle filters */}
                <div className="space-y-3 border-t border-[#F5F4EF] pt-4">
                  {[
                    {
                      key: "verified",
                      label: "Verified sellers only",
                      state: false,
                      set: () => {},
                      disabled: true,
                    },
                    {
                      key: "free",
                      label: "Free items only",
                      state: freeOnly,
                      set: setFreeOnly,
                      disabled: false,
                    },
                    {
                      key: "delivery",
                      label: "Delivery available",
                      state: deliveryOnly,
                      set: setDeliveryOnly,
                      disabled: false,
                    },
                  ].map(({ key, label, state, set, disabled }) => (
                    <div
                      key={key}
                      className="flex items-center justify-between"
                    >
                      <span
                        className={`text-sm ${
                          disabled ? "text-[#8A9AB5]" : "text-[#1B2A4A]"
                        }`}
                      >
                        {label}
                        {disabled && (
                          <span className="ml-1 text-[10px]">
                            (unavailable)
                          </span>
                        )}
                      </span>
                      <Toggle
                        checked={state}
                        onChange={set}
                        disabled={disabled}
                      />
                    </div>
                  ))}
                </div>

                {/* Seller rating */}
                <div className="mt-5 border-t border-[#F5F4EF] pt-4">
                  <label className="block text-xs font-semibold text-[#5C6E8A] uppercase tracking-wide mb-3">
                    Minimum seller rating
                  </label>
                  <div className="flex gap-2">
                    {[4, 4.5, 4.8].map((r) => (
                      <button
                        key={r}
                        disabled
                        title="Seller review metrics are not available yet"
                        className="flex-1 cursor-not-allowed py-1.5 text-xs font-medium rounded-lg border border-[#E8E6DF] text-[#C5CCDA]"
                      >
                        {r}+ ★
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </aside>
          )}

          {/* Results */}
          <div className="flex-1 min-w-0">
            {/* Results header */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                {searched && (
                  <p className="text-sm text-[#5C6E8A]">
                    <span className="font-bold text-[#1B2A4A]">
                      {filteredListings.length} results
                    </span>
                    {query && (
                      <span>
                        {" "}
                        for "
                        <span className="text-[#2D6A4F] font-medium">
                          {query}
                        </span>
                        "
                      </span>
                    )}
                  </p>
                )}
                {/* Active filters */}
                {activeFilters.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {activeFilters.map((f) => (
                      <Chip
                        key={f}
                        active
                        onRemove={() => {
                          if (f === category) setCategory("All")
                          else if (f === condition) setCondition("Any")
                          else if (f.startsWith("Under $")) setMaxPrice("")
                          else if (f === "Free only") setFreeOnly(false)
                          else if (f === "Delivery available")
                            setDeliveryOnly(false)
                        }}
                      >
                        {f}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Save search */}
                <button
                  onClick={() => void saveCurrentSearch()}
                  disabled={alertSaved || savingSearch || !query.trim()}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    alertSaved
                      ? "bg-[#D8F3DC] text-[#1B4332] border-[#74C69D]"
                      : "bg-white text-[#5C6E8A] border-[#E8E6DF] hover:border-[#2D6A4F]"
                  }`}
                >
                  <Icon name="bell" size={12} />
                  {savingSearch ? "Saving…" : alertSaved ? "Search saved" : "Save search"}
                </button>

                {/* View toggle */}
                <div className="flex items-center bg-white border border-[#E8E6DF] rounded-xl p-1">
                  {(["grid", "list"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                        view === v
                          ? "bg-[#2D6A4F] text-white"
                          : "text-[#8A9AB5] hover:text-[#1B2A4A]"
                      }`}
                    >
                      <Icon name={v === "grid" ? "grid" : "list"} size={14} />
                    </button>
                  ))}
                </div>

                {/* Sort */}
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="h-9 px-3 bg-white border border-[#E8E6DF] rounded-xl text-xs font-medium text-[#1B2A4A] focus:outline-none cursor-pointer"
                >
                  {sortOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {actionError && (
              <p
                role="alert"
                className="mb-3 rounded-xl bg-[#FFF5F2] p-3 text-sm text-[#C4512D]"
              >
                {actionError}
              </p>
            )}
            {/* Grid */}
            {loading ? (
              <div
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                aria-label="Loading listings"
              >
                {[0, 1, 2, 3, 4, 5].map((item) => (
                  <div
                    key={item}
                    className="h-72 animate-pulse rounded-2xl bg-white"
                  />
                ))}
              </div>
            ) : loadError ? (
              <div
                role="alert"
                className="rounded-2xl border border-[#E8694A]/20 bg-[#FFF5F2] p-6 text-sm text-[#C4512D]"
              >
                <p>{loadError}</p>
                <button
                  onClick={() => setRetryToken((value) => value + 1)}
                  className="mt-3 font-semibold underline"
                >
                  Retry search
                </button>
              </div>
            ) : filteredListings.length > 0 ? (
              <div className={view === "list" ? "space-y-3" : "listing-grid"}>
                {filteredListings.map((listing) =>
                  view === "list" ? (
                    <div
                      key={listing.id}
                      onClick={() => onNavigate("listing", listing.id)}
                      className="flex gap-4 bg-white rounded-2xl border border-[#E8E6DF] p-4 cursor-pointer card-hover"
                    >
                      <div className="w-28 h-28 rounded-xl overflow-hidden flex-shrink-0 bg-[#F5F4EF]">
                        {listing.images[0] && (
                          <img
                            src={listing.images[0]}
                            alt={listing.title}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-semibold text-[#1B2A4A]">
                            {listing.title}
                          </h3>
                          <span className="font-bold text-[#1B2A4A] text-lg flex-shrink-0">
                            {listing.isFree ? (
                              <span className="text-[#2D6A4F]">Free</span>
                            ) : (
                              `$${listing.price?.toLocaleString()}`
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="navy" size="sm">
                            {listing.condition}
                          </Badge>
                          <span className="text-xs text-[#8A9AB5]">
                            {listing.neighborhood} · {listing.distance}
                          </span>
                        </div>
                        <p className="text-sm text-[#5C6E8A] mt-2 line-clamp-2">
                          {listing.description}
                        </p>
                        <div className="flex items-center gap-3 mt-3">
                          <div className="flex items-center gap-1.5 text-xs text-[#8A9AB5]">
                            <Icon name="eye" size={12} />
                            {listing.views} views
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-[#8A9AB5]">
                            <Icon name="heart" size={12} />
                            {listing.saves} saves
                          </div>
                          {listing.seller.verified && (
                            <Badge variant="green" size="sm">
                              Verified
                            </Badge>
                          )}
                          {listing.deliveryAvailable && (
                            <Badge variant="blue" size="sm">
                              Delivery
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <ListingCard
                      key={listing.id}
                      listing={listing}
                      onClick={() => onNavigate("listing", listing.id)}
                    />
                  ),
                )}
              </div>
            ) : (
              <div className="py-20 text-center">
                <div className="text-5xl mb-4">🔍</div>
                <h3 className="font-display text-xl font-semibold text-[#1B2A4A] mb-2">
                  No results found
                </h3>
                <p className="text-[#8A9AB5] max-w-sm mx-auto mb-6">
                  Try adjusting your search, category, or price filters. Saved searches store your query, but alerts are not delivered yet.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setFreeOnly(false)
                      setMaxPrice("")
                    }}
                  >
                    Clear filters
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void saveCurrentSearch()}
                    disabled={!query.trim() || alertSaved || savingSearch}
                  >
                    {savingSearch ? "Saving…" : alertSaved ? "Search saved" : "Save search"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
