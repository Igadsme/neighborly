import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import MapDiscovery from "./MapDiscovery"
import Profile from "./Profile"

const profile = {
  id: "11111111-1111-4111-8111-111111111111",
  displayName: "Ada L",
  firstName: "Ada",
  lastName: "Lovelace",
  bio: "Builds things for neighbors.",
  neighborhood: "Inman Park",
  city: "Atlanta",
  memberSince: "2022-01-15T00:00:00.000Z",
  emailVerified: true,
  ratingAverage: 4.7,
  reviewCount: 1,
  soldCount: 1,
}

const published = {
  id: "listing-1",
  sellerId: profile.id,
  title: "Oak chair",
  description: "Solid oak dining chair",
  priceCents: 4000,
  condition: "Good",
  neighborhood: "Inman Park",
  city: "Atlanta",
  createdAt: "2026-09-01T00:00:00.000Z",
  category: { name: "Furniture" },
  seller: { id: profile.id, profile: { displayName: "Ada L", firstName: "Ada", neighborhood: "Inman Park" } },
  images: [],
}

const freebie = {
  ...published,
  id: "listing-2",
  title: "Free plant",
  priceCents: 0,
  neighborhood: "Midtown",
  category: { name: "Home & Garden" },
  createdAt: "2026-09-02T00:00:00.000Z",
}

const sold = {
  ...published,
  id: "listing-sold",
  title: "Sold lamp",
  priceCents: 1500,
}

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  )
}

function route(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      return handler(url, init)
    }),
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

beforeEach(() => {
  window.localStorage.setItem("neighborly.access_token", "test-token")
})

describe("Map screen", () => {
  it("renders published listings as pins and filters them", async () => {
    const onNavigate = vi.fn()
    route((url, init) => {
      if (init?.method === "POST") return json({ message: "Unauthorized" }, 401)
      expect(url).toContain("/listings?limit=100")
      return json([published, freebie])
    })
    render(<MapDiscovery onNavigate={onNavigate} />)
    expect(screen.getByText("Loading listings…")).toBeTruthy()
    expect((await screen.findAllByText("Oak chair")).length).toBeGreaterThan(0)
    expect(screen.getAllByText("Free plant").length).toBeGreaterThan(0)
    expect(screen.getByText("2 listings nearby")).toBeTruthy()
    expect(document.body.textContent).not.toContain("Marcus")

    fireEvent.click(screen.getByRole("button", { name: "Furniture" }))
    expect(screen.queryByText("Free plant")).toBeNull()
    expect(screen.getByText("1 listings nearby")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Furniture" }))
    fireEvent.change(screen.getByPlaceholderText("Search this area..."), { target: { value: "plant" } })
    expect(screen.queryByText("Oak chair")).toBeNull()
    expect(screen.getAllByText("Free plant").length).toBeGreaterThan(0)

    fireEvent.change(screen.getByPlaceholderText("Search this area..."), { target: { value: "" } })
    fireEvent.click(screen.getAllByText("View →")[0])
    expect(onNavigate).toHaveBeenCalledWith("listing", expect.any(String))

    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(await screen.findByText("Sign in to continue.")).toBeTruthy()
  })

  it("shows an empty list and an unauthorized error under the map", async () => {
    route(() => json([]))
    const { unmount } = render(<MapDiscovery onNavigate={() => undefined} />)
    expect(await screen.findByText("No listings nearby.")).toBeTruthy()
    expect(screen.getByText("Ponce de Leon Ave")).toBeTruthy()
    unmount()

    route(() => json({ message: "Unauthorized" }, 401))
    render(<MapDiscovery onNavigate={() => undefined} />)
    expect(await screen.findByText("Sign in to continue.")).toBeTruthy()
  })

  it("shows a load error when the request fails", async () => {
    route(() => Promise.reject(new Error("offline")))
    render(<MapDiscovery onNavigate={() => undefined} />)
    expect(await screen.findByText("Listings could not be loaded.")).toBeTruthy()
  })
})

describe("Profile screen", () => {
  function profileRoute(options?: { status?: number; empty?: boolean }) {
    const calls: string[] = []
    route((url) => {
      calls.push(url)
      if (options?.status) return json({ message: "Unauthorized" }, options.status)
      if (url.endsWith("/users/me")) return json({ id: profile.id, email: "ada@example.com" })
      if (url.includes("/reviews")) {
        return json(
          options?.empty
            ? []
            : [
                {
                  id: "review-1",
                  rating: 5,
                  body: "Smooth pickup.",
                  createdAt: "2026-08-01T00:00:00.000Z",
                  itemTitle: "Oak chair",
                  author: { id: "author-1", profile: { displayName: "Grace H", firstName: "Grace" } },
                },
              ],
        )
      }
      if (url.includes("/profile")) return json(options?.empty ? { ...profile, bio: null, reviewCount: 0, soldCount: 0, ratingAverage: null, emailVerified: false } : profile)
      if (url.includes("status=SOLD")) return json(options?.empty ? [] : [sold])
      if (url.includes("/listings")) return json(options?.empty ? [] : [published])
      return json({ message: "unexpected" }, 500)
    })
    return calls
  }

  it("loads the signed-in profile, reviews, and listings", async () => {
    const onNavigate = vi.fn()
    const calls = profileRoute()
    render(<Profile onNavigate={onNavigate} />)
    expect(screen.getByText("Loading profile…")).toBeTruthy()
    expect((await screen.findAllByRole("heading", { name: "Ada L" })).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Marcus/)).toBeNull()
    expect(screen.getByText("Builds things for neighbors.")).toBeTruthy()
    expect(screen.getByText("Oak chair")).toBeTruthy()
    expect(screen.getAllByText(/Member since January 2022/).length).toBeGreaterThan(0)
    expect(calls.some((url) => url.endsWith("/users/me"))).toBe(true)
    expect(calls.some((url) => url.includes(`/users/${profile.id}/profile`))).toBe(true)
    expect(document.body.textContent).not.toContain("ada@example.com")

    fireEvent.click(screen.getByRole("button", { name: "Reviews (1)" }))
    expect(screen.getByText("Smooth pickup.")).toBeTruthy()
    expect(screen.getByText("Grace H")).toBeTruthy()
    expect(screen.getByText("Oak chair")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Sold (1)" }))
    expect(screen.getByText("Sold lamp")).toBeTruthy()
    expect(screen.getByText("Sold")).toBeTruthy()

    expect(screen.queryByRole("button", { name: "Block this profile" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Follow" }))
    expect(screen.getByText("Following neighbors isn't available yet.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "✓ Following" })).toBeNull()
    expect(calls.some((url) => url.includes("/follow"))).toBe(false)
  })

  it("uses a provided user id and shows empty tabs", async () => {
    const calls = profileRoute({ empty: true })
    render(<Profile userId={profile.id} onNavigate={() => undefined} />)
    expect(await screen.findByText("No bio yet.")).toBeTruthy()
    expect(screen.getByText("No active listings yet.")).toBeTruthy()
    expect(calls.some((url) => url.endsWith("/users/me"))).toBe(false)

    fireEvent.click(screen.getByRole("button", { name: "Reviews (0)" }))
    expect(screen.getByText("No reviews yet.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Sold (0)" }))
    expect(screen.getByText("No sold listings yet.")).toBeTruthy()
  })

  it("reports and blocks another profile from the existing controls", async () => {
    const bodies: string[] = []
    route((url, init) => {
      if (typeof init?.body === "string") bodies.push(init.body)
      if (url.includes("/safety/blocks") && init?.method === "POST") return json({ blocked: true, userId: profile.id })
      if (url.includes("/safety/blocks") && init?.method === "DELETE") return json({ blocked: false, userId: profile.id })
      if (url.includes("/safety/blocks")) return json([])
      if (url.includes("/safety/reports")) return json({ id: "report-1", status: "OPEN" }, 201)
      if (url.includes("/reviews")) return json([])
      if (url.includes("/profile")) return json({ ...profile, bio: null, reviewCount: 0, soldCount: 0, ratingAverage: null })
      if (url.includes("/listings")) return json([])
      return json({ message: "unexpected" }, 500)
    })
    render(<Profile userId={profile.id} onNavigate={() => undefined} />)
    expect(await screen.findByText("No bio yet.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Report this profile" }))
    expect(await screen.findByText("Report submitted.")).toBeTruthy()
    expect(bodies.some((body) => body.includes('"targetType":"USER"') && body.includes(profile.id))).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Block this profile" }))
    expect(await screen.findByText("Profile blocked. You cannot message this person.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Unblock this profile" }))
    expect(await screen.findByText("Profile unblocked.")).toBeTruthy()
  })

  it("shows unauthorized and load errors", async () => {
    profileRoute({ status: 401 })
    const { unmount } = render(<Profile onNavigate={() => undefined} />)
    expect(await screen.findByText("Sign in to continue.")).toBeTruthy()
    unmount()

    route(() => Promise.reject(new Error("offline")))
    render(<Profile onNavigate={() => undefined} />)
    expect(await screen.findByText("Profile could not be loaded.")).toBeTruthy()
  })
})
