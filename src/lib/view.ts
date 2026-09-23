import type { Listing } from "../data"
import type {
  ApiListing,
  ApiOfferDetail,
  ApiRequestDetail,
  PublicUserCard,
} from "../api/types"

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string | null | undefined) {
  return Boolean(value && UUID.test(value))
}

export function mediaSrc(image: string | undefined, unsplashParams: string) {
  if (!image) return null
  if (/^https?:\/\//i.test(image)) return image
  return `https://images.unsplash.com/${image}?${unsplashParams}`
}

export function relativeTime(iso: string | undefined) {
  if (!iso) return "Recently"
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return "Recently"
  const minutes = Math.round((Date.now() - then) / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

export function dollars(cents: number) {
  return (cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

export function personName(user: PublicUserCard | null | undefined, fallback = "Neighbor") {
  const profile = user?.profile
  const named = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ")
  return profile?.displayName || named || profile?.firstName || fallback
}

export function firstName(user: PublicUserCard | null | undefined) {
  return user?.profile?.firstName || personName(user).split(" ")[0] || "Neighbor"
}

export function listingFromApi(listing: ApiListing, saved = false): Listing {
  const sellerName = personName(
    listing.seller
      ? {
          id: listing.seller.id,
          profile: listing.seller.profile,
        }
      : null,
  )
  return {
    id: listing.id,
    title: listing.title,
    price: listing.priceCents == null ? null : listing.priceCents / 100,
    isFree: listing.priceCents === 0,
    condition: listing.condition ?? "",
    category: listing.category?.name ?? "Marketplace",
    neighborhood: listing.neighborhood ?? "Nearby",
    city: listing.city ?? "",
    distance: "Nearby",
    postedAt: relativeTime(listing.createdAt),
    images:
      listing.images
        ?.map((image) => image.url || image.key || image.objectKey || "")
        .filter(Boolean) ?? [],
    description: listing.description,
    seller: {
      id: listing.seller?.id ?? "unknown",
      name: sellerName,
      avatar: "",
      rating: 0,
      reviews: 0,
      verified: false,
      idVerified: false,
      responseTime: "",
      transactions: 0,
      memberSince: "",
      neighborhood:
        listing.seller?.profile?.neighborhood ?? listing.neighborhood ?? "Nearby",
    },
    saved,
    tags: [],
    views: 0,
    saves: 0,
    pickupAvailable: listing.pickupAvailable ?? false,
    deliveryAvailable: listing.deliveryAvailable ?? false,
    shippingAvailable: listing.shippingAvailable ?? false,
  }
}

export type OfferRow = {
  requestId: string
  requestTitle: string
  budgetCents: number | null
  offerId: string
  status: string
  amountCents: number | null
  message: string
  createdAt: string
  offerer: PublicUserCard
  requester: PublicUserCard
  imageUrl: string | null
}

export function offerRowsForUser(
  details: ApiRequestDetail[],
  userId: string,
): OfferRow[] {
  const rows: OfferRow[] = []
  for (const request of details) {
    for (const offer of request.offers) {
      const received = request.requester.id === userId
      const sent = offer.offerer.id === userId
      if (!received && !sent) continue
      rows.push({
        requestId: request.id,
        requestTitle: request.title,
        budgetCents: request.budgetCents ?? null,
        offerId: offer.id,
        status: offer.status,
        amountCents: offer.amountCents ?? null,
        message: offer.message,
        createdAt: offer.createdAt,
        offerer: offer.offerer,
        requester: request.requester,
        imageUrl: null,
      })
    }
  }
  return rows
}

export function offerBadge(status: string): {
  variant: "green" | "amber" | "coral"
  label: string
} {
  if (status === "ACCEPTED") return { variant: "green", label: "Accepted" }
  if (status === "COUNTERED") return { variant: "amber", label: "Countered" }
  if (status === "PENDING") return { variant: "amber", label: "Pending" }
  if (status === "WITHDRAWN") return { variant: "coral", label: "Withdrawn" }
  if (status === "EXPIRED") return { variant: "coral", label: "Expired" }
  return { variant: "coral", label: "Rejected" }
}

export function matchesOfferChip(
  row: OfferRow,
  chip: string,
  userId: string,
) {
  if (chip === "Accepted") return row.status === "ACCEPTED"
  if (chip === "Declined")
    return row.status === "REJECTED" || row.status === "WITHDRAWN"
  const open = row.status === "PENDING" || row.status === "COUNTERED"
  if (chip === "Sent") return open && row.offerer.id === userId
  return open && row.requester.id === userId
}

export function transactionStepIndex(status: string | undefined) {
  switch (status) {
    case "SCHEDULED":
      return 2
    case "IN_PROGRESS":
      return 3
    case "COMPLETED":
      return 4
    case "ACCEPTED":
      return 1
    default:
      return 0
  }
}

export function leadingAmountCents(text: string) {
  const match = text.trim().match(/^\$\s*(\d+(?:\.\d{1,2})?)\b/)
  if (!match) return undefined
  const dollars = Number(match[1])
  if (!Number.isFinite(dollars) || dollars < 0) return undefined
  return Math.round(dollars * 100)
}

export function indexOffers(details: ApiRequestDetail[]) {
  const byOfferId = new Map<
    string,
    { request: ApiRequestDetail; offer: ApiOfferDetail }
  >()
  for (const request of details) {
    for (const offer of request.offers) byOfferId.set(offer.id, { request, offer })
  }
  return byOfferId
}
