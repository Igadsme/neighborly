import { useEffect, useState } from 'react'
import { Avatar, Badge, Button, Icon, SectionHeader, InlineAlert, LoadState } from '../components/ui'
import { api, readStatus } from '../api/client'
import { mediaSrc } from '../lib/view'
import {
  communityEventCard,
  communityPostCard,
  giveawayCard,
  lostFoundCard,
  type CommunityEventCard,
  type CommunityPostCard,
  type GiveawayCard,
  type LostFoundCard,
} from '../lib/verticals'

const typeConfig: Record<string, { label: string; badge: 'gray' | 'blue' | 'amber' | 'green' | 'coral' | 'navy'; emoji: string }> = {
  discussion: { label: 'Discussion', badge: 'gray', emoji: '💬' },
  announcement: { label: 'Announcement', badge: 'blue', emoji: '📢' },
  lost_found: { label: 'Lost & Found', badge: 'amber', emoji: '🔍' },
  recommendation: { label: 'Recommendation', badge: 'green', emoji: '⭐' },
  event: { label: 'Event', badge: 'coral', emoji: '🎭' },
  giveaway: { label: 'Giveaway', badge: 'green', emoji: '🎁' },
}

const reactionEmojis = ['👍', '❤️', '😮'] as const

export default function Community() {
  const [activeTab, setActiveTab] = useState<'feed' | 'events' | 'lost_found' | 'giveaways'>('feed')
  const [filterType, setFilterType] = useState<string | null>(null)
  const [postOpen, setPostOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newPost, setNewPost] = useState('')
  const [newPostType, setNewPostType] = useState('discussion')
  const [reactions, setReactions] = useState<Record<string, string>>({})
  const [attending, setAttending] = useState<string[]>([])
  const [postSent, setPostSent] = useState(false)
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState('')
  const [actionError, setActionError] = useState('')
  const [initial, setInitial] = useState('N')
  const [posts, setPosts] = useState<CommunityPostCard[]>([])
  const [events, setEvents] = useState<CommunityEventCard[]>([])
  const [lostFound, setLostFound] = useState<LostFoundCard[]>([])
  const [giveaways, setGiveaways] = useState<GiveawayCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    Promise.all([
      api.community.posts({ limit: 100 }),
      api.community.events(),
      api.community.lostFound(),
      api.community.giveaways(),
      api.auth.me().catch(() => null),
    ])
      .then(([postRows, eventRows, lostRows, giveawayRows, me]) => {
        if (!active) return
        setPosts(postRows.map(communityPostCard))
        setEvents(eventRows.map(communityEventCard))
        setLostFound(lostRows.map(lostFoundCard))
        setGiveaways(giveawayRows.map(giveawayCard))
        const letter = me?.profile?.firstName?.trim()?.[0]
        if (letter) setInitial(letter.toUpperCase())
      })
      .catch((cause: unknown) => {
        if (active) setError(readStatus(cause, 'Community could not be loaded.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  const filteredPosts = posts.filter(p => {
    if (filterType && p.type !== filterType) return false
    return true
  })

  const toggleReaction = async (postId: string, emoji: '👍' | '❤️' | '😮') => {
    setActionError('')
    const previous = reactions[postId]
    setReactions(prev => ({ ...prev, [postId]: prev[postId] === emoji ? '' : emoji }))
    try {
      const updated = communityPostCard(await api.community.react(postId, emoji))
      setPosts(prev => prev.map(post => post.id === postId ? updated : post))
    } catch (cause: unknown) {
      setReactions(prev => ({ ...prev, [postId]: previous ?? '' }))
      setActionError(readStatus(cause, 'Unable to react to this post.'))
    }
  }

  const toggleAttending = async (eventId: string) => {
    setActionError('')
    try {
      const result = await api.community.rsvp(eventId)
      setEvents(prev => prev.map(event => event.id === eventId ? { ...event, attending: result.attendingCount } : event))
      setAttending(prev => result.attending ? (prev.includes(eventId) ? prev : [...prev, eventId]) : prev.filter(id => id !== eventId))
    } catch (cause: unknown) {
      setActionError(readStatus(cause, 'Unable to update your RSVP.'))
    }
  }

  const claimGiveaway = async (id: string) => {
    setActionError('')
    try {
      const result = await api.community.claim(id)
      const card = giveawayCard(result.giveaway)
      setGiveaways(prev => prev.map(item => item.id === id ? { ...card, claimed: result.claimed } : item))
    } catch (cause: unknown) {
      setActionError(readStatus(cause, 'Unable to claim this giveaway.'))
    }
  }

  const submitPost = async () => {
    if (!newTitle.trim() || newTitle.trim().length < 3) {
      setPostError('Add a title of at least 3 characters.')
      return
    }
    if (newPost.trim().length < 10) {
      setPostError('Add a post of at least 10 characters.')
      return
    }
    setPosting(true)
    setPostError('')
    try {
      await api.community.createPost({
        type: newPostType,
        title: newTitle.trim(),
        body: newPost.trim(),
        neighborhood: 'Inman Park',
        city: 'Atlanta',
      })
      setPostSent(true)
      window.setTimeout(() => {
        setPostOpen(false)
        setPostSent(false)
        setPosting(false)
        setNewPost('')
        setNewTitle('')
        setReloadKey(key => key + 1)
      }, 1500)
    } catch (cause: unknown) {
      setPostError(readStatus(cause, 'Unable to publish this post.'))
      setPosting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] pb-24 md:pb-0">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-semibold text-[#1B2A4A]">Community</h1>
            <div className="flex items-center gap-1.5 mt-1 text-sm text-[#8A9AB5]">
              <Icon name="mapPin" size={12} className="text-[#E8694A]" />
              Inman Park + nearby neighborhoods
            </div>
          </div>
          <Button variant="primary" size="sm" onClick={() => { setPostError(''); setPostOpen(true) }}>
            <Icon name="plus" size={13} />
            Post
          </Button>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-2xl border border-[#E8E6DF] p-3 text-center">
            <p className="font-bold font-display text-[#1B2A4A] text-xl">2,847</p>
            <p className="text-xs text-[#8A9AB5]">Neighbors active</p>
          </div>
          <div className="bg-white rounded-2xl border border-[#E8E6DF] p-3 text-center">
            <p className="font-bold font-display text-[#2D6A4F] text-xl">{loading ? '…' : posts.length}</p>
            <p className="text-xs text-[#8A9AB5]">Posts this week</p>
          </div>
          <div className="bg-white rounded-2xl border border-[#E8E6DF] p-3 text-center">
            <p className="font-bold font-display text-[#E8694A] text-xl">{loading ? '…' : events.length}</p>
            <p className="text-xs text-[#8A9AB5]">Upcoming events</p>
          </div>
        </div>

        {/* Navigation tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide pb-1">
          {[
            { id: 'feed', label: '📰 Feed' },
            { id: 'events', label: '🎭 Events' },
            { id: 'lost_found', label: '🔍 Lost & Found' },
            { id: 'giveaways', label: '🎁 Giveaways' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'feed' | 'events' | 'lost_found' | 'giveaways')}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium border transition-all ${activeTab === tab.id ? 'bg-[#2D6A4F] text-white border-[#2D6A4F]' : 'bg-white text-[#5C6E8A] border-[#E8E6DF] hover:border-[#2D6A4F]/30'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <LoadState loading loadingLabel="Loading community…" />
        ) : error ? (
          <LoadState error={error} loadingLabel="Loading community…" />
        ) : (
          <>
            <InlineAlert message={actionError} />

            {/* Feed tab */}
            {activeTab === 'feed' && (
              <div>
                {/* Post type filters */}
                <div className="flex flex-wrap gap-2 mb-5">
                  <button
                    onClick={() => setFilterType(null)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${!filterType ? 'bg-[#1B2A4A] text-white border-[#1B2A4A]' : 'bg-white text-[#5C6E8A] border-[#E8E6DF]'}`}
                  >
                    All posts
                  </button>
                  {Object.entries(typeConfig).map(([type, { label, emoji }]) => (
                    <button
                      key={type}
                      onClick={() => setFilterType(filterType === type ? null : type)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${filterType === type ? 'bg-[#1B2A4A] text-white border-[#1B2A4A]' : 'bg-white text-[#5C6E8A] border-[#E8E6DF]'}`}
                    >
                      {emoji} {label}
                    </button>
                  ))}
                </div>

                {/* Post prompt */}
                <div
                  onClick={() => { setPostError(''); setPostOpen(true) }}
                  className="flex items-center gap-3 bg-white border border-[#E8E6DF] rounded-2xl p-4 mb-5 cursor-pointer hover:border-[#2D6A4F]/40 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-[#D8F3DC] flex items-center justify-center text-sm font-bold text-[#2D6A4F] flex-shrink-0">{initial}</div>
                  <span className="text-sm text-[#C5CCDA]">Share something with your neighborhood...</span>
                  <div className="ml-auto flex gap-2">
                    {['📢', '🎭', '🔍', '🎁'].map(emoji => (
                      <span key={emoji} className="text-base">{emoji}</span>
                    ))}
                  </div>
                </div>

                {filteredPosts.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="text-4xl mb-3">💬</div>
                    <p className="font-semibold text-[#1B2A4A]">No posts yet</p>
                    <p className="text-sm text-[#8A9AB5] mt-1">Be the first to share something with the neighborhood.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredPosts.map(post => {
                      const config = typeConfig[post.type] || typeConfig.discussion
                      return (
                        <div key={post.id} className="bg-white rounded-2xl border border-[#E8E6DF] p-5">
                          {/* Author */}
                          <div className="flex items-start gap-3 mb-3">
                            <Avatar src={post.author.avatar} name={post.author.name} size="sm" verified={post.author.verified} />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-sm text-[#1B2A4A]">{post.author.name}</p>
                                <span className="text-[#C5CCDA] text-xs">·</span>
                                <span className="text-xs text-[#8A9AB5]">{post.author.neighborhood}</span>
                                <span className="text-[#C5CCDA] text-xs">·</span>
                                <span className="text-xs text-[#C5CCDA]">{post.postedAt}</span>
                              </div>
                              <div className="mt-0.5">
                                <Badge variant={config.badge} size="sm">{config.emoji} {config.label}</Badge>
                              </div>
                            </div>
                          </div>

                          {/* Content */}
                          <h3 className="font-semibold text-[#1B2A4A] mb-2">{post.title}</h3>
                          <p className="text-sm text-[#5C6E8A] leading-relaxed mb-4">{post.body}</p>

                          {/* Actions */}
                          <div className="flex items-center gap-3 pt-3 border-t border-[#F5F4EF]">
                            <div className="flex items-center gap-1">
                              {reactionEmojis.map(emoji => (
                                <button
                                  key={emoji}
                                  onClick={() => void toggleReaction(post.id, emoji)}
                                  className={`text-sm px-2 py-1 rounded-lg transition-colors ${reactions[post.id] === emoji ? 'bg-[#F0FBF3]' : 'hover:bg-[#F5F4EF]'}`}
                                >
                                  {emoji}
                                </button>
                              ))}
                              <span className="text-xs text-[#8A9AB5] ml-1">{post.reactions.like + post.reactions.love + post.reactions.wow}</span>
                            </div>

                            <button className="flex items-center gap-1.5 text-xs text-[#8A9AB5] hover:text-[#1B2A4A] transition-colors ml-2">
                              <Icon name="message" size={13} />
                              {post.replies} replies
                            </button>

                            <button className="flex items-center gap-1.5 text-xs text-[#8A9AB5] hover:text-[#1B2A4A] transition-colors ml-auto">
                              <Icon name="share" size={13} />
                              Share
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Events tab */}
            {activeTab === 'events' && (
              <div>
                <SectionHeader title="Upcoming events" subtitle="What's happening in your neighborhoods" />
                {events.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="text-4xl mb-3">🎭</div>
                    <p className="font-semibold text-[#1B2A4A]">No upcoming events</p>
                    <p className="text-sm text-[#8A9AB5] mt-1">Neighborhood events will show up here.</p>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-5">
                    {events.map(event => {
                      const photo = mediaSrc(event.image, 'w=500&h=300&fit=crop&auto=format')
                      const going = attending.includes(event.id)
                      return (
                        <div key={event.id} className="bg-white rounded-2xl border border-[#E8E6DF] overflow-hidden card-hover cursor-pointer">
                          <div className="relative h-40 bg-[#F5F4EF] overflow-hidden">
                            {photo && <img src={photo} alt={event.title} className="w-full h-full object-cover" />}
                            <div className="absolute inset-0 bg-gradient-to-t from-[#1B2A4A]/60 to-transparent" />
                            <div className="absolute bottom-3 left-3 text-white">
                              <p className="font-semibold text-sm">{event.title}</p>
                              <p className="text-xs text-white/70">{event.neighborhood}</p>
                            </div>
                          </div>
                          <div className="p-4">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <p className="text-sm font-semibold text-[#E8694A]">{event.date}</p>
                                <p className="text-xs text-[#8A9AB5]">{event.time}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold text-[#1B2A4A]">{event.attending}</p>
                                <p className="text-xs text-[#8A9AB5]">attending</p>
                              </div>
                            </div>
                            <button
                              onClick={() => void toggleAttending(event.id)}
                              className={`w-full py-2 rounded-xl text-sm font-semibold transition-all ${
                                going
                                  ? 'bg-[#D8F3DC] text-[#2D6A4F]'
                                  : 'bg-[#2D6A4F] text-white hover:bg-[#1B4332]'
                              }`}
                            >
                              {going ? '✓ Going!' : 'RSVP'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Lost & Found tab */}
            {activeTab === 'lost_found' && (
              <div>
                <div className="flex items-center justify-between mb-5">
                  <SectionHeader title="Lost & Found" subtitle="Help reunite people with their lost items" />
                  <Button variant="secondary" size="sm">+ Post lost/found</Button>
                </div>

                {lostFound.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="text-4xl mb-3">🔍</div>
                    <p className="font-semibold text-[#1B2A4A]">Nothing lost or found</p>
                    <p className="text-sm text-[#8A9AB5] mt-1">Reports from neighbors will show up here.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {lostFound.map((item) => {
                      const photo = mediaSrc(item.image, 'w=160&h=160&fit=crop&auto=format')
                      return (
                        <div key={item.id} className="bg-white rounded-2xl border border-[#E8E6DF] p-5 flex gap-4">
                          <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-[#F5F4EF]">
                            {photo && <img src={photo} alt={item.item} className="w-full h-full object-cover" />}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant={item.type === 'lost' ? 'coral' : 'green'} size="sm">
                                {item.type === 'lost' ? '❌ Lost' : '✅ Found'}
                              </Badge>
                              <span className="text-xs text-[#C5CCDA]">{item.posted}</span>
                            </div>
                            <p className="font-semibold text-sm text-[#1B2A4A] mb-1">{item.item}</p>
                            <p className="text-xs text-[#8A9AB5] mb-3">
                              <Icon name="mapPin" size={10} className="inline text-[#E8694A]" /> {item.neighborhood} · Posted by {item.contact}
                            </p>
                            <Button variant="outline" size="xs">Contact {item.contact}</Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Giveaways tab */}
            {activeTab === 'giveaways' && (
              <div>
                <div className="flex items-center justify-between mb-5">
                  <SectionHeader title="Neighborhood giveaways" subtitle="Free items — first come first served" />
                  <Button variant="primary" size="sm">+ Give something</Button>
                </div>

                {giveaways.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="text-4xl mb-3">🎁</div>
                    <p className="font-semibold text-[#1B2A4A]">No giveaways right now</p>
                    <p className="text-sm text-[#8A9AB5] mt-1">Free items from neighbors will show up here.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {giveaways.map((giveaway) => (
                      <div key={giveaway.id} className={`bg-white rounded-2xl border p-5 ${giveaway.claimed ? 'border-[#E8E6DF] opacity-60' : 'border-[#D8F3DC]'}`}>
                        <div className="flex items-start gap-3">
                          <Avatar src={giveaway.poster.avatar} name={giveaway.poster.name} size="sm" verified={giveaway.poster.verified} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="font-semibold text-sm text-[#1B2A4A]">{giveaway.poster.name}</p>
                              <span className="text-xs text-[#C5CCDA]">·</span>
                              <span className="text-xs text-[#8A9AB5]">{giveaway.neighborhood} · {giveaway.time}</span>
                            </div>
                            <p className="text-sm text-[#5C6E8A] mb-3">{giveaway.item}</p>
                            <div className="flex items-center gap-2">
                              <Badge variant="green" size="sm">🎁 Free</Badge>
                              {giveaway.claimed && <Badge variant="gray" size="sm">Claimed</Badge>}
                              {!giveaway.claimed && (
                                <button onClick={() => void claimGiveaway(giveaway.id)} className="ml-2 text-sm font-semibold text-[#2D6A4F] hover:underline">
                                  I'll take it! →
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tips */}
                <div className="mt-6 bg-[#F0FBF3] border border-[#74C69D]/30 rounded-2xl p-4 text-sm text-[#5C6E8A]">
                  <p className="font-semibold text-[#1B2A4A] mb-1">💚 Giveaway tips</p>
                  <ul className="space-y-1">
                    <li>• Post early in the morning for fastest response</li>
                    <li>• Include a photo for best results</li>
                    <li>• Arrange pickup at a safe public location</li>
                    <li>• Mark as claimed once someone takes it</li>
                  </ul>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* New post modal */}
      {postOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 animate-fade-in-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl font-semibold text-[#1B2A4A]">New community post</h3>
              <button onClick={() => setPostOpen(false)} className="w-8 h-8 rounded-full bg-[#F5F4EF] flex items-center justify-center">
                <Icon name="x" size={14} />
              </button>
            </div>

            {/* Post type */}
            <div className="flex flex-wrap gap-2 mb-4">
              {Object.entries(typeConfig).map(([type, { label, emoji }]) => (
                <button
                  key={type}
                  onClick={() => setNewPostType(type)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${newPostType === type ? 'bg-[#2D6A4F] text-white border-[#2D6A4F]' : 'bg-white text-[#5C6E8A] border-[#E8E6DF]'}`}
                >
                  {emoji} {label}
                </button>
              ))}
            </div>

            {postSent ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">🎉</div>
                <p className="font-semibold text-[#1B2A4A]">Post published!</p>
                <p className="text-sm text-[#8A9AB5]">Your neighbors will see it in their feed.</p>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="Give your post a title..."
                  className="w-full h-11 px-4 bg-[#F5F4EF] border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] focus:outline-none focus:border-[#2D6A4F] mb-3"
                />
                <textarea
                  value={newPost}
                  onChange={e => setNewPost(e.target.value)}
                  rows={4}
                  placeholder="What do you want to share with your neighborhood?"
                  className="w-full p-4 bg-[#F5F4EF] border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] resize-none focus:outline-none focus:border-[#2D6A4F] transition-all mb-3"
                />
                <InlineAlert message={postError} />
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-2 text-xs text-[#8A9AB5]">
                    <Icon name="mapPin" size={11} className="text-[#E8694A]" />
                    Posting to Inman Park + nearby
                  </div>
                  <Button variant="primary" size="sm" onClick={() => void submitPost()} disabled={!newPost.trim() || posting}>
                    {posting ? 'Posting...' : 'Post to neighborhood'}
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
