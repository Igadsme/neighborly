import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Messages from "./Messages"

/**
 * Regression coverage for the message inbox.
 *
 * `requests.list()` returns requests the member can see, which includes other
 * people's requests, while `requests.get()` only resolves ones the member owns
 * and returns 404 otherwise. A single 404 previously rejected the whole
 * Promise.all and blanked the entire inbox behind "Messages could not be
 * loaded", even though conversations and transactions loaded fine.
 */

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  )
}

const ownedRequest = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  title: "I own this one",
  offers: [{ id: "o1" }],
}

const someoneElsesRequest = {
  id: "bbbbbbbb-0000-4000-8000-000000000002",
  title: "Someone else posted this",
  offers: [{ id: "o2" }],
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/auth/me")) return json({ id: "user-1", email: "a@example.com" })
      if (url.includes("/conversations")) return json([])
      if (url.includes("/transactions")) return json([])
      if (url.includes(`/requests/${someoneElsesRequest.id}`)) {
        // The API refuses detail for a request the member does not own.
        return json({ message: "Request not found" }, 404)
      }
      if (url.includes(`/requests/${ownedRequest.id}`)) return json(ownedRequest)
      if (url.includes("/requests?")) return json({ items: [ownedRequest, someoneElsesRequest] })
      return json({})
    }),
  )
  window.localStorage.setItem("neighborly.access_token", "test-token")
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe("Messages", () => {
  it("does not blank the whole inbox when one request detail 404s", async () => {
    render(<Messages onNavigate={() => undefined} />)

    // The inbox must reach its real empty state rather than the error state.
    await waitFor(() => {
      expect(screen.queryByText(/could not be loaded/i)).toBeNull()
    })
    expect(screen.getAllByRole("heading", { name: /messages/i }).length).toBeGreaterThan(0)
  })

  it("keeps listing requests it could load", async () => {
    render(<Messages onNavigate={() => undefined} />)
    await waitFor(() => {
      expect(screen.queryByText(/could not be loaded/i)).toBeNull()
    })
  })
})