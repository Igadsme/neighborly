export interface ApiUser {
  id: string
  email: string
}

export interface ApiNotification {
  id: string
  type: string
  title: string
  body: string
  data: Record<string, string> | null
  readAt: string | null
  createdAt: string
}

export interface AuthResponse {
  user: ApiUser
  accessToken: string
}

export interface CurrentUser {
  id: string
  email: string
  profile?: {
    firstName: string
    lastName: string
    displayName?: string | null
    bio?: string | null
    emailVerified?: boolean
    phoneVerified?: boolean
    neighborhood?: string | null
    city?: string | null
    state?: string | null
  } | null
  preference?: {
    interests: string[]
    capabilities: string[]
    completedAt?: string | null
  } | null
}

export interface ApiCommunityComment {
  id: string
  body: string
  createdAt: string
  author: {
    id: string
    profile?: { firstName?: string; displayName?: string | null } | null
  }
}

export interface ApiCommunityPost {
  id: string
  body: string
  neighborhood?: string | null
  createdAt: string
  updatedAt: string
  author: {
    id: string
    profile?: { firstName?: string; displayName?: string | null; neighborhood?: string | null } | null
  }
  comments: ApiCommunityComment[]
  reactionCounts: Record<string, number>
  viewerReactions: Array<"LIKE" | "HELPFUL" | "CELEBRATE">
}

export interface ApiCommunityEvent {
  id: string
  title: string
  description: string
  neighborhood?: string | null
  location: string
  startsAt: string
  endsAt?: string | null
  capacity?: number | null
  status: string
  goingCount: number
  viewerRsvp?: "GOING" | "INTERESTED" | "NOT_GOING" | null
  organizer: {
    id: string
    profile?: { firstName?: string; displayName?: string | null } | null
  }
}

export interface ListingQuery {
  query?: string
  categoryId?: string
  minPriceCents?: number
  maxPriceCents?: number
  condition?: string
  freeOnly?: boolean
  deliveryAvailable?: boolean
  sort?: "newest" | "price_asc" | "price_desc"
  limit?: number
  offset?: number
}

export interface ListingInput {
  categoryId: string
  title: string
  description: string
  priceCents?: number
  condition?: string
  neighborhood?: string
  city?: string
  latitude?: number
  longitude?: number
  radiusMiles?: number
  pickupAvailable?: boolean
  deliveryAvailable?: boolean
  shippingAvailable?: boolean
}

export interface ApiListingImage {
  id: string
  objectKey: string
  sortOrder: number
  url?: string | null
}

export interface ApiListing {
  id: string
  status?: "DRAFT" | "PUBLISHED" | "SOLD" | "ARCHIVED" | "DELETED"
  title: string
  description: string
  priceCents?: number | null
  condition?: string | null
  neighborhood?: string | null
  city?: string | null
  pickupAvailable?: boolean
  deliveryAvailable?: boolean
  shippingAvailable?: boolean
  images?: ApiListingImage[]
  category?: { name?: string | null; slug?: string | null } | null
  seller?: {
    id: string
    profile?: {
      firstName?: string | null
      lastName?: string | null
      neighborhood?: string | null
    } | null
  } | null
  createdAt?: string
}

export interface ApiFavorite {
  id: string
  createdAt: string
  listing: ApiListing
}

export interface ApiSavedSearch {
  id: string
  query: string
  filters: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type ExchangeMode = "BUY" | "BORROW" | "RENT" | "HIRE" | "TRADE" | "SKILL_SWAP" | "FREE"

export interface NeedRequestInput {
  categoryId: string
  title: string
  description: string
  budgetCents?: number
  latitude?: number
  longitude?: number
  radiusMiles?: number
  deadline?: string
  urgency?: string
  mode: ExchangeMode
}

export interface OfferInput {
  amountCents?: number
  message: string
  listingIds?: string[]
}

export interface RequestOffer {
  id: string
  amountCents?: number | null
  message: string
  status: string
  offererId: string
  offerer?: { profile?: { firstName?: string; lastName?: string } | null }
}

export interface NeedRequestRecord {
  id: string
  requesterId: string
  title: string
  description: string
  budgetCents?: number | null
  radiusMiles: number
  deadline?: string | null
  urgency?: string | null
  mode: ExchangeMode
  createdAt: string
  category?: { id: string; name: string }
  requester?: {
    profile?: { firstName?: string; neighborhood?: string | null } | null
  }
  offers?: RequestOffer[]
}

export interface ApiMessage {
  id: string
  conversationId: string
  senderId: string
  body: string
  createdAt: string
}

export interface ApiConversation {
  id: string
  updatedAt: string
  participants: Array<{
    userId: string
    lastReadAt?: string | null
    user?: { profile?: { firstName?: string; lastName?: string } | null }
  }>
  messages: ApiMessage[]
}

export interface ApiTransaction {
  id: string
  status: string
  participants: Array<{ userId: string; role: string }>
  appointments: Array<{
    id: string
    startsAt: string
    locationNote?: string | null
  }>
  reviews: Array<{
    id: string
    authorId: string
    subjectId: string
    rating: number
    body?: string
    createdAt?: string
  }>
}
