import { useState } from 'react'
import { Avatar, StarRating, Badge, Button, ListingCard, Icon } from '../components/ui'
import { sellers, listings } from '../data'

type Page = 'listing' | 'messages'

interface ProfileProps {
  onNavigate: (p: Page, id?: string) => void
}

const seller = sellers[0]

const reviews = [
  { reviewer: sellers[1], rating: 5, text: 'Marcus was very easy to work with — responsive, honest about the item\'s condition, and flexible on timing. Would definitely buy from him again!', date: '2 weeks ago', item: 'West Elm Sofa' },
  { reviewer: sellers[2], rating: 5, text: 'Fast communication, everything as described. The pickup was smooth and he helped carry it out.', date: '1 month ago', item: 'IKEA Bookshelf' },
  { reviewer: sellers[3], rating: 5, text: 'Excellent seller! Answered every question quickly and the item was in even better condition than the photos showed.', date: '2 months ago', item: 'Standing Desk' },
  { reviewer: sellers[5], rating: 4, text: 'Good seller overall. Took a couple days to respond initially, but once we connected everything went smoothly.', date: '3 months ago', item: 'Coffee Table' },
]

const userListings = listings.slice(0, 4)
const soldListings = listings.slice(2, 5)

export default function Profile({ onNavigate }: ProfileProps) {
  const [activeTab, setActiveTab] = useState<'listings' | 'reviews' | 'sold'>('listings')
  const [reported, setReported] = useState(false)
  const [following, setFollowing] = useState(false)

  const ratingBreakdown = [
    { stars: 5, percent: 89 },
    { stars: 4, percent: 8 },
    { stars: 3, percent: 2 },
    { stars: 2, percent: 1 },
    { stars: 1, percent: 0 },
  ]

  return (
    <div className="min-h-screen bg-[#FAFAF7] pb-24 md:pb-0">

      {/* Cover / header */}
      <div className="h-32 md:h-44 bg-gradient-to-br from-[#1B2A4A] via-[#2D6A4F] to-[#40916C] relative">
        <div className="absolute inset-0 opacity-10">
          <svg viewBox="0 0 400 200" className="w-full h-full">
            <circle cx="50" cy="50" r="80" fill="white" />
            <circle cx="350" cy="150" r="100" fill="white" />
            <circle cx="200" cy="200" r="60" fill="white" />
          </svg>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6">
        {/* Profile header */}
        <div className="relative -mt-16 md:-mt-20 mb-6">
          <div className="flex items-end justify-between">
            <div className="flex items-end gap-4">
              <div className="relative">
                <Avatar
                  src={seller.avatar}
                  name={seller.name}
                  size="xl"
                  className="border-4 border-white shadow-lg"
                />
                {seller.verified && (
                  <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#2D6A4F] rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                    <Icon name="check" size={12} className="text-white" />
                  </div>
                )}
              </div>
              <div className="pb-2 hidden md:block">
                <div className="flex items-center gap-2 mb-0.5">
                  <h1 className="font-display text-2xl font-semibold text-[#1B2A4A]">{seller.name}</h1>
                  {seller.idVerified && <Badge variant="green">🪪 ID Verified</Badge>}
                </div>
                <p className="text-[#8A9AB5] text-sm">{seller.neighborhood}, Atlanta · Member since {seller.memberSince}</p>
              </div>
            </div>
            <div className="flex gap-2 pb-2">
              <button
                onClick={() => setFollowing(!following)}
                className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${following ? 'bg-[#2D6A4F] text-white border-[#2D6A4F]' : 'bg-white text-[#1B2A4A] border-[#E8E6DF] hover:border-[#2D6A4F]'}`}
              >
                {following ? '✓ Following' : 'Follow'}
              </button>
              <Button variant="primary" size="sm" onClick={() => onNavigate('messages')}>
                <Icon name="message" size={13} />
                Message
              </Button>
            </div>
          </div>

          {/* Mobile name */}
          <div className="mt-4 md:hidden">
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className="font-display text-2xl font-semibold text-[#1B2A4A]">{seller.name}</h1>
              {seller.idVerified && <Badge variant="green">🪪 ID</Badge>}
            </div>
            <p className="text-[#8A9AB5] text-sm">{seller.neighborhood} · Member since {seller.memberSince}</p>
          </div>
        </div>

        {/* Trust stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Rating', value: `${seller.rating}★`, color: 'text-[#F59E0B]', bg: 'bg-[#FEF3C7]', icon: '⭐' },
            { label: 'Reviews', value: `${seller.reviews}`, color: 'text-[#1B2A4A]', bg: 'bg-[#F0FBF3]', icon: '💬' },
            { label: 'Sales', value: `${seller.transactions}`, color: 'text-[#1B2A4A]', bg: 'bg-[#DDEEFF]', icon: '✅' },
            { label: 'Response', value: seller.responseTime, color: 'text-[#1B2A4A]', bg: 'bg-[#FDE8E0]', icon: '⚡' },
          ].map(stat => (
            <div key={stat.label} className={`${stat.bg} rounded-2xl p-4 text-center`}>
              <div className="text-2xl mb-1">{stat.icon}</div>
              <p className={`font-bold text-lg font-display ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-[#8A9AB5] font-medium">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Verification badges */}
        <div className="flex flex-wrap gap-2 mb-8">
          <Badge variant="green">✓ Email verified</Badge>
          {seller.idVerified && <Badge variant="green">🪪 ID verified</Badge>}
          <Badge variant="blue">⚡ Responds in {seller.responseTime}</Badge>
          <Badge variant="navy">👤 {seller.transactions} completed transactions</Badge>
          <Badge variant="amber">🏆 Top seller — Decatur</Badge>
        </div>

        {/* About */}
        <div className="bg-white rounded-2xl border border-[#E8E6DF] p-5 mb-6">
          <h2 className="font-semibold text-[#1B2A4A] mb-2">About</h2>
          <p className="text-sm text-[#5C6E8A] leading-relaxed">
            Hey, I'm Marcus — been in the Decatur area for 8 years. I sell quality items that I've actually used and cared for. Honest descriptions, fair prices, flexible on pickup times. Happy to answer any questions before you decide.
          </p>
        </div>

        {/* Safety info */}
        <div className="bg-[#F0FBF3] border border-[#74C69D]/30 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <Icon name="shield" size={16} className="text-[#2D6A4F] mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-sm text-[#1B2A4A]">Neighborly verified seller</p>
            <p className="text-xs text-[#5C6E8A] mt-0.5">Marcus has completed identity verification, has 47 positive reviews, and has been a member since January 2022. His response rate is 98%.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[#F5F4EF] p-1 rounded-xl mb-6">
          {[
            { id: 'listings', label: `Active Listings (${userListings.length})` },
            { id: 'reviews', label: `Reviews (${seller.reviews})` },
            { id: 'sold', label: `Sold (${soldListings.length})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-white text-[#1B2A4A] shadow-sm' : 'text-[#8A9AB5] hover:text-[#1B2A4A]'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Listings tab */}
        {activeTab === 'listings' && (
          <div className="listing-grid">
            {userListings.map(listing => (
              <ListingCard key={listing.id} listing={listing} onClick={() => onNavigate('listing', listing.id)} />
            ))}
          </div>
        )}

        {/* Reviews tab */}
        {activeTab === 'reviews' && (
          <div>
            {/* Rating summary */}
            <div className="bg-white rounded-2xl border border-[#E8E6DF] p-5 mb-6">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-5xl font-bold font-display text-[#1B2A4A]">{seller.rating}</p>
                  <div className="flex text-[#F59E0B] my-1">{'★★★★★'.split('').map((s, i) => <span key={i}>{s}</span>)}</div>
                  <p className="text-xs text-[#8A9AB5]">{seller.reviews} reviews</p>
                </div>
                <div className="flex-1">
                  {ratingBreakdown.map(({ stars, percent }) => (
                    <div key={stars} className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-[#8A9AB5] w-4">{stars}</span>
                      <span className="text-[#F59E0B] text-xs">★</span>
                      <div className="flex-1 h-2 bg-[#F5F4EF] rounded-full overflow-hidden">
                        <div className="h-full bg-[#F59E0B] rounded-full" style={{ width: `${percent}%` }} />
                      </div>
                      <span className="text-xs text-[#8A9AB5] w-8 text-right">{percent}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {reviews.map((review, i) => (
                <div key={i} className="bg-white rounded-2xl border border-[#E8E6DF] p-5">
                  <div className="flex items-start gap-3">
                    <Avatar src={review.reviewer.avatar} name={review.reviewer.name} size="sm" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-semibold text-sm text-[#1B2A4A]">{review.reviewer.name}</p>
                        <span className="text-xs text-[#C5CCDA]">{review.date}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex">
                          {[...Array(review.rating)].map((_, j) => <span key={j} className="text-[#F59E0B] text-xs">★</span>)}
                        </div>
                        <span className="text-xs text-[#C5CCDA]">·</span>
                        <span className="text-xs text-[#8A9AB5]">{review.item}</span>
                      </div>
                      <p className="text-sm text-[#5C6E8A] leading-relaxed">{review.text}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sold tab */}
        {activeTab === 'sold' && (
          <div className="listing-grid">
            {soldListings.map(listing => (
              <div key={listing.id} className="relative">
                <ListingCard listing={{ ...listing, saved: false }} onClick={() => {}} />
                <div className="absolute inset-0 bg-white/70 rounded-2xl flex items-center justify-center">
                  <Badge variant="navy">Sold</Badge>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Report */}
        <div className="text-center mt-8">
          <button
            onClick={() => setReported(true)}
            className={`text-xs font-medium transition-colors ${reported ? 'text-[#E8694A]' : 'text-[#C5CCDA] hover:text-[#8A9AB5]'}`}
          >
            {reported ? '✓ Report submitted. Our team will review this profile.' : 'Report this profile'}
          </button>
        </div>
      </div>
    </div>
  )
}
