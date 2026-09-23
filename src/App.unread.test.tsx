import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import App from "./App"
import Navigation from "./components/Navigation"
import type { ApiConversation } from "./api/types"

const me = { id: "user-1", email: "ada@example.com" }

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  )
}

function thread(
  id: string,
  senderId: string,
  lastReadAt?: string,
): ApiConversation {
  return {
    id,
    createdAt: "2026-09-22T12:00:00.000Z",
    updatedAt: "2026-09-22T13:00:00.000Z",
    participants: [
      { userId: "user-1", lastReadAt: lastReadAt ?? null },
      { userId: "user-2" },
    ],
    messages: [
      {
        id: `${id}-m`,
        conversationId: id,
        senderId,
        body: "hello",
        createdAt: "2026-09-22T13:00:00.000Z",
      },
    ],
  }
}

function messageBadges() {
  return [...document.querySelectorAll("span")].filter(
    (el) =>
      el.className.includes("bg-[#E8694A]") &&
      el.className.includes("rounded-full"),
  )
}

function route(handler: (url: string) => Promise<Response> | Response) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => handler(String(input)))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function requestedPaths(fetchMock: ReturnType<typeof route>) {
  return fetchMock.mock.calls.map((call) => String(call[0]))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe("navigation unread badge", () => {
  it("shows the live unread conversation count when signed in", async () => {
    window.localStorage.setItem("neighborly.access_token", "test-token")
    const fetchMock = route((url) => {
      if (url.includes("/users/me")) return json(me)
      if (url.includes("/conversations")) {
        return json([
          thread("c1", "user-2"),
          thread("c2", "user-2", "2026-09-22T12:00:00.000Z"),
          thread("c3", "user-2"),
          thread("c4", "user-1"),
          thread("c5", "user-2", "2026-09-22T14:00:00.000Z"),
        ])
      }
      return json({ message: "not found" }, 404)
    })

    render(<App />)

    await waitFor(() => {
      expect(messageBadges().map((badge) => badge.textContent)).toEqual([
        "3",
        "3",
        "3",
      ])
    })
    const paths = requestedPaths(fetchMock)
    expect(paths.some((path) => path.includes("/conversations"))).toBe(true)
    expect(paths.some((path) => path.includes("/notifications"))).toBe(false)
    expect(screen.getByRole("button", { name: "Post Listing" })).toBeTruthy()
  })

  it("hides the badge when every conversation is read", async () => {
    window.localStorage.setItem("neighborly.access_token", "test-token")
    const fetchMock = route((url) => {
      if (url.includes("/users/me")) return json(me)
      if (url.includes("/conversations")) {
        return json([
          thread("c1", "user-2", "2026-09-22T14:00:00.000Z"),
          thread("c2", "user-1"),
        ])
      }
      return json({ message: "not found" }, 404)
    })

    render(<App />)

    await waitFor(() => {
      expect(
        requestedPaths(fetchMock).some((path) =>
          path.includes("/conversations"),
        ),
      ).toBe(true)
      expect(messageBadges()).toEqual([])
    })
    expect(screen.getByRole("button", { name: "Post Listing" })).toBeTruthy()
  })

  it("hides the badge on 401 and when signed out", async () => {
    window.localStorage.setItem("neighborly.access_token", "expired")
    const unauthorized = route((url) => {
      if (url.includes("/users/me"))
        return json({ message: "Unauthorized" }, 401)
      if (url.includes("/conversations")) return json([thread("c1", "user-2")])
      return json({ message: "Unauthorized" }, 401)
    })

    const { unmount } = render(<App />)
    expect(
      await screen.findByRole("button", { name: "Post a Listing" }),
    ).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Post Listing" })).toBeNull()
    expect(messageBadges()).toEqual([])
    expect(window.localStorage.getItem("neighborly.access_token")).toBeNull()
    expect(
      requestedPaths(unauthorized).some((path) =>
        path.includes("/conversations"),
      ),
    ).toBe(false)
    unmount()

    window.localStorage.clear()
    const signedOut = route(() =>
      json({ message: "should not be called" }, 500),
    )
    render(<App />)
    expect(
      await screen.findByRole("button", { name: "Post a Listing" }),
    ).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Post Listing" })).toBeNull()
    expect(messageBadges()).toEqual([])
    expect(signedOut).not.toHaveBeenCalled()

    cleanup()
    render(<Navigation currentPage="home" onNavigate={() => undefined} />)
    expect(messageBadges()).toEqual([])
  })

  it("hides the badge when the conversation list returns 401", async () => {
    window.localStorage.setItem("neighborly.access_token", "test-token")
    const fetchMock = route((url) => {
      if (url.includes("/users/me")) return json(me)
      if (url.includes("/conversations"))
        return json({ message: "Unauthorized" }, 401)
      return json({ message: "not found" }, 404)
    })

    render(<App />)

    await waitFor(() => {
      expect(
        requestedPaths(fetchMock).some((path) =>
          path.includes("/conversations"),
        ),
      ).toBe(true)
      expect(messageBadges()).toEqual([])
    })
    expect(screen.getByRole("button", { name: "Post Listing" })).toBeTruthy()
    expect(
      requestedPaths(fetchMock).some((path) => path.includes("/notifications")),
    ).toBe(false)
  })
})
