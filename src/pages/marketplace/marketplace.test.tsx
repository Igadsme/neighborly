import { readFileSync } from "node:fs"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import MyListings from "./MyListings"
import CreateListingFlow from "./CreateListingFlow"
import ImageManager, { ACCEPTED_IMAGE_TYPES } from "../../components/listing/ImageManager"

const listingId = "11111111-1111-4111-8111-111111111111"

function listing(id: string, title: string, status: string) {
  return {
    id,
    sellerId: "seller-1",
    categoryId: "cat-1",
    title,
    description: "A description long enough to pass validation",
    priceCents: 4500,
    condition: "good",
    status,
    neighborhood: "Inman Park",
    city: "Atlanta",
    createdAt: "2026-10-01T00:00:00.000Z",
    images: [],
    category: { id: "cat-1", name: "Furniture", slug: "furniture" },
    seller: { id: "seller-1", profile: { firstName: "Ada", lastName: "L" } },
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

function installFetch() {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({
      method: init?.method ?? "GET",
      url,
      body: init?.body && typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    })
    const match = routes.find(entry => entry.test.test(url))
    if (!match) return json({ message: `unmocked ${url}` }, 501)
    const body = match.handler(url, init)
    if (body instanceof Response) return body
    // An envelope is only an envelope when `status` is numeric; a listing
    // row also has a `status` field, and must not be mistaken for one.
    if (typeof (body as { status?: unknown })?.status === "number") {
      const envelope = body as { status: number; body?: unknown }
      return json(envelope.body ?? {}, envelope.status)
    }
    return json(body ?? {})
  })
}

beforeEach(() => {
  calls = []
  routes = []
  window.localStorage.setItem("neighborly.access_token", "test-token")
  installFetch()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe("MyListings", () => {
  it("loads the owner's listings and filters by status", async () => {
    route(/\/listings\/mine/, url =>
      url.includes("status=ARCHIVED")
        ? [listing(listingId, "Archived lamp", "ARCHIVED")]
        : [listing("22222222-2222-4222-8222-222222222222", "Live desk", "PUBLISHED")],
    )
    render(<MyListings onNavigate={() => undefined} />)

    expect(await screen.findByText("Live desk")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /^Archived$/ }))

    await waitFor(() => expect(screen.getByText("Archived lamp")).toBeTruthy())
    const mineCalls = calls.filter(call => call.url.includes("/listings/mine"))
    expect(mineCalls.at(-1)?.url).toContain("status=ARCHIVED")
  })

  it("shows an empty state rather than a blank list", async () => {
    route(/\/listings\/mine/, () => [])
    render(<MyListings onNavigate={() => undefined} />)
    expect(await screen.findByText(/no listings here yet/i)).toBeTruthy()
  })

  it("offers only the transitions legal from the current status", async () => {
    route(/\/listings\/mine/, () => [
      listing("33333333-3333-4333-8333-333333333333", "Draft item", "DRAFT"),
      listing("44444444-4444-4444-8444-444444444444", "Sold item", "SOLD"),
    ])
    render(<MyListings onNavigate={() => undefined} />)
    await screen.findByText("Draft item")

    const draftRow = screen.getByText("Draft item").closest("li") as HTMLElement
    expect(within(draftRow).getByRole("button", { name: "Publish" })).toBeTruthy()
    expect(within(draftRow).queryByRole("button", { name: "Restore" })).toBeNull()

    const soldRow = screen.getByText("Sold item").closest("li") as HTMLElement
    // A sold listing is terminal, so it offers no state change at all.
    expect(within(soldRow).queryByRole("button", { name: "Publish" })).toBeNull()
    expect(within(soldRow).queryByRole("button", { name: "Restore" })).toBeNull()
  })

  it("publishes a draft and reloads the list", async () => {
    route(/\/listings\/mine/, () => [listing("55555555-5555-4555-8555-555555555555", "Draft to publish", "DRAFT")])
    route(/\/publish/, () => listing("55555555-5555-4555-8555-555555555555", "Draft to publish", "PUBLISHED"))
    render(<MyListings onNavigate={() => undefined} />)

    const row = (await screen.findByText("Draft to publish")).closest("li") as HTMLElement
    fireEvent.click(within(row).getByRole("button", { name: "Publish" }))

    await waitFor(() =>
      expect(calls.some(call => call.method === "POST" && call.url.includes("/publish"))).toBe(true)
    )
  })

  it("restores an archived listing", async () => {
    route(/\/listings\/mine\?status=ARCHIVED/, () => [
      listing("66666666-6666-4666-8666-666666666666", "Archived rug", "ARCHIVED"),
    ])
    route(/\/restore/, () => listing("66666666-6666-4666-8666-666666666666", "Archived rug", "PUBLISHED"))
    render(<MyListings onNavigate={() => undefined} />)

    fireEvent.click(await screen.findByRole("button", { name: /^Archived$/ }))
    const row = (await screen.findByText("Archived rug")).closest("li") as HTMLElement
    fireEvent.click(within(row).getByRole("button", { name: "Restore" }))

    await waitFor(() =>
      expect(calls.some(call => call.method === "POST" && call.url.includes("/restore"))).toBe(true)
    )
  })

  it("refuses a transition the API rejects and surfaces the reason", async () => {
    route(/\/listings\/mine/, () => [listing("77777777-7777-4777-8777-777777777777", "Draft item", "DRAFT")])
    route(/\/publish/, () => ({ status: 400, body: { message: "Add a title and description before publishing." } }))
    render(<MyListings onNavigate={() => undefined} />)

    const row = (await screen.findByText("Draft item")).closest("li") as HTMLElement
    fireEvent.click(within(row).getByRole("button", { name: "Publish" }))

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Add a title and description")
  })

  it("does not delete until the confirmation is accepted", async () => {
    route(/\/listings\/mine/, () => [listing("88888888-8888-4888-8888-888888888888", "Keep me", "PUBLISHED")])
    const confirmSpy = vi.fn().mockReturnValue(false)
    Object.defineProperty(window, "confirm", { value: confirmSpy, configurable: true, writable: true })
    render(<MyListings onNavigate={() => undefined} />)

    const row = (await screen.findByText("Keep me")).closest("li") as HTMLElement
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }))

    expect(confirmSpy).toHaveBeenCalled()
    expect(calls.some(call => call.url.includes("/permanent"))).toBe(false)
    confirmSpy.mockRestore()
  })
})

describe("CreateListingFlow", () => {
  const categories = [
    { id: "c-furniture", name: "Furniture", slug: "furniture" },
    { id: "c-housing", name: "Housing", slug: "housing" },
    { id: "c-jobs", name: "Jobs", slug: "jobs" },
    { id: "c-services", name: "Services", slug: "services" },
  ]

  it("routes a general listing to the marketplace endpoint", async () => {
    route(/\/listings$/, () => listing(listingId, "Oak chair", "PUBLISHED"))
    render(<CreateListingFlow categories={categories} onDone={() => undefined} onNavigate={() => undefined} />)

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Oak chair" } })
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Solid oak dining chair" } })
    fireEvent.click(screen.getByRole("button", { name: "Post listing" }))

    await waitFor(() => expect(calls.some(call => call.method === "POST" && call.url.endsWith("/listings"))).toBe(true))
    const create = calls.find(call => call.method === "POST")!
    expect(create.body).toMatchObject({ title: "Oak chair", categoryId: "c-furniture" })
  })

  it("routes housing to the housing contract, never to the generic endpoint", async () => {
    route(/\/housing$/, () => ({ id: listingId, title: "Sunny 2BR" }))
    render(<CreateListingFlow categories={categories} onDone={() => undefined} onNavigate={() => undefined} />)

    fireEvent.click(screen.getByRole("button", { name: /rent, lease, or list a property/i }))
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Sunny 2BR" } })
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Bright two bedroom near the park" } })
    fireEvent.click(screen.getByRole("button", { name: /^post housing$/i }))

    await waitFor(() => expect(calls.some(call => call.url.endsWith("/housing"))).toBe(true))
    // The generic marketplace endpoint must never receive a housing listing.
    expect(calls.some(call => call.method === "POST" && call.url.endsWith("/listings"))).toBe(false)
    const create = calls.find(call => call.url.endsWith("/housing"))!
    expect(create.body).toMatchObject({ type: "Apartment", listingType: "rent" })
  })

  it("routes jobs and services to their own contracts", async () => {
    route(/\/jobs$/, () => ({ id: listingId, title: "Barista" }))
    route(/\/services$/, () => ({ id: listingId, title: "Deep clean" }))
    render(<CreateListingFlow categories={categories} onDone={() => undefined} onNavigate={() => undefined} />)

    fireEvent.click(screen.getByRole("button", { name: /post a role for local candidates/i }))
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Barista" } })
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Three mornings a week downtown" } })
    fireEvent.change(screen.getByLabelText("Company"), { target: { value: "Corner Coffee" } })
    fireEvent.click(screen.getByRole("button", { name: /^post jobs$/i }))
    await waitFor(() => expect(calls.some(call => call.url.endsWith("/jobs"))).toBe(true))

    fireEvent.click(screen.getByRole("button", { name: /offer a local service/i }))
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Deep clean" } })
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Whole home cleaning, eco products" } })
    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Ada Home Care" } })
    fireEvent.click(screen.getByRole("button", { name: /^post services$/i }))
    await waitFor(() => expect(calls.some(call => call.url.endsWith("/services"))).toBe(true))
  })

  it("blocks a submit before the API is called when the form is invalid", async () => {
    route(/\/listings$/, () => listing(listingId, "x", "PUBLISHED"))
    render(<CreateListingFlow categories={categories} onDone={() => undefined} onNavigate={() => undefined} />)

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "ab" } })
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "long enough here" } })
    fireEvent.click(screen.getByRole("button", { name: "Post listing" }))

    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(calls.some(call => call.method === "POST")).toBe(false)
  })

  it("uploads the first photo onto the draft, then publishes that same draft", async () => {
    const sent: Array<{ url: string }> = []
    class FakeXhr {
      upload = { onprogress: null as ((event: { lengthComputable: number; loaded: number; total: number }) => void) | null }
      status = 200
      responseText = "{}"
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      onabort: (() => void) | null = null
      url = ""
      open(_method: string, url: string) {
        this.url = url
      }
      setRequestHeader() {}
      send() {
        sent.push({ url: this.url })
        setTimeout(() => this.onload?.(), 0)
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXhr)
    const draftId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    route(/\/listings\/storage-status/, () => ({ configured: true }))
    route(/\/listings\/drafts$/, () => ({ id: draftId, title: "Oak chair", status: "DRAFT", images: [] }))
    route(new RegExp(`/listings/${draftId}/manage$`), () => ({
      ...listing(draftId, "Oak chair", "DRAFT"),
      images: [{ id: "img-1", objectKey: "a.png", sortOrder: 0, url: "/api/v1/media/x" }],
    }))
    route(new RegExp(`/listings/${draftId}/publish$`), () => ({ id: draftId, title: "Oak chair", status: "PUBLISHED" }))
    route(new RegExp(`/listings/${draftId}$`), () => ({ id: draftId, title: "Oak chair", status: "DRAFT" }))

    const onDone = vi.fn()
    render(<CreateListingFlow categories={categories} onDone={onDone} onNavigate={() => undefined} />)
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Oak chair" } })
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Solid oak dining chair" } })
    expect(screen.getByText(/then choose a JPEG, PNG or WebP/)).toBeTruthy()

    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "photo.png", { type: "image/png" })
    fireEvent.change(document.getElementById("listing-image-input") as HTMLInputElement, { target: { files: [file] } })

    expect(await screen.findByAltText("Listing photo 1")).toBeTruthy()
    expect(sent).toHaveLength(1)
    expect(sent[0].url).toContain(`/listings/${draftId}/images`)
    expect(calls.some(call => call.method === "POST" && call.url.endsWith("/listings/drafts"))).toBe(true)

    fireEvent.click(screen.getByRole("button", { name: "Post listing" }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(calls.some(call => call.method === "POST" && call.url.endsWith(`/listings/${draftId}/publish`))).toBe(true)
    expect(calls.some(call => call.method === "POST" && call.url.endsWith("/listings"))).toBe(false)
    expect(calls.some(call => call.method === "PATCH" && call.url.endsWith(`/listings/${draftId}`))).toBe(true)
  })
})

describe("ImageManager", () => {
  function stubXhr() {
    const sent: Array<{ url: string; body: FormData }> = []
    class FakeXhr {
      upload = { onprogress: null as ((event: { lengthComputable: number; loaded: number; total: number }) => void) | null }
      status = 200
      responseText = JSON.stringify({ id: "img-1", objectKey: `listings/${listingId}/a.png`, sortOrder: 0, url: "/api/v1/media/x" })
      withCredentials = false
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      onabort: (() => void) | null = null
      headers: Record<string, string> = {}
      open(_method: string, url: string) {
        this.url = url
      }
      url = ""
      setRequestHeader(name: string, value: string) {
        this.headers[name] = value
      }
      send(body: FormData) {
        sent.push({ url: this.url, body })
        this.upload.onprogress?.({ lengthComputable: 1, loaded: 50, total: 100 })
        setTimeout(() => this.onload?.(), 0)
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXhr)
    return sent
  }

  it("uploads a real file and re-reads the persisted images", async () => {
    const sent = stubXhr()
    route(/\/listings\/storage-status/, () => ({ configured: true }))
    route(/\/listings\/[0-9a-f-]{36}\/manage$/, () => ({
      ...listing(listingId, "Oak chair", "PUBLISHED"),
      images: [{ id: "img-1", objectKey: `listings/${listingId}/a.png`, sortOrder: 0, url: "/api/v1/media/x" }],
    }))

    render(<ImageManager listingId={listingId} />)
    await waitFor(() => expect(screen.getByText(/0\/8/)).toBeTruthy())

    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "photo.png", { type: "image/png" })
    const input = document.getElementById("listing-image-input") as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].url).toContain(`/listings/${listingId}/images`)
    expect(sent[0].body.get("file")).toBe(file)

    // The gallery shows the server's record, not a local object URL.
    // The gallery is rebuilt from the owner view the client re-reads, so a
    // reload shows the same persisted rows.
    expect(await screen.findByAltText("Listing photo 1")).toBeTruthy()
    expect(
      calls.some(
        call => call.url.endsWith(`/listings/${listingId}/manage`) && call.method === "GET",
      ),
    ).toBe(true)
  })

  it("rejects a non-image file before any upload starts", async () => {
    const sent = stubXhr()
    route(/\/listings\/storage-status/, () => ({ configured: true }))
    render(<ImageManager listingId={listingId} />)

    const file = new File(["%PDF-1.7"], "doc.pdf", { type: "application/pdf" })
    const input = document.getElementById("listing-image-input") as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(sent).toHaveLength(0)
  })

  it("rejects an oversized file before any upload starts", async () => {
    const sent = stubXhr()
    route(/\/listings\/storage-status/, () => ({ configured: true }))
    render(<ImageManager listingId={listingId} />)

    const file = new File([new Uint8Array(6 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" })
    const input = document.getElementById("listing-image-input") as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(sent).toHaveLength(0)
  })

  it("says plainly when storage is not configured", async () => {
    stubXhr()
    route(/\/listings\/storage-status/, () => ({ configured: false }))
    render(<ImageManager listingId={listingId} />)

    expect(await screen.findByText(/image storage is not configured/i)).toBeTruthy()
  })

  it("accepts the same image types the API allow-list declares", () => {
    const source = readFileSync("backend/src/common/uploads.ts", "utf8")
    const declared = source.match(/const DEFAULT_TYPES = '([^']+)'/)?.[1]?.split(",")
    expect(declared).toEqual([...ACCEPTED_IMAGE_TYPES])
    expect(ACCEPTED_IMAGE_TYPES).not.toContain("image/gif")

    route(/\/listings\/storage-status/, () => ({ configured: true }))
    render(<ImageManager listingId={listingId} />)
    const input = document.getElementById("listing-image-input") as HTMLInputElement
    expect(input.accept.split(",")).toEqual([...ACCEPTED_IMAGE_TYPES])
    expect(document.body.textContent).toContain("JPEG, PNG or WebP")
    expect(document.body.textContent).not.toContain("JPEG, PNG, or WebP")
    expect(document.body.textContent).not.toMatch(/GIF/)
  })

  it.each([
    [415, "Only JPEG, PNG, and WebP images are accepted"],
    [413, "Image exceeds the upload size limit"],
  ])("shows the server %s message and leaves the gallery unchanged", async (httpStatus, message) => {
    class FakeXhr {
      upload = { onprogress: null as ((event: { lengthComputable: number; loaded: number; total: number }) => void) | null }
      status = httpStatus
      responseText = JSON.stringify({ message })
      withCredentials = false
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      onabort: (() => void) | null = null
      open() {}
      setRequestHeader() {}
      send() {
        setTimeout(() => this.onload?.(), 0)
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXhr)
    route(/\/listings\/storage-status/, () => ({ configured: true }))
    const kept = {
      id: "img-keep",
      objectKey: `listings/${listingId}/keep.png`,
      sortOrder: 0,
      url: "/api/v1/media/keep",
    }
    render(<ImageManager listingId={listingId} initialImages={[kept]} />)
    expect(await screen.findByAltText("Listing photo 1")).toBeTruthy()
    const input = document.getElementById("listing-image-input") as HTMLInputElement
    await waitFor(() => expect(input.disabled).toBe(false))

    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "photo.jpg", { type: "image/jpeg" })
    fireEvent.change(input, {
      target: { files: [file] },
    })

    expect(await screen.findByText(message)).toBeTruthy()
    expect(screen.getByAltText("Listing photo 1").getAttribute("src")).toBe(kept.url)
    expect(screen.getAllByRole("img", { name: /Listing photo/ })).toHaveLength(1)
    expect(screen.queryByText("Image uploaded.")).toBeNull()
    expect(calls.some((call) => call.url.includes("/manage"))).toBe(false)
  })
})