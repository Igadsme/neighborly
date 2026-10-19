import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import MissionFeed from "./MissionFeed"
import MissionDetailPage from "./MissionDetailPage"
import MissionEditor from "./MissionEditor"
import MissionManage from "./MissionManage"
import Contributions from "./Contributions"
import CommunityModeration from "./CommunityModeration"

const missionId = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const viewerId = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"

let calls: Array<{ method: string; url: string; body: unknown }> = []
let routes: Array<{ test: RegExp; handler: (url: string, init?: RequestInit) => unknown }> = []

/**
 * Registers a route, replacing an earlier one with the same pattern so a test
 * can override a default without depending on registration order.
 */
function route(pattern: RegExp, handler: (url: string, init?: RequestInit) => unknown) {
  const existing = routes.findIndex(entry => entry.test.source === pattern.source)
  if (existing >= 0) routes.splice(existing, 1)
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
    return body instanceof Response ? body : json(body ?? {})
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: missionId,
    title: "Riverside park cleanup",
    description: "Litter pick and bagging across the riverside path.",
    category: "CLEANUP",
    status: "PUBLISHED",
    neighborhood: "Riverside",
    city: "Atlanta",
    meetingPoint: null,
    startAt: "2026-11-01T14:00:00.000Z",
    endAt: "2026-11-01T18:00:00.000Z",
    capacity: 4,
    confirmedCount: 2,
    slotsLeft: 2,
    requiresApproval: false,
    requiresStaffVerification: false,
    publishedAt: "2026-10-01T00:00:00.000Z",
    completedAt: null,
    cancelledAt: null,
    isOrganizer: false,
    organizer: { id: viewerId, profile: { firstName: "Ada", displayName: "Ada L" } },
    myParticipation: null,
    ended: false,
    ...overrides
  }
}

function listItem(overrides: Record<string, unknown> = {}) {
  return {
    id: missionId,
    title: "Riverside park cleanup",
    description: "Litter pick and bagging across the riverside path.",
    category: "CLEANUP",
    status: "PUBLISHED",
    neighborhood: "Riverside",
    city: "Atlanta",
    startAt: "2026-11-01T14:00:00.000Z",
    endAt: "2026-11-01T18:00:00.000Z",
    capacity: 4,
    confirmedCount: 2,
    slotsLeft: 2,
    full: false,
    upcoming: true,
    requiresApproval: false,
    organizer: { id: viewerId, profile: { firstName: "Ada", displayName: "Ada L" } },
    ...overrides
  }
}

describe("MissionFeed", () => {
  const emptyRoutes = () => {
    route(/\/missions\/organizer/, () => ({ items: [], total: 0, limit: 12, offset: 0 }))
    route(/\/missions\/joined/, () => ({ items: [], total: 0, limit: 12, offset: 0 }))
    route(/\/missions\?/, () => ({
      items: [listItem()],
      total: 1,
      limit: 12,
      offset: 0
    }))
  }

  it("shows a real place count rather than hiding a full mission", async () => {
    emptyRoutes()
    render(<MissionFeed onNavigate={() => undefined} canOrganize />)
    expect(await screen.findByText(/2 of 4 places left/)).toBeTruthy()
  })

  it("says a full mission is full and that the waitlist is open", async () => {
    emptyRoutes()
    route(/\/missions\?/, () => ({
      items: [listItem({ slotsLeft: 0, full: true, confirmedCount: 4 })],
      total: 1,
      limit: 12,
      offset: 0
    }))
    render(<MissionFeed onNavigate={() => undefined} canOrganize />)
    expect(await screen.findByText(/Full \(4\) — waitlist open/)).toBeTruthy()
  })

  it("loads joined missions from the joined endpoint", async () => {
    emptyRoutes()
    render(<MissionFeed onNavigate={() => undefined} canOrganize />)
    fireEvent.click(await screen.findByRole("button", { name: "Joined" }))
    await waitFor(() =>
      expect(calls.some(call => call.url.includes("/missions/joined"))).toBe(true)
    )
  })

  it("sends a category filter to the server", async () => {
    emptyRoutes()
    render(<MissionFeed onNavigate={() => undefined} canOrganize />)
    fireEvent.change(await screen.findByLabelText("Category"), { target: { value: "GARDENING" } })
    await waitFor(() =>
      expect(calls.some(call => call.url.includes("category=GARDENING"))).toBe(true)
    )
  })

  it("shows a distinct empty state per scope", async () => {
    emptyRoutes()
    render(<MissionFeed onNavigate={() => undefined} canOrganize />)
    fireEvent.click(await screen.findByRole("button", { name: "Organizing" }))
    expect(await screen.findByText(/have not organized a mission/i)).toBeTruthy()
  })

  it("offers organizing only to a signed-in member", async () => {
    emptyRoutes()
    const { unmount } = render(<MissionFeed onNavigate={() => undefined} canOrganize={false} />)
    await screen.findByText(/2 of 4 places left/)
    expect(screen.queryByRole("button", { name: "Organize a mission" })).toBeNull()
    unmount()
    render(<MissionFeed onNavigate={() => undefined} canOrganize />)
    expect(await screen.findByRole("button", { name: "Organize a mission" })).toBeTruthy()
  })

  it("surfaces a load failure instead of showing an empty list", async () => {
    emptyRoutes()
    route(/\/missions\?/, () => json({ message: "Unavailable" }, 500))
    render(<MissionFeed onNavigate={() => undefined} canOrganize />)
    expect(await screen.findByRole("alert")).toBeTruthy()
  })
})

describe("MissionDetailPage", () => {
  it("never renders a meeting point the server withheld", async () => {
    route(/\/missions\/[^/]+$/, () => detail())
    render(<MissionDetailPage missionId={missionId} onNavigate={() => undefined} />)

    expect(await screen.findByText("Riverside park cleanup")).toBeTruthy()
    expect(document.body.textContent).not.toContain("north gate")
    // And it explains the absence rather than leaving an empty box.
    expect(
      screen.getByText(/shared with confirmed participants once there is room/i)
    ).toBeTruthy()
  })

  it("shows the meeting point to a confirmed participant", async () => {
    route(/\/missions\/[^/]+$/, () =>
      detail({ meetingPoint: "Meet at the north gate", myParticipation: { id: "p1", status: "CONFIRMED" } })
    )
    render(<MissionDetailPage missionId={missionId} onNavigate={() => undefined} />)
    expect(await screen.findByText("Meet at the north gate")).toBeTruthy()
  })

  it("joins through the real endpoint and reports the server's wording", async () => {
    // The server decides confirmed versus waitlisted, and the screen says what
    // it decided rather than assuming it got a place.
    route(/\/join$/, () => ({
      missionId,
      status: "WAITLISTED",
      confirmed: false,
      waitlisted: true,
      waitlistPosition: 2,
      message: "This mission filled up while you were deciding, so you are on the waitlist."
    }))
    let call = 0
    route(/\/missions\/[^/]+$/, () => {
      call += 1
      return detail({
        slotsLeft: 0,
        myParticipation:
          call === 1 ? null : { id: "p1", status: "WAITLISTED", waitlistPosition: 2 }
      })
    })
    render(<MissionDetailPage missionId={missionId} onNavigate={() => undefined} />)

    const join = await screen.findByRole("button", { name: "Join the waitlist" })
    fireEvent.click(join)
    await waitFor(() => expect(calls.some(entry => entry.url.endsWith("/join"))).toBe(true))
    expect(await screen.findByText(/filled up while you were deciding/i)).toBeTruthy()
    expect(screen.getByText(/position 2/)).toBeTruthy()
  })

  it("offers check-in only to a confirmed participant", async () => {
    route(/\/missions\/[^/]+$/, () =>
      detail({ myParticipation: { id: "p1", status: "CONFIRMED" } })
    )
    render(<MissionDetailPage missionId={missionId} onNavigate={() => undefined} />)
    expect(await screen.findByRole("button", { name: "I am here" })).toBeTruthy()
  })

  it("hides check-in from a waitlisted participant", async () => {
    route(/\/missions\/[^/]+$/, () =>
      detail({
        myParticipation: { id: "p1", status: "WAITLISTED", waitlistPosition: 1 }
      })
    )
    render(<MissionDetailPage missionId={missionId} onNavigate={() => undefined} />)
    await screen.findByText(/position 1/)
    expect(screen.queryByRole("button", { name: "I am here" })).toBeNull()
  })

  it("explains that a verified participation needs nothing further", async () => {
    route(/\/missions\/[^/]+$/, () =>
      detail({
        status: "COMPLETED",
        myParticipation: { id: "p1", status: "VERIFIED" }
      })
    )
    render(<MissionDetailPage missionId={missionId} onNavigate={() => undefined} />)
    expect(await screen.findByText(/nothing further is needed/i)).toBeTruthy()
  })

  it("does not offer to join a cancelled mission", async () => {
    route(/\/missions\/[^/]+$/, () => detail({ status: "CANCELLED" }))
    render(<MissionDetailPage missionId={missionId} onNavigate={() => undefined} />)
    expect(await screen.findByText(/nothing is expected of anyone/i)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Join this mission/ })).toBeNull()
  })

  it("requires a report reason before sending anything", async () => {
    route(/\/missions\/[^/]+$/, () => detail())
    render(<MissionDetailPage missionId={missionId} onNavigate={() => undefined} />)
    fireEvent.click(await screen.findByRole("button", { name: "Send report" }))
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(calls.some(entry => entry.url.endsWith("/report"))).toBe(false)
  })

  it("hides the report form from the organizer", async () => {
    route(/\/missions\/[^/]+$/, () => detail({ isOrganizer: true }))
    render(<MissionDetailPage missionId={missionId} onNavigate={() => undefined} />)
    expect(await screen.findByText(/you organized this mission/i)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Send report" })).toBeNull()
  })
})

describe("MissionEditor", () => {
  it("refuses a mission that ends before it starts without any API call", async () => {
    render(<MissionEditor onNavigate={() => undefined} />)
    fireEvent.change(await screen.findByLabelText("Title"), {
      target: { value: "Riverside park cleanup" }
    })
    fireEvent.change(screen.getByLabelText("What will people do?"), {
      target: { value: "Litter picking across the riverside path." }
    })
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-11-02T10:00" } })
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "2026-11-01T10:00" } })
    fireEvent.click(screen.getByRole("button", { name: "Publish mission" }))

    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(calls.some(entry => entry.method === "POST")).toBe(false)
  })

  it("says the meeting point is never published", async () => {
    render(<MissionEditor onNavigate={() => undefined} />)
    expect(await screen.findByText(/never published/i)).toBeTruthy()
  })

  it("publishes a valid mission and moves to the organizer view", async () => {
    const onNavigate = vi.fn()
    route(/\/missions$/, () => detail({ isOrganizer: true }))
    render(<MissionEditor onNavigate={onNavigate} />)
    fireEvent.change(await screen.findByLabelText("Title"), {
      target: { value: "Riverside park cleanup" }
    })
    fireEvent.change(screen.getByLabelText("What will people do?"), {
      target: { value: "Litter picking across the riverside path." }
    })
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "2026-11-02T10:00" } })
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "2026-11-02T16:00" } })
    fireEvent.click(screen.getByRole("button", { name: "Publish mission" }))

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("mission-manage", missionId))
    const post = calls.find(entry => entry.method === "POST")
    // The payload carries no capacity bookkeeping, organizer, or status.
    expect(Object.keys(post!.body as object).sort()).toEqual([
      "capacity",
      "category",
      "description",
      "endAt",
      "publishNow",
      "requiresApproval",
      "startAt",
      "title"
    ])
  })

  it("loads an existing mission into the form", async () => {
    route(/\/missions\/[^/]+$/, () =>
      detail({
        isOrganizer: true,
        title: "Garden morning",
        description: "Weeding the beds behind the hall.",
        category: "GARDENING",
        capacity: 12
      })
    )
    render(<MissionEditor missionId={missionId} onNavigate={() => undefined} />)
    expect(await screen.findByDisplayValue("Garden morning")).toBeTruthy()
    expect((await screen.findByLabelText("Places")) as HTMLInputElement).toHaveProperty(
      "value",
      "12"
    )
  })
})

describe("MissionManage", () => {
  const roster = [
    {
      id: "p1",
      status: "CHECKED_IN",
      waitlistPosition: null,
      checkedInAt: "2026-11-01T14:05:00.000Z",
      attendanceMarkedAt: null,
      verifiedAt: null,
      user: { id: viewerId, profile: { firstName: "Ada", displayName: "Ada L" } }
    },
    {
      id: "p2",
      status: "VERIFIED",
      waitlistPosition: null,
      checkedInAt: "2026-11-01T14:02:00.000Z",
      attendanceMarkedAt: "2026-11-01T17:00:00.000Z",
      verifiedAt: "2026-11-01T18:00:00.000Z",
      user: { id: "cccccccc-3333-4333-8333-cccccccccccc", profile: { firstName: "Bo" } }
    },
    {
      id: "p3",
      status: "WAITLISTED",
      waitlistPosition: 1,
      checkedInAt: null,
      attendanceMarkedAt: null,
      verifiedAt: null,
      user: { id: "dddddddd-4444-4444-8444-dddddddddddd", profile: { firstName: "Cy" } }
    }
  ]

  const organizerDetail = detail({ isOrganizer: true, confirmedCount: 2 })

  it("confirms attendance only for somebody who checked in", async () => {
    route(/\/participants$/, () => roster)
    route(/\/missions\/[^/]+$/, () => organizerDetail)
    render(<MissionManage missionId={missionId} onNavigate={() => undefined} />)

    expect(await screen.findByText("Ada L")).toBeTruthy()
    expect(screen.getAllByRole("button", { name: "Confirm they were there" })).toHaveLength(1)
    // Verified and waitlisted rows do not get an attendance button.
    expect(screen.getAllByRole("button", { name: "Revoke participation" })).toHaveLength(1)
  })

  it("sends the attendance confirmation to the real endpoint", async () => {
    route(/\/participants$/, () => roster)
    route(/\/participants\/[^/]+\/attendance/, () => ({ status: "ATTENDED" }))
    route(/\/missions\/[^/]+$/, () => organizerDetail)
    render(<MissionManage missionId={missionId} onNavigate={() => undefined} />)

    fireEvent.click(await screen.findByRole("button", { name: "Confirm they were there" }))
    await waitFor(() =>
      expect(calls.some(entry => entry.url.includes("/participants/p1/attendance"))).toBe(true)
    )
  })

  it("withholds the attendance button when a moderator flagged the mission", async () => {
    route(/\/participants$/, () => roster)
    route(/\/missions\/[^/]+$/, () => ({ ...organizerDetail, requiresStaffVerification: true }))
    render(<MissionManage missionId={missionId} onNavigate={() => undefined} />)

    expect(await screen.findByText(/waiting for a moderator/i)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Confirm they were there/ })).toBeNull()
  })

  it("gives a place to a waitlisted participant", async () => {
    route(/\/participants$/, () => roster)
    route(/\/participants\/[^/]+\/approve/, () => ({ status: "CONFIRMED" }))
    route(/\/missions\/[^/]+$/, () => organizerDetail)
    render(<MissionManage missionId={missionId} onNavigate={() => undefined} />)

    fireEvent.click(await screen.findByRole("button", { name: "Give a place" }))
    await waitFor(() =>
      expect(calls.some(entry => entry.url.includes("/participants/p3/approve"))).toBe(true)
    )
  })

  it("refuses a revocation without a recorded reason", async () => {
    route(/\/participants$/, () => roster)
    route(/\/missions\/[^/]+$/, () => organizerDetail)
    render(<MissionManage missionId={missionId} onNavigate={() => undefined} />)

    fireEvent.click(await screen.findByRole("button", { name: "Revoke participation" }))
    fireEvent.change(screen.getByLabelText(/Reason for revoking/), { target: { value: "no" } })
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(calls.some(entry => entry.url.includes("/revoke"))).toBe(false)
  })

  it("revokes participation with a reason", async () => {
    route(/\/participants$/, () => roster)
    route(/\/participants\/[^/]+\/revoke$/, () => ({ status: "ATTENDED" }))
    route(/\/missions\/[^/]+$/, () => organizerDetail)
    render(<MissionManage missionId={missionId} onNavigate={() => undefined} />)

    fireEvent.click(await screen.findByRole("button", { name: "Revoke participation" }))
    fireEvent.change(screen.getByLabelText(/Reason for revoking/), {
      target: { value: "Never attended the event" }
    })
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))
    await waitFor(() => expect(calls.some(entry => entry.url.includes("/revoke"))).toBe(true))
  })

  it("refuses access for a member who is not the organizer", async () => {
    route(/\/participants$/, () => roster)
    route(/\/missions\/[^/]+$/, () => detail({ isOrganizer: false }))
    render(<MissionManage missionId={missionId} onNavigate={() => undefined} />)
    expect(await screen.findByText(/only the organizer/i)).toBeTruthy()
  })
})

describe("Contributions", () => {
  it("shows verified counts and every badge explanation", async () => {
    route(/\/contributions$/, () => ({
      showContributions: true,
      verifiedMissionCount: 3,
      organizedCount: 1,
      badges: [
        {
          code: "FIRST_HELPER",
          label: "First verified helper",
          description: "Verified attendance at one neighborhood mission.",
          explanation: "Attendance was confirmed by someone other than you.",
          awardedAt: "2026-10-01T00:00:00.000Z"
        }
      ],
      participation: [
        {
          id: "p1",
          status: "VERIFIED",
          verifiedAt: "2026-10-01T00:00:00.000Z",
          checkedInAt: null,
          mission: {
            id: missionId,
            title: "Riverside park cleanup",
            category: "CLEANUP",
            status: "COMPLETED",
            startAt: "2026-11-01T14:00:00.000Z",
            neighborhood: "Riverside",
            city: "Atlanta"
          }
        }
      ]
    }))
    route(/\/badges$/, () => [
      {
        code: "FIRST_HELPER",
        label: "First verified helper",
        description: "d",
        explanation: "e"
      },
      {
        code: "COMMUNITY_BUILDER",
        label: "Community builder",
        description: "d",
        explanation: "Three confirmed missions."
      }
    ])
    render(<Contributions onNavigate={() => undefined} />)

    expect(await screen.findByText("Verified missions")).toBeTruthy()
    expect(screen.getByText("Attendance was confirmed by someone other than you.")).toBeTruthy()
    fireEvent.click(screen.getByText("What else there is to earn"))
    expect(screen.getByText("Three confirmed missions.")).toBeTruthy()
  })

  it("says plainly that joining is never enough", async () => {
    route(/\/contributions$/, () => ({
      showContributions: true,
      verifiedMissionCount: 0,
      organizedCount: 0,
      badges: [],
      participation: []
    }))
    route(/\/badges$/, () => [])
    render(<Contributions onNavigate={() => undefined} />)
    expect(await screen.findByText(/joining is never enough/i)).toBeTruthy()
    expect(screen.getByText(/no badges yet/i)).toBeTruthy()
  })

  it("tells a member their record is private without hiding it from them", async () => {
    route(/\/contributions$/, () => ({
      showContributions: false,
      verifiedMissionCount: 1,
      organizedCount: 0,
      badges: [],
      participation: []
    }))
    route(/\/badges$/, () => [])
    render(<Contributions onNavigate={() => undefined} />)
    expect(await screen.findByText(/this page is still yours/i)).toBeTruthy()
  })
})

describe("CommunityModeration", () => {
  it("requires a reason before archiving a mission", async () => {
    route(/\/staff\/queue/, () => [
      {
        id: "rep1",
        targetType: "MISSION",
        reason: "SPAM",
        details: "Posted twice under different names.",
        createdAt: "2026-10-05T00:00:00.000Z",
        reporter: { profile: { firstName: "Ada", displayName: "Ada L" } },
        mission: {
          id: missionId,
          title: "Riverside park cleanup",
          status: "PUBLISHED",
          confirmedCount: 2,
          capacity: 4,
          organizer: { profile: { firstName: "Bo" } }
        }
      }
    ])
    render(<CommunityModeration onNavigate={() => undefined} />)

    fireEvent.click(await screen.findByRole("button", { name: "Archive mission" }))
    fireEvent.change(screen.getByLabelText(/Reason for archiving/), { target: { value: "spam" } })
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(calls.some(entry => entry.url.includes("/moderate"))).toBe(false)
  })

  it("archives with a reason and says the record survives", async () => {
    route(/\/staff\/queue/, () => [
      {
        id: "rep1",
        targetType: "MISSION",
        reason: "SPAM",
        details: null,
        createdAt: "2026-10-05T00:00:00.000Z",
        reporter: { profile: { firstName: "Ada" } },
        mission: {
          id: missionId,
          title: "Riverside park cleanup",
          status: "PUBLISHED",
          confirmedCount: 2,
          capacity: 4,
          organizer: { profile: { firstName: "Bo" } }
        }
      }
    ])
    route(/\/moderate$/, () => ({ status: "ARCHIVED" }))
    render(<CommunityModeration onNavigate={() => undefined} />)

    fireEvent.click(await screen.findByRole("button", { name: "Archive mission" }))
    fireEvent.change(screen.getByLabelText(/Reason for archiving/), {
      target: { value: "Duplicate spam mission" }
    })
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))

    await waitFor(() => expect(calls.some(entry => entry.url.includes("/moderate"))).toBe(true))
    expect(await screen.findByText(/stays on record/i)).toBeTruthy()
  })

  it("shows an empty queue state", async () => {
    route(/\/staff\/queue/, () => [])
    render(<CommunityModeration onNavigate={() => undefined} />)
    expect(await screen.findByText(/nothing waiting for review/i)).toBeTruthy()
  })

  it("surfaces a moderation failure instead of claiming success", async () => {
    route(/\/staff\/queue/, () => [
      {
        id: "rep1",
        targetType: "MISSION",
        reason: "SPAM",
        details: null,
        createdAt: "2026-10-05T00:00:00.000Z",
        reporter: { profile: { firstName: "Ada" } },
        mission: {
          id: missionId,
          title: "Riverside park cleanup",
          status: "PUBLISHED",
          confirmedCount: 2,
          capacity: 4,
          organizer: { profile: { firstName: "Bo" } }
        }
      }
    ])
    route(/\/moderate$/, () => json({ message: "Only staff can do that" }, 403))
    render(<CommunityModeration onNavigate={() => undefined} />)

    fireEvent.click(await screen.findByRole("button", { name: "Restore mission" }))
    fireEvent.change(screen.getByLabelText(/Reason for restoring/), {
      target: { value: "Checked and it is fine" }
    })
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))
    expect(await screen.findByRole("alert")).toBeTruthy()
  })
})