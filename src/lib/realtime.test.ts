import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The realtime client is tested against a fake Socket.IO server so the
 * reconnect, unsubscribe, and duplicate-event behaviours are exercised
 * without a network.
 */

type Listener = (...args: unknown[]) => void

class FakeSocket {
  auth: unknown
  autoConnect: boolean
  emitted: Array<{ event: string; payload: unknown }> = []
  private listeners = new Map<string, Set<Listener>>()
  disconnected = false

  constructor(public options: Record<string, unknown>) {
    this.auth = options.auth
    this.autoConnect = Boolean(options.autoConnect)
  }

  on(event: string, listener: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(listener)
    return this
  }

  emit(event: string, payload?: unknown) {
    this.emitted.push({ event, payload })
    return this
  }

  disconnect() {
    this.disconnected = true
    return this
  }

  /** Drives the server side of the connection. */
  server(event: string, payload?: unknown) {
    for (const listener of this.listeners.get(event) ?? []) listener(payload)
  }
}

let socket: FakeSocket | null = null

async function loadRealtime() {
  vi.resetModules()
  socket = null
  vi.doMock("socket.io-client", () => ({
    io: (url: string, options: Record<string, unknown>) => {
      socket = new FakeSocket({ ...options, url })
      return socket
    }
  }))
  return import("./realtime")
}

beforeEach(() => {
  window.localStorage.setItem("neighborly.access_token", "test-token")
})

afterEach(() => {
  vi.doUnmock("socket.io-client")
  vi.resetModules()
  window.localStorage.clear()
})

describe("realtime client", () => {
  it("authenticates with the stored access token", async () => {
    const { subscribeRealtime } = await loadRealtime()
    const subscription = subscribeRealtime({})
    expect(socket?.auth).toEqual({ token: "test-token" })
    subscription.disconnect()
  })

  it("joins the personal room on connect, which is what authorizes delivery", async () => {
    const { subscribeRealtime } = await loadRealtime()
    subscribeRealtime({})
    socket!.server("connect")
    expect(socket!.emitted.map(entry => entry.event)).toContain("user.join")
  })

  it("does not create a socket when there is no session", async () => {
    window.localStorage.clear()
    const { subscribeRealtime } = await loadRealtime()
    const subscription = subscribeRealtime({})
    // Signing out leaves realtime simply unavailable; REST still works.
    expect(socket).toBeNull()
    expect(() => subscription.disconnect()).not.toThrow()
  })

  it("fans an event out to every subscriber", async () => {
    const { subscribeRealtime } = await loadRealtime()
    const first = vi.fn()
    const second = vi.fn()
    const a = subscribeRealtime({ onNotification: first })
    const b = subscribeRealtime({ onNotification: second })

    socket!.server("notification.created", { id: "n1" })

    expect(first).toHaveBeenCalledWith({ id: "n1" })
    expect(second).toHaveBeenCalledWith({ id: "n1" })
    a.disconnect()
    b.disconnect()
  })

  it("stops delivering to a component that unsubscribed", async () => {
    const { subscribeRealtime } = await loadRealtime()
    const gone = vi.fn()
    const kept = vi.fn()
    const a = subscribeRealtime({ onNotification: gone })
    subscribeRealtime({ onNotification: kept })

    a.disconnect()
    socket!.server("notification.created", { id: "n1" })

    expect(gone).not.toHaveBeenCalled()
    expect(kept).toHaveBeenCalled()
  })

  it("keeps the socket alive until the last subscriber leaves", async () => {
    const { subscribeRealtime } = await loadRealtime()
    const a = subscribeRealtime({})
    const b = subscribeRealtime({})
    const shared = socket!

    a.disconnect()
    expect(shared.disconnected).toBe(false)

    b.disconnect()
    expect(shared.disconnected).toBe(true)
  })

  it("tells a subscriber to refetch on reconnect instead of replaying events", async () => {
    const { subscribeRealtime } = await loadRealtime()
    const onReconnect = vi.fn()
    const onMessage = vi.fn()
    subscribeRealtime({ onReconnect, onMessage })

    socket!.server("connect")
    socket!.server("connect")

    // Recovery is a persisted refetch, which is what stops a reconnect from
    // appending a message the screen already shows.
    expect(onReconnect).toHaveBeenCalledTimes(2)
    expect(onMessage).not.toHaveBeenCalled()
  })

  it("routes unread updates to the unread handler", async () => {
    const { subscribeRealtime } = await loadRealtime()
    const onUnread = vi.fn()
    subscribeRealtime({ onUnread })

    socket!.server("conversation.unread", { conversationId: "c1", unreadCount: 4 })
    expect(onUnread).toHaveBeenCalledWith({ conversationId: "c1", unreadCount: 4 })
  })

  it("closes the socket on sign out", async () => {
    const { subscribeRealtime, disconnectRealtime } = await loadRealtime()
    subscribeRealtime({})
    const shared = socket!
    disconnectRealtime()
    expect(shared.disconnected).toBe(true)
  })
})