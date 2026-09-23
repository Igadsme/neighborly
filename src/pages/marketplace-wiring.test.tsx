import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Categories from "./Categories"
import CreateListing from "./CreateListing"
import Dashboard from "./Dashboard"
import Landing from "./Landing"

const categoryId = "11111111-1111-4111-8111-111111111111"

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
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)),
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

describe("Create listing", () => {
  it("publishes a marketplace listing and keeps the AI review copy", async () => {
    const calls: Array<{ url: string; method?: string; body?: string }> = []
    route((url, init) => {
      calls.push({ url, method: init?.method, body: typeof init?.body === "string" ? init.body : undefined })
      if (url.includes("/categories")) {
        return json([{ id: categoryId, name: "Furniture", slug: "furniture", listingCount: 2 }])
      }
      return json({ id: "listing-1", title: "My Herman Miller Standing Desk" })
    })
    render(<CreateListing onNavigate={() => undefined} />)
    fireEvent.click(screen.getByRole("button", { name: /Item for Sale/ }))
    fireEvent.click(screen.getByRole("button", { name: "Continue →" }))
    fireEvent.click(screen.getByRole("button", { name: "Continue →" }))
    fireEvent.click(screen.getByRole("button", { name: "Continue →" }))
    expect(screen.getByText("Neighborly AI reviewed your listing and has suggestions.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Continue →" }))
    fireEvent.click(screen.getByRole("button", { name: "Continue to publish →" }))
    const publishButton = await screen.findByRole("button", { name: /Publish now/ })
    await waitFor(() => expect((publishButton as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(publishButton)
    expect(await screen.findByText("Listing published!")).toBeTruthy()
    const publish = calls.find((call) => call.method === "POST" && call.url.endsWith("/listings"))
    expect(publish?.body).toContain(categoryId)
    expect(publish?.body).toContain('"priceCents":48000')
    expect(publish?.body).toContain('"condition":"Good"')
    expect(calls.some((call) => call.url.includes("/requests"))).toBe(false)
  })

  it("saves a draft and blocks a short title", async () => {
    const calls: Array<{ url: string; method?: string }> = []
    const navigate = vi.fn()
    route((url, init) => {
      calls.push({ url, method: init?.method })
      if (url.includes("/categories")) {
        return json([{ id: categoryId, name: "Furniture", slug: "furniture", listingCount: 1 }])
      }
      return json({ id: "draft-1", status: "DRAFT" })
    })
    render(<CreateListing onNavigate={navigate} />)
    fireEvent.click(screen.getByRole("button", { name: /Item for Sale/ }))
    fireEvent.click(screen.getByRole("button", { name: "Continue →" }))
    const save = await screen.findByRole("button", { name: "Save draft" })
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(save)
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("home"))
    expect(calls.some((call) => call.method === "POST" && call.url.endsWith("/listings/drafts"))).toBe(true)

    cleanup()
    navigate.mockClear()
    calls.length = 0
    render(<CreateListing onNavigate={navigate} />)
    fireEvent.click(screen.getByRole("button", { name: /Item for Sale/ }))
    fireEvent.click(screen.getByRole("button", { name: "Continue →" }))
    fireEvent.click(screen.getByRole("button", { name: "Continue →" }))
    fireEvent.change(screen.getByDisplayValue("My Herman Miller Standing Desk"), { target: { value: "ab" } })
    fireEvent.click(screen.getByRole("button", { name: "Continue →" }))
    fireEvent.click(screen.getByRole("button", { name: "Continue →" }))
    fireEvent.click(screen.getByRole("button", { name: "Continue to publish →" }))
    const publish = await screen.findByRole("button", { name: /Publish now/ })
    await waitFor(() => expect((publish as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(publish)
    expect(await screen.findByText("Add a title of 3 to 140 characters.")).toBeTruthy()
    expect(calls.some((call) => call.method === "POST" && call.url.includes("/listings"))).toBe(false)
  })
})

const featuredId = "33333333-3333-4333-8333-333333333333"

function publishedListing(id: string, title: string) {
  return {
    id,
    title,
    description: "A published listing from the neighborhood.",
    priceCents: 12000,
    condition: "Good",
    neighborhood: "Inman Park",
    city: "Atlanta",
    category: { name: "Furniture" },
    seller: {
      id: "44444444-4444-4444-8444-444444444444",
      profile: { firstName: "Ada", lastName: "Lovelace" },
    },
  }
}

describe("Categories", () => {
  it("shows published counts for categories the API knows", async () => {
    route((url) => {
      if (url.includes("/listings")) return json([])
      expect(url).toContain("/categories")
      return json([
        { id: categoryId, name: "Housing", slug: "housing", listingCount: 4 },
        { id: "22222222-2222-4222-8222-222222222222", name: "Jobs", slug: "jobs", listingCount: 0 },
      ])
    })
    render(<Categories onNavigate={() => undefined} />)
    expect(screen.getByText("Loading categories…")).toBeTruthy()
    expect(await screen.findByText("4 listings")).toBeTruthy()
    expect(screen.getAllByText("0 listings").length).toBeGreaterThan(1)
    expect(screen.getByText("Browse by category")).toBeTruthy()
  })

  it("shows empty and error states without dropping the grid", async () => {
    route(() => json([]))
    const { unmount } = render(<Categories onNavigate={() => undefined} />)
    expect(await screen.findByText("No categories yet.")).toBeTruthy()
    expect(screen.getByText("Housing")).toBeTruthy()
    unmount()

    route(() => json({ message: "Unauthorized" }, 401))
    render(<Categories onNavigate={() => undefined} />)
    const alerts = await screen.findAllByText("Sign in to continue.")
    expect(alerts.length).toBe(2)
    expect(screen.getByText("Services")).toBeTruthy()
  })

  it("loads the featured strip from published listings", async () => {
    const calls: Array<{ url: string; auth: string | null }> = []
    const navigate = vi.fn()
    const rows = [
      publishedListing(featuredId, "Oak dining table"),
      publishedListing("55555555-5555-4555-8555-555555555555", "Second chair"),
      publishedListing("66666666-6666-4666-8666-666666666666", "Third lamp"),
      publishedListing("77777777-7777-4777-8777-777777777777", "Fourth rug"),
      publishedListing("88888888-8888-4888-8888-888888888888", "Fifth vase"),
      publishedListing("99999999-9999-4999-8999-999999999999", "Sixth stool"),
      publishedListing("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Seventh extra"),
    ]
    route((url, init) => {
      const headers = init?.headers
      calls.push({
        url,
        auth: headers instanceof Headers ? headers.get("Authorization") : null,
      })
      if (url.includes("/listings")) return json(rows)
      return json([{ id: categoryId, name: "Housing", slug: "housing", listingCount: 4 }])
    })
    render(<Categories onNavigate={navigate} />)
    expect(screen.getByText("Loading listings…")).toBeTruthy()
    expect(await screen.findByText("Oak dining table")).toBeTruthy()
    expect(screen.getByText("Sixth stool")).toBeTruthy()
    expect(screen.queryByText("Seventh extra")).toBeNull()
    expect(screen.queryByText("West Elm Mid-Century Modern Sofa — Excellent Condition")).toBeNull()
    expect(screen.getByText("Featured in Atlanta")).toBeTruthy()
    expect(screen.getByText("4 listings")).toBeTruthy()
    fireEvent.click(screen.getByText("Oak dining table"))
    expect(navigate).toHaveBeenCalledWith("listing", featuredId)
    const listCall = calls.find((call) => call.url.includes("status=PUBLISHED"))
    expect(listCall?.url).toContain("status=PUBLISHED")
    expect(listCall?.url).toContain("limit=6")
    expect(listCall?.auth).toBe("Bearer test-token")
  })

  it("shows an empty featured strip when no published listings come back", async () => {
    route((url) => {
      if (url.includes("/listings")) return json([])
      return json([{ id: categoryId, name: "Vehicles", slug: "vehicles", listingCount: 1 }])
    })
    render(<Categories onNavigate={() => undefined} />)
    expect(await screen.findByText("No featured listings yet.")).toBeTruthy()
    expect(screen.getByText("1 listings")).toBeTruthy()
    expect(screen.getByText("Featured in Atlanta")).toBeTruthy()
    expect(screen.getByText("Trending in Atlanta")).toBeTruthy()
    expect(screen.getByText("Popular in your neighborhoods")).toBeTruthy()
    expect(screen.queryByText("West Elm Mid-Century Modern Sofa — Excellent Condition")).toBeNull()
  })

  it("keeps the grid when the featured list fails", async () => {
    route((url) => {
      if (url.includes("/listings")) return Promise.reject(new Error("offline"))
      return json([{ id: categoryId, name: "Housing", slug: "housing", listingCount: 2 }])
    })
    const { unmount } = render(<Categories onNavigate={() => undefined} />)
    expect(await screen.findByText("Listings could not be loaded.")).toBeTruthy()
    expect(screen.getByText("2 listings")).toBeTruthy()
    expect(screen.queryByText("West Elm Mid-Century Modern Sofa — Excellent Condition")).toBeNull()
    unmount()

    route((url) => {
      if (url.includes("/listings")) return json({ message: "Unauthorized" }, 401)
      return json([{ id: categoryId, name: "Services", slug: "services", listingCount: 3 }])
    })
    render(<Categories onNavigate={() => undefined} />)
    expect(await screen.findByText("Sign in to continue.")).toBeTruthy()
    expect(screen.getByText("3 listings")).toBeTruthy()
    expect(screen.getByText("Services")).toBeTruthy()
  })
})

describe("Landing", () => {
  it("opens sign-in for prototype jumps and still logs in", async () => {
    const navigate = vi.fn()
    const onSignIn = vi.fn()
    const calls: string[] = []
    route((url, init) => {
      calls.push(`${init?.method ?? "GET"} ${url}`)
      return json({ user: { id: "user-1", email: "ada@example.com" }, accessToken: "token" })
    })
    render(<Landing onNavigate={navigate} onSignIn={onSignIn} />)
    fireEvent.click(screen.getByRole("button", { name: "Browse" }))
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Close sign in" }))
    fireEvent.click(screen.getByRole("button", { name: "Post a Listing" }))
    const dialog = screen.getByRole("dialog")
    fireEvent.change(within(dialog).getByPlaceholderText("Email address"), { target: { value: "ada@example.com" } })
    fireEvent.change(within(dialog).getByPlaceholderText("Password"), { target: { value: "long-enough-password" } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Sign in" }))
    await waitFor(() => expect(onSignIn).toHaveBeenCalled())
    expect(calls.some((call) => call.includes("/auth/login"))).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Get started" }))
    expect(navigate).toHaveBeenCalledWith("onboarding")
  })
})

describe("Dashboard offers", () => {
  it("loads the caller-scoped offers endpoint", async () => {
    const calls: string[] = []
    route((url) => {
      calls.push(url)
      if (url.includes("/users/me")) {
        return json({ id: "user-1", email: "ada@example.com", profile: { firstName: "Ada", neighborhood: "Inman Park" } })
      }
      return json([])
    })
    render(<Dashboard onNavigate={() => undefined} />)
    expect(await screen.findByText("No offers yet")).toBeTruthy()
    expect(calls.some((url) => url.includes("/requests/offers?scope=all"))).toBe(true)
    expect(calls.some((url) => /\/requests\/[0-9a-f-]{36}$/i.test(url))).toBe(false)
  })
})
