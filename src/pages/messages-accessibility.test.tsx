import { cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Messages from "./Messages"
import Navigation from "../components/Navigation"

/**
 * Accessibility regressions found by the final 12-milestone audit.
 *
 * Every check here corresponds to a real axe violation or a broken keyboard
 * affordance that the browser harness reported: icon-only buttons with no
 * accessible name, a composer labelled only by its placeholder, and a screen
 * that lost its only level-one heading whenever the layout swapped panes.
 *
 * These are asserted in jsdom as well as in the browser harness so they are
 * enforced by `pnpm test`, which is what CI actually runs.
 */

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  )
}

const peerParticipant = {
  userId: "user-2",
  user: { id: "user-2", profile: { displayName: "James Rivera" } },
}

const conversation = {
  id: "dddddddd-0000-4000-8000-000000000004",
  title: "Herman Miller Ratio desk",
  participants: [peerParticipant],
  unreadCount: 0,
  lastMessageAt: "2026-03-01T10:00:00.000Z",
  // The list view reads messages[0] directly, so the thread has to carry the
  // array rather than rely on the messages endpoint being called first.
  messages: [],
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/auth/me")) return json({ id: "user-1", email: "a@example.com" })
      if (url.includes("/conversations/")) return json([])
      if (url.includes("/conversations")) return json([conversation])
      if (url.includes("/transactions")) return json([])
      // The request feed is a paginated envelope, not a bare array.
      if (url.includes("/requests")) return json({ items: [], total: 0 })
      return json({ items: [], total: 0 })
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe("Messages accessibility", () => {
  it("gives every icon-only control an accessible name", async () => {
    const { container } = render(<Messages onNavigate={() => undefined} />)
    // The conversation pane is only rendered once a conversation has been
    // selected, which happens after its messages load. Waiting on the peer's
    // name is not enough: the conversation list shows the same name, so that
    // resolves before the pane exists and the assertions below race it.
    await waitFor(() => expect(container.querySelector("textarea")).toBeTruthy())

    // Asserted on the rendered attributes rather than through getByRole: the
    // back control is inside a pane that is display:none until a conversation
    // is open, and role queries skip what the accessibility tree treats as
    // hidden. The browser harness covers the same controls in a real layout.
    const labels = [...container.querySelectorAll("button[aria-label]")].map(
      button => button.getAttribute("aria-label"),
    )
    expect(labels).toContain("Back to conversations")
    expect(labels).toContain("Conversation filters")
    expect(labels).toContain("Attach a photo")
    expect(labels).toContain("Send message")

    // A placeholder is not a label. Scoped to the composer, because the list
    // also has a "Search messages" field.
    const composer = container.querySelector("textarea")
    expect(composer?.getAttribute("aria-label")).toBe("Message")
  })

  it("keeps the back control large enough to tap", async () => {
    const { container } = render(<Messages onNavigate={() => undefined} />)
    await waitFor(() => expect(container.querySelector("textarea")).toBeTruthy())

    const back = container.querySelector('button[aria-label="Back to conversations"]')
    // The button was 18px tall, well under the 24px minimum the harness
    // enforces for touch targets.
    expect(back?.className).toMatch(/min-h-11/)
  })

  it("always has exactly one level-one heading", async () => {
    const { container } = render(<Messages onNavigate={() => undefined} />)
    await waitFor(() => expect(container.querySelector("textarea")).toBeTruthy())

    // Two h1s is the regression this guards against: a screen-level heading
    // plus the one in the list. jsdom applies no stylesheet, so the narrow
    // layout where the list's heading disappears is not reproducible here -
    // that half of the defect is covered by the browser harness, which caught
    // it in a real viewport.
    const headings = container.querySelectorAll("h1")
    expect(headings).toHaveLength(1)
    // It names whichever view is showing, not a fixed string.
    expect(headings[0].textContent?.trim()).toBeTruthy()
  })
})

describe("Navigation accessibility", () => {
  it("names every bottom navigation button", async () => {
    render(
      <Navigation
        currentPage="home"
        onNavigate={() => undefined}
        onSignOut={() => undefined}
        unreadMessages={0}
      />,
    )

    // Scoped to the bottom bar: the wide navigation carries the same items as
    // visible text, so an unscoped query would pass even with the labels gone.
    const bottomNav = document.querySelector('nav[aria-label="Primary"]')
    expect(bottomNav).toBeTruthy()
    const labels = [...bottomNav!.querySelectorAll("button")].map(
      button => button.getAttribute("aria-label"),
    )
    // These five are icon-only, so without aria-label they are unnamed buttons
    // as far as a screen reader is concerned.
    expect(labels).toEqual(["Home", "Explore", "Post", "Messages", "Missions"])
  })
})