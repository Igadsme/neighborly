import { useEffect, useState } from 'react'
import { api, readStatus } from '../api/client'
import type { ApiListing, ProfileReview, PublicProfile } from '../api/types'
import { Avatar, Badge, Button, Icon, ListingCard, LoadState } from '../components/ui'
import { listingFromApi, memberSince, personName, relativeTime } from '../lib/view'

type Page = 'listing' | 'messages'

interface ProfileProps {
  onNavigate: (p: Page, id?: string) => void
  userId?: string | null
}

function profileName(profile: PublicProfile) {
  const named = [profile.firstName, profile.lastName].filter(Boolean).join(' ')
  return profile.displayName || named || 'Neighbor'
}

function ratingLabel(value: number | null) {
  if (value == null) return '—'
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1)
  return `${text}★`
}

function ratingBreakdown(reviews: ProfileReview[]) {
  return [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    percent: reviews.length === 0 ? 0 : Math.round((reviews.filter((review) => review.rating === stars).length / reviews.length) * 100),
  }))
}

export default function Profile({ onNavigate, userId }: ProfileProps) {
  const [activeTab, setActiveTab] = useState<'listings' | 'reviews' | 'sold'>('listings')
  const [profileNote, setProfileNote] = useState('')
  const [blocked, setBlocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [reviews, setReviews] = useState<ProfileReview[]>([])
  const [activeListings, setActiveListings] = useState<ApiListing[]>([])
  const [soldListings, setSoldListings] = useState<ApiListing[]>([])

  const messageProfile = async () => {
    if (!userId) {
      setProfileNote('Open Messages to continue a conversation.')
      onNavigate('messages')
      return
    }
    setProfileNote('')
    try {
      const result = await api.conversations.create({
        participantId: userId,
        body: 'Hi, I saw your profile on Neighborly.',
      })
      onNavigate('messages', result.conversation.id)
    } catch (cause: unknown) {
      setProfileNote(readStatus(cause, 'Unable to message this neighbor.'))
    }
  }

  const reportProfile = async () => {
    if (!profile) return
    setProfileNote('')
    try {
      await api.safety.report({ targetType: 'USER', targetId: profile.id, reason: 'OTHER' })
      setProfileNote('Report submitted.')
    } catch (cause: unknown) {
      setProfileNote(readStatus(cause, 'Unable to submit this report.'))
    }
  }

  const toggleBlock = async () => {
    if (!userId) return
    setProfileNote('')
    try {
      if (blocked) {
        await api.safety.unblock(userId)
        setBlocked(false)
        setProfileNote('Profile unblocked.')
      } else {
        await api.safety.block(userId)
        setBlocked(true)
        setProfileNote('Profile blocked. You cannot message this person.')
      }
    } catch (cause: unknown) {
      setProfileNote(readStatus(cause, 'Unable to update this block.'))
    }
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const load = async () => {
      const id = userId || (await api.auth.me()).id
      if (userId) {
        const blocks = await api.safety.blocks().catch(() => [])
        if (active) setBlocked(blocks.some((row) => row.userId === userId))
      } else if (active) {
        setBlocked(false)
      }
      const [nextProfile, nextReviews, published, sold] = await Promise.all([
        api.users.profile(id),
        api.users.reviews(id),
        api.listings.list({ sellerId: id, limit: 24 }),
        api.listings.list({ sellerId: id, status: 'SOLD', limit: 24 }),
      ])
      if (!active) return
      setProfile(nextProfile)
      setReviews(nextReviews)
      setActiveListings(published)
      setSoldListings(sold)
    }
    load()
      .catch((cause) => {
        if (!active) return
        setProfile(null)
        setError(readStatus(cause, 'Profile could not be loaded.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [userId])

  const name = profile ? profileName(profile) : ''
  const since = profile ? memberSince(profile.memberSince) : ''
  const area = profile?.neighborhood || profile?.city || 'Nearby'
  const desktopPlace = profile ? [profile.neighborhood, profile.city].filter(Boolean).join(', ') || 'Nearby' : ''

  return (
    <div className="min-h-screen bg-[#FAFAF7] pb-24 md:pb-0">

      {/* Cover / header */}
      <div className="h-32 md:h-44 bg-gradient-to-br from-[#1B2A4A] via-[#2D6A4F] to-[#40916C] relative">
        <div className="absolute inset-0 opacity-10">
          <svg viewBox="0 0 400 200" className="w-full h-full">
            <circle cx="50" cy="50" r="80" fill="white" />
            <circle cx="350" cy="150" r="100" fill="white" />
            <circle cx="200" cy="200" r="60" fill="white" />
          </svg>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6">
        {(loading || error || !profile) && (
          <div className="py-8">
            <LoadState loading={loading} error={error || (!loading ? 'Profile could not be loaded.' : '')} loadingLabel="Loading profile…" />
          </div>
        )}

        {profile && !loading && !error && (
          <>
        {/* Profile header */}
        <div className="relative -mt-16 md:-mt-20 mb-6">
          <div className="flex items-end justify-between">
            <div className="flex items-end gap-4">
              <div className="relative">
                <Avatar
                  name={name}
                  size="xl"
                  className="border-4 border-white shadow-lg"
                />
                {profile.emailVerified && (
                  <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#2D6A4F] rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                    <Icon name="check" size={12} className="text-white" />
                  </div>
                )}
              </div>
              <div className="pb-2 hidden md:block">
                <div className="flex items-center gap-2 mb-0.5">
                  <h1 className="font-display text-2xl font-semibold text-[#1B2A4A]">{name}</h1>
                </div>
                <p className="text-[#8A9AB5] text-sm">{desktopPlace} · Member since {since}</p>
              </div>
            </div>
            <div className="flex gap-2 pb-2">
              <button
                onClick={() => setProfileNote("Following neighbors isn't available yet.")}
                className="px-4 py-2 rounded-full text-sm font-semibold border transition-all bg-white text-[#1B2A4A] border-[#E8E6DF] hover:border-[#2D6A4F]"
              >
                Follow
              </button>
              <Button variant="primary" size="sm" onClick={() => void messageProfile()}>
                <Icon name="message" size={13} />
                Message
              </Button>
            </div>
          </div>

          {/* Mobile name */}
          <div className="mt-4 md:hidden">
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className="font-display text-2xl font-semibold text-[#1B2A4A]">{name}</h1>
            </div>
            <p className="text-[#8A9AB5] text-sm">{area} · Member since {since}</p>
          </div>
        </div>

        {/* Trust stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Rating', value: ratingLabel(profile.ratingAverage), color: 'text-[#F59E0B]', bg: 'bg-[#FEF3C7]', icon: '⭐' },
            { label: 'Reviews', value: `${profile.reviewCount}`, color: 'text-[#1B2A4A]', bg: 'bg-[#F0FBF3]', icon: '💬' },
            { label: 'Sales', value: `${profile.soldCount}`, color: 'text-[#1B2A4A]', bg: 'bg-[#DDEEFF]', icon: '✅' },
            { label: 'Response', value: '—', color: 'text-[#1B2A4A]', bg: 'bg-[#FDE8E0]', icon: '⚡' },
          ].map(stat => (
            <div key={stat.label} className={`${stat.bg} rounded-2xl p-4 text-center`}>
              <div className="text-2xl mb-1">{stat.icon}</div>
              <p className={`font-bold text-lg font-display ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-[#8A9AB5] font-medium">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Verification badges */}
        <div className="flex flex-wrap gap-2 mb-8">
          {profile.emailVerified && <Badge variant="green">✓ Email verified</Badge>}
          <Badge variant="navy">👤 {profile.soldCount} completed sales</Badge>
        </div>

        {/* About */}
        <div className="bg-white rounded-2xl border border-[#E8E6DF] p-5 mb-6">
          <h2 className="font-semibold text-[#1B2A4A] mb-2">About</h2>
          <p className="text-sm text-[#5C6E8A] leading-relaxed">
            {profile.bio?.trim() || 'No bio yet.'}
          </p>
        </div>

        {/* Safety info */}
        <div className="bg-[#F0FBF3] border border-[#74C69D]/30 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <Icon name="shield" size={16} className="text-[#2D6A4F] mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-sm text-[#1B2A4A]">{profile.emailVerified ? 'Email verified neighbor' : 'Neighborly member'}</p>
            <p className="text-xs text-[#5C6E8A] mt-0.5">{name} has {profile.reviewCount} {profile.reviewCount === 1 ? 'review' : 'reviews'} and has been a member since {since}.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[#F5F4EF] p-1 rounded-xl mb-6">
          {[
            { id: 'listings', label: `Active Listings (${activeListings.length})` },
            { id: 'reviews', label: `Reviews (${profile.reviewCount})` },
            { id: 'sold', label: `Sold (${soldListings.length})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'listings' | 'reviews' | 'sold')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-white text-[#1B2A4A] shadow-sm' : 'text-[#8A9AB5] hover:text-[#1B2A4A]'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Listings tab */}
        {activeTab === 'listings' && (
          activeListings.length === 0 ? (
            <p className="text-sm text-[#8A9AB5] text-center py-8">No active listings yet.</p>
          ) : (
            <div className="listing-grid">
              {activeListings.map(listing => (
                <ListingCard key={listing.id} listing={listingFromApi(listing)} onClick={() => onNavigate('listing', listing.id)} />
              ))}
            </div>
          )
        )}

        {/* Reviews tab */}
        {activeTab === 'reviews' && (
          <div>
            {/* Rating summary */}
            <div className="bg-white rounded-2xl border border-[#E8E6DF] p-5 mb-6">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-5xl font-bold font-display text-[#1B2A4A]">{profile.ratingAverage ?? '—'}</p>
                  <div className="flex my-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span key={star} className={profile.ratingAverage != null && star <= Math.round(profile.ratingAverage) ? 'text-[#F59E0B]' : 'text-[#E8E6DF]'}>★</span>
                    ))}
                  </div>
                  <p className="text-xs text-[#8A9AB5]">{profile.reviewCount} reviews</p>
                </div>
                <div className="flex-1">
                  {ratingBreakdown(reviews).map(({ stars, percent }) => (
                    <div key={stars} className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-[#8A9AB5] w-4">{stars}</span>
                      <span className="text-[#F59E0B] text-xs">★</span>
                      <div className="flex-1 h-2 bg-[#F5F4EF] rounded-full overflow-hidden">
                        <div className="h-full bg-[#F59E0B] rounded-full" style={{ width: `${percent}%` }} />
                      </div>
                      <span className="text-xs text-[#8A9AB5] w-8 text-right">{percent}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {reviews.length === 0 ? (
              <p className="text-sm text-[#8A9AB5] text-center py-8">No reviews yet.</p>
            ) : (
              <div className="space-y-4">
                {reviews.map((review) => (
                  <div key={review.id} className="bg-white rounded-2xl border border-[#E8E6DF] p-5">
                    <div className="flex items-start gap-3">
                      <Avatar name={personName(review.author)} size="sm" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-semibold text-sm text-[#1B2A4A]">{personName(review.author)}</p>
                          <span className="text-xs text-[#C5CCDA]">{relativeTime(review.createdAt)}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex">
                            {[...Array(review.rating)].map((_, j) => <span key={j} className="text-[#F59E0B] text-xs">★</span>)}
                          </div>
                          {review.itemTitle && (
                            <>
                              <span className="text-xs text-[#C5CCDA]">·</span>
                              <span className="text-xs text-[#8A9AB5]">{review.itemTitle}</span>
                            </>
                          )}
                        </div>
                        <p className="text-sm text-[#5C6E8A] leading-relaxed">{review.body}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sold tab */}
        {activeTab === 'sold' && (
          soldListings.length === 0 ? (
            <p className="text-sm text-[#8A9AB5] text-center py-8">No sold listings yet.</p>
          ) : (
            <div className="listing-grid">
              {soldListings.map(listing => (
                <div key={listing.id} className="relative">
                  <ListingCard listing={{ ...listingFromApi(listing), saved: false }} onClick={() => {}} />
                  <div className="absolute inset-0 bg-white/70 rounded-2xl flex items-center justify-center">
                    <Badge variant="navy">Sold</Badge>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Report */}
        <div className="text-center mt-8">
          <button
            onClick={() => void reportProfile()}
            className="text-xs font-medium transition-colors text-[#C5CCDA] hover:text-[#8A9AB5]"
          >
            Report this profile
          </button>
          {userId && (
            <button
              onClick={() => void toggleBlock()}
              className="block mx-auto mt-2 text-xs font-medium transition-colors text-[#C5CCDA] hover:text-[#8A9AB5]"
            >
              {blocked ? 'Unblock this profile' : 'Block this profile'}
            </button>
          )}
          {profileNote && <p className="text-xs text-[#A63D27] mt-2" role="alert">{profileNote}</p>}
        </div>
          </>
        )}
      </div>
    </div>
  )
}
