import { useEffect, useState } from 'react'
import { ListingCard, Chip, Badge, Button, Icon, Toggle } from '../components/ui'
import type { Listing } from '../data'
import { api, readError, readStatus } from '../api/client'
import type { ListingQueryParams } from '../api/types'
import { listingFromApi, mediaSrc } from '../lib/view'

type Page = 'listing' | 'map'

interface ExploreProps {
  onNavigate: (p: Page, id?: string) => void
}


const conditions = ['Any', 'New', 'Like New', 'Good', 'Fair', 'For Parts']
const sortOptions = [
  { value: 'relevance', label: 'Most relevant' },
  { value: 'newest', label: 'Newest first' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'distance', label: 'Closest first' },
  { value: 'popular', label: 'Most popular' },
]

const recentSearches = ['used desk under $150', 'iPhone 14', 'moving help', 'room for rent near midtown']
const suggestedSearches = ['West Elm furniture near Decatur', 'Photography services', 'Free items this week', 'Apartments under $1,500']

// Named so "Clear all" resets to the same state the screen starts in rather
// than to values invented at the call site.
const DEFAULT_CONDITION = 'Any'
const DEFAULT_MAX_PRICE = '150'
const DEFAULT_DISTANCE = 10

export default function Explore({ onNavigate }: ExploreProps) {
  const [query, setQuery] = useState('Used desk under $150 within 10 miles of Kennesaw')
  const [category, setCategory] = useState('All')
  const [condition, setCondition] = useState(DEFAULT_CONDITION)
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState(DEFAULT_MAX_PRICE)
  const [distance, setDistance] = useState(DEFAULT_DISTANCE)
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [freeOnly, setFreeOnly] = useState(false)
  const [deliveryOnly, setDeliveryOnly] = useState(false)
  const [view, setView] = useState<'grid' | 'list' | 'map'>('grid')
  const [sort, setSort] = useState('relevance')
  const [showFilters] = useState(true)
  const [searched, setSearched] = useState(true)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [alertSaved, setAlertSaved] = useState(false)
  const [alertError, setAlertError] = useState('')
  const [savingAlert, setSavingAlert] = useState(false)
  const [results, setResults] = useState<Listing[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [searchNonce, setSearchNonce] = useState(0)

  const [categoryOptions, setCategoryOptions] = useState<Array<{ id: string; name: string }>>([])
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    api.categories
      .list()
      .then(rows => setCategoryOptions(rows))
      .catch(() => setCategoryOptions([]))
  }, [])

  // Radius filtering needs an origin. It is only sent once the member has
  // granted permission or typed a location; without one the query is global.
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      position =>
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => undefined,
      { timeout: 5000 }
    )
  }, [])

  const selectedCategoryId = categoryOptions.find(option => option.name === category)?.id
  const pageSize = 24
  const parsedMax = maxPrice ? Number(maxPrice) : undefined
  const parsedMin = minPrice ? Number(minPrice) : undefined

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError('')
    api.listings
      .search({
        query: searchNonce === 0 ? undefined : query.trim() || undefined,
        ...(selectedCategoryId ? { categoryId: selectedCategoryId } : {}),
        ...(Number.isFinite(parsedMin) ? { minPriceCents: Math.round(parsedMin! * 100) } : {}),
        ...(Number.isFinite(parsedMax) ? { maxPriceCents: Math.round(parsedMax! * 100) } : {}),
        // Free only is expressed as a zero ceiling rather than a client filter.
        ...(freeOnly ? { maxPriceCents: 0 } : {}),
        ...(location && distance < 500 ? { ...location, radiusMiles: distance } : {}),
        sort: sort as ListingQueryParams["sort"],
        limit: pageSize,
        offset,
      })
      .then((page) => {
        if (!active) return
        setResults(page.items.map((row) => listingFromApi(row)))
        setTotal(page.total)
      })
      .catch((cause: unknown) => {
        if (active) setLoadError(readError(cause, 'Listings could not be loaded.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // Keyed on the submit counter and the committed filters, never on the raw
    // text inputs, so typing does not refetch on every keystroke.
  }, [searchNonce, selectedCategoryId, minPrice, maxPrice, freeOnly, distance, sort, offset, location]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveAlert = async () => {
    if (alertSaved) {
      setAlertError('This search is already saved.')
      return
    }
    const text = query.trim()
    if (!text) {
      setAlertError('Enter a search before saving it.')
      return
    }
    setSavingAlert(true)
    setAlertError('')
    try {
      await api.listings.saveSearch(text, {
        category,
        condition,
        minPrice,
        maxPrice,
        distance,
        verifiedOnly,
        freeOnly,
        deliveryOnly,
      })
      setAlertSaved(true)
    } catch (cause: unknown) {
      setAlertError(readStatus(cause, 'Unable to save this search.'))
    } finally {
      setSavingAlert(false)
    }
  }

  /*
   * Removes exactly the filter a chip represents, and nothing else, so the
   * chips stay in step with the controls that produced them.
   */
  const clearFilter = (filter: string) => {
    if (filter === category) setCategory('All')
    if (filter === condition) setCondition(DEFAULT_CONDITION)
    if (filter.startsWith('Under $')) setMaxPrice(DEFAULT_MAX_PRICE)
    if (filter.endsWith('mi radius')) setDistance(DEFAULT_DISTANCE)
    if (filter === 'Verified sellers') setVerifiedOnly(false)
    if (filter === 'Free only') setFreeOnly(false)
    if (filter === 'Delivery available') setDeliveryOnly(false)
    setSearchNonce(n => n + 1)
  }

  const activeFilters: string[] = []
  if (category !== 'All') activeFilters.push(category)
  if (condition !== 'Any') activeFilters.push(condition)
  if (maxPrice) activeFilters.push(`Under $${maxPrice}`)
  if (distance < 25) activeFilters.push(`${distance} mi radius`)
  if (verifiedOnly) activeFilters.push('Verified sellers')
  if (freeOnly) activeFilters.push('Free only')
  if (deliveryOnly) activeFilters.push('Delivery available')

  // Price, category, and radius are applied by the database so the results are
  // global rather than filtered after one page was fetched. Only the toggles
  // the API does not model stay on the client.
  const filteredListings = results.filter(l => {
    if (deliveryOnly && !l.deliveryAvailable) return false
    if (verifiedOnly && !l.seller.verified) return false
    return true
  })

  const page = Math.floor(offset / pageSize) + 1
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="min-h-screen bg-[#FAFAF7] pb-24 md:pb-0">
      {/* Search header */}
      <div className="bg-white border-b border-[#E8E6DF] sticky top-16 z-40">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4">
          {/*
            Explore had no level-one heading at all, so a screen-reader user
            landed on a page whose structure began at <h3> with no indication
            of what screen they were on. It is visually hidden to keep the
            existing layout unchanged while giving the page a proper name.
          */}
          <h1 className="sr-only">Explore listings</h1>
          {/* Search input */}
          <div className="relative mb-3">
            <Icon name="search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5C6E8A] pointer-events-none" />
            <label htmlFor="explore-search" className="sr-only">
              Search listings
            </label>
            <input
              id="explore-search"
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setShowSuggestions(true) }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onKeyDown={e => { if (e.key === 'Enter') { setSearched(true); setShowSuggestions(false); setSearchNonce((n) => n + 1) } }}
              placeholder="Search for anything nearby..."
              className="w-full h-12 pl-12 pr-40 bg-[#F5F4EF] rounded-2xl text-sm text-[#1B2A4A] placeholder:text-[#5C6E8A] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#2D6A4F]/20 transition-all"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <button onClick={() => onNavigate('map')} className="flex items-center gap-1.5 text-xs font-semibold text-[#1B4C72] bg-[#DDEEFF] px-3 py-1.5 rounded-lg hover:bg-[#90BEE5]/30 transition-colors">
                <Icon name="map" size={13} />
                Map view
              </button>
              <button onClick={() => { setSearched(true); setShowSuggestions(false); setSearchNonce((n) => n + 1) }} className="bg-[#2D6A4F] text-white text-sm font-semibold px-4 py-1.5 rounded-xl hover:bg-[#1B4332] transition-colors">
                Search
              </button>
            </div>

            {/* Suggestions dropdown */}
            {showSuggestions && !searched && (
              <div className="absolute top-14 left-0 right-0 bg-white border border-[#E8E6DF] rounded-2xl shadow-xl z-50 p-4">
                <p className="text-xs font-semibold text-[#5C6E8A] uppercase tracking-wide mb-3">Recent searches</p>
                {recentSearches.map(s => (
                  <button key={s} onClick={() => { setQuery(s); setSearched(true); setShowSuggestions(false); setSearchNonce((n) => n + 1) }} className="flex items-center gap-3 w-full p-2 rounded-xl hover:bg-[#F5F4EF] text-sm text-[#1B2A4A] text-left">
                    <Icon name="search" size={13} className="text-[#5C6E8A]" />
                    {s}
                  </button>
                ))}
                <p className="text-xs font-semibold text-[#5C6E8A] uppercase tracking-wide mb-3 mt-4">Try searching for</p>
                {suggestedSearches.map(s => (
                  <button key={s} onClick={() => { setQuery(s); setSearched(true); setShowSuggestions(false); setSearchNonce((n) => n + 1) }} className="flex items-center gap-3 w-full p-2 rounded-xl hover:bg-[#F5F4EF] text-sm text-[#2D6A4F] text-left">
                    <Icon name="zap" size={13} className="text-[#52B788]" />
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Category pills */}
          <div
            className="flex gap-2 scroll-x-focusable scrollbar-hide"
            tabIndex={0}
            role="group"
            aria-label="Listing categories"
          >
            {['All', ...categoryOptions.map(option => option.name)].map(cat => (
              <Chip key={cat} active={category === cat} onClick={() => setCategory(cat)}>{cat}</Chip>
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
                  <h2 className="font-semibold text-[#1B2A4A]">Filters</h2>
                  {/*
                    This button previously had no handler, so "Clear all"
                    cleared nothing while claiming to. It now resets the
                    filters it sits above.
                  */}
                  <button
                    type="button"
                    onClick={() => {
                      setMinPrice('')
                      setMaxPrice(DEFAULT_MAX_PRICE)
                      setDistance(DEFAULT_DISTANCE)
                      setCondition(DEFAULT_CONDITION)
                      setCategory('All')
                      setSearchNonce(n => n + 1)
                    }}
                    className="min-h-11 px-2 -mr-2 text-xs text-[#B94C2A] font-medium hover:underline"
                  >
                    Clear all
                  </button>
                </div>

                {/* Price range */}
                <div className="mb-5">
                  <p className="block text-xs font-semibold text-[#5C6E8A] uppercase tracking-wide mb-3" id="price-range-label">Price range</p>
                  <div className="flex gap-2">
                    <label htmlFor="filter-min-price" className="sr-only">
                      Minimum price
                    </label>
                    <input
                      id="filter-min-price"
                      type="number"
                      placeholder="Min"
                      value={minPrice}
                      onChange={e => setMinPrice(e.target.value)}
                      className="flex-1 h-9 px-3 bg-[#F5F4EF] border border-[#E8E6DF] rounded-lg text-sm text-[#1B2A4A] focus:outline-none focus:border-[#2D6A4F]"
                    />
                    <span className="flex items-center text-[#5C6E8A] text-sm" aria-hidden="true">
                      –
                    </span>
                    <label htmlFor="filter-max-price" className="sr-only">
                      Maximum price
                    </label>
                    <input
                      id="filter-max-price"
                      type="number"
                      placeholder="Max"
                      value={maxPrice}
                      onChange={e => setMaxPrice(e.target.value)}
                      className="flex-1 h-9 px-3 bg-[#F5F4EF] border border-[#E8E6DF] rounded-lg text-sm text-[#1B2A4A] focus:outline-none focus:border-[#2D6A4F]"
                    />
                  </div>
                </div>

                {/* Distance */}
                <div className="mb-5">
                  <label htmlFor="filter-distance" className="block text-xs font-semibold text-[#5C6E8A] uppercase tracking-wide mb-3">
                    Distance: within <span className="text-[#2D6A4F]">{distance} miles</span>
                  </label>
                  <input
                    id="filter-distance"
                    type="range"
                    min={1}
                    max={50}
                    value={distance}
                    onChange={e => setDistance(parseInt(e.target.value))}
                    // The global range styling gives the slider a 24px band;
                    // this keeps the control full-width within it.
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-[#5C6E8A] mt-1">
                    <span>1 mi</span><span>25 mi</span><span>50 mi</span>
                  </div>
                </div>

                {/* Condition */}
                <div className="mb-5">
                  <p className="block text-xs font-semibold text-[#5C6E8A] uppercase tracking-wide mb-3">Condition</p>
                  <div className="flex flex-wrap gap-2">
                    {conditions.map(c => (
                      <button
                        key={c}
                        onClick={() => setCondition(c)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${condition === c ? 'bg-[#2D6A4F] text-white border-[#2D6A4F]' : 'bg-white text-[#5C6E8A] border-[#E8E6DF] hover:border-[#2D6A4F]/40'}`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Toggle filters */}
                <div className="space-y-3 border-t border-[#F5F4EF] pt-4">
                  {[
                    { key: 'verified', label: 'Verified sellers only', state: verifiedOnly, set: setVerifiedOnly },
                    { key: 'free', label: 'Free items only', state: freeOnly, set: setFreeOnly },
                    { key: 'delivery', label: 'Delivery available', state: deliveryOnly, set: setDeliveryOnly },
                  ].map(({ key, label, state, set }) => (
                    <div key={key} className="flex items-center justify-between gap-3">
                      {/* The visible text is the label, associated by id with the
                          switch, so it is announced as its accessible name. */}
                      <label htmlFor={`filter-${key}`} className="text-sm text-[#1B2A4A] cursor-pointer">
                        {label}
                      </label>
                      <Toggle id={`filter-${key}`} checked={state} onChange={set} />
                    </div>
                  ))}
                </div>

                {/* Seller rating */}
                <div className="mt-5 border-t border-[#F5F4EF] pt-4">
                  <p className="block text-xs font-semibold text-[#5C6E8A] uppercase tracking-wide mb-3">Minimum seller rating</p>
                  <div className="flex gap-2">
                    {[4, 4.5, 4.8].map(r => (
                      <button key={r} className="flex-1 py-1.5 text-xs font-medium rounded-lg border border-[#E8E6DF] text-[#5C6E8A] hover:border-[#2D6A4F] transition-colors">
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
                    {/* `total` is the global match count from the server, not the
                        size of the page on screen. */}
                    <span className="font-bold text-[#1B2A4A]">
                      {total || filteredListings.length} results
                    </span>
                    {query && <span> for &quot;<span className="text-[#2D6A4F] font-medium">{query}</span>&quot;</span>}
                  </p>
                )}
                {/* Active filters. Each chip clears the specific filter it represents;
                    they previously passed a no-op so the remove control did
                    nothing while looking actionable. */}
                {activeFilters.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {activeFilters.map(f => (
                      <Chip key={f} active onRemove={() => clearFilter(f)}>
                        {f}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Save search */}
                <button
                  disabled={savingAlert}
                  onClick={() => void saveAlert()}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${alertSaved ? 'bg-[#D8F3DC] text-[#1B4332] border-[#74C69D]' : 'bg-white text-[#5C6E8A] border-[#E8E6DF] hover:border-[#2D6A4F]'}`}
                >
                  <Icon name="bell" size={12} />
                  {savingAlert ? 'Saving...' : alertSaved ? 'Alert saved!' : 'Save search'}
                </button>
                {alertError && <p className="text-xs text-[#A63D27]" role="alert">{alertError}</p>}

                {/*
                  Icon-only view toggles. Each states which view it switches
                  to, and the current one is marked with aria-pressed so the
                  selection is not conveyed by colour alone.
                */}
                <div
                  role="group"
                  aria-label="Listing view"
                  className="flex items-center bg-white border border-[#E8E6DF] rounded-xl p-1"
                >
                  {(['grid', 'list', 'map'] as const).map(v => (
                    <button
                      key={v}
                      type="button"
                      aria-label={`${v === 'map' ? 'Map' : v === 'grid' ? 'Grid' : 'List'} view`}
                      aria-pressed={view === v}
                      onClick={() => v === 'map' ? onNavigate('map') : setView(v)}
                      className={`w-8 h-8 min-h-8 flex items-center justify-center rounded-lg transition-colors ${view === v ? 'bg-[#2D6A4F] text-white' : 'text-[#5C6E8A] hover:text-[#1B2A4A]'}`}
                    >
                      <Icon name={v === 'grid' ? 'grid' : v === 'list' ? 'list' : 'map'} size={14} />
                    </button>
                  ))}
                </div>

                {/* Sort */}
                <label htmlFor="explore-sort" className="sr-only">
                  Sort listings
                </label>
                <select
                  id="explore-sort"
                  value={sort}
                  onChange={e => setSort(e.target.value)}
                  className="h-9 min-h-9 px-3 bg-white border border-[#E8E6DF] rounded-xl text-xs font-medium text-[#1B2A4A] focus:outline-none cursor-pointer"
                >
                  {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            {/* Grid */}
            {loading ? (
              <div className="bg-white rounded-2xl border border-[#E8E6DF] p-8 text-center text-sm text-[#5C6E8A]">
                Loading listings…
              </div>
            ) : loadError ? (
              <div className="bg-[#FFF5F2] border border-[#E8694A]/20 rounded-2xl p-5 text-sm text-[#C4512D]">
                {loadError}
              </div>
            ) : filteredListings.length > 0 ? (
              <div className={view === 'list' ? 'space-y-3' : 'listing-grid'}>
                {filteredListings.map(listing => (
                  view === 'list' ? (
                    <div key={listing.id} onClick={() => onNavigate('listing', listing.id)} className="flex gap-4 bg-white rounded-2xl border border-[#E8E6DF] p-4 cursor-pointer card-hover">
                      <div className="w-28 h-28 rounded-xl overflow-hidden flex-shrink-0 bg-[#F5F4EF]">
                        {mediaSrc(listing.images[0], 'w=200&h=200&fit=crop&auto=format') && (
                          <img src={mediaSrc(listing.images[0], 'w=200&h=200&fit=crop&auto=format')!} alt={listing.title} className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <h2 className="font-semibold text-[#1B2A4A]">{listing.title}</h2>
                          <span className="font-bold text-[#1B2A4A] text-lg flex-shrink-0">
                            {listing.isFree ? <span className="text-[#2D6A4F]">Free</span> : `$${listing.price?.toLocaleString()}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {listing.condition && <Badge variant="navy" size="sm">{listing.condition}</Badge>}
                          <span className="text-xs text-[#5C6E8A]">{listing.neighborhood} · {listing.distance}</span>
                        </div>
                        <p className="text-sm text-[#5C6E8A] mt-2 line-clamp-2">{listing.description}</p>
                        <div className="flex items-center gap-3 mt-3">
                          <div className="flex items-center gap-1.5 text-xs text-[#5C6E8A]">
                            <Icon name="eye" size={12} />
                            {listing.views} views
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-[#5C6E8A]">
                            <Icon name="heart" size={12} />
                            {listing.saves} saves
                          </div>
                          {listing.seller.verified && <Badge variant="green" size="sm">Verified</Badge>}
                          {listing.deliveryAvailable && <Badge variant="blue" size="sm">Delivery</Badge>}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <ListingCard key={listing.id} listing={listing} onClick={() => onNavigate('listing', listing.id)} />
                  )
                ))}
              </div>
            ) : (
              <div className="py-20 text-center">
                <div className="text-5xl mb-4">🔍</div>
                <h2 className="font-display text-xl font-semibold text-[#1B2A4A] mb-2">No results found</h2>
                <p className="text-[#5C6E8A] max-w-sm mx-auto mb-6">Try adjusting your filters or searching in a wider radius. We can alert you when something matching your search is posted.</p>
                <div className="flex items-center justify-center gap-3">
                  <Button variant="primary" size="sm" onClick={() => { setFreeOnly(false); setVerifiedOnly(false); setMaxPrice(''); setMinPrice(''); setCategory('All'); setOffset(0) }}>Clear filters</Button>
                  <Button variant="outline" size="sm" onClick={() => void saveAlert()}>Save this search</Button>
                </div>
              </div>
            )}

            {/* Paging is server-side, so moving a page changes the query
                rather than slicing what is already on screen. */}
            {pageCount > 1 && !loading && (
              <nav aria-label="Search results pages" className="mt-6 flex items-center justify-center gap-3">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setOffset(Math.max(0, offset - pageSize))}>
                  Previous
                </Button>
                <span className="text-sm text-[#5C6E8A]">
                  Page {page} of {pageCount}
                </span>
                <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setOffset(offset + pageSize)}>
                  Next
                </Button>
              </nav>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
