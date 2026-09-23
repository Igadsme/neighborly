import { useEffect, useState } from 'react'
import { ListingCard, SectionHeader, Icon } from '../components/ui'
import { type Listing } from '../data'
import { api, readStatus } from '../api/client'
import { listingFromApi } from '../lib/view'

type Page = 'explore' | 'listing' | 'housing' | 'services' | 'jobs' | 'community'

interface CategoriesProps {
  onNavigate: (p: Page, id?: string) => void
}

const mainCategories = [
  {
    emoji: '🛋️', label: 'For Sale', desc: 'Furniture, electronics, clothing & more',
    count: 2847, image: 'photo-1555041469-a586c61ea9bc', color: '#D8F3DC', accent: '#2D6A4F',
    trending: ['West Elm furniture', 'iPhone 14 Pro', 'Vintage records'],
    page: 'explore' as Page
  },
  {
    emoji: '🏠', label: 'Housing', desc: 'Apartments, rooms, houses & sublease',
    count: 634, image: 'photo-1560448204-e02f11c3d0e2', color: '#DDEEFF', accent: '#4A7FB5',
    trending: ['Studio Midtown', '2BR Inman Park', 'Room near MARTA'],
    page: 'housing' as Page
  },
  {
    emoji: '💼', label: 'Jobs & Gigs', desc: 'Full-time, part-time, freelance & local gigs',
    count: 412, image: 'photo-1521791136064-7986c2920216', color: '#FEF3C7', accent: '#D97706',
    trending: ['Barista', 'Graphic Designer', 'Electrician'],
    page: 'jobs' as Page
  },
  {
    emoji: '🔧', label: 'Services', desc: 'Cleaning, moving, repair, tutoring & more',
    count: 891, image: 'photo-1527515545081-5db817172677', color: '#FDE8E0', accent: '#E8694A',
    trending: ['House cleaning', 'Moving help', 'Photography'],
    page: 'services' as Page
  },
  {
    emoji: '🚗', label: 'Vehicles', desc: 'Cars, trucks, bikes, boats & parts',
    count: 523, image: 'photo-1494976388531-d1058494cdd8', color: '#EEF0F5', accent: '#5C6E8A',
    trending: ['2020 Honda', 'Trek bike', 'Truck parts'],
    page: 'explore' as Page
  },
  {
    emoji: '🎁', label: 'Free & Donate', desc: 'Things you\'d rather give than throw away',
    count: 203, image: 'photo-1569294617726-f36c4c3b7de0', color: '#D8F3DC', accent: '#2D6A4F',
    trending: ['IKEA furniture', 'Potted plants', 'Baby clothes'],
    page: 'explore' as Page
  },
  {
    emoji: '🌳', label: 'Community', desc: 'Discussions, announcements & neighborhood news',
    count: 318, image: 'photo-1560518883-ce09059eeffa', color: '#DDEEFF', accent: '#4A7FB5',
    trending: ['Road closure alerts', 'Neighborhood cleanup', 'Recommendations'],
    page: 'community' as Page
  },
  {
    emoji: '🎭', label: 'Events', desc: 'Local events, markets, workshops & meetups',
    count: 156, image: 'photo-1566438480900-0609be27a4be', color: '#FDE8E0', accent: '#E8694A',
    trending: ['Decatur Book Fest', 'Farmers markets', 'Art shows'],
    page: 'community' as Page
  },
  {
    emoji: '🔍', label: 'Lost & Found', desc: 'Help reunite lost pets, keys, and valuables',
    count: 47, image: 'photo-1587300003388-59208cc962cb', color: '#FEF3C7', accent: '#D97706',
    trending: ['Lost dogs', 'Found cats', 'Missing keys'],
    page: 'community' as Page
  },
  {
    emoji: '🐾', label: 'Pets', desc: 'Adoptable pets, supplies, pet care & boarding',
    count: 89, image: 'photo-1587300003388-59208cc962cb', color: '#FDE8E0', accent: '#E8694A',
    trending: ['Adopt a dog', 'Cat supplies', 'Dog grooming'],
    page: 'explore' as Page
  },
  {
    emoji: '🎟️', label: 'Tickets', desc: 'Concert, sports, event, and experience tickets',
    count: 67, image: 'photo-1492684223066-81342ee5ff30', color: '#EEF0F5', accent: '#5C6E8A',
    trending: ['Braves tickets', 'Concert tickets', 'Show passes'],
    page: 'explore' as Page
  },
  {
    emoji: '🏗️', label: 'Business & Equipment', desc: 'Commercial equipment, tools & supplies',
    count: 134, image: 'photo-1621905252507-b35492cc74b4', color: '#D8F3DC', accent: '#2D6A4F',
    trending: ['Restaurant equipment', 'Tools', 'Office furniture'],
    page: 'explore' as Page
  },
]

const trendingSearches = [
  'iPhone near Midtown', 'Moving help this weekend', 'Apartments under $1,500',
  'Free furniture Decatur', 'Bikes under $500', 'Photography services',
  'Used MacBook', 'Dog friendly housing', 'Part-time barista jobs'
]

const liveCategoryName: Record<string, string> = {
  Housing: 'Housing',
  'Jobs & Gigs': 'Jobs',
  Services: 'Services',
  Vehicles: 'Vehicles',
}

export default function Categories({ onNavigate }: CategoriesProps) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [empty, setEmpty] = useState(false)
  const [featured, setFeatured] = useState<Listing[]>([])
  const [featuredLoading, setFeaturedLoading] = useState(true)
  const [featuredError, setFeaturedError] = useState('')
  const [hoodCounts, setHoodCounts] = useState<Record<string, number> | null>(null)
  const [hoodError, setHoodError] = useState('')

  useEffect(() => {
    let active = true
    api.categories
      .list()
      .then((items) => {
        if (!active) return
        if (items.length === 0) {
          setEmpty(true)
          setCounts(null)
          return
        }
        const next: Record<string, number> = {}
        for (const item of items) next[item.name] = item.listingCount ?? 0
        setCounts(next)
      })
      .catch((cause: unknown) => {
        if (active) setError(readStatus(cause, 'Categories could not be loaded.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    api.listings
      .neighborhoods()
      .then((rows) => {
        if (!active) return
        const next: Record<string, number> = {}
        if (Array.isArray(rows)) {
          for (const row of rows) {
            if (row && typeof row.neighborhood === 'string' && typeof row.count === 'number') {
              next[row.neighborhood] = row.count
            }
          }
        }
        setHoodCounts(next)
      })
      .catch((cause: unknown) => {
        if (active) setHoodError(readStatus(cause, 'Neighborhood counts could not be loaded.'))
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    api.listings
      .list({ status: 'PUBLISHED', limit: 6 })
      .then((rows) => {
        if (active) setFeatured(rows.slice(0, 6).map((row) => listingFromApi(row)))
      })
      .catch((cause: unknown) => {
        if (active) setFeaturedError(readStatus(cause, 'Listings could not be loaded.'))
      })
      .finally(() => {
        if (active) setFeaturedLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="min-h-screen bg-[#FAFAF7] pb-24 md:pb-0">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-12">

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="font-display text-4xl md:text-5xl font-semibold text-[#1B2A4A] mb-3">
            Browse by category
          </h1>
          <p className="text-[#5C6E8A] text-lg max-w-2xl mx-auto">
            From furniture to jobs, housing to community events — everything happening in your neighborhood, organized.
          </p>
          {loading && <p className="text-sm text-[#8A9AB5] mt-4">Loading categories…</p>}
          {error && (
            <p className="text-sm text-[#A63D27] mt-4" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && empty && <p className="text-sm text-[#8A9AB5] mt-4">No categories yet.</p>}
        </div>

        {/* Trending searches */}
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="zap" size={15} className="text-[#E8694A]" />
            <span className="text-sm font-semibold text-[#5C6E8A] uppercase tracking-wide">Trending in Atlanta</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {trendingSearches.map(s => (
              <button
                key={s}
                onClick={() => onNavigate('explore')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E8E6DF] rounded-full text-sm text-[#1B2A4A] hover:border-[#2D6A4F] hover:text-[#2D6A4F] transition-all"
              >
                <Icon name="search" size={11} className="text-[#C5CCDA]" />
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Main category grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mb-14">
          {mainCategories.map(cat => {
            const liveName = liveCategoryName[cat.label]
            const live = liveName && counts ? counts[liveName] : undefined
            return (
            <button
              key={cat.label}
              onClick={() => onNavigate(cat.page)}
              className="group relative overflow-hidden rounded-3xl text-left card-hover border border-[#E8E6DF] h-52"
            >
              {/* Background image */}
              <div className="absolute inset-0">
                <img
                  src={`https://images.unsplash.com/${cat.image}?w=600&h=400&fit=crop&auto=format`}
                  alt={cat.label}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#1B2A4A]/85 via-[#1B2A4A]/30 to-transparent" />
              </div>

              {/* Content */}
              <div className="relative h-full flex flex-col justify-end p-5">
                {/* Count badge */}
                <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-sm border border-white/30 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                  {loading ? '…' : live !== undefined ? `${live.toLocaleString()} listings` : `${cat.count.toLocaleString()} near you`}
                </div>

                <span className="text-3xl mb-2">{cat.emoji}</span>
                <h3 className="font-display text-xl font-semibold text-white mb-0.5">{cat.label}</h3>
                <p className="text-sm text-white/70 mb-3">{cat.desc}</p>

                {/* Trending */}
                <div className="flex flex-wrap gap-1.5">
                  {cat.trending.map(t => (
                    <span key={t} className="text-xs bg-white/20 backdrop-blur-sm text-white px-2 py-0.5 rounded-full">{t}</span>
                  ))}
                </div>
              </div>
            </button>
            )
          })}
        </div>

        {/* Featured listings preview */}
        <section className="mb-12">
          <SectionHeader title="Featured in Atlanta" subtitle="Curated picks from trusted sellers" action={() => onNavigate('explore')} actionLabel="Browse all" />
          {featuredLoading && <p className="text-sm text-[#8A9AB5]">Loading listings…</p>}
          {featuredError && (
            <p className="text-sm text-[#A63D27]" role="alert">
              {featuredError}
            </p>
          )}
          {!featuredLoading && !featuredError && featured.length === 0 && (
            <p className="text-sm text-[#8A9AB5]">No featured listings yet.</p>
          )}
          {!featuredLoading && !featuredError && featured.length > 0 && (
            <div className="listing-grid">
              {featured.map(listing => (
                <ListingCard key={listing.id} listing={listing} onClick={() => onNavigate('listing', listing.id)} />
              ))}
            </div>
          )}
        </section>

        {/* Popular by neighborhood */}
        <section>
          <SectionHeader title="Popular in your neighborhoods" subtitle="What Inman Park and nearby areas are buying and selling" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['Inman Park', 'Decatur', 'Midtown', 'Grant Park', 'Little Five Points', 'Buckhead', 'East Atlanta', 'Westside'].map((hood, i) => (
              <button
                key={hood}
                onClick={() => onNavigate('explore')}
                className="bg-white border border-[#E8E6DF] rounded-2xl p-4 text-left hover:border-[#2D6A4F] transition-all group"
              >
                <div className="w-8 h-8 rounded-full bg-[#F0FBF3] flex items-center justify-center text-sm mb-3">
                  {['🏡', '🌳', '🏙️', '🌺', '🎨', '✨', '🌆', '🛤️'][i]}
                </div>
                <p className="font-semibold text-sm text-[#1B2A4A]">{hood}</p>
                <p className="text-xs text-[#8A9AB5] mt-0.5">
                  {hoodError ? 'Counts unavailable' : hoodCounts == null ? '…' : `${hoodCounts[hood] ?? 0} listings`}
                </p>
                <div className="flex items-center gap-1 mt-2 text-[#2D6A4F] text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  Browse <Icon name="chevronRight" size={10} />
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
