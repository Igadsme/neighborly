import { useState } from 'react'
import { Badge, Avatar, StarRating, Button, Icon, TabBar, Toggle } from '../components/ui'
import { housingListings } from '../data'

type Page = 'map' | 'messages'

interface HousingProps {
  onNavigate: (p: Page) => void
}

export default function Housing({ onNavigate }: HousingProps) {
  const [listingType, setListingType] = useState<'rent' | 'sale'>('rent')
  const [type, setType] = useState('Any')
  const [minBeds, setMinBeds] = useState(0)
  const [maxPrice, setMaxPrice] = useState('')
  const [pets, setPets] = useState(false)
  const [furnished, setFurnished] = useState(false)
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [sort, setSort] = useState('newest')
  const [view, setView] = useState<'grid' | 'map'>('grid')
  const [selected, setSelected] = useState<string | null>(null)

  const filtered = housingListings.filter(h => {
    if (h.listingType !== listingType) return false
    if (pets && !h.pets) return false
    if (furnished && !h.furnished) return false
    if (verifiedOnly && !h.verified) return false
    if (minBeds > 0 && h.beds < minBeds) return false
    if (maxPrice && h.price > parseInt(maxPrice)) return false
    return true
  })

  return (
    <div className="min-h-screen bg-[#FAFAF7] pb-24 md:pb-0">
      {/* Housing hero */}
      <div className="relative h-52 md:h-64 overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1400&h=500&fit=crop&auto=format"
          alt="Atlanta neighborhood"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#1B2A4A]/60 to-[#1B2A4A]/20" />
        <div className="absolute inset-0 flex items-center justify-center text-center">
          <div>
            <h1 className="font-display text-4xl md:text-5xl font-semibold text-white mb-2">Find your next home</h1>
            <p className="text-white/80">Apartments, rooms, houses, and more in Atlanta</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">

        {/* Search + filters */}
        <div className="bg-white rounded-3xl border border-[#E8E6DF] shadow-md p-5 mb-8 -mt-12 relative z-10">
          {/* Rent / Sale toggle */}
          <div className="flex gap-1 bg-[#F5F4EF] p-1 rounded-xl mb-4 w-fit">
            <button
              onClick={() => setListingType('rent')}
              className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all ${listingType === 'rent' ? 'bg-white text-[#1B2A4A] shadow-sm' : 'text-[#8A9AB5]'}`}
            >
              For Rent
            </button>
            <button
              onClick={() => setListingType('sale')}
              className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all ${listingType === 'sale' ? 'bg-white text-[#1B2A4A] shadow-sm' : 'text-[#8A9AB5]'}`}
            >
              For Sale
            </button>
          </div>

          {/* Filters row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {/* Type */}
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="h-11 px-3 bg-[#F5F4EF] border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] focus:outline-none"
            >
              {['Any', 'Apartment', 'House', 'Room', 'Studio', 'Condo', 'Sublet'].map(t => <option key={t}>{t}</option>)}
            </select>

            {/* Beds */}
            <select
              value={minBeds}
              onChange={e => setMinBeds(parseInt(e.target.value))}
              className="h-11 px-3 bg-[#F5F4EF] border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] focus:outline-none"
            >
              <option value={0}>Any beds</option>
              <option value={1}>1+ bed</option>
              <option value={2}>2+ beds</option>
              <option value={3}>3+ beds</option>
            </select>

            {/* Max price */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A9AB5] text-sm">$</span>
              <input
                type="number"
                placeholder={listingType === 'rent' ? 'Max/mo' : 'Max price'}
                value={maxPrice}
                onChange={e => setMaxPrice(e.target.value)}
                className="w-full h-11 pl-7 pr-3 bg-[#F5F4EF] border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] focus:outline-none focus:border-[#2D6A4F]"
              />
            </div>

            {/* Toggles */}
            <label className="flex items-center gap-2 px-3 h-11 bg-[#F5F4EF] border border-[#E8E6DF] rounded-xl cursor-pointer">
              <input type="checkbox" checked={pets} onChange={e => setPets(e.target.checked)} className="accent-[#2D6A4F]" />
              <span className="text-sm text-[#1B2A4A]">Pet-friendly</span>
            </label>

            <Button variant="primary" size="md" fullWidth>Search homes</Button>
          </div>

          {/* Additional filters */}
          <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-[#F5F4EF]">
            <label className="flex items-center gap-2 text-sm text-[#5C6E8A] cursor-pointer">
              <input type="checkbox" checked={furnished} onChange={e => setFurnished(e.target.checked)} className="accent-[#2D6A4F]" />
              Furnished
            </label>
            <label className="flex items-center gap-2 text-sm text-[#5C6E8A] cursor-pointer">
              <input type="checkbox" checked={verifiedOnly} onChange={e => setVerifiedOnly(e.target.checked)} className="accent-[#2D6A4F]" />
              Verified landlord
            </label>
            <label className="flex items-center gap-2 text-sm text-[#5C6E8A] cursor-pointer">
              <input type="checkbox" className="accent-[#2D6A4F]" />
              Utilities included
            </label>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => onNavigate('map')} className="flex items-center gap-1.5 text-xs font-semibold text-[#4A7FB5] hover:underline">
                <Icon name="map" size={13} />
                Map view
              </button>
            </div>
          </div>
        </div>

        {/* Results header */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-[#5C6E8A]">
            <span className="font-bold text-[#1B2A4A]">{filtered.length}</span> homes {listingType === 'rent' ? 'for rent' : 'for sale'} in Atlanta
          </p>
          <select value={sort} onChange={e => setSort(e.target.value)} className="h-9 px-3 bg-white border border-[#E8E6DF] rounded-xl text-xs font-medium text-[#1B2A4A] focus:outline-none">
            <option value="newest">Newest first</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="beds">Most bedrooms</option>
          </select>
        </div>

        {/* Property grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(property => (
            <div
              key={property.id}
              onClick={() => setSelected(selected === property.id ? null : property.id)}
              className="bg-white rounded-3xl border border-[#E8E6DF] overflow-hidden cursor-pointer card-hover"
            >
              {/* Image */}
              <div className="relative h-52 bg-[#F5F4EF] overflow-hidden">
                <img
                  src={`https://images.unsplash.com/${property.images[0]}?w=600&h=400&fit=crop&auto=format`}
                  alt={property.title}
                  className="w-full h-full object-cover"
                />
                {/* Badges */}
                <div className="absolute top-3 left-3 flex gap-1.5">
                  <Badge variant={property.listingType === 'rent' ? 'blue' : 'green'}>
                    {property.listingType === 'rent' ? 'For Rent' : 'For Sale'}
                  </Badge>
                  {property.verified && <Badge variant="green">✓ Verified</Badge>}
                </div>
                {/* Save */}
                <button className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-sm">
                  <Icon name="heart" size={14} className="stroke-[#5C6E8A]" />
                </button>
                {/* Available */}
                <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm text-xs font-semibold text-[#2D6A4F] px-2.5 py-1 rounded-full">
                  Available {property.available}
                </div>
              </div>

              {/* Content */}
              <div className="p-4">
                {/* Price + type */}
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h3 className="font-semibold text-[#1B2A4A] text-sm leading-snug line-clamp-2 flex-1">{property.title}</h3>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-[#1B2A4A]">
                      ${property.price.toLocaleString()}
                      {property.priceUnit && <span className="text-xs font-normal text-[#8A9AB5]">{property.priceUnit}</span>}
                    </p>
                  </div>
                </div>

                {/* Location */}
                <p className="text-xs text-[#8A9AB5] mb-3 flex items-center gap-1">
                  <Icon name="mapPin" size={10} className="text-[#E8694A]" />
                  {property.neighborhood} · {property.distance}
                </p>

                {/* Stats */}
                <div className="flex items-center gap-3 text-sm text-[#5C6E8A] mb-3">
                  {property.beds > 0 && <span className="flex items-center gap-1 font-medium"><span className="text-[#1B2A4A]">{property.beds}</span> bd</span>}
                  {property.beds === 0 && <span className="font-medium text-[#1B2A4A]">Studio</span>}
                  <span className="text-[#C5CCDA]">·</span>
                  <span className="flex items-center gap-1 font-medium"><span className="text-[#1B2A4A]">{property.baths}</span> ba</span>
                  {property.sqft > 0 && (
                    <>
                      <span className="text-[#C5CCDA]">·</span>
                      <span className="flex items-center gap-1 font-medium"><span className="text-[#1B2A4A]">{property.sqft.toLocaleString()}</span> sqft</span>
                    </>
                  )}
                </div>

                {/* Amenities */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {property.pets && <Badge variant="green" size="sm">🐾 Pet OK</Badge>}
                  {property.furnished && <Badge variant="blue" size="sm">Furnished</Badge>}
                  {property.utilities !== 'N/A' && <Badge variant="gray" size="sm">💡 {property.utilities}</Badge>}
                </div>

                {/* Lease */}
                {property.lease !== 'N/A' && (
                  <p className="text-xs text-[#8A9AB5] mb-3">
                    📋 Lease: {property.lease}
                  </p>
                )}

                {/* Seller */}
                <div className="flex items-center justify-between pt-3 border-t border-[#F5F4EF]">
                  <div className="flex items-center gap-2">
                    <Avatar src={property.seller.avatar} name={property.seller.name} size="xs" verified={property.seller.verified} />
                    <div>
                      <p className="text-xs font-medium text-[#1B2A4A]">{property.seller.name}</p>
                      <StarRating rating={property.seller.rating} count={property.seller.reviews} size="xs" />
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={e => { e.stopPropagation(); onNavigate('messages') }} className="text-xs font-semibold text-[#2D6A4F] bg-[#F0FBF3] px-3 py-1.5 rounded-lg hover:bg-[#D8F3DC] transition-colors">Message</button>
                    <button className="text-xs font-semibold text-[#4A7FB5] bg-[#DDEEFF] px-3 py-1.5 rounded-lg hover:bg-[#90BEE5]/30 transition-colors">Tour</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="py-20 text-center">
            <div className="text-5xl mb-4">🏠</div>
            <h3 className="font-display text-xl font-semibold text-[#1B2A4A] mb-2">No homes match your filters</h3>
            <p className="text-[#8A9AB5]">Try adjusting your search criteria.</p>
          </div>
        )}

        {/* Commute calculator teaser */}
        <div className="mt-8 bg-gradient-to-r from-[#DDEEFF] to-[#F0FBF3] border border-[#90BEE5]/30 rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🚇</span>
            <div className="flex-1">
              <p className="font-semibold text-[#1B2A4A]">Commute time filter</p>
              <p className="text-sm text-[#5C6E8A]">Filter homes by commute time to your workplace. Set your destination to see which neighborhoods work best.</p>
            </div>
            <Button variant="soft" size="sm">Set up commute</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
