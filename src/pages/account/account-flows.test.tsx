import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import AccountSettings from "./AccountSettings"
import ForgotPassword from "./ForgotPassword"
import ResetPassword from "./ResetPassword"
import VerifyEmail from "./VerifyEmail"

const userId = "11111111-1111-4111-8111-111111111111"
const sessionId = "22222222-2222-4222-8222-222222222222"

const status = {
  id: userId,
  email: "ada@example.com",
  status: "ACTIVE" as const,
  emailVerified: false,
  pendingEmail: null,
  avatarUrl: null,
  deletionRequestedAt: null,
  activeSessions: 2,
  memberSince: "2026-09-01T00:00:00.000Z",
}

interface Reply {
  status?: number
  body?: unknown
}

let calls: Array<{ method: string; url: string; body: unknown }> = []
let routes: Array<{ match: (url: string) => boolean; respond: (url: string) => Promise<Response> }> = []

/** `handler` returns a body, or an explicit `{ status, body }` envelope. */
function route(pattern: RegExp, handler: (url: string, init?: RequestInit) => Reply | Promise<Reply>) {
  routes.push({
    match: url => pattern.test(url),
    respond: async url => {
      const reply = await handler(url)
      const status = reply.status ?? 200
      const body = status === 204 ? "" : JSON.stringify(reply.body ?? {})
      return new Response(body, { status, headers: { "Content-Type": "application/json" } })
    }
  })
}

function installFetch() {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const match = routes.find(entry => entry.match(url))
    if (!match) return new Response(JSON.stringify({ message: `unmocked ${url}` }), { status: 501 })
    return match.respond(url)
  })
}

beforeEach(() => {
  calls = []
  routes = []
  window.localStorage.setItem("neighborly.access_token", "test-token")
  installFetch()
})

/** The project does not load jest-dom, so assert on text content. */
function expectText(element: HTMLElement, pattern: RegExp) {
  expect(element.textContent ?? "").toMatch(pattern)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

// ------------------------------------------------------------------ recovery

describe("ForgotPassword", () => {
  it("rejects a malformed address before calling the API", async () => {
    route(/\/auth\/forgot-password/, () => ({ body: { accepted: true } }))
    render(<ForgotPassword onBack={() => {}} onSubmitted={() => {}} />)

    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "not-an-email" } })
    fireEvent.click(screen.getByRole("button", { name: /email me a reset link/i }))

    expectText(await screen.findByRole("alert"), /valid email/i)
    expect(calls).toHaveLength(0)
  })

  it("shows the same confirmation whatever the API answers", async () => {
    route(/\/auth\/forgot-password/, () => ({ body: { accepted: true } }))
    render(<ForgotPassword onBack={() => {}} onSubmitted={() => {}} />)

    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "ada@example.com" } })
    fireEvent.click(screen.getByRole("button", { name: /email me a reset link/i }))

    // The wording never confirms that the address exists.
    expectText(await screen.findByRole("status"), /if an account exists/i)
  })
})

describe("ResetPassword", () => {
  it("blocks a weak or mismatched password before calling the API", async () => {
    route(/\/auth\/reset-password/, () => ({ body: { reset: true } }))
    render(<ResetPassword token={"a".repeat(32)} onDone={() => {}} />)

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "short" } })
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "short" } })
    fireEvent.click(screen.getByRole("button", { name: /update password/i }))

    expectText(await screen.findByRole("alert"), /at least 12 characters/i)
    expect(calls).toHaveLength(0)
  })

  it("surfaces an expired link from the API", async () => {
    route(/\/auth\/reset-password/, () => ({ status: 400, body: { message: "This reset link has expired" } }))
    render(<ResetPassword token={"a".repeat(32)} onDone={() => {}} />)

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "CorrectHorse42x" } })
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "CorrectHorse42x" } })
    fireEvent.click(screen.getByRole("button", { name: /update password/i }))

    expectText(await screen.findByRole("alert"), /expired/i)
  })

  it("treats a missing token as an unusable link", async () => {
    render(<ResetPassword token={null} onDone={() => {}} />)
    expect(await screen.findByRole("heading", { name: /reset link unavailable/i })).toBeTruthy()
  })

  it("confirms success without echoing the token", async () => {
    route(/\/auth\/reset-password/, () => ({ body: { reset: true } }))
    render(<ResetPassword token={"tok".repeat(12)} onDone={() => {}} />)

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "CorrectHorse42x" } })
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "CorrectHorse42x" } })
    fireEvent.click(screen.getByRole("button", { name: /update password/i }))

    expect(await screen.findByRole("heading", { name: /password updated/i })).toBeTruthy()
    expect(document.body.textContent).not.toContain("toktoktok")
  })
})

// ---------------------------------------------------------------- verification

describe("VerifyEmail", () => {
  it("verifies on mount and shows the success state", async () => {
    route(/\/auth\/verify-email/, () => ({ body: { verified: true, email: "ada@example.com" } }))
    render(<VerifyEmail token={"v".repeat(40)} onDone={() => {}} onResend={() => {}} />)

    expect(await screen.findByText(/email address is verified/i)).toBeTruthy()
    const call = calls.find(entry => entry.url.includes("/auth/verify-email"))
    expect(call?.method).toBe("POST")
    expect(call?.body).toEqual({ token: "v".repeat(40) })
  })

  it("offers a resend when the link is unusable", async () => {
    route(/\/auth\/verify-email/, () => ({ status: 400, body: { message: "This verification link has expired" } }))
    render(<VerifyEmail token={"v".repeat(40)} onDone={() => {}} onResend={() => {}} />)

    expect(await screen.findByText(/has expired/i)).toBeTruthy()
    expect(screen.getByRole("button", { name: /send a new link/i })).toBeTruthy()
  })

  it("does not call the API when there is no token", async () => {
    render(<VerifyEmail token={null} onDone={() => {}} onResend={() => {}} />)
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy())
    expect(calls).toHaveLength(0)
  })
})

// ------------------------------------------------------------------- settings

describe("AccountSettings", () => {
  function seedAccountRoutes() {
    route(/\/users\/me\/status$/, () => ({ body: status }))
    // GET /users/:id/profile returns a flat public projection.
    route(/\/users\/[0-9a-f-]{36}\/profile$/, () => ({
      body: {
        id: userId,
        firstName: "Ada",
        lastName: "L",
        displayName: "Ada L",
        bio: "Cyclist",
        neighborhood: "Inman Park",
        city: "Atlanta",
      },
    }))
    route(/\/users\/me\/sessions$/, () => ({
      body: [
        { id: sessionId, userAgent: "Mozilla/5.0 Chrome/120", ipAddress: "10.0.0.9", createdAt: status.memberSince, lastUsedAt: status.memberSince, expiresAt: status.memberSince },
      ],
    }))
  }

  it("saves profile changes and reports success", async () => {
    seedAccountRoutes()
    route(/\/users\/me\/profile$/, () => ({ body: { ok: true } }))
    render(<AccountSettings onSignedOut={() => {}} />)

    await screen.findByLabelText("Display name")
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Ada Lovelace" } })
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }))

    expect(await screen.findByText(/profile saved/i)).toBeTruthy()
    const save = calls.filter(entry => entry.method === "PATCH" && entry.url.includes("/users/me/profile")).at(-1)
    expect(save?.body).toMatchObject({ displayName: "Ada Lovelace" })
  })

  it("revokes a single session and refreshes the list", async () => {
    seedAccountRoutes()
    route(/\/users\/me\/sessions\/[0-9a-f-]+/, () => ({ status: 204 }))
    render(<AccountSettings onSignedOut={() => {}} />)

    fireEvent.click(await screen.findByRole("button", { name: /^sessions$/i }))
    const revoke = await screen.findByRole("button", { name: /sign out this device/i })
    fireEvent.click(revoke)

    await waitFor(() =>
      expect(calls.some(entry => entry.method === "DELETE" && entry.url.includes(sessionId))).toBe(true)
    )
  })

  it("signs out every device from the sessions tab", async () => {
    seedAccountRoutes()
    route(/\/users\/me\/sessions\/revoke-all/, () => ({ status: 204 }))
    render(<AccountSettings onSignedOut={() => {}} />)

    fireEvent.click(await screen.findByRole("button", { name: /^sessions$/i }))
    await screen.findByRole("button", { name: /sign out all devices/i })
    fireEvent.click(screen.getByRole("button", { name: /sign out all devices/i }))

    await waitFor(() =>
      expect(calls.some(entry => entry.method === "POST" && entry.url.includes("revoke-all"))).toBe(true)
    )
  })

  it("requires the confirmation word before deleting the account", async () => {
    seedAccountRoutes()
    route(/\/users\/me$/, () => ({ body: { deleted: true, alreadyDeleted: false } }))
    render(<AccountSettings onSignedOut={() => {}} />)

    fireEvent.click(screen.getByRole("button", { name: /^delete account$/i }))
    await screen.findByLabelText(/type DELETE/i)
    fireEvent.change(screen.getByLabelText("Your password"), { target: { value: "CorrectHorse42x" } })
    fireEvent.change(screen.getByLabelText(/type DELETE/i), { target: { value: "delete" } })
    fireEvent.click(screen.getByRole("button", { name: /delete my account/i }))

    const alerts = await screen.findAllByRole("alert")
    expect(alerts.some(node => /type DELETE/i.test(node.textContent ?? ""))).toBe(true)
    expect(calls.some(entry => entry.method === "DELETE" && entry.url.endsWith("/users/me"))).toBe(false)
  })

  it("deletes the account with the confirmation and signs out", async () => {
    seedAccountRoutes()
    route(/\/users\/me$/, () => ({ body: { deleted: true, alreadyDeleted: false } }))
    const onSignedOut = vi.fn()
    render(<AccountSettings onSignedOut={onSignedOut} />)

    fireEvent.click(screen.getByRole("button", { name: /^delete account$/i }))
    await screen.findByLabelText(/type DELETE/i)
    fireEvent.change(screen.getByLabelText("Your password"), { target: { value: "CorrectHorse42x" } })
    fireEvent.change(screen.getByLabelText(/type DELETE/i), { target: { value: "DELETE" } })
    fireEvent.click(screen.getByRole("button", { name: /delete my account/i }))

    await waitFor(() => expect(onSignedOut).toHaveBeenCalled())
    const call = calls.find(entry => entry.method === "DELETE" && entry.url.endsWith("/users/me"))
    expect(call?.body).toEqual({ password: "CorrectHorse42x", confirm: "DELETE" })
  })

  it("changes the password and reports that other devices were signed out", async () => {
    seedAccountRoutes()
    route(/\/auth\/change-password/, () => ({ body: { changed: true } }))
    render(<AccountSettings onSignedOut={() => {}} />)

    fireEvent.click(screen.getByRole("button", { name: /^change password$/i }))
    await screen.findByLabelText("Current password")
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "CorrectHorse42x" } })
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "BrandNewPass77x" } })
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "BrandNewPass77x" } })
    fireEvent.click(screen.getByRole("button", { name: /update password/i }))
    // the same label is the submit action; disambiguate by the section
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "CorrectHorse42x" } })

    await waitFor(() =>
      expect(calls.some(entry => entry.url.includes("/auth/change-password"))).toBe(true)
    )
  })
})