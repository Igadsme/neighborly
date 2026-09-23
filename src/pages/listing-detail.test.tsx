import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import ListingDetail from "./ListingDetail"

const sellerId = "22222222-2222-4222-8222-222222222222"
const categoryId = "33333333-3333-4333-8333-333333333333"
const listingId = "44444444-4444-4444-8444-444444444444"
const relatedId = "55555555-5555-4555-8555-555555555555"

const detail = {
  id: listingId,
  sellerId,
  categoryId,
  title: "Oak chair",
  description: "Solid oak dining chair with no stains.",
  priceCents: 65000,
  condition: "Like New",
  neighborhood: "Inman Park",
  city: "Atlanta",
  pickupAvailable: true,
  deliveryAvailable: false,
  shippingAvailable: false,
  latitude: 33.761111,
  longitude: -84.352222,
  createdAt: "2026-09-01T00:00:00.000Z",
  category: { id: categoryId, name: "Furniture", slug: "furniture" },
  seller: {
    id: sellerId,
    email: "ada@example.com",
    passwordHash: "secret-hash",
    profile: {
      displayName: "Ada L",
      firstName: "Ada",
      lastName: "Lovelace",
      neighborhood: "Inman Park",
      city: "Atlanta",
    },
  },
  images: [
    { url: "https://cdn.example.com/chair.jpg" },
    { objectKey: "listings/private-chair.jpg" },
  ],
}

const related = {
  ...detail,
  id: relatedId,
  title: "Walnut table",
  description: "Small walnut side table.",
  priceCents: 12000,
  images: [],
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

function listingRoutes(options: {
  detail?: unknown
  detailStatus?: number
  favorites?: unknown
  category?: unknown
  recent?: unknown
  favoriteResult?: unknown
  favoriteStatus?: number
  listFails?: boolean
  messageStatus?: number
  reportStatus?: number
  messageResult?: unknown
  messageBody?: { current: unknown }
  urls?: string[]
  holdMessage?: Promise<void>
}) {
  route(async (url, init) => {
    options.urls?.push(url)
    if (init?.method === "POST" && url.endsWith("/conversations")) {
      if (options.holdMessage) await options.holdMessage
      options.messageBody && (options.messageBody.current = init.body ? JSON.parse(String(init.body)) : null)
      const sent = options.messageBody?.current as { body?: string } | null
      return json(
        options.messageResult ?? {
          conversation: { id: "66666666-6666-4666-8666-666666666666" },
          message: {
            id: "77777777-7777-4777-8777-777777777777",
            conversationId: "66666666-6666-4666-8666-666666666666",
            senderId: "88888888-8888-4888-8888-888888888888",
            body: sent?.body ?? "",
            createdAt: "2026-09-23T18:00:00.000Z",
          },
          reused: false,
        },
        options.messageStatus ?? 201,
      )
    }
    if (init?.method === "POST" && url.includes("/safety/reports")) {
      options.messageBody && (options.messageBody.current = init.body ? JSON.parse(String(init.body)) : null)
      return json({ id: "report-1", status: "OPEN" }, options.reportStatus ?? 201)
    }
    if (init?.method === "POST" && url.includes("/favorite")) {
      return json(options.favoriteResult ?? { saved: true }, options.favoriteStatus ?? 200)
    }
    if (url.includes("/favorites")) return json(options.favorites ?? [])
    if (url.includes("/listings?")) {
      if (options.listFails) return Promise.reject(new Error("offline"))
      if (url.includes("categoryId=")) return json(options.category ?? [detail, related])
      return json(options.recent ?? [detail, related])
    }
    if (url.includes(`/listings/${listingId}`)) {
      return json(options.detail ?? detail, options.detailStatus ?? 200)
    }
    return json({ message: "unexpected" }, 500)
  })
}

async function sendListingMessage() {
  fireEvent.click(screen.getAllByRole("button", { name: "Message seller" })[0])
  fireEvent.click(screen.getByRole("button", { name: "Is this still available?" }))
  fireEvent.click(screen.getByRole("button", { name: /Send message/ }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

beforeEach(() => {
  window.localStorage.setItem("neighborly.access_token", "test-token")
})

describe("Listing detail", () => {
  it("loads the listing, seller, and related cards from the API", async () => {
    const onNavigate = vi.fn()
    listingRoutes({})
    render(<ListingDetail listingId={listingId} onNavigate={onNavigate} />)
    expect(screen.getByText("Loading listing…")).toBeTruthy()

    expect((await screen.findAllByText("Oak chair")).length).toBeGreaterThan(0)
    expect(screen.getAllByText("$650").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Like New").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Solid oak dining chair with no stains.").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Furniture").length).toBeGreaterThan(0)
    expect(screen.getByText("Inman Park, Atlanta · Nearby")).toBeTruthy()
    expect(screen.getByText("Available")).toBeTruthy()
    expect(screen.getAllByText("Ada L").length).toBeGreaterThan(0)
    expect(document.body.textContent).toContain("— views")
    expect(document.body.textContent).not.toContain("West Elm")
    expect(document.body.textContent).not.toContain("ada@example.com")
    expect(document.body.textContent).not.toContain("secret-hash")
    expect(document.body.textContent).not.toContain("Lovelace")
    expect(document.body.textContent).not.toContain("33.761111")
    expect(document.body.textContent).not.toContain("-84.352222")
    expect(document.body.textContent).not.toContain("private-chair")
    expect(screen.getByRole("img", { name: "Oak chair" }).getAttribute("src")).toBe(
      "https://cdn.example.com/chair.jpg",
    )

    expect(await screen.findByText("Walnut table")).toBeTruthy()
    fireEvent.click(screen.getByText("Walnut table"))
    expect(onNavigate).toHaveBeenCalledWith("listing", relatedId)

    fireEvent.click(screen.getByRole("button", { name: "View full profile" }))
    expect(onNavigate).toHaveBeenCalledWith("profile", sellerId)

    fireEvent.click(screen.getAllByRole("button", { name: "Message seller" })[0])
    const send = screen.getByRole("button", { name: /Send message/ }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Is this still available?" }))
    expect((screen.getByRole("button", { name: /Send message/ }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("persists a live listing message and only then shows the sent state", async () => {
    const onNavigate = vi.fn()
    const urls: string[] = []
    const messageBody = { current: null as unknown }
    let release: () => void = () => undefined
    const holdMessage = new Promise<void>((resolve) => {
      release = resolve
    })
    listingRoutes({
      urls,
      messageBody,
      holdMessage,
      messageResult: {
        conversation: { id: "66666666-6666-4666-8666-666666666666" },
        message: {
          id: "77777777-7777-4777-8777-777777777777",
          conversationId: "66666666-6666-4666-8666-666666666666",
          senderId: "88888888-8888-4888-8888-888888888888",
          body: "Is this still available?",
          createdAt: "2026-09-23T18:00:00.000Z",
        },
        reused: true,
      },
    })
    render(<ListingDetail listingId={listingId} onNavigate={onNavigate} />)
    expect(await screen.findByRole("button", { name: "Save" })).toBeTruthy()
    await sendListingMessage()
    expect(screen.queryByText("Message sent!")).toBeNull()
    expect(onNavigate.mock.calls.some((call) => call[0] === "messages")).toBe(false)
    release()
    expect(await screen.findByText("Message sent!")).toBeTruthy()
    expect(await screen.findByText("Redirecting to messages...")).toBeTruthy()
    expect(messageBody.current).toEqual({
      participantId: sellerId,
      listingId,
      body: "Is this still available?",
    })
    expect(urls.some((url) => url.includes("/notifications"))).toBe(false)
    expect(urls.some((url) => url.endsWith("/conversations"))).toBe(true)
    await vi.waitFor(
      () => {
        expect(onNavigate).toHaveBeenCalledWith("messages")
      },
      { timeout: 2500 },
    )
  })

  it("shows sign-in copy when creating a conversation returns 401", async () => {
    const onNavigate = vi.fn()
    const urls: string[] = []
    listingRoutes({
      urls,
      messageStatus: 401,
      messageResult: { message: "Unauthorized" },
    })
    render(<ListingDetail listingId={listingId} onNavigate={onNavigate} />)
    expect(await screen.findByRole("button", { name: "Save" })).toBeTruthy()
    await sendListingMessage()
    expect(await screen.findByText("Sign in to continue.")).toBeTruthy()
    expect(screen.queryByText("Message sent!")).toBeNull()
    expect(onNavigate.mock.calls.some((call) => call[0] === "messages")).toBe(false)
    expect(urls.some((url) => url.includes("/notifications"))).toBe(false)
  })

  it("keeps the modal on a failed create, including when the server would have reused a thread", async () => {
    const onNavigate = vi.fn()
    const urls: string[] = []
    listingRoutes({
      urls,
      messageStatus: 500,
      messageResult: { message: "Conversation create failed", reused: true },
    })
    render(<ListingDetail listingId={listingId} onNavigate={onNavigate} />)
    expect(await screen.findByRole("button", { name: "Save" })).toBeTruthy()
    await sendListingMessage()
    expect(await screen.findByText("Conversation create failed")).toBeTruthy()
    expect(screen.queryByText("Message sent!")).toBeNull()
    expect(onNavigate.mock.calls.some((call) => call[0] === "messages")).toBe(false)
    expect(urls.some((url) => url.includes("/notifications"))).toBe(false)
  })

  it("falls back to recent listings when the category has no other items", async () => {
    listingRoutes({ category: [detail], recent: [related] })
    render(<ListingDetail listingId={listingId} onNavigate={() => undefined} />)
    expect(await screen.findByText("Walnut table")).toBeTruthy()
    expect(screen.queryByText("No similar listings yet.")).toBeNull()
  })

  it("shows an empty similar strip when nothing else is published", async () => {
    listingRoutes({ category: [detail], recent: [detail] })
    render(<ListingDetail listingId={listingId} onNavigate={() => undefined} />)
    expect(await screen.findByText("No similar listings yet.")).toBeTruthy()
    expect(screen.getAllByText("Oak chair").length).toBeGreaterThan(0)
  })

  it("shows not-found copy and does not use fixture listings", async () => {
    listingRoutes({ detailStatus: 404, detail: { message: "Listing not found" } })
    render(<ListingDetail listingId={listingId} onNavigate={() => undefined} />)
    expect(await screen.findByText("Listing not found")).toBeTruthy()
    expect(screen.queryByText("West Elm Mid-Century Modern Sofa — Excellent Condition")).toBeNull()
  })

  it("shows an error when the listing request fails", async () => {
    route(() => Promise.reject(new Error("offline")))
    render(<ListingDetail listingId={listingId} onNavigate={() => undefined} />)
    expect(await screen.findByText("This listing could not be loaded.")).toBeTruthy()
    expect(screen.queryByText("Oak chair")).toBeNull()
  })

  it("toggles a favorite and surfaces sign-in copy on 401", async () => {
    const onNavigate = vi.fn()
    listingRoutes({ favoriteResult: { saved: true } })
    const { unmount } = render(<ListingDetail listingId={listingId} onNavigate={onNavigate} />)
    expect(await screen.findByRole("button", { name: "Save" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(await screen.findByRole("button", { name: "Saved" })).toBeTruthy()
    unmount()

    listingRoutes({ favoriteStatus: 401, favoriteResult: { message: "Unauthorized" } })
    render(<ListingDetail listingId={listingId} onNavigate={onNavigate} />)
    expect(await screen.findByRole("button", { name: "Save" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(await screen.findByText("Sign in to continue.")).toBeTruthy()
  })

  it("marks the heart saved when the listing is already a favorite", async () => {
    listingRoutes({
      favorites: [{ id: "fav-1", createdAt: "2026-09-02T00:00:00.000Z", listing: detail }],
    })
    render(<ListingDetail listingId={listingId} onNavigate={() => undefined} />)
    expect(await screen.findByRole("button", { name: "Saved" })).toBeTruthy()
  })

  it("submits a listing report from the existing control", async () => {
    const reportBody = { current: null as unknown }
    listingRoutes({ messageBody: reportBody })
    render(<ListingDetail listingId={listingId} onNavigate={() => undefined} />)
    expect(await screen.findByRole("button", { name: "Report this listing" })).toBeTruthy()
    fireEvent.click(screen.getAllByRole("button", { name: "Report this listing" })[0])
    expect((await screen.findAllByText("Report submitted.")).length).toBeGreaterThan(0)
    expect(reportBody.current).toEqual({ targetType: "LISTING", targetId: listingId, reason: "OTHER" })
  })

  it("keeps fixture reporting local", () => {
    vi.stubGlobal("fetch", vi.fn())
    render(<ListingDetail listingId="l1" onNavigate={() => undefined} />)
    fireEvent.click(screen.getAllByRole("button", { name: "Report this listing" })[0])
    expect(screen.getAllByText("Reporting isn't available yet.").length).toBeGreaterThan(0)
  })

  it("keeps fixture detail for non-uuid ids without calling the API", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    render(<ListingDetail listingId="l1" onNavigate={() => undefined} />)
    expect(screen.getAllByText("West Elm Mid-Century Modern Sofa — Excellent Condition").length).toBeGreaterThan(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("keeps the local sent state for a fixture listing and does not call the API", async () => {
    const onNavigate = vi.fn()
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    render(<ListingDetail listingId="l1" onNavigate={onNavigate} />)
    fireEvent.click(screen.getAllByRole("button", { name: "Message seller" })[0])
    fireEvent.change(screen.getByPlaceholderText("Ask about the item, availability, or suggest a meetup..."), {
      target: { value: "Is this still available?" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Send message/ }))
    expect(await screen.findByText("Message sent!")).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/notifications"))).toBe(false)
  })

  it("asks for a listing when no id is selected", () => {
    render(<ListingDetail listingId={null} onNavigate={() => undefined} />)
    expect(screen.getByText("Choose a listing to see its details.")).toBeTruthy()
  })

  it("keeps the listing visible when similar listings fail", async () => {
    listingRoutes({ listFails: true })
    render(<ListingDetail listingId={listingId} onNavigate={() => undefined} />)
    expect(await screen.findByText("Similar listings could not be loaded.")).toBeTruthy()
    expect(screen.getAllByText("Oak chair").length).toBeGreaterThan(0)
  })
})
