import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import PassportView from "./PassportView"
import PassportSettings from "./PassportSettings"
import PassportEdit from "./PassportEdit"
import StaffQueue from "./StaffQueue"

const userId = "11111111-1111-4111-8111-111111111111"
const viewerId = "22222222-2222-4222-8222-222222222222"

function passport(overrides: Record<string, unknown> = {}) {
  return {
    id: userId,
    displayName: "Grace H",
    avatarUrl: null,
    bio: "Lending tools on Inman Park.",
    memberSince: "2025-01-15T00:00:00.000Z",
    accountAgeDays: 320,
    neighborhood: "Inman Park",
    city: "Atlanta",
    counts: {
      completedExchanges: 4,
      completedBorrowings: 6,
      borrowingsAsLender: 3,
      borrowingsAsBorrower: 3
    },
    rating: {
      average: 4.67,
      count: 6,
      distribution: { "1": 0, "2": 0, "3": 0, "4": 2, "5": 4 },
      tooFewToRate: false
    },
    trustSignals: [
      {
        key: "email_verified",
        label: "Email confirmed",
        explanation: "They confirmed they can receive mail at their address.",
        earned: true,
        count: 1
      },
      {
        key: "active_lender",
        label: "Active lender",
        explanation: "They have lent items to 2 or more neighbors.",
        earned: false,
        count: 1
      }
    ],
    verifications: [],
    isSelf: false,
    withdrawn: false,
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

describe("PassportView", () => {
  it("shows real counts and an explained rating summary", async () => {
    route(/\/passport\/members\//, () => passport())
    route(/\/reviews\/subjects\//, () => [
      {
        id: "r1",
        rating: 5,
        body: "Very easy to coordinate with.",
        context: "borrowed this item",
        itemTitle: "Cordless drill",
        createdAt: "2026-09-01T00:00:00.000Z",
        edited: false,
        author: { id: viewerId, profile: { firstName: "Ada", displayName: "Ada L" } }
      }
    ])

    render(<PassportView userId={userId} viewerId={viewerId} onNavigate={() => undefined} />)

    expect(await screen.findByText("Grace H")).toBeTruthy()
    expect(screen.getByText("4.67")).toBeTruthy()
    expect(screen.getByText(/from 6 published reviews/)).toBeTruthy()
    expect(screen.getByText(/borrowed this item/)).toBeTruthy()
    expect(screen.getByText(/Cordless drill/)).toBeTruthy()
  })

  it("says the sample is too small rather than printing a weak average", async () => {
    route(
      /\/passport\/members\//,
      () =>
        passport({
          rating: { average: null, count: 2, distribution: { "1": 0, "2": 0, "3": 0, "4": 1, "5": 1 }, tooFewToRate: true }
        })
    )
    route(/\/reviews\/subjects\//, () => [])
    render(<PassportView userId={userId} viewerId={viewerId} onNavigate={() => undefined} />)

    expect(await screen.findByText(/not enough published reviews yet/i)).toBeTruthy()
    // A number derived from two reviews is never shown.
    expect(screen.queryByText("5")).toBeNull()
  })

  it("honours a member who hides their ratings", async () => {
    route(/\/passport\/members\//, () => passport({ rating: null }))
    route(/\/reviews\/subjects\//, () => [])
    render(<PassportView userId={userId} viewerId={viewerId} onNavigate={() => undefined} />)
    expect(await screen.findByText(/chosen not to show ratings/i)).toBeTruthy()
  })

  it("explains every trust signal, earned or not", async () => {
    route(/\/passport\/members\//, () => passport())
    route(/\/reviews\/subjects\//, () => [])
    render(<PassportView userId={userId} viewerId={viewerId} onNavigate={() => undefined} />)

    expect(await screen.findByText("Email confirmed")).toBeTruthy()
    // The unearned signal is listed with its reason rather than hidden away.
    fireEvent.click(screen.getByText(/1 signal not earned/))
    expect(screen.getByText(/They have lent items to 2 or more neighbors/)).toBeTruthy()
  })

  it("shows a withdrawn notice for an inactive account", async () => {
    route(/\/passport\/members\//, () => passport({ withdrawn: true }))
    route(/\/reviews\/subjects\//, () => [])
    render(<PassportView userId={userId} viewerId={viewerId} onNavigate={() => undefined} />)
    expect(await screen.findByText(/not active/i)).toBeTruthy()
  })

  it("shows no email, no coordinates, and no moderation state", async () => {
    route(/\/passport\/members\//, () => passport())
    route(/\/reviews\/subjects\//, () => [])
    render(<PassportView userId={userId} viewerId={viewerId} onNavigate={() => undefined} />)
    await screen.findByText("Grace H")
    expect(document.body.textContent).not.toContain("@example.com")
    expect(document.body.textContent).not.toContain("33.7")
    expect(document.body.textContent).not.toContain("SUSPENDED")
  })

  it("shows an empty review state rather than a blank section", async () => {
    route(/\/passport\/members\//, () => passport())
    route(/\/reviews\/subjects\//, () => [])
    render(<PassportView userId={userId} viewerId={viewerId} onNavigate={() => undefined} />)
    expect(await screen.findByText(/no published reviews yet/i)).toBeTruthy()
  })

  it("offers editing only to the passport owner", async () => {
    route(/\/passport\/members\//, () => passport())
    route(/\/reviews\/subjects\//, () => [])
    const onNavigate = vi.fn()

    const { unmount } = render(
      <PassportView userId={userId} viewerId={viewerId} onNavigate={onNavigate} />
    )
    expect(screen.queryByRole("button", { name: "Edit passport" })).toBeNull()
    unmount()

    render(<PassportView userId={userId} viewerId={userId} onNavigate={onNavigate} />)
    expect(await screen.findByRole("button", { name: "Edit passport" })).toBeTruthy()
  })

  it("surfaces a load failure", async () => {
    route(/\/passport\/members\//, () => json({ message: "Not found" }, 404))
    route(/\/reviews\/subjects\//, () => [])
    render(<PassportView userId={userId} viewerId={viewerId} onNavigate={() => undefined} />)
    expect(await screen.findByRole("alert")).toBeTruthy()
  })
})

describe("PassportSettings", () => {
  const privacy = {
    showRatings: true,
    showTenure: true,
    showNeighborhood: true,
    showCity: true,
    showTrustSignals: true,
    showContributions: true,
    leaderboardOptIn: false,
    reviewWindowDays: 14
  }

  it("writes a review and explains why it is not visible yet", async () => {
    route(/\/reviews\/reviewable/, () => [
      {
        transactionId: "t1",
        completedAt: "2026-09-01T00:00:00.000Z",
        myRole: "lender",
        counterparty: { id: viewerId, profile: { firstName: "Ada", displayName: "Ada L" } }
      }
    ])
    route(
      /\/reviews\/mine/,
      () => [
        {
          id: "r1",
          transactionId: "t1",
          subjectId: viewerId,
          rating: 5,
          body: "An honest review body.",
          status: "PENDING",
          visible: false,
          publicationNote: "Visible once the other person reviews, or by Oct 1.",
          editableUntil: null,
          createdAt: "2026-09-01T00:00:00.000Z"
        }
      ]
    )
    route(/\/reviews$/, () => ({
      id: "r2",
      transactionId: "t1",
      subjectId: viewerId,
      rating: 5,
      body: "An honest review body.",
      status: "PENDING",
      visible: false,
      publicationNote: "Visible once the other person reviews, or by Oct 1.",
      createdAt: "2026-09-02T00:00:00.000Z"
    }))

    render(<PassportSettings onNavigate={() => undefined} />)
    const textarea = await screen.findByLabelText("What was it like?")
    fireEvent.change(textarea, { target: { value: "Reliable and easy to coordinate with." } })
    fireEvent.click(screen.getByRole("button", { name: "Write review" }))

    await waitFor(() =>
      expect(
        calls.some(call => call.method === "POST" && call.url.endsWith("/api/v1/reviews"))
      ).toBe(true)
    )
    // The notice appears both as the action's outcome and on the review row,
    // because the member will look for it in either place.
    await waitFor(() => {
      expect(screen.getAllByText(/once the other person reviews/i).length).toBeGreaterThan(0)
    })
  })

  it("requires a statement before asking a moderator for anything", async () => {
    route(/\/me\/verifications/, () => ({ records: [], emailVerified: false }))
    route(/\/passport\/verifications/, () => json({ message: "unmounted" }, 404))
    render(<PassportSettings onNavigate={() => undefined} />)
    fireEvent.click(await screen.findByRole("button", { name: "Verification" }))
    fireEvent.click(await screen.findByRole("button", { name: "Request community reference" }))
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(calls.some(call => call.url.endsWith("/passport/verifications"))).toBe(false)
  })

  it("refuses a too-short review before any API call", async () => {
    route(/\/reviews\/reviewable/, () => [
      {
        transactionId: "t1",
        completedAt: "2026-09-01T00:00:00.000Z",
        counterparty: { id: viewerId, profile: { firstName: "Ada" } }
      }
    ])
    route(/\/reviews\/mine/, () => [])
    render(<PassportSettings onNavigate={() => undefined} />)
    fireEvent.change(await screen.findByLabelText("What was it like?"), { target: { value: "ok" } })
    fireEvent.click(screen.getByRole("button", { name: "Write review" }))

    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(
      calls.some(call => call.method === "POST" && call.url.endsWith("/api/v1/reviews"))
    ).toBe(false)
  })

  it("shows an empty state when there is nothing to review", async () => {
    route(/\/reviews\/reviewable/, () => [])
    route(/\/reviews\/mine/, () => [])
    render(<PassportSettings onNavigate={() => undefined} />)
    expect(await screen.findByText(/nothing to review/i)).toBeTruthy()
  })

  it("persists a privacy change rather than only hiding it locally", async () => {
    route(/\/passport\/privacy/, (_url, init) =>
      init?.method === "PATCH" ? { ...privacy, showRatings: false } : privacy
    )
    render(<PassportSettings onNavigate={() => undefined} />)
    fireEvent.click(await screen.findByRole("button", { name: "Privacy" }))
    await screen.findByLabelText("Show my public rating summary")
    fireEvent.click(screen.getByLabelText("Show my public rating summary"))
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }))

    await waitFor(() => {
      const patch = calls.find(call => call.method === "PATCH" && call.url.includes("/passport/privacy"))
      expect(patch).toBeTruthy()
      expect(patch!.body).toMatchObject({ showRatings: false })
    })
  })

  it("keeps leaderboards opt-in and says so", async () => {
    route(/\/passport\/privacy/, (_url, init) =>
      init?.method === "PATCH" ? { ...privacy, leaderboardOptIn: true } : privacy
    )
    render(<PassportSettings onNavigate={() => undefined} />)
    fireEvent.click(await screen.findByRole("button", { name: "Privacy" }))
    const checkbox = await screen.findByLabelText("List me on the public neighbor leaderboard")
    expect((checkbox as HTMLInputElement).checked).toBe(false)
    expect(screen.getByText(/off by default/i)).toBeTruthy()
  })

  it("shows email verification as a fact, not a claim", async () => {
    route(/\/me\/verifications/, () => ({
      records: [],
      emailVerified: false
    }))
    render(<PassportSettings onNavigate={() => undefined} />)
    fireEvent.click(await screen.findByRole("button", { name: "Verification" }))

    expect(await screen.findByText("Not confirmed yet.")).toBeTruthy()
    expect(screen.getByText(/cannot be granted from this page/i)).toBeTruthy()
    // The copy is explicit that nothing here is an identity document check.
    expect(screen.getByText(/does not collect identity documents/i)).toBeTruthy()
  })

  it("shows the real state of a verification request", async () => {
    route(/\/me\/verifications/, () => ({
      emailVerified: true,
      records: [
        {
          id: "v1",
          method: "COMMUNITY_REFERENCE",
          status: "PENDING",
          statement: "Two neighbors know me",
          label: "Community reference",
          explanation: "A staff member confirmed this member is known to the neighborhood.",
          createdAt: "2026-09-01T00:00:00.000Z",
          decidedAt: null
        }
      ]
    }))
    render(<PassportSettings onNavigate={() => undefined} />)
    fireEvent.click(await screen.findByRole("button", { name: "Verification" }))
    expect(await screen.findByText("Community reference")).toBeTruthy()
    expect(screen.getByText("pending")).toBeTruthy()
  })

  it("shows an empty appeal state with an explanation of when to use one", async () => {
    route(/\/me\/appeals/, () => [])
    render(<PassportSettings onNavigate={() => undefined} />)
    fireEvent.click(await screen.findByRole("button", { name: "Appeals" }))
    expect(await screen.findByText(/not appealed anything/i)).toBeTruthy()
  })
})

describe("PassportEdit", () => {
  it("sends only the editable fields", async () => {
    route(/\/passport\/me$/, () => passport({ isSelf: true }))
    render(<PassportEdit onNavigate={() => undefined} />)

    fireEvent.change(await screen.findByLabelText("Display name"), { target: { value: "Grace H." } })
    fireEvent.change(screen.getByLabelText("Short bio"), { target: { value: "Tools and garden tools." } })
    fireEvent.click(screen.getByRole("button", { name: "Save passport" }))

    await waitFor(() => {
      const patch = calls.find(call => call.method === "PATCH" && call.url.endsWith("/passport/me"))
      expect(patch).toBeTruthy()
      // No coordinates, email, or trust signal is even in the payload shape.
      expect(Object.keys(patch!.body as object).sort()).toEqual([
        "bio",
        "city",
        "displayName",
        "neighborhood"
      ])
    })
  })

  it("states that trust signals are derived, not typed in", async () => {
    route(/\/passport\/me$/, () => passport({ isSelf: true }))
    render(<PassportEdit onNavigate={() => undefined} />)
    expect(await screen.findByText(/derived from your activity/i)).toBeTruthy()
  })
})

describe("StaffQueue", () => {
  it("lists reported reviews with the reporter and an action per row", async () => {
    route(/\/staff\/reviews/, () => [
      {
        id: "rep1",
        reason: "SPAM",
        details: "Looks farmed.",
        createdAt: "2026-09-01T00:00:00.000Z",
        reporter: { id: viewerId, profile: { firstName: "Ada", displayName: "Ada L" } },
        review: { id: "r1", rating: 5, body: "Suspect review text.", subjectId: userId, status: "PUBLISHED" }
      }
    ])
    render(<StaffQueue onNavigate={() => undefined} />)

    expect(await screen.findByText("Suspect review text.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Hide review" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Restore review" })).toBeTruthy()
  })

  it("hides a review through the real endpoint", async () => {
    route(/\/staff\/reviews\/.+\/hide/, () => ({ id: "r1", status: "HIDDEN" }))
    route(/\/staff\/reviews/, () => [
      {
        id: "rep1",
        reason: "SPAM",
        details: null,
        createdAt: "2026-09-01T00:00:00.000Z",
        reporter: { id: viewerId, profile: { firstName: "Ada" } },
        review: { id: "r1", rating: 5, body: "Suspect review text.", subjectId: userId, status: "PUBLISHED" }
      }
    ])
    render(<StaffQueue onNavigate={() => undefined} />)
    fireEvent.click(await screen.findByRole("button", { name: "Hide review" }))
    fireEvent.change(await screen.findByLabelText(/Reason for hiding/), {
      target: { value: "Review farming pattern" }
    })
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))

    await waitFor(() =>
      expect(calls.some(call => call.url.includes("/staff/reviews/r1/hide"))).toBe(true)
    )
    // The message says the row survives rather than implying deletion.
    expect(await screen.findByText(/stays on record/i)).toBeTruthy()
  })

  it("lists pending verifications and approves through the real endpoint", async () => {
    route(/\/staff\/verifications\/.+/, () => ({ id: "v1", status: "APPROVED" }))
    route(/\/staff\/verifications/, () => [
      {
        id: "v1",
        method: "COMMUNITY_REFERENCE",
        statement: "Two neighbors know me.",
        createdAt: "2026-09-01T00:00:00.000Z",
        user: { id: userId, profile: { firstName: "Grace", displayName: "Grace H" } }
      }
    ])
    render(<StaffQueue onNavigate={() => undefined} />)
    fireEvent.click(await screen.findByRole("button", { name: "Verifications" }))
    expect(await screen.findByText("Two neighbors know me.")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Approve" }))
    await waitFor(() =>
      expect(calls.some(call => call.url.includes("/staff/verifications/v1"))).toBe(true)
    )
  })

  it("shows an empty queue state", async () => {
    route(/\/staff\/reviews/, () => [])
    render(<StaffQueue onNavigate={() => undefined} />)
    expect(await screen.findByText(/nothing waiting for review/i)).toBeTruthy()
  })

  it("surfaces a moderation failure instead of claiming success", async () => {
    route(/\/staff\/reviews\/.+\/hide/, () => json({ message: "Not staff" }, 403))
    route(/\/staff\/reviews/, () => [
      {
        id: "rep1",
        reason: "SPAM",
        details: null,
        createdAt: "2026-09-01T00:00:00.000Z",
        reporter: { id: viewerId, profile: { firstName: "Ada" } },
        review: { id: "r1", rating: 5, body: "Text.", subjectId: userId, status: "PUBLISHED" }
      }
    ])
    render(<StaffQueue onNavigate={() => undefined} />)
    fireEvent.click(await screen.findByRole("button", { name: "Hide review" }))
    fireEvent.change(await screen.findByLabelText(/Reason for hiding/), {
      target: { value: "A reason" }
    })
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))
    expect(await screen.findByRole("alert")).toBeTruthy()
  })
})