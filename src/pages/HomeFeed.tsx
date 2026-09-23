import { useEffect, useState } from 'react'
import { ListingCard, SectionHeader, Badge, Avatar, StarRating, Icon, Button, LoadState } from '../components/ui'
import { type Listing } from '../data'
import { api, readStatus } from '../api/client'
import { listingFromApi, mediaSrc } from '../lib/view'
import { communityEventCard, communityPostCard, serviceCard, type CommunityEventCard, type CommunityPostCard, type ServiceCard } from '../lib/verticals'

type Page = 'home' | 'explore' | 'categories' | 'map' | 'listing' | 'create' | 'messages' | 'saved' | 'profile' | 'dashboard' | 'housing' | 'services' | 'jobs' | 'community'

interface HomeFeedProps {
  onNavigate: (p: Page, id?: string) => void
}

const quickCategories = [
  { emoji: '🛋️', label: 'Furniture', active: false },
  { emoji: '📱', label: 'Electronics', active: false },
  { emoji: '🚗', label: 'Vehicles', active: false },
  { emoji: '🏠', label: 'Housing', active: false },
  { emoji: '🎁', label: 'Free', active: false },
  { emoji: '🔧', label: 'Services', active: false },
  { emoji: '💼', label: 'Jobs', active: false },
  { emoji: '🌳', label: 'Community', active: false },
]

const suggestedPeople = [
  { name: 'Sofia Martinez', neighborhood: 'Little Five Points', avatar: 'photo-1534528741775-53994a69daeb', rating: 4.9, transactions: 33 },
  { name: 'Nadia Okonkwo', neighborhood: 'Westside', avatar: 'photo-1544005313-94ddf0286df2', rating: 4.9, transactions: 26 },
  { name: 'Tyler Brooks', neighborhood: 'East Atlanta', avatar: 'photo-1570295999919-56ceb5ecca61', rating: 4.5, transactions: 10 },
]

function ListingThumb({ listing, free }: { listing: Listing; free?: boolean }) {
  const src = mediaSrc(listing.images[0], 'w=160&h=160&fit=crop&auto=format')
  return (
    <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-[#F5F4EF] relative">
      {src && <img src={src} alt={listing.title} className="w-full h-full object-cover" />}
      {free && (
        <div className="absolute top-1 left-1 bg-[#2D6A4F] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">FREE</div>
      )}
    </div>
  )
}

export default function HomeFeed({ onNavigate }: HomeFeedProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [newToday, setNewToday] = useState<Listing[]>([])
  const [listingsLoading, setListingsLoading] = useState(true)
  const [listingsError, setListingsError] = useState('')
  const [firstName, setFirstName] = useState('')
  const [services, setServices] = useState<ServiceCard[]>([])
  const [events, setEvents] = useState<CommunityEventCard[]>([])
  const [posts, setPosts] = useState<CommunityPostCard[]>([])
  const [verticalsLoading, setVerticalsLoading] = useState(true)
  const [verticalsError, setVerticalsError] = useState('')
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  useEffect(() => {
    let active = true
    api.listings
      .list({ limit: 24 })
      .then((rows) => {
        if (!active) return
        const cards = rows.map((row) => listingFromApi(row))
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000
        const fresh = new Set(
          rows
            .filter((row) => row.createdAt && new Date(row.createdAt).getTime() >= dayAgo)
            .map((row) => row.id),
        )
        setListings(cards)
        setNewToday(cards.filter((card) => fresh.has(card.id)).slice(0, 4))
      })
      .catch((cause: unknown) => {
        if (active) setListingsError(readStatus(cause, 'Listings could not be loaded.'))
      })
      .finally(() => {
        if (active) setListingsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    api.auth
      .me()
      .then((me) => {
        if (active) setFirstName(me.profile?.firstName?.trim() || '')
      })
      .catch(() => undefined)
    Promise.all([api.services.list({ limit: 3 }), api.community.events(), api.community.posts({ limit: 3 })])
      .then(([serviceRows, eventRows, postRows]) => {
        if (!active) return
        setServices(serviceRows.map(serviceCard))
        setEvents(eventRows.slice(0, 3).map(communityEventCard))
        setPosts(postRows.map(communityPostCard))
      })
      .catch((cause: unknown) => {
        if (active) setVerticalsError(readStatus(cause, 'Neighborhood picks could not be loaded.'))
      })
      .finally(() => {
        if (active) setVerticalsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const freeListings = listings.filter((listing) => listing.isFree).slice(0, 3)

  return (
    <div className="min-h-screen bg-[#FAFAF7] pb-24 md:pb-0">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">

        {/* Greeting + Search */}
        <div className="mb-8">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-semibold text-[#1B2A4A]">
                {greeting}, <em className="not-italic text-[#2D6A4F]">{firstName || 'there'}</em> 👋
              </h1>
              <button className="flex items-center gap-1 text-sm text-[#5C6E8A] mt-1 hover:text-[#2D6A4F] transition-colors">
                <Icon name="mapPin" size={13} className="text-[#E8694A]" />
                Inman Park · Atlanta, GA
                <Icon name="chevronDown" size={12} />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => onNavigate('dashboard')} className="hidden md:flex items-center gap-2 px-4 py-2 bg-white border border-[#E8E6DF] rounded-xl text-sm font-medium text-[#5C6E8A] hover:text-[#1B2A4A] transition-colors">
                <Icon name="trendingUp" size={14} />
                My Dashboard
              </button>
              <button onClick={() => onNavigate('create')} className="flex items-center gap-2 px-4 py-2 bg-[#2D6A4F] text-white rounded-xl text-sm font-semibold hover:bg-[#1B4332] transition-colors">
                <Icon name="plus" size={14} />
                Post
              </button>
            </div>
          </div>

          {/* Main search */}
          <div className="relative mt-4">
            <Icon name="search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#C5CCDA] pointer-events-none" />
            <input
              type="text"
              placeholder="Search for anything nearby — furniture, services, housing..."
              onClick={() => onNavigate('explore')}
              readOnly
              className="w-full h-13 pl-12 pr-4 bg-white border border-[#E8E6DF] rounded-2xl text-sm text-[#1B2A4A] placeholder:text-[#C5CCDA] focus:outline-none cursor-pointer shadow-sm hover:border-[#2D6A4F]/30 transition-colors"
            />
          </div>

          {/* Quick categories */}
          <div className="flex gap-2 mt-4 overflow-x-auto scrollbar-hide pb-1">
            {quickCategories.map(cat => (
              <button
                key={cat.label}
                onClick={() => setActiveCategory(activeCategory === cat.label ? null : cat.label)}
                className={`flex items-center gap-1.5 flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                  activeCategory === cat.label
                    ? 'bg-[#2D6A4F] text-white border-[#2D6A4F]'
                    : 'bg-white text-[#5C6E8A] border-[#E8E6DF] hover:border-[#2D6A4F]/50 hover:text-[#1B2A4A]'
                }`}
              >
                <span>{cat.emoji}</span>
                {cat.label}
              </button>
            ))}
            <button onClick={() => onNavigate('categories')} className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium border border-[#E8E6DF] text-[#8A9AB5] hover:text-[#1B2A4A] bg-white whitespace-nowrap">
              All →
            </button>
          </div>
        </div>

        {/* Alert: Free items nearby */}
        <div className="flex items-center gap-3 p-4 bg-[#D8F3DC] border border-[#74C69D] rounded-2xl mb-8 cursor-pointer hover:bg-[#B7E4C7] transition-colors">
          <span className="text-2xl">🎁</span>
          <div className="flex-1">
            <p className="font-semibold text-[#1B4332] text-sm">
              {listingsLoading
                ? 'Checking free items near you'
                : freeListings.length
                  ? `${freeListings.length} free item${freeListings.length === 1 ? '' : 's'} near you`
                  : 'No free items posted nearby yet'}
            </p>
            <p className="text-xs text-[#2D6A4F]">
              {freeListings.length ? 'Just posted in your neighborhood' : 'Free listings will show up here when neighbors post them'}
            </p>
          </div>
          <Icon name="chevronRight" size={16} className="text-[#2D6A4F] flex-shrink-0" />
        </div>

        {/* Nearby listings */}
        <section className="mb-10">
          <SectionHeader
            title="Nearby listings"
            subtitle="Fresh picks within 2 miles"
            action={() => onNavigate('explore')}
            actionLabel="See all"
          />
          {listingsLoading ? (
            <div className="bg-white rounded-2xl border border-[#E8E6DF] p-8 text-center text-sm text-[#8A9AB5]">
              Loading listings…
            </div>
          ) : listingsError ? (
            <div className="bg-[#FFF5F2] border border-[#E8694A]/20 rounded-2xl p-5 text-sm text-[#C4512D]">
              {listingsError}
            </div>
          ) : listings.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E8E6DF] p-8 text-center text-sm text-[#8A9AB5]">
              No listings nearby yet.
            </div>
          ) : (
            <div className="listing-grid">
              {listings.slice(0, 8).map(listing => (
                <ListingCard key={listing.id} listing={listing} onClick={() => onNavigate('listing', listing.id)} />
              ))}
            </div>
          )}
        </section>

        {/* Two-column layout: Recommended + Free */}
        <div className="grid md:grid-cols-2 gap-6 mb-10">
          {/* Recommended for you */}
          <div>
            <SectionHeader title="Recommended for you" subtitle="Based on your interests" action={() => onNavigate('explore')} actionLabel="More" />
            {listingsLoading ? (
              <LoadState loading loadingLabel="Loading listings…" />
            ) : listings.slice(2, 5).length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#E8E6DF] p-8 text-center text-sm text-[#8A9AB5]">No recommendations yet.</div>
            ) : (
            <div className="space-y-3">
              {listings.slice(2, 5).map(listing => (
                <div key={listing.id} onClick={() => onNavigate('listing', listing.id)} className="flex gap-3 bg-white rounded-2xl border border-[#E8E6DF] p-3 cursor-pointer hover:border-[#2D6A4F]/30 transition-all card-hover">
                  <ListingThumb listing={listing} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[#1B2A4A] line-clamp-1">{listing.title}</p>
                    <p className="text-xs text-[#8A9AB5] mt-0.5">{listing.neighborhood} · {listing.distance}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="font-bold text-sm text-[#1B2A4A]">
                        {listing.isFree ? <span className="text-[#2D6A4F]">Free</span> : `$${listing.price?.toLocaleString()}`}
                      </span>
                      {listing.condition && <Badge variant="navy" size="sm">{listing.condition}</Badge>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>

          {/* Free near you */}
          <div>
            <SectionHeader title="Free near you" subtitle="Give, get, reduce waste" action={() => onNavigate('explore')} actionLabel="More" />
            {listingsLoading ? (
              <LoadState loading loadingLabel="Loading listings…" />
            ) : freeListings.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#E8E6DF] p-8 text-center text-sm text-[#8A9AB5]">No free listings nearby yet.</div>
            ) : (
            <div className="space-y-3">
              {freeListings.map((listing) => (
                <div key={listing.id} onClick={() => onNavigate('listing', listing.id)} className="flex gap-3 bg-white rounded-2xl border border-[#E8E6DF] p-3 cursor-pointer hover:border-[#74C69D]/50 transition-all card-hover">
                  <ListingThumb listing={listing} free />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[#1B2A4A] line-clamp-2">{listing.title}</p>
                    <p className="text-xs text-[#8A9AB5] mt-0.5">{listing.neighborhood} · {listing.distance}</p>
                    <p className="text-xs text-[#E8694A] font-medium mt-1">{listing.postedAt}</p>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        </div>

        {/* Local Services */}
        <section className="mb-10">
          <SectionHeader title="Local services" subtitle="Trusted providers in your area" action={() => onNavigate('services')} actionLabel="Browse all" />
          {verticalsLoading ? (
            <LoadState loading loadingLabel="Loading services…" />
          ) : verticalsError ? (
            <LoadState error={verticalsError} loadingLabel="Loading services…" />
          ) : services.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E8E6DF] p-8 text-center text-sm text-[#8A9AB5]">No local services yet.</div>
          ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {services.slice(0, 3).map(svc => {
              const photo = mediaSrc(svc.image, 'w=400&h=300&fit=crop&auto=format')
              return (
              <div key={svc.id} onClick={() => onNavigate('services')} className="bg-white rounded-2xl border border-[#E8E6DF] overflow-hidden cursor-pointer card-hover">
                <div className="h-28 overflow-hidden bg-[#F5F4EF]">
                  {photo && <img src={photo} alt={svc.title} className="w-full h-full object-cover" />}
                </div>
                <div className="p-3">
                  <p className="font-semibold text-sm text-[#1B2A4A]">{svc.title}</p>
                  <p className="text-xs text-[#8A9AB5] mt-0.5">from ${svc.startingPrice.toLocaleString()}</p>
                  <div className="flex items-center justify-between mt-2">
                    <StarRating rating={svc.rating} count={svc.reviews} size="xs" />
                    {svc.backgroundCheck && <Badge variant="green" size="sm">BG Check</Badge>}
                  </div>
                </div>
              </div>
              )
            })}
          </div>
          )}
        </section>

        {/* Community Events */}
        <section className="mb-10">
          <SectionHeader title="Community events" subtitle="What's happening this weekend" action={() => onNavigate('community')} actionLabel="See all" />
          {verticalsLoading ? (
            <LoadState loading loadingLabel="Loading events…" />
          ) : verticalsError ? null : events.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E8E6DF] p-8 text-center text-sm text-[#8A9AB5]">No community events yet.</div>
          ) : (
          <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
            {events.map(event => {
              const photo = mediaSrc(event.image, 'w=400&h=200&fit=crop&auto=format')
              return (
              <div key={event.id} onClick={() => onNavigate('community')} className="flex-shrink-0 w-64 bg-white rounded-2xl border border-[#E8E6DF] overflow-hidden card-hover cursor-pointer">
                <div className="h-32 overflow-hidden bg-[#F5F4EF]">
                  {photo && <img src={photo} alt={event.title} className="w-full h-full object-cover" />}
                </div>
                <div className="p-4">
                  <p className="font-semibold text-sm text-[#1B2A4A] leading-tight">{event.title}</p>
                  <p className="text-xs text-[#E8694A] font-medium mt-1">{event.date} · {event.time}</p>
                  <p className="text-xs text-[#8A9AB5] mt-0.5">{event.neighborhood}</p>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#F5F4EF]">
                    <span className="text-xs text-[#5C6E8A]">👥 {event.attending} attending</span>
                    <Badge variant="blue" size="sm">RSVP</Badge>
                  </div>
                </div>
              </div>
              )
            })}
          </div>
          )}
        </section>

        {/* Community Posts */}
        <section className="mb-10">
          <SectionHeader title="Community discussions" subtitle="What neighbors are talking about" action={() => onNavigate('community')} actionLabel="Join the conversation" />
          {verticalsLoading ? (
            <LoadState loading loadingLabel="Loading discussions…" />
          ) : verticalsError ? null : posts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E8E6DF] p-8 text-center text-sm text-[#8A9AB5]">No community discussions yet.</div>
          ) : (
          <div className="space-y-3">
            {posts.slice(0, 3).map(post => (
              <div key={post.id} onClick={() => onNavigate('community')} className="bg-white rounded-2xl border border-[#E8E6DF] p-5 cursor-pointer hover:border-[#2D6A4F]/30 transition-all">
                <div className="flex items-start gap-3">
                  <Avatar src={post.author.avatar} name={post.author.name} size="sm" verified={post.author.verified} />
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs font-semibold text-[#8A9AB5]">{post.author.name} · {post.author.neighborhood} · {post.postedAt}</span>
                        <h4 className="font-semibold text-sm text-[#1B2A4A] mt-0.5">{post.title}</h4>
                      </div>
                      <Badge variant={
                        post.type === 'discussion' ? 'gray' :
                        post.type === 'announcement' ? 'blue' :
                        post.type === 'lost_found' ? 'amber' :
                        post.type === 'giveaway' ? 'green' :
                        post.type === 'event' ? 'coral' : 'gray'
                      } size="sm">
                        {post.type === 'lost_found' ? 'Lost & Found' : post.type.charAt(0).toUpperCase() + post.type.slice(1)}
                      </Badge>
                    </div>
                    <p className="text-sm text-[#5C6E8A] mt-1 line-clamp-2">{post.body}</p>
                    <div className="flex items-center gap-4 mt-3 text-xs text-[#8A9AB5]">
                      <span>❤️ {post.reactions.love + post.reactions.like + post.reactions.wow} reactions</span>
                      <span>💬 {post.replies} replies</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          )}
        </section>

        {/* People to follow */}
        <section className="mb-10">
          <SectionHeader title="Neighbors to follow" subtitle="Preview · Examples. Not live ratings." />
          <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
            {suggestedPeople.map(person => (
              <div key={person.name} className="flex-shrink-0 w-48 bg-white rounded-2xl border border-[#E8E6DF] p-4 text-center">
                <Avatar src={person.avatar} name={person.name} size="lg" verified className="mx-auto mb-3" />
                <p className="font-semibold text-sm text-[#1B2A4A]">{person.name}</p>
                <p className="text-xs text-[#8A9AB5] mt-0.5">{person.neighborhood}</p>
                <div className="flex justify-center mt-2 mb-3" title="Preview example, not a live rating">
                  <StarRating rating={person.rating} count={person.transactions} size="xs" />
                </div>
                <Button variant="soft" size="xs" fullWidth disabled>Follow</Button>
                <p className="text-[10px] text-[#8A9AB5] mt-2">Following isn't available yet.</p>
              </div>
            ))}
          </div>
        </section>

        {/* New Today */}
        <section className="mb-10">
          <SectionHeader title="New today" subtitle="Just posted in the last 24 hours" action={() => onNavigate('explore')} actionLabel="See all" />
          {listingsLoading ? (
            <LoadState loading loadingLabel="Loading listings…" />
          ) : newToday.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E8E6DF] p-8 text-center text-sm text-[#8A9AB5]">Nothing new in the last 24 hours.</div>
          ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {newToday.map(listing => (
              <ListingCard key={listing.id} listing={listing} onClick={() => onNavigate('listing', listing.id)} compact />
            ))}
          </div>
          )}
        </section>

        {/* Map teaser */}
        <div
          onClick={() => onNavigate('map')}
          className="relative rounded-3xl overflow-hidden cursor-pointer group h-48 md:h-64 bg-[#EEF0F5]"
        >
          <img
            src="https://images.unsplash.com/photo-1524813686514-a57563d77965?w=1200&h=500&fit=crop&auto=format"
            alt="Map view"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#1B2A4A]/80 to-transparent flex items-center p-8">
            <div>
              <p className="text-[#74C69D] text-sm font-semibold mb-1">Explore the map</p>
              <h3 className="font-display text-2xl md:text-3xl font-semibold text-white mb-2">See everything nearby</h3>
              <p className="text-white/70 text-sm mb-4 max-w-xs">Browse listings, safe meetup spots, and neighborhood boundaries on an interactive map.</p>
              <Button variant="soft" size="sm">Open Map →</Button>
            </div>
          </div>
          {/* Animated pins */}
          <div className="absolute top-8 right-24 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center text-sm animate-bounce">📍</div>
          <div className="absolute top-16 right-40 w-7 h-7 bg-[#2D6A4F] rounded-full shadow-lg flex items-center justify-center text-white text-xs font-bold">$650</div>
          <div className="absolute bottom-12 right-20 w-7 h-7 bg-[#E8694A] rounded-full shadow-lg flex items-center justify-center text-white text-xs font-bold">Free</div>
        </div>
      </div>
    </div>
  )
}
