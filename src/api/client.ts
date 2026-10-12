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
  CreateConversationResult,
  CurrentUser,
  HousingQuery,
  JobQuery,
  ListingInput,
  ListingPage,
  ListingQueryParams,
  BorrowAvailability,
  PublicUserCard,
  BorrowDispute,
  BorrowExtension,
  BorrowItemPage,
  BorrowItemQuery,
  BorrowableItem,
  BorrowableItemInput,
  BorrowRequest,
  BorrowRequestInput,
  NotificationPage,
  NotificationPreferences,
  RequestMatch,
  RequestPage,
  RequestQuery,
  RequestStatus,
  RequestStatusEvent,
  SavedSearchAlert,
  StoredImage,
  UnreadCounts,
  HousingCreateInput,
  JobCreateInput,
  ServiceCreateInput,
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

/**
 * XHR rather than fetch: only XHR exposes upload progress events, and the
 * requirement is a real progress bar rather than a simulated one.
 */
function uploadWithProgress<T>(
  path: string,
  file: File,
  onProgress?: (fraction: number) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append("file", file)

    const xhr = new XMLHttpRequest()
    xhr.open("POST", `${API_URL}${path}`)
    xhr.withCredentials = true
    const token = window.localStorage.getItem(ACCESS_TOKEN_KEY)
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`)
    const csrf = readCookie(CSRF_COOKIE)
    if (csrf) xhr.setRequestHeader(CSRF_HEADER, csrf)

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = event => {
        if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total)
      }
    }

    xhr.onload = () => {
      const payload = (() => {
        try {
          return JSON.parse(xhr.responseText) as { message?: string | string[] }
        } catch {
          return null
        }
      })()
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1)
        resolve(payload as T)
        return
      }
      reject(new ApiError(readMessage(payload?.message, xhr.status), xhr.status))
    }
    xhr.onerror = () => reject(new ApiError("Upload failed. Check your connection and try again.", 0))
    xhr.onabort = () => reject(new ApiError("Upload was cancelled.", 0))
    xhr.send(form)
  })
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
    /**
     * Server-side filtering, sorting, and pagination. Every filter is a query
     * parameter so results are global rather than filtered after the page is
     * fetched.
     */
    search: (query: ListingQueryParams = {}) => {
      const params = new URLSearchParams()
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === "" || value === null) return
        params.set(key, String(value))
      })
      const text = params.toString()
      return request<ListingPage>(`/listings${text ? `?${text}` : ""}`)
    },
    list: (query: ListingQueryParams = {}) => api.listings.search(query),
    get: (id: string) => request<ApiListing>(`/listings/${id}`),
    /** Owner view: includes drafts the public route deliberately hides. */
    manage: (id: string) => request<ApiListing>(`/listings/${id}/manage`),
    create: (input: ListingInput) =>
      request<ApiListing>("/listings", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    saveDraft: (input: Partial<ListingInput>) =>
      request<ApiListing>("/listings/drafts", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    publish: (id: string) => request<ApiListing>(`/listings/${id}/publish`, { method: "POST" }),
    pause: (id: string) => request<ApiListing>(`/listings/${id}/pause`, { method: "POST" }),
    markSold: (id: string) => request<ApiListing>(`/listings/${id}/sold`, { method: "POST" }),
    restore: (id: string) => request<ApiListing>(`/listings/${id}/restore`, { method: "POST" }),
    update: (id: string, input: Partial<ListingInput>) =>
      request<ApiListing>(`/listings/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    archive: (id: string) => request<ApiListing>(`/listings/${id}`, { method: "DELETE" }),
    remove: (id: string) =>
      request<{ id: string; deleted: boolean }>(`/listings/${id}/permanent`, { method: "DELETE" }),
    mine: (status?: string) =>
      request<ApiListing[]>(`/listings/mine${status ? `?status=${status}` : ""}`),
    neighborhoods: () => request<NeighborhoodCount[]>("/listings/neighborhoods"),
    storageStatus: () => request<{ configured: boolean }>("/listings/storage-status"),

    /** Multipart upload with real progress, so the bar is not a fake. */
    uploadImage: (listingId: string, file: File, onProgress?: (fraction: number) => void) =>
      uploadWithProgress(`/listings/${listingId}/images`, file, onProgress),
    listImages: (id: string) => request<StoredImage[]>(`/listings/${id}/manage`),
    removeImage: (listingId: string, imageId: string) =>
      request<StoredImage[]>(`/listings/${listingId}/images/${imageId}`, { method: "DELETE" }),
    reorderImages: (listingId: string, imageIds: string[]) =>
      request<StoredImage[]>(`/listings/${listingId}/images/reorder`, {
        method: "POST",
        body: JSON.stringify({ imageIds }),
      }),

    toggleFavorite: (id: string) =>
      request<{ saved: boolean }>(`/listings/${id}/favorite`, { method: "POST" }),
    favorites: () => request<ApiFavorite[]>("/listings/favorites"),
    savedSearches: () => request<ApiSavedSearch[]>("/listings/saved-searches"),
    saveSearch: (query: string, filters: Record<string, unknown>) =>
      request<ApiSavedSearch>("/listings/saved-searches", {
        method: "POST",
        body: JSON.stringify({ query, filters }),
      }),
    updateSavedSearch: (id: string, input: { query?: string; filters?: Record<string, unknown> }) =>
      request<ApiSavedSearch>(`/listings/saved-searches/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    deleteSavedSearch: (id: string) =>
      request<void>(`/listings/saved-searches/${id}`, { method: "DELETE" }),
  },
  borrow: {
    listItems: (query: BorrowItemQuery = {}) => {
      const params = new URLSearchParams()
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === "" || value === null) return
        params.set(key, String(value))
      })
      const text = params.toString()
      return request<BorrowItemPage>(`/borrow/items${text ? `?${text}` : ""}`)
    },
    item: (listingId: string) => request<BorrowableItem>(`/borrow/items/${listingId}`),
    myItems: () => request<BorrowableItem[]>("/borrow/items/mine"),
    createItem: (input: BorrowableItemInput) =>
      request<BorrowableItem>("/borrow/items", { method: "POST", body: JSON.stringify(input) }),
    updateItem: (listingId: string, input: Partial<BorrowableItemInput>) =>
      request<BorrowableItem>(`/borrow/items/${listingId}`, {
        method: "PATCH",
        body: JSON.stringify(input)
      }),
    publish: (listingId: string) =>
      request<BorrowableItem>(`/borrow/items/${listingId}/publish`, { method: "POST" }),
    unpublish: (listingId: string) =>
      request<BorrowableItem>(`/borrow/items/${listingId}/unpublish`, { method: "POST" }),
    archive: (listingId: string) =>
      request<BorrowableItem>(`/borrow/items/${listingId}/archive`, { method: "POST" }),

    availability: (listingId: string) =>
      request<BorrowAvailability>(`/borrow/items/${listingId}/availability`),
    addWindow: (listingId: string, input: { kind: string; startsAt: string; endsAt: string; note?: string }) =>
      request<unknown>(`/borrow/items/${listingId}/availability`, {
        method: "POST",
        body: JSON.stringify(input)
      }),
    removeWindow: (listingId: string, windowId: string) =>
      request<unknown>(`/borrow/items/${listingId}/availability/${windowId}`, { method: "DELETE" }),

    listRequests: (query: { scope?: "borrowed" | "lent" | "all"; status?: string; overdueOnly?: boolean } = {}) => {
      const params = new URLSearchParams()
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === "" || value === null) return
        params.set(key, String(value))
      })
      const text = params.toString()
      return request<BorrowRequest[]>(`/borrow/requests${text ? `?${text}` : ""}`)
    },
    request: (requestId: string) => request<BorrowRequest>(`/borrow/requests/${requestId}`),
    createRequest: (listingId: string, input: BorrowRequestInput) =>
      request<BorrowRequest>(`/borrow/items/${listingId}/requests`, {
        method: "POST",
        body: JSON.stringify(input)
      }),
    updateRequest: (requestId: string, input: Partial<BorrowRequestInput>) =>
      request<BorrowRequest>(`/borrow/requests/${requestId}`, {
        method: "PATCH",
        body: JSON.stringify(input)
      }),
    approve: (requestId: string, note?: string) =>
      request<BorrowRequest>(`/borrow/requests/${requestId}/approve`, {
        method: "POST",
        body: JSON.stringify({ note })
      }),
    decline: (requestId: string, note?: string) =>
      request<BorrowRequest>(`/borrow/requests/${requestId}/decline`, {
        method: "POST",
        body: JSON.stringify({ note })
      }),
    cancel: (requestId: string) =>
      request<BorrowRequest>(`/borrow/requests/${requestId}/cancel`, { method: "POST" }),

    schedulePickup: (requestId: string, input: { scheduledAt: string; locationNote?: string }) =>
      request<unknown>(`/borrow/requests/${requestId}/pickup`, {
        method: "POST",
        body: JSON.stringify(input)
      }),
    confirmPickup: (requestId: string, input: { condition?: string; notes?: string } = {}) =>
      request<{ completed: boolean; awaiting?: string }>(`/borrow/requests/${requestId}/pickup/confirm`, {
        method: "POST",
        body: JSON.stringify(input)
      }),
    cancelPickup: (requestId: string) =>
      request<unknown>(`/borrow/requests/${requestId}/pickup/cancel`, { method: "POST" }),

    requestReturn: (requestId: string, scheduledAt?: string) =>
      request<BorrowRequest>(`/borrow/requests/${requestId}/return`, {
        method: "POST",
        body: JSON.stringify({ scheduledAt })
      }),
    confirmReturn: (requestId: string, input: { condition?: string; notes?: string } = {}) =>
      request<{ completed: boolean; awaiting?: string }>(`/borrow/requests/${requestId}/return/confirm`, {
        method: "POST",
        body: JSON.stringify(input)
      }),
    complete: (requestId: string) =>
      request<BorrowRequest>(`/borrow/requests/${requestId}/complete`, { method: "POST" }),
    recordCondition: (requestId: string, input: { phase: string; condition: string; notes?: string }) =>
      request<unknown>(`/borrow/requests/${requestId}/condition`, {
        method: "POST",
        body: JSON.stringify(input)
      }),

    requestExtension: (requestId: string, input: { requestedEndAt: string; reason?: string }) =>
      request<BorrowExtension>(`/borrow/requests/${requestId}/extensions`, {
        method: "POST",
        body: JSON.stringify(input)
      }),
    approveExtension: (extensionId: string, note?: string) =>
      request<BorrowExtension>(`/borrow/extensions/${extensionId}/approve`, {
        method: "POST",
        body: JSON.stringify({ note })
      }),
    rejectExtension: (extensionId: string, note?: string) =>
      request<BorrowExtension>(`/borrow/extensions/${extensionId}/reject`, {
        method: "POST",
        body: JSON.stringify({ note })
      }),

    listDisputes: () => request<BorrowDispute[]>("/borrow/disputes"),
    dispute: (disputeId: string) =>
      request<BorrowDispute & { events: Array<{ toStatus: string; createdAt: string }> }>(
        `/borrow/disputes/${disputeId}`
      ),
    openDispute: (requestId: string, input: { reason: string; summary: string }) =>
      request<BorrowDispute>(`/borrow/requests/${requestId}/disputes`, {
        method: "POST",
        body: JSON.stringify(input)
      }),
    listEvidence: (disputeId: string) =>
      request<Array<{ id: string; note?: string | null; contentType: string; createdAt: string; uploadedBy: PublicUserCard }>>(
        `/borrow/disputes/${disputeId}/evidence`
      ),
    uploadEvidenceUrl: (disputeId: string, evidenceId: string) =>
      `/api/v1/borrow/evidence/${evidenceId}/file`,
  },
  notifications: {
    list: (query: { unreadOnly?: boolean; limit?: number; offset?: number } = {}) => {
      const params = new URLSearchParams()
      if (query.unreadOnly) params.set("unreadOnly", "true")
      if (query.limit !== undefined) params.set("limit", String(query.limit))
      if (query.offset !== undefined) params.set("offset", String(query.offset))
      const text = params.toString()
      return request<NotificationPage>(`/notifications${text ? `?${text}` : ""}`)
    },
    unreadCount: () => request<UnreadCounts>("/notifications/unread-count"),
    markRead: (id: string) =>
      request<unknown>(`/notifications/${id}/read`, { method: "PATCH" }),
    markAllRead: () => request<{ updated: number }>("/notifications/read-all", { method: "PATCH" }),
    preferences: () => request<NotificationPreferences>("/notifications/preferences"),
    updatePreferences: (input: Partial<NotificationPreferences>) =>
      request<NotificationPreferences>("/notifications/preferences", {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    savedSearchAlerts: () =>
      request<SavedSearchAlert[]>("/notifications/saved-search-alerts"),
    markSavedSearchAlertRead: (id: string) =>
      request<unknown>(`/notifications/saved-search-alerts/${id}/read`, { method: "PATCH" }),
  },
  categories: {
    list: () =>
      request<
        Array<{ id: string; name: string; slug: string; listingCount?: number }>
      >("/categories"),
  },
  requests: {
    /** Server-side filtering, sorting, and pagination. */
    list: (query: RequestQuery = {}) => {
      const params = new URLSearchParams()
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === "" || value === null) return
        params.set(key, String(value))
      })
      const text = params.toString()
      return request<RequestPage>(`/requests${text ? `?${text}` : ""}`)
    },
    mine: (query: { status?: string; limit?: number; offset?: number } = {}) => {
      const params = new URLSearchParams()
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === "" || value === null) return
        params.set(key, String(value))
      })
      const text = params.toString()
      return request<ApiRequestSummary[]>(`/requests/mine${text ? `?${text}` : ""}`)
    },
    get: (id: string) => request<ApiRequestDetail>(`/requests/${id}`),
    statusHistory: (id: string) =>
      request<RequestStatusEvent[]>(`/requests/${id}/status-history`),
    create: (input: NeedRequestInput) =>
      request<ApiRequestSummary>("/requests", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    saveDraft: (input: Partial<NeedRequestInput>) =>
      request<ApiRequestSummary>("/requests/drafts", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    update: (id: string, input: Partial<NeedRequestInput>) =>
      request<ApiRequestSummary>(`/requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    /**
     * One endpoint for every legal status move. The API's state machine
     * decides what is allowed, so the client never invents a transition.
     */
    transition: (id: string, status: RequestStatus, note?: string) =>
      request<ApiRequestSummary>(`/requests/${id}/status`, {
        method: "POST",
        body: JSON.stringify({ status, note }),
      }),
    publish: (id: string) => request<ApiRequestSummary>(`/requests/${id}/publish`, { method: "POST" }),
    pause: (id: string) => request<ApiRequestSummary>(`/requests/${id}/pause`, { method: "POST" }),
    resume: (id: string) => request<ApiRequestSummary>(`/requests/${id}/resume`, { method: "POST" }),
    fulfill: (id: string) => request<ApiRequestSummary>(`/requests/${id}/fulfill`, { method: "POST" }),
    cancel: (id: string) => request<ApiRequestSummary>(`/requests/${id}/cancel`, { method: "POST" }),

    /** Ranked, explainable matches for the caller's own request. */
    matches: (id: string, limit = 20) =>
      request<RequestMatch[]>(`/requests/${id}/matches?limit=${limit}`),

    offers: (scope: "received" | "sent" | "all" = "received") =>
      request<ApiScopedOffer[]>(`/requests/offers?scope=${scope}`),
    offersForRequest: (id: string) =>
      request<ApiScopedOffer[]>(`/requests/${id}/offers`),
    getOffer: (offerId: string) => request<ApiScopedOffer>(`/requests/offers/${offerId}`),
    editOffer: (offerId: string, input: Partial<OfferInput>) =>
      request<ApiScopedOffer>(`/requests/offers/${offerId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    withdrawOffer: (offerId: string) =>
      request<ApiScopedOffer>(`/requests/offers/${offerId}/withdraw`, { method: "POST" }),
    createOffer: (requestId: string, input: OfferInput) =>
      request<ApiScopedOffer>(`/requests/${requestId}/offers`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    counterOffer: (
      offerId: string,
      input: { amountCents?: number; message: string },
    ) =>
      request<ApiScopedOffer>(`/requests/offers/${offerId}/counter`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    acceptOffer: (requestId: string, offerId: string) =>
      request<AcceptOfferResult>(
        `/requests/${requestId}/offers/${offerId}/accept`,
        { method: "POST" },
      ),
    rejectOffer: (requestId: string, offerId: string) =>
      request<ApiScopedOffer>(`/requests/${requestId}/offers/${offerId}/reject`, {
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
    /**
     * A page of history, oldest first. `before` is a message id rather than
     * an offset, so a message sent mid-scroll cannot make a later page skip
     * or repeat a row.
     */
    messages: (conversationId: string, options: { limit?: number; before?: string } = {}) => {
      const params = new URLSearchParams()
      if (options.limit !== undefined) params.set("limit", String(options.limit))
      if (options.before) params.set("before", options.before)
      const text = params.toString()
      return request<ApiMessage[]>(
        `/conversations/${conversationId}/messages${text ? `?${text}` : ""}`
      )
    },
    hasMoreMessages: (conversationId: string, before?: string) =>
      request<{ hasMore: boolean }>(
        `/conversations/${conversationId}/messages/more${before ? `?before=${before}` : ""}`
      ),
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
    create: (input: HousingCreateInput) =>
      request<ApiHousing>("/housing", { method: "POST", body: JSON.stringify(input) }),
    get: (id: string) => request<ApiHousing>(`/housing/${id}`),
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
    create: (input: JobCreateInput) =>
      request<ApiJob>("/jobs", { method: "POST", body: JSON.stringify(input) }),
    get: (id: string) => request<ApiJob>(`/jobs/${id}`),
  },
  services: {
    list: (query: ServiceQuery = {}) =>
      request<ApiServiceListing[]>(`/services${queryString(query)}`),
    create: (input: ServiceCreateInput) =>
      request<ApiServiceListing>("/services", { method: "POST", body: JSON.stringify(input) }),
    get: (id: string) => request<ApiServiceListing>(`/services/${id}`),
    requestQuote: (id: string, input: ServiceQuoteInput) =>
      request<ApiServiceQuote>(`/services/${id}/quotes`, {
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
