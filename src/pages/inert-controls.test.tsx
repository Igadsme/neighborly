import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import Explore from "./Explore"
import ListingDetail from "./ListingDetail"
import MapDiscovery from "./MapDiscovery"
import SavedItems from "./SavedItems"

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  )
}

function route(handler: (url: string) => Promise<Response> | Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => handler(String(input))),
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

const favorite = {
  listing: {
    id: "fav-1",
    title: "Oak chair",
    description: "Solid oak dining chair from a neighbor.",
    priceCents: 4500,
    condition: "Good",
    neighborhood: "Inman Park",
    city: "Atlanta",
    createdAt: "2026-09-01T00:00:00.000Z",
    category: { name: "Furniture" },
    seller: { id: "seller-1", profile: { displayName: "Ada L", firstName: "Ada" } },
    images: [],
  },
}

describe("inert controls", () => {
  it("disables map locate with a visible coming-soon label and focuses filters", async () => {
    route(() => json({ items: [], total: 0, limit: 100, offset: 0 }))
    render(<MapDiscovery onNavigate={() => undefined} />)
    const locate = await screen.findByRole("button", { name: /locate me/i })
    expect((locate as HTMLButtonElement).disabled).toBe(true)
    expect(locate.textContent).toMatch(/coming soon/i)
    expect(screen.queryByText("Within 5 miles of Inman Park")).toBeNull()
    expect(screen.queryByRole("option", { name: "Sort: Most popular" })).toBeNull()
    expect(screen.getByRole("combobox", { name: "Sort listings" })).toBeTruthy()

    const filters = document.getElementById("map-filter-chips")
    expect(filters).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Focus map filters" }))
    expect(document.activeElement).toBe(filters)
  })

  it("keeps new collections unavailable and compares only saved API fields", async () => {
    route((url) => {
      if (url.includes("/favorites")) return json([favorite])
      if (url.includes("/saved-searches")) return json([])
      return json([])
    })
    render(<SavedItems onNavigate={() => undefined} />)
    const create = await screen.findByRole("button", { name: "New collection · Coming soon" })
    expect((create as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "Compare" }))
    fireEvent.click(screen.getByRole("button", { name: "Compare →" }))
    const region = screen.getByRole("region", { name: "Saved listing comparison" })
    expect(region.textContent).toContain("Oak chair")
    expect(region.textContent).toContain("$45")
    expect(region.textContent).toContain("Good")
    expect(region.textContent).toContain("Inman Park")
    expect(region.textContent).not.toContain("$100 off")

    fireEvent.click(screen.getByRole("button", { name: "Price Alerts" }))
    expect(await screen.findByText("No price alerts yet")).toBeTruthy()
    expect(document.body.textContent).not.toContain("$100 off")
  })

  it("does not let explore rating chips or the verified toggle filter results", async () => {
    route(() => json({ items: [], total: 0, limit: 24, offset: 0 }))
    render(<Explore onNavigate={() => undefined} />)
    const chip = screen.getByRole("button", { name: /4\+ ★/ })
    expect((chip as HTMLButtonElement).disabled).toBe(true)
    expect(chip.textContent).toMatch(/coming soon/i)
    const verified = screen.getByRole("button", { name: /verified sellers only/i })
    expect((verified as HTMLButtonElement).disabled).toBe(true)
    expect(verified.textContent).toMatch(/coming soon/i)
    fireEvent.click(chip)
    fireEvent.click(verified)
    await waitFor(() => expect(screen.queryByText("Verified sellers")).toBeNull())
  })

  it("keeps the listing video tile in place and marked coming soon", () => {
    render(<ListingDetail listingId="l1" onNavigate={() => undefined} />)
    const video = screen.getByRole("button", { name: /video/i })
    expect((video as HTMLButtonElement).disabled).toBe(true)
    expect(video.textContent).toMatch(/coming soon/i)
    const offer = screen.getAllByRole("button", { name: /make an offer/i })[0]
    expect((offer as HTMLButtonElement).disabled).toBe(true)
    expect(offer.textContent).toMatch(/coming soon/i)
  })
})
