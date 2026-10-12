import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "../api/client"
import type { NotificationRow } from "../api/types"
import { subscribeRealtime } from "../lib/realtime"
import { routeFor } from "../lib/routes"

interface NotificationBellProps {
  onNavigate: (page: string, id?: string) => void
}

/**
 * Header bell with a dropdown.
 *
 * The badge is only shown when a live fetch or a realtime signal has
 * confirmed a nonzero count, so a member is never told they have an
 * unread notification that the API has not actually returned.
 */
export default function NotificationBell({ onNavigate }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [unread, setUnread] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const page = await api.notifications.list({ limit: 8 })
      setRows(page.items)
      setUnread(page.unread)
    } catch {
      // A failed badge fetch leaves the last known count rather than
      // flashing a wrong zero.
    }
  }, [])

  useEffect(() => {
    void load()
    const subscription = subscribeRealtime({
      onNotification: () => void load(),
      onReconnect: () => void load()
    })
    return () => subscription.disconnect()
  }, [load])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  async function open_(row: NotificationRow) {
    setOpen(false)
    if (!row.readAt) await api.notifications.markRead(row.id).catch(() => undefined)
    await load()
    if (row.link) onNavigate(...routeFor(row.link))
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => {
          setOpen(current => !current)
          if (!open) void load()
        }}
        className="relative rounded-lg p-2 text-[#1B2A4A] hover:bg-[#F5F4EF]"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2D6A4F] px-1 text-[11px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-[#E8E6DF] bg-white p-3 shadow-lg"
        >
          <div className="flex items-center justify-between px-1 pb-2">
            <p className="text-sm font-semibold text-[#1B2A4A]">Notifications</p>
            <button
              type="button"
              className="text-xs text-[#2D6A4F] disabled:opacity-50"
              disabled={unread === 0}
              onClick={async () => {
                await api.notifications.markAllRead().catch(() => undefined)
                await load()
              }}
            >
              Mark all read
            </button>
          </div>

          {rows.length === 0 ? (
            <p className="px-1 py-3 text-sm text-[#5A6B85]">Nothing new right now.</p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {rows.map(row => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => open_(row)}
                    className={`w-full rounded-xl px-2 py-2 text-left hover:bg-[#F4F6F2] ${
                      row.readAt ? "" : "bg-[#F2F8F4]"
                    }`}
                  >
                    <p className="text-sm text-[#1B2A4A]">{row.title}</p>
                    {row.body && <p className="text-xs text-[#5A6B85]">{row.body}</p>}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="mt-2 w-full rounded-xl border border-[#D8DED8] px-3 py-2 text-sm text-[#1B2A4A] hover:bg-[#F4F6F2]"
            onClick={() => {
              setOpen(false)
              onNavigate("notifications")
            }}
          >
            See all notifications
          </button>
        </div>
      )}
    </div>
  )
}