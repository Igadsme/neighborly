import { useCallback, useEffect, useState } from "react"
import { Button, Badge, Icon } from "../components/ui"
import { api, ApiError } from "../api/client"
import type { ApiListing } from "../api/types"

type Page = "landing" | "onboarding" | "forgot-password" | "home" | "explore" | "categories" | "map" | "listing" | "create" | "messages" | "saved" | "profile" | "dashboard" | "housing" | "services" | "jobs" | "community"

interface LandingProps {
  onNavigate: (p: Page) => void
  onSignIn: () => void
}

const howItWorks = [
  {
    step: "01",
    icon: "🔍",
    title: "Discover something nearby",
    desc: "Browse published listings and filter by available categories, price, condition, and delivery options.",
  },
  {
    step: "02",
    icon: "🤝",
    title: "Connect with confidence",
    desc: "Start a participant-only conversation with a listing owner without exposing private contact details in public listings.",
  },
  {
    step: "03",
    icon: "✅",
    title: "Complete your exchange",
    desc: "Make an offer on a need request, schedule an exchange, and leave a review after completion. Payments and safe-meetup verification are not built yet.",
  },
]

const currentFeatures = [
  {
    icon: "🔐",
    title: "Email and password accounts",
    desc: "Account registration and login use the Neighborly authentication API.",
  },
  {
    icon: "💬",
    title: "Participant-checked messaging",
    desc: "REST and real-time messages are restricted to conversation participants.",
  },
  {
    icon: "🛍️",
    title: "Persisted marketplace",
    desc: "Listings, searches, and favorites are stored through the API.",
  },
  {
    icon: "🤝",
    title: "Request and offer flow",
    desc: "Requests, offers, appointments, transaction status, and reviews use backend records.",
  },
  {
    icon: "🪪",
    title: "Verification",
    desc: "Email verification and account recovery are available; identity and phone checks are not enabled.",
  },
  {
    icon: "🖼️",
    title: "Image uploads",
    desc: "Listing images are validated and uploaded directly to S3-compatible storage.",
  },
]

export default function Landing({ onNavigate, onSignIn }: LandingProps) {
  const [previewListings, setPreviewListings] = useState<ApiListing[]>([])
  const [categoryItems, setCategoryItems] = useState<
    Array<{ id: string; name: string; slug: string }>
  >([])
  const [previewLoading, setPreviewLoading] = useState(true)
  const [previewError, setPreviewError] = useState("")
  const [retryToken, setRetryToken] = useState(0)
  const [signInOpen, setSignInOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [signInError, setSignInError] = useState("")
  const [signingIn, setSigningIn] = useState(false)

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true)
    setPreviewError("")
    try {
      const [availableListings, availableCategories] = await Promise.all([
        api.listings.list({ limit: 8, sort: "newest" }),
        api.categories.list(),
      ])
      setPreviewListings(availableListings)
      setCategoryItems(availableCategories)
    } catch (cause: unknown) {
      setPreviewError(
        cause instanceof ApiError
          ? cause.message
          : "Marketplace preview could not be loaded.",
      )
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPreview()
  }, [loadPreview, retryToken])

  const handleSignIn = () => {
    setSignInError("")
    setSignInOpen(true)
  }

  const submitSignIn = async () => {
    setSigningIn(true)
    setSignInError("")
    try {
      await api.auth.login({ email, password })
      onSignIn()
    } catch (cause) {
      setSignInError(
        cause instanceof ApiError
          ? cause.message
          : "Unable to sign in. Please try again.",
      )
    } finally {
      setSigningIn(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-[#E8E6DF]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#2D6A4F] flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
                  fill="white"
                  stroke="white"
                  strokeWidth="1"
                />
                <polyline
                  points="9,22 9,13 15,13 15,22"
                  fill="none"
                  stroke="#D8F3DC"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
            <span className="font-display font-semibold text-[#1B2A4A] text-lg">
              Neighborly
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <button
              onClick={() => onNavigate("categories")}
              className="text-sm font-medium text-[#5C6E8A] hover:text-[#1B2A4A]"
            >
              Browse
            </button>
            <button
              onClick={() => onNavigate("services")}
              className="text-sm font-medium text-[#5C6E8A] hover:text-[#1B2A4A]"
            >
              Services
            </button>
            <button
              onClick={() => onNavigate("housing")}
              className="text-sm font-medium text-[#5C6E8A] hover:text-[#1B2A4A]"
            >
              Housing
            </button>
            <button
              onClick={() => onNavigate("jobs")}
              className="text-sm font-medium text-[#5C6E8A] hover:text-[#1B2A4A]"
            >
              Jobs
            </button>
            <button
              onClick={handleSignIn}
              className="text-sm font-semibold text-[#1B2A4A] hover:text-[#2D6A4F]"
            >
              Sign in
            </button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onNavigate("onboarding")}
            >
              Get started
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-16 min-h-screen relative overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=1600&h=900&fit=crop&auto=format"
            alt="Friendly Atlanta neighborhood"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#1B2A4A]/90 via-[#1B2A4A]/60 to-transparent" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 py-24 md:py-36 flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1 text-white">
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm px-3 py-1.5 rounded-full text-sm font-medium mb-6 text-white border border-white/20">
              <span className="w-2 h-2 rounded-full bg-[#74C69D] animate-pulse" />
              Local marketplace · Early access
            </div>

            <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-semibold leading-[1.05] mb-6">
              Your neighborhood
              <br />
              <em className="not-italic text-[#74C69D]">has more</em>
              <br />
              to offer.
            </h1>

            <p className="text-lg md:text-xl text-white/80 mb-10 max-w-xl leading-relaxed">
              Browse local listings, publish a need request, and connect with
              neighbors. Housing, services, payments, and other modules are
              still in development.
            </p>

            {/* Search */}
            <div className="flex flex-col sm:flex-row gap-3 max-w-xl">
              <div className="relative flex-1">
                <Icon
                  name="search"
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8A9AB5] pointer-events-none"
                />
                <input
                  type="text"
                  aria-label="Sign in to search published listings"
                  placeholder="Sign in to search published listings"
                  readOnly
                  className="w-full h-13 pl-11 pr-4 bg-white text-[#1B2A4A] rounded-xl text-sm placeholder:text-[#C5CCDA] focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/30 shadow-lg"
                />
              </div>
              <div className="relative">
                <span className="flex h-13 items-center gap-2 rounded-xl bg-white/90 px-4 text-sm font-medium text-[#5C6E8A] shadow-lg">
                  <Icon name="mapPin" size={15} className="text-[#E8694A]" />
                  Location filters unavailable
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 mt-6">
              <Button
                variant="primary"
                size="lg"
                onClick={handleSignIn}
                className="shadow-lg"
              >
                Sign in to explore
              </Button>
              <Button
                size="lg"
                onClick={() => onNavigate("onboarding")}
                className="bg-white/15 text-white border border-white/30 hover:bg-white/25 rounded-full px-7 py-3 h-12 text-base font-semibold transition-colors"
              >
                Join to post
              </Button>
            </div>

            {/* Trust indicators */}
            <div className="flex flex-wrap items-center gap-5 mt-8 text-white/70 text-sm">
              <span className="flex items-center gap-1.5">
                <span className="text-[#74C69D]">✓</span> Free to join
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[#74C69D]">✓</span> In-app messaging
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[#74C69D]">✓</span> Request-first exchanges
              </span>
            </div>
          </div>

          {/* Persisted listing preview */}
          <div className="hidden lg:block w-80 flex-shrink-0">
            <div className="overflow-hidden rounded-3xl bg-white shadow-2xl">
              <div className="flex h-44 items-center justify-center bg-[#F5F4EF] text-[#8A9AB5]">
                {previewLoading ? "Loading marketplace…" : previewListings[0]?.title ?? "No published listings yet"}
              </div>
              <div className="p-4">
                <p className="font-semibold text-sm text-[#1B2A4A]">
                  {previewListings[0]?.title ?? "Marketplace preview"}
                </p>
                <p className="mt-1 text-xs text-[#8A9AB5]">
                  {previewListings[0]?.neighborhood ?? "Location data is not available"}
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-[#F5F4EF] pt-3">
                  <span className="text-sm font-bold text-[#1B2A4A]">
                    {previewListings[0]?.priceCents === 0
                      ? "Free"
                      : previewListings[0]?.priceCents == null
                        ? "Price not set"
                        : `$${(previewListings[0].priceCents / 100).toFixed(2)}`}
                  </span>
                  <span className="text-xs text-[#8A9AB5]">Published listing</span>
                </div>
                <Button variant="soft" size="xs" fullWidth className="mt-4" onClick={handleSignIn}>
                  Sign in to browse
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-20 max-w-7xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="font-display text-4xl font-semibold text-[#1B2A4A] mb-3">
            Everything local. All in one place.
          </h2>
          <p className="text-[#5C6E8A] text-lg max-w-2xl mx-auto">
            Browse categories currently available in the persisted marketplace catalog.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {categoryItems.map((category, index) => (
            <button
              key={category.id}
              onClick={handleSignIn}
              className="group p-5 rounded-2xl border border-[#E8E6DF] bg-white hover:border-[#2D6A4F] hover:shadow-md transition-all text-left card-hover"
              style={{ backgroundColor: ["#D8F3DC", "#DDEEFF", "#FEF3C7", "#FDE8E0"][index % 4] + "30" }}
            >
              <span className="text-3xl mb-3 block">{["🛋️", "📱", "🔧", "🎁"][index % 4]}</span>
              <p className="font-semibold text-[#1B2A4A] text-sm">
                {category.name}
              </p>
              <p className="text-xs text-[#8A9AB5] mt-0.5">
                Browse published listings
              </p>
            </button>
          ))}
          {!previewLoading && !categoryItems.length && (
            <p className="col-span-full text-center text-sm text-[#8A9AB5]">
              {previewError || "No marketplace categories are available yet."}
            </p>
          )}
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-[#1B2A4A]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <Badge variant="green" className="mb-4">
              Connected today
            </Badge>
            <h2 className="font-display text-4xl font-semibold text-white mb-3">
              Simple. Local. Request-first.
            </h2>
            <p className="text-[#8A9AB5] text-lg">
              Three steps to find, connect, and exchange with neighbors.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {howItWorks.map((step) => (
              <div key={step.step} className="relative">
                <div className="text-7xl font-display font-bold text-white/5 absolute -top-4 left-0">
                  {step.step}
                </div>
                <div className="relative pt-4">
                  <div className="text-4xl mb-4">{step.icon}</div>
                  <h3 className="font-display text-xl font-semibold text-white mb-3">
                    {step.title}
                  </h3>
                  <p className="text-[#8A9AB5] leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust & Safety */}
      <section className="py-20 bg-[#F5F4EF]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <Badge variant="coral" className="mb-4">
                Trust & safety in progress
              </Badge>
              <h2 className="font-display text-4xl font-semibold text-[#1B2A4A] mb-5">
                "Everything local.
                <br />
                <span className="text-[#2D6A4F]">Everyone accountable.</span>"
              </h2>
              <p className="text-[#5C6E8A] text-lg leading-relaxed mb-8">
                Neighborly is building a local marketplace with persisted
                accounts, listings, requests, and conversations. Trust and
                safety features are incomplete; use care and do not share
                private contact or address details.
              </p>
              <Button
                variant="primary"
                size="lg"
                onClick={() => onNavigate("onboarding")}
              >
                Join Neighborly Free →
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {currentFeatures.map((point) => (
                <div
                  key={point.title}
                  className="bg-white p-5 rounded-2xl border border-[#E8E6DF]"
                >
                  <div className="text-2xl mb-3">{point.icon}</div>
                  <h4 className="font-semibold text-[#1B2A4A] text-sm mb-1">
                    {point.title}
                  </h4>
                  <p className="text-xs text-[#8A9AB5] leading-relaxed">
                    {point.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Current listings */}
      <section className="py-20 max-w-7xl mx-auto px-6">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="font-display text-3xl font-semibold text-[#1B2A4A]">
              Recently published
            </h2>
            <p className="text-[#8A9AB5] mt-1">
              Latest public marketplace records
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignIn}>
            Sign in to browse →
          </Button>
        </div>
        {previewError && (
          <div role="alert" className="mb-4 flex items-center justify-between rounded-xl bg-[#FFF5F2] p-3 text-sm text-[#C4512D]">
            <span>{previewError}</span>
            <button onClick={() => setRetryToken((token) => token + 1)} className="font-semibold underline">Retry</button>
          </div>
        )}
        {previewLoading ? (
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4" aria-label="Loading latest listings">
            {[0, 1, 2, 3].map((item) => <div key={item} className="h-48 animate-pulse rounded-2xl bg-white" />)}
          </div>
        ) : previewListings.length ? (
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            {previewListings.slice(0, 4).map((listing) => (
              <button
                key={listing.id}
                onClick={handleSignIn}
                className="rounded-2xl border border-[#E8E6DF] bg-white p-4 text-left transition-all hover:border-[#2D6A4F]/40"
              >
                <p className="line-clamp-2 text-sm font-semibold text-[#1B2A4A]">{listing.title}</p>
                <p className="mt-2 text-sm font-bold text-[#1B2A4A]">
                  {listing.priceCents === 0 ? "Free" : listing.priceCents == null ? "Price not set" : `$${(listing.priceCents / 100).toFixed(2)}`}
                </p>
                <p className="mt-1 text-xs text-[#8A9AB5]">{listing.category?.name ?? "Marketplace"}</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#E8E6DF] bg-white p-8 text-center text-sm text-[#8A9AB5]">
            No published listings yet.
          </div>
        )}
      </section>

      {/* Product status */}
      <section className="py-20 bg-gradient-to-br from-[#1B4332] to-[#2D6A4F]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="font-display text-4xl font-semibold text-white mb-3">
              Built in working slices
            </h2>
            <p className="text-[#74C69D] text-lg">
              Neighborly is an early product build. Here is what is connected today.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "Persisted marketplace",
                body: "Browse, publish, search, and save marketplace listings.",
              },
              {
                title: "Request-first exchanges",
                body: "Publish requests, receive offers, schedule exchanges, and submit reviews.",
              },
              {
                title: "Messaging",
                body: "Send persisted messages through participant-authorized conversations.",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-sm"
              >
                <h3 className="font-display text-xl font-semibold text-white">{feature.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/80">{feature.body}</p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-3xl text-center text-sm text-white/70">
            Image uploads, payments, geospatial maps, identity verification, notifications, and community publishing remain in development. No testimonials or usage metrics are shown here.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 max-w-7xl mx-auto px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-display text-5xl font-semibold text-[#1B2A4A] mb-5">
            Your neighborhood
            <br />
            starts here.
          </h2>
          <p className="text-[#5C6E8A] text-xl mb-10">
            Join Neighborly as the local marketplace grows.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              variant="primary"
              size="lg"
              onClick={() => onNavigate("onboarding")}
              className="px-10"
            >
              Join for free →
            </Button>
            <Button variant="outline" size="lg" onClick={handleSignIn}>
              Browse listings
            </Button>
          </div>
          <p className="text-xs text-[#C5CCDA] mt-6">
            Accounts use email and password. In-app payments are not available.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#E8E6DF] bg-white py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-10">
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-[#2D6A4F] flex items-center justify-center">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
                      fill="white"
                    />
                  </svg>
                </div>
                <span className="font-display font-semibold text-[#1B2A4A]">
                  Neighborly
                </span>
              </div>
              <p className="text-sm text-[#8A9AB5] leading-relaxed max-w-xs">
                A request-first local marketplace in active development.
              </p>
            </div>
            {[
              {
                title: "Company",
                links: ["About", "Careers", "Blog", "Press"],
              },
              {
                title: "Support",
                links: [
                  "Help Center",
                  "Safety",
                  "Contact",
                  "Community Guidelines",
                ],
              },
              {
                title: "Legal",
                links: ["Privacy Policy", "Terms of Service", "Cookie Policy"],
              },
            ].map((col) => (
              <div key={col.title}>
                <h4 className="font-semibold text-[#1B2A4A] text-sm mb-3">
                  {col.title}
                </h4>
                <ul className="space-y-2">
                  {col.links.map((link) => (
                    <li key={link}>
                      <span className="text-sm text-[#8A9AB5]">
                        {link}
                        <span className="ml-1 text-xs">(coming soon)</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="pt-8 border-t border-[#E8E6DF] flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-[#C5CCDA]">
              © 2026 Neighborly prototype · Atlanta
            </p>
            <div className="flex items-center gap-4 text-xs text-[#C5CCDA]">
              <span>Marketplace in development</span>
              <span>·</span>
              <span>Atlanta prototype</span>
            </div>
          </div>
        </div>
      </footer>

      {signInOpen && (
        <div
          className="fixed inset-0 z-[60] bg-[#1B2A4A]/50 backdrop-blur-sm flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white rounded-3xl border border-[#E8E6DF] shadow-2xl p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="font-display text-2xl font-semibold text-[#1B2A4A]">
                  Welcome back
                </h2>
                <p className="text-sm text-[#8A9AB5] mt-1">
                  Sign in to continue to Neighborly.
                </p>
              </div>
              <button
                onClick={() => setSignInOpen(false)}
                className="text-[#8A9AB5] hover:text-[#1B2A4A]"
                aria-label="Close sign in"
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                className="w-full h-12 px-4 bg-[#F5F4EF] rounded-xl text-sm text-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/20"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                onKeyDown={(e) => e.key === "Enter" && submitSignIn()}
                className="w-full h-12 px-4 bg-[#F5F4EF] rounded-xl text-sm text-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/20"
              />
              {signInError && (
                <p className="text-sm text-[#A63D27]" role="alert">
                  {signInError}
                </p>
              )}
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={submitSignIn}
                disabled={signingIn}
              >
                {signingIn ? "Signing in..." : "Sign in"}
              </Button>
              <button
                onClick={() => {
                  setSignInOpen(false)
                  onNavigate("forgot-password")
                }}
                className="w-full text-sm text-[#5C6E8A] font-medium hover:underline"
              >
                Forgot your password?
              </button>
              <button
                onClick={() => {
                  setSignInOpen(false)
                  onNavigate("onboarding")
                }}
                className="w-full text-sm text-[#2D6A4F] font-medium hover:underline"
              >
                New to Neighborly? Create an account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
