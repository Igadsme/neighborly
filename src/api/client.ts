import type {
  AcceptOfferResult,
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
  ApiSavedSearch,
  ApiServiceListing,
  ApiServiceQuote,
  ApiTransaction,
  AuthResponse,
  CommunityPostInput,
  CommunityPostQuery,
  CurrentUser,
  HousingQuery,
  JobQuery,
  ListingInput,
  ListingQuery,
  NeedRequestInput,
  OfferInput,
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set("Accept", "application/json")
  if (options.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json")
  const token = window.localStorage.getItem(ACCESS_TOKEN_KEY)
  if (token) headers.set("Authorization", `Bearer ${token}`)

  const response = await fetch(`${API_URL}${path}`, { ...options, headers })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string | string[]
    } | null
    throw new ApiError(
      readMessage(payload?.message, response.status),
      response.status,
    )
  }
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
    signOut: () => window.localStorage.removeItem(ACCESS_TOKEN_KEY),
    me: () => request<CurrentUser>("/users/me"),
    hasSession: () => Boolean(window.localStorage.getItem(ACCESS_TOKEN_KEY)),
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
      request<Array<{ id: string; name: string; slug: string }>>("/categories"),
  },
  requests: {
    list: () => request<ApiRequestSummary[]>("/requests"),
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
  },
  community: {
    posts: (query: CommunityPostQuery = {}) =>
      request<ApiCommunityPost[]>(`/community/posts${queryString(query)}`),
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
    giveaways: () => request<ApiGiveaway[]>("/community/giveaways"),
    claim: (id: string) =>
      request<{ claimed: boolean; giveaway: ApiGiveaway }>(
        `/community/giveaways/${id}/claim`,
        { method: "POST" },
      ),
  },
}
