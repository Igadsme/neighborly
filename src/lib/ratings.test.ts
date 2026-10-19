import { describe, expect, it } from "vitest"
import { hasDisplayableRating } from "./ratings"

describe("hasDisplayableRating", () => {
  it("hides a null rating, a zero count, and omitted fields", () => {
    expect(hasDisplayableRating(null, 0)).toBe(false)
    expect(hasDisplayableRating(undefined, undefined)).toBe(false)
    expect(hasDisplayableRating(4.5, 0)).toBe(false)
    expect(hasDisplayableRating(0, 3)).toBe(false)
    expect(hasDisplayableRating(null, 4)).toBe(false)
  })

  it("shows a rating only when both values are present and positive", () => {
    expect(hasDisplayableRating(4.5, 2)).toBe(true)
  })
})
