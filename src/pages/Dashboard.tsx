import { useEffect, useState } from 'react'
import { Card, StatCard, Badge, Button, Icon, SectionHeader, TabBar, EmptyState, LoadState } from '../components/ui'
import { api, readError, readStatus } from '../api/client'
import type { ApiConversation, ApiTransaction } from '../api/types'
import { activityItems, unreadConversations, type ActivityItem } from '../lib/activity'
import {
  dollars,
  firstName,
  indexOffers,
  listingFromApi,
  matchesOfferChip,
  mediaSrc,
  offerBadge,
  offerRowsForUser,
  personName,
  relativeTime,
  type OfferRow,
} from '../lib/view'
import type { Listing } from '../data'

type Page = 'create' | 'listing' | 'messages'

interface DashboardProps {
  onNavigate: (p: Page, id?: string) => void
}

const alertClass = 'rounded-xl border border-[#E8694A]/30 bg-[#FFF5F2] px-4 py-3 text-sm text-[#A63D27]'

type ReviewPrompt = {
  transactionId: string
  subjectId: string
  subjectName: string | null
  title: string
  status: string
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [activeTab, setActiveTab] = useState('Overview')
  const [offerChip, setOfferChip] = useState('Received')
  const [userId, setUserId] = useState('')
  const [profileLabel, setProfileLabel] = useState('Neighbor')
  const [offerRows, setOfferRows] = useState<OfferRow[]>([])
  const [transactions, setTransactions] = useState<ApiTransaction[]>([])
  const [conversations, setConversations] = useState<ApiConversation[]>([])
  const [myListings, setMyListings] = useState<Listing[]>([])
  const [offerIndex, setOfferIndex] = useState<ReturnType<typeof indexOffers>>(new Map())
  const [offersLoading, setOffersLoading] = useState(true)
  const [offersError, setOffersError] = useState('')
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({})
  const [actingId, setActingId] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [skippedReviews, setSkippedReviews] = useState<string[]>([])
  const [reviewing, setReviewing] = useState<ReviewPrompt | null>(null)
  const [rating, setRating] = useState(0)
  const [reviewBody, setReviewBody] = useState('')
  const [reviewError, setReviewError] = useState('')
  const [reviewSubmitted, setReviewSubmitted] = useState(false)
  const [submittingReview, setSubmittingReview] = useState(false)

  useEffect(() => {
    let active = true
    setOffersLoading(true)
    setOffersError('')
    ;(async () => {
      const me = await api.auth.me()
      const [summaries, txs, convos, listingRows] = await Promise.all([
        api.requests.list(),
        api.transactions.list(),
        api.conversations.list(),
        api.listings.list({ limit: 100 }),
      ])
      const details = await Promise.all(
        summaries.filter((request) => request.offers.length > 0).map((request) => api.requests.get(request.id)),
      )
      if (!active) return
      const name = [me.profile?.firstName, me.profile?.lastName].filter(Boolean).join(' ')
      const place = me.profile?.neighborhood
      setUserId(me.id)
      setProfileLabel(place ? `${name || 'Neighbor'} · ${place}` : name || 'Neighbor')
      setTransactions(txs)
      setConversations(convos)
      setMyListings(
        listingRows
          .filter((row) => row.sellerId === me.id || row.seller?.id === me.id)
          .map((row) => listingFromApi(row)),
      )
      setOfferIndex(indexOffers(details))
      setOfferRows(offerRowsForUser(details, me.id))
    })()
      .catch((cause: unknown) => {
        if (!active) return
        setOffersError(readStatus(cause, 'Offers could not be loaded.'))
      })
      .finally(() => {
        if (active) setOffersLoading(false)
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  const pendingOffers = offerRows.filter(
    (offer) => offer.status === 'PENDING' && offer.requester.id === userId,
  )
  const filteredOffers = offerRows.filter((offer) => matchesOfferChip(offer, offerChip, userId))

  const reviewPrompts: ReviewPrompt[] = transactions
    .filter((tx) => tx.status === 'COMPLETED' && tx.participants.some((p) => p.userId === userId))
    .filter((tx) => !skippedReviews.includes(tx.id))
    .map((tx) => {
      const other = tx.participants.find((p) => p.userId !== userId)
      const linked = tx.offerId ? offerIndex.get(tx.offerId) : undefined
      const person = linked && other
        ? other.userId === linked.offer.offerer.id
          ? linked.offer.offerer
          : linked.request.requester
        : null
      return {
        transactionId: tx.id,
        subjectId: other?.userId ?? '',
        subjectName: person?.profile?.firstName ?? null,
        title: linked?.request.title ?? 'Completed exchange',
        status: tx.status,
      }
    })

  const meetups = transactions.flatMap((tx) =>
    (tx.appointments ?? []).map((appointment) => {
      const linked = tx.offerId ? offerIndex.get(tx.offerId) : undefined
      const other = tx.participants.find((p) => p.userId !== userId)
      const person = linked && other
        ? other.userId === linked.offer.offerer.id
          ? linked.offer.offerer
          : linked.request.requester
        : null
      const when = new Date(appointment.startsAt)
      return {
        id: appointment.id,
        with: person ? personName(person) : 'Neighbor',
        date: Number.isNaN(when.getTime())
          ? 'Scheduled'
          : when.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
        time: Number.isNaN(when.getTime())
          ? ''
          : when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
        location: appointment.locationNote || 'Meetup',
        listing: linked?.request.title ?? 'Exchange',
        conversationId: tx.conversationId,
      }
    }),
  )

  const activity: ActivityItem[] = activityItems({
    offers: offerRows,
    transactions,
    conversations,
    userId,
    titles: new Map(offerRows.map((offer) => [offer.offerId, offer.requestTitle])),
  })

  const setOfferError = (offerId: string, message: string) => {
    setCardErrors((prev) => ({ ...prev, [offerId]: message }))
  }

  const runOfferAction = async (offer: OfferRow, action: 'accept' | 'reject') => {
    setActingId(offer.offerId)
    setOfferError(offer.offerId, '')
    try {
      if (action === 'accept') await api.requests.acceptOffer(offer.requestId, offer.offerId)
      else await api.requests.rejectOffer(offer.requestId, offer.offerId)
      setReloadKey((key) => key + 1)
    } catch (cause: unknown) {
      setOfferError(offer.offerId, readError(cause, action === 'accept' ? 'Unable to accept this offer.' : 'Unable to decline this offer.'))
    } finally {
      setActingId(null)
    }
  }

  const counterFromDashboard = (offer: OfferRow) => {
    const conversationId = transactions.find((tx) => tx.offerId === offer.offerId)?.conversationId
    if (conversationId) onNavigate('messages', conversationId)
    else setOfferError(offer.offerId, "Open Messages isn't available for this offer yet.")
  }

  const openReview = (prompt: ReviewPrompt) => {
    setReviewing(prompt)
    setRating(0)
    setReviewBody('')
    setReviewError('')
    setReviewSubmitted(false)
  }

  const submitReview = async () => {
    if (!reviewing || !rating || !reviewBody.trim()) return
    if (reviewing.status !== 'COMPLETED') {
      setReviewError('Reviews are only allowed when the transaction is COMPLETED')
      return
    }
    if (!reviewing.subjectId) {
      setReviewError('Unable to submit this review. Please try again.')
      return
    }
    setSubmittingReview(true)
    setReviewError('')
    try {
      await api.reviews.create({
        transactionId: reviewing.transactionId,
        subjectId: reviewing.subjectId,
        rating,
        body: reviewBody.trim(),
      })
      setReviewSubmitted(true)
      const finishedId = reviewing.transactionId
      window.setTimeout(() => {
        setSkippedReviews((ids) => [...ids, finishedId])
        setReviewing(null)
        setSubmittingReview(false)
      }, 1600)
    } catch (cause: unknown) {
      setReviewError(readError(cause, 'Unable to submit this review. Please try again.'))
      setSubmittingReview(false)
    }
  }

  const offerThumb = (offer: OfferRow) => (
    <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-[#F5F4EF]">
      {offer.imageUrl && <img src={offer.imageUrl} alt="" className="w-full h-full object-cover" />}
    </div>
  )

  const offerAlert = (offerId: string) =>
    cardErrors[offerId] ? (
      <div className={alertClass} role="alert">{cardErrors[offerId]}</div>
    ) : null

  return (
    <div className="min-h-screen bg-[#FAFAF7] pb-24 md:pb-0">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="font-display text-3xl font-semibold text-[#1B2A4A]">My dashboard</h1>
            <p className="text-[#8A9AB5] mt-1">{profileLabel}</p>
          </div>
          <Button variant="primary" size="sm" onClick={() => onNavigate('create')}>
            <Icon name="plus" size={13} />
            Post listing
          </Button>
        </div>

        <div className="mb-8">
          <TabBar
            tabs={['Overview', 'My Listings', 'Offers', 'Activity']}
            active={activeTab}
            onChange={setActiveTab}
          />
        </div>

        {activeTab === 'Overview' && (
          <>
            <div className="bg-gradient-to-r from-[#1B2A4A] to-[#2D6A4F] rounded-3xl p-6 mb-8 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/70 mb-1 uppercase tracking-wide font-semibold">Account trust level</p>
                  <h2 className="font-display text-3xl font-semibold mb-2">Verified Neighbor 🏆</h2>
                  <p className="text-white/70 text-sm">ID verified · Email confirmed · 52 transactions · 4.9 rating</p>
                </div>
                <div className="text-right hidden md:block">
                  <div className="w-20 h-20 rounded-full border-4 border-white/30 flex items-center justify-center bg-white/10 text-2xl font-bold">
                    98%
                  </div>
                  <p className="text-xs text-white/60 mt-1">Trust score</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <Badge variant="green">✓ ID Verified</Badge>
                <Badge variant="green">✓ Email confirmed</Badge>
                <Badge variant="blue">⭐ 4.9 star rating</Badge>
                <Badge variant="amber">🏅 52 transactions</Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard label="Active Listings" value={offersLoading ? '…' : String(myListings.length)} sub="Published" icon={<Icon name="tag" size={18} />} color="green" />
              <StatCard label="Total Views" value="—" sub="Not tracked yet" icon={<Icon name="eye" size={18} />} color="blue" />
              <StatCard label="Messages" value={offersLoading ? '…' : String(conversations.length)} sub={offersLoading ? 'In your inbox' : `${unreadConversations(conversations, userId)} unread`} icon={<Icon name="message" size={18} />} color="coral" />
              <StatCard label="Earned" value="—" sub="Payments are not connected" icon={<Icon name="dollar" size={18} />} color="amber" />
            </div>

            <SectionHeader title="Pending offers" subtitle="Respond within 24 hours to keep your response rate high" />
            <div className="space-y-3 mb-8">
              {offersLoading ? (
                <div className="bg-white rounded-2xl border border-[#E8E6DF] p-8 text-center text-sm text-[#8A9AB5]">Loading offers…</div>
              ) : offersError ? (
                <div className="bg-[#FFF5F2] border border-[#E8694A]/20 rounded-2xl p-5 text-sm text-[#C4512D]">
                  Offers could not be loaded. {offersError}
                </div>
              ) : offerRows.length === 0 ? (
                <EmptyState
                  title="No offers yet"
                  description="When neighbors respond to a request you posted, their offers will show up here."
                  action={() => onNavigate('create')}
                  actionLabel="Post a request"
                  icon={<Icon name="dollar" size={24} />}
                />
              ) : (
                pendingOffers.map((offer) => (
                  <Card key={offer.offerId} className="flex flex-col gap-3">
                    <div className="flex items-center gap-4">
                      {offerThumb(offer)}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-[#1B2A4A] line-clamp-1">{offer.requestTitle}</p>
                        <p className="text-xs text-[#8A9AB5]">
                          {firstName(offer.offerer)} offered{' '}
                          {offer.amountCents == null ? (
                            offer.message
                          ) : (
                            <strong className="text-[#1B2A4A]">${dollars(offer.amountCents)}</strong>
                          )}
                          {offer.budgetCents != null && <> · asking ${dollars(offer.budgetCents)}</>}
                          {' · '}
                          {relativeTime(offer.createdAt)}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button disabled={actingId === offer.offerId} onClick={() => void runOfferAction(offer, 'accept')} className="px-3 py-1.5 bg-[#2D6A4F] text-white text-xs font-semibold rounded-lg hover:bg-[#1B4332] transition-colors disabled:opacity-40">Accept</button>
                        <button disabled={actingId === offer.offerId} onClick={() => counterFromDashboard(offer)} className="px-3 py-1.5 bg-white border border-[#E8E6DF] text-[#5C6E8A] text-xs font-semibold rounded-lg hover:bg-[#F5F4EF] transition-colors disabled:opacity-40">Counter</button>
                        <button disabled={actingId === offer.offerId} onClick={() => void runOfferAction(offer, 'reject')} className="px-3 py-1.5 bg-white border border-[#E8E6DF] text-[#E8694A] text-xs font-semibold rounded-lg hover:bg-[#FDE8E0] transition-colors disabled:opacity-40">Decline</button>
                      </div>
                    </div>
                    {offerAlert(offer.offerId)}
                  </Card>
                ))
              )}
            </div>

            <SectionHeader title="Upcoming meetups" />
            <div className="grid md:grid-cols-2 gap-4 mb-8">
              {meetups.map((meetup) => (
                <Card key={meetup.id} className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#DDEEFF] flex items-center justify-center flex-shrink-0">
                    <Icon name="calendar" size={18} className="text-[#4A7FB5]" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-[#1B2A4A]">{meetup.with}</p>
                    <p className="text-xs text-[#8A9AB5] mt-0.5">{meetup.date}{meetup.time ? ` at ${meetup.time}` : ''}</p>
                    <div className="flex items-center gap-1 text-xs text-[#5C6E8A] mt-1">
                      <Icon name="mapPin" size={10} className="text-[#E8694A]" />
                      {meetup.location}
                    </div>
                    <p className="text-xs text-[#C5CCDA] mt-0.5">Re: {meetup.listing}</p>
                  </div>
                  <button onClick={() => onNavigate('messages', meetup.conversationId ?? undefined)} className="text-xs font-semibold text-[#4A7FB5] flex-shrink-0">Message</button>
                </Card>
              ))}
            </div>

            <SectionHeader title="Reviews to complete" subtitle="Leave reviews for recent transactions" />
            <div className="space-y-3">
              {offersLoading ? (
                <div className="bg-white rounded-2xl border border-[#E8E6DF] p-8 text-center text-sm text-[#8A9AB5]">Loading offers…</div>
              ) : reviewPrompts.length === 0 ? (
                <EmptyState
                  title="No reviews waiting"
                  description="After a completed exchange, you can rate your neighbor from here."
                  action={() => setActiveTab('Offers')}
                  actionLabel="View offers"
                  icon={<Icon name="star" size={24} />}
                />
              ) : (
                reviewPrompts.map((prompt) => (
                  <Card key={prompt.transactionId} className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-[#F5F4EF]" />
                    <div className="flex-1">
                      <p className="text-xs text-[#8A9AB5]">Transaction complete</p>
                      <p className="font-semibold text-sm text-[#1B2A4A]">{prompt.title}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <Button variant="soft" size="xs" onClick={() => openReview(prompt)}>
                        {prompt.subjectName ? `Rate ${prompt.subjectName}` : 'Rate neighbor'}
                      </Button>
                      <button
                        onClick={() => setSkippedReviews((ids) => [...ids, prompt.transactionId])}
                        className="text-sm text-[#8A9AB5] hover:text-[#1B2A4A]"
                      >
                        Skip
                      </button>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </>
        )}

        {activeTab === 'My Listings' && (
          <div className="space-y-4">
            {offersLoading ? (
              <LoadState loading loadingLabel="Loading listings…" />
            ) : offersError ? (
              <LoadState error={offersError} loadingLabel="Loading listings…" />
            ) : myListings.length === 0 ? (
              <EmptyState
                title="No listings yet"
                description="Listings you publish will show up here."
                action={() => onNavigate('create')}
                actionLabel="Post a listing"
                icon={<Icon name="tag" size={24} />}
              />
            ) : myListings.map(listing => {
              const photo = mediaSrc(listing.images[0], 'w=160&h=160&fit=crop&auto=format')
              return (
              <Card key={listing.id} padding="none">
                <div className="flex gap-4 p-4">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 bg-[#F5F4EF] cursor-pointer" onClick={() => onNavigate('listing', listing.id)}>
                    {photo && <img src={photo} alt={listing.title} className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm text-[#1B2A4A] line-clamp-1 cursor-pointer hover:text-[#2D6A4F]" onClick={() => onNavigate('listing', listing.id)}>{listing.title}</p>
                      <span className="font-bold text-[#1B2A4A] flex-shrink-0">{listing.isFree ? 'Free' : listing.price == null ? '—' : `$${listing.price.toLocaleString()}`}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 mb-3">
                      <Badge variant="green" size="sm">Active</Badge>
                      <span className="text-xs text-[#8A9AB5]">Posted {listing.postedAt}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: 'Views', value: '—', icon: 'eye', color: 'text-[#4A7FB5]' },
                        { label: 'Saves', value: '—', icon: 'heart', color: 'text-[#E8694A]' },
                        { label: 'Messages', value: '—', icon: 'message', color: 'text-[#2D6A4F]' },
                        { label: 'Offers', value: '—', icon: 'dollar', color: 'text-[#D97706]' },
                      ].map(stat => (
                        <div key={stat.label} className="bg-[#F5F4EF] rounded-xl p-2 text-center">
                          <Icon name={stat.icon} size={12} className={`mx-auto mb-0.5 ${stat.color}`} />
                          <p className="font-bold text-sm text-[#1B2A4A]">{stat.value}</p>
                          <p className="text-[9px] text-[#8A9AB5]">{stat.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="border-t border-[#F5F4EF] px-4 py-3 flex gap-2">
                  <Button variant="outline" size="xs" onClick={() => onNavigate('listing', listing.id)}>Edit</Button>
                  <Button variant="ghost" size="xs">Pause</Button>
                  <Button variant="secondary" size="xs">🚀 Promote</Button>
                  <button className="ml-auto text-xs text-[#C5CCDA] hover:text-[#E8694A] transition-colors">Mark sold</button>
                </div>
              </Card>
              )
            })}
            <button onClick={() => onNavigate('create')} className="w-full py-4 border-2 border-dashed border-[#E8E6DF] rounded-2xl text-sm text-[#8A9AB5] hover:border-[#2D6A4F] hover:text-[#2D6A4F] transition-all flex items-center justify-center gap-2">
              <Icon name="plus" size={16} />
              Post a new listing
            </button>
          </div>
        )}

        {activeTab === 'Offers' && (
          <div className="space-y-4">
            <div className="flex gap-2 mb-2">
              {['Received', 'Sent', 'Accepted', 'Declined'].map(t => (
                <button
                  key={t}
                  onClick={() => setOfferChip(t)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${offerChip === t ? 'bg-[#2D6A4F] text-white border-[#2D6A4F]' : 'border-[#E8E6DF] text-[#5C6E8A] hover:border-[#2D6A4F] hover:text-[#2D6A4F] bg-white'}`}
                >
                  {t}
                </button>
              ))}
            </div>
            {offersLoading ? (
              <div className="bg-white rounded-2xl border border-[#E8E6DF] p-8 text-center text-sm text-[#8A9AB5]">Loading offers…</div>
            ) : offersError ? (
              <div className="bg-[#FFF5F2] border border-[#E8694A]/20 rounded-2xl p-5 text-sm text-[#C4512D]">
                Offers could not be loaded. {offersError}
              </div>
            ) : filteredOffers.length === 0 ? (
              <EmptyState
                title="No offers yet"
                description="When neighbors respond to a request you posted, their offers will show up here."
                action={() => onNavigate('create')}
                actionLabel="Post a request"
                icon={<Icon name="dollar" size={24} />}
              />
            ) : (
              filteredOffers.map((offer) => {
                const badge = offerBadge(offer.status)
                return (
                  <Card key={offer.offerId} className="flex items-center gap-4">
                    {offerThumb(offer)}
                    <div className="flex-1">
                      <p className="font-semibold text-sm text-[#1B2A4A]">{offer.requestTitle}</p>
                      <p className="text-xs text-[#8A9AB5]">{firstName(offer.offerer)} · {relativeTime(offer.createdAt)}</p>
                      {offer.amountCents == null ? (
                        <p className="text-xs text-[#8A9AB5] mt-1">{offer.message}</p>
                      ) : (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="font-bold text-[#1B2A4A]">${dollars(offer.amountCents)}</span>
                          {offer.budgetCents != null && (
                            <>
                              <span className="text-xs text-[#C5CCDA]">of</span>
                              <span className="text-sm text-[#8A9AB5]">${dollars(offer.budgetCents)}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </Card>
                )
              })
            )}
          </div>
        )}

        {activeTab === 'Activity' && (
          <div className="space-y-3">
            {offersLoading ? (
              <LoadState loading loadingLabel="Loading activity…" />
            ) : offersError ? (
              <LoadState error={offersError} loadingLabel="Loading activity…" />
            ) : activity.length === 0 ? (
              <EmptyState
                title="No activity yet"
                description="Messages, offers, and exchanges will show up here."
                action={() => onNavigate('create')}
                actionLabel="Post a request"
                icon={<Icon name="trendingUp" size={24} />}
              />
            ) : activity.map((item) => (
              <div key={item.id} className="flex items-start gap-3 p-4 bg-white rounded-2xl border border-[#E8E6DF]">
                <span className="text-xl flex-shrink-0">{item.icon}</span>
                <div className="flex-1">
                  <p className="text-sm text-[#1B2A4A]">{item.text}</p>
                  <p className="text-xs text-[#C5CCDA] mt-0.5">{item.time}</p>
                </div>
                {item.type === 'message' && <button onClick={() => onNavigate('messages')} className="text-xs text-[#4A7FB5] font-medium flex-shrink-0">Reply →</button>}
                {item.type === 'offer' && <button onClick={() => setActiveTab('Offers')} className="text-xs text-[#2D6A4F] font-medium flex-shrink-0">View offer →</button>}
              </div>
            ))}
          </div>
        )}
      </div>

      {reviewing && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-semibold text-[#1B2A4A]">Rate {reviewing.subjectName ?? 'neighbor'}</h3>
              <button
                onClick={() => setReviewing(null)}
                className="w-8 h-8 rounded-full bg-[#F5F4EF] flex items-center justify-center hover:bg-[#E8E6DF] transition-colors"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
            <div className="flex gap-3 p-3 bg-[#F5F4EF] rounded-xl mb-4">
              <div className="w-12 h-12 rounded-lg bg-[#E8E6DF] flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-[#1B2A4A] line-clamp-1">{reviewing.title}</p>
                <p className="text-xs text-[#8A9AB5]">Transaction complete</p>
              </div>
            </div>
            {reviewSubmitted ? (
              <div className="text-center py-4">
                <div className="text-3xl mb-2">✅</div>
                <p className="font-semibold text-[#1B2A4A]">Review submitted</p>
                <p className="text-sm text-[#8A9AB5]">Thanks for rating your neighbor.</p>
              </div>
            ) : (
              <>
                <div className="flex gap-2 mb-3">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRating(value)}
                      className={`text-2xl ${rating >= value ? 'text-[#F59E0B]' : 'text-[#E8E6DF]'}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                {reviewError && (
                  <div className={`${alertClass} mb-3`} role="alert">{reviewError}</div>
                )}
                <textarea
                  value={reviewBody}
                  onChange={(event) => setReviewBody(event.target.value)}
                  placeholder="How did the exchange go?"
                  rows={3}
                  className="w-full p-3 bg-[#F5F4EF] border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] resize-none focus:outline-none focus:border-[#2D6A4F] focus:bg-white transition-all"
                />
                <div className="flex justify-end mt-3">
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => void submitReview()}
                    disabled={!rating || !reviewBody.trim() || submittingReview}
                  >
                    Submit review
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
