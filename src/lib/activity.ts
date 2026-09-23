import type { ApiConversation, ApiTransaction } from "../api/types"
import { firstName, personName, relativeTime, type OfferRow } from "./view"

export interface ActivityItem {
  id: string
  icon: string
  text: string
  time: string
  type: "message" | "offer" | "sold"
  at: number
}

function stamp(iso: string | undefined) {
  const at = iso ? new Date(iso).getTime() : 0
  return Number.isNaN(at) ? 0 : at
}

export function activityItems(input: {
  offers: OfferRow[]
  transactions: ApiTransaction[]
  conversations: ApiConversation[]
  userId: string
  titles: Map<string, string>
}): ActivityItem[] {
  const items: ActivityItem[] = []

  for (const offer of input.offers) {
    const amount =
      offer.amountCents == null ? offer.message : `$${Math.round(offer.amountCents / 100).toLocaleString()}`
    items.push({
      id: `offer-${offer.offerId}`,
      icon: "💰",
      text: `${firstName(offer.offerer)} offered ${amount} on ${offer.requestTitle}`,
      time: relativeTime(offer.createdAt),
      type: "offer",
      at: stamp(offer.createdAt),
    })
  }

  for (const conversation of input.conversations) {
    const latest = conversation.messages[0]
    if (!latest) continue
    const other = conversation.participants.find((person) => person.userId !== input.userId)
    items.push({
      id: `message-${latest.id}`,
      icon: "💬",
      text: `${personName(other?.user)}: ${latest.body}`,
      time: relativeTime(latest.createdAt),
      type: "message",
      at: stamp(latest.createdAt),
    })
  }

  for (const tx of input.transactions) {
    const title = (tx.offerId && input.titles.get(tx.offerId)) || "Exchange"
    items.push({
      id: `tx-${tx.id}`,
      icon: "✅",
      text: `${title} is ${tx.status.toLowerCase()}`,
      time: relativeTime(tx.updatedAt),
      type: "sold",
      at: stamp(tx.updatedAt),
    })
  }

  return items.sort((a, b) => b.at - a.at).slice(0, 12)
}

export function unreadConversations(conversations: ApiConversation[], userId: string) {
  return conversations.filter((conversation) => {
    const latest = conversation.messages[0]
    if (!latest || latest.senderId === userId) return false
    const me = conversation.participants.find((person) => person.userId === userId)
    if (!me?.lastReadAt) return true
    return new Date(me.lastReadAt).getTime() < new Date(latest.createdAt).getTime()
  }).length
}
