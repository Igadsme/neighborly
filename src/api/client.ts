import type {
  AccountPrivacyInput,
  AccountProfileInput,
  AccountStatus,
  AcceptOfferResult,
  ApiCommunityComment,
  ApiCommunityEvent,
  ApiCommunityPost,
  ApiConversation,
  ApiFavorite,
  ApiGiveaway,
  ApiHousing,
  ApiJob,
  ApiJobApplication,
  ApiJobSave,
  ApiListing,
  ApiLostFound,
  ApiMessage,
  ApiRequestDetail,
  ApiRequestSummary,
  ApiScopedOffer,
  ApiSavedSearch,
  ApiServiceListing,
  ApiServiceQuote,
  ApiTransaction,
  AuthResponse,
  CommunityPostInput,
  CommunityPostQuery,
  CommunitySummary,
  CreateConversationInput,
  GiveawayInput,
  LostFoundInput,
  NeighborhoodCount,
  ServiceCreateInput,
  CreateConversationResult,
  CurrentUser,
  HousingQuery,
  JobQuery,
  ListingInput,
  ListingQuery,
  NeedRequestInput,
  OfferInput,
  ProfileReview,
  PublicProfile,
  ReviewInput,
  ServiceQuery,
  ServiceQuoteInput,
} from "./types"

const API_URL = (
  import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1"
).replace(/\/$/, "")
const ACCESS_TOKEN_KEY = "neighborly.access_token"

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export const CSRF_COOKIE = "neighborly.csrf"
export const CSRF_HEADER = "X-Neighborly-CSRF"

function readCookie(name: string) {
  const entry = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  if (!entry) return undefined
  const value = entry.slice(name.length + 1)
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Every call is credentialed so the HttpOnly refresh cookie rides along.
 * The CSRF cookie is readable by design; it is echoed back in a header on
 * state-changing requests, which a cross-site page cannot do.
 */
function authHeaders(headers: Headers, method: string) {
  const token = window.localStorage.getItem(ACCESS_TOKEN_KEY)
  if (token) headers.set("Authorization", `Bearer ${token}`)
  if (!["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) {
    const csrf = readCookie(CSRF_COOKIE)
    if (csrf) headers.set(CSRF_HEADER, csrf)
  }
  return headers
}

async function readBody(response: Response) {
  return response.json().catch(() => null) as Promise<{
    message?: string | string[]
  } | null>
}

type Renewal = "renewed" | "unauthorized" | "failed"

let refreshInFlight: Promise<Renewal> | null = null

/**
 * Renews the access token through the HttpOnly refresh cookie. Concurrent
 * 401s share one in-flight refresh so a burst of requests cannot rotate the
 * cookie several times and trip reuse detection.
 */
function renewAccessToken(): Promise<Renewal> {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(new Headers({ Accept: "application/json" }), "POST"),
      })
      if (!response.ok) {
        // Only a rejection of the session itself ends it. A 5xx or a
        // network failure is treated as transient so a blip does not sign
        // the user out of a session the server still considers valid.
        if (response.status === 401 || response.status === 403) {
          window.localStorage.removeItem(ACCESS_TOKEN_KEY)
          return "unauthorized"
        }
        return "failed"
      }
      const payload = (await response.json()) as AuthResponse
      window.localStorage.setItem(ACCESS_TOKEN_KEY, payload.accessToken)
      return "renewed"
    } catch {
      return "failed"
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

export function onSessionExpired(listener: () => void) {
  sessionExpiredListeners.add(listener)
  return () => {
    sessionExpiredListeners.delete(listener)
  }
}

const sessionExpiredListeners = new Set<() => void>()

function announceSessionExpired() {
  sessionExpiredListeners.forEach(listener => listener())
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retried = false
): Promise<T> {
  const method = options.method ?? "GET"
  const headers = authHeaders(new Headers(options.headers), method)
  headers.set("Accept", "application/json")
  if (options.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json")

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  })

  // One transparent renewal, then surface the original error. The session
  // is only torn down when the server rejected the refresh credential.
  if (response.status === 401 && !retried && !path.startsWith("/auth/")) {
    const renewal = await renewAccessToken()
    if (renewal === "renewed") return request<T>(path, options, true)
    if (renewal === "unauthorized") announceSessionExpired()
  }

  if (!response.ok) {
    const payload = await readBody(response)
    throw new ApiError(
      readMessage(payload?.message, response.status),
      response.status,
    )
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function readMessage(message: string | string[] | undefined, status: number) {
  if (Array.isArray(message)) {
    const text = message.join(" ").trim()
    if (text) return text
  } else if (typeof message === "string" && message.trim()) {
    return message
  }
  return `Request failed with status ${status}`
}

export function readError(cause: unknown, fallback: string) {
  return cause instanceof ApiError && cause.message ? cause.message : fallback
}

export function readStatus(cause: unknown, fallback: string) {
  if (cause instanceof ApiError && cause.status === 401) return "Sign in to continue."
  return readError(cause, fallback)
}

function queryString(query: object) {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === "") return
    params.set(key, String(value))
  })
  const text = params.toString()
  return text ? `?${text}` : ""
}

export const api = {
  auth: {
    register: async (input: {
      email: string
      password: string
      firstName: string
      lastName: string
      neighborhood?: string
      city?: string
      state?: string
    }) => {
      const result = await request<AuthResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      })
      window.localStorage.setItem(ACCESS_TOKEN_KEY, result.accessToken)
      return result
    },
    login: async (input: { email: string; password: string }) => {
      const result = await request<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      })
      window.localStorage.setItem(ACCESS_TOKEN_KEY, result.accessToken)
      return result
    },
    signOut: async () => {
      // Clear locally first so the UI is responsive even if the network
      // call fails, then tell the server to revoke this session.
      window.localStorage.removeItem(ACCESS_TOKEN_KEY)
      try {
        await request<void>("/auth/logout", { method: "POST" })
      } catch {
        // A revoked-or-missing cookie is already the desired end state.
      }
    },
    /** Ends every session on every device. */
    signOutEverywhere: async () => {
      window.localStorage.removeItem(ACCESS_TOKEN_KEY)
      await request<void>("/auth/logout-all", { method: "POST" })
    },
    me: () => request<CurrentUser>("/users/me"),
    hasSession: () => Boolean(window.localStorage.getItem(ACCESS_TOKEN_KEY)),
    verifyEmail: (token: string) =>
      request<{ verified: boolean; email: string }>("/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
    resendVerification: (email?: string) =>
      request<{ sent: boolean }>("/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    forgotPassword: (email: string) =>
      request<{ accepted: boolean }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    resetPassword: (token: string, password: string) =>
      request<{ reset: boolean }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      }),
    changePassword: (currentPassword: string, password: string) =>
      request<{ changed: boolean }>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, password }),
      }),
    sessions: () =>
      request<
        Array<{
          id: string
          userAgent: string | null
          ipAddress: string | null
          createdAt: string
          lastUsedAt: string
          expiresAt: string
        }>
      >("/auth/sessions"),
    revokeSession: (id: string) =>
      request<void>(`/auth/sessions/${id}`, { method: "DELETE" }),
    completeOnboarding: (input: {
      neighborhood?: string
      city?: string
      state?: string
      interests?: string[]
      capabilities?: string[]
      newListings?: boolean
      priceDrops?: boolean
      messages?: boolean
      events?: boolean
      community?: boolean
    }) =>
      request<CurrentUser>("/users/me/onboarding", {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
  },
  users: {
    profile: (id: string) => request<PublicProfile>(`/users/${id}/profile`),
    reviews: (id: string) => request<ProfileReview[]>(`/users/${id}/reviews`),
    accountStatus: () => request<AccountStatus>("/users/me/status"),
    updateProfile: (input: AccountProfileInput) =>
      request<CurrentUser>("/users/me/profile", {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    updatePrivacy: (input: AccountPrivacyInput) =>
      request<CurrentUser>("/users/me/privacy", {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    requestEmailChange: (email: string, currentPassword: string) =>
      request<{ pendingEmail: string }>("/users/me/email", {
        method: "POST",
        body: JSON.stringify({ email, currentPassword }),
      }),
    cancelEmailChange: () => request<{ pendingEmail: null }>("/users/me/email/pending", { method: "DELETE" }),
    sessions: () =>
      request<
        Array<{
          id: string
          userAgent: string | null
          ipAddress: string | null
          createdAt: string
          lastUsedAt: string
          expiresAt: string
        }>
      >("/users/me/sessions"),
    revokeSession: (id: string) => request<void>(`/users/me/sessions/${id}`, { method: "DELETE" }),
    revokeAllSessions: () =>
      request<void>("/users/me/sessions/revoke-all", { method: "POST" }),
    deleteAccount: (password: string, confirm: string) =>
      request<{ deleted: boolean; alreadyDeleted: boolean }>("/users/me", {
        method: "DELETE",
        body: JSON.stringify({ password, confirm }),
      }),
  },
  safety: {
    report: (input: {
      targetType: "LISTING" | "USER" | "MESSAGE" | "COMMUNITY_POST"
      targetId: string
      reason: "SPAM" | "SCAM" | "HARASSMENT" | "INAPPROPRIATE" | "OTHER"
      details?: string
    }) =>
      request<{ id: string; status: string }>("/safety/reports", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    blocks: () => request<Array<{ userId: string; createdAt: string }>>("/safety/blocks"),
    block: (userId: string) =>
      request<{ blocked: boolean; userId: string }>("/safety/blocks", {
        method: "POST",
        body: JSON.stringify({ userId }),
      }),
    unblock: (userId: string) =>
      request<{ blocked: boolean; userId: string }>(`/safety/blocks/${userId}`, {
        method: "DELETE",
      }),
  },
  listings: {
    list: (query: ListingQuery = {}) => {
      const params = new URLSearchParams()
      Object.entries(query).forEach(
        ([key, value]) => value !== undefined && params.set(key, String(value)),
      )
      return request<ApiListing[]>(`/listings${params.size ? `?${params}` : ""}`)
    },
    create: (input: ListingInput) =>
      request<ApiListing>("/listings", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    saveDraft: (input: ListingInput) =>
      request<ApiListing>("/listings/drafts", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    publish: (id: string) =>
      request<ApiListing>(`/listings/${id}/publish`, { method: "POST" }),
    pause: (id: string) =>
      request<ApiListing>(`/listings/${id}/pause`, { method: "POST" }),
    markSold: (id: string) =>
      request<ApiListing>(`/listings/${id}/sold`, { method: "POST" }),
    mine: () => request<ApiListing[]>("/listings/mine"),
    neighborhoods: () => request<NeighborhoodCount[]>("/listings/neighborhoods"),
    get: (id: string) => request<ApiListing>(`/listings/${id}`),
    update: (id: string, input: Partial<ListingInput>) =>
      request<unknown>(`/listings/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    archive: (id: string) =>
      request<unknown>(`/listings/${id}`, { method: "DELETE" }),
    toggleFavorite: (id: string) =>
      request<{ saved: boolean }>(`/listings/${id}/favorite`, {
        method: "POST",
      }),
    favorites: () => request<ApiFavorite[]>("/listings/favorites"),
    savedSearches: () => request<ApiSavedSearch[]>("/listings/saved-searches"),
    saveSearch: (query: string, filters: Record<string, unknown>) =>
      request<unknown>("/listings/saved-searches", {
        method: "POST",
        body: JSON.stringify({ query, filters }),
      }),
  },
  categories: {
    list: () =>
      request<
        Array<{ id: string; name: string; slug: string; listingCount?: number }>
      >("/categories"),
  },
  requests: {
    list: () => request<ApiRequestSummary[]>("/requests"),
    offers: (scope: "received" | "sent" | "all" = "received") =>
      request<ApiScopedOffer[]>(`/requests/offers?scope=${scope}`),
    get: (id: string) => request<ApiRequestDetail>(`/requests/${id}`),
    create: (input: NeedRequestInput) =>
      request<unknown>("/requests", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    createOffer: (requestId: string, input: OfferInput) =>
      request<unknown>(`/requests/${requestId}/offers`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    counterOffer: (
      offerId: string,
      input: { amountCents?: number; message: string },
    ) =>
      request<unknown>(`/requests/offers/${offerId}/counter`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    acceptOffer: (requestId: string, offerId: string) =>
      request<AcceptOfferResult>(
        `/requests/${requestId}/offers/${offerId}/accept`,
        { method: "POST" },
      ),
    rejectOffer: (requestId: string, offerId: string) =>
      request<unknown>(`/requests/${requestId}/offers/${offerId}/reject`, {
        method: "POST",
      }),
  },
  transactions: {
    list: () => request<ApiTransaction[]>("/transactions"),
    transition: (transactionId: string, status: string) =>
      request<unknown>(`/transactions/${transactionId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
  },
  reviews: {
    create: (input: ReviewInput) =>
      request<unknown>("/reviews", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  },
  conversations: {
    create: (input: CreateConversationInput) =>
      request<CreateConversationResult>("/conversations", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    list: () => request<ApiConversation[]>("/conversations"),
    messages: (conversationId: string) =>
      request<ApiMessage[]>(`/conversations/${conversationId}/messages`),
    send: (conversationId: string, body: string) =>
      request<ApiMessage>(`/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    markRead: (conversationId: string) =>
      request<unknown>(`/conversations/${conversationId}/read`, {
        method: "PATCH",
      }),
  },
  housing: {
    list: (query: HousingQuery = {}) =>
      request<ApiHousing[]>(`/housing${queryString(query)}`),
  },
  jobs: {
    list: (query: JobQuery = {}) => request<ApiJob[]>(`/jobs${queryString(query)}`),
    saved: () => request<ApiJobSave[]>("/jobs/saved"),
    applications: () => request<ApiJobApplication[]>("/jobs/applications"),
    apply: (id: string, message?: string) =>
      request<unknown>(`/jobs/${id}/apply`, {
        method: "POST",
        body: JSON.stringify(message ? { message } : {}),
      }),
    toggleSave: (id: string) =>
      request<{ saved: boolean }>(`/jobs/${id}/save`, { method: "POST" }),
  },
  services: {
    list: (query: ServiceQuery = {}) =>
      request<ApiServiceListing[]>(`/services${queryString(query)}`),
    requestQuote: (id: string, input: ServiceQuoteInput) =>
      request<ApiServiceQuote>(`/services/${id}/quotes`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    create: (input: ServiceCreateInput) =>
      request<ApiServiceListing>("/services", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  },
  community: {
    summary: () => request<CommunitySummary>("/community/summary"),
    posts: (query: CommunityPostQuery = {}) =>
      request<ApiCommunityPost[]>(`/community/posts${queryString(query)}`),
    comments: (id: string) =>
      request<ApiCommunityComment[]>(`/community/posts/${id}/comments`),
    comment: (id: string, body: string) =>
      request<ApiCommunityComment>(`/community/posts/${id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    createPost: (input: CommunityPostInput) =>
      request<ApiCommunityPost>("/community/posts", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    react: (id: string, emoji: "👍" | "❤️" | "😮") =>
      request<ApiCommunityPost>(`/community/posts/${id}/reactions`, {
        method: "POST",
        body: JSON.stringify({ emoji }),
      }),
    events: () => request<ApiCommunityEvent[]>("/community/events"),
    rsvp: (id: string) =>
      request<{ attending: boolean; attendingCount: number }>(
        `/community/events/${id}/rsvp`,
        { method: "POST" },
      ),
    lostFound: () => request<ApiLostFound[]>("/community/lost-found"),
    createLostFound: (input: LostFoundInput) =>
      request<ApiLostFound>("/community/lost-found", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    giveaways: () => request<ApiGiveaway[]>("/community/giveaways"),
    createGiveaway: (input: GiveawayInput) =>
      request<ApiGiveaway>("/community/giveaways", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    claim: (id: string) =>
      request<{ claimed: boolean; giveaway: ApiGiveaway }>(
        `/community/giveaways/${id}/claim`,
        { method: "POST" },
      ),
  },
}
