import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CSRF_HEADER, api, onSessionExpired } from "../api/client"

/**
 * The refresh credential is an HttpOnly cookie, so the client can only
 * prove a session is alive by calling the API. These tests pin the
 * renewal contract the whole app depends on.
 */
const REFRESH_URL = "/auth/refresh"

let requests: Array<{ url: string; method: string; headers: Headers; credentials?: RequestCredentials }> = []
let responses: Array<(url: string) => Response> = []

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

beforeEach(() => {
  requests = []
  responses = []
  window.localStorage.setItem("neighborly.access_token", "stale-token")
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    requests.push({
      url,
      method: init?.method ?? "GET",
      headers: init?.headers as Headers,
      credentials: init?.credentials,
    })
    const next = responses.shift()
    return next ? next(url) : json({ message: "unmocked" }, 501)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe("access token renewal", () => {
  it("sends credentials so the HttpOnly refresh cookie is attached", async () => {
    responses.push(
      () => json({ message: "Unauthorized" }, 401),
      () => json({ accessToken: "fresh-token", user: { id: "u1", email: "a@b.c" } }),
      () => json({ id: "u1", email: "a@b.c" })
    )
    await api.auth.me()

    const refresh = requests.find(entry => entry.url.endsWith(REFRESH_URL))
    expect(refresh?.credentials).toBe("include")
  })

  it("retries the original request once with the renewed token", async () => {
    responses.push(
      () => json({ message: "Unauthorized" }, 401),
      () => json({ accessToken: "fresh-token", user: { id: "u1", email: "a@b.c" } }),
      () => json({ id: "u1", email: "a@b.c" })
    )

    await api.auth.me()

    expect(requests.filter(entry => entry.url.endsWith(REFRESH_URL))).toHaveLength(1)
    const retry = requests.at(-1)!
    expect(retry.headers.get("Authorization")).toBe("Bearer fresh-token")
    expect(window.localStorage.getItem("neighborly.access_token")).toBe("fresh-token")
  })

  it("does not retry more than once", async () => {
    responses.push(
      () => json({ message: "Unauthorized" }, 401),
      () => json({ accessToken: "fresh-token", user: { id: "u1", email: "a@b.c" } }),
      () => json({ message: "Unauthorized" }, 401)
    )

    await expect(api.auth.me()).rejects.toThrow("Unauthorized")
    expect(requests.filter(entry => entry.url.endsWith(REFRESH_URL))).toHaveLength(1)
  })

  it("shares one refresh across concurrent 401s", async () => {
    // Both calls 401 first, then a single shared refresh, then two retries.
    responses.push(
      () => json({ message: "Unauthorized" }, 401),
      () => json({ message: "Unauthorized" }, 401),
      () => json({ accessToken: "fresh-token", user: { id: "u1", email: "a@b.c" } }),
      () => json({ ok: true }),
      () => json({ ok: true })
    )

    await Promise.all([api.auth.me(), api.auth.me()])
    // One rotation, not two: rotating twice would trip reuse detection.
    expect(requests.filter(entry => entry.url.endsWith(REFRESH_URL))).toHaveLength(1)
  })

  it("clears the session and notifies listeners when refresh is rejected", async () => {
    const listener = vi.fn()
    const unsubscribe = onSessionExpired(listener)
    responses.push(
      () => json({ message: "Unauthorized" }, 401),
      () => json({ message: "Unauthorized" }, 401)
    )

    await expect(api.auth.me()).rejects.toThrow("Unauthorized")
    expect(window.localStorage.getItem("neighborly.access_token")).toBeNull()
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it("keeps the session when renewal fails transiently", async () => {
    const listener = vi.fn()
    const unsubscribe = onSessionExpired(listener)
    responses.push(() => json({ message: "Unauthorized" }, 401), () => json({ message: "bad gateway" }, 502))

    await expect(api.auth.me()).rejects.toThrow("Unauthorized")
    // A server blip is not an expired session.
    expect(window.localStorage.getItem("neighborly.access_token")).toBe("stale-token")
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it("never retries an auth route through the renewal path", async () => {
    responses.push(() => json({ message: "Invalid email or password" }, 401))
    await expect(api.auth.login({ email: "a@b.c", password: "x" })).rejects.toThrow("Invalid email or password")
    expect(requests.filter(entry => entry.url.endsWith(REFRESH_URL))).toHaveLength(0)
  })

  it("sends the CSRF cookie as a header on mutations only", async () => {
    document.cookie = "neighborly.csrf=csrf-value-from-cookie"
    responses.push(() => json({ id: "l1" }))
    await api.listings.create({ title: "Desk", categoryId: "c1" } as never)

    const create = requests.at(-1)!
    expect(create.headers.get(CSRF_HEADER)).toBe("csrf-value-from-cookie")

    responses.push(() => json([]))
    await api.listings.list()
    expect(requests.at(-1)!.headers.get(CSRF_HEADER)).toBeNull()
  })

  it("signs out locally even when the logout call cannot reach the server", async () => {
    responses.push(() => json({ message: "network" }, 500))
    await api.auth.signOut()
    expect(window.localStorage.getItem("neighborly.access_token")).toBeNull()
  })
})