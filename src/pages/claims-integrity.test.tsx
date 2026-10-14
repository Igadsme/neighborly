import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import HomeFeed from "./HomeFeed"
import Landing from "./Landing"

/**
 * Regression guards for claims the UI makes about the product.
 *
 * The audit brief is explicit that fabricated figures must not be presented
 * as real ones. Two such defects were found: a hardcoded "3,200+ active
 * listings in Atlanta" on the landing page, and a "Neighbors to follow"
 * group that announced itself to a screen reader as "Free listings".
 */

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

describe("Landing hero count", () => {
  it("shows the listing count the API reports rather than a fixed number", async () => {
    const categories = [
      { id: "1", name: "Furniture", listingCount: 7 },
      { id: "2", name: "Housing", listingCount: 5 },
    ]
    route((url) => {
      if (url.includes("/categories")) return json(categories)
      return json([])
    })

    render(<Landing onNavigate={() => undefined} onSignIn={() => undefined} />)

    await waitFor(() => expect(screen.getByText("12 nearby listings")).toBeTruthy())
    expect(screen.queryByText(/3,200\+/)).toBeNull()
  })

  it("never invents a number while the real count is still loading", async () => {
    // Categories never resolve, so the count must stay unquantified rather
    // than falling back to a marketing figure.
    route(() => new Promise<Response>(() => {}))

    render(<Landing onNavigate={() => undefined} onSignIn={() => undefined} />)

    await waitFor(() => expect(screen.getByText("Listings from your neighbors")).toBeTruthy())
    expect(screen.queryByText(/\d[\d,]*\+? nearby listings/)).toBeNull()
  })
})

describe("HomeFeed neighbour group", () => {
  it("labels the neighbour group for what it is, not as free listings", async () => {
    route(() => json([]))

    render(<HomeFeed onNavigate={() => undefined} />)

    await waitFor(() => {
      const group = document.querySelector('[aria-label="Preview neighbor examples"]')
      expect(group).toBeTruthy()
    })
    // The label had been copy-pasted from the free-listings carousel, so a
    // screen reader announced three unrelated people as free listings.
    expect(document.querySelector('[aria-label="Free listings"]')).toBeNull()
  })
})