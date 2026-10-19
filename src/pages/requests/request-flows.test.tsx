import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import RequestFeed from "./RequestFeed"
import RequestForm from "./RequestForm"
import MyRequests from "./MyRequests"

const requestId = "11111111-1111-4111-8111-111111111111"

function requestRow(id: string, title: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title,
    description: "Looking for something useful nearby",
    status: "PUBLISHED",
    mode: "BUY",
    budgetCents: 20000,
    createdAt: "2026-10-01T00:00:00.000Z",
    offers: [],
    category: { id: "cat-1", name: "Furniture", slug: "furniture" },
    requester: { id: "user-1", profile: { firstName: "Ada", lastName: "L" } },
    ...overrides,
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
    headers: { "Content-Type": "application/json" },
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
      body: init?.body && typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    })
    const match = routes.find(entry => entry.test.test(url))
    if (!match) return json({ message: `unmocked ${url}` }, 501)
    // Awaited so a handler can hold the request open, which is how the
    // duplicate-submission test observes an in-flight submit.
    const body = await match.handler(url, init)
    if (body instanceof Response) return body
    if (typeof (body as { status?: unknown })?.status === "number") {
      const envelope = body as { status: number; body?: unknown }
      return json(envelope.body ?? {}, envelope.status)
    }
    return json(body ?? {})
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe("RequestFeed", () => {
  it("queries the server rather than filtering a page in the browser", async () => {
    route(/\/requests\?/, url => {
      const params = new URL(url, "http://x").searchParams
      const limit = Number(params.get("limit") ?? 24)
      const offset = Number(params.get("offset") ?? 0)
      const all = [
        requestRow("r1", "Oak desk"),
        requestRow("r2", "Bicycle"),
        requestRow("r3", "Childcare"),
      ]
      return { items: all.slice(offset, offset + limit), total: all.length, limit, offset }
    })
    render(<RequestFeed onNavigate={() => undefined} />)

    expect(await screen.findByText("Oak desk")).toBeTruthy()
    // The count comes from the server, not from the rendered page length.
    expect(screen.getByText("3")).toBeTruthy()
    const call = calls.at(-1)!
    expect(call.url).toContain("limit=12")
    expect(call.url).toContain("openOnly=true")
  })

  it("sends the search term as a query parameter only when submitted", async () => {
    route(/\/requests\?/, () => ({ items: [], total: 0, limit: 12, offset: 0 }))
    render(<RequestFeed onNavigate={() => undefined} />)
    await waitFor(() => expect(calls.length).toBeGreaterThan(0))

    const input = screen.getByLabelText("Search requests")
    fireEvent.change(input, { target: { value: "desk" } })
    expect(calls.every(call => !call.url.includes("query="))).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "Search" }))
    await waitFor(() => expect(calls.at(-1)!.url).toContain("query=desk"))
  })

  it("pages through results with the server, not by slicing", async () => {
    const all = Array.from({ length: 13 }, (_, index) =>
      requestRow(`r${index}`, `Request ${index}`),
    )
    route(/\/requests\?/, url => {
      const params = new URL(url, "http://x").searchParams
      const limit = Number(params.get("limit") ?? 12)
      const offset = Number(params.get("offset") ?? 0)
      return { items: all.slice(offset, offset + limit), total: all.length, limit, offset }
    })
    render(<RequestFeed onNavigate={() => undefined} />)
    await screen.findByText("Request 0")

    expect(screen.getByText("Page 1 of 2")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    expect(await screen.findByText("Request 12")).toBeTruthy()
    // Paging changes the query, so the second page is a different request.
    expect(calls.at(-1)!.url).toContain("offset=12")
  })

  it("shows an empty state rather than a blank page", async () => {
    route(/\/requests\?/, () => ({ items: [], total: 0, limit: 12, offset: 0 }))
    render(<RequestFeed onNavigate={() => undefined} />)
    expect(await screen.findByText(/no requests match those filters/i)).toBeTruthy()
  })

  it("surfaces a load error", async () => {
    route(/\/requests\?/, () => ({ status: 500, body: { message: "Server exploded" } }))
    render(<RequestFeed onNavigate={() => undefined} />)
    expect(await screen.findByRole("alert")).toBeTruthy()
  })
})

describe("RequestForm", () => {
  const categories = [{ id: "cat-1", name: "Furniture" }]

  it("blocks a submit before any API call when the title is too short", async () => {
    route(/\/requests$/, () => requestRow(requestId, "x"))
    render(<RequestForm categories={categories} onDone={() => undefined} onNavigate={() => undefined} />)

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "ab" } })
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "long enough here" } })
    fireEvent.click(screen.getByRole("button", { name: "Post request" }))

    expect(await screen.findByText(/at least 3 characters/i)).toBeTruthy()
    expect(calls.some(call => call.method === "POST")).toBe(false)
  })

  it("posts a valid request with the budget and structured requirements", async () => {
    route(/\/requests$/, () => requestRow(requestId, "Oak desk"))
    const onDone = vi.fn()
    render(<RequestForm categories={categories} onDone={onDone} onNavigate={() => undefined} />)

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Oak desk" } })
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Solid wood desk" } })
    fireEvent.change(screen.getByLabelText("Up to ($)"), { target: { value: "250" } })
    fireEvent.change(screen.getByLabelText("At least ($)"), { target: { value: "50" } })
    fireEvent.change(screen.getByLabelText("Neighborhood"), { target: { value: "Inman Park" } })
    fireEvent.change(screen.getByLabelText("How many?"), { target: { value: "2" } })
    fireEvent.click(screen.getByRole("button", { name: "Post request" }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    const post = calls.find(call => call.method === "POST")!
    expect(post.url).toContain("/requests")
    expect(post.body).toMatchObject({
      title: "Oak desk",
      budgetCents: 25000,
      minBudgetCents: 5000,
      neighborhood: "Inman Park",
      categoryId: "cat-1",
      publish: true,
    })
    expect((post.body as { requirements: { quantity: number } }).requirements.quantity).toBe(2)
  })

  it("rejects a minimum budget above the maximum before calling the API", async () => {
    route(/\/requests$/, () => requestRow(requestId, "x"))
    render(<RequestForm categories={categories} onDone={() => undefined} onNavigate={() => undefined} />)

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Oak desk" } })
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Solid wood desk" } })
    fireEvent.change(screen.getByLabelText("Up to ($)"), { target: { value: "50" } })
    fireEvent.change(screen.getByLabelText("At least ($)"), { target: { value: "500" } })
    fireEvent.click(screen.getByRole("button", { name: "Post request" }))

    expect(await screen.findByText(/cannot be higher/i)).toBeTruthy()
    expect(calls.some(call => call.method === "POST")).toBe(false)
  })

  it("saves a draft without publishing it", async () => {
    route(/\/requests\/drafts/, () => requestRow(requestId, "Draft", { status: "DRAFT" }))
    render(<RequestForm categories={categories} onDone={() => undefined} onNavigate={() => undefined} />)

    fireEvent.click(screen.getByRole("button", { name: "Save as draft" }))
    await waitFor(() => expect(calls.some(call => call.url.includes("/requests/drafts"))).toBe(true))
    const post = calls.find(call => call.url.includes("/drafts"))!
    expect((post.body as { publish: boolean }).publish).toBe(false)
  })

  it("prevents a duplicate submission while the first is in flight", async () => {
    let resolvePost: (value: Response) => void = () => undefined
    route(
      /\/requests$/,
      () =>
        new Promise<Response>(resolve => {
          resolvePost = resolve
        }),
    )
    render(<RequestForm categories={categories} onDone={() => undefined} onNavigate={() => undefined} />)

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Oak desk" } })
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Solid wood desk" } })
    const submit = screen.getByRole("button", { name: "Post request" })
    fireEvent.click(submit)

    // Both the submit and the draft button read "Saving…", so pick the
    // first disabled one and try to fire it again.
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Saving…" }).length).toBeGreaterThan(0)
    )
    for (const button of screen.getAllByRole("button", { name: "Saving…" })) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
      fireEvent.click(button)
    }
    expect(calls.filter(call => call.method === "POST")).toHaveLength(1)

    resolvePost(json(requestRow(requestId, "Oak desk"), 201))
    await waitFor(() => expect(calls.filter(call => call.method === "POST")).toHaveLength(1))
  })
})

describe("MyRequests", () => {
  it("filters by status through the API", async () => {
    route(/\/requests\/mine/, url =>
      url.includes("status=DRAFT")
        ? [requestRow("d1", "Draft item", { status: "DRAFT" })]
        : [requestRow("p1", "Live item")],
    )
    render(<MyRequests onNavigate={() => undefined} />)
    expect(await screen.findByText("Live item")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /^Drafts$/ }))
    expect(await screen.findByText("Draft item")).toBeTruthy()
    expect(calls.at(-1)!.url).toContain("status=DRAFT")
  })

  it("shows an empty state", async () => {
    route(/\/requests\/mine/, () => [])
    render(<MyRequests onNavigate={() => undefined} />)
    expect(await screen.findByText(/nothing here yet/i)).toBeTruthy()
  })
})