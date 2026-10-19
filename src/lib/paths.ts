/**
 * Addressable URLs for the app.
 *
 * react-router is not installed. This is the History API router: each screen
 * has a path, `pushState` records it, and `popstate` restores it. Account
 * tokens still arrive as `/?verify=` and `/?reset=` and are removed from the
 * address bar before they can be stored in history.
 */

export interface ParsedRoute {
  page: string
  listingId: string | null
  conversationId: string | null
  profileUserId: string | null
  requestId: string | null
  disputeId: string | null
  passportUserId: string | null
  missionId: string | null
}

const BLANK: Omit<ParsedRoute, "page"> = {
  listingId: null,
  conversationId: null,
  profileUserId: null,
  requestId: null,
  disputeId: null,
  passportUserId: null,
  missionId: null,
}

function route(page: string, ids: Partial<Omit<ParsedRoute, "page">> = {}): ParsedRoute {
  return { page, ...BLANK, ...ids }
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function normalizePath(pathname: string): string {
  const path = pathname.split("?")[0]?.split("#")[0] || "/"
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1)
  return path.startsWith("/") ? path : `/${path}`
}

const STATIC_PAGES: Record<string, string> = {
  "/": "landing",
  "/onboarding": "onboarding",
  "/home": "home",
  "/explore": "explore",
  "/categories": "categories",
  "/map": "map",
  "/create": "create",
  "/messages": "messages",
  "/saved": "saved",
  "/profile": "profile",
  "/dashboard": "dashboard",
  "/housing": "housing",
  "/services": "services",
  "/jobs": "jobs",
  "/community": "community",
  "/account": "account",
  "/forgot-password": "forgot-password",
  "/reset-password": "reset-password",
  "/verify-email": "verify-email",
  "/my-listings": "my-listings",
  "/listings/new": "create-marketplace",
  "/requests": "requests",
  "/requests/mine": "my-requests",
  "/requests/new": "request-create",
  "/notifications": "notifications",
  "/notifications/preferences": "notification-preferences",
  "/saved-searches": "saved-searches",
  "/missions": "missions",
  "/missions/new": "mission-create",
  "/missions/contributions": "mission-contributions",
  "/moderation": "community-moderation",
  "/reports": "report-queue",
  "/staff": "staff-queue",
  "/borrow": "borrow",
  "/borrow/new": "borrow-create",
  "/borrow/mine": "borrow-lent",
  "/borrow/disputes": "borrow-dispute",
  "/passport/me": "passport-me",
  "/passport/settings": "passport-settings",
  "/passport/edit": "passport-edit",
  "/passport/privacy": "passport-privacy",
}

export function parsePath(pathname: string): ParsedRoute {
  const path = normalizePath(pathname)
  const staticPage = STATIC_PAGES[path]
  if (staticPage) return route(staticPage)

  let match = path.match(/^\/listings\/([^/]+)$/)
  if (match?.[1]) return route("listing", { listingId: decode(match[1]) })

  match = path.match(/^\/(?:messages|conversations)\/([^/]+)$/)
  if (match?.[1]) return route("messages", { conversationId: decode(match[1]) })

  match = path.match(/^\/(?:profile|users)\/([^/]+)$/)
  if (match?.[1]) return route("profile", { profileUserId: decode(match[1]) })

  match = path.match(/^\/requests\/([^/]+)\/edit$/)
  if (match?.[1]) return route("request-edit", { requestId: decode(match[1]) })

  match = path.match(/^\/requests\/([^/]+)(?:\/offers)?$/)
  if (match?.[1] && match[1] !== "mine" && match[1] !== "new") {
    return route("request-detail", { requestId: decode(match[1]) })
  }

  match = path.match(/^\/borrow\/items\/([^/]+)\/edit$/)
  if (match?.[1]) return route("borrow-edit", { requestId: decode(match[1]) })

  match = path.match(/^\/borrow\/items\/([^/]+)$/)
  if (match?.[1]) return route("borrow-item", { requestId: decode(match[1]) })

  match = path.match(/^\/borrow\/requests\/([^/]+)$/)
  if (match?.[1]) return route("borrow-detail", { requestId: decode(match[1]) })

  match = path.match(/^\/borrow\/disputes\/([^/]+)$/)
  if (match?.[1]) return route("borrow-dispute", { disputeId: decode(match[1]) })

  match = path.match(/^\/missions\/([^/]+)\/manage$/)
  if (match?.[1]) return route("mission-manage", { missionId: decode(match[1]) })

  match = path.match(/^\/missions\/([^/]+)\/edit$/)
  if (match?.[1]) return route("mission-edit", { missionId: decode(match[1]) })

  match = path.match(/^\/missions\/([^/]+)$/)
  if (match?.[1] && match[1] !== "contributions" && match[1] !== "new") {
    return route("mission-detail", { missionId: decode(match[1]) })
  }

  match = path.match(/^\/passport\/([^/]+)$/)
  if (match?.[1] && !["me", "settings", "edit", "privacy"].includes(match[1])) {
    return route("passport", { passportUserId: decode(match[1]) })
  }

  // Completed exchanges live on the dashboard. A pasted transaction link
  // still opens that screen instead of a 404.
  if (/^\/transactions\/[^/]+$/.test(path)) return route("dashboard")

  return route("not-found")
}

function enc(id: string) {
  return encodeURIComponent(id)
}

/** Path for an in-app page. `null` means the page is not addressable. */
export function pathFor(page: string, id?: string): string | null {
  switch (page) {
    case "landing":
      return "/"
    case "onboarding":
      return "/onboarding"
    case "home":
      return "/home"
    case "explore":
      return "/explore"
    case "categories":
      return "/categories"
    case "map":
      return "/map"
    case "listing":
      return id ? `/listings/${enc(id)}` : null
    case "create":
      return "/create"
    case "messages":
      return id ? `/messages/${enc(id)}` : "/messages"
    case "saved":
      return "/saved"
    case "profile":
      return id ? `/profile/${enc(id)}` : "/profile"
    case "dashboard":
      return "/dashboard"
    case "housing":
      return "/housing"
    case "services":
      return "/services"
    case "jobs":
      return "/jobs"
    case "community":
      return "/community"
    case "account":
      return "/account"
    case "forgot-password":
      return "/forgot-password"
    case "reset-password":
      return "/reset-password"
    case "verify-email":
      return "/verify-email"
    case "my-listings":
      return "/my-listings"
    case "create-marketplace":
      return "/listings/new"
    case "requests":
      return "/requests"
    case "my-requests":
      return "/requests/mine"
    case "request-create":
      return "/requests/new"
    case "request-edit":
      return id ? `/requests/${enc(id)}/edit` : null
    case "request-detail":
      return id ? `/requests/${enc(id)}` : null
    case "notifications":
      return "/notifications"
    case "notification-preferences":
      return "/notifications/preferences"
    case "saved-searches":
      return "/saved-searches"
    case "missions":
      return "/missions"
    case "mission-detail":
      return id ? `/missions/${enc(id)}` : null
    case "mission-create":
      return "/missions/new"
    case "mission-edit":
      return id ? `/missions/${enc(id)}/edit` : null
    case "mission-manage":
      return id ? `/missions/${enc(id)}/manage` : null
    case "mission-contributions":
      return "/missions/contributions"
    case "community-moderation":
      return "/moderation"
    case "report-queue":
      return "/reports"
    case "passport":
      return id ? `/passport/${enc(id)}` : null
    case "passport-me":
      return "/passport/me"
    case "passport-settings":
      return "/passport/settings"
    case "passport-edit":
      return "/passport/edit"
    case "passport-privacy":
      return "/passport/privacy"
    case "staff-queue":
      return "/staff"
    case "borrow":
      return "/borrow"
    case "borrow-item":
      return id ? `/borrow/items/${enc(id)}` : null
    case "borrow-create":
      return "/borrow/new"
    case "borrow-edit":
      return id ? `/borrow/items/${enc(id)}/edit` : null
    case "borrow-detail":
      return id ? `/borrow/requests/${enc(id)}` : null
    case "borrow-lent":
      return "/borrow/mine"
    case "borrow-dispute":
      return id ? `/borrow/disputes/${enc(id)}` : "/borrow/disputes"
    default:
      return null
  }
}

export function readAccountToken(search: string): { kind: "verify" | "reset"; token: string } | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  const reset = params.get("reset")
  if (reset) return { kind: "reset", token: reset }
  const verify = params.get("verify") ?? params.get("verifyEmailChange")
  if (verify) return { kind: "verify", token: verify }
  return null
}

/**
 * Holds a token only for the lifetime of this page load, after the query
 * string has been stripped. A strict-mode remount can read it again; a
 * refresh cannot, because it is not written to storage or history.
 */
let remembered: { token: string; path: string } | null = null

export function resetRememberedAccountToken() {
  remembered = null
}

export interface BootRoute {
  route: ParsedRoute
  token: string | null
  /** Replace the address bar with this path so the token query is gone. */
  replaceWith: string | null
}

export function bootFromLocation(pathname: string, search: string): BootRoute {
  const link = readAccountToken(search)
  if (link) {
    const page = link.kind === "reset" ? "reset-password" : "verify-email"
    const path = pathFor(page)!
    remembered = { token: link.token, path }
    return { route: parsePath(path), token: link.token, replaceWith: path }
  }
  if (remembered && normalizePath(pathname) === remembered.path) {
    return { route: parsePath(remembered.path), token: remembered.token, replaceWith: null }
  }
  return { route: parsePath(pathname), token: null, replaceWith: null }
}

export function absoluteAppUrl(path: string): string {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "")
  return `${window.location.origin}${base}${path}`
}

/** Copies a real path. Failure stays a failure so the UI does not pretend a share happened. */
export async function copyShareUrl(path: string): Promise<"copied" | "unavailable"> {
  try {
    if (!navigator.clipboard?.writeText) return "unavailable"
    await navigator.clipboard.writeText(absoluteAppUrl(path))
    return "copied"
  } catch {
    return "unavailable"
  }
}
