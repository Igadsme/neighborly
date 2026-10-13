import { useCallback, useEffect, useState } from "react"
import { api, readError } from "../../api/client"
import type { NotificationRow, UnreadCounts } from "../../api/types"
import { subscribeRealtime } from "../../lib/realtime"
import { Alert, ScreenTitle, primaryButton, secondaryButton } from "../../components/account-ui"
import { routeFor } from "../../lib/routes"

interface NotificationCenterProps {
  onNavigate: (page: string, id?: string) => void
}

/**
 * In-app notification center.
 *
 * State is always refetched from the API rather than patched from a realtime
 * event, so a reconnect, a duplicate event, or a second device can never
 * leave the list showing something the database does not hold. The realtime
 * subscription is only a signal that something changed.
 */
export default function NotificationCenter({ onNavigate }: NotificationCenterProps) {
  const [rows, setRows] = useState<NotificationRow[] | null>(null)
  const [unread, setUnread] = useState(0)
  const [counts, setCounts] = useState<UnreadCounts | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [page, totals] = await Promise.all([
        api.notifications.list({ limit: 50 }),
        api.notifications.unreadCount()
      ])
      setRows(page.items)
      setUnread(page.unread)
      setCounts(totals)
      setError(null)
    } catch (cause) {
      setError(readError(cause, "Notifications could not be loaded."))
      setRows([])
    }
  }, [])

  useEffect(() => {
    void load()
    // A realtime event or a reconnect both mean "refetch", never "apply".
    const subscription = subscribeRealtime({
      onNotification: () => void load(),
      onUnread: () => void load(),
      onReconnect: () => void load()
    })
    return () => subscription.disconnect()
  }, [load])

  async function markAll() {
    setBusy(true)
    try {
      await api.notifications.markAllRead()
      await load()
    } catch (cause) {
      setError(readError(cause, "Notifications could not be updated."))
    } finally {
      setBusy(false)
    }
  }

  async function open(row: NotificationRow) {
    try {
      if (!row.readAt) await api.notifications.markRead(row.id)
    } catch {
      // A failed mark-read must not block navigation.
    }
    await load()
    // A link to deleted content is handled by the destination screen rather
    // than by pretending the notification does not exist.
    if (row.link) onNavigate(...routeFor(row.link))
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-12 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ScreenTitle
          title="Notifications"
          subtitle={
            counts
              ? `${unread} unread · ${counts.messages} unread messages`
              : "Everything that needs your attention"
          }
        />
        <div className="flex gap-2">
          <button type="button" className={secondaryButton()} onClick={() => onNavigate("notification-preferences")}>
            Preferences
          </button>
          <button type="button" className={primaryButton()} disabled={busy || unread === 0} onClick={markAll}>
            Mark all read
          </button>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {!rows && <Alert tone="info">Loading notifications…</Alert>}
      {rows && rows.length === 0 && (
        <Alert tone="info">
          Nothing new. Offers, replies, and saved-search matches will appear here.
        </Alert>
      )}

      {rows && rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map(row => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => open(row)}
                className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                  row.readAt
                    ? "border-[#E8E6DF] bg-white"
                    : "border-[#C9DDD2] bg-[#F2F8F4]"
                } hover:bg-[#F4F6F2]`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-[#1B2A4A]">{row.title}</p>
                  {!row.readAt && (
                    <span className="shrink-0 rounded-full bg-[#2D6A4F] px-2 py-0.5 text-[11px] font-semibold text-white">
                      New
                    </span>
                  )}
                </div>
                {row.body && <p className="mt-1 text-sm text-[#5A6B85]">{row.body}</p>}
                <p className="mt-2 text-xs text-[#5C6E8A]">{new Date(row.createdAt).toLocaleString()}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
