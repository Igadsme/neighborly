import { useState } from "react"
import { Avatar, Icon } from "./ui"

type Page = "home" | "explore" | "categories" | "map" | "listing" | "create" | "messages" | "saved" | "profile" | "dashboard" | "housing" | "services" | "jobs" | "community"

interface NavProps {
  currentPage: Page
  onNavigate: (p: Page) => void
  unreadMessages?: number
  onSignOut?: () => void
}

export default function Navigation({
  currentPage,
  onNavigate,
  unreadMessages = 0,
  onSignOut,
}: NavProps) {
  const [locationOpen, setLocationOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [mobileSearch, setMobileSearch] = useState("")

  const isActive = (p: Page) => currentPage === p

  return (
    <>
      {/* Desktop Navigation */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-[#E8E6DF] hidden md:block">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center gap-4 h-16">
            {/* Logo */}
            <button
              onClick={() => onNavigate("home")}
              className="flex items-center gap-2 flex-shrink-0 mr-2"
            >
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
            </button>

            {/* Location selector */}
            <div className="relative">
              <button
                onClick={() => setLocationOpen(!locationOpen)}
                className="flex items-center gap-1.5 text-sm font-medium text-[#5C6E8A] hover:text-[#1B2A4A] transition-colors px-3 py-2 rounded-lg hover:bg-[#F5F4EF] border border-[#E8E6DF]"
              >
                <Icon name="mapPin" size={13} className="text-[#E8694A]" />
                Atlanta, GA
                <Icon name="chevronDown" size={11} />
              </button>
              {locationOpen && (
                <div className="absolute top-10 left-0 w-64 bg-white border border-[#E8E6DF] rounded-xl shadow-lg p-2 z-50">
                  {[
                    "Atlanta, GA",
                    "Decatur, GA",
                    "Midtown, Atlanta",
                    "Buckhead",
                    "Inman Park",
                  ].map((loc) => (
                    <button
                      key={loc}
                      onClick={() => setLocationOpen(false)}
                      className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-[#F5F4EF] text-[#1B2A4A]"
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Search bar */}
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Icon
                  name="search"
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C5CCDA] pointer-events-none"
                />
                <input
                  type="text"
                  placeholder="Search for anything nearby..."
                  className="w-full h-9 pl-9 pr-4 bg-[#F5F4EF] border border-transparent rounded-full text-sm text-[#1B2A4A] placeholder:text-[#C5CCDA] focus:outline-none focus:bg-white focus:border-[#2D6A4F] transition-all"
                  onFocus={() => onNavigate("explore")}
                />
              </div>
            </div>

            {/* Nav links */}
            <nav className="flex items-center gap-1 ml-2">
              {[
                { label: "Explore", page: "explore" as Page, icon: "compass" },
                { label: "Map", page: "map" as Page, icon: "map" },
                { label: "Housing", page: "housing" as Page, icon: null },
                { label: "Services", page: "services" as Page, icon: null },
                { label: "Jobs", page: "jobs" as Page, icon: null },
                { label: "Community", page: "community" as Page, icon: null },
              ].map(({ label, page }) => (
                <button
                  key={page}
                  onClick={() => onNavigate(page)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
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
                onClick={() => onNavigate("messages")}
                className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                  isActive("messages")
                    ? "bg-[#F0FBF3] text-[#2D6A4F]"
                    : "hover:bg-[#F5F4EF] text-[#5C6E8A]"
                }`}
              >
                <Icon name="message" size={18} />
                {unreadMessages > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#E8694A] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadMessages}
                  </span>
                )}
              </button>

              {/* Saved */}
              <button
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
                onClick={() => onNavigate("create")}
                className="flex items-center gap-2 bg-[#2D6A4F] text-white px-4 py-2 rounded-full text-sm font-semibold hover:bg-[#1B4332] transition-all active:scale-95 shadow-sm"
              >
                <Icon name="plus" size={14} />
                Post Listing
              </button>

              {/* Profile */}
              <div className="relative">
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-2 pl-2 pr-3 py-1 rounded-full border border-[#E8E6DF] hover:border-[#C5CCDA] transition-colors"
                >
                  <Avatar
                    src="photo-1544005313-94ddf0286df2"
                    name="Gad"
                    size="sm"
                    verified
                  />
                  <Icon
                    name="chevronDown"
                    size={12}
                    className="text-[#8A9AB5]"
                  />
                </button>
                {profileOpen && (
                  <div className="absolute right-0 top-11 w-52 bg-white border border-[#E8E6DF] rounded-2xl shadow-xl p-2 z-50">
                    <div className="px-3 py-2 border-b border-[#F5F4EF] mb-1">
                      <p className="font-semibold text-sm text-[#1B2A4A]">
                        Gad Miller
                      </p>
                      <p className="text-xs text-[#8A9AB5]">
                        Inman Park · Atlanta
                      </p>
                    </div>
                    {[
                      { label: "My Dashboard", page: "dashboard" as Page },
                      { label: "My Profile", page: "profile" as Page },
                      { label: "My Listings", page: "dashboard" as Page },
                      { label: "Messages", page: "messages" as Page },
                      { label: "Saved Items", page: "saved" as Page },
                    ].map(({ label, page }) => (
                      <button
                        key={label}
                        onClick={() => {
                          onNavigate(page)
                          setProfileOpen(false)
                        }}
                        className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-[#F5F4EF] text-[#1B2A4A] transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                    <div className="border-t border-[#F5F4EF] mt-1 pt-1">
                      <button
                        onClick={onSignOut}
                        className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-[#F5F4EF] text-[#8A9AB5] transition-colors"
                      >
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Navigation */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-[#E8E6DF] md:hidden">
        <div className="px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => onNavigate("home")}
            className="flex items-center gap-1.5 flex-shrink-0"
          >
            <div className="w-7 h-7 rounded-lg bg-[#2D6A4F] flex items-center justify-center">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path
                  d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
                  fill="white"
                />
                <polyline
                  points="9,22 9,13 15,13 15,22"
                  fill="none"
                  stroke="#D8F3DC"
                  strokeWidth="2"
                />
              </svg>
            </div>
            <span className="font-display font-semibold text-[#1B2A4A]">
              Neighborly
            </span>
          </button>

          <div className="flex-1 relative">
            <Icon
              name="search"
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C5CCDA] pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search..."
              value={mobileSearch}
              onChange={(e) => setMobileSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-3 bg-[#F5F4EF] rounded-full text-sm text-[#1B2A4A] placeholder:text-[#C5CCDA] focus:outline-none"
              onFocus={() => onNavigate("explore")}
            />
          </div>

          <button
            onClick={() => onNavigate("messages")}
            className="relative w-8 h-8 flex items-center justify-center text-[#5C6E8A]"
          >
            <Icon name="message" size={18} />
            {unreadMessages > 0 && (
              <span className="absolute top-0 right-0 w-4 h-4 bg-[#E8694A] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {unreadMessages}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#E8E6DF] md:hidden bottom-nav">
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
            { label: "Profile", page: "profile" as Page, icon: "user" },
          ].map(({ label, page, icon, special }) => (
            <button
              key={page}
              onClick={() => onNavigate(page)}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                special
                  ? "relative"
                  : isActive(page)
                    ? "text-[#2D6A4F]"
                    : "text-[#8A9AB5]"
              }`}
            >
              {special ? (
                <div className="w-10 h-10 rounded-full bg-[#2D6A4F] flex items-center justify-center shadow-md -mt-5 border-2 border-white">
                  <Icon name={icon} size={18} className="text-white" />
                </div>
              ) : (
                <div className="relative">
                  <Icon name={icon} size={20} />
                  {page === "messages" && unreadMessages > 0 && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#E8694A] text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                      {unreadMessages}
                    </span>
                  )}
                </div>
              )}
              <span
                className={`text-[10px] font-medium ${
                  special ? "text-[#2D6A4F]" : ""
                }`}
              >
                {label}
              </span>
            </button>
          ))}
        </div>
      </nav>
    </>
  )
}
