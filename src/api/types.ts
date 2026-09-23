export interface ApiUser {
  id: string
  email: string
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

export interface ListingQuery {
  query?: string
  categoryId?: string
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

export interface ApiListing {
  id: string
  title: string
  description: string
  priceCents?: number | null
  condition?: string | null
  neighborhood?: string | null
  city?: string | null
  pickupAvailable?: boolean
  deliveryAvailable?: boolean
  shippingAvailable?: boolean
  images?: Array<{ url?: string | null; key?: string | null }>
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

export interface PublicUserCard {
  id: string
  profile?: {
    displayName?: string | null
    firstName?: string | null
    lastName?: string | null
    neighborhood?: string | null
    city?: string | null
  } | null
}

export interface ApiRequestSummary {
  id: string
  title: string
  description: string
  budgetCents?: number | null
  status: string
  mode: ExchangeMode | string
  createdAt: string
  requester: PublicUserCard
  category?: { id: string; name: string; slug: string } | null
  offers: Array<{ id: string; status: string }>
}

export interface ApiOfferDetail {
  id: string
  requestId?: string
  amountCents?: number | null
  message: string
  status: string
  createdAt: string
  offerer: PublicUserCard
  items?: Array<{
    listing?: {
      id: string
      title: string
      priceCents?: number | null
      status?: string
    } | null
  }>
}

export interface ApiRequestDetail extends Omit<ApiRequestSummary, "offers"> {
  offers: ApiOfferDetail[]
}

export interface ApiTransaction {
  id: string
  conversationId?: string | null
  offerId?: string | null
  status: string
  createdAt: string
  updatedAt: string
  participants: Array<{ userId: string; role: string }>
  milestones?: Array<{ toStatus: string; fromStatus?: string | null }>
  appointments?: Array<{
    id: string
    startsAt: string
    locationNote?: string | null
  }>
}

export interface ApiConversation {
  id: string
  createdAt: string
  updatedAt: string
  participants: Array<{
    userId: string
    lastReadAt?: string | null
    user?: PublicUserCard | null
  }>
  messages: ApiMessage[]
}

export interface ApiMessage {
  id: string
  conversationId: string
  senderId: string
  body: string
  createdAt: string
}

export interface AcceptOfferResult {
  conversation: { id: string }
  transaction: {
    id: string
    status: string
    offerId?: string | null
    conversationId?: string | null
  }
}

export interface ReviewInput {
  transactionId: string
  subjectId: string
  rating: number
  body: string
}
