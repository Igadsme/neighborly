import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Housing from "./Housing"
import Jobs from "./Jobs"
import Services from "./Services"
import Community from "./Community"
import HomeFeed from "./HomeFeed"
import Dashboard from "./Dashboard"

const owner = {
  id: "owner-1",
  profile: { displayName: "Ada L", firstName: "Ada", neighborhood: "Inman Park", city: "Atlanta" },
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

describe("Housing screen", () => {
  it("renders dollars from priceCents", async () => {
    route((url) => {
      expect(url).toContain("/housing?")
      expect(url).toContain("listingType=rent")
      return json([
        {
          id: "h1",
          title: "Sunny 2BR in Inman Park",
          description: "Bright apartment.",
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
        },
      ])
    })
    render(<Housing onNavigate={() => undefined} />)
    expect(screen.getAllByText("Loading homes…").length).toBeGreaterThan(0)
    expect(await screen.findByText("Sunny 2BR in Inman Park")).toBeTruthy()
    expect(document.body.textContent).toMatch(/\$1[,.]?850/)
    expect(document.body.textContent).toContain("Ada L")
  })

  it("shows the empty shell and an unauthorized error", async () => {
    route(() => json([]))
    const { unmount } = render(<Housing onNavigate={() => undefined} />)
    expect(await screen.findByText("No homes match your filters")).toBeTruthy()
    unmount()

    route(() => json({ message: "Unauthorized" }, 401))
    render(<Housing onNavigate={() => undefined} />)
    expect(await screen.findByText("Sign in to continue.")).toBeTruthy()
  })
})

describe("Jobs screen", () => {
  it("keeps the salary string and posts an application", async () => {
    const calls: Array<{ url: string; method?: string; body?: string }> = []
    route((url, init) => {
      calls.push({ url, method: init?.method, body: typeof init?.body === "string" ? init.body : undefined })
      if (url.includes("/jobs/saved")) return json([])
      if (url.includes("/jobs/applications")) return json([])
      if (url.includes("/apply")) return json({ id: "app-1" })
      return json([
        {
          id: "job-1",
          title: "Full-Stack Engineer",
          company: "PeachTech",
          logo: null,
          description: "Build tools for neighbors.",
          responsibilities: ["Ship features"],
          type: "Full-time",
          level: "Mid",
          salary: "$110k–$145k",
          location: "Midtown",
          remote: "Hybrid",
          deadline: "Rolling",
          tags: ["React"],
          verified: true,
          createdAt: "2026-09-22T12:00:00.000Z",
          owner,
        },
      ])
    })
    render(<Jobs />)
    expect((await screen.findAllByText("$110k–$145k")).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole("button", { name: "Apply now →" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "✓ Applied!" })).toBeTruthy())
    expect(calls.some((call) => call.url.endsWith("/jobs/job-1/apply") && call.method === "POST")).toBe(true)
  })

  it("shows empty and unauthorized states", async () => {
    route((url) => {
      if (url.includes("/jobs/saved") || url.includes("/jobs/applications")) return json([])
      return json([])
    })
    const { unmount } = render(<Jobs />)
    expect(await screen.findByText("No jobs match your filters")).toBeTruthy()
    unmount()

    route(() => json({ message: "Unauthorized" }, 401))
    render(<Jobs />)
    expect(await screen.findByText("Sign in to continue.")).toBeTruthy()
  })
})

describe("Services screen", () => {
  it("formats the starting price and sends a private address on the quote", async () => {
    const calls: Array<{ url: string; method?: string; body?: string }> = []
    route((url, init) => {
      calls.push({ url, method: init?.method, body: typeof init?.body === "string" ? init.body : undefined })
      if (url.includes("/quotes")) {
        return json({
          id: "q1",
          serviceId: "svc-1",
          notes: "Deep clean",
          address: "12 Peachtree St",
          status: "PENDING",
          createdAt: "2026-09-22T12:00:00.000Z",
        })
      }
      return json([
        {
          id: "svc-1",
          title: "House Cleaning",
          businessName: "Rosa's Spotless",
          description: "Apartment deep cleans.",
          category: "Cleaning",
          startingPriceCents: 8900,
          location: "Decatur",
          availability: "Mon–Sat",
          tags: ["Deep Clean"],
          image: null,
          backgroundCheck: true,
          rating: 4.9,
          reviewCount: 12,
          createdAt: "2026-09-22T12:00:00.000Z",
          owner,
        },
      ])
    })
    render(<Services onNavigate={() => undefined} />)
    expect(await screen.findByText("House Cleaning")).toBeTruthy()
    expect(document.body.textContent).toContain("$89")
    fireEvent.click(screen.getByRole("button", { name: "Request quote" }))
    fireEvent.change(screen.getByPlaceholderText(/2BR apartment/), { target: { value: "Deep clean before move-in" } })
    fireEvent.change(screen.getByPlaceholderText(/Street address/), { target: { value: "12 Peachtree St" } })
    fireEvent.click(screen.getByRole("button", { name: "Send request →" }))
    expect(await screen.findByText("Request sent!")).toBeTruthy()
    const quote = calls.find((call) => call.url.includes("/services/svc-1/quotes"))
    expect(quote?.method).toBe("POST")
    expect(JSON.parse(quote?.body ?? "{}")).toMatchObject({
      notes: "Deep clean before move-in",
      address: "12 Peachtree St",
    })
  })

  it("shows empty results and an unauthorized quote error", async () => {
    route(() => json([]))
    const { unmount } = render(<Services onNavigate={() => undefined} />)
    expect(await screen.findByText("No services match your search")).toBeTruthy()
    unmount()

    route((url) => {
      if (url.includes("/quotes")) return json({ message: "Unauthorized" }, 401)
      return json([
        {
          id: "svc-1",
          title: "House Cleaning",
          businessName: "Rosa's Spotless",
          description: "Apartment deep cleans.",
          category: "Cleaning",
          startingPriceCents: 8900,
          location: "Decatur",
          availability: "Mon–Sat",
          tags: [],
          image: null,
          backgroundCheck: false,
          rating: null,
          reviewCount: 0,
          createdAt: "2026-09-22T12:00:00.000Z",
          owner,
        },
      ])
    })
    render(<Services onNavigate={() => undefined} />)
    fireEvent.click(await screen.findByRole("button", { name: "Request quote" }))
    fireEvent.change(screen.getByPlaceholderText(/2BR apartment/), { target: { value: "Need a clean" } })
    fireEvent.click(screen.getByRole("button", { name: "Send request →" }))
    expect(await screen.findByText("Sign in to continue.")).toBeTruthy()
  })
})

describe("Community screen", () => {
  it("renders posts and an empty feed", async () => {
    route((url) => {
      if (url.includes("/community/posts")) {
        return json([
          {
            id: "p1",
            type: "discussion",
            title: "Farmer's market this weekend?",
            body: "Which market is worth the trip this Saturday morning?",
            neighborhood: "Inman Park",
            createdAt: "2026-09-22T12:00:00.000Z",
            author: owner,
            reactions: { like: 2, love: 1, wow: 0 },
            replies: 3,
          },
        ])
      }
      if (url.includes("/users/me")) return json({ id: "user-1", email: "ada@example.com", profile: { firstName: "Ada" } })
      return json([])
    })
    const view = render(<Community />)
    expect(await screen.findByText("Farmer's market this weekend?")).toBeTruthy()
    expect(document.body.textContent).toContain("Ada L")
    view.unmount()

    route((url) => (url.includes("/users/me") ? json({ id: "user-1", email: "ada@example.com" }) : json([])))
    render(<Community />)
    expect(await screen.findByText("No posts yet")).toBeTruthy()
  })

  it("shows an unauthorized error", async () => {
    route(() => json({ message: "Unauthorized" }, 401))
    render(<Community />)
    expect(await screen.findByText("Sign in to continue.")).toBeTruthy()
  })
})

describe("Home and Dashboard screens", () => {
  it("loads services and discussions instead of fixture titles", async () => {
    route((url) => {
      if (url.includes("/listings")) return json([])
      if (url.includes("/services")) {
        return json([
          {
            id: "svc-1",
            title: "API House Cleaning",
            businessName: "Rosa's Spotless",
            description: "Cleans.",
            category: "Cleaning",
            startingPriceCents: 4500,
            location: "Decatur",
            availability: "Weekdays",
            tags: [],
            image: null,
            backgroundCheck: false,
            rating: 5,
            reviewCount: 2,
            createdAt: "2026-09-22T12:00:00.000Z",
            owner,
          },
        ])
      }
      if (url.includes("/community/posts")) {
        return json([
          {
            id: "p1",
            type: "discussion",
            title: "API discussion title",
            body: "Loaded from the community posts endpoint.",
            neighborhood: "Inman Park",
            createdAt: "2026-09-22T12:00:00.000Z",
            author: owner,
            reactions: { like: 1, love: 0, wow: 0 },
            replies: 0,
          },
        ])
      }
      if (url.includes("/community/events")) return json([])
      if (url.includes("/users/me")) return json({ id: "user-1", email: "ada@example.com", profile: { firstName: "Ada", lastName: "Lovelace" } })
      return json([])
    })
    render(<HomeFeed onNavigate={() => undefined} />)
    expect(await screen.findByText("API House Cleaning")).toBeTruthy()
    expect(await screen.findByText("API discussion title")).toBeTruthy()
    expect(document.body.textContent).not.toContain("IKEA shelf")
    expect(screen.getAllByText(/Ada/).length).toBeGreaterThan(0)
  })

  it("shows an empty dashboard activity list from the APIs", async () => {
    route((url) => {
      if (url.includes("/users/me")) {
        return json({ id: "user-1", email: "ada@example.com", profile: { firstName: "Ada", neighborhood: "Inman Park" } })
      }
      return json([])
    })
    render(<Dashboard onNavigate={() => undefined} />)
    expect(await screen.findByText("No offers yet")).toBeTruthy()
    expect(document.body.textContent).toContain("Ada · Inman Park")
    expect(document.body.textContent).not.toContain("52 transactions")
    expect(document.body.textContent).not.toContain("4.9")
    expect(document.body.textContent).toContain("No reviews yet")
    expect(document.body.textContent).not.toContain("Marcus")
    expect(document.body.textContent).not.toContain("$1,925")
  })
})
