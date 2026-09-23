import { useEffect, useState } from 'react'
import { Avatar, StarRating, Badge, Button, Icon, ListingCard } from '../components/ui'
import { listings, type Listing } from '../data'
import { api, readError } from '../api/client'
import { isUuid, listingFromApi, mediaSrc } from '../lib/view'

type Page = 'listing' | 'messages' | 'profile' | 'explore'

interface ListingDetailProps {
  listingId?: string | null
  onNavigate: (p: Page, id?: string) => void
}

const safeSpots = ['Publix on Moreland Ave', 'Chase Bank ATM (Ponce)', 'Starbucks — Edgewood', 'APD Precinct 6 Lobby']

export default function ListingDetail({ listingId, onNavigate }: ListingDetailProps) {
  const fixture = listingId ? listings.find((item) => item.id === listingId) : undefined
  const fromApi = isUuid(listingId)
  const [apiListing, setApiListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(fromApi)
  const [loadError, setLoadError] = useState('')
  const [activeImage, setActiveImage] = useState(0)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [offerOpen, setOfferOpen] = useState(false)
  const [offerAmount, setOfferAmount] = useState('')
  const [messageOpen, setMessageOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [messageSent, setMessageSent] = useState(false)
  const [messageError, setMessageError] = useState('')
  const [reported, setReported] = useState(false)
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    if (fixture) setSaved(fixture.saved)
  }, [fixture])

  useEffect(() => {
    if (!fromApi || !listingId) return
    let active = true
    setLoading(true)
    setLoadError('')
    setApiListing(null)
    api.listings
      .get(listingId)
      .then((row) => {
        if (!active) return
        const next = listingFromApi(row)
        setApiListing(next)
        setSaved(next.saved)
      })
      .catch((cause: unknown) => {
        if (active) setLoadError(readError(cause, 'This listing could not be loaded.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [fromApi, listingId])

  const listing = fromApi ? apiListing : fixture ?? null
  const relatedListings = fromApi || !listing
    ? []
    : listings.filter((item) => item.id !== listing.id).slice(0, 4)

  const toggleSaved = async () => {
    if (!listing) return
    if (!fromApi) {
      setSaved((value) => !value)
      return
    }
    setSaveError('')
    try {
      const result = await api.listings.toggleFavorite(listing.id)
      setSaved(result.saved)
    } catch (cause: unknown) {
      setSaveError(readError(cause, 'Saving this listing is unavailable.'))
    }
  }

  const handleSendMessage = () => {
    if (!message.trim()) return
    if (fromApi) {
      setMessageError("Starting a conversation from a listing isn't available yet.")
      return
    }
    setMessageSent(true)
    setTimeout(() => { setMessageOpen(false); onNavigate('messages') }, 1200)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-[#E8E6DF] p-8 text-center text-sm text-[#8A9AB5]">
          Loading listing…
        </div>
      </div>
    )
  }

  if (loadError || !listing) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center px-4">
        <div className="bg-[#FFF5F2] border border-[#E8694A]/20 rounded-2xl p-5 text-sm text-[#C4512D] max-w-md text-center">
          {loadError || 'Choose a listing to see its details.'}
        </div>
      </div>
    )
  }

  const cover = (image: string | undefined, params: string) => mediaSrc(image, params)
  const detailRows = fromApi
    ? [
        { label: 'Condition', value: listing.condition || '—' },
        { label: 'Category', value: listing.category || '—' },
        { label: 'Neighborhood', value: listing.neighborhood || '—' },
        { label: 'City', value: listing.city || '—' },
        { label: 'Pickup', value: listing.pickupAvailable ? 'Available' : 'Not available' },
        { label: 'Delivery', value: listing.deliveryAvailable ? 'Available' : 'Not available' },
        { label: 'Shipping', value: listing.shippingAvailable ? 'Available' : 'Not available' },
      ]
    : [
        { label: 'Condition', value: listing.condition },
        { label: 'Category', value: listing.category },
        { label: 'Subcategory', value: listing.subcategory || 'Sofas & Couches' },
        { label: 'Brand', value: 'West Elm' },
        { label: 'Dimensions', value: '81" W × 33" D × 30" H' },
        { label: 'Color', value: 'Charcoal Gray' },
        { label: 'Material', value: 'Performance velvet' },
        { label: 'Pet-free home', value: 'Yes' },
        { label: 'Smoke-free', value: 'Yes' },
        { label: 'Original price', value: '$1,299' },
      ]

  return (
    <div className="min-h-screen bg-[#FAFAF7] pb-32 md:pb-16">

      {/* Breadcrumb */}
      <div className="bg-white border-b border-[#E8E6DF]">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center gap-2 text-sm text-[#8A9AB5]">
          <button onClick={() => onNavigate('explore')} className="hover:text-[#2D6A4F] transition-colors">Explore</button>
          <Icon name="chevronRight" size={12} />
          <span>{listing.category || 'Listing'}</span>
          <Icon name="chevronRight" size={12} />
          <span className="text-[#1B2A4A] font-medium truncate">{listing.title}</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        <div className="grid lg:grid-cols-[1fr_380px] gap-8">

          {/* Left column */}
          <div>
            {/* Photo gallery */}
            <div className="mb-6">
              {/* Main image */}
              <div
                className="relative bg-[#F5F4EF] rounded-3xl overflow-hidden mb-3 cursor-zoom-in h-72 md:h-[480px]"
                onClick={() => setZoomed(!zoomed)}
              >
                {cover(listing.images[activeImage], 'w=900&h=600&fit=crop&auto=format') && (
                <img
                  src={cover(listing.images[activeImage], 'w=900&h=600&fit=crop&auto=format')!}
                  alt={listing.title}
                  className="w-full h-full object-cover"
                />
                )}
                {/* Actions overlay */}
                <div className="absolute top-4 right-4 flex gap-2">
                  <button
                    onClick={e => { e.stopPropagation(); void toggleSaved() }}
                    className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-md hover:scale-110 transition-transform"
                  >
                    <Icon name="heart" size={16} className={saved ? 'fill-[#E8694A] stroke-[#E8694A]' : 'stroke-[#5C6E8A]'} />
                  </button>
                  <button className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-md hover:scale-110 transition-transform">
                    <Icon name="share" size={16} className="stroke-[#5C6E8A]" />
                  </button>
                </div>
                {/* Image counter */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs font-medium px-3 py-1 rounded-full backdrop-blur-sm">
                  {listing.images.length ? activeImage + 1 : 0} / {listing.images.length}
                </div>
                {/* Condition badge */}
                <div className="absolute top-4 left-4">
                  <Badge variant="blue">{listing.condition}</Badge>
                </div>
              </div>

              {/* Thumbnails */}
              <div className="flex gap-2">
                {listing.images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(i)}
                    className={`w-20 h-20 rounded-xl overflow-hidden border-2 transition-all bg-[#F5F4EF] ${activeImage === i ? 'border-[#2D6A4F]' : 'border-transparent'}`}
                  >
                    {cover(img, 'w=160&h=160&fit=crop&auto=format') && (
                      <img src={cover(img, 'w=160&h=160&fit=crop&auto=format')!} alt="" className="w-full h-full object-cover" />
                    )}
                  </button>
                ))}
                <button className="w-20 h-20 rounded-xl border-2 border-dashed border-[#E8E6DF] flex flex-col items-center justify-center text-[#C5CCDA] hover:border-[#2D6A4F]/30 transition-colors">
                  <Icon name="camera" size={16} />
                  <span className="text-[9px] mt-1">Video</span>
                </button>
              </div>
            </div>

            {/* Title, price, meta */}
            <div className="mb-6">
              <div className="flex items-start justify-between gap-4 mb-3">
                <h1 className="font-display text-2xl md:text-3xl font-semibold text-[#1B2A4A] leading-tight">{listing.title}</h1>
                <div className="text-right flex-shrink-0">
                  <p className="text-3xl font-bold text-[#1B2A4A]">{listing.isFree ? 'Free' : listing.price != null ? `$${listing.price.toLocaleString()}` : 'OBO'}</p>
                  <p className="text-xs text-[#8A9AB5]">or best offer</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-3">
                {listing.condition && <Badge variant="blue">{listing.condition}</Badge>}
                {listing.pickupAvailable && <Badge variant="green">Pickup available</Badge>}
                {listing.deliveryAvailable && <Badge variant="blue">Delivery</Badge>}
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm text-[#8A9AB5]">
                <span className="flex items-center gap-1"><Icon name="mapPin" size={13} className="text-[#E8694A]" />{listing.neighborhood}, Atlanta · {listing.distance}</span>
                <span className="flex items-center gap-1"><Icon name="calendar" size={13} />Posted {listing.postedAt}</span>
                <span className="flex items-center gap-1"><Icon name="eye" size={13} />{listing.views} views</span>
                <span className="flex items-center gap-1"><Icon name="heart" size={13} />{listing.saves} saves</span>
              </div>
            </div>

            {/* AI Summary */}
            <div className="bg-gradient-to-r from-[#F0FBF3] to-[#F0F7FF] border border-[#74C69D]/30 rounded-2xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">✨</span>
                <span className="text-xs font-semibold text-[#2D6A4F] uppercase tracking-wide">Neighborly AI Summary</span>
              </div>
              <p className="text-sm text-[#1B2A4A] leading-relaxed">
                {fromApi
                  ? listing.description
                  : <>This West Elm mid-century modern sofa is in like-new condition — no stains, wear, or damage noted. The seller has 47 five-star reviews and 52 completed transactions. At $650 for a sofa that retailed at $1,299, this is priced <strong>~50% below retail</strong>, which is fair market value for this condition. Estimated value range: $550–$750.</>}
              </p>
            </div>

            {/* Description */}
            <div className="mb-6">
              <h2 className="font-display text-lg font-semibold text-[#1B2A4A] mb-3">Description</h2>
              <p className="text-[#5C6E8A] leading-relaxed text-sm">{listing.description}</p>
            </div>

            {/* Details */}
            <div className="bg-white rounded-2xl border border-[#E8E6DF] p-5 mb-6">
              <h2 className="font-display text-lg font-semibold text-[#1B2A4A] mb-4">Item details</h2>
              <div className="grid grid-cols-2 gap-3">
                {detailRows.map(({ label, value }) => (
                  <div key={label} className="flex flex-col">
                    <span className="text-xs font-semibold text-[#8A9AB5] uppercase tracking-wide">{label}</span>
                    <span className="text-sm text-[#1B2A4A] mt-0.5">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pickup & delivery */}
            <div className="bg-white rounded-2xl border border-[#E8E6DF] p-5 mb-6">
              <h2 className="font-display text-lg font-semibold text-[#1B2A4A] mb-4">Pickup & delivery</h2>
              <div className="space-y-3">
                <div className={`flex items-center gap-3 p-3 rounded-xl ${listing.pickupAvailable ? 'bg-[#F0FBF3]' : 'bg-[#F5F4EF] opacity-50'}`}>
                  <div className="w-9 h-9 rounded-full bg-[#D8F3DC] flex items-center justify-center"><Icon name="mapPin" size={15} className="text-[#2D6A4F]" /></div>
                  <div>
                    <p className="font-medium text-sm text-[#1B2A4A]">{listing.pickupAvailable ? 'Pickup available' : 'Pickup — not available'}</p>
                    <p className="text-xs text-[#8A9AB5]">{listing.neighborhood || 'Nearby'} — seller can help load</p>
                  </div>
                  {listing.pickupAvailable && <Icon name="check" size={14} className="ml-auto text-[#2D6A4F]" />}
                </div>
                <div className={`flex items-center gap-3 p-3 rounded-xl ${listing.deliveryAvailable ? 'bg-[#F0FBF3]' : 'bg-[#F5F4EF] opacity-50'}`}>
                  <div className="w-9 h-9 rounded-full bg-[#EEF0F5] flex items-center justify-center"><Icon name="truck" size={15} className="text-[#8A9AB5]" /></div>
                  <div>
                    <p className="font-medium text-sm text-[#1B2A4A]">{listing.deliveryAvailable ? 'Delivery available' : 'Delivery — not available'}</p>
                    <p className="text-xs text-[#8A9AB5]">{listing.deliveryAvailable ? 'Seller offers delivery' : 'Seller does not offer delivery'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Safety */}
            <div className="bg-[#FFF5F2] border border-[#E8694A]/20 rounded-2xl p-5 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Icon name="shield" size={16} className="text-[#E8694A]" />
                <h2 className="font-semibold text-[#1B2A4A]">Neighborly Safety Check</h2>
              </div>
              <p className="text-sm text-[#5C6E8A] mb-4">This listing passed our automated safety review. Here are nearby safe meetup spots:</p>
              <div className="grid grid-cols-2 gap-2">
                {safeSpots.map(spot => (
                  <div key={spot} className="flex items-center gap-2 text-xs text-[#1B2A4A] bg-white rounded-lg p-2">
                    <span className="text-[#2D6A4F]">📍</span>
                    {spot}
                  </div>
                ))}
              </div>
              <p className="text-xs text-[#8A9AB5] mt-3">⚠️ Never pay via gift cards, wire transfer, or apps like Zelle/Venmo to strangers. Always meet in person for large items.</p>
            </div>

            {/* Reviews */}
            <div className="mb-6">
              <h2 className="font-display text-lg font-semibold text-[#1B2A4A] mb-4">Seller reviews</h2>
              <div className="space-y-4">
                {fromApi && (
                  <p className="text-sm text-[#8A9AB5]">Seller reviews appear after completed exchanges.</p>
                )}
                {!fromApi && [
                  { name: 'Priya P.', avatar: 'photo-1494790108755-2616b612b77c', rating: 5, date: '2 weeks ago', text: 'Marcus was super responsive, item was exactly as described. Smooth pickup!' },
                  { name: 'James R.', avatar: 'photo-1507003211169-0a1dd7228f2d', rating: 5, date: '1 month ago', text: 'Great seller, fair price, very easy transaction. Would definitely buy from him again.' },
                  { name: 'Sofia M.', avatar: 'photo-1534528741775-53994a69daeb', rating: 4, date: '6 weeks ago', text: 'Sold me a great desk. Took a bit to schedule pickup but once we did it was totally smooth.' },
                ].map(review => (
                  <div key={review.name} className="bg-white rounded-2xl border border-[#E8E6DF] p-4">
                    <div className="flex items-start gap-3">
                      <Avatar src={review.avatar} name={review.name} size="sm" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm text-[#1B2A4A]">{review.name}</p>
                          <span className="text-[#8A9AB5] text-xs">·</span>
                          <span className="text-xs text-[#8A9AB5]">{review.date}</span>
                        </div>
                        <div className="flex mb-1">
                          {[...Array(review.rating)].map((_, i) => <span key={i} className="text-[#F59E0B] text-xs">★</span>)}
                        </div>
                        <p className="text-sm text-[#5C6E8A]">{review.text}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Similar listings */}
            <div>
              <h2 className="font-display text-lg font-semibold text-[#1B2A4A] mb-4">Similar listings</h2>
              <div className="grid grid-cols-2 gap-4">
                {relatedListings.map(l => (
                  <ListingCard key={l.id} listing={l} onClick={() => onNavigate('listing', l.id)} compact />
                ))}
              </div>
            </div>
          </div>

          {/* Right column — sticky actions */}
          <div className="hidden lg:block">
            <div className="sticky top-24 space-y-4">
              {/* Price card */}
              <div className="bg-white rounded-3xl border border-[#E8E6DF] shadow-md p-6">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-3xl font-bold text-[#1B2A4A]">{listing.isFree ? 'Free' : listing.price != null ? `$${listing.price.toLocaleString()}` : 'OBO'}</span>
                  <button onClick={() => void toggleSaved()} className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${saved ? 'text-[#E8694A]' : 'text-[#8A9AB5] hover:text-[#E8694A]'}`}>
                    <Icon name="heart" size={15} className={saved ? 'fill-[#E8694A] stroke-[#E8694A]' : ''} />
                    {saved ? 'Saved' : 'Save'}
                  </button>
                </div>
                <p className="text-xs text-[#8A9AB5] mb-5">or best offer · {listing.neighborhood} · {listing.distance}</p>
                {saveError && <p className="text-xs text-[#C4512D] mb-3">{saveError}</p>}

                <div className="space-y-3">
                  <Button variant="primary" size="lg" fullWidth onClick={() => setMessageOpen(true)}>
                    <Icon name="message" size={16} />
                    Message seller
                  </Button>
                  <Button variant="secondary" size="lg" fullWidth onClick={() => setOfferOpen(!offerOpen)}>
                    <Icon name="dollar" size={16} />
                    Make an offer
                  </Button>
                  {offerOpen && (
                    <div className="p-4 bg-[#FFF5F2] border border-[#E8694A]/20 rounded-2xl animate-fade-in">
                      <p className="text-xs font-semibold text-[#1B2A4A] mb-2">Your offer</p>
                      <div className="relative mb-3">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A9AB5] text-sm">$</span>
                        <input
                          type="number"
                          placeholder="e.g. 575"
                          value={offerAmount}
                          onChange={e => setOfferAmount(e.target.value)}
                          className="w-full h-10 pl-7 pr-3 bg-white border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] focus:outline-none focus:border-[#E8694A]"
                        />
                      </div>
                      <Button variant="secondary" size="sm" fullWidth>Send offer</Button>
                    </div>
                  )}
                  <Button variant="outline" size="md" fullWidth>Reserve item</Button>
                </div>

                <div className="mt-5 pt-5 border-t border-[#F5F4EF] space-y-2">
                  <div className="flex items-center gap-2 text-xs text-[#8A9AB5]">
                    <Icon name="shield" size={12} className="text-[#2D6A4F]" />
                    Neighborly buyer protection
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#8A9AB5]">
                    <Icon name="mapPin" size={12} className="text-[#2D6A4F]" />
                    Safe meetup spots suggested
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#8A9AB5]">
                    <Icon name="message" size={12} className="text-[#2D6A4F]" />
                    Secure in-app messaging only
                  </div>
                </div>
              </div>

              {/* Seller card */}
              <div className="bg-white rounded-3xl border border-[#E8E6DF] p-5">
                <div className="flex items-center gap-3 mb-4">
                  <Avatar src={listing.seller.avatar} name={listing.seller.name} size="lg" verified={listing.seller.verified} />
                  <div>
                    <p className="font-semibold text-[#1B2A4A]">{listing.seller.name}</p>
                    <p className="text-xs text-[#8A9AB5]">{listing.seller.neighborhood} · Member since {listing.seller.memberSince}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <StarRating rating={listing.seller.rating} count={listing.seller.reviews} size="xs" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-[#F5F4EF] rounded-xl p-2 text-center">
                    <p className="font-bold text-[#1B2A4A] text-sm">{listing.seller.transactions}</p>
                    <p className="text-[9px] text-[#8A9AB5]">Sales</p>
                  </div>
                  <div className="bg-[#F5F4EF] rounded-xl p-2 text-center">
                    <p className="font-bold text-[#1B2A4A] text-sm">{listing.seller.responseTime}</p>
                    <p className="text-[9px] text-[#8A9AB5]">Response</p>
                  </div>
                  <div className="bg-[#F5F4EF] rounded-xl p-2 text-center">
                    <p className="font-bold text-[#2D6A4F] text-sm">{fromApi ? '—' : '4.9★'}</p>
                    <p className="text-[9px] text-[#8A9AB5]">Rating</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-4">
                  {listing.seller.verified && <Badge variant="green" size="sm">✓ Email verified</Badge>}
                  {listing.seller.idVerified && <Badge variant="green" size="sm">🪪 ID verified</Badge>}
                  <Badge variant="blue" size="sm">⚡ Fast replies</Badge>
                </div>

                <button onClick={() => onNavigate('profile')} className="w-full py-2 text-sm font-medium text-[#2D6A4F] border border-[#2D6A4F]/30 rounded-xl hover:bg-[#F0FBF3] transition-colors">
                  View full profile
                </button>
              </div>

              {/* Report */}
              <button
                onClick={() => setReported(true)}
                className={`w-full text-xs font-medium text-center py-2 transition-colors ${reported ? 'text-[#E8694A]' : 'text-[#C5CCDA] hover:text-[#8A9AB5]'}`}
              >
                {reported ? '✓ Report submitted' : 'Report this listing'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile sticky actions */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E8E6DF] px-4 py-3 flex gap-3 md:hidden">
        <button onClick={() => void toggleSaved()} className={`w-12 h-12 rounded-full border flex items-center justify-center flex-shrink-0 ${saved ? 'bg-[#FDE8E0] border-[#E8694A]' : 'bg-white border-[#E8E6DF]'}`}>
          <Icon name="heart" size={18} className={saved ? 'fill-[#E8694A] stroke-[#E8694A]' : 'stroke-[#5C6E8A]'} />
        </button>
        <Button variant="primary" size="md" fullWidth onClick={() => setMessageOpen(true)}>
          <Icon name="message" size={15} />
          Message seller
        </Button>
        <Button variant="secondary" size="md" fullWidth onClick={() => setOfferOpen(!offerOpen)}>
          Make offer
        </Button>
      </div>

      {/* Message modal */}
      {messageOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 animate-fade-in-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-semibold text-[#1B2A4A]">Message {listing.seller.name.split(' ')[0]}</h3>
              <button onClick={() => setMessageOpen(false)} className="w-8 h-8 rounded-full bg-[#F5F4EF] flex items-center justify-center hover:bg-[#E8E6DF] transition-colors">
                <Icon name="x" size={14} />
              </button>
            </div>
            {/* Listing preview */}
            <div className="flex gap-3 p-3 bg-[#F5F4EF] rounded-xl mb-4">
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#E8E6DF]">
                {cover(listing.images[0], 'w=100&h=100&fit=crop') && (
                  <img src={cover(listing.images[0], 'w=100&h=100&fit=crop')!} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-[#1B2A4A] line-clamp-1">{listing.title}</p>
                <p className="text-xs text-[#8A9AB5]">{listing.isFree ? 'Free' : listing.price != null ? `$${listing.price.toLocaleString()}` : 'OBO'}</p>
              </div>
            </div>
            {messageSent ? (
              <div className="text-center py-4">
                <div className="text-3xl mb-2">✅</div>
                <p className="font-semibold text-[#1B2A4A]">Message sent!</p>
                <p className="text-sm text-[#8A9AB5]">Redirecting to messages...</p>
              </div>
            ) : (
              <>
                {/* Quick replies */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {['Is this still available?', 'Would you take $600?', 'Can I pick up this weekend?'].map(r => (
                    <button key={r} onClick={() => setMessage(r)} className="text-xs px-3 py-1.5 bg-[#F0FBF3] text-[#2D6A4F] border border-[#74C69D]/30 rounded-full hover:bg-[#D8F3DC] transition-colors font-medium">
                      {r}
                    </button>
                  ))}
                </div>
                {messageError && (
                  <div className="mb-3 rounded-xl border border-[#E8694A]/30 bg-[#FFF5F2] px-4 py-3 text-sm text-[#A63D27]" role="alert">
                    {messageError}
                  </div>
                )}
                <textarea
                  value={message}
                  onChange={e => { setMessage(e.target.value); setMessageError('') }}
                  placeholder="Ask about the item, availability, or suggest a meetup..."
                  rows={3}
                  className="w-full p-3 bg-[#F5F4EF] border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] resize-none focus:outline-none focus:border-[#2D6A4F] focus:bg-white transition-all"
                />
                <div className="flex justify-end mt-3">
                  <Button variant="primary" size="md" onClick={handleSendMessage} disabled={!message.trim()}>
                    <Icon name="send" size={14} />
                    Send message
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
