import { useEffect, useState } from "react"
import {
  ListingCard,
  SectionHeader,
  Badge,
  Icon,
  Button,
} from "../components/ui"
import { api, ApiError } from "../api/client"
import type { CurrentUser } from "../api/types"
import type { Listing } from "../data"
import { mapApiListing } from "../api/listing-mapper"

type Page = "home" | "explore" | "categories" | "map" | "listing" | "create" | "messages" | "saved" | "profile" | "dashboard" | "housing" | "services" | "jobs" | "community"

interface HomeFeedProps {
  onNavigate: (p: Page, entityId?: string) => void
}

export default function HomeFeed({ onNavigate }: HomeFeedProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [categories, setCategories] = useState<Array<{
    id: string
    name: string
    slug: string
  }>>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [listingsLoading, setListingsLoading] = useState(true)
  const [listingsError, setListingsError] = useState("")
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const loadListings = () => {
    setListingsLoading(true)
    setListingsError("")
    const category = categories.find((item) => item.name === activeCategory)
    Promise.all([
      api.listings.list({
        limit: 24,
        ...(activeCategory === "Free" ? { freeOnly: true } : {}),
        ...(category ? { categoryId: category.id } : {}),
      }),
      api.listings.favorites(),
    ])
      .then(([data, favorites]) => {
        const savedIds = new Set(
          favorites.map((favorite) => favorite.listing.id),
        )
        setListings(
          data.map((listing) =>
            mapApiListing(listing, savedIds.has(listing.id)),
          ),
        )
      })
      .catch((cause: unknown) =>
        setListingsError(
          cause instanceof ApiError
            ? cause.message
            : "Could not load marketplace listings.",
        ),
      )
      .finally(() => setListingsLoading(false))
  }
  useEffect(() => {
    api.categories
      .list()
      .then(setCategories)
      .catch(() => setCategories([]))
    api.auth
      .me()
      .then(setCurrentUser)
      .catch(() => setCurrentUser(null))
  }, [])
  useEffect(() => {
    loadListings()
  }, [activeCategory, categories])
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
  const firstName = currentUser?.profile?.firstName ?? "Neighbor"
  const neighborhood = [
    currentUser?.profile?.neighborhood,
    currentUser?.profile?.city,
    currentUser?.profile?.state,
  ]
    .filter(Boolean)
    .join(", ")

  return (
    <div className="min-h-screen bg-[#FAFAF7] pb-24 md:pb-0">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {/* Greeting + Search */}
        <div className="mb-8">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-semibold text-[#1B2A4A]">
                {greeting},{" "}
                <em className="not-italic text-[#2D6A4F]">{firstName}</em> 👋
              </h1>
              <div className="flex items-center gap-1 text-sm text-[#5C6E8A] mt-1">
                <Icon name="mapPin" size={13} className="text-[#E8694A]" />
                {neighborhood || "Neighborhood not set"}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onNavigate("dashboard")}
                className="hidden md:flex items-center gap-2 px-4 py-2 bg-white border border-[#E8E6DF] rounded-xl text-sm font-medium text-[#5C6E8A] hover:text-[#1B2A4A] transition-colors"
              >
                <Icon name="trendingUp" size={14} />
                My Dashboard
              </button>
              <button
                onClick={() => onNavigate("create")}
                className="flex items-center gap-2 px-4 py-2 bg-[#2D6A4F] text-white rounded-xl text-sm font-semibold hover:bg-[#1B4332] transition-colors"
              >
                <Icon name="plus" size={14} />
                Post
              </button>
            </div>
          </div>

          {/* Main search */}
          <div className="relative mt-4">
            <Icon
              name="search"
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[#C5CCDA] pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search for anything nearby — furniture, services, housing..."
              onClick={() => onNavigate("explore")}
              readOnly
              className="w-full h-13 pl-12 pr-4 bg-white border border-[#E8E6DF] rounded-2xl text-sm text-[#1B2A4A] placeholder:text-[#C5CCDA] focus:outline-none cursor-pointer shadow-sm hover:border-[#2D6A4F]/30 transition-colors"
            />
          </div>

          {/* Quick categories */}
          <div className="flex gap-2 mt-4 overflow-x-auto scrollbar-hide pb-1">
            {[
              ...categories.map((category) => ({
                label: category.name,
                emoji: "🏷️",
              })),
              { label: "Free", emoji: "🎁" },
            ].map((cat) => (
              <button
                key={cat.label}
                onClick={() =>
                  setActiveCategory(
                    activeCategory === cat.label ? null : cat.label,
                  )
                }
                className={`flex items-center gap-1.5 flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                  activeCategory === cat.label
                    ? "bg-[#2D6A4F] text-white border-[#2D6A4F]"
                    : "bg-white text-[#5C6E8A] border-[#E8E6DF] hover:border-[#2D6A4F]/50 hover:text-[#1B2A4A]"
                }`}
              >
                <span>{cat.emoji}</span>
                {cat.label}
              </button>
            ))}
            <button
              onClick={() => onNavigate("categories")}
              className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium border border-[#E8E6DF] text-[#8A9AB5] hover:text-[#1B2A4A] bg-white whitespace-nowrap"
            >
              All →
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 p-4 bg-[#F5F4EF] border border-[#E8E6DF] rounded-2xl mb-8">
          <span className="text-2xl">🔔</span>
          <div className="flex-1">
            <p className="font-semibold text-[#1B2A4A] text-sm">
              Saved-search alerts are not available yet
            </p>
            <p className="text-xs text-[#5C6E8A]">
              Browse current listings or post a request to find what you need.
            </p>
          </div>
          <Button variant="soft" size="xs" onClick={() => onNavigate("create")}>
            Post a request
          </Button>
        </div>

        {/* Nearby listings */}
        <section className="mb-10">
          <SectionHeader
            title="Marketplace listings"
            subtitle="Recently available in the marketplace"
            action={() => onNavigate("explore")}
            actionLabel="See all"
          />
          {listingsLoading ? (
            <div className="listing-grid">
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="h-64 animate-pulse rounded-2xl bg-[#E8E6DF]"
                />
              ))}
            </div>
          ) : listingsError ? (
            <div className="rounded-2xl border border-[#E8E6DF] bg-white p-5 text-sm text-[#5C6E8A]">
              {listingsError}
              <Button
                variant="soft"
                size="xs"
                className="ml-3"
                onClick={loadListings}
              >
                Retry
              </Button>
            </div>
          ) : listings.length ? (
            <div className="listing-grid">
              {listings.slice(0, 8).map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  onClick={() => onNavigate("listing", listing.id)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#E8E6DF] bg-white p-8 text-center text-sm text-[#5C6E8A]">
              No active listings yet. Be the first to offer something nearby.
            </div>
          )}
        </section>

        {/* Two-column layout: Recommended + Free */}
        <div className="grid md:grid-cols-2 gap-6 mb-10">
          {/* Additional marketplace listings */}
          <div>
            <SectionHeader
              title="More listings"
              subtitle="Continue browsing the marketplace"
              action={() => onNavigate("explore")}
              actionLabel="Explore"
            />
            <div className="space-y-3">
              {listings.slice(2, 5).map((listing) => (
                <div
                  key={listing.id}
                  onClick={() => onNavigate("listing", listing.id)}
                  className="flex gap-3 bg-white rounded-2xl border border-[#E8E6DF] p-3 cursor-pointer hover:border-[#2D6A4F]/30 transition-all card-hover"
                >
                  <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-[#F5F4EF]">
                    {listing.images[0] && (
                      <img
                        src={listing.images[0]}
                        alt={listing.title}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[#1B2A4A] line-clamp-1">
                      {listing.title}
                    </p>
                    <p className="text-xs text-[#8A9AB5] mt-0.5">
                      {listing.neighborhood} · {listing.distance}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="font-bold text-sm text-[#1B2A4A]">
                        {listing.isFree ? (
                          <span className="text-[#2D6A4F]">Free</span>
                        ) : (
                          `$${listing.price?.toLocaleString()}`
                        )}
                      </span>
                      <Badge variant="navy" size="sm">
                        {listing.condition}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Free near you */}
          <div>
            <SectionHeader
              title="Free near you"
              subtitle="Give, get, reduce waste"
              action={() => onNavigate("explore")}
              actionLabel="More"
            />
            <div className="space-y-3">
              {listings
                .filter((l) => l.isFree)
                .slice(0, 3)
                .map((listing, i) => (
                  <div
                    key={listing.id + i}
                    onClick={() => onNavigate("listing", listing.id)}
                    className="flex gap-3 bg-white rounded-2xl border border-[#E8E6DF] p-3 cursor-pointer hover:border-[#74C69D]/50 transition-all card-hover"
                  >
                    <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-[#F5F4EF] relative">
                      {listing.images[0] && (
                        <img
                          src={listing.images[0]}
                          alt={listing.title}
                          className="w-full h-full object-cover"
                        />
                      )}
                      <div className="absolute top-1 left-1 bg-[#2D6A4F] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">
                        FREE
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-[#1B2A4A] line-clamp-2">
                        {listing.title}
                      </p>
                      <p className="text-xs text-[#8A9AB5] mt-0.5">
                        {listing.neighborhood} · {listing.distance}
                      </p>
                      <p className="text-xs text-[#E8694A] font-medium mt-1">
                        {listing.postedAt}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Local Services */}
        <section className="mb-10">
          <SectionHeader
            title="Local services"
            subtitle="Service profiles are not available yet"
            action={() => onNavigate("explore")}
            actionLabel="Browse listings"
          />
          <div className="rounded-2xl border border-dashed border-[#E8E6DF] bg-white p-6 text-sm text-[#5C6E8A]">
            Provider profiles, availability, and background-check status are not
            connected. Service listings can still be discovered in the
            marketplace.
          </div>
        </section>

        {/* Community Events */}
        <section className="mb-10">
          <SectionHeader
            title="Community events"
            subtitle="Event publishing is not connected yet"
            action={() => onNavigate("community")}
            actionLabel="Community"
          />
          <div className="rounded-2xl border border-dashed border-[#E8E6DF] bg-white p-6 text-sm text-[#5C6E8A]">
            Events and RSVPs will appear here once the community module is
            backed by persisted data.
          </div>
        </section>

        {/* Community Posts */}
        <section className="mb-10">
          <SectionHeader
            title="Community discussions"
            subtitle="Community publishing is not connected yet"
            action={() => onNavigate("community")}
            actionLabel="Community"
          />
          <div className="rounded-2xl border border-dashed border-[#E8E6DF] bg-white p-6 text-sm text-[#5C6E8A]">
            Posts, reactions, and replies are not yet backed by community APIs.
          </div>
        </section>

        {/* People to follow */}
        <section className="mb-10">
          <SectionHeader
            title="Neighbors to follow"
            subtitle="Following is not available yet"
          />
          <div className="rounded-2xl border border-dashed border-[#E8E6DF] bg-white p-6 text-sm text-[#5C6E8A]">
            Neighbor discovery and following are not connected to persisted
            profile data.
          </div>
        </section>

        {/* New Today */}
        <section className="mb-10">
          <SectionHeader
            title="Recently listed"
            subtitle="Marketplace listings, newest first"
            action={() => onNavigate("explore")}
            actionLabel="See all"
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {listings.slice(4, 8).map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                onClick={() => onNavigate("listing", listing.id)}
                compact
              />
            ))}
          </div>
        </section>

        <div className="rounded-3xl border border-[#E8E6DF] bg-[#EEF0F5] p-8 md:p-10">
          <p className="text-[#2D6A4F] text-sm font-semibold mb-1">
            Map discovery
          </p>
          <h3 className="font-display text-2xl md:text-3xl font-semibold text-[#1B2A4A] mb-2">
            Interactive maps are not connected yet
          </h3>
          <p className="text-[#5C6E8A] text-sm mb-4 max-w-xl">
            Location-based radius search and map pins require geospatial
            discovery APIs. Current marketplace listings are available in
            Explore.
          </p>
          <Button
            variant="soft"
            size="sm"
            onClick={() => onNavigate("explore")}
          >
            Browse listings
          </Button>
        </div>
      </div>
    </div>
  )
}
