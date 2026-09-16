import { useState } from "react"
import { Button, Badge, StarRating, Avatar, Icon } from "../components/ui"
import { listings } from "../data"
import { api, ApiError } from "../api/client"

type Page = "landing" | "onboarding" | "home" | "explore" | "categories" | "map" | "listing" | "create" | "messages" | "saved" | "profile" | "dashboard" | "housing" | "services" | "jobs" | "community"

interface LandingProps {
  onNavigate: (p: Page) => void
  onSignIn: () => void
}

const categories = [
  { icon: "🛋️", label: "For Sale", color: "#D8F3DC", count: "2,847" },
  { icon: "🏠", label: "Housing", color: "#DDEEFF", count: "634" },
  { icon: "💼", label: "Jobs", color: "#FEF3C7", count: "412" },
  { icon: "🔧", label: "Services", color: "#FDE8E0", count: "891" },
  { icon: "🚗", label: "Vehicles", color: "#EEF0F5", count: "523" },
  { icon: "🎁", label: "Free Items", color: "#D8F3DC", count: "203" },
  { icon: "🐾", label: "Pets", color: "#FDE8E0", count: "89" },
  { icon: "🎭", label: "Events", color: "#DDEEFF", count: "156" },
]

const testimonials = [
  {
    name: "Priya Patel",
    neighborhood: "Inman Park",
    avatar: "photo-1494790108755-2616b612b77c",
    text: "I sold my old dining table within 2 hours and met the nicest neighbor. Neighborly actually feels safe — verified profiles make all the difference.",
    rating: 5,
    stat: "Sold $1,200 in items",
  },
  {
    name: "Marcus Johnson",
    neighborhood: "Decatur",
    avatar: "photo-1472099645785-5658abf4ff4e",
    text: "Found a part-time photography gig through the Jobs board. The community feel here is so much better than anything else I've tried.",
    rating: 5,
    stat: "Hired 3 local service providers",
  },
  {
    name: "Aaliyah Williams",
    neighborhood: "Buckhead",
    avatar: "photo-1438761681033-6461ffad8d80",
    text: "As a seller, the listing tools are a game-changer. The AI suggestions helped me price my furniture correctly and I got offers the same day.",
    rating: 5,
    stat: "78 successful transactions",
  },
]

const howItWorks = [
  {
    step: "01",
    icon: "🔍",
    title: "Discover something nearby",
    desc: "Search and browse thousands of listings in your neighborhood. Filter by distance, category, price, and more. Real listings from real neighbors.",
  },
  {
    step: "02",
    icon: "🤝",
    title: "Connect with confidence",
    desc: "Every user has a verified profile, transaction history, and community reviews. Message sellers securely through the app — no need to share personal contact info.",
  },
  {
    step: "03",
    icon: "✅",
    title: "Meet, exchange, or book safely",
    desc: "Choose from safe meetup spots, arrange delivery, or book services directly. Transactions are logged, reviewed, and protected.",
  },
]

const trustPoints = [
  {
    icon: "🪪",
    title: "ID Verification",
    desc: "Optional identity verification builds trust and accountability between neighbors.",
  },
  {
    icon: "⭐",
    title: "Two-Way Reviews",
    desc: "Buyers and sellers both rate each transaction, building a genuine reputation over time.",
  },
  {
    icon: "💬",
    title: "Secure Messaging",
    desc: "All communication stays in-app. We'll alert you if something looks suspicious.",
  },
  {
    icon: "📍",
    title: "Safe Meetup Spots",
    desc: "We suggest verified public locations for in-person exchanges in your area.",
  },
  {
    icon: "🛡️",
    title: "Scam Detection",
    desc: "AI-powered listing and message analysis catches suspicious patterns before they reach you.",
  },
  {
    icon: "📞",
    title: "24/7 Support",
    desc: "Real people ready to help if anything goes wrong with a transaction.",
  },
]

export default function Landing({ onNavigate, onSignIn }: LandingProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [signInOpen, setSignInOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [signInError, setSignInError] = useState("")
  const [signingIn, setSigningIn] = useState(false)

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
              3,200+ active listings in Atlanta
            </div>

            <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-semibold leading-[1.05] mb-6">
              Your neighborhood
              <br />
              <em className="not-italic text-[#74C69D]">has more</em>
              <br />
              to offer.
            </h1>

            <p className="text-lg md:text-xl text-white/80 mb-10 max-w-xl leading-relaxed">
              Buy, sell, rent, hire, trade, donate, and connect — all within a
              few miles of home. With real neighbors. Safely.
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
                  placeholder="What are you looking for?"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-13 pl-11 pr-4 bg-white text-[#1B2A4A] rounded-xl text-sm placeholder:text-[#C5CCDA] focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]/30 shadow-lg"
                />
              </div>
              <div className="relative">
                <Icon
                  name="mapPin"
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#E8694A] pointer-events-none"
                />
                <select className="h-13 pl-9 pr-8 bg-white text-[#1B2A4A] rounded-xl text-sm font-medium focus:outline-none appearance-none cursor-pointer shadow-lg border-0">
                  <option>Atlanta, GA</option>
                  <option>Decatur, GA</option>
                  <option>Midtown, ATL</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4 mt-6">
              <Button
                variant="primary"
                size="lg"
                onClick={handleSignIn}
                className="shadow-lg"
              >
                Explore Neighborly
              </Button>
              <Button
                size="lg"
                onClick={() => onNavigate("create")}
                className="bg-white/15 text-white border border-white/30 hover:bg-white/25 rounded-full px-7 py-3 h-12 text-base font-semibold transition-colors"
              >
                Post a Listing
              </Button>
            </div>

            {/* Trust indicators */}
            <div className="flex flex-wrap items-center gap-5 mt-8 text-white/70 text-sm">
              <span className="flex items-center gap-1.5">
                <span className="text-[#74C69D]">✓</span> Free to join
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[#74C69D]">✓</span> Verified sellers
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[#74C69D]">✓</span> Safe messaging
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[#74C69D]">✓</span> No fees to buy
              </span>
            </div>
          </div>

          {/* Listing preview card */}
          <div className="hidden lg:block w-80 flex-shrink-0">
            <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&h=400&fit=crop&auto=format"
                alt="Sofa listing"
                className="w-full h-44 object-cover"
              />
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-[#1B2A4A] text-sm leading-tight">
                      West Elm Mid-Century Sofa
                    </p>
                    <p className="text-xs text-[#8A9AB5] mt-0.5">
                      Decatur · 1.2 mi away
                    </p>
                  </div>
                  <span className="text-lg font-bold text-[#1B2A4A]">$650</span>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="blue" size="sm">
                    Like New
                  </Badge>
                  <Badge variant="green" size="sm">
                    ID Verified
                  </Badge>
                </div>
                <div className="flex items-center gap-2 pt-3 border-t border-[#F5F4EF]">
                  <Avatar
                    src="photo-1472099645785-5658abf4ff4e"
                    name="Marcus Johnson"
                    size="sm"
                    verified
                  />
                  <div>
                    <p className="text-xs font-semibold text-[#1B2A4A]">
                      Marcus Johnson
                    </p>
                    <StarRating rating={4.9} count={47} size="xs" />
                  </div>
                  <button
                    onClick={handleSignIn}
                    className="ml-auto bg-[#2D6A4F] text-white text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-[#1B4332] transition-colors"
                  >
                    Message
                  </button>
                </div>
              </div>
              {/* Floating elements */}
              <div className="absolute -top-3 -right-3 bg-[#FDE8E0] rounded-2xl px-3 py-2 text-xs font-semibold text-[#C4512D] shadow-md">
                🔥 22 people saved this
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
            From furniture and electronics to jobs and home services — if it's
            happening in your neighborhood, it's on Neighborly.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {categories.map((cat) => (
            <button
              key={cat.label}
              onClick={handleSignIn}
              className="group p-5 rounded-2xl border border-[#E8E6DF] bg-white hover:border-[#2D6A4F] hover:shadow-md transition-all text-left card-hover"
              style={{ backgroundColor: cat.color + "30" }}
            >
              <span className="text-3xl mb-3 block">{cat.icon}</span>
              <p className="font-semibold text-[#1B2A4A] text-sm">
                {cat.label}
              </p>
              <p className="text-xs text-[#8A9AB5] mt-0.5">
                {cat.count} nearby
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-[#1B2A4A]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <Badge variant="green" className="mb-4">
              How it works
            </Badge>
            <h2 className="font-display text-4xl font-semibold text-white mb-3">
              Simple. Safe. Local.
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
                Safety First
              </Badge>
              <h2 className="font-display text-4xl font-semibold text-[#1B2A4A] mb-5">
                "Everything local.
                <br />
                <span className="text-[#2D6A4F]">Everyone accountable.</span>"
              </h2>
              <p className="text-[#5C6E8A] text-lg leading-relaxed mb-8">
                Neighborly was built on the belief that local commerce should be
                safe, transparent, and human. Every feature is designed to
                protect you while fostering genuine connections in your
                community.
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
              {trustPoints.map((point) => (
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

      {/* Popular Near Atlanta */}
      <section className="py-20 max-w-7xl mx-auto px-6">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="font-display text-3xl font-semibold text-[#1B2A4A]">
              Popular near Atlanta
            </h2>
            <p className="text-[#8A9AB5] mt-1">
              Listings neighbors are looking at right now
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignIn}>
            See all →
          </Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {listings.slice(0, 4).map((listing) => (
            <div
              key={listing.id}
              onClick={handleSignIn}
              className="group cursor-pointer bg-white rounded-2xl border border-[#E8E6DF] overflow-hidden card-hover"
            >
              <div className="h-40 overflow-hidden bg-[#F5F4EF]">
                <img
                  src={`https://images.unsplash.com/${listing.images[0]}?w=400&h=300&fit=crop&auto=format`}
                  alt={listing.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div className="p-3">
                <p className="text-sm font-semibold text-[#1B2A4A] line-clamp-1">
                  {listing.title}
                </p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm font-bold text-[#1B2A4A]">
                    {listing.isFree ? (
                      <span className="text-[#2D6A4F]">Free</span>
                    ) : (
                      `$${listing.price?.toLocaleString()}`
                    )}
                  </span>
                  <span className="text-xs text-[#8A9AB5]">
                    {listing.distance}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-gradient-to-br from-[#1B4332] to-[#2D6A4F]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="font-display text-4xl font-semibold text-white mb-3">
              Real neighbors. Real stories.
            </h2>
            <p className="text-[#74C69D] text-lg">
              What your Atlanta community is saying about Neighborly.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div
                key={t.name}
                className="bg-white/10 backdrop-blur-sm border border-white/20 p-6 rounded-2xl"
              >
                <div className="flex mb-2">
                  {[...Array(t.rating)].map((_, i) => (
                    <span key={i} className="text-[#F59E0B] text-sm">
                      ★
                    </span>
                  ))}
                </div>
                <p className="text-white/90 text-sm leading-relaxed mb-5">
                  "{t.text}"
                </p>
                <div className="flex items-center gap-3 pt-4 border-t border-white/10">
                  <Avatar src={t.avatar} name={t.name} size="sm" verified />
                  <div className="flex-1">
                    <p className="text-white font-semibold text-sm">{t.name}</p>
                    <p className="text-[#74C69D] text-xs">{t.neighborhood}</p>
                  </div>
                  <Badge variant="green" size="sm">
                    {t.stat}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 max-w-7xl mx-auto px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-display text-5xl font-semibold text-[#1B2A4A] mb-5">
            Your neighbors
            <br />
            are already here.
          </h2>
          <p className="text-[#5C6E8A] text-xl mb-10">
            Join 47,000+ Atlantans buying, selling, and connecting locally every
            day.
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
            No credit card required. Free to join and browse.
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
                Everything local. Everyone accountable. Atlanta's trusted
                community marketplace.
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
                      <a
                        href="#"
                        className="text-sm text-[#8A9AB5] hover:text-[#2D6A4F] transition-colors"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="pt-8 border-t border-[#E8E6DF] flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-[#C5CCDA]">
              © 2026 Neighborly, Inc. Atlanta, GA. All rights reserved.
            </p>
            <div className="flex items-center gap-4 text-xs text-[#C5CCDA]">
              <span>🌎 Available in 12 US cities</span>
              <span>·</span>
              <span>47,000+ neighbors</span>
              <span>·</span>
              <span>3,200+ active listings</span>
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
