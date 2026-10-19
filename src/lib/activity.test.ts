import { describe, expect, it } from "vitest"
import { activityItems, unreadConversations } from "./activity"
import type { ApiConversation, ApiTransaction } from "../api/types"
import type { OfferRow } from "./view"

describe("dashboard activity", () => {
  it("builds rows from offers, messages, and transactions", () => {
    const offer: OfferRow = {
      requestId: "req-1",
      requestTitle: "Need a desk",
      budgetCents: 10000,
      offerId: "offer-1",
      status: "PENDING",
      amountCents: 8000,
      message: "I can help",
      createdAt: "2026-09-22T12:00:00.000Z",
      offerer: { id: "user-2", profile: { firstName: "Ada" } },
      requester: { id: "user-1", profile: { firstName: "Sam" } },
      imageUrl: null,
    }
    const conversations: ApiConversation[] = [
      {
        id: "c1",
        createdAt: "2026-09-22T11:00:00.000Z",
        updatedAt: "2026-09-22T13:00:00.000Z",
        participants: [
          { userId: "user-1" },
          {
            userId: "user-2",
            user: { id: "user-2", profile: { displayName: "Ada L" } },
          },
        ],
        messages: [
          {
            id: "m1",
            conversationId: "c1",
            senderId: "user-2",
            body: "See you Saturday",
            createdAt: "2026-09-22T13:00:00.000Z",
          },
        ],
      },
    ]
    const transactions: ApiTransaction[] = [
      {
        id: "tx-1",
        offerId: "offer-1",
        status: "COMPLETED",
        createdAt: "2026-09-22T14:00:00.000Z",
        updatedAt: "2026-09-22T15:00:00.000Z",
        participants: [],
      },
    ]

    const items = activityItems({
      offers: [offer],
      conversations,
      transactions,
      userId: "user-1",
      titles: new Map([["offer-1", "Need a desk"]]),
    })

    expect(items.map((item) => item.text)).toEqual([
      "Need a desk is completed",
      "Ada L: See you Saturday",
      "Ada offered $80 on Need a desk",
    ])
    expect(items.map((item) => item.text).join(" ")).not.toMatch(
      /Marcus|Priya|David/,
    )
  })
})

function thread(input: {
  id: string
  senderId: string
  createdAt: string
  lastReadAt?: string | null
  messages?: ApiConversation["messages"]
}): ApiConversation {
  return {
    id: input.id,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    participants: [
      { userId: "user-1", lastReadAt: input.lastReadAt },
      {
        userId: "user-2",
        user: { id: "user-2", profile: { displayName: "Ada L" } },
      },
    ],
    messages: input.messages ?? [
      {
        id: `${input.id}-m`,
        conversationId: input.id,
        senderId: input.senderId,
        body: "hello",
        createdAt: input.createdAt,
      },
    ],
  }
}

describe("unread conversations", () => {
  it("counts threads whose latest message is newer than the caller lastReadAt", () => {
    const conversations = [
      thread({
        id: "new",
        senderId: "user-2",
        createdAt: "2026-09-22T13:00:00.000Z",
      }),
      thread({
        id: "stale-read",
        senderId: "user-2",
        createdAt: "2026-09-22T13:00:00.000Z",
        lastReadAt: "2026-09-22T12:00:00.000Z",
      }),
      thread({
        id: "caught-up",
        senderId: "user-2",
        createdAt: "2026-09-22T13:00:00.000Z",
        lastReadAt: "2026-09-22T13:00:00.000Z",
      }),
      thread({
        id: "mine",
        senderId: "user-1",
        createdAt: "2026-09-22T13:00:00.000Z",
      }),
      thread({
        id: "empty",
        senderId: "user-2",
        createdAt: "2026-09-22T13:00:00.000Z",
        messages: [],
      }),
    ]

    expect(unreadConversations(conversations, "user-1")).toBe(2)
    expect(unreadConversations([], "user-1")).toBe(0)
  })
})
