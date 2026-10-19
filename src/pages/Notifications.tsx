import { useCallback, useEffect, useState } from "react"
import { ApiError, api } from "../api/client"
import type { ApiNotification } from "../api/types"
import { Button, Icon } from "../components/ui"

type Page = "requests" | "messages" | "listing"

interface NotificationsProps {
  onNavigate: (page: Page, entityId?: string, conversationId?: string) => void
  onUnreadChange: (count: number) => void
}

export default function Notifications({
  onNavigate,
  onUnreadChange,
}: NotificationsProps) {
  const [items, setItems] = useState<ApiNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState("")
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [notifications, unread] = await Promise.all([
        api.notifications.list(),
        api.notifications.unreadCount(),
      ])
      setItems(notifications)
      onUnreadChange(unread.count)
    } catch (cause: unknown) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Notifications could not be loaded.",
      )
    } finally {
      setLoading(false)
    }
  }, [onUnreadChange])

  useEffect(() => {
    void load()
  }, [load])

  async function markAllRead() {
    setBusyId("all")
    setError("")
    try {
      await api.notifications.markAllRead()
      setItems((current) =>
        current.map((item) => ({ ...item, readAt: new Date().toISOString() })),
      )
      onUnreadChange(0)
    } catch (cause: unknown) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Notifications could not be marked as read.",
      )
    } finally {
      setBusyId("")
    }
  }

  async function openNotification(notification: ApiNotification) {
    if (!notification.readAt) {
      setBusyId(notification.id)
      setError("")
      try {
        await api.notifications.markRead(notification.id)
        setItems((current) =>
          current.map((item) =>
            item.id === notification.id
              ? { ...item, readAt: new Date().toISOString() }
              : item,
          ),
        )
        const unread = await api.notifications.unreadCount()
        onUnreadChange(unread.count)
      } catch (cause: unknown) {
        setError(
          cause instanceof ApiError
            ? cause.message
            : "This notification could not be marked as read.",
        )
        setBusyId("")
        return
      }
      setBusyId("")
    }

    if (notification.data?.conversationId) {
      onNavigate("messages", undefined, notification.data.conversationId)
    } else if (notification.data?.listingId) {
      onNavigate("listing", notification.data.listingId)
    } else if (notification.data?.requestId) {
      onNavigate("requests")
    }
  }

  const unreadCount = items.filter((item) => !item.readAt).length

  return (
    <div className="min-h-screen bg-[#FAFAF7] px-4 py-8 pb-24 md:px-6 md:pb-10">
      <section className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-[#1B2A4A]">
              Notifications
            </h1>
            <p className="mt-1 text-sm text-[#8A9AB5]">
              Updates about your offers and conversations.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={unreadCount === 0 || busyId !== ""}
            loading={busyId === "all"}
            onClick={() => void markAllRead()}
          >
            Mark all read
          </Button>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[#E8694A]/30 bg-[#FFF5F2] p-3 text-sm text-[#C4512D]"
          >
            <span>{error}</span>
            <button className="font-semibold underline" onClick={() => void load()}>
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-3" aria-label="Loading notifications">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-20 animate-pulse rounded-2xl bg-white"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-[#E8E6DF] bg-white px-6 py-12 text-center">
            <Icon
              name="bell"
              size={24}
              className="mx-auto mb-3 text-[#8A9AB5]"
            />
            <h2 className="font-semibold text-[#1B2A4A]">You’re all caught up</h2>
            <p className="mt-1 text-sm text-[#8A9AB5]">
              New offers and messages will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[#E8E6DF] bg-white">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={busyId === item.id}
                onClick={() => void openNotification(item)}
                className={`flex w-full items-start gap-4 border-b border-[#F0EEE8] p-4 text-left last:border-b-0 hover:bg-[#FAFAF7] disabled:opacity-60 ${
                  item.readAt ? "" : "bg-[#F0FBF3]/60"
                }`}
              >
                <span className="mt-1 rounded-full bg-[#D8F3DC] p-2 text-[#2D6A4F]">
                  <Icon name="bell" size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm text-[#1B2A4A]">{item.title}</strong>
                    {!item.readAt && (
                      <span className="h-2 w-2 rounded-full bg-[#E8694A]" />
                    )}
                  </span>
                  <span className="mt-1 block text-sm text-[#5C6E8A]">
                    {item.body}
                  </span>
                  <time
                    className="mt-2 block text-xs text-[#8A9AB5]"
                    dateTime={item.createdAt}
                  >
                    {new Date(item.createdAt).toLocaleString()}
                  </time>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
