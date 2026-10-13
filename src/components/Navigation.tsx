import { useCallback, useEffect, useState } from "react"
import NotificationBell from "./NotificationBell"
import { Avatar, Icon } from "./ui"
import { Menu } from "./a11y"
import { api } from "../api/client"

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
  | "missions"
  | "mission-detail"
  | "mission-create"
  | "mission-edit"
  | "mission-manage"
  | "mission-contributions"
  | "community-moderation"
  | "passport"
  | "passport-me"
  | "passport-settings"
  | "passport-edit"
  | "passport-privacy"
  | "staff-queue"
  | "borrow"
  | "borrow-item"
  | "borrow-create"
  | "borrow-edit"
  | "borrow-detail"
  | "borrow-lent"
  | "borrow-dispute"
  | "notifications"
  | "notification-preferences"
  | "saved-searches"

interface NavProps {
  currentPage: Page
  onNavigate: (p: Page) => void
  unreadMessages?: number
  onSignOut?: () => void
  /**
   * Route navigation with an optional entity id. The notification bell needs
   * both (a notification links to a specific listing or request), while the
   * nav buttons need only the page.
   */
  onNavigateRoute?: (page: string, id?: string) => void
}

/**
 * The signed-in member, as the backend actually reports it.
 *
 * The header previously rendered a hardcoded name, avatar and neighbourhood.
 * Showing one member's data to everyone is a privacy problem, not a styling
 * one, so the real passport is fetched and any failure degrades to a neutral
 * label rather than inventing an identity.
 */
interface Viewer {
  displayName: string | null
  avatarUrl: string | null
  neighborhood: string | null
  city: string | null
}

const NAV_ITEMS: Array<{ label: string; page: Page }> = [
  { label: "Explore", page: "explore" },
  { label: "Map", page: "map" },
  { label: "Housing", page: "housing" },
  { label: "Services", page: "services" },
  { label: "Jobs", page: "jobs" },
  { label: "Community", page: "community" },
]

const ACCOUNT_ITEMS: Array<{ label: string; page: Page }> = [
  { label: "My dashboard", page: "dashboard" },
  { label: "My listings", page: "my-listings" },
  { label: "My requests", page: "my-requests" },
  { label: "Saved items", page: "saved" },
  { label: "Messages", page: "messages" },
  { label: "Borrowing", page: "borrow-lent" },
  { label: "Neighborhood missions", page: "missions" },
  { label: "My contributions", page: "mission-contributions" },
  { label: "My passport", page: "passport-me" },
  { label: "Account settings", page: "account" },
]

export default function Navigation({
  currentPage,
  onNavigate,
  unreadMessages = 0,
  onSignOut,
  onNavigateRoute,
}: NavProps) {
  const [viewer, setViewer] = useState<Viewer | null>(null)

  const loadViewer = useCallback(() => {
    api.passport
      .me()
      .then(passport =>
        setViewer({
          displayName: passport.displayName ?? null,
          avatarUrl: passport.avatarUrl ?? null,
          neighborhood: passport.neighborhood ?? null,
          city: passport.city ?? null,
        })
      )
      .catch(() => setViewer(null))
  }, [])

  useEffect(() => {
    loadViewer()
  }, [loadViewer])

  // A notification can change the member's own passport (a new badge, an
  // updated name), so the header identity refreshes when a notification
  // arrives rather than showing a stale value for the rest of the session.
  useEffect(() => {
    const onFocus = () => loadViewer()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [loadViewer])

  const isActive = (p: Page) => currentPage === p
  const displayName = viewer?.displayName || "Your account"
  const place = [viewer?.neighborhood, viewer?.city].filter(Boolean).join(" · ")

  return (
    <>
      {/* Desktop Navigation */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-[#E8E6DF] hidden md:block">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center gap-4 h-16">
            {/* Logo */}
            <button
              type="button"
              onClick={() => onNavigate("home")}
              className="flex items-center gap-2 flex-shrink-0 mr-2"
            >
              <span
                className="w-8 h-8 rounded-xl bg-[#2D6A4F] flex items-center justify-center"
                aria-hidden="true"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M3 9l9-7 9 7v11a2 2 0 1 1-2 2H5a2 2 0 1 1-2-2z"
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
              </span>
              <span className="font-display font-semibold text-[#1B2A4A] text-lg">
                Neighborly
              </span>
            </button>

            {/* Search entry point */}
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Icon
                  name="search"
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5C6E8A] pointer-events-none"
                />
                <input
                  type="search"
                  aria-label="Search listings"
                  placeholder="Search for anything nearby..."
                  className="w-full h-9 pl-9 pr-4 bg-[#F5F4EF] border border-transparent rounded-full text-sm text-[#1B2A4A] placeholder:text-[#5C6E8A] focus:outline-none focus:bg-white focus:border-[#2D6A4F] transition-all"
                  // Focusing used to navigate away immediately, which made the
                  // field impossible to type into. Submitting is what moves
                  // the user to the full search experience.
                  onKeyDown={event => {
                    if (event.key === "Enter") onNavigate("explore")
                  }}
                />
              </div>
            </div>

            {/* Nav links */}
            <nav aria-label="Main" className="flex items-center gap-1 ml-2">
              {NAV_ITEMS.map(({ label, page }) => (
                <button
                  key={page}
                  type="button"
                  // aria-current is what communicates the active page to a
                  // screen reader; the background alone is visual only.
                  aria-current={isActive(page) ? "page" : undefined}
                  onClick={() => onNavigate(page)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive(page)
                      ? "bg-[#F0FBF3] text-[#2D6A4F]"
                      : "text-[#5C6E8A] hover:text-[#1B2A4A] hover:bg-[#F5F4EF]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>

            {/* Right actions */}
            <div className="flex items-center gap-2 ml-auto">
              {/* Messages */}
              <button
                type="button"
                aria-label={
                  unreadMessages > 0 ? `Messages, ${unreadMessages} unread` : "Messages"
                }
                aria-current={isActive("messages") ? "page" : undefined}
                onClick={() => onNavigate("messages")}
                className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                  isActive("messages")
                    ? "bg-[#F0FBF3] text-[#2D6A4F]"
                    : "hover:bg-[#F5F4EF] text-[#5C6E8A]"
                }`}
              >
                <Icon name="message" size={18} />
                {unreadMessages > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 bg-[#E8694A] text-white text-[10px] font-bold rounded-full flex items-center justify-center"
                  >
                    {unreadMessages > 99 ? "99+" : unreadMessages}
                  </span>
                )}
              </button>

              {/* Notifications */}
              <NotificationBell onNavigate={onNavigateRoute ?? (() => undefined)} />

              {/* Saved */}
              <button
                type="button"
                aria-label="Saved items"
                aria-current={isActive("saved") ? "page" : undefined}
                onClick={() => onNavigate("saved")}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                  isActive("saved")
                    ? "bg-[#F0FBF3] text-[#2D6A4F]"
                    : "hover:bg-[#F5F4EF] text-[#5C6E8A]"
                }`}
              >
                <Icon name="bookmark" size={18} />
              </button>

              {/* Post Listing */}
              <button
                type="button"
                onClick={() => onNavigate("create")}
                className="flex items-center gap-2 bg-[#2D6A4F] text-white px-4 py-2 rounded-full text-sm font-semibold hover:bg-[#1B4332] transition-colors active:scale-95 shadow-sm"
              >
                <Icon name="plus" size={14} />
                Post Listing
              </button>

              {/* Profile */}
              <Menu
                label="Account menu"
                trigger={
                  <>
                    <Avatar
                      src={viewer?.avatarUrl ?? undefined}
                      name={viewer?.displayName ?? undefined}
                      size="sm"
                    />
                    <Icon name="chevronDown" size={12} className="text-[#5C6E8A]" />
                  </>
                }
              >
                {close => (
                  <>
                    <div className="px-3 py-2 border-b border-[#F5F4EF] mb-1">
                      <p className="font-semibold text-sm text-[#1B2A4A] truncate">
                        {displayName}
                      </p>
                      {place && <p className="text-xs text-[#5C6E8A] truncate">{place}</p>}
                    </div>
                    {ACCOUNT_ITEMS.map(({ label, page }) => (
                      <button
                        key={`${label}-${page}`}
                        type="button"
                        aria-current={isActive(page) ? "page" : undefined}
                        onClick={() => {
                          onNavigate(page)
                          close()
                        }}
                        className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                          isActive(page)
                            ? "bg-[#F0FBF3] text-[#2D6A4F] font-semibold"
                            : "hover:bg-[#F5F4EF] text-[#1B2A4A]"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                    <div className="border-t border-[#F5F4EF] mt-1 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          onSignOut?.()
                          close()
                        }}
                        className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-[#F5F4EF] text-[#B94C2A] font-semibold transition-colors"
                      >
                        Sign out
                      </button>
                    </div>
                  </>
                )}
              </Menu>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Navigation */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-[#E8E6DF] md:hidden">
        <div className="px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate("home")}
            className="flex items-center gap-1.5 flex-shrink-0"
          >
            <span
              className="w-7 h-7 rounded-lg bg-[#2D6A4F] flex items-center justify-center"
              aria-hidden="true"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M3 9l9-7 9 7v11a2 2 0 1 1-2 2H5a2 2 0 1 1-2-2z" fill="white" />
                <polyline
                  points="9,22 9,13 15,13 15,22"
                  fill="none"
                  stroke="#D8F3DC"
                  strokeWidth="2"
                />
              </svg>
            </span>
            <span className="font-display font-semibold text-[#1B2A4A]">Neighborly</span>
          </button>

          <div className="flex-1 relative">
            <Icon
              name="search"
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5C6E8A] pointer-events-none"
            />
            <input
              type="search"
              aria-label="Search listings"
              placeholder="Search..."
              className="w-full h-8 pl-8 pr-3 bg-[#F5F4EF] rounded-full text-sm text-[#1B2A4A] placeholder:text-[#5C6E8A] focus:outline-none"
              onKeyDown={event => {
                if (event.key === "Enter") onNavigate("explore")
              }}
            />
          </div>

          <button
            type="button"
            aria-label={
              unreadMessages > 0 ? `Messages, ${unreadMessages} unread` : "Messages"
            }
            aria-current={isActive("messages") ? "page" : undefined}
            onClick={() => onNavigate("messages")}
            className="relative w-8 h-8 flex items-center justify-center text-[#5C6E8A]"
          >
            <Icon name="message" size={18} />
            {unreadMessages > 0 && (
              <span
                aria-hidden="true"
                className="absolute top-0 right-0 min-w-4 h-4 px-1 bg-[#E8694A] text-white text-[9px] font-bold rounded-full flex items-center justify-center"
              >
                {unreadMessages > 99 ? "99+" : unreadMessages}
              </span>
            )}
          </button>

          {/* On phones the bottom tab bar cannot reach the account, listing or
              mission areas, so the account menu is also reachable from the
              top bar. */}
          <Menu
            label="Account menu"
            className="md:hidden"
            trigger={
              <>
                <Avatar
                  src={viewer?.avatarUrl ?? undefined}
                  name={viewer?.displayName ?? undefined}
                  size="xs"
                />
              </>
            }
          >
            {close => (
              <>
                <div className="px-3 py-2 border-b border-[#F5F4EF] mb-1">
                  <p className="font-semibold text-sm text-[#1B2A4A] truncate">
                    {displayName}
                  </p>
                  {place && <p className="text-xs text-[#5C6E8A] truncate">{place}</p>}
                </div>
                {ACCOUNT_ITEMS.map(({ label, page }) => (
                  <button
                    key={`${label}-${page}`}
                    type="button"
                    aria-current={isActive(page) ? "page" : undefined}
                    onClick={() => {
                      onNavigate(page)
                      close()
                    }}
                    className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                      isActive(page)
                        ? "bg-[#F0FBF3] text-[#2D6A4F] font-semibold"
                        : "hover:bg-[#F5F4EF] text-[#1B2A4A]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <div className="border-t border-[#F5F4EF] mt-1 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onSignOut?.()
                      close()
                    }}
                    className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-[#F5F4EF] text-[#B94C2A] font-semibold transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </Menu>
        </div>
      </header>

      {/* Mobile Bottom Nav */}
      <nav
        aria-label="Primary"
        className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#E8E6DF] md:hidden bottom-nav"
      >
        <div className="flex">
          {[
            { label: "Home", page: "home" as Page, icon: "home" },
            { label: "Explore", page: "explore" as Page, icon: "compass" },
            {
              label: "Post",
              page: "create" as Page,
              icon: "plus",
              special: true,
            },
            { label: "Messages", page: "messages" as Page, icon: "message" },
            { label: "Missions", page: "missions" as Page, icon: "user" },
          ].map(({ label, page, icon, special }) => (
            <button
              key={page}
              type="button"
              aria-label={label}
              aria-current={isActive(page) ? "page" : undefined}
              onClick={() => onNavigate(page)}
              className={`flex-1 min-h-11 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                special
                  ? "relative"
                  : isActive(page)
                    ? "text-[#2D6A4F]"
                    : "text-[#5C6E8A]"
              }`}
            >
              {special ? (
                <span
                  aria-hidden="true"
                  className="w-10 h-10 rounded-full bg-[#2D6A4F] flex items-center justify-center shadow-md -mt-5 border-2 border-white"
                >
                  <Icon name={icon} size={18} className="text-white" />
                </span>
              ) : (
                <span className="relative">
                  <Icon name={icon} size={20} />
                  {page === "messages" && unreadMessages > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute -top-1 -right-1 min-w-3.5 h-3.5 px-1 bg-[#E8694A] text-white text-[8px] font-bold rounded-full flex items-center justify-center"
                    >
                      {unreadMessages > 99 ? "99+" : unreadMessages}
                    </span>
                  )}
                </span>
              )}
              <span className={`text-[10px] font-medium ${special ? "text-[#2D6A4F]" : ""}`}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </nav>
    </>
  )
}