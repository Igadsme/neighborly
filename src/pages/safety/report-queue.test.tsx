import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import Navigation from "../../components/Navigation"
import ReportQueue from "./ReportQueue"

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

const report = {
  id: "report-1",
  targetType: "LISTING",
  targetId: "listing-1",
  reason: "SPAM",
  details: "Repeated unwanted posts.",
  status: "OPEN",
  createdAt: "2026-10-01T12:00:00.000Z",
  reporter: { id: "user-2", profile: { displayName: "Ada L", firstName: "Ada" } },
}

describe("report queue", () => {
  it("hides actions when the member is not staff", async () => {
    route((url) => {
      if (url.includes("/moderation/reports")) return json({ message: "Moderator access is required" }, 403)
      return json([])
    })
    render(<ReportQueue />)
    expect(await screen.findByText("Moderator access is required")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Hide" })).toBeNull()
    expect(screen.queryByText("Repeated unwanted posts.")).toBeNull()
  })

  it("hides, and shows the API error when an action is rejected", async () => {
    const calls: Array<{ url: string; method?: string; body?: string }> = []
    route((url, init) => {
      calls.push({ url, method: init?.method, body: typeof init?.body === "string" ? init.body : undefined })
      if (init?.method === "POST" && url.includes("/actions")) {
        const body = JSON.parse(String(init.body))
        if (body.kind === "SUSPEND_USER") {
          return json({ message: "This action does not apply to that report" }, 409)
        }
        return json({ ...report, status: "RESOLVED" })
      }
      return json([report])
    })
    render(<ReportQueue />)
    expect(await screen.findByText("Repeated unwanted posts.")).toBeTruthy()
    expect(screen.getByText(/Ada L/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Hide" }))
    await waitFor(() =>
      expect(calls.some((call) => call.method === "POST" && call.body?.includes('"kind":"HIDE"'))).toBe(true),
    )
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }))
    expect(await screen.findByText("This action does not apply to that report")).toBeTruthy()
  })

  it("shows the report queue link only after the staff probe returns a list", async () => {
    route((url) => {
      if (url.includes("/moderation/reports")) return json([report])
      if (url.includes("/passport/me")) {
        return json({ displayName: "Ada", avatarUrl: null, neighborhood: null, city: null })
      }
      return json({ items: [], total: 0 })
    })
    const view = render(
      <Navigation currentPage="home" onNavigate={() => undefined} onSignOut={() => undefined} />,
    )
    fireEvent.click(screen.getAllByRole("button", { name: /Account menu/ })[0])
    expect(await screen.findByRole("button", { name: "Report queue" })).toBeTruthy()
    view.unmount()

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/moderation/reports")) return json({ message: "Moderator access is required" }, 403)
      if (url.includes("/passport/me")) {
        return json({ displayName: "Ada", avatarUrl: null, neighborhood: null, city: null })
      }
      return json({ items: [], total: 0 })
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<Navigation currentPage="home" onNavigate={() => undefined} onSignOut={() => undefined} />)
    fireEvent.click(screen.getAllByRole("button", { name: /Account menu/ })[0])
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/moderation/reports"))).toBe(true),
    )
    expect(screen.queryByRole("button", { name: "Report queue" })).toBeNull()
  })
})
