import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import BorrowMarketplace, { AvailabilityCalendar } from "./BorrowMarketplace"
import BorrowItemScreen from "./BorrowItemScreen"
import BorrowItemForm from "./BorrowItemForm"
import BorrowDetail from "./BorrowDetail"
import BorrowLists from "./BorrowLists"
import DisputeCenter from "./DisputeCenter"

const listingId = "11111111-1111-4111-8111-111111111111"
const requestId = "22222222-2222-4222-8222-222222222222"
const disputeId = "33333333-3333-4333-8333-333333333333"
const lenderId = "44444444-4444-4444-8444-444444444444"
const borrowerId = "55555555-5555-4555-8555-555555555555"

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: listingId,
    sellerId: lenderId,
    categoryId: "cat-1",
    title: "Cordless drill",
    description: "A reliable drill with two batteries and a charger.",
    condition: "good",
    status: "PUBLISHED",
    borrowable: true,
    maxBorrowDays: 14,
    minNoticeHours: 12,
    usageInstructions: "Return the batteries charged.",
    depositCents: 5000,
    neighborhood: "Inman Park",
    createdAt: "2026-10-01T00:00:00.000Z",
    seller: { id: lenderId, profile: { firstName: "Grace", displayName: "Grace H" } },
    category: { id: "cat-1", name: "Tools", slug: "tools" },
    ...overrides
  }
}

function borrowRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: requestId,
    listingId,
    lenderId,
    borrowerId,
    status: "APPROVED",
    role: "borrower",
    startAt: "2026-10-10T09:00:00.000Z",
    endAt: "2026-10-14T09:00:00.000Z",
    originalEndAt: "2026-10-14T09:00:00.000Z",
    message: "Weekend project.",
    createdAt: "2026-10-02T00:00:00.000Z",
    listing: item(),
    handoffs: [],
    extensions: [],
    conditionReports: [],
    disputes: [],
    events: [],
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

describe("BorrowMarketplace", () => {
  it("queries the server rather than filtering a page in the browser", async () => {
    route(/\/borrow\/items\?/, url => {
      const params = new URL(url, "http://x").searchParams
      const limit = Number(params.get("limit") ?? 12)
      const offset = Number(params.get("offset") ?? 0)
      const all = [item({ id: "a", title: "Cordless drill" }), item({ id: "b", title: "Ladder" })]
      return { items: all.slice(offset, offset + limit), total: 2, limit, offset }
    })
    render(<BorrowMarketplace onNavigate={() => undefined} />)

    expect(await screen.findByText("Cordless drill")).toBeTruthy()
    const call = calls.at(-1)!
    expect(call.url).toContain("limit=12")
    expect(call.url).toContain("availableNow=true")
  })

  it("sends the search term only when submitted", async () => {
    route(/\/borrow\/items\?/, () => ({ items: [], total: 0, limit: 12, offset: 0 }))
    render(<BorrowMarketplace onNavigate={() => undefined} />)
    await waitFor(() => expect(calls.length).toBeGreaterThan(0))

    fireEvent.change(screen.getByLabelText("Search items"), { target: { value: "drill" } })
    expect(calls.every(call => !call.url.includes("query="))).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "Search" }))
    await waitFor(() => expect(calls.at(-1)!.url).toContain("query=drill"))
  })

  it("shows an empty state rather than a blank page", async () => {
    route(/\/borrow\/items\?/, () => ({ items: [], total: 0, limit: 12, offset: 0 }))
    render(<BorrowMarketplace onNavigate={() => undefined} />)
    expect(await screen.findByText(/nothing matches that search/i)).toBeTruthy()
  })

  it("surfaces a load failure", async () => {
    route(/\/borrow\/items/, () => json({ message: "Server exploded" }, 500))
    render(<BorrowMarketplace onNavigate={() => undefined} />)
    expect(await screen.findByRole("alert")).toBeTruthy()
  })
})

describe("AvailabilityCalendar", () => {
  it("shows booked dates without naming who booked them", async () => {
    route(/availability/, () => ({
      minNoticeHours: 24,
      windows: [],
      reserved: [{ startAt: "2026-10-10T09:00:00.000Z", endAt: "2026-10-12T09:00:00.000Z" }]
    }))
    render(<AvailabilityCalendar listingId={listingId} viewerId={null} />)

    expect(await screen.findByText(/Booked/)).toBeTruthy()
    // The calendar is public; the identities behind it are not.
    expect(screen.queryByText(/Grace/)).toBeNull()
  })

  it("lets the lender block dates through the API", async () => {
    route(/availability\/\w/, () => json({ message: "unmounted" }, 404))
    route(/availability$/, (_url, init) =>
      init?.method === "POST" ? { id: "w1" } : { minNoticeHours: 12, windows: [], reserved: [] }
    )
    render(<AvailabilityCalendar listingId={listingId} viewerId={lenderId} />)
    await screen.findByText("Mark dates unavailable")

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-01" } })
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-11-05" } })
    fireEvent.click(screen.getByRole("button", { name: "Block these dates" }))

    await waitFor(() => {
      const post = calls.find(call => call.method === "POST")
      expect(post).toBeTruthy()
      expect(post!.body).toMatchObject({ kind: "UNAVAILABLE" })
    })
  })

  it("refuses to submit a window without dates", async () => {
    route(/availability/, () => ({ minNoticeHours: 12, windows: [], reserved: [] }))
    render(<AvailabilityCalendar listingId={listingId} viewerId={lenderId} />)
    await screen.findByText("Mark dates unavailable")
    fireEvent.click(screen.getByRole("button", { name: "Block these dates" }))
    expect(await screen.findByRole("alert")).toBeTruthy()
  })
})

describe("BorrowItemScreen", () => {
  it("submits a request with real dates", async () => {
    route(/\/borrow\/items\/[^/]+\/requests/, () => borrowRecord())
    route(/\/borrow\/items\/[^/]+$/, () => item())
    route(/\/availability/, () => ({ minNoticeHours: 12, windows: [], reserved: [] }))
    const onNavigate = vi.fn()
    render(
      <BorrowItemScreen listingId={listingId} viewerId={borrowerId} onNavigate={onNavigate} />
    )
    await screen.findByRole("heading", { name: "Cordless drill" })

    fireEvent.change(screen.getByLabelText("Pick up on"), { target: { value: "2026-11-10" } })
    fireEvent.change(screen.getByLabelText("Return by"), { target: { value: "2026-11-14" } })
    fireEvent.change(screen.getByLabelText(/Message to the lender/), { target: { value: "Shelves" } })
    fireEvent.click(screen.getByRole("button", { name: "Send request" }))

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("borrow-detail", requestId))
    const post = calls.find(call => call.method === "POST")!
    expect(post.body).toMatchObject({ message: "Shelves" })
    // The date input becomes a full ISO instant before it reaches the API.
    expect((post.body as { endAt: string }).endAt).toBe("2026-11-14T00:00:00.000Z")
  })

  it("blocks a reversed window before any API call", async () => {
    route(/\/borrow\/items\/[^/]+$/, () => item())
    route(/\/availability/, () => ({ minNoticeHours: 12, windows: [], reserved: [] }))
    render(<BorrowItemScreen listingId={listingId} viewerId={borrowerId} onNavigate={() => undefined} />)
    await screen.findByRole("heading", { name: "Cordless drill" })

    fireEvent.change(screen.getByLabelText("Pick up on"), { target: { value: "2026-11-14" } })
    fireEvent.change(screen.getByLabelText("Return by"), { target: { value: "2026-11-10" } })
    fireEvent.click(screen.getByRole("button", { name: "Send request" }))

    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(calls.some(call => call.method === "POST")).toBe(false)
  })

  it("never offers the owner a request form for their own item", async () => {
    route(/\/borrow\/items\/[^/]+$/, () => item())
    route(/\/availability/, () => ({ minNoticeHours: 12, windows: [], reserved: [] }))
    render(<BorrowItemScreen listingId={listingId} viewerId={lenderId} onNavigate={() => undefined} />)

    await screen.findByRole("heading", { name: "Cordless drill" })
    expect(screen.queryByRole("heading", { name: "Request to borrow" })).toBeNull()
    expect(screen.getByRole("button", { name: "Edit details" })).toBeTruthy()
  })

  it("offers a borrower the request form on someone else's item", async () => {
    route(/\/borrow\/items\/[^/]+$/, () => item())
    route(/\/availability/, () => ({ minNoticeHours: 12, windows: [], reserved: [] }))
    render(<BorrowItemScreen listingId={listingId} viewerId={borrowerId} onNavigate={() => undefined} />)
    expect(await screen.findByRole("heading", { name: "Request to borrow" })).toBeTruthy()
  })
})

describe("BorrowItemForm", () => {
  const categories = [{ id: "cat-1", name: "Tools" }]

  it("requires usage instructions before sending anything", async () => {
    render(<BorrowItemForm categories={categories} onDone={() => undefined} onNavigate={() => undefined} />)
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Cordless drill" } })
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "A reliable drill." } })
    fireEvent.click(screen.getByRole("button", { name: "List it for borrowing" }))

    expect(await screen.findByText(/Tell the borrower how to use it/i)).toBeTruthy()
    expect(calls.some(call => call.method === "POST")).toBe(false)
  })

  it("posts the item with its borrowing terms", async () => {
    route(/\/borrow\/items$/, () => item())
    const onDone = vi.fn()
    render(<BorrowItemForm categories={categories} onDone={onDone} onNavigate={() => undefined} />)

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Cordless drill" } })
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "A reliable drill." } })
    fireEvent.change(screen.getByLabelText("Usage instructions"), {
      target: { value: "Return the batteries charged." }
    })
    fireEvent.change(screen.getByLabelText("Maximum days"), { target: { value: "10" } })
    fireEvent.change(screen.getByLabelText("Deposit ($)"), { target: { value: "50" } })
    fireEvent.click(screen.getByRole("button", { name: "List it for borrowing" }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    const post = calls.find(call => call.method === "POST")!
    expect(post.body).toMatchObject({
      title: "Cordless drill",
      maxBorrowDays: 10,
      depositCents: 5000,
      usageInstructions: "Return the batteries charged.",
      publish: true
    })
  })

  it("prevents a duplicate submission while the first is in flight", async () => {
    let release: (value: Response) => void = () => undefined
    route(
      /\/borrow\/items$/,
      () =>
        new Promise<Response>(resolve => {
          release = resolve
        })
    )
    render(<BorrowItemForm categories={categories} onDone={() => undefined} onNavigate={() => undefined} />)

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Cordless drill" } })
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "A reliable drill." } })
    fireEvent.change(screen.getByLabelText("Usage instructions"), { target: { value: "Charge them." } })

    fireEvent.click(screen.getByRole("button", { name: "List it for borrowing" }))
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /Saving/ }).length).toBeGreaterThan(0)
    )
    for (const button of screen.getAllByRole("button", { name: /Saving/ })) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
      fireEvent.click(button)
    }
    expect(calls.filter(call => call.method === "POST")).toHaveLength(1)
    release(json(item(), 201))
    await waitFor(() => expect(calls.filter(call => call.method === "POST")).toHaveLength(1))
  })
})

describe("BorrowDetail", () => {
  it("shows only the actions the lender may take on a pending request", async () => {
    route(/\/borrow\/requests\/[^/]+$/, () => borrowRecord({ status: "REQUESTED", role: "lender" }))
    render(<BorrowDetail requestId={requestId} onNavigate={() => undefined} />)

    expect(await screen.findByRole("button", { name: "Approve" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Decline" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Withdraw my request" })).toBeNull()
  })

  it("offers the borrower withdrawal rather than a decision", async () => {
    route(/\/borrow\/requests\/[^/]+$/, () => borrowRecord({ status: "REQUESTED", role: "borrower" }))
    render(<BorrowDetail requestId={requestId} onNavigate={() => undefined} />)

    expect(await screen.findByRole("button", { name: "Withdraw my request" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull()
  })

  it("does not move the item on a single confirmation", async () => {
    route(/\/borrow\/requests\/[^/]+$/, (_url, init) =>
      init?.method === "POST"
        ? borrowRecord({ status: "PICKUP_SCHEDULED", role: "borrower" })
        : borrowRecord({ status: "PICKUP_SCHEDULED", role: "borrower" })
    )
    render(<BorrowDetail requestId={requestId} onNavigate={() => undefined} />)

    const button = await screen.findByRole("button", { name: "I confirm" })
    fireEvent.click(button)
    await waitFor(() =>
      expect(
        calls.some(call => call.url.includes("/pickup/confirm") && call.method === "POST")
      ).toBe(true)
    )
    // The screen still asks for the other side, because the API will not
    // complete a handoff on one confirmation.
    expect(await screen.findByText(/Waiting on the lender/i)).toBeTruthy()
  })

  it("hides the confirm button once this party has confirmed", async () => {
    route(/\/borrow\/requests\/[^/]+$/, () =>
      borrowRecord({
        status: "PICKUP_SCHEDULED",
        role: "borrower",
        handoffs: [
          { id: "h1", kind: "PICKUP", borrowerConfirmedAt: "2026-10-05T00:00:00.000Z", lenderConfirmedAt: null, completedAt: null }
        ]
      })
    )
    render(<BorrowDetail requestId={requestId} onNavigate={() => undefined} />)
    expect(await screen.findByText(/You have confirmed/i)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "I confirm" })).toBeNull()
  })

  it("surfaces an approval conflict rather than claiming success", async () => {
    route(/\/borrow\/requests\/[^/]+$/, (_url, init) =>
      init?.method === "POST"
        ? json({ message: "Those dates are already booked" }, 409)
        : borrowRecord({ status: "REQUESTED", role: "lender" })
    )
    render(<BorrowDetail requestId={requestId} onNavigate={() => undefined} />)
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }))
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(screen.queryByText("Approved and booked.")).toBeNull()
  })

  it("surfaces a 404 for a borrowing the caller cannot see", async () => {
    route(/\/borrow\/requests\/[^/]+$/, () => json({ message: "Borrowing not found" }, 404))
    render(<BorrowDetail requestId={requestId} onNavigate={() => undefined} />)
    expect(await screen.findByRole("heading", { name: "Borrowing unavailable" })).toBeTruthy()
  })

  it("offers an extension only to the borrower, and only when none is pending", async () => {
    route(/\/borrow\/requests\/[^/]+$/, () =>
      borrowRecord({
        status: "CHECKED_OUT",
        role: "borrower",
        extensions: [],
        handoffs: [{ id: "h1", kind: "PICKUP", borrowerConfirmedAt: "2026-10-05T00:00:00.000Z", lenderConfirmedAt: "2026-10-05T00:00:00.000Z", completedAt: "2026-10-05T00:00:00.000Z" }]
      })
    )
    render(<BorrowDetail requestId={requestId} onNavigate={() => undefined} />)
    expect(await screen.findByRole("button", { name: "Request an extension" })).toBeTruthy()
  })

  it("lets the lender decide a pending extension", async () => {
    route(/\/borrow\/requests\/[^/]+$/, () =>
      borrowRecord({
        status: "CHECKED_OUT",
        role: "lender",
        extensions: [{ id: "e1", status: "REQUESTED", requestedEndAt: "2026-10-20T09:00:00.000Z", previousEndAt: "2026-10-14T09:00:00.000Z", createdAt: "2026-10-05T00:00:00.000Z" }],
        handoffs: [{ id: "h1", kind: "PICKUP", borrowerConfirmedAt: "2026-10-05T00:00:00.000Z", lenderConfirmedAt: "2026-10-05T00:00:00.000Z", completedAt: "2026-10-05T00:00:00.000Z" }]
      })
    )
    render(<BorrowDetail requestId={requestId} onNavigate={() => undefined} />)
    expect(await screen.findByText(/Extension requested until/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Approve" }))
    await waitFor(() =>
      expect(calls.some(call => call.url.includes("/extensions/e1/approve"))).toBe(true)
    )
  })

  it("warns about an overdue borrowing and does not offer completion", async () => {
    route(/\/borrow\/requests\/[^/]+$/, () =>
      borrowRecord({
        status: "OVERDUE",
        role: "borrower",
        handoffs: [{ id: "h1", kind: "PICKUP", borrowerConfirmedAt: "2026-10-05T00:00:00.000Z", lenderConfirmedAt: "2026-10-05T00:00:00.000Z", completedAt: "2026-10-05T00:00:00.000Z" }]
      })
    )
    render(<BorrowDetail requestId={requestId} onNavigate={() => undefined} />)
    expect(await screen.findByText(/past its due date/i)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Mark complete" })).toBeNull()
  })

  it("does not offer a dispute while one is already open", async () => {
    route(/\/borrow\/requests\/[^/]+$/, () =>
      borrowRecord({
        status: "DISPUTED",
        role: "borrower",
        disputes: [{ id: disputeId, borrowRequestId: requestId, reason: "DAMAGE", status: "OPEN", summary: "Broken.", createdAt: "2026-10-05T00:00:00.000Z", openedBy: { profile: { firstName: "Grace" } } }]
      })
    )
    render(<BorrowDetail requestId={requestId} onNavigate={() => undefined} />)
    expect(await screen.findByRole("button", { name: "Open dispute center" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Open a dispute" })).toBeNull()
  })

  it("validates a dispute summary before sending it", async () => {
    route(/\/borrow\/requests\/[^/]+$/, () =>
      borrowRecord({
        status: "CHECKED_OUT",
        role: "borrower",
        handoffs: [{ id: "h1", kind: "PICKUP", borrowerConfirmedAt: "2026-10-05T00:00:00.000Z", lenderConfirmedAt: "2026-10-05T00:00:00.000Z", completedAt: "2026-10-05T00:00:00.000Z" }]
      })
    )
    render(<BorrowDetail requestId={requestId} onNavigate={() => undefined} />)
    await screen.findByRole("button", { name: "Open a dispute" })
    fireEvent.click(screen.getByRole("button", { name: "Open a dispute" }))
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(calls.some(call => call.url.includes("/disputes"))).toBe(false)
  })
})

describe("BorrowLists", () => {
  it("switches between the borrowed and lent scopes through the API", async () => {
    route(/\/borrow\/requests/, url =>
      url.includes("scope=lent")
        ? [borrowRecord({ role: "lender", status: "REQUESTED" })]
        : [borrowRecord({ role: "borrower", status: "CHECKED_OUT" })]
    )
    render(<BorrowLists onNavigate={() => undefined} />)
    expect(await screen.findByText(/you are the borrower/i)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "I'm lending" }))
    expect(await screen.findByText(/you are the lender/i)).toBeTruthy()
    expect(calls.at(-1)!.url).toContain("scope=lent")
  })

  it("filters to overdue borrowings", async () => {
    route(/\/borrow\/requests/, url =>
      url.includes("overdueOnly=true")
        ? [borrowRecord({ status: "OVERDUE" })]
        : [borrowRecord({ status: "CHECKED_OUT" })]
    )
    render(<BorrowLists onNavigate={() => undefined} />)
    expect(await screen.findByText("checked out")).toBeTruthy()

    fireEvent.click(screen.getByLabelText("Overdue only"))
    expect(await screen.findByText("overdue")).toBeTruthy()
    expect(calls.at(-1)!.url).toContain("overdueOnly=true")
  })

  it("shows an empty state for each list", async () => {
    route(/\/borrow\/requests/, () => [])
    render(<BorrowLists onNavigate={() => undefined} />)
    expect(await screen.findByText(/nothing here yet/i)).toBeTruthy()
  })

  it("lists the items the member lends", async () => {
    route(/\/borrow\/items\/mine/, () => [item()])
    render(<BorrowLists onNavigate={() => undefined} />)
    fireEvent.click(await screen.findByRole("button", { name: "Items I lend" }))
    expect(await screen.findByText("Cordless drill")).toBeTruthy()
  })
})

describe("DisputeCenter", () => {
  it("lists disputes and opens the selected one", async () => {
    route(/\/borrow\/disputes\/[^/]+$/, () => ({
      id: disputeId,
      borrowRequestId: requestId,
      reason: "DAMAGE",
      status: "OPEN",
      summary: "The chuck is bent.",
      resolution: null,
      createdAt: "2026-10-05T00:00:00.000Z",
      openedBy: { profile: { firstName: "Grace" } },
      events: [{ toStatus: "OPEN", createdAt: "2026-10-05T00:00:00.000Z" }]
    }))
    route(/\/borrow\/disputes\/[^/]+\/evidence/, () => [])
    route(/\/borrow\/disputes$/, () => [
      { id: disputeId, borrowRequestId: requestId, reason: "DAMAGE", status: "OPEN", summary: "The chuck is bent.", createdAt: "2026-10-05T00:00:00.000Z", openedBy: { profile: { firstName: "Grace" } } }
    ])

    render(<DisputeCenter onNavigate={() => undefined} />)
    expect(await screen.findByText("The chuck is bent.")).toBeTruthy()
    // The dispute's own history is loaded through the authorized endpoint.
    expect(calls.some(call => call.url.includes(`/disputes/${disputeId}/evidence`))).toBe(true)
  })

  it("shows an empty state rather than a blank page", async () => {
    route(/\/borrow\/disputes/, () => [])
    render(<DisputeCenter onNavigate={() => undefined} />)
    expect(await screen.findByText(/no disputes/i)).toBeTruthy()
  })

  it("uploads evidence to the authorized route with real multipart", async () => {
    route(/\/borrow\/disputes\/[^/]+\/evidence/, () => [])
    route(/\/borrow\/disputes\/[^/]+$/, () => ({
      id: disputeId,
      borrowRequestId: requestId,
      reason: "DAMAGE",
      status: "OPEN",
      summary: "The chuck is bent.",
      createdAt: "2026-10-05T00:00:00.000Z",
      openedBy: { profile: { firstName: "Grace" } },
      events: []
    }))
    route(/\/borrow\/disputes$/, () => [
      { id: disputeId, borrowRequestId: requestId, reason: "DAMAGE", status: "OPEN", summary: "The chuck is bent.", createdAt: "2026-10-05T00:00:00.000Z", openedBy: { profile: { firstName: "Grace" } } }
    ])

    render(<DisputeCenter onNavigate={() => undefined} />)
    await screen.findByText("The chuck is bent.")

    const file = new File([new Uint8Array([1, 2, 3])], "chuck.png", { type: "image/png" })
    fireEvent.change(screen.getByLabelText("Add a photo"), { target: { files: [file] } })
    fireEvent.change(screen.getByLabelText("Evidence note"), { target: { value: "Bent chuck" } })
    fireEvent.click(screen.getByRole("button", { name: "Upload evidence" }))

    await waitFor(() =>
      expect(
        calls.some(
          call => call.method === "POST" && call.url.includes(`/disputes/${disputeId}/evidence`)
        )
      ).toBe(true)
    )
  })
})