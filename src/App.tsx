import { useCallback, useEffect, useState } from "react"
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
import Requests from "./pages/Requests"
import Notifications from "./pages/Notifications"
import LiveListingDetail from "./pages/LiveListingDetail"
import AuthAction from "./pages/AuthAction"
import { api } from "./api/client"
import type { ApiSavedSearch } from "./api/types"

type Page = "landing" | "onboarding" | "forgot-password" | "reset-password" | "verify-email" | "home" | "explore" | "categories" | "map" | "listing" | "create" | "messages" | "saved" | "profile" | "dashboard" | "housing" | "services" | "jobs" | "community" | "requests" | "notifications"

const pagePaths: Record<Exclude<Page, "listing">, string> = {
  landing: "/",
  onboarding: "/onboarding",
  "forgot-password": "/forgot-password",
  "reset-password": "/reset-password",
  "verify-email": "/verify-email",
  home: "/home",
  explore: "/explore",
  categories: "/categories",
  map: "/map",
  create: "/listings/new",
  messages: "/messages",
  saved: "/saved",
  profile: "/profile",
  dashboard: "/dashboard",
  housing: "/housing",
  services: "/services",
  jobs: "/jobs",
  community: "/community",
  requests: "/requests",
  notifications: "/notifications",
}

function readRoute() {
  const path = window.location.pathname.replace(/\/$/, "") || "/"
  const listing = /^\/listings\/([0-9a-f-]+)$/i.exec(path)
  if (listing) return { page: "listing" as Page, entityId: listing[1], conversationId: "" }
  const conversation = /^\/messages\/([0-9a-f-]+)$/i.exec(path)
  if (conversation) return { page: "messages" as Page, entityId: "", conversationId: conversation[1] }
  const match = Object.entries(pagePaths).find(([, route]) => route === path)
  return { page: (match?.[0] as Page | undefined) ?? "landing", entityId: "", conversationId: "" }
}

function routePath(page: Page, entityId?: string, conversationId?: string) {
  if (page === "listing" && entityId) return `/listings/${entityId}`
  if (page === "messages" && conversationId) return `/messages/${conversationId}`
  return page === "listing" ? "/explore" : pagePaths[page]
}

export default function App() {
  const initialRoute = readRoute()
  const [page, setPage] = useState<Page>(initialRoute.page)
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [selectedListingId, setSelectedListingId] = useState(initialRoute.entityId)
  const [selectedConversationId, setSelectedConversationId] = useState(initialRoute.conversationId)
  const [selectedExploreCategory, setSelectedExploreCategory] = useState("")
  const [selectedExploreSearch, setSelectedExploreSearch] = useState<ApiSavedSearch | null>(null)
  const [unreadNotifications, setUnreadNotifications] = useState<number | null>(null)

  const navigate = useCallback((p: string, entityId?: string, conversationId?: string) => {
    setPage(p as Page)
    setSelectedListingId(p === "listing" ? entityId ?? "" : "")
    setSelectedConversationId(p === "messages" ? conversationId ?? "" : "")
    setSelectedExploreCategory(p === "explore" ? entityId ?? "" : "")
    setSelectedExploreSearch(null)
    window.history.pushState({}, "", routePath(p as Page, entityId, conversationId))
    window.scrollTo({ top: 0, behavior: "instant" })
  }, [])

  const runSavedSearch = (search: ApiSavedSearch) => {
    navigate("explore")
    setSelectedExploreSearch(search)
  }

  const signIn = () => {
    if (!api.auth.hasSession()) {
      navigate("landing")
      return
    }
    setIsSignedIn(true)
    navigate("home")
  }

  const signOut = () => {
    api.auth.signOut()
    setIsSignedIn(false)
    navigate("landing")
  }

  useEffect(() => {
    api.auth
      .restore()
      .then((user) => {
        if (!user) return
        setIsSignedIn(true)
        if (["landing", "onboarding"].includes(readRoute().page)) navigate("home")
      })
      .catch(() => api.auth.signOut())
      .finally(() => setAuthLoading(false))
  }, [navigate])

  useEffect(() => {
    const onPopState = () => {
      const route = readRoute()
      setPage(route.page)
      setSelectedListingId(route.entityId)
      setSelectedConversationId(route.conversationId)
      setSelectedExploreCategory("")
      setSelectedExploreSearch(null)
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  useEffect(() => {
    if (!isSignedIn) {
      setUnreadNotifications(null)
      return
    }
    let active = true
    const refreshCount = () => {
      void api.notifications
        .unreadCount()
        .then(({ count }) => {
          if (active) setUnreadNotifications(count)
        })
        .catch(() => {
          if (active) setUnreadNotifications(null)
        })
    }
    refreshCount()
    const interval = window.setInterval(refreshCount, 30_000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [isSignedIn])

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
          unreadNotifications={unreadNotifications}
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

        {page === "forgot-password" && <AuthAction mode="forgot" onNavigate={navigate} />}
        {page === "reset-password" && <AuthAction mode="reset" onNavigate={navigate} />}
        {page === "verify-email" && <AuthAction mode="verify" onNavigate={navigate} />}

        {page === "home" && isSignedIn && (
          <HomeFeed onNavigate={navigate as any} />
        )}

        {page === "explore" && isSignedIn && (
          <Explore
            onNavigate={navigate as any}
            initialCategory={selectedExploreCategory}
            initialSearch={selectedExploreSearch}
          />
        )}

        {page === "categories" && isSignedIn && (
          <Categories onNavigate={navigate as any} />
        )}

        {page === "map" && isSignedIn && (
          <MapDiscovery onNavigate={navigate as any} />
        )}

        {page === "listing" && isSignedIn && (selectedListingId
          ? <LiveListingDetail listingId={selectedListingId} onNavigate={navigate} />
          : <ListingDetail onNavigate={navigate as any} />)}

        {page === "create" && isSignedIn && (
          <CreateListing onNavigate={navigate as any} />
        )}

        {page === "messages" && isSignedIn && <Messages initialConversationId={selectedConversationId || undefined} />}

        {page === "saved" && isSignedIn && (
          <SavedItems
            onNavigate={navigate as any}
            onRunSavedSearch={runSavedSearch}
          />
        )}

        {page === "profile" && isSignedIn && (
          <Profile onNavigate={navigate as any} />
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

        {page === "jobs" && isSignedIn && (
          <Jobs onNavigate={navigate as any} />
        )}

        {page === "community" && isSignedIn && (
          <Community onNavigate={navigate as any} />
        )}

        {page === "requests" && isSignedIn && <Requests />}

        {page === "notifications" && isSignedIn && (
          <Notifications
            onNavigate={navigate}
            onUnreadChange={setUnreadNotifications}
          />
        )}

        {/* Redirect to sign in if accessing signed-in pages without auth */}
        {!isSignedIn && !["landing", "onboarding", "forgot-password", "reset-password", "verify-email"].includes(page) && (
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
