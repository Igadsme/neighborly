import type { Listing } from "../data"
import type { ApiListing } from "./types"

export function mapApiListing(listing: ApiListing, saved = false): Listing {
  const firstName = listing.seller?.profile?.firstName ?? "Neighbor"
  const lastName = listing.seller?.profile?.lastName ?? ""
  return {
    id: listing.id,
    title: listing.title,
    price: listing.priceCents == null ? null : listing.priceCents / 100,
    isFree: listing.priceCents === 0,
    condition: listing.condition ?? "Good",
    category: listing.category?.name ?? "Marketplace",
    neighborhood: listing.neighborhood ?? "Nearby",
    city: listing.city ?? "",
    distance: "Distance unavailable",
    postedAt: listing.createdAt
      ? new Date(listing.createdAt).toLocaleDateString()
      : "Recently",
    images:
      listing.images?.flatMap((image) => (image.url ? [image.url] : [])) ?? [],
    description: listing.description,
    seller: {
      id: listing.seller?.id ?? "unknown",
      name: `${firstName} ${lastName}`.trim(),
      avatar: "",
      rating: 0,
      reviews: 0,
      verified: false,
      idVerified: false,
      responseTime: "Not yet available",
      transactions: 0,
      memberSince: "Neighbor",
      neighborhood:
        listing.seller?.profile?.neighborhood ??
        listing.neighborhood ??
        "Nearby",
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
