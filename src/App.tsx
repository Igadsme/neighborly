import { useEffect, useState } from "react"
import Navigation from "./components/Navigation"
import Landing from "./pages/Landing"
import Onboarding from "./pages/Onboarding"
import HomeFeed from "./pages/HomeFeed"
import Explore from "./pages/Explore"
import Categories from "./pages/Categories"
import MapDiscovery from "./pages/MapDiscovery"
import ListingDetail from "./pages/ListingDetail"
import CreateListing from "./pages/CreateListing"
import Messages from "./pages/Messages"
import SavedItems from "./pages/SavedItems"
import Profile from "./pages/Profile"
import Dashboard from "./pages/Dashboard"
import Housing from "./pages/Housing"
import Services from "./pages/Services"
import Jobs from "./pages/Jobs"
import Community from "./pages/Community"
import { api } from "./api/client"
import { unreadConversations } from "./lib/activity"

type Page = "landing" | "onboarding" | "home" | "explore" | "categories" | "map" | "listing" | "create" | "messages" | "saved" | "profile" | "dashboard" | "housing" | "services" | "jobs" | "community"

export default function App() {
  const [page, setPage] = useState<Page>("landing")
  const [listingId, setListingId] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [unreadMessages, setUnreadMessages] = useState(0)

  const navigate = (p: string, id?: string) => {
    if (p === "listing") setListingId(id ?? null)
    if (p === "messages") setConversationId(id ?? null)
    if (p === "profile") setProfileUserId(id ?? null)
    setPage(p as Page)
    window.scrollTo({ top: 0, behavior: "instant" })
  }

  const signIn = (next?: string, id?: string) => {
    setIsSignedIn(true)
    const destination = next && next !== "landing" && next !== "onboarding" ? next : "home"
    navigate(destination, id)
  }

  const signOut = () => {
    api.auth.signOut()
    setViewerId(null)
    setUnreadMessages(0)
    setIsSignedIn(false)
    navigate("landing")
  }

  useEffect(() => {
    if (!api.auth.hasSession()) {
      setAuthLoading(false)
      return
    }
    let cancelled = false
    api.auth
      .me()
      .then((me) => {
        if (cancelled) return
        setViewerId(me.id)
        setIsSignedIn(true)
      })
      .catch(() => {
        if (cancelled) return
        api.auth.signOut()
        setViewerId(null)
        setIsSignedIn(false)
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isSignedIn || viewerId) return
    let cancelled = false
    api.auth
      .me()
      .then((me) => {
        if (!cancelled) setViewerId(me.id)
      })
      .catch(() => {
        if (cancelled) return
        api.auth.signOut()
        setViewerId(null)
        setUnreadMessages(0)
        setIsSignedIn(false)
      })
    return () => {
      cancelled = true
    }
  }, [isSignedIn, viewerId])

  useEffect(() => {
    if (!isSignedIn || !viewerId) {
      setUnreadMessages(0)
      return
    }
    let cancelled = false
    api.conversations
      .list()
      .then((conversations) => {
        if (!cancelled) {
          setUnreadMessages(unreadConversations(conversations, viewerId))
        }
      })
      .catch(() => {
        if (!cancelled) setUnreadMessages(0)
      })
    return () => {
      cancelled = true
    }
  }, [isSignedIn, viewerId, page])

  const isMapPage = page === "map"

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center text-[#5C6E8A]">
        Loading Neighborly...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      {/* Navigation (shown when signed in, except on onboarding) */}
      {isSignedIn && page !== "onboarding" && (
        <Navigation
          currentPage={page as any}
          onNavigate={navigate as any}
          unreadMessages={unreadMessages}
          onSignOut={signOut}
        />
      )}

      {/* Page content */}
      <main
        className={isSignedIn && !isMapPage && page !== "onboarding" ? "" : ""}
      >
        {page === "landing" && (
          <Landing onNavigate={navigate as any} onSignIn={signIn} />
        )}

        {page === "onboarding" && <Onboarding onComplete={signIn} />}

        {page === "home" && isSignedIn && (
          <HomeFeed onNavigate={navigate as any} />
        )}

        {page === "explore" && isSignedIn && (
          <Explore onNavigate={navigate as any} />
        )}

        {page === "categories" && isSignedIn && (
          <Categories onNavigate={navigate as any} />
        )}

        {page === "map" && isSignedIn && (
          <MapDiscovery onNavigate={navigate as any} />
        )}

        {page === "listing" && isSignedIn && (
          <ListingDetail listingId={listingId} onNavigate={navigate as any} />
        )}

        {page === "create" && isSignedIn && (
          <CreateListing onNavigate={navigate as any} />
        )}

        {page === "messages" && isSignedIn && (
          <Messages
            conversationId={conversationId}
            onNavigate={navigate as any}
          />
        )}

        {page === "saved" && isSignedIn && (
          <SavedItems onNavigate={navigate as any} />
        )}

        {page === "profile" && isSignedIn && (
          <Profile userId={profileUserId} onNavigate={navigate as any} />
        )}

        {page === "dashboard" && isSignedIn && (
          <Dashboard onNavigate={navigate as any} />
        )}

        {page === "housing" && isSignedIn && (
          <Housing onNavigate={navigate as any} />
        )}

        {page === "services" && isSignedIn && (
          <Services onNavigate={navigate as any} />
        )}

        {page === "jobs" && isSignedIn && <Jobs />}

        {page === "community" && isSignedIn && (
          <Community onNavigate={navigate as any} />
        )}

        {/* Redirect to sign in if accessing signed-in pages without auth */}
        {!isSignedIn && page !== "landing" && page !== "onboarding" && (
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl mb-4">🏡</div>
              <h2 className="font-display text-2xl font-semibold text-[#1B2A4A] mb-2">
                Sign in to continue
              </h2>
              <p className="text-[#8A9AB5] mb-6">
                You need to be signed in to access this page.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => navigate("landing")}
                  className="bg-[#2D6A4F] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#1B4332] transition-colors"
                >
                  Go to sign in
                </button>
                <button
                  onClick={() => navigate("landing")}
                  className="border border-[#E8E6DF] px-6 py-3 rounded-xl font-semibold text-[#5C6E8A] hover:bg-[#F5F4EF] transition-colors"
                >
                  Go home
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
