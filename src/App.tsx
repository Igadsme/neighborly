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
import AccountSettings from "./pages/account/AccountSettings"
import ForgotPassword from "./pages/account/ForgotPassword"
import ResetPassword from "./pages/account/ResetPassword"
import VerifyEmail from "./pages/account/VerifyEmail"
import CreateListingFlow from "./pages/marketplace/CreateListingFlow"
import MyListings from "./pages/marketplace/MyListings"
import MyRequests from "./pages/requests/MyRequests"
import RequestDetail from "./pages/requests/RequestDetail"
import RequestFeed from "./pages/requests/RequestFeed"
import RequestForm from "./pages/requests/RequestForm"
import { api, onSessionExpired, readStatus } from "./api/client"
import { Alert } from "./components/account-ui"
import type { ApiRequestSummary } from "./api/types"
import { unreadConversations } from "./lib/activity"

type Page =
  | "landing"
  | "onboarding"
  | "home"
  | "explore"
  | "categories"
  | "map"
  | "listing"
  | "create"
  | "messages"
  | "saved"
  | "profile"
  | "dashboard"
  | "housing"
  | "services"
  | "jobs"
  | "community"
  | "account"
  | "forgot-password"
  | "reset-password"
  | "verify-email"
  | "my-listings"
  | "create-marketplace"
  | "requests"
  | "my-requests"
  | "request-create"
  | "request-edit"
  | "request-detail"

/**
 * Loads the request being edited. Kept out of App so the edit screen only
 * fetches when that route is actually opened.
 */
function EditRequestRoute({
  requestId,
  categories,
  onNavigate,
}: {
  requestId: string | null
  categories: Array<{ id: string; name: string }>
  onNavigate: (page: string, id?: string) => void
}) {
  const [request, setRequest] = useState<ApiRequestSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!requestId) return
    api.requests
      .get(requestId)
      .then(row => setRequest(row as unknown as ApiRequestSummary))
      .catch(cause => setError(readStatus(cause, "That request could not be loaded.")))
  }, [requestId])

  if (error) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-16 space-y-4">
        <Alert tone="error">{error}</Alert>
        <button
          type="button"
          className="rounded-xl border border-[#D8DED8] px-4 py-2 text-sm"
          onClick={() => onNavigate("my-requests")}
        >
          Back to my requests
        </button>
      </main>
    )
  }
  if (!request) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-16">
        <Alert tone="info">Loading request…</Alert>
      </main>
    )
  }
  return (
    <RequestForm
      existing={request}
      categories={categories}
      onNavigate={onNavigate}
      onDone={updated => onNavigate("request-detail", updated.id)}
    />
  )
}

export default function App() {
  const [page, setPage] = useState<Page>("landing")
  const [listingId, setListingId] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [notice, setNotice] = useState("")
  // Single-use deep-link tokens. They are read from the URL once, handed
  // to the relevant screen, and stripped from the address bar so they are
  // not left in history or in a shared link.
  const [accountToken, setAccountToken] = useState<string | null>(null)
  // Marketplace screens need the category list and a place to land after a
  // successful create, so they are loaded once here rather than per screen.
  const [categories, setCategories] = useState<Array<{ id: string; name: string; slug: string }>>([])

  const navigate = useCallback((p: string, id?: string) => {
    if (p === "listing") setListingId(id ?? null)
    if (p === "messages") setConversationId(id ?? null)
    if (p === "profile") setProfileUserId(id ?? null)
    // Request routes reuse the id slot, so a deep link to a request keeps
    // its own addressable id.
    if (p === "request-detail" || p === "request-edit") setRequestId(id ?? null)
    setPage(p as Page)
    window.scrollTo({ top: 0, behavior: "instant" })
  }, [])

  // Verification and reset links arrive as `/?verify=…` and `/?reset=…`.
  const consumeDeepLink = useCallback(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get("verify") ?? params.get("verifyEmailChange") ?? params.get("reset")
    if (!token) return
    setAccountToken(token)
    setPage(params.get("reset") ? "reset-password" : "verify-email")
    // Replace rather than push so the token does not survive a back button.
    window.history.replaceState({}, "", window.location.pathname)
  }, [])

  const signIn = (next?: string, id?: string) => {
    setIsSignedIn(true)
    const destination = next && next !== "landing" && next !== "onboarding" ? next : "home"
    navigate(destination, id)
  }

  const signOut = () => {
    void api.auth.signOut()
    setViewerId(null)
    setUnreadMessages(0)
    setIsSignedIn(false)
    navigate("landing")
  }

  useEffect(() => {
    api.categories
      .list()
      .then(rows => setCategories(rows))
      .catch(() => setCategories([]))
  }, [])

  useEffect(() => {
    consumeDeepLink()
    // A refresh that fails ends the session wherever the user happens to be.
    return onSessionExpired(() => {
      setViewerId(null)
      setUnreadMessages(0)
      setIsSignedIn(false)
      navigate("landing")
    })
  }, [consumeDeepLink, navigate])

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
        setPage((current) => (current === "landing" ? "home" : current))
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
          currentPage={page}
          onNavigate={navigate}
          unreadMessages={unreadMessages}
          onSignOut={signOut}
        />
      )}

      {/* Page content */}
      <main className={isSignedIn && !isMapPage && page !== "onboarding" ? "" : ""}>
        {notice && (
          <div role="status" className="mx-auto max-w-4xl px-6 pt-4">
            <div className="rounded-xl border border-[#B9D8C7] bg-[#EEF6F1] px-4 py-3 text-sm text-[#1E4A36]">
              {notice}
              <button
                type="button"
                className="ml-3 underline"
                onClick={() => setNotice("")}
                aria-label="Dismiss message"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        {page === "landing" && (
          <Landing onNavigate={navigate} onSignIn={signIn} />
        )}

        {page === "forgot-password" && (
          <ForgotPassword
            onBack={() => navigate(api.auth.hasSession() ? "home" : "landing")}
            onSubmitted={(email) => window.setTimeout(() => setAccountToken(email), 0)}
          />
        )}

        {page === "reset-password" && (
          <ResetPassword
            token={accountToken}
            onDone={() => {
              setAccountToken(null)
              navigate("landing")
            }}
          />
        )}

        {page === "verify-email" && (
          <VerifyEmail
            token={accountToken}
            onDone={() => {
              setAccountToken(null)
              navigate(api.auth.hasSession() ? "home" : "landing")
            }}
            onResend={() => {
              setAccountToken(null)
              navigate("home")
            }}
          />
        )}

        {page === "requests" && isSignedIn && <RequestFeed onNavigate={navigate} />}

        {page === "my-requests" && isSignedIn && <MyRequests onNavigate={navigate} />}

        {page === "request-create" && isSignedIn && (
          <RequestForm
            categories={categories}
            onNavigate={navigate}
            onDone={created => {
              setNotice(`"${created.title}" was posted.`)
              navigate("request-detail", created.id)
            }}
          />
        )}

        {page === "request-edit" && isSignedIn && (
          <EditRequestRoute requestId={requestId} categories={categories} onNavigate={navigate} />
        )}

        {page === "request-detail" && isSignedIn && (
          <RequestDetail requestId={requestId ?? ""} viewerId={viewerId} onNavigate={navigate} />
        )}

        {page === "my-listings" && isSignedIn && (
          <MyListings onNavigate={navigate} />
        )}

        {page === "create-marketplace" && isSignedIn && (
          <CreateListingFlow
            categories={categories}
            initialCategoryId={categories[0]?.id}
            onNavigate={navigate}
            onDone={created => {
              setNotice(`"${created.title}" was created.`)
              navigate("listing", created.id)
            }}
          />
        )}

        {page === "account" && isSignedIn && (
          <AccountSettings onSignedOut={signOut} />
        )}

        {page === "onboarding" && <Onboarding onComplete={signIn} />}

        {page === "home" && isSignedIn && (
          <HomeFeed onNavigate={navigate} />
        )}

        {page === "explore" && isSignedIn && (
          <Explore onNavigate={navigate} />
        )}

        {page === "categories" && isSignedIn && (
          <Categories onNavigate={navigate} />
        )}

        {page === "map" && isSignedIn && (
          <MapDiscovery onNavigate={navigate} />
        )}

        {page === "listing" && isSignedIn && (
          <ListingDetail listingId={listingId} onNavigate={navigate} />
        )}

        {page === "create" && isSignedIn && (
          <CreateListing onNavigate={navigate} />
        )}

        {page === "messages" && isSignedIn && (
          <Messages
            conversationId={conversationId}
            onNavigate={navigate}
          />
        )}

        {page === "saved" && isSignedIn && (
          <SavedItems onNavigate={navigate} />
        )}

        {page === "profile" && isSignedIn && (
          <Profile userId={profileUserId} onNavigate={navigate} />
        )}

        {page === "dashboard" && isSignedIn && (
          <Dashboard onNavigate={navigate} />
        )}

        {page === "housing" && isSignedIn && (
          <Housing onNavigate={navigate} />
        )}

        {page === "services" && isSignedIn && (
          <Services onNavigate={navigate} />
        )}

        {page === "jobs" && isSignedIn && <Jobs />}

        {page === "community" && isSignedIn && (
          <Community onNavigate={navigate} />
        )}

        {/* Redirect to sign in if accessing signed-in pages without auth */}
        {!isSignedIn &&
          page !== "landing" &&
          page !== "onboarding" &&
          page !== "forgot-password" &&
          page !== "reset-password" &&
          page !== "verify-email" &&
          page !== "my-listings" &&
          page !== "my-requests" &&
          page !== "requests" &&
          page !== "request-create" &&
          page !== "request-detail" &&
          page !== "create-marketplace" && (
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
