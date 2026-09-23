import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Messages from "./Messages"

const meId = "11111111-1111-4111-8111-111111111111"
const otherId = "22222222-2222-4222-8222-222222222222"
const conversationId = "44444444-4444-4444-8444-444444444444"
const messageId = "77777777-7777-4777-8777-777777777777"

const conversation = {
  id: conversationId,
  createdAt: "2026-09-23T12:00:00.000Z",
  updatedAt: "2026-09-23T12:00:00.000Z",
  participants: [
    { userId: meId, lastReadAt: null, user: { id: meId, profile: { displayName: "Ada L", firstName: "Ada" } } },
    {
      userId: otherId,
      lastReadAt: null,
      user: { id: otherId, profile: { displayName: "Grace H", firstName: "Grace", neighborhood: "Decatur" } },
    },
  ],
  messages: [
    {
      id: messageId,
      conversationId,
      senderId: otherId,
      body: "Is the chair still available?",
      createdAt: "2026-09-23T12:05:00.000Z",
    },
  ],
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

beforeEach(() => {
  window.localStorage.setItem("neighborly.access_token", "test-token")
})

describe("Message report control", () => {
  it("reports the other person's latest message from the shield button", async () => {
    const bodies: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (typeof init?.body === "string") bodies.push(init.body)
        if (url.endsWith("/users/me")) return json({ id: meId, email: "ada@example.com" })
        if (url.endsWith("/conversations")) return json([conversation])
        if (url.includes("/transactions")) return json([])
        if (url.endsWith("/requests")) return json([])
        if (url.includes("/messages")) return json(conversation.messages)
        if (url.includes("/read")) return json({ ok: true })
        if (url.includes("/safety/reports")) return json({ id: "report-1", status: "OPEN" }, 201)
        return json({ message: "unexpected" }, 500)
      }),
    )
    render(<Messages />)
    fireEvent.click(await screen.findByText("Grace H"))
    fireEvent.click(await screen.findByRole("button", { name: "Report this conversation" }))
    expect(await screen.findByText("Report submitted.")).toBeTruthy()
    expect(bodies.some((body) => body.includes('"targetType":"MESSAGE"') && body.includes(messageId))).toBe(true)
  })
})
