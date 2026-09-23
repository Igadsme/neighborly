import { describe, expect, it } from "vitest"
import { housingCard, jobCard, serviceCard } from "./verticals"
import type { ApiHousing, ApiJob, ApiServiceListing } from "../api/types"

const owner = {
  id: "owner-1",
  profile: { displayName: "Ada L", firstName: "Ada", neighborhood: "Inman Park", city: "Atlanta" },
}

describe("vertical field mapping", () => {
  it("turns housing cents into dollars and keeps the public owner name", () => {
    const card = housingCard({
      id: "h1",
      title: "Sunny 2BR",
      description: "Bright two-bedroom a short walk from the BeltLine.",
      type: "Apartment",
      listingType: "rent",
      priceCents: 185000,
      priceUnit: "/mo",
      beds: 2,
      baths: 1,
      sqft: 920,
      neighborhood: "Inman Park",
      available: "Oct 1, 2026",
      lease: "12 months",
      pets: true,
      furnished: false,
      utilities: "Water included",
      verified: true,
      createdAt: "2026-09-22T12:00:00.000Z",
      owner,
      images: [{ objectKey: "photo-1560448204-e02f11c3d0e2" }],
    } satisfies ApiHousing)

    expect(card.price).toBe(1850)
    expect(card.priceUnit).toBe("/mo")
    expect(card.type).toBe("Apartment")
    expect(card.seller.name).toBe("Ada L")
    expect(card.distance).toBe("Nearby")
    expect(card.images).toEqual(["photo-1560448204-e02f11c3d0e2"])
    expect(JSON.stringify(card)).not.toContain("latitude")
  })

  it("keeps job salary as the display string", () => {
    const card = jobCard({
      id: "j1",
      title: "Full-Stack Engineer",
      company: "PeachTech",
      logo: "photo-logo",
      description: "Build neighborhood tools.",
      responsibilities: ["Ship features"],
      type: "Full-time",
      level: "Mid-Senior",
      salary: "$110k–$145k",
      location: "Midtown Atlanta",
      remote: "Hybrid",
      deadline: null,
      tags: ["React"],
      verified: true,
      createdAt: new Date().toISOString(),
      owner,
    } satisfies ApiJob)

    expect(card.salary).toBe("$110k–$145k")
    expect(card.deadline).toBe("Rolling")
    expect(card.responsibilities).toEqual(["Ship features"])
  })

  it("turns a service starting price from cents and uses the owner display name", () => {
    const card = serviceCard({
      id: "s1",
      title: "House Cleaning",
      businessName: "Rosa's Spotless Cleaning",
      description: "Deep cleans for apartments.",
      category: "Cleaning",
      startingPriceCents: 8900,
      location: "Decatur",
      availability: "Mon–Sat",
      tags: ["Deep Clean"],
      image: "photo-clean",
      backgroundCheck: true,
      rating: 4.9,
      reviewCount: 142,
      createdAt: new Date().toISOString(),
      owner,
    } satisfies ApiServiceListing)

    expect(card.startingPrice).toBe(89)
    expect(card.providerName).toBe("Ada L")
    expect(card.provider).toBe("Rosa's Spotless Cleaning")
    expect(card.reviews).toBe(142)
  })
})
