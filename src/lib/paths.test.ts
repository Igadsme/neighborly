import { afterEach, describe, expect, it } from "vitest"
import {
  bootFromLocation,
  normalizePath,
  parsePath,
  pathFor,
  resetRememberedAccountToken,
} from "./paths"
import { notificationPath } from "./routes"

describe("addressable paths", () => {
  afterEach(() => {
    resetRememberedAccountToken()
  })

  it("round-trips the screens that must survive refresh", () => {
    const cases: Array<[string, string | undefined, string]> = [
      ["listing", "listing-1", "/listings/listing-1"],
      ["request-detail", "request-1", "/requests/request-1"],
      ["request-edit", "request-1", "/requests/request-1/edit"],
      ["messages", "conversation-1", "/messages/conversation-1"],
      ["borrow-item", "item-1", "/borrow/items/item-1"],
      ["borrow-detail", "borrow-1", "/borrow/requests/borrow-1"],
      ["mission-detail", "mission-1", "/missions/mission-1"],
      ["mission-manage", "mission-1", "/missions/mission-1/manage"],
      ["profile", "user-1", "/profile/user-1"],
      ["verify-email", undefined, "/verify-email"],
      ["report-queue", undefined, "/reports"],
      ["reset-password", undefined, "/reset-password"],
    ]
    for (const [page, id, path] of cases) {
      expect(pathFor(page, id)).toBe(path)
      const parsed = parsePath(path)
      expect(parsed.page).toBe(page)
    }
  })

  it("reads an initial path the way a refresh would", () => {
    expect(parsePath("/listings/abc").listingId).toBe("abc")
    expect(parsePath("/messages/abc").conversationId).toBe("abc")
    expect(parsePath("/conversations/abc").page).toBe("messages")
    expect(parsePath("/requests/abc/offers").page).toBe("request-detail")
    expect(parsePath("/requests/abc/offers").requestId).toBe("abc")
    expect(parsePath("/borrow/items/abc").page).toBe("borrow-item")
    expect(parsePath("/profile/abc").profileUserId).toBe("abc")
    expect(parsePath("/users/abc").page).toBe("profile")
    expect(parsePath("/missions/contributions").page).toBe("mission-contributions")
    expect(parsePath("/transactions/tx-1").page).toBe("dashboard")
  })

  it("renders unknown paths as not found", () => {
    expect(parsePath("/this-page-is-not-real").page).toBe("not-found")
    expect(parsePath("/listings").page).toBe("not-found")
    expect(parsePath("/borrow/items").page).toBe("not-found")
    expect(normalizePath("/home/")).toBe("/home")
  })

  it("opens verify and reset tokens and strips them from the path it keeps", () => {
    const verify = bootFromLocation("/", "?verify=secret-token")
    expect(verify.route.page).toBe("verify-email")
    expect(verify.token).toBe("secret-token")
    expect(verify.replaceWith).toBe("/verify-email")
    expect(verify.replaceWith).not.toContain("secret-token")

    const change = bootFromLocation("/home", "?verifyEmailChange=other-token")
    expect(change.route.page).toBe("verify-email")
    expect(change.token).toBe("other-token")
    expect(change.replaceWith).toBe("/verify-email")

    resetRememberedAccountToken()
    const reset = bootFromLocation("/", "?reset=reset-token")
    expect(reset.route.page).toBe("reset-password")
    expect(reset.token).toBe("reset-token")
    expect(reset.replaceWith).toBe("/reset-password")

    const again = bootFromLocation("/reset-password", "")
    expect(again.token).toBe("reset-token")
    expect(again.replaceWith).toBeNull()
  })

  it("keeps notification targets on those paths", () => {
    expect(notificationPath("/listings/listing-1")).toBe("/listings/listing-1")
    expect(notificationPath("/requests/request-1")).toBe("/requests/request-1")
    expect(notificationPath("/messages/conversation-1")).toBe("/messages/conversation-1")
    expect(notificationPath("/borrow/items/item-1")).toBe("/borrow/items/item-1")
    expect(notificationPath("/missions/mission-1")).toBe("/missions/mission-1")
    expect(notificationPath("/profile/user-1")).toBe("/profile/user-1")
  })
})
