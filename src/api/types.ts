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
  sellerId?: string
  status?: "PUBLISHED" | "SOLD"
  limit?: number
  offset?: number
}

export interface PublicProfile {
  id: string
  displayName?: string | null
  firstName: string
  lastName: string
  bio?: string | null
  neighborhood?: string | null
  city?: string | null
  memberSince: string
  emailVerified: boolean
  ratingAverage: number | null
  reviewCount: number
  soldCount: number
}

export interface ProfileReview {
  id: string
  rating: number
  body: string
  createdAt: string
  itemTitle?: string | null
  author: PublicUserCard
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
  sellerId?: string
  title: string
  description: string
  priceCents?: number | null
  condition?: string | null
  neighborhood?: string | null
  city?: string | null
  pickupAvailable?: boolean
  deliveryAvailable?: boolean
  shippingAvailable?: boolean
  categoryId?: string
  images?: Array<{ url?: string | null; key?: string | null; objectKey?: string | null }>
  category?: { id?: string; name?: string | null; slug?: string | null } | null
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

export interface ApiScopedOffer {
  id: string
  amountCents?: number | null
  message: string
  status: string
  createdAt: string
  offerer: PublicUserCard
  items?: ApiOfferDetail["items"]
  request: Omit<ApiRequestSummary, "offers">
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

export interface CreateConversationInput {
  participantId: string
  body: string
  listingId?: string
}

export interface CreateConversationResult {
  conversation: { id: string }
  message: ApiMessage
  reused: boolean
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

export interface HousingQuery {
  query?: string
  listingType?: "rent" | "sale"
  type?: string
  minBeds?: number
  maxPriceCents?: number
  pets?: boolean
  furnished?: boolean
  verified?: boolean
  utilitiesIncluded?: boolean
  sort?: "newest" | "price_asc" | "price_desc" | "beds"
  limit?: number
  offset?: number
}

export interface ApiHousing {
  id: string
  title: string
  description: string
  type: string
  listingType: string
  priceCents: number
  priceUnit?: string | null
  beds: number
  baths: number
  sqft: number
  neighborhood: string
  city?: string | null
  available?: string | null
  lease?: string | null
  pets: boolean
  furnished: boolean
  utilities?: string | null
  verified: boolean
  createdAt: string
  owner: PublicUserCard
  images: Array<{ id?: string; objectKey?: string | null; sortOrder?: number }>
}

export interface JobQuery {
  query?: string
  type?: string
  level?: string
  remote?: string
  limit?: number
  offset?: number
}

export interface ApiJob {
  id: string
  title: string
  company: string
  logo?: string | null
  description: string
  responsibilities?: string[]
  type: string
  level: string
  salary: string
  location: string
  remote: string
  deadline?: string | null
  tags?: string[]
  verified: boolean
  createdAt: string
  owner: PublicUserCard
}

export interface ApiJobSave {
  createdAt: string
  job: ApiJob
}

export interface ApiJobApplication {
  id: string
  message?: string | null
  createdAt: string
  job: ApiJob
}

export interface ServiceQuery {
  query?: string
  category?: string
  limit?: number
  offset?: number
}

export interface ApiServiceListing {
  id: string
  title: string
  businessName: string
  description: string
  category: string
  startingPriceCents: number
  location: string
  availability: string
  tags?: string[]
  image?: string | null
  backgroundCheck: boolean
  rating?: number | null
  reviewCount: number
  createdAt: string
  owner: PublicUserCard
}

export interface ServiceQuoteInput {
  notes: string
  preferredDate?: string
  preferredTime?: string
  address?: string
}

export interface ApiServiceQuote {
  id: string
  serviceId: string
  preferredDate?: string | null
  preferredTime?: string | null
  notes: string
  address?: string | null
  status: string
  createdAt: string
}

export interface CommunityPostQuery {
  type?: string
  limit?: number
  offset?: number
}

export interface ApiCommunityPost {
  id: string
  type: string
  title: string
  body: string
  neighborhood: string
  city?: string | null
  createdAt: string
  author: PublicUserCard
  reactions: { like: number; love: number; wow: number }
  replies: number
}

export interface CommunityPostInput {
  type: string
  title: string
  body: string
  neighborhood: string
  city?: string
}

export interface ApiCommunityEvent {
  id: string
  title: string
  description?: string | null
  neighborhood: string
  city?: string | null
  dateLabel: string
  timeLabel: string
  image?: string | null
  createdAt: string
  attending: number
  organizer: PublicUserCard
}

export interface ApiLostFound {
  id: string
  type: "lost" | "found" | string
  item: string
  neighborhood: string
  city?: string | null
  image?: string | null
  createdAt: string
  author: PublicUserCard
}

export interface ApiGiveaway {
  id: string
  item: string
  neighborhood: string
  city?: string | null
  claimed: boolean
  createdAt: string
  author: PublicUserCard
}
