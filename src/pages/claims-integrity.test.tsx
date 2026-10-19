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

describe("Landing trust copy", () => {
  it("does not claim sellers or sample stories are verified", () => {
    route(() => new Promise<Response>(() => {}))
    render(<Landing onNavigate={() => undefined} onSignIn={() => undefined} />)
    expect(screen.queryByText("Verified sellers")).toBeNull()
    expect(screen.queryByText(/verified profiles/i)).toBeNull()
    expect(document.querySelector("[data-verified-badge]")).toBeNull()
    expect(screen.getByText("Neighbors nearby")).toBeTruthy()
  })
})

describe("HomeFeed neighbour group", () => {
  it("loads opted-in neighbors without a verified badge or stars", async () => {
    route((url) => {
      if (url.includes("/passport/leaderboard")) {
        return json([
          {
            userId: "11111111-1111-4111-8111-111111111111",
            displayName: "Ada L",
            avatarUrl: null,
            completedBorrowings: 1,
            borrowingsAsLender: 0,
            completedExchanges: 3,
          },
        ])
      }
      return json([])
    })

    render(<HomeFeed onNavigate={() => undefined} />)

    expect(await screen.findByRole("group", { name: "Neighbors to follow" })).toBeTruthy()
    expect(screen.getByText("Ada L")).toBeTruthy()
    expect(screen.getByText("3 completed exchanges")).toBeTruthy()
    expect(screen.queryByText("Sofia Martinez")).toBeNull()
    expect(document.querySelector("[data-verified-badge]")).toBeNull()
    expect(screen.queryByRole("img", { name: /rated/i })).toBeNull()
    expect(document.querySelector('[aria-label="Free listings"]')).toBeNull()
    const follow = screen.getByRole("button", { name: "Follow · Coming soon" })
    expect((follow as HTMLButtonElement).disabled).toBe(true)
  })

  it("shows an empty state when nobody opted in", async () => {
    route((url) => (url.includes("/passport/leaderboard") ? json([]) : json([])))
    render(<HomeFeed onNavigate={() => undefined} />)
    expect(await screen.findByText("No neighbors to show yet.")).toBeTruthy()
  })

  it("shows an error when the leaderboard cannot be loaded", async () => {
    route((url) =>
      url.includes("/passport/leaderboard")
        ? json({ message: "Leaderboard unavailable" }, 500)
        : json([]),
    )
    render(<HomeFeed onNavigate={() => undefined} />)
    expect(await screen.findByText("Leaderboard unavailable")).toBeTruthy()
  })
})