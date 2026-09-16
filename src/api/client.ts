import type {
  ApiFavorite,
  ApiSavedSearch,
  AuthResponse,
  CurrentUser,
  ListingInput,
  ListingQuery,
  NeedRequestInput,
  OfferInput,
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
      message?: string
    } | null
    throw new ApiError(
      payload?.message ?? `Request failed with status ${response.status}`,
      response.status,
    )
  }
  return response.json() as Promise<T>
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
      return request<unknown[]>(`/listings${params.size ? `?${params}` : ""}`)
    },
    create: (input: ListingInput) =>
      request<unknown>("/listings", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    get: (id: string) => request<unknown>(`/listings/${id}`),
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
    list: () => request<unknown[]>("/requests"),
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
  },
  transactions: {
    list: () => request<unknown[]>("/transactions"),
    transition: (transactionId: string, status: string) =>
      request<unknown>(`/transactions/${transactionId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
  },
  conversations: {
    list: () => request<unknown[]>("/conversations"),
    messages: (conversationId: string) =>
      request<unknown[]>(`/conversations/${conversationId}/messages`),
    send: (conversationId: string, body: string) =>
      request<unknown>(`/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    markRead: (conversationId: string) =>
      request<unknown>(`/conversations/${conversationId}/read`, {
        method: "PATCH",
      }),
  },
}
