import { useEffect, useRef, useState } from 'react'
import { Avatar, Badge, EmptyState, Icon } from '../components/ui'
import { api, readError, readStatus } from '../api/client'
import type { ApiConversation, ApiMessage, ApiOfferDetail, ApiTransaction } from '../api/types'
import {
  dollars,
  indexOffers,
  leadingAmountCents,
  offerBadge,
  personName,
  relativeTime,
  transactionStepIndex,
} from '../lib/view'

interface MessagesProps {
  conversationId?: string | null
  onNavigate?: (page: 'dashboard' | 'messages', id?: string) => void
}

const alertClass = 'rounded-xl border border-[#E8694A]/30 bg-[#FFF5F2] px-4 py-3 text-sm text-[#A63D27]'

export default function Messages({ conversationId, onNavigate }: MessagesProps) {
  const [userId, setUserId] = useState('')
  const [conversations, setConversations] = useState<ApiConversation[]>([])
  const [transactions, setTransactions] = useState<ApiTransaction[]>([])
  const [links, setLinks] = useState<ReturnType<typeof indexOffers>>(new Map())
  const [selected, setSelected] = useState('')
  const [messages, setMessages] = useState<ApiMessage[]>([])
  const [filter, setFilter] = useState<'all' | 'active' | 'archived' | 'transactions'>('all')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [showScamWarning, setShowScamWarning] = useState(false)
  const [sendError, setSendError] = useState('')
  const [offerError, setOfferError] = useState('')
  const [acting, setActing] = useState(false)
  const [counterArmed, setCounterArmed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError('')
    ;(async () => {
      const me = await api.auth.me()
      const [threads, txs, summaries] = await Promise.all([
        api.conversations.list(),
        api.transactions.list(),
        api.requests.list(),
      ])
      const details = await Promise.all(
        summaries.filter((request) => request.offers.length > 0).map((request) => api.requests.get(request.id)),
      )
      if (!active) return
      setUserId(me.id)
      setConversations(threads)
      setTransactions(txs)
      setLinks(indexOffers(details))
    })()
      .catch((cause: unknown) => {
        if (active) setLoadError(readError(cause, 'Messages could not be loaded.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  useEffect(() => {
    if (!conversations.length) {
      setSelected('')
      return
    }
    setSelected((current) => {
      if (conversationId && conversations.some((item) => item.id === conversationId)) return conversationId
      if (current && conversations.some((item) => item.id === current)) return current
      return conversations[0].id
    })
  }, [conversations, conversationId])

  useEffect(() => {
    if (!selected) {
      setMessages([])
      return
    }
    let active = true
    api.conversations
      .messages(selected)
      .then((rows) => {
        if (active) setMessages(rows)
      })
      .catch((cause: unknown) => {
        if (active) setSendError(readError(cause, 'Messages could not be loaded.'))
      })
    api.conversations.markRead(selected).catch(() => undefined)
    return () => {
      active = false
    }
  }, [selected, reloadKey])

  const txByConversation = new Map(
    transactions.filter((tx) => tx.conversationId).map((tx) => [tx.conversationId as string, tx]),
  )

  const filteredConversations = conversations.filter((conv) => {
    if (filter === 'archived') return false
    if (filter === 'transactions') return txByConversation.has(conv.id)
    return true
  })

  const activeConversation = conversations.find((conv) => conv.id === selected)
  const transaction = selected ? txByConversation.get(selected) : undefined
  const linked = transaction?.offerId ? links.get(transaction.offerId) : undefined
  const offer: ApiOfferDetail | undefined = linked?.offer
  const negotiable = offer?.status === 'PENDING' || offer?.status === 'COUNTERED'
  const filledStep = transactionStepIndex(transaction?.status)
  const transactionSteps = ['Offer sent', 'Offer accepted', 'Meetup scheduled', 'Item exchanged', 'Review requested']

  const otherOf = (conv: ApiConversation) =>
    conv.participants.find((participant) => participant.userId !== userId) ?? conv.participants[0]

  const sendMessage = async () => {
    const text = newMessage.trim()
    if (!text || !selected) return
    const suspicious = ['venmo', 'zelle', 'paypal'].some((word) => text.toLowerCase().includes(word))
    if (suspicious) {
      setShowScamWarning(true)
      setSendError('')
      return
    }
    if (counterArmed && offer) {
      if (text.length < 2) {
        setOfferError('Add a short message to counter.')
        return
      }
      const amountCents = leadingAmountCents(text)
      setActing(true)
      setOfferError('')
      try {
        await api.requests.counterOffer(offer.id, {
          message: text,
          ...(amountCents !== undefined ? { amountCents } : {}),
        })
        setNewMessage('')
        setCounterArmed(false)
        setReloadKey((key) => key + 1)
      } catch (cause: unknown) {
        setOfferError(readError(cause, 'Unable to send this counter.'))
      } finally {
        setActing(false)
      }
      return
    }
    setActing(true)
    setSendError('')
    try {
      const created = await api.conversations.send(selected, text)
      setMessages((current) => [...current, created])
      setNewMessage('')
    } catch (cause: unknown) {
      setSendError(readError(cause, 'Unable to send this message.'))
    } finally {
      setActing(false)
    }
  }

  const reportConversation = async () => {
    if (!activeConversation) return
    const other = otherOf(activeConversation)
    const otherId = other?.userId
    if (!otherId || otherId === userId) {
      setSendError('There is no one to report in this conversation.')
      return
    }
    const incoming = [...messages].reverse().find((message) => message.senderId === otherId)
    setSendError('')
    try {
      if (incoming) {
        await api.safety.report({ targetType: 'MESSAGE', targetId: incoming.id, reason: 'HARASSMENT' })
      } else {
        await api.safety.report({ targetType: 'USER', targetId: otherId, reason: 'HARASSMENT' })
      }
      setSendError('Report submitted.')
    } catch (cause: unknown) {
      setSendError(readStatus(cause, 'Unable to submit this report.'))
    }
  }

  const decideOffer = async (action: 'accept' | 'reject') => {
    if (!offer || !linked) return
    setActing(true)
    setOfferError('')
    try {
      if (action === 'accept') await api.requests.acceptOffer(linked.request.id, offer.id)
      else await api.requests.rejectOffer(linked.request.id, offer.id)
      setReloadKey((key) => key + 1)
    } catch (cause: unknown) {
      setOfferError(readError(cause, action === 'accept' ? 'Unable to accept this offer.' : 'Unable to decline this offer.'))
    } finally {
      setActing(false)
    }
  }

  const armCounter = () => {
    setCounterArmed(true)
    setOfferError('')
    composerRef.current?.focus()
  }

  return (
    <div className="h-[calc(100vh-64px)] flex bg-[#FAFAF7]">
      <div className={`w-full md:w-80 md:flex-shrink-0 flex flex-col bg-white border-r border-[#E8E6DF] ${selected ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-[#E8E6DF]">
          <div className="flex items-center justify-between mb-3">
            <h1 className="font-display text-xl font-semibold text-[#1B2A4A]">Messages</h1>
            <button className="w-8 h-8 rounded-full bg-[#F5F4EF] flex items-center justify-center hover:bg-[#E8E6DF] transition-colors">
              <Icon name="plus" size={15} className="text-[#5C6E8A]" />
            </button>
          </div>
          <div className="relative">
            <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C5CCDA]" />
            <input
              type="text"
              placeholder="Search messages..."
              className="w-full h-9 pl-9 pr-3 bg-[#F5F4EF] rounded-xl text-sm text-[#1B2A4A] placeholder:text-[#C5CCDA] focus:outline-none"
            />
          </div>
          <div className="flex gap-1 mt-3">
            {(['all', 'active', 'archived', 'transactions'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filter === f ? 'bg-[#2D6A4F] text-white' : 'text-[#8A9AB5] hover:text-[#1B2A4A]'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="bg-white rounded-2xl border border-[#E8E6DF] p-8 m-4 text-center text-sm text-[#8A9AB5]">Loading messages…</div>
          ) : loadError ? (
            <div className="bg-[#FFF5F2] border border-[#E8694A]/20 rounded-2xl p-5 m-4 text-sm text-[#C4512D]">{loadError}</div>
          ) : conversations.length === 0 ? (
            <EmptyState
              title="No messages yet"
              description="When you and a neighbor start a thread, it will show up here."
              action={() => onNavigate?.('dashboard')}
              actionLabel="Back to dashboard"
              icon={<Icon name="message" size={24} />}
            />
          ) : (
            filteredConversations.map(conv => {
              const other = otherOf(conv)
              const name = personName(other?.user)
              const latest = conv.messages[0]
              const title = txByConversation.get(conv.id)?.offerId
                ? links.get(txByConversation.get(conv.id)!.offerId!)?.request.title
                : undefined
              const unread = Boolean(
                latest &&
                latest.senderId !== userId &&
                (!other?.lastReadAt || new Date(other.lastReadAt) < new Date(latest.createdAt)),
              )
              return (
                <div
                  key={conv.id}
                  onClick={() => { setSelected(conv.id); setOfferError(''); setSendError(''); setCounterArmed(false) }}
                  className={`flex items-start gap-3 p-4 cursor-pointer border-b border-[#F5F4EF] hover:bg-[#F5F4EF] transition-colors ${selected === conv.id ? 'bg-[#F0FBF3]' : ''}`}
                >
                  <div className="relative flex-shrink-0">
                    <Avatar name={name} size="md" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="font-semibold text-sm text-[#1B2A4A]">{name}</p>
                      <span className="text-xs text-[#C5CCDA] flex-shrink-0">{relativeTime(latest?.createdAt ?? conv.updatedAt)}</span>
                    </div>
                    <p className="text-xs text-[#8A9AB5] mb-1 truncate">Re: {title ?? 'Conversation'}</p>
                    <p className={`text-xs truncate ${unread ? 'font-semibold text-[#1B2A4A]' : 'text-[#8A9AB5]'}`}>{latest?.body ?? 'No messages yet'}</p>
                  </div>
                  {unread && (
                    <span className="w-5 h-5 bg-[#E8694A] text-white text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0">1</span>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {activeConversation && (
        <div className={`flex-1 flex flex-col ${selected ? 'flex' : 'hidden md:flex'}`}>
          <div className="flex items-center gap-3 p-4 bg-white border-b border-[#E8E6DF]">
            <button className="md:hidden text-[#8A9AB5] mr-1" onClick={() => setSelected('')}>
              <Icon name="chevronRight" size={18} className="rotate-180" />
            </button>
            <Avatar name={personName(otherOf(activeConversation)?.user)} size="md" />
            <div className="flex-1">
              <p className="font-semibold text-sm text-[#1B2A4A]">{personName(otherOf(activeConversation)?.user)}</p>
              <div className="flex items-center gap-2 text-xs text-[#8A9AB5]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#74C69D]" />
                Active{otherOf(activeConversation)?.user?.profile?.neighborhood ? ` · ${otherOf(activeConversation)?.user?.profile?.neighborhood}` : ''}
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 px-3 py-2 bg-[#F5F4EF] rounded-xl">
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-[#E8E6DF]" />
              <div>
                <p className="text-xs font-semibold text-[#1B2A4A] line-clamp-1 max-w-[120px]">{linked?.request.title ?? 'Conversation'}</p>
                {offer?.amountCents != null && (
                  <p className="text-xs text-[#2D6A4F] font-semibold">${dollars(offer.amountCents)}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Report this conversation"
                onClick={() => void reportConversation()}
                className="w-8 h-8 rounded-full hover:bg-[#F5F4EF] flex items-center justify-center text-[#8A9AB5] transition-colors"
              >
                <Icon name="shield" size={16} />
              </button>
              <button className="w-8 h-8 rounded-full hover:bg-[#F5F4EF] flex items-center justify-center text-[#8A9AB5] transition-colors">
                <Icon name="sliders" size={16} />
              </button>
            </div>
          </div>

          <div className="bg-[#F0FBF3] border-b border-[#74C69D]/20 px-4 py-3">
            <p className="text-xs font-semibold text-[#2D6A4F] mb-2 uppercase tracking-wide">Transaction progress</p>
            <div className="flex items-center justify-between">
              {transactionSteps.map((step, i) => (
                <div key={step} className="flex items-center">
                  <div className={`flex flex-col items-center ${i < transactionSteps.length - 1 ? 'flex-1' : ''}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border-2 ${
                      i <= filledStep ? 'bg-[#2D6A4F] border-[#2D6A4F] text-white' : 'bg-white border-[#E8E6DF] text-[#C5CCDA]'
                    }`}>
                      {i <= filledStep ? '✓' : i + 1}
                    </div>
                    <p className="text-[8px] text-[#8A9AB5] mt-0.5 text-center hidden md:block leading-tight max-w-[60px]">{step}</p>
                  </div>
                  {i < transactionSteps.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-1 ${i < filledStep ? 'bg-[#2D6A4F]' : 'bg-[#E8E6DF]'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F5F4EF]">
            <div className="flex items-center gap-3 py-2">
              <div className="flex-1 h-px bg-[#E8E6DF]" />
              <span className="text-xs text-[#C5CCDA] font-medium">Today</span>
              <div className="flex-1 h-px bg-[#E8E6DF]" />
            </div>

            {messages.map(msg => {
              const mine = msg.senderId === userId
              return (
                <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'} gap-2`}>
                  {!mine && (
                    <Avatar name={personName(otherOf(activeConversation)?.user)} size="xs" className="mt-auto" />
                  )}
                  <div className={`max-w-[75%] flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                    <div className={`px-4 py-2.5 text-sm leading-relaxed ${mine ? 'msg-bubble-sent' : 'msg-bubble-recv'}`}>
                      {msg.body}
                    </div>
                    <span className="text-[10px] text-[#C5CCDA] mt-1 px-1">{relativeTime(msg.createdAt)}</span>
                  </div>
                </div>
              )
            })}

            {offer && (
              <div className="flex justify-center">
                <div className="bg-white rounded-2xl border border-[#E8E6DF] p-4 max-w-xs w-full shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <Icon name="dollar" size={14} className="text-[#E8694A]" />
                    <span className="text-xs font-semibold text-[#1B2A4A] uppercase tracking-wide">Offer received</span>
                  </div>
                  {offer.amountCents == null ? (
                    <p className="text-sm text-[#8A9AB5] mb-1">{offer.message}</p>
                  ) : (
                    <p className="text-xl font-bold text-[#1B2A4A] mb-1">${dollars(offer.amountCents)}</p>
                  )}
                  <p className="text-xs text-[#8A9AB5] mb-3">For: {linked?.request.title}</p>
                  {negotiable ? (
                    <div className="flex gap-2">
                      <button disabled={acting} onClick={() => void decideOffer('accept')} className="flex-1 py-2 bg-[#2D6A4F] text-white text-xs font-semibold rounded-xl hover:bg-[#1B4332] transition-colors disabled:opacity-40">Accept</button>
                      <button disabled={acting} onClick={armCounter} className="flex-1 py-2 border border-[#E8E6DF] text-[#5C6E8A] text-xs font-semibold rounded-xl hover:bg-[#F5F4EF] transition-colors disabled:opacity-40">Counter</button>
                      <button disabled={acting} onClick={() => void decideOffer('reject')} className="flex-1 py-2 border border-[#E8E6DF] text-[#E8694A] text-xs font-semibold rounded-xl hover:bg-[#FDE8E0] transition-colors disabled:opacity-40">Decline</button>
                    </div>
                  ) : (
                    <Badge variant={offerBadge(offer.status).variant}>{offerBadge(offer.status).label}</Badge>
                  )}
                  {offerError && <div className={`${alertClass} mt-3`} role="alert">{offerError}</div>}
                </div>
              </div>
            )}
          </div>

          {showScamWarning && (
            <div className="mx-4 mb-2 p-3 bg-[#FEF3C7] border border-[#F59E0B]/30 rounded-xl animate-fade-in">
              <div className="flex items-start gap-2">
                <span className="text-yellow-600 mt-0.5">⚠️</span>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-[#92400E]">Payment safety reminder</p>
                  <p className="text-xs text-[#78350F] mt-0.5">Never send money via Venmo, Zelle, or gift cards to someone you haven't met. Neighborly never asks for payment outside the app.</p>
                </div>
                <button onClick={() => setShowScamWarning(false)} className="text-[#92400E] hover:opacity-70"><Icon name="x" size={12} /></button>
              </div>
            </div>
          )}
          {!showScamWarning && sendError && (
            <div className={`mx-4 mb-2 ${alertClass}`} role="alert">{sendError}</div>
          )}

          <div className="p-4 bg-white border-t border-[#E8E6DF]">
            <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide pb-1">
              {['Is this still available?', 'Can I see it in person?', 'Would you accept $X?', 'When can I pick up?'].map(r => (
                <button
                  key={r}
                  onClick={() => setNewMessage(r)}
                  className="flex-shrink-0 text-xs px-3 py-1.5 bg-[#F0FBF3] text-[#2D6A4F] border border-[#74C69D]/30 rounded-full font-medium hover:bg-[#D8F3DC] transition-colors whitespace-nowrap"
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <button className="w-9 h-9 flex-shrink-0 rounded-full bg-[#F5F4EF] flex items-center justify-center text-[#8A9AB5] hover:bg-[#EEF0F5] transition-colors">
                <Icon name="camera" size={16} />
              </button>
              <div className="flex-1 relative">
                <textarea
                  ref={composerRef}
                  value={newMessage}
                  onChange={e => { setNewMessage(e.target.value); setSendError('') }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() } }}
                  placeholder="Type a message..."
                  rows={1}
                  className="w-full px-4 py-2.5 bg-[#F5F4EF] rounded-2xl text-sm text-[#1B2A4A] resize-none focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#2D6A4F]/10 transition-all min-h-[42px] max-h-28"
                />
              </div>
              <button
                onClick={() => void sendMessage()}
                disabled={!newMessage.trim() || acting}
                className="w-9 h-9 flex-shrink-0 rounded-full bg-[#2D6A4F] text-white flex items-center justify-center hover:bg-[#1B4332] transition-colors disabled:opacity-40"
              >
                <Icon name="send" size={14} />
              </button>
            </div>
            <p className="text-[10px] text-[#C5CCDA] text-center mt-2">
              🔒 Messages are secure. Never share personal contact info or pay outside Neighborly.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
