import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { Listing } from "../data"
import { ListingCard } from "./ui"

function card(rating: number, reviews: number): Listing {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    title: "Oak chair",
    price: 45,
    isFree: false,
    condition: "Good",
    category: "Furniture",
    neighborhood: "Inman Park",
    city: "Atlanta",
    distance: "Nearby",
    postedAt: "1d ago",
    images: [],
    description: "Solid oak dining chair.",
    seller: {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Ada L",
      avatar: "",
      rating,
      reviews,
      verified: false,
      idVerified: false,
      responseTime: "",
      transactions: 0,
      memberSince: "",
      neighborhood: "Inman Park",
    },
    saved: false,
    tags: [],
    views: 0,
    saves: 0,
    pickupAvailable: true,
    deliveryAvailable: false,
    shippingAvailable: false,
  }
}

afterEach(() => {
  cleanup()
})

describe("ListingCard rating", () => {
  it("hides stars when the review count is zero", () => {
    render(<ListingCard listing={card(4, 0)} />)
    expect(screen.queryByRole("img", { name: /rated/i })).toBeNull()
  })

  it("shows stars when the rating and the review count are both positive", () => {
    render(<ListingCard listing={card(4.5, 2)} />)
    expect(screen.getByRole("img", { name: "Rated 4.5 out of 5 from 2 reviews" })).toBeTruthy()
  })
})
