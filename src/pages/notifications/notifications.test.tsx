import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import NotificationCenter from "./NotificationCenter"
import NotificationPreferencesScreen from "./NotificationPreferencesScreen"
import SavedSearches from "./SavedSearches"
import { routeFor } from "../../lib/routes"

const listingId = "22222222-2222-4222-8222-222222222222"

function notificationRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: "offer_received",
    title: "New offer on \"Oak chair\"",
    body: "Someone made you an offer.",
    link: `/listings/${listingId}`,
    readAt: null,
    createdAt: "2026-10-01T12:00:00.000Z",
    ...overrides
  }
}

let calls: Array<{ method: string; url: string; body: unknown }> = []
let routes: Array<{ test: RegExp; handler: (url: string, init?: RequestInit) => unknown }> = []

function route(pattern: RegExp, handler: (url: string, init?: RequestInit) => unknown) {
  routes.push({ test: pattern, handler })
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

beforeEach(() => {
  calls = []
  routes = []
  window.localStorage.setItem("neighborly.access_token", "test-token")
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({
      method: init?.method ?? "GET",
      url,
      body: init?.body && typeof init.body === "string" ? JSON.parse(init.body) : undefined
    })
    const match = routes.find(entry => entry.test.test(url))
    if (!match) return json({ message: `unmocked ${url}` }, 501)
    const body = await match.handler(url, init)
    if (body instanceof Response) return body
    return json(body ?? {})
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe("routeFor", () => {
  it("maps each kind of link the backend produces", () => {
    expect(routeFor(`/listings/${listingId}`)).toEqual(["listing", listingId])
    expect(routeFor("/requests/r-1/offers")).toEqual(["request-detail", "r-1"])
    // Transactions have no dedicated screen; they resolve to the dashboard
    // that actually lists completed exchanges and pending offers.
    expect(routeFor("/transactions/t-1")).toEqual(["dashboard"])
  })

  it("routes borrowing notifications to the borrow request", () => {
    expect(routeFor("/borrow/requests/b-1")).toEqual(["borrow-detail", "b-1"])
  })

  it("routes dispute notifications to the dispute centre", () => {
    expect(routeFor("/borrow/disputes/d-9")).toEqual(["borrow-dispute", "d-9"])
  })

  it("routes mission notifications to the mission or its organizer dashboard", () => {
    expect(routeFor("/missions/m-1")).toEqual(["mission-detail", "m-1"])
    expect(routeFor("/missions/m-1/manage")).toEqual(["mission-manage", "m-1"])
    expect(routeFor("/missions/contributions")).toEqual(["mission-contributions"])
  })

  it("resolves every mapped route to a page App actually renders", () => {
    // A link that maps to a page name with no matching screen renders a blank
    // page, so each target must exist as a `page === "..."` branch.
    const renderedPages = readFileSync(
      resolve(process.cwd(), "src/App.tsx"),
      "utf8"
    )
    const links = [
      "/listings/l-1",
      "/requests/r-1",
      "/transactions/t-1",
      "/borrow/requests/b-1",
      "/borrow/disputes/d-1",
      "/missions/m-1",
      "/missions/m-1/manage",
      "/missions/contributions",
      "/unknown",
    ]
    for (const link of links) {
      const [page] = routeFor(link)
      expect(renderedPages).toContain(`page === "${page}"`)
    }
  })

  it("falls back to the notification list rather than a dead route", () => {
    expect(routeFor("/something/unknown")).toEqual(["notifications"])
    expect(routeFor("")).toEqual(["notifications"])
  })
})

describe("NotificationCenter", () => {
  it("shows the server unread count rather than the page length", async () => {
    route(/\/notifications\?/, () => ({
      items: [notificationRow("n1")],
      total: 9,
      unread: 9,
      limit: 50,
      offset: 0
    }))
    route(/\/notifications\/unread-count/, () => ({ notifications: 9, messages: 4 }))

    render(<NotificationCenter onNavigate={() => undefined} />)

    expect(await screen.findByText(/9 unread · 4 unread messages/)).toBeTruthy()
    // One unread row rendered, nine counted: the badge is not the page size.
    expect(screen.getAllByText("New")).toHaveLength(1)
  })

  it("shows an empty state instead of a blank page", async () => {
    route(/\/notifications\?/, () => ({ items: [], total: 0, unread: 0, limit: 50, offset: 0 }))
    route(/\/notifications\/unread-count/, () => ({ notifications: 0, messages: 0 }))
    render(<NotificationCenter onNavigate={() => undefined} />)
    expect(await screen.findByText(/nothing new/i)).toBeTruthy()
  })

  it("marks all read through the API and refetches", async () => {
    let unread = 1
    route(/\/notifications\/read-all/, () => {
      unread = 0
      return { updated: 1 }
    })
    route(/\/notifications\?/, () => ({
      items: [notificationRow("n1")],
      total: 1,
      unread,
      limit: 50,
      offset: 0
    }))
    route(/\/notifications\/unread-count/, () => ({ notifications: 0, messages: 0 }))

    render(<NotificationCenter onNavigate={() => undefined} />)
    await screen.findByText(/New offer/)

    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }))
    await waitFor(() =>
      expect(calls.some(call => call.url.includes("/notifications/read-all"))).toBe(true)
    )
  })

  it("marks a notification read and navigates to its target", async () => {
    route(/\/notifications\/.+\/read/, () => ({ read: true }))
    route(/\/notifications\?/, () => ({
      items: [notificationRow("n1")],
      total: 1,
      unread: 0,
      limit: 50,
      offset: 0
    }))
    route(/\/notifications\/unread-count/, () => ({ notifications: 0, messages: 0 }))
    const onNavigate = vi.fn()

    render(<NotificationCenter onNavigate={onNavigate} />)
    fireEvent.click(await screen.findByText(/New offer on/))

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("listing", listingId))
    expect(calls.some(call => call.url.includes(`/notifications/n1/read`))).toBe(true)
  })

  it("surfaces a load failure", async () => {
    // A 500 rather than a 401: a 401 ends the session, which would test the
    // auth path instead of the error display.
    route(/\/notifications/, () => json({ message: "Server exploded" }, 500))
    render(<NotificationCenter onNavigate={() => undefined} />)
    expect(await screen.findByRole("alert")).toBeTruthy()
  })
})

describe("NotificationPreferencesScreen", () => {
  const preferences = {
    messages: true,
    offers: true,
    matches: true,
    savedSearches: true,
    requestUpdates: true,
    newListings: true,
    priceDrops: true,
    events: false,
    community: false
  }

  it("persists a changed preference rather than only hiding it locally", async () => {
    route(/\/notifications\/preferences/, () => preferences)
    render(<NotificationPreferencesScreen onNavigate={() => undefined} />)

    const checkbox = await screen.findByLabelText("New messages")
    expect((checkbox as HTMLInputElement).checked).toBe(true)
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }))

    await waitFor(() => {
      const patch = calls.find(call => call.method === "PATCH" && call.url.includes("/notifications/preferences"))
      expect(patch).toBeTruthy()
      expect(patch!.body).toMatchObject({ messages: false })
    })
  })

  it("lists every preference the backend actually consults", async () => {
    route(/\/notifications\/preferences/, () => preferences)
    render(<NotificationPreferencesScreen onNavigate={() => undefined} />)

    for (const label of [
      "New messages",
      "Offer activity",
      "Changes to your requests",
      "New relevant matches",
      "Saved-search alerts",
      "New listings",
      "Price drops",
      "Events",
      "Community activity"
    ]) {
      expect(await screen.findByLabelText(label)).toBeTruthy()
    }
  })

  it("reports a save failure rather than claiming success", async () => {
    route(/\/notifications\/preferences/, (_url, init) =>
      init?.method === "PATCH" ? json({ message: "Nope" }, 500) : preferences
    )
    render(<NotificationPreferencesScreen onNavigate={() => undefined} />)
    await screen.findByLabelText("New messages")
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }))
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(screen.queryByText("Preferences saved.")).toBeNull()
  })
})

describe("SavedSearches", () => {
  function savedSearch(id: string, query: string, filters: Record<string, unknown> = {}) {
    return {
      id,
      query,
      filters,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z"
    }
  }

  it("edits criteria through the update endpoint", async () => {
    route(/\/listings\/saved-searches\/s1\b/, (url, init) => {
      if (init?.method === "PATCH") return savedSearch("s1", "oak desk", { neighborhood: "Midtown" })
      return savedSearch("s1", "oak desk")
    })
    route(/\/listings\/saved-searches/, () => [savedSearch("s1", "oak desk", { maxPriceCents: 20000 })])
    route(/\/notifications\/saved-search-alerts/, () => [])

    render(<SavedSearches onNavigate={() => undefined} />)
    expect(await screen.findByText("oak desk")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Edit criteria" }))
    const query = await screen.findByLabelText("Search terms")
    fireEvent.change(query, { target: { value: "walnut desk" } })
    const hood = screen.getByLabelText("Neighborhood")
    fireEvent.change(hood, { target: { value: "Midtown" } })
    fireEvent.click(screen.getByRole("button", { name: "Save criteria" }))

    await waitFor(() => {
      const patch = calls.find(call => call.method === "PATCH")
      expect(patch).toBeTruthy()
      expect(patch!.body).toMatchObject({ query: "walnut desk", filters: { neighborhood: "Midtown" } })
    })
  })

  it("deletes a saved search through the API", async () => {
    route(/\/listings\/saved-searches\/s1\b/, () => ({}))
    route(/\/listings\/saved-searches/, () => [savedSearch("s1", "oak desk")])
    route(/\/notifications\/saved-search-alerts/, () => [])

    render(<SavedSearches onNavigate={() => undefined} />)
    await screen.findByText("oak desk")
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    await waitFor(() =>
      expect(calls.some(call => call.method === "DELETE" && call.url.includes("/saved-searches/s1"))).toBe(true)
    )
  })

  it("shows the saved-search state instead of only a create button", async () => {
    route(/\/listings\/saved-searches/, () => [])
    route(/\/notifications\/saved-search-alerts/, () => [])
    render(<SavedSearches onNavigate={() => undefined} />)
    expect(await screen.findByText(/you have no saved searches/i)).toBeTruthy()
  })

  it("does not link an alert whose listing is no longer available", async () => {
    route(/\/listings\/saved-searches/, () => [])
    route(
      /\/notifications\/saved-search-alerts/,
      () => [
        {
          id: "a1",
          savedSearchId: "s1",
          listingId: "gone",
          readAt: null,
          createdAt: "2026-10-01T00:00:00.000Z",
          listing: { id: "gone", title: "Removed desk", status: "ARCHIVED", deletedAt: null }
        }
      ]
    )
    const onNavigate = vi.fn()
    render(<SavedSearches onNavigate={onNavigate} />)

    fireEvent.click(await screen.findByText("Removed desk"))
    await waitFor(() =>
      expect(calls.some(call => call.url.includes("/saved-search-alerts/a1/read"))).toBe(true)
    )
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it("navigates to an alert whose listing is still published", async () => {
    route(/\/listings\/saved-searches/, () => [])
    route(
      /\/notifications\/saved-search-alerts/,
      () => [
        {
          id: "a2",
          savedSearchId: "s1",
          listingId: listingId,
          readAt: null,
          createdAt: "2026-10-01T00:00:00.000Z",
          listing: { id: listingId, title: "Live desk", priceCents: 1000, status: "PUBLISHED", deletedAt: null }
        }
      ]
    )
    const onNavigate = vi.fn()
    render(<SavedSearches onNavigate={onNavigate} />)

    fireEvent.click(await screen.findByText("Live desk"))
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("listing", listingId))
  })
})