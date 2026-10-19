import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Avatar, Icon } from "../components/ui"
import { ApiError, api } from "../api/client"
import type { ApiConversation, ApiMessage } from "../api/types"

interface MessagesProps {
  initialConversationId?: string
}

function participantName(conversation: ApiConversation, userId: string) {
  const peer = conversation.participants.find(item => item.userId !== userId)
  const profile = peer?.user?.profile
  return [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || "Neighbor"
}

export default function Messages({ initialConversationId }: MessagesProps) {
  const [conversations, setConversations] = useState<ApiConversation[]>([])
  const [selectedId, setSelectedId] = useState(initialConversationId ?? "")
  const [messages, setMessages] = useState<ApiMessage[]>([])
  const [userId, setUserId] = useState("")
  const [draft, setDraft] = useState("")
  const [loading, setLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const [connectionStatus, setConnectionStatus] = useState("Connecting…")
  const [typing, setTyping] = useState(false)
  const [peerRead, setPeerRead] = useState(false)
  const socketRef = useRef<ReturnType<typeof api.realtime.connect> | null>(null)

  const loadConversations = useCallback(async () => {
    setError("")
    try {
      const [items, user] = await Promise.all([api.conversations.list(), api.auth.me()])
      setConversations(items)
      setUserId(user.id)
      setSelectedId(current =>
        (initialConversationId && items.some(item => item.id === initialConversationId)
          ? initialConversationId
          : items.some(item => item.id === current)
            ? current
            : items[0]?.id) ?? "",
      )
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "Conversations could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [initialConversationId])

  useEffect(() => { void loadConversations() }, [loadConversations])

  const active = useMemo(
    () => conversations.find(item => item.id === selectedId),
    [conversations, selectedId],
  )

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const items = await api.conversations.messages(conversationId)
      setMessages(items)
      await api.conversations.markRead(conversationId)
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "Messages could not be loaded.")
    } finally {
      setMessagesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      return
    }
    setMessagesLoading(true)
    void loadMessages(selectedId)
    setPeerRead(false)
    let typingTimeout: number | undefined
    const socket = api.realtime.connect()
    socketRef.current = socket
    socket.on("connect", () => {
      setConnectionStatus("Live")
      socket.emit("conversation.join", { conversationId: selectedId }, (ack: { ok?: boolean }) => {
        if (!ack?.ok) setError("You no longer have access to this conversation.")
      })
    })
    socket.on("disconnect", () => setConnectionStatus("Reconnecting…"))
    socket.on("connect_error", () => setConnectionStatus("Offline · retrying"))
    socket.on("message.created", (message: ApiMessage) => {
      if (message.conversationId !== selectedId) return
      setMessages(current => current.some(item => item.id === message.id) ? current : [...current, message])
      if (message.senderId !== userId) void api.conversations.markRead(selectedId)
    })
    socket.on("message.read", (receipt: { userId?: string; conversationId?: string }) => {
      if (receipt.conversationId === selectedId && receipt.userId && receipt.userId !== userId) setPeerRead(true)
    })
    socket.on("typing.started", (event: { conversationId?: string; userId?: string }) => {
      if (event.conversationId === selectedId && event.userId !== userId) {
        setTyping(true)
        window.clearTimeout(typingTimeout)
        typingTimeout = window.setTimeout(() => setTyping(false), 2500)
      }
    })
    socket.on("typing.stopped", (event: { conversationId?: string; userId?: string }) => {
      if (event.conversationId === selectedId && event.userId !== userId) setTyping(false)
    })
    const interval = window.setInterval(() => {
      if (!socket.connected) void loadMessages(selectedId)
    }, 7000)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(typingTimeout)
      socket.disconnect()
      socketRef.current = null
    }
  }, [loadMessages, selectedId])

  async function sendMessage() {
    const body = draft.trim()
    if (!body || !selectedId || sending) return
    setSending(true)
    setError("")
    try {
      const message = await api.conversations.send(selectedId, body)
      setMessages(current => current.some(item => item.id === message.id) ? current : [...current, message])
      setDraft("")
      await loadConversations()
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "Message could not be sent.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)] bg-[#FAFAF7] md:h-[calc(100vh-64px)]">
      <aside className={`w-full flex-shrink-0 border-r border-[#E8E6DF] bg-white md:w-80 ${selectedId ? "hidden md:flex" : "flex"} flex-col`}>
        <div className="border-b border-[#E8E6DF] p-4">
          <h1 className="font-display text-xl font-semibold text-[#1B2A4A]">Messages</h1>
          <p className="mt-1 text-xs text-[#8A9AB5]">Private conversations with your neighbors</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? <div className="space-y-2 p-4">{[0, 1, 2].map(item => <div key={item} className="h-16 animate-pulse rounded-xl bg-[#F5F4EF]" />)}</div> : conversations.length === 0 ? (
            <div className="p-6 text-center text-sm text-[#8A9AB5]">No conversations yet. Accept an offer or contact a neighbor to start one.</div>
          ) : conversations.map(conversation => {
            const last = conversation.messages[0]
            const peer = participantName(conversation, userId)
            return (
              <button key={conversation.id} onClick={() => setSelectedId(conversation.id)} className={`flex w-full items-start gap-3 border-b border-[#F5F4EF] p-4 text-left hover:bg-[#F5F4EF] ${selectedId === conversation.id ? "bg-[#F0FBF3]" : ""}`}>
                <Avatar name={peer} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[#1B2A4A]">{peer}</span>
                  <span className="mt-1 block truncate text-xs text-[#8A9AB5]">{last?.body ?? "Conversation started"}</span>
                </span>
                {last && last.senderId !== userId && <span className="mt-2 h-2 w-2 rounded-full bg-[#E8694A]" aria-label="Unread message" />}
              </button>
            )
          })}
        </div>
      </aside>

      <main className={`min-w-0 flex-1 flex-col ${selectedId ? "flex" : "hidden md:flex"}`}>
        {active ? (
          <>
            <header className="flex items-center gap-3 border-b border-[#E8E6DF] bg-white p-4">
              <button className="md:hidden" onClick={() => setSelectedId("")} aria-label="Back to conversations"><Icon name="chevronRight" size={18} className="rotate-180" /></button>
              <Avatar name={participantName(active, userId)} size="md" />
              <div>
                <h2 className="text-sm font-semibold text-[#1B2A4A]">{participantName(active, userId)}</h2>
                <p className="text-xs text-[#8A9AB5]">{connectionStatus} · Neighborly conversation</p>
              </div>
            </header>
            {error && <div role="alert" className="m-3 rounded-lg bg-[#FFF5F2] p-3 text-sm text-[#C4512D]">{error} <button onClick={() => void loadMessages(selectedId)} className="font-semibold underline">Retry</button></div>}
            <section className="flex-1 space-y-3 overflow-y-auto p-4" aria-label="Conversation messages">
              {messagesLoading ? <div className="text-center text-sm text-[#8A9AB5]">Loading messages…</div> : messages.length === 0 ? <div className="mt-8 text-center text-sm text-[#8A9AB5]">This is the start of your conversation.</div> : messages.map((message, index) => (
                <div key={message.id} className={`flex ${message.senderId === userId ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 md:max-w-[65%] ${message.senderId === userId ? "bg-[#2D6A4F] text-white" : "border border-[#E8E6DF] bg-white text-[#1B2A4A]"}`}>
                    <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
                    <time className={`mt-1 block text-right text-[10px] ${message.senderId === userId ? "text-white/70" : "text-[#8A9AB5]"}`}>{new Date(message.createdAt).toLocaleString()}</time>
                    {peerRead && message.senderId === userId && index === messages.map(item => item.senderId === userId).lastIndexOf(true) && <span className="mt-1 block text-right text-[10px] text-white/70">Seen</span>}
                  </div>
                </div>
              ))}
              {typing && <p className="text-xs text-[#8A9AB5]">Neighbor is typing…</p>}
            </section>
            <form className="flex items-end gap-2 border-t border-[#E8E6DF] bg-white p-3 md:p-4" onSubmit={event => { event.preventDefault(); void sendMessage() }}>
              <button type="button" disabled title="Attachments are not available yet" className="flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-full text-[#C5CCDA]" aria-label="Attachments unavailable"><Icon name="plus" size={16} /></button>
              <textarea value={draft} onChange={event => { setDraft(event.target.value); socketRef.current?.emit(event.target.value ? "typing.start" : "typing.stop", { conversationId: selectedId }) }} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage() } }} rows={1} maxLength={4000} placeholder="Write a message…" className="max-h-32 min-h-10 flex-1 resize-y rounded-xl border border-[#E8E6DF] px-3 py-2 text-sm text-[#1B2A4A] focus:border-[#2D6A4F] focus:outline-none" />
              <button disabled={!draft.trim() || sending} className="flex h-10 items-center gap-2 rounded-xl bg-[#2D6A4F] px-4 text-sm font-semibold text-white disabled:opacity-50"><Icon name="send" size={14} />{sending ? "Sending" : "Send"}</button>
            </form>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[#8A9AB5]">{loading ? "Loading conversations…" : "Select a conversation to read your messages."}</div>
        )}
      </main>
    </div>
  )
}
