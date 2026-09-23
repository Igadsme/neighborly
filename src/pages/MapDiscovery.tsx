import { useEffect, useMemo, useState } from 'react'
import { api, readStatus } from '../api/client'
import type { ApiListing } from '../api/types'
import { Badge, Icon, LoadState } from '../components/ui'
import { isPaintedNeighborhood, PAINTED_NEIGHBORHOODS, pinPosition } from '../lib/map-pins'
import { listingFromApi, mediaSrc } from '../lib/view'

type Page = 'listing' | 'explore'

interface MapDiscoveryProps {
  onNavigate: (p: Page, id?: string) => void
}

interface MapPin {
  id: string
  title: string
  category: string
  price: number | null
  image: string
  x: number
  y: number
  createdAt: string
  neighborhood: string
}

const safeSpots = [
  { name: 'Publix Parking', x: 48, y: 45, type: 'grocery' },
  { name: 'APD Precinct 6', x: 60, y: 28, type: 'police' },
  { name: 'Chase Bank ATM', x: 35, y: 50, type: 'bank' },
  { name: 'Starbucks', x: 55, y: 25, type: 'coffee' },
]

function toPin(listing: ApiListing): MapPin {
  const view = listingFromApi(listing)
  const position = pinPosition({
    id: listing.id,
    neighborhood: listing.neighborhood,
    city: listing.city,
  })
  const free = listing.priceCents == null || listing.priceCents === 0
  return {
    id: listing.id,
    title: view.title,
    category: view.category,
    price: free ? null : view.price,
    image: view.images[0] ?? '',
    x: position.x,
    y: position.y,
    createdAt: listing.createdAt ?? '',
    neighborhood: listing.neighborhood ?? '',
  }
}

export default function MapDiscovery({ onNavigate }: MapDiscoveryProps) {
  const [pins, setPins] = useState<MapPin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedPin, setSelectedPin] = useState<string | null>(null)
  const [view, setView] = useState<'split' | 'map' | 'list'>('split')
  const [priceFilter, setPriceFilter] = useState<string | null>(null)
  const [showSafeSpots, setShowSafeSpots] = useState(false)
  const [searchArea, setSearchArea] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [sort, setSort] = useState('closest')
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({})
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    api.listings
      .list({ limit: 100 })
      .then((rows) => {
        if (!active) return
        const next = rows.map(toPin)
        setPins(next)
        setSelectedPin((current) => (current && next.some((pin) => pin.id === current) ? current : next[0]?.id ?? null))
      })
      .catch((cause) => {
        if (!active) return
        setPins([])
        setError(readStatus(cause, 'Listings could not be loaded.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const visible = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    const filtered = pins.filter((pin) => {
      if (priceFilter && priceFilter !== 'All') {
        if (priceFilter === 'Free') {
          if (pin.price !== null) return false
        } else if (pin.category.toLowerCase() !== priceFilter.toLowerCase()) {
          return false
        }
      }
      if (searchArea && !isPaintedNeighborhood(pin.neighborhood)) return false
      if (!query) return true
      return `${pin.title} ${pin.category} ${pin.neighborhood}`.toLowerCase().includes(query)
    })
    const sorted = [...filtered]
    sorted.sort((a, b) => {
      if (sort === 'price') return (a.price ?? 0) - (b.price ?? 0) || a.id.localeCompare(b.id)
      if (sort === 'closest') {
        const da = (a.x - 55) ** 2 + (a.y - 40) ** 2
        const db = (b.x - 55) ** 2 + (b.y - 40) ** 2
        return da - db || a.id.localeCompare(b.id)
      }
      return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)
    })
    return sorted
  }, [pins, priceFilter, searchArea, searchText, sort])

  const selectedListing = visible.find((pin) => pin.id === selectedPin) ?? null

  async function saveSelected() {
    if (!selectedListing) return
    setSaveError('')
    try {
      const result = await api.listings.toggleFavorite(selectedListing.id)
      setSavedIds((current) => ({ ...current, [selectedListing.id]: result.saved }))
    } catch (cause) {
      setSaveError(readStatus(cause, 'Could not save this listing.'))
    }
  }

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-64px)] bg-[#FAFAF7] overflow-hidden">

      {/* Map panel */}
      <div className={`relative flex-1 ${view === 'list' ? 'hidden md:block' : 'block'}`}>

        {/* Map controls overlay */}
        <div className="absolute top-4 left-4 right-4 z-30 flex flex-col gap-2">
          {/* Search bar */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A9AB5] pointer-events-none" />
              <input
                type="text"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search this area..."
                className="w-full h-10 pl-9 pr-4 bg-white border border-[#E8E6DF] rounded-full text-sm text-[#1B2A4A] shadow-md focus:outline-none focus:border-[#2D6A4F]"
              />
            </div>
            <button
              onClick={() => setSearchArea(!searchArea)}
              className={`flex items-center gap-1.5 px-4 h-10 rounded-full text-sm font-semibold shadow-md transition-all ${searchArea ? 'bg-[#2D6A4F] text-white' : 'bg-white text-[#1B2A4A]'}`}
            >
              <Icon name="search" size={13} />
              Search area
            </button>
          </div>

          {/* Filter chips */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {['All', 'Furniture', 'Electronics', 'Free', 'Vehicles', 'Housing'].map(f => (
              <button
                key={f}
                onClick={() => setPriceFilter(priceFilter === f ? null : f)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm transition-all ${priceFilter === f ? 'bg-[#2D6A4F] text-white' : 'bg-white text-[#1B2A4A] border border-[#E8E6DF]'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Map surface */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Grid lines simulating map */}
          <div className="w-full h-full bg-gradient-to-br from-[#E8F4F0] via-[#EEF2E8] to-[#E8F0F4] relative">
            {/* Road network simulation */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              {/* Major roads - white */}
              <path d="M0 50 L100 50" stroke="white" strokeWidth="2.5" opacity="0.8"/>
              <path d="M50 0 L50 100" stroke="white" strokeWidth="2.5" opacity="0.8"/>
              <path d="M0 30 L100 30" stroke="white" strokeWidth="1.8" opacity="0.7"/>
              <path d="M0 70 L100 70" stroke="white" strokeWidth="1.8" opacity="0.7"/>
              <path d="M30 0 L30 100" stroke="white" strokeWidth="1.8" opacity="0.7"/>
              <path d="M70 0 L70 100" stroke="white" strokeWidth="1.8" opacity="0.7"/>
              {/* Diagonal roads */}
              <path d="M0 0 L60 60" stroke="white" strokeWidth="1.5" opacity="0.5"/>
              <path d="M40 0 L100 60" stroke="white" strokeWidth="1.5" opacity="0.5"/>
              <path d="M0 40 L60 100" stroke="white" strokeWidth="1.5" opacity="0.5"/>
              {/* Minor streets */}
              <path d="M0 20 L100 20" stroke="white" strokeWidth="1" opacity="0.5"/>
              <path d="M0 40 L100 40" stroke="white" strokeWidth="1" opacity="0.5"/>
              <path d="M0 60 L100 60" stroke="white" strokeWidth="1" opacity="0.5"/>
              <path d="M0 80 L100 80" stroke="white" strokeWidth="1" opacity="0.5"/>
              <path d="M20 0 L20 100" stroke="white" strokeWidth="1" opacity="0.5"/>
              <path d="M40 0 L40 100" stroke="white" strokeWidth="1" opacity="0.5"/>
              <path d="M60 0 L60 100" stroke="white" strokeWidth="1" opacity="0.5"/>
              <path d="M80 0 L80 100" stroke="white" strokeWidth="1" opacity="0.5"/>
              {/* Park areas */}
              <rect x="10" y="60" width="15" height="20" fill="#C8E6C9" opacity="0.6" rx="1"/>
              <rect x="60" y="10" width="20" height="12" fill="#C8E6C9" opacity="0.6" rx="1"/>
              <rect x="75" y="65" width="12" height="15" fill="#C8E6C9" opacity="0.6" rx="1"/>
              {/* Water features */}
              <path d="M5 48 Q15 42 25 48 Q35 54 45 48" stroke="#90CAF9" strokeWidth="3" fill="none" opacity="0.7"/>
              {/* BeltLine trail */}
              <path d="M20 25 Q35 32 50 35 Q65 38 75 55 Q80 65 78 80" stroke="#A5D6A7" strokeWidth="3" fill="none" strokeDasharray="2,2" opacity="0.8"/>
              {/* Neighborhood boundary */}
              <circle cx="55" cy="40" r="12" fill="none" stroke="#2D6A4F" strokeWidth="0.8" strokeDasharray="2,2" opacity="0.5"/>
            </svg>

            {/* Road labels */}
            <div className="absolute top-[27%] left-2 text-[8px] text-[#8A9AB5] font-medium bg-white/80 px-1 rounded">I-285</div>
            <div className="absolute top-[47%] left-1 text-[8px] text-[#8A9AB5] font-medium bg-white/80 px-1 rounded">Ponce de Leon Ave</div>
            <div className="absolute top-2 left-[47%] text-[8px] text-[#8A9AB5] font-medium bg-white/80 px-1 rounded">Peachtree St</div>

            {/* BeltLine label */}
            <div className="absolute top-[35%] left-[24%] text-[7px] text-[#2D6A4F] font-semibold bg-[#D8F3DC]/90 px-1 rounded rotate-12">BeltLine Trail</div>

            {/* Neighborhood labels */}
            {PAINTED_NEIGHBORHOODS.map(n => (
              <div
                key={n.name}
                className="absolute text-[9px] font-semibold text-[#5C6E8A] bg-white/80 backdrop-blur-sm px-1.5 py-0.5 rounded-md pointer-events-none"
                style={{ left: `${n.x}%`, top: `${n.y}%`, transform: 'translate(-50%, -50%)' }}
              >
                {n.name}
              </div>
            ))}

            {/* Safe meetup spots */}
            {showSafeSpots && safeSpots.map(spot => (
              <div
                key={spot.name}
                className="absolute"
                style={{ left: `${spot.x}%`, top: `${spot.y}%`, transform: 'translate(-50%, -100%)' }}
              >
                <div className="flex flex-col items-center">
                  <div className="w-7 h-7 rounded-full bg-[#4A7FB5] flex items-center justify-center shadow-md border-2 border-white text-sm">
                    {spot.type === 'grocery' ? '🛒' : spot.type === 'police' ? '🚔' : spot.type === 'bank' ? '🏦' : '☕'}
                  </div>
                  <div className="text-[7px] bg-[#4A7FB5] text-white px-1 rounded mt-0.5 whitespace-nowrap">{spot.name}</div>
                </div>
              </div>
            ))}

            {/* Listing pins */}
            {visible.map(pin => {
              const isSelected = selectedPin === pin.id
              return (
                <div
                  key={pin.id}
                  className="absolute cursor-pointer map-pin"
                  style={{ left: `${pin.x}%`, top: `${pin.y}%`, transform: 'translate(-50%, -100%)' }}
                  onClick={() => setSelectedPin(isSelected ? null : pin.id)}
                >
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold shadow-md border-2 transition-all ${
                    isSelected
                      ? 'bg-[#1B2A4A] text-white border-white scale-110'
                      : pin.price === null
                        ? 'bg-[#2D6A4F] text-white border-white'
                        : 'bg-white text-[#1B2A4A] border-white hover:bg-[#1B2A4A] hover:text-white'
                  }`}>
                    {pin.price === null ? 'Free' : `$${pin.price}`}
                  </div>
                  <div className={`w-2 h-2 mx-auto rounded-full ${isSelected ? 'bg-[#1B2A4A]' : pin.price === null ? 'bg-[#2D6A4F]' : 'bg-white border border-[#E8E6DF]'}`} />
                </div>
              )
            })}

            {/* Current location */}
            <div className="absolute" style={{ left: '52%', top: '44%', transform: 'translate(-50%, -50%)' }}>
              <div className="w-5 h-5 bg-[#4A7FB5] rounded-full border-3 border-white shadow-md relative">
                <div className="absolute inset-0 bg-[#4A7FB5] rounded-full animate-ping opacity-40" />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom controls */}
        <div className="absolute bottom-4 left-4 right-4 z-30 flex items-end justify-between">
          <div className="flex flex-col gap-2">
            <button className="w-10 h-10 bg-white rounded-xl shadow-md flex items-center justify-center border border-[#E8E6DF] hover:bg-[#F5F4EF] transition-colors">
              <Icon name="mapPin" size={16} className="text-[#4A7FB5]" />
            </button>
            <button
              onClick={() => setShowSafeSpots(!showSafeSpots)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl shadow-md text-xs font-semibold border transition-all ${showSafeSpots ? 'bg-[#4A7FB5] text-white border-[#4A7FB5]' : 'bg-white text-[#1B2A4A] border-[#E8E6DF]'}`}
            >
              <Icon name="shield" size={12} />
              Safe spots
            </button>
          </div>

          <div className="flex gap-2">
            <div className="bg-white/90 backdrop-blur-sm border border-[#E8E6DF] rounded-xl shadow-md p-1 flex">
              {(['split', 'map', 'list'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${view === v ? 'bg-[#2D6A4F] text-white' : 'text-[#5C6E8A] hover:text-[#1B2A4A]'}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Listing panel */}
      <div className={`w-full md:w-96 flex flex-col bg-white border-l border-[#E8E6DF] ${view === 'map' ? 'hidden md:flex' : 'flex'}`} style={{ height: view === 'split' ? undefined : '100%' }}>

        {/* Panel header */}
        <div className="p-4 border-b border-[#E8E6DF]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-[#1B2A4A]">{loading ? 'Listings nearby' : `${visible.length} listings nearby`}</h2>
              <p className="text-xs text-[#8A9AB5]">Within 5 miles of Inman Park</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="w-8 h-8 rounded-lg bg-[#F5F4EF] flex items-center justify-center">
                <Icon name="sliders" size={14} className="text-[#5C6E8A]" />
              </button>
            </div>
          </div>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            className="w-full h-9 px-3 bg-[#F5F4EF] border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] focus:outline-none"
          >
            <option value="closest">Sort: Closest first</option>
            <option value="newest">Sort: Newest first</option>
            <option value="price">Sort: Price low to high</option>
            <option value="popular">Sort: Most popular</option>
          </select>
        </div>

        {/* Selected listing preview */}
        {selectedListing && (
          <div className="mx-4 mt-4 bg-[#F0FBF3] border-2 border-[#2D6A4F] rounded-2xl overflow-hidden">
            <div className="flex gap-3 p-3">
              <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-[#E8E6DF]">
                {mediaSrc(selectedListing.image, 'w=160&h=160&fit=crop&auto=format') && (
                  <img
                    src={mediaSrc(selectedListing.image, 'w=160&h=160&fit=crop&auto=format')!}
                    alt={selectedListing.title}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm text-[#1B2A4A] leading-tight">{selectedListing.title}</p>
                <p className="text-xs text-[#8A9AB5] mt-0.5">{selectedListing.category}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="font-bold text-[#1B2A4A]">
                    {selectedListing.price === null ? <span className="text-[#2D6A4F]">Free</span> : `$${selectedListing.price}`}
                  </span>
                  <Badge variant="green" size="sm">Active</Badge>
                </div>
              </div>
            </div>
            <div className="flex border-t border-[#74C69D]/30">
              <button onClick={() => void saveSelected()} className="flex-1 py-2.5 text-xs font-semibold text-[#2D6A4F] hover:bg-[#D8F3DC]/50 transition-colors">
                {savedIds[selectedListing.id] ? 'Saved' : 'Save'}
              </button>
              <div className="w-px bg-[#74C69D]/30" />
              <button onClick={() => onNavigate('listing', selectedListing.id)} className="flex-1 py-2.5 text-xs font-semibold text-[#2D6A4F] hover:bg-[#D8F3DC]/50 transition-colors">View listing →</button>
            </div>
            {saveError && <p className="px-3 py-2 text-xs text-[#C4512D]">{saveError}</p>}
          </div>
        )}

        {/* Listings list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {(loading || error) && <LoadState loading={loading} error={error} loadingLabel="Loading listings…" />}
          {!loading && !error && visible.length === 0 && (
            <p className="text-sm text-[#8A9AB5] text-center py-8">No listings nearby.</p>
          )}
          {visible.map(pin => {
            const isSelected = selectedPin === pin.id
            const image = mediaSrc(pin.image, 'w=120&h=120&fit=crop&auto=format')
            return (
              <div
                key={pin.id}
                onClick={() => setSelectedPin(isSelected ? null : pin.id)}
                className={`flex gap-3 rounded-2xl border p-3 cursor-pointer transition-all ${isSelected ? 'border-[#2D6A4F] bg-[#F0FBF3]' : 'border-[#E8E6DF] bg-white hover:border-[#2D6A4F]/40'}`}
              >
                <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-[#F5F4EF]">
                  {image && (
                    <img
                      src={image}
                      alt={pin.title}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-[#1B2A4A] line-clamp-1">{pin.title}</p>
                  <p className="text-xs text-[#8A9AB5] mt-0.5">{pin.category}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="font-bold text-sm text-[#1B2A4A]">
                      {pin.price === null ? <span className="text-[#2D6A4F] font-bold">Free</span> : `$${pin.price}`}
                    </span>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        onNavigate('listing', pin.id)
                      }}
                      className="text-xs text-[#2D6A4F] font-medium hover:underline"
                    >
                      View →
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
