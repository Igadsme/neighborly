import type {
  ApiFavorite,
  ApiConversation,
  ApiMessage,
  ApiNotification,
  ApiCommunityPost,
  ApiCommunityEvent,
  ApiTransaction,
  ApiSavedSearch,
  AuthResponse,
  CurrentUser,
  ListingInput,
  ListingQuery,
  ApiListing,
  ApiListingImage,
  NeedRequestRecord,
  NeedRequestInput,
  OfferInput,
} from "./types"

const API_URL = (
  import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1"
).replace(/\/$/, "")
const ACCESS_TOKEN_KEY = "neighborly.access_token"
let refreshPromise: Promise<string | null> | null = null

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

async function refreshAccessToken() {
  refreshPromise ??= fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
  })
    .then(async (response) => {
      if (!response.ok) return null
      const result = (await response.json()) as AuthResponse
      window.localStorage.setItem(ACCESS_TOKEN_KEY, result.accessToken)
      return result.accessToken
    })
    .finally(() => {
      refreshPromise = null
    })
  return refreshPromise
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  allowRefresh = true,
): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set("Accept", "application/json")
  if (options.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json")
  const token = window.localStorage.getItem(ACCESS_TOKEN_KEY)
  if (token) headers.set("Authorization", `Bearer ${token}`)

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  })
  if (response.status === 401 && allowRefresh && !path.startsWith("/auth/")) {
    const refreshed = await refreshAccessToken()
    if (refreshed) return request<T>(path, options, false)
    window.localStorage.removeItem(ACCESS_TOKEN_KEY)
  }
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
    requestEmailVerification: () =>
      request<{ sent: boolean; alreadyVerified: boolean }>("/auth/verify-email/request", { method: "POST" }),
    confirmEmail: (token: string) =>
      request<{ verified: boolean }>("/auth/verify-email/confirm", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
    signOut: () => {
      const token = window.localStorage.getItem(ACCESS_TOKEN_KEY)
      window.localStorage.removeItem(ACCESS_TOKEN_KEY)
      void fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
    },
    me: () => request<CurrentUser>("/users/me"),
    restore: async () => {
      if (!window.localStorage.getItem(ACCESS_TOKEN_KEY)) {
        const token = await refreshAccessToken()
        if (!token) return null
      }
      return request<CurrentUser>("/users/me")
    },
    hasSession: () => Boolean(window.localStorage.getItem(ACCESS_TOKEN_KEY)),
    accessToken: () => window.localStorage.getItem(ACCESS_TOKEN_KEY),
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
      request<{ id: string; status: string }>("/listings", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    mine: () => request<ApiListing[]>("/listings/mine"),
    publish: (id: string) =>
      request<ApiListing>(`/listings/${id}/publish`, { method: "POST" }),
    uploadImage: async (
      listingId: string,
      file: File,
      onProgress?: (percent: number) => void,
    ): Promise<ApiListingImage> => {
      const grant = await request<{
        url: string
        fields: Record<string, string>
        key: string
      }>(`/listings/${listingId}/images/upload`, {
        method: "POST",
        body: JSON.stringify({
          contentType: file.type,
          sizeBytes: file.size,
        }),
      })
      const form = new FormData()
      Object.entries(grant.fields).forEach(([key, value]) =>
        form.append(key, value),
      )
      form.append("file", file)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open("POST", grant.url)
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            onProgress?.(Math.round((event.loaded / event.total) * 100))
          }
        }
        xhr.onerror = () => reject(new ApiError("Image upload connection failed.", 0))
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress?.(100)
            resolve()
          } else {
            reject(new ApiError(`Image storage rejected the upload (${xhr.status}).`, xhr.status))
          }
        }
        xhr.send(form)
      })
      return request<ApiListingImage>(`/listings/${listingId}/images/complete`, {
        method: "POST",
        body: JSON.stringify({ key: grant.key }),
      })
    },
    reorderImages: (listingId: string, imageIds: string[]) =>
      request<ApiListingImage[]>(`/listings/${listingId}/images/reorder`, {
        method: "POST",
        body: JSON.stringify({ imageIds }),
      }),
    deleteImage: (listingId: string, imageId: string) =>
      request<{ deleted: boolean }>(
        `/listings/${listingId}/images/${imageId}`,
        { method: "DELETE" },
      ),
    get: (id: string) => request<ApiListing>(`/listings/${id}`),
    update: (id: string, input: Partial<ListingInput>) =>
      request<ApiListing>(`/listings/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    archive: (id: string) =>
      request<{ archived: boolean }>(`/listings/${id}`, { method: "DELETE" }),
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
    deleteSavedSearch: (id: string) =>
      request<{ deleted: boolean }>(`/listings/saved-searches/${id}`, {
        method: "DELETE",
      }),
  },
  categories: {
    list: () =>
      request<Array<{ id: string; name: string; slug: string }>>("/categories"),
  },
  requests: {
    list: () => request<NeedRequestRecord[]>("/requests"),
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
    acceptOffer: (offerId: string) =>
      request<unknown>(`/requests/offers/${offerId}/accept`, { method: "PATCH" }),
    rejectOffer: (offerId: string) =>
      request<unknown>(`/requests/offers/${offerId}/reject`, { method: "PATCH" }),
  },
  transactions: {
    list: () => request<ApiTransaction[]>("/transactions"),
    transition: (transactionId: string, status: string) =>
      request<unknown>(`/transactions/${transactionId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    schedule: (
      transactionId: string,
      input: { startsAt: string; locationNote?: string },
    ) =>
      request<unknown>(`/transactions/${transactionId}/appointments`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    review: (
      transactionId: string,
      input: { subjectId: string; rating: number; body: string },
    ) =>
      request<unknown>(`/transactions/${transactionId}/reviews`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  },
  conversations: {
    list: () => request<ApiConversation[]>("/conversations"),
    create: (participantId: string) =>
      request<Pick<ApiConversation, "id" | "updatedAt" | "participants">>("/conversations", {
        method: "POST",
        body: JSON.stringify({ participantId }),
      }),
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
  notifications: {
    list: () => request<ApiNotification[]>("/notifications"),
    unreadCount: () => request<{ count: number }>("/notifications/unread-count"),
    markRead: (id: string) =>
      request<ApiNotification>(`/notifications/${id}/read`, { method: "PATCH" }),
    markAllRead: () =>
      request<{ updated: number }>("/notifications/read-all", {
        method: "PATCH",
      }),
  },
  community: {
    posts: (neighborhood?: string) => {
      const params = neighborhood ? `?neighborhood=${encodeURIComponent(neighborhood)}` : ""
      return request<ApiCommunityPost[]>(`/community/posts${params}`)
    },
    createPost: (body: string, neighborhood?: string) =>
      request<ApiCommunityPost>("/community/posts", {
        method: "POST",
        body: JSON.stringify({ body, neighborhood }),
      }),
    comment: (postId: string, body: string) =>
      request<unknown>(`/community/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    react: (postId: string, type: "LIKE" | "HELPFUL" | "CELEBRATE") =>
      request<{ active: boolean; type: string }>(`/community/posts/${postId}/reactions`, {
        method: "POST",
        body: JSON.stringify({ type }),
      }),
    deletePost: (postId: string) =>
      request<{ deleted: boolean }>(`/community/posts/${postId}`, { method: "DELETE" }),
    events: (neighborhood?: string) => {
      const params = neighborhood ? `?neighborhood=${encodeURIComponent(neighborhood)}` : ""
      return request<ApiCommunityEvent[]>(`/community/events${params}`)
    },
    createEvent: (input: {
      title: string
      description: string
      location: string
      startsAt: string
      endsAt?: string
      capacity?: number
      neighborhood?: string
    }) => request<ApiCommunityEvent>("/community/events", {
      method: "POST",
      body: JSON.stringify(input),
    }),
    rsvp: (eventId: string, status: "GOING" | "INTERESTED" | "NOT_GOING") =>
      request<unknown>(`/community/events/${eventId}/rsvp`, {
        method: "POST",
        body: JSON.stringify({ status }),
      }),
  },
  users: {
    updateProfile: (input: Record<string, string>) =>
      request<CurrentUser>("/users/me", { method: "PATCH", body: JSON.stringify(input) }),
    exportData: () => request<unknown>("/users/me/export"),
    deleteAccount: (password: string) =>
      request<{ deleted: boolean }>("/users/me", { method: "DELETE", body: JSON.stringify({ password }) }),
    publicProfile: (id: string) => request<unknown>(`/users/${id}/profile`),
  },
  safety: {
    blocks: () => request<unknown[]>("/safety/blocks"),
    block: (userId: string) => request<{ blocked: boolean }>(`/safety/blocks/${userId}`, { method: "POST" }),
    unblock: (userId: string) => request<{ blocked: boolean }>(`/safety/blocks/${userId}`, { method: "DELETE" }),
    report: (input: { targetType: string; targetId: string; reason: string; details?: string }) =>
      request<unknown>("/safety/reports", { method: "POST", body: JSON.stringify(input) }),
  },
  realtime: {
    connect: () => {
      const token = window.localStorage.getItem(ACCESS_TOKEN_KEY)
      if (!token) throw new ApiError("Sign in to connect to messages.", 401)
      return io(`${new URL(API_URL).origin}/realtime`, {
        auth: { token },
        transports: ["websocket", "polling"],
      })
    },
  },
}
import { io } from "socket.io-client"
