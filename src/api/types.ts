export interface ApiUser {
  id: string
  email: string
}

export interface AuthResponse {
  user: ApiUser
  accessToken: string
}

export interface AccountStatus {
  id: string
  email: string
  status: "ACTIVE" | "SUSPENDED" | "DELETED"
  emailVerified: boolean
  pendingEmail: string | null
  avatarUrl: string | null
  deletionRequestedAt: string | null
  activeSessions: number
  memberSince: string
}

export interface AccountProfileInput {
  firstName?: string
  lastName?: string
  displayName?: string
  bio?: string
  neighborhood?: string
  city?: string
  state?: string
}

export interface AccountPrivacyInput {
  newListings?: boolean
  priceDrops?: boolean
  messages?: boolean
  events?: boolean
  community?: boolean
}

/** Vertical creation payloads. These match the existing backend DTOs exactly:
 *  a specialized listing must be created through its own contract. */
export interface HousingCreateInput {
  title: string
  description: string
  type: "Apartment" | "House" | "Room" | "Studio" | "Condo" | "Sublet"
  listingType: "rent" | "sale" | "room" | "swap"
  priceCents: number
  priceUnit?: string
  beds: number
  baths: number
  neighborhood: string
  city?: string
  state?: string
  latitude?: number
  longitude?: number
}

export interface JobCreateInput {
  title: string
  company: string
  description: string
  type?: "Full-time" | "Part-time" | "Freelance" | "Internship"
  workplace?: "Remote" | "Hybrid" | "On-site"
  neighborhood?: string
}

export interface ServiceCreateInput {
  title: string
  businessName: string
  description: string
  category: string
  startingPriceCents: number
  location: string
  availability: string
}

export interface NotificationRow {
  id: string
  type: string
  title: string
  body?: string | null
  link?: string | null
  readAt?: string | null
  createdAt: string
}

export interface NotificationPage {
  items: NotificationRow[]
  total: number
  /** Global unread count, independent of the current page. */
  unread: number
  limit: number
  offset: number
}

export interface UnreadCounts {
  notifications: number
  messages: number
}

export interface NotificationPreferences {
  messages: boolean
  offers: boolean
  matches: boolean
  savedSearches: boolean
  requestUpdates: boolean
  newListings: boolean
  priceDrops: boolean
  events: boolean
  community: boolean
}

export interface SavedSearchAlert {
  id: string
  savedSearchId: string
  listingId: string
  readAt?: string | null
  createdAt: string
  listing: {
    id: string
    title: string
    priceCents?: number | null
    neighborhood?: string | null
    /** The listing may since have been archived or removed by its owner. */
    status?: string
    deletedAt?: string | null
  } | null
}

export type RequestStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "PAUSED"
  | "FULFILLED"
  | "CLOSED"
  | "EXPIRED"
  | "CANCELLED"

/** Paginated request feed. `total` is the global count, not the page size. */
export interface RequestPage {
  items: ApiRequestSummary[]
  total: number
  limit: number
  offset: number
}

export interface RequestQuery {
  query?: string
  categoryId?: string
  status?: RequestStatus
  mode?: string
  urgency?: string
  minBudgetCents?: number
  maxBudgetCents?: number
  city?: string
  neighborhood?: string
  latitude?: number
  longitude?: number
  radiusMiles?: number
  openOnly?: boolean
  sort?: "newest" | "oldest" | "deadline" | "budget_asc" | "budget_desc" | "relevance"
  limit?: number
  offset?: number
}

export interface RequestStatusEvent {
  fromStatus?: RequestStatus | null
  toStatus: RequestStatus
  note?: string | null
  createdAt: string
}

/** A ranked, explainable match between a request and a listing. */
export interface RequestMatch {
  listingId: string
  /** 0-100. */
  score: number
  /** Human-readable reasons, so the UI can justify the ranking. */
  reasons: string[]
  listing: ApiListing
}

/** Paginated marketplace page. `total` is the global count, not the page size. */
export interface ListingPage {
  items: ApiListing[]
  total: number
  limit: number
  offset: number
}

export interface ListingQueryParams {
  query?: string
  categoryId?: string
  sellerId?: string
  status?: "PUBLISHED" | "SOLD"
  minPriceCents?: number
  maxPriceCents?: number
  city?: string
  neighborhood?: string
  latitude?: number
  longitude?: number
  radiusMiles?: number
  sort?: "newest" | "oldest" | "price_asc" | "price_desc" | "relevance"
  limit?: number
  offset?: number
}

export interface ListingImageRecord {
  id: string
  objectKey: string
  sortOrder: number
  width?: number | null
  height?: number | null
}

export interface StoredImage extends ListingImageRecord {
  /** Same-origin API URL that streams the object. Never an S3 credential. */
  url: string
}

export interface ActiveSession {
  id: string
  userAgent: string | null
  ipAddress: string | null
  createdAt: string
  lastUsedAt: string
  expiresAt: string
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

export interface NeighborhoodCount {
  neighborhood: string
  count: number
}

export interface ApiListing {
  id: string
  sellerId?: string
  status?: "DRAFT" | "PUBLISHED" | "SOLD" | "ARCHIVED" | string
  title: string
  description: string
  priceCents?: number | null
  condition?: string | null
  hasCoordinates?: boolean
  approximateLocation?: { lat: number; lng: number } | null
  distanceMiles?: number | null
  neighborhood?: string | null
  city?: string | null
  pickupAvailable?: boolean
  deliveryAvailable?: boolean
  shippingAvailable?: boolean
  categoryId?: string
  images?: StoredImage[]
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

export interface BorrowItemQuery {
  query?: string
  categoryId?: string
  city?: string
  neighborhood?: string
  latitude?: number
  longitude?: number
  radiusMiles?: number
  availableNow?: boolean
  sort?: string
  limit?: number
  offset?: number
}

export interface BorrowableItemInput {
  categoryId: string
  title: string
  description: string
  usageInstructions: string
  condition?: string
  maxBorrowDays?: number
  minNoticeHours?: number
  depositCents?: number
  neighborhood?: string
  city?: string
  latitude?: number
  longitude?: number
  radiusMiles?: number
  publish?: boolean
}

export interface BorrowRequestInput {
  startAt: string
  endAt: string
  message?: string
}

export type VerificationMethod = "EMAIL" | "VERIFIED_ACTIVITY" | "COMMUNITY_REFERENCE"
export type VerificationStatus = "PENDING" | "APPROVED" | "REJECTED" | "REVOKED"
export type ReviewStatus = "PENDING" | "PUBLISHED" | "HIDDEN"

export interface TrustSignal {
  key: string
  label: string
  /** Plain-language reason, so a badge can always be justified. */
  explanation: string
  earned: boolean
  count: number | null
}

export interface RatingSummary {
  /** Null when there are too few reviews for an average to mean anything. */
  average: number | null
  count: number
  distribution: Record<"1" | "2" | "3" | "4" | "5", number>
  tooFewToRate: boolean
}

export interface PassportVerification {
  method: VerificationMethod
  label: string
  explanation: string
  decidedAt?: string | null
}

export interface Passport {
  id: string
  displayName: string
  avatarUrl?: string | null
  bio?: string | null
  memberSince?: string | null
  accountAgeDays?: number | null
  neighborhood?: string | null
  city?: string | null
  counts: {
    completedExchanges: number
    completedBorrowings: number
    borrowingsAsLender: number
    borrowingsAsBorrower: number
  }
  rating: RatingSummary | null
  trustSignals: TrustSignal[]
  verifications: PassportVerification[]
  isSelf: boolean
  withdrawn: boolean
}

export interface PassportPrivacy {
  showRatings: boolean
  showTenure: boolean
  showNeighborhood: boolean
  showCity: boolean
  showTrustSignals: boolean
  showContributions: boolean
  leaderboardOptIn: boolean
  reviewWindowDays: number
}

export interface ReviewRow {
  id: string
  rating: number
  body: string
  /** What kind of exchange this was, in the reader's terms. */
  context: string
  itemTitle?: string | null
  createdAt: string
  edited: boolean
  author: PublicUserCard
}

export interface MyReview {
  id: string
  transactionId: string
  subjectId: string
  rating: number
  body: string
  status: ReviewStatus
  visible: boolean
  /** Explains why a review is not on the profile yet. */
  publicationNote: string
  editableUntil?: string | null
  createdAt: string
}

export interface ReviewableExchange {
  transactionId: string
  completedAt: string
  myRole?: string | null
  counterparty: PublicUserCard | null
}

export interface VerificationRecord {
  id: string
  method: VerificationMethod
  status: VerificationStatus
  statement?: string | null
  label: string
  explanation: string
  createdAt: string
  decidedAt?: string | null
}

export interface AppealRow {
  id: string
  subjectType: string
  subjectId: string
  status: string
  reason: string
  resolution?: string | null
  createdAt: string
}

export type MissionCategory =
  | "CLEANUP"
  | "GARDENING"
  | "DONATION"
  | "VOLUNTEER"
  | "ASSISTANCE"
  | "IMPROVEMENT"
export type MissionStatus = "DRAFT" | "PUBLISHED" | "CANCELLED" | "COMPLETED" | "ARCHIVED"
export type MissionParticipantStatus =
  | "WAITLISTED"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "ATTENDED"
  | "VERIFIED"
  | "WITHDRAWN"
  | "REMOVED"

export interface MissionListItem {
  id: string
  title: string
  description: string
  category: MissionCategory
  status: MissionStatus
  neighborhood?: string | null
  city?: string | null
  startAt: string
  endAt: string
  capacity: number
  confirmedCount: number
  slotsLeft: number
  full: boolean
  upcoming: boolean
  requiresApproval: boolean
  organizer: PublicUserCard
}

export interface MissionPage {
  items: MissionListItem[]
  total: number
  limit: number
  offset: number
}

export interface MissionParticipation {
  id: string
  status: MissionParticipantStatus
  waitlistPosition?: number | null
  checkedInAt?: string | null
  attendanceMarkedAt?: string | null
  verifiedAt?: string | null
}

export interface MissionDetail {
  id: string
  title: string
  description: string
  category: MissionCategory
  status: MissionStatus
  neighborhood?: string | null
  city?: string | null
  /** Present only for the organizer, confirmed participants, and staff. */
  meetingPoint?: string | null
  startAt: string
  endAt: string
  capacity: number
  confirmedCount: number
  slotsLeft: number
  requiresApproval: boolean
  requiresStaffVerification: boolean
  publishedAt?: string | null
  completedAt?: string | null
  cancelledAt?: string | null
  isOrganizer: boolean
  organizer: PublicUserCard
  myParticipation?: MissionParticipation | null
  ended: boolean
}

export interface MissionParticipantRow {
  id: string
  status: MissionParticipantStatus
  waitlistPosition?: number | null
  checkedInAt?: string | null
  attendanceMarkedAt?: string | null
  verifiedAt?: string | null
  user: PublicUserCard
}

export interface CommunityBadgeRow {
  code: string
  label: string
  description: string
  /** The sentence a member reads when they ask what the badge means. */
  explanation: string
  awardedAt?: string
}

export interface ContributionRecord {
  showContributions: boolean
  verifiedMissionCount: number
  organizedCount: number
  badges: CommunityBadgeRow[]
  participation: Array<{
    id: string
    status: MissionParticipantStatus
    verifiedAt?: string | null
    checkedInAt?: string | null
    mission: {
      id: string
      title: string
      category: MissionCategory
      status: MissionStatus
      startAt: string
      neighborhood?: string | null
      city?: string | null
    }
  }>
}

export interface JoinResult {
  missionId: string
  status: MissionParticipantStatus
  confirmed: boolean
  waitlisted: boolean
  waitlistPosition?: number | null
  message: string
}

export type BorrowRequestStatus =
  | "REQUESTED"
  | "APPROVED"
  | "DECLINED"
  | "PICKUP_SCHEDULED"
  | "CHECKED_OUT"
  | "RETURN_REQUESTED"
  | "RETURNED"
  | "COMPLETED"
  | "OVERDUE"
  | "CANCELLED"
  | "DISPUTED"

export type BorrowRole = "borrower" | "lender"

export interface BorrowableItem {
  id: string
  sellerId: string
  categoryId: string
  title: string
  description: string
  condition?: string | null
  priceCents?: number | null
  status: string
  borrowable: boolean
  maxBorrowDays?: number | null
  minNoticeHours?: number
  usageInstructions?: string | null
  depositCents?: number | null
  neighborhood?: string | null
  city?: string | null
  /** Coordinates are never returned; this is a rounded area only. */
  hasCoordinates?: boolean
  approximateLocation?: { lat: number; lng: number } | null
  viewerIsOwner?: boolean
  createdAt: string
  updatedAt?: string
  seller: PublicUserCard
  category?: { id: string; name: string; slug: string } | null
  images?: Array<{ id: string; objectKey: string; sortOrder: number }>
}

export interface BorrowItemPage {
  items: BorrowableItem[]
  total: number
  limit: number
  offset: number
}

export interface BorrowHandoff {
  id: string
  kind: "PICKUP" | "RETURN"
  scheduledAt?: string | null
  /** Only ever populated for the two participants. */
  locationNote?: string | null
  borrowerConfirmedAt?: string | null
  lenderConfirmedAt?: string | null
  completedAt?: string | null
  cancelledAt?: string | null
}

export interface BorrowConditionReport {
  id: string
  phase: "BEFORE" | "AFTER"
  condition: string
  notes?: string | null
  createdAt: string
  reportedBy: PublicUserCard
}

export interface BorrowExtension {
  id: string
  status: "REQUESTED" | "APPROVED" | "REJECTED"
  requestedEndAt: string
  previousEndAt: string
  reason?: string | null
  createdAt: string
}

export interface BorrowDispute {
  id: string
  borrowRequestId: string
  reason: string
  status: "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "CLOSED"
  summary: string
  resolution?: string | null
  createdAt: string
  openedBy: PublicUserCard
}

export interface BorrowRequest {
  id: string
  listingId: string
  lenderId: string
  borrowerId: string
  status: BorrowRequestStatus
  /** The caller's side of this borrowing. */
  role: BorrowRole
  startAt: string
  endAt: string
  originalEndAt: string
  message?: string | null
  depositCents?: number | null
  approvedAt?: string | null
  checkedOutAt?: string | null
  returnedAt?: string | null
  completedAt?: string | null
  createdAt: string
  listing: BorrowableItem
  /** The other party, projected publicly. */
  borrower?: PublicUserCard
  handoffs?: BorrowHandoff[]
  extensions?: BorrowExtension[]
  conditionReports?: BorrowConditionReport[]
  disputes?: BorrowDispute[]
  events?: Array<{ toStatus: BorrowRequestStatus; fromStatus?: string | null; note?: string | null; createdAt: string }>
}

export interface BorrowAvailability {
  minNoticeHours: number
  windows: Array<{ id: string; kind: "UNAVAILABLE" | "AVAILABLE"; startsAt: string; endsAt: string; note?: string | null }>
  /** Booked dates only: the calendar never says who booked them. */
  reserved: Array<{ startAt: string; endAt: string }>
}

export interface ApiRequestSummary {
  categoryId?: string
  minBudgetCents?: number | null
  budgetFlexible?: boolean
  hasCoordinates?: boolean
  approximateLocation?: { lat: number; lng: number } | null
  coordinatesShared?: boolean
  neighborhood?: string | null
  city?: string | null
  deadline?: string | null
  urgency?: string | null
  radiusMiles?: number
  statusChangedAt?: string
  fulfilledAt?: string | null
  id: string
  title: string
  description: string
  budgetCents?: number | null
  status?: RequestStatus
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
  /** Set once the caller has read past this message; it is the caller's own state. */
  readAt?: string | null
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

export interface CommunitySummary {
  neighbors: number
  posts: number
  events: number
}

export interface ApiCommunityComment {
  id: string
  postId: string
  body: string
  createdAt: string
  author: PublicUserCard
}

export interface LostFoundInput {
  type: "lost" | "found"
  item: string
  neighborhood: string
  city?: string
}

export interface GiveawayInput {
  item: string
  neighborhood: string
  city?: string
}

export interface ServiceCreateInput {
  title: string
  businessName: string
  description: string
  category: string
  startingPriceCents: number
  location: string
  availability: string
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
