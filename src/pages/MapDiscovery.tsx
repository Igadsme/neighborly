import { useState } from 'react'
import { Badge, Avatar, StarRating, Button, Icon, Chip, Toggle } from '../components/ui'
import { mapListings, listings } from '../data'

type Page = 'listing' | 'explore'

interface MapDiscoveryProps {
  onNavigate: (p: Page) => void
}

const neighborhoods = [
  { name: 'Inman Park', x: 55, y: 40, listings: 47 },
  { name: 'Decatur', x: 72, y: 35, listings: 83 },
  { name: 'Midtown', x: 42, y: 32, listings: 124 },
  { name: 'Buckhead', x: 35, y: 18, listings: 67 },
  { name: 'Grant Park', x: 58, y: 55, listings: 39 },
  { name: 'East ATL', x: 68, y: 58, listings: 52 },
  { name: 'Westside', x: 22, y: 42, listings: 61 },
]

export default function MapDiscovery({ onNavigate }: MapDiscoveryProps) {
  const [selectedPin, setSelectedPin] = useState<string | null>('m1')
  const [view, setView] = useState<'split' | 'map' | 'list'>('split')
  const [priceFilter, setPriceFilter] = useState<string | null>(null)
  const [showSafeSpots, setShowSafeSpots] = useState(false)
  const [searchArea, setSearchArea] = useState(false)
  const [mapStyle, setMapStyle] = useState<'street' | 'satellite'>('street')

  const selectedListing = selectedPin ? mapListings.find(l => l.id === selectedPin) : null
  const fullListing = selectedListing ? listings.find(l => l.images[0] === selectedListing.image) || listings[0] : listings[0]

  const safeSpots = [
    { name: 'Publix Parking', x: 48, y: 45, type: 'grocery' },
    { name: 'APD Precinct 6', x: 60, y: 28, type: 'police' },
    { name: 'Chase Bank ATM', x: 35, y: 50, type: 'bank' },
    { name: 'Starbucks', x: 55, y: 25, type: 'coffee' },
  ]

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
            {neighborhoods.map(n => (
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
            {mapListings.map(pin => {
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
              <h2 className="font-semibold text-[#1B2A4A]">{mapListings.length} listings nearby</h2>
              <p className="text-xs text-[#8A9AB5]">Within 5 miles of Inman Park</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="w-8 h-8 rounded-lg bg-[#F5F4EF] flex items-center justify-center">
                <Icon name="sliders" size={14} className="text-[#5C6E8A]" />
              </button>
            </div>
          </div>
          <select className="w-full h-9 px-3 bg-[#F5F4EF] border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] focus:outline-none">
            <option>Sort: Closest first</option>
            <option>Sort: Newest first</option>
            <option>Sort: Price low to high</option>
            <option>Sort: Most popular</option>
          </select>
        </div>

        {/* Selected listing preview */}
        {selectedListing && (
          <div className="mx-4 mt-4 bg-[#F0FBF3] border-2 border-[#2D6A4F] rounded-2xl overflow-hidden">
            <div className="flex gap-3 p-3">
              <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-[#E8E6DF]">
                <img
                  src={`https://images.unsplash.com/${selectedListing.image}?w=160&h=160&fit=crop&auto=format`}
                  alt={selectedListing.title}
                  className="w-full h-full object-cover"
                />
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
              <button className="flex-1 py-2.5 text-xs font-semibold text-[#2D6A4F] hover:bg-[#D8F3DC]/50 transition-colors">Save</button>
              <div className="w-px bg-[#74C69D]/30" />
              <button onClick={() => onNavigate('listing')} className="flex-1 py-2.5 text-xs font-semibold text-[#2D6A4F] hover:bg-[#D8F3DC]/50 transition-colors">View listing →</button>
            </div>
          </div>
        )}

        {/* Listings list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {mapListings.map(pin => {
            const isSelected = selectedPin === pin.id
            return (
              <div
                key={pin.id}
                onClick={() => setSelectedPin(isSelected ? null : pin.id)}
                className={`flex gap-3 rounded-2xl border p-3 cursor-pointer transition-all ${isSelected ? 'border-[#2D6A4F] bg-[#F0FBF3]' : 'border-[#E8E6DF] bg-white hover:border-[#2D6A4F]/40'}`}
              >
                <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-[#F5F4EF]">
                  <img
                    src={`https://images.unsplash.com/${pin.image}?w=120&h=120&fit=crop&auto=format`}
                    alt={pin.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-[#1B2A4A] line-clamp-1">{pin.title}</p>
                  <p className="text-xs text-[#8A9AB5] mt-0.5">{pin.category}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="font-bold text-sm text-[#1B2A4A]">
                      {pin.price === null ? <span className="text-[#2D6A4F] font-bold">Free</span> : `$${pin.price}`}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); onNavigate('listing') }}
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
