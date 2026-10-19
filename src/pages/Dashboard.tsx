import { useCallback, useEffect, useState } from "react"
import { api, ApiError } from "../api/client"
import type {
  ApiConversation,
  ApiListing,
  ApiTransaction,
  CurrentUser,
  NeedRequestRecord,
} from "../api/types"
import { mapApiListing } from "../api/listing-mapper"
import {
  Badge,
  Button,
  Icon,
  ListingCard,
  SectionHeader,
  TabBar,
} from "../components/ui"

type Page = "create" | "listing" | "messages" | "requests"

interface DashboardProps {
  onNavigate: (page: Page, entityId?: string, conversationId?: string) => void
}

type DashboardTab = "Overview" | "My Listings" | "Offers" | "Activity"

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("Overview")
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [listings, setListings] = useState<ApiListing[]>([])
  const [requests, setRequests] = useState<NeedRequestRecord[]>([])
  const [transactions, setTransactions] = useState<ApiTransaction[]>([])
  const [conversations, setConversations] = useState<ApiConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [busyOffer, setBusyOffer] = useState("")
  const [busyListing, setBusyListing] = useState("")
  const [editingListing, setEditingListing] = useState<ApiListing | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editPrice, setEditPrice] = useState("")
  const [editCondition, setEditCondition] = useState("")
  const [editError, setEditError] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [currentUser, allListings, openRequests, exchanges, threads] =
        await Promise.all([
          api.auth.me(),
          api.listings.mine(),
          api.requests.list(),
          api.transactions.list(),
          api.conversations.list(),
        ])
      setUser(currentUser)
      setListings(allListings)
      setRequests(openRequests)
      setTransactions(exchanges)
      setConversations(threads)
    } catch (cause: unknown) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Dashboard data could not be loaded.",
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const incomingOffers = requests
    .filter((request) => request.requesterId === user?.id)
    .flatMap((request) =>
      (request.offers ?? [])
        .filter((offer) => ["PENDING", "COUNTERED"].includes(offer.status))
        .map((offer) => ({ request, offer })),
    )
  const scheduledExchanges = transactions.filter((transaction) =>
    ["ACCEPTED", "SCHEDULED", "IN_PROGRESS"].includes(transaction.status),
  )

  async function decideOffer(offerId: string, decision: "accept" | "reject") {
    setBusyOffer(offerId)
    setError("")
    setNotice("")
    try {
      if (decision === "accept") {
        await api.requests.acceptOffer(offerId)
        setNotice(
          "Offer accepted. The exchange and private conversation are ready.",
        )
      } else {
        await api.requests.rejectOffer(offerId)
        setNotice("Offer declined.")
      }
      await load()
    } catch (cause: unknown) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "The offer could not be updated.",
      )
    } finally {
      setBusyOffer("")
    }
  }

  function beginEdit(listing: ApiListing) {
    setEditingListing(listing)
    setEditTitle(listing.title)
    setEditDescription(listing.description)
    setEditPrice(listing.priceCents == null ? "" : (listing.priceCents / 100).toFixed(2))
    setEditCondition(listing.condition ?? "")
    setEditError("")
    setError("")
  }

  async function saveListingEdits() {
    if (!editingListing) return
    if (editTitle.trim().length < 3 || editDescription.trim().length < 10) {
      setEditError("Title must be at least 3 characters and description at least 10.")
      return
    }
    const priceCents = editPrice.trim() ? Math.round(Number(editPrice) * 100) : undefined
    if (priceCents !== undefined && (!Number.isFinite(priceCents) || priceCents < 0)) {
      setEditError("Enter a valid non-negative price.")
      return
    }
    setBusyListing(editingListing.id)
    setEditError("")
    try {
      await api.listings.update(editingListing.id, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        priceCents,
        condition: editCondition || undefined,
      })
      setEditingListing(null)
      setNotice("Listing changes saved.")
      await load()
    } catch (cause: unknown) {
      setEditError(
        cause instanceof ApiError
          ? cause.message
          : "Listing changes could not be saved.",
      )
    } finally {
      setBusyListing("")
    }
  }

  async function archiveListing(listing: ApiListing) {
    if (!window.confirm(`Archive “${listing.title}”? It will no longer appear in marketplace search.`)) return
    setBusyListing(listing.id)
    setError("")
    try {
      await api.listings.archive(listing.id)
      setListings((current) => current.filter((item) => item.id !== listing.id))
      setNotice("Listing archived.")
    } catch (cause: unknown) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Listing could not be archived.",
      )
    } finally {
      setBusyListing("")
    }
  }

  async function publishListing(listing: ApiListing) {
    setBusyListing(listing.id)
    setError("")
    try {
      await api.listings.publish(listing.id)
      setNotice("Draft published to the marketplace.")
      await load()
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "Draft could not be published.")
    } finally {
      setBusyListing("")
    }
  }

  const displayName = [user?.profile?.firstName, user?.profile?.lastName]
    .filter(Boolean)
    .join(" ")
  const neighborhood = [user?.profile?.neighborhood, user?.profile?.city]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="min-h-screen bg-[#FAFAF7] pb-24 md:pb-0">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-[#1B2A4A]">
              My dashboard
            </h1>
            <p className="mt-1 text-[#8A9AB5]">
              {displayName || user?.email || "Your Neighborly account"}
              {neighborhood ? ` · ${neighborhood}` : ""}
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onNavigate("create")}
          >
            <Icon name="plus" size={13} />
            Post listing
          </Button>
        </div>

        <div className="mb-6">
          <TabBar
            tabs={["Overview", "My Listings", "Offers", "Activity"]}
            active={activeTab}
            onChange={(tab) => setActiveTab(tab as DashboardTab)}
          />
        </div>

        {notice && (
          <div
            role="status"
            className="mb-4 rounded-xl border border-[#74C69D] bg-[#F0FBF3] p-3 text-sm text-[#1B4332]"
          >
            {notice}
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E8694A]/30 bg-[#FFF5F2] p-3 text-sm text-[#C4512D]"
          >
            <span>{error}</span>
            <button
              onClick={() => void load()}
              className="font-semibold underline"
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div
            className="grid gap-4 md:grid-cols-2"
            aria-label="Loading dashboard"
          >
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-36 animate-pulse rounded-2xl bg-white"
              />
            ))}
          </div>
        ) : activeTab === "Overview" ? (
          <>
            <div className="mb-8 rounded-3xl bg-gradient-to-r from-[#1B2A4A] to-[#2D6A4F] p-6 text-white">
              <p className="text-sm font-semibold uppercase tracking-wide text-white/70">
                Neighborly trust
              </p>
              <h2 className="mt-1 font-display text-2xl font-semibold">
                Trust metrics are not available yet
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-white/75">
                Verification, response rates, and review summaries are not yet
                backed by trust records. No score or badge is shown until it can
                be explained with real data.
              </p>
            </div>

            <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                {
                  label: "Published listings",
                  value: listings.filter(listing => listing.status === "PUBLISHED").length,
                  color: "green",
                },
                {
                  label: "Offers to review",
                  value: incomingOffers.length,
                  color: "amber",
                },
                {
                  label: "Active exchanges",
                  value: scheduledExchanges.length,
                  color: "blue",
                },
                {
                  label: "Conversations",
                  value: conversations.length,
                  color: "coral",
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-[#E8E6DF] bg-white p-4"
                >
                  <p className="text-xs font-medium text-[#8A9AB5]">
                    {stat.label}
                  </p>
                  <p className="mt-1 font-display text-2xl font-semibold text-[#1B2A4A]">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            <SectionHeader
              title="Offers to review"
              subtitle="Offers on your published requests"
              action={() => onNavigate("requests")}
              actionLabel="Open requests"
            />
            {incomingOffers.length ? (
              <div className="mb-8 space-y-3">
                {incomingOffers.slice(0, 5).map(({ request, offer }) => (
                  <article
                    key={offer.id}
                    className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#E8E6DF] bg-white p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-[#1B2A4A]">
                        {request.title}
                      </p>
                      <p className="mt-1 text-xs text-[#5C6E8A]">
                        {offer.offerer?.profile?.firstName ?? "A neighbor"}{" "}
                        offered{" "}
                        {offer.amountCents == null
                          ? "to help"
                          : `$${(offer.amountCents / 100).toFixed(2)}`}
                        {" · "}
                        {offer.message}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        size="xs"
                        disabled={Boolean(busyOffer)}
                        onClick={() => void decideOffer(offer.id, "accept")}
                      >
                        {busyOffer === offer.id ? "Updating…" : "Accept"}
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={Boolean(busyOffer)}
                        onClick={() => void decideOffer(offer.id, "reject")}
                      >
                        Decline
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mb-8 rounded-2xl border border-dashed border-[#E8E6DF] bg-white p-6 text-sm text-[#8A9AB5]">
                No offers need a decision right now.
              </p>
            )}

            <SectionHeader
              title="Your exchanges"
              action={() => onNavigate("requests")}
              actionLabel="Manage exchanges"
            />
            {scheduledExchanges.length ? (
              <div className="space-y-3">
                {scheduledExchanges.slice(0, 5).map((transaction) => (
                  <article
                    key={transaction.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E8E6DF] bg-white p-4"
                  >
                    <div>
                      <p className="font-semibold text-sm text-[#1B2A4A]">
                        Neighbor exchange
                      </p>
                      <p className="mt-1 text-xs text-[#8A9AB5]">
                        {transaction.status.replace(/_/g, " ")}
                        {transaction.appointments[0]
                          ? ` · ${new Date(transaction.appointments[0].startsAt).toLocaleString()}`
                          : ""}
                      </p>
                    </div>
                    <Badge variant="blue">
                      {transaction.status.replace(/_/g, " ")}
                    </Badge>
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-[#E8E6DF] bg-white p-6 text-sm text-[#8A9AB5]">
                No active exchanges yet.
              </p>
            )}
          </>
        ) : activeTab === "My Listings" ? (
          listings.length ? (
            <div className="listing-grid">
              {listings.map((listing) => (
                <div key={listing.id}>
                  <div className="mb-2 flex justify-between"><Badge variant={listing.status === "DRAFT" ? "amber" : "green"}>{listing.status === "DRAFT" ? "Draft" : "Published"}</Badge></div>
                  <ListingCard
                    listing={mapApiListing(listing)}
                    onClick={listing.status === "PUBLISHED" ? () => onNavigate("listing", listing.id) : undefined}
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    {listing.status === "DRAFT" && <Button variant="primary" size="xs" disabled={Boolean(busyListing)} onClick={() => void publishListing(listing)}>Publish</Button>}
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={Boolean(busyListing)}
                      onClick={() => beginEdit(listing)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={Boolean(busyListing)}
                      onClick={() => void archiveListing(listing)}
                    >
                      Archive
                    </Button>
                  </div>
                </div>
              ))}
              {editingListing && (
                <div
                  className="fixed inset-0 z-[60] flex items-center justify-center bg-[#1B2A4A]/40 p-4"
                  role="presentation"
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setEditingListing(null)
                  }}
                >
                  <section
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="edit-listing-title"
                    className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl"
                  >
                    <h2
                      id="edit-listing-title"
                      className="font-display text-xl font-semibold text-[#1B2A4A]"
                    >
                      Edit listing
                    </h2>
                    <div className="mt-5 space-y-4">
                      {editError && (
                        <p role="alert" className="rounded-xl bg-[#FFF5F2] p-3 text-sm text-[#C4512D]">
                          {editError}
                        </p>
                      )}
                      <label className="block text-sm font-medium text-[#5C6E8A]">
                        Title
                        <input
                          value={editTitle}
                          onChange={(event) => setEditTitle(event.target.value)}
                          maxLength={140}
                          className="mt-1 h-11 w-full rounded-xl border border-[#E8E6DF] px-3 text-[#1B2A4A]"
                        />
                      </label>
                      <label className="block text-sm font-medium text-[#5C6E8A]">
                        Description
                        <textarea
                          value={editDescription}
                          onChange={(event) => setEditDescription(event.target.value)}
                          rows={4}
                          className="mt-1 w-full rounded-xl border border-[#E8E6DF] p-3 text-[#1B2A4A]"
                        />
                      </label>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block text-sm font-medium text-[#5C6E8A]">
                          Price in dollars
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editPrice}
                            onChange={(event) => setEditPrice(event.target.value)}
                            placeholder="Leave blank to keep current"
                            className="mt-1 h-11 w-full rounded-xl border border-[#E8E6DF] px-3 text-[#1B2A4A]"
                          />
                        </label>
                        <label className="block text-sm font-medium text-[#5C6E8A]">
                          Condition
                          <input
                            value={editCondition}
                            onChange={(event) => setEditCondition(event.target.value)}
                            className="mt-1 h-11 w-full rounded-xl border border-[#E8E6DF] px-3 text-[#1B2A4A]"
                          />
                        </label>
                      </div>
                    </div>
                    <div className="mt-6 flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={Boolean(busyListing)}
                        onClick={() => setEditingListing(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        loading={busyListing === editingListing.id}
                        disabled={Boolean(busyListing) && busyListing !== editingListing.id}
                        onClick={() => void saveListingEdits()}
                      >
                        Save changes
                      </Button>
                    </div>
                  </section>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#E8E6DF] bg-white p-10 text-center">
              <p className="font-semibold text-[#1B2A4A]">
                No listings or drafts yet
              </p>
              <p className="mt-2 text-sm text-[#8A9AB5]">
                Saved drafts and published listings will appear here.
              </p>
              <Button
                variant="primary"
                size="sm"
                className="mt-5"
                onClick={() => onNavigate("create")}
              >
                Create a listing
              </Button>
            </div>
          )
        ) : activeTab === "Offers" ? (
          incomingOffers.length ? (
            <div className="space-y-3">
              {incomingOffers.map(({ request, offer }) => (
                <article
                  key={offer.id}
                  className="rounded-2xl border border-[#E8E6DF] bg-white p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#1B2A4A]">
                        {request.title}
                      </p>
                      <p className="mt-1 text-sm text-[#5C6E8A]">
                        {offer.message}
                      </p>
                      <p className="mt-2 text-xs text-[#8A9AB5]">
                        {offer.offerer?.profile?.firstName ?? "A neighbor"} ·{" "}
                        {offer.amountCents == null
                          ? "No amount specified"
                          : `$${(offer.amountCents / 100).toFixed(2)}`}
                      </p>
                    </div>
                    <Badge variant="amber">{offer.status}</Badge>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="primary"
                      size="xs"
                      disabled={Boolean(busyOffer)}
                      onClick={() => void decideOffer(offer.id, "accept")}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={Boolean(busyOffer)}
                      onClick={() => void decideOffer(offer.id, "reject")}
                    >
                      Decline
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled
                      title="Counteroffers are managed from the Requests page"
                    >
                      Counteroffer unavailable here
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-[#E8E6DF] bg-white p-8 text-center text-sm text-[#8A9AB5]">
              No pending offers on your requests.
            </p>
          )
        ) : conversations.length ? (
          <div className="space-y-3">
            {conversations.map((conversation) => {
              const message = conversation.messages[0]
              return (
                <button
                  key={conversation.id}
                  onClick={() =>
                    onNavigate("messages", undefined, conversation.id)
                  }
                  className="flex w-full items-center gap-3 rounded-2xl border border-[#E8E6DF] bg-white p-4 text-left hover:border-[#2D6A4F]/40"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F0FBF3] text-[#2D6A4F]">
                    <Icon name="message" size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[#1B2A4A]">
                      Neighbor conversation
                    </span>
                    <span className="mt-1 block truncate text-xs text-[#8A9AB5]">
                      {message?.body ?? "No messages yet"}
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-[#2D6A4F]">
                    Open →
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-[#E8E6DF] bg-white p-8 text-center text-sm text-[#8A9AB5]">
            No conversations yet.
          </p>
        )}
      </div>
    </div>
  )
}
