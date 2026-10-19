import { io, type Socket } from "socket.io-client"

/**
 * Realtime client.
 *
 * Three rules shape this module, and each of them exists because the failure
 * it prevents is common:
 *
 * 1. **One socket per tab.** A module-level connection is reused across
 *    components, so mounting the notification center and the inbox does not
 *    open two sockets or duplicate every event.
 * 2. **Recover by fetching, not by replaying.** On reconnect the client
 *    refetches persisted state rather than replaying events it may have
 *    already applied, which is what stops a reconnect from duplicating a
 *    message on screen.
 * 3. **Unsubscribe on cleanup.** Every subscription returns its own
 *    unsubscribe function, so a component that unmounts leaves no listener
 *    behind.
 */

export interface RealtimeHandlers {
  onNotification?: (payload: unknown) => void
  onUnread?: (payload: { conversationId: string; unreadCount: number }) => void
  onMessage?: (payload: unknown) => void
  /** Fired on every successful (re)connection, for a persisted refetch. */
  onReconnect?: () => void
}

export interface RealtimeSubscription {
  disconnect: () => void
}

const ACCESS_TOKEN_KEY = "neighborly.access_token"

let socket: Socket | null = null
let activeHandlers = new Set<RealtimeHandlers>()

function accessToken(): string | null {
  try {
    return window.localStorage.getItem(ACCESS_TOKEN_KEY)
  } catch {
    return null
  }
}

function namespaceUrl(): string {
  // Same-origin in dev and in the Vite preview, so no absolute host is
  // needed and no CORS configuration has to be repeated on the client.
  return "/realtime"
}

/**
 * Returns the shared socket, creating it on first use. Reconnects resume
 * automatically; the caller refetches rather than trusting replayed events.
 */
export function connectRealtime(): Socket {
  if (socket) return socket
  const token = accessToken()
  if (!token) throw new Error("Not signed in")

  socket = io(namespaceUrl(), {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    auth: { token },
    // A short backoff so a dropped connection recovers quickly without
    // hammering the server.
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    autoConnect: true
  })

  socket.on("connect", () => {
    // Joining the personal room is what delivers notifications and unread
    // updates. The server authorizes it against the socket's own identity, so
    // a client can only ever join its own room.
    socket?.emit("user.join")
    for (const handler of activeHandlers) handler.onReconnect?.()
  })

  socket.on("notification.created", payload => {
    for (const handler of activeHandlers) handler.onNotification?.(payload)
  })
  socket.on("conversation.unread", (payload: { conversationId: string; unreadCount: number }) => {
    for (const handler of activeHandlers) handler.onUnread?.(payload)
  })
  socket.on("message.created", payload => {
    for (const handler of activeHandlers) handler.onMessage?.(payload)
  })

  return socket
}

/**
 * Registers handlers on the shared socket. Cleanup disconnects only when the
 * last subscriber leaves, so unmounting one screen does not kill the other.
 */
export function subscribeRealtime(handlers: RealtimeHandlers): RealtimeSubscription {
  let connection: Socket | null = null
  try {
    connection = connectRealtime()
  } catch {
    // Signed out: realtime is simply unavailable, and the REST fallbacks
    // still work. This is not an error the user needs to see.
    return { disconnect: () => undefined }
  }
  activeHandlers.add(handlers)
  return {
    disconnect: () => {
      activeHandlers.delete(handlers)
      if (activeHandlers.size > 0) return
      connection?.disconnect()
      socket = null
      activeHandlers = new Set()
    }
  }
}

/** Closes the shared socket. Used when the session ends. */
export function disconnectRealtime(): void {
  socket?.disconnect()
  socket = null
  activeHandlers = new Set()
}