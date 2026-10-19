import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import App from "./App"
import { resetRememberedAccountToken } from "./lib/paths"

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  )
}

function installFetch() {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes("/auth/verify-email")) {
      return json({ verified: true, email: "ada@example.com" })
    }
    if (url.includes("/users/me")) return json({ id: "user-1", email: "ada@example.com" })
    if (url.includes("/categories")) return json([])
    if (url.includes("/conversations")) return json([])
    if (url.includes("/notifications")) {
      return json({ items: [], total: 0, unread: 0, limit: 8, offset: 0 })
    }
    if (url.includes("/passport")) {
      return json({ displayName: "Ada", avatarUrl: null, neighborhood: null, city: null })
    }
    if (url.includes("/listings")) return json({ items: [], total: 0, limit: 24, offset: 0 })
    return json([])
  })
}

beforeEach(() => {
  resetRememberedAccountToken()
  window.history.replaceState({}, "", "/")
  installFetch()
})

afterEach(() => {
  cleanup()
  resetRememberedAccountToken()
  window.history.replaceState({}, "", "/")
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

describe("URL routing", () => {
  it("opens the listing for the path already in the address bar", async () => {
    window.localStorage.setItem("neighborly.access_token", "test-token")
    window.history.replaceState({}, "", "/listings/l1")
    render(<App />)
    expect(
      (await screen.findAllByText("West Elm Mid-Century Modern Sofa — Excellent Condition")).length,
    ).toBeGreaterThan(0)
    expect(window.location.pathname).toBe("/listings/l1")
  })

  it("shows a 404 with a way home for an unknown path", async () => {
    window.history.replaceState({}, "", "/not-a-neighborly-page")
    render(<App />)
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Go home" }))
    expect(await screen.findByRole("button", { name: "Post a Listing" })).toBeTruthy()
    expect(window.location.pathname).toBe("/")
  })

  it("opens a verify link, then removes the token from the address bar", async () => {
    window.history.replaceState({}, "", "/?verify=secret-token")
    render(<App />)
    expect(await screen.findByText("Verify your email")).toBeTruthy()
    expect(window.location.pathname).toBe("/verify-email")
    expect(window.location.search).toBe("")
    expect(window.location.href).not.toContain("secret-token")
    expect(await screen.findByText(/email address is verified/i)).toBeTruthy()
  })

  it("opens a reset link, then removes the token from the address bar", async () => {
    window.history.replaceState({}, "", "/?reset=reset-token")
    render(<App />)
    expect(await screen.findByText("Choose a new password")).toBeTruthy()
    expect(window.location.pathname).toBe("/reset-password")
    expect(window.location.search).toBe("")
    expect(window.location.href).not.toContain("reset-token")
  })

  it("restores the previous screen when the browser moves back", async () => {
    window.localStorage.setItem("neighborly.access_token", "test-token")
    window.history.replaceState({}, "", "/listings/l1")
    render(<App />)
    expect(
      (await screen.findAllByText("West Elm Mid-Century Modern Sofa — Excellent Condition")).length,
    ).toBeGreaterThan(0)

    window.history.pushState({ neighborly: "/not-a-neighborly-page" }, "", "/not-a-neighborly-page")
    window.dispatchEvent(new PopStateEvent("popstate"))
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy()
    expect(screen.queryByText("West Elm Mid-Century Modern Sofa — Excellent Condition")).toBeNull()

    window.history.back()
    await waitFor(() => {
      expect(window.location.pathname).toBe("/listings/l1")
    })
    expect(
      (await screen.findAllByText("West Elm Mid-Century Modern Sofa — Excellent Condition")).length,
    ).toBeGreaterThan(0)
  })
})
