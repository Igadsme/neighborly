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

type Page = "landing" | "onboarding" | "home" | "explore" | "categories" | "map" | "listing" | "create" | "messages" | "saved" | "profile" | "dashboard" | "housing" | "services" | "jobs" | "community"

export default function App() {
  const [page, setPage] = useState<Page>("landing")
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)

  const navigate = (p: string) => {
    setPage(p as Page)
    window.scrollTo({ top: 0, behavior: "instant" })
  }

  const signIn = () => {
    setIsSignedIn(true)
    navigate("home")
  }

  const signOut = () => {
    api.auth.signOut()
    setIsSignedIn(false)
    navigate("landing")
  }

  useEffect(() => {
    if (!api.auth.hasSession()) {
      setAuthLoading(false)
      return
    }
    api.auth
      .me()
      .then(() => setIsSignedIn(true))
      .catch(() => api.auth.signOut())
      .finally(() => setAuthLoading(false))
  }, [])

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
          unreadMessages={2}
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
          <ListingDetail onNavigate={navigate as any} />
        )}

        {page === "create" && isSignedIn && (
          <CreateListing onNavigate={navigate as any} />
        )}

        {page === "messages" && isSignedIn && <Messages />}

        {page === "saved" && isSignedIn && (
          <SavedItems onNavigate={navigate as any} />
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

        {page === "jobs" && isSignedIn && <Jobs />}

        {page === "community" && isSignedIn && <Community />}

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

      {/* Demo navigation bar — floats on landing page for easy prototype navigation */}
      {page === "landing" && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-[#1B2A4A]/95 backdrop-blur-sm text-white rounded-2xl px-4 py-2.5 flex items-center gap-2 shadow-xl border border-white/10 text-xs font-medium flex-wrap justify-center max-w-sm">
            <span className="text-white/50">🔭 Preview:</span>
            {[
              { label: "Sign up", action: () => navigate("onboarding") },
              { label: "Home feed", action: signIn },
              {
                label: "Explore",
                action: () => {
                  signIn()
                  setTimeout(() => navigate("explore"), 10)
                },
              },
              {
                label: "Map",
                action: () => {
                  signIn()
                  setTimeout(() => navigate("map"), 10)
                },
              },
            ].map(({ label, action }) => (
              <button
                key={label}
                onClick={action}
                className="bg-white/10 hover:bg-white/20 transition-colors px-2.5 py-1 rounded-lg border border-white/10"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
