import { describe, expect, it } from "vitest"
import { isPaintedNeighborhood, pinPosition } from "./map-pins"

describe("map pin positions", () => {
  it("places a known neighborhood near its painted centroid", () => {
    const pin = pinPosition({ id: "listing-1", neighborhood: "Inman Park", city: "Atlanta" })
    expect(pin.x).toBeGreaterThanOrEqual(51)
    expect(pin.x).toBeLessThanOrEqual(59)
    expect(pin.y).toBeGreaterThanOrEqual(36)
    expect(pin.y).toBeLessThanOrEqual(44)
    expect(pin).not.toHaveProperty("latitude")
    expect(pin).not.toHaveProperty("longitude")
  })

  it("keeps two listings in the same neighborhood from stacking", () => {
    const first = pinPosition({ id: "listing-a", neighborhood: "Decatur", city: "Atlanta" })
    const second = pinPosition({ id: "listing-b", neighborhood: "Decatur", city: "Atlanta" })
    expect(first).not.toEqual(second)
    expect(pinPosition({ id: "listing-a", neighborhood: "Decatur", city: "Atlanta" })).toEqual(first)
  })

  it("aliases East Atlanta onto the East ATL label and ignores unknown coordinates", () => {
    const alias = pinPosition({ id: "listing-east", neighborhood: "East Atlanta", city: "Atlanta" })
    const named = pinPosition({ id: "listing-east", neighborhood: "East ATL", city: "Atlanta" })
    expect(alias).toEqual(named)
    expect(isPaintedNeighborhood("East Atlanta Village")).toBe(true)
    expect(isPaintedNeighborhood("Hayes Valley")).toBe(false)
    const unknown = pinPosition({ id: "listing-unknown", neighborhood: "Hayes Valley", city: "San Francisco" })
    expect(unknown.x).toBeGreaterThanOrEqual(8)
    expect(unknown.x).toBeLessThanOrEqual(92)
    expect(unknown.y).toBeGreaterThanOrEqual(8)
    expect(unknown.y).toBeLessThanOrEqual(92)
  })
})
