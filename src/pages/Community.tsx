import { useCallback, useEffect, useState, type FormEvent } from "react"
import { api, ApiError } from "../api/client"
import type { ApiCommunityEvent, ApiCommunityPost } from "../api/types"
import { Avatar, Badge, Button, Icon } from "../components/ui"

interface CommunityProps {
  onNavigate: (page: "home" | "requests") => void
}

export default function Community({ onNavigate }: CommunityProps) {
  const [posts, setPosts] = useState<ApiCommunityPost[]>([])
  const [events, setEvents] = useState<ApiCommunityEvent[]>([])
  const [tab, setTab] = useState<"feed" | "events">("feed")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [showEventForm, setShowEventForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [postItems, eventItems] = await Promise.all([
        api.community.posts(),
        api.community.events(),
      ])
      setPosts(postItems)
      setEvents(eventItems)
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "Community activity could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const body = String(new FormData(form).get("body") ?? "").trim()
    if (!body) return
    setSaving(true)
    setError("")
    try {
      await api.community.createPost(body)
      form.reset()
      setNotice("Your post is now visible to the community.")
      await load()
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "Your post could not be published.")
    } finally {
      setSaving(false)
    }
  }

  async function addComment(event: FormEvent<HTMLFormElement>, postId: string) {
    event.preventDefault()
    const form = event.currentTarget
    const body = String(new FormData(form).get("comment") ?? "").trim()
    if (!body) return
    setSaving(true)
    setError("")
    try {
      await api.community.comment(postId, body)
      form.reset()
      await load()
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "Your comment could not be added.")
    } finally {
      setSaving(false)
    }
  }

  async function toggleReaction(postId: string, type: "LIKE" | "HELPFUL" | "CELEBRATE") {
    setSaving(true)
    setError("")
    try {
      await api.community.react(postId, type)
      await load()
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "Your reaction could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setSaving(true)
    setError("")
    try {
      await api.community.createEvent({
        title: String(data.get("title")),
        description: String(data.get("description")),
        location: String(data.get("location")),
        startsAt: new Date(String(data.get("startsAt"))).toISOString(),
        capacity: data.get("capacity") ? Number(data.get("capacity")) : undefined,
      })
      form.reset()
      setShowEventForm(false)
      setNotice("Your neighborhood event was published.")
      await load()
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "Your event could not be published.")
    } finally {
      setSaving(false)
    }
  }

  async function rsvp(eventId: string, status: "GOING" | "INTERESTED" | "NOT_GOING") {
    setSaving(true)
    setError("")
    try {
      await api.community.rsvp(eventId, status)
      setNotice(status === "GOING" ? "You’re going!" : status === "INTERESTED" ? "Saved as interested." : "Your RSVP was updated.")
      await load()
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "Your RSVP could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#FAFAF7] pb-24">
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge variant="green">Your neighborhood</Badge>
            <h1 className="mt-2 font-display text-3xl font-semibold text-[#1B2A4A]">Community</h1>
            <p className="mt-1 text-sm text-[#5C6E8A]">Share local updates, lend a hand, and meet at nearby events.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onNavigate("requests")}>Neighbor requests</Button>
            {tab === "events" && <Button size="sm" onClick={() => setShowEventForm(value => !value)}>Create event</Button>}
          </div>
        </header>

        <nav aria-label="Community sections" className="mt-6 flex w-fit rounded-full border border-[#E8E6DF] bg-white p-1">
          <button onClick={() => setTab("feed")} className={`rounded-full px-5 py-2 text-sm font-semibold ${tab === "feed" ? "bg-[#2D6A4F] text-white" : "text-[#5C6E8A]"}`}>Community feed</button>
          <button onClick={() => setTab("events")} className={`rounded-full px-5 py-2 text-sm font-semibold ${tab === "events" ? "bg-[#2D6A4F] text-white" : "text-[#5C6E8A]"}`}>Upcoming events</button>
        </nav>

        {notice && <div role="status" className="mt-5 rounded-xl border border-[#74C69D] bg-[#F0FBF3] p-3 text-sm text-[#1B4332]">{notice}</div>}
        {error && <div role="alert" className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-[#E8694A]/30 bg-[#FFF5F2] p-3 text-sm text-[#C4512D]"><span>{error}</span><button className="font-semibold underline" onClick={() => void load()}>Retry</button></div>}

        {tab === "feed" && (
          <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-4">
              <form onSubmit={createPost} className="rounded-2xl border border-[#E8E6DF] bg-white p-4 shadow-sm">
                <label htmlFor="community-post" className="text-sm font-semibold text-[#1B2A4A]">Share with your neighbors</label>
                <textarea id="community-post" name="body" required minLength={2} maxLength={5000} rows={3} placeholder="What’s happening nearby?" className="mt-2 w-full resize-none rounded-xl border border-[#E8E6DF] px-3 py-2.5 text-sm outline-none focus:border-[#2D6A4F]" />
                <div className="mt-3 flex justify-end"><Button type="submit" size="sm" loading={saving}>Post update</Button></div>
              </form>

              {loading ? <LoadingCards /> : posts.length === 0 ? <EmptyState title="Start the neighborhood conversation" body="There are no community posts yet. Share an update, question, or recommendation." /> : posts.map(post => <PostCard key={post.id} post={post} saving={saving} onReact={toggleReaction} onComment={addComment} />)}
            </div>
            <aside className="h-fit rounded-2xl border border-[#E8E6DF] bg-white p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F0FBF3] text-[#2D6A4F]"><Icon name="heart" size={19} /></span>
              <h2 className="mt-3 font-display text-lg font-semibold text-[#1B2A4A]">Keep it neighborly</h2>
              <p className="mt-1 text-sm leading-relaxed text-[#5C6E8A]">Be helpful, protect private details, and report activity that feels unsafe. Blocking a neighbor also hides their community activity.</p>
            </aside>
          </section>
        )}

        {tab === "events" && (
          <section className="mt-6">
            {showEventForm && <EventForm saving={saving} onSubmit={createEvent} onCancel={() => setShowEventForm(false)} />}
            <div className="grid gap-4 md:grid-cols-2">
              {loading ? <LoadingCards /> : events.length === 0 ? <div className="md:col-span-2"><EmptyState title="No upcoming events yet" body="Create a gathering, cleanup, class, or other local event." /></div> : events.map(item => <EventCard key={item.id} event={item} saving={saving} onRsvp={rsvp} />)}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

function displayName(profile?: { firstName?: string; displayName?: string | null } | null) {
  return profile?.displayName || profile?.firstName || "A neighbor"
}

function PostCard({ post, saving, onReact, onComment }: { post: ApiCommunityPost; saving: boolean; onReact: (id: string, type: "LIKE" | "HELPFUL" | "CELEBRATE") => void; onComment: (event: FormEvent<HTMLFormElement>, id: string) => void }) {
  const name = displayName(post.author.profile)
  const reactions = [["LIKE", "Like"], ["HELPFUL", "Helpful"], ["CELEBRATE", "Celebrate"]] as const
  return <article className="rounded-2xl border border-[#E8E6DF] bg-white p-5 shadow-sm">
    <div className="flex items-center gap-3"><Avatar name={name} /><div><h2 className="text-sm font-semibold text-[#1B2A4A]">{name}</h2><p className="text-xs text-[#8A9AB5]">{post.neighborhood || "Local community"} · {new Date(post.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p></div></div>
    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[#243760]">{post.body}</p>
    <div className="mt-4 flex flex-wrap gap-2 border-y border-[#E8E6DF] py-3">{reactions.map(([type, label]) => <button key={type} disabled={saving} onClick={() => onReact(post.id, type)} aria-pressed={post.viewerReactions.includes(type)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${post.viewerReactions.includes(type) ? "bg-[#D8F3DC] text-[#1B4332]" : "bg-[#F5F4EF] text-[#5C6E8A]"}`}>{label}{post.reactionCounts[type] ? ` · ${post.reactionCounts[type]}` : ""}</button>)}</div>
    {post.comments.length > 0 && <div className="mt-3 space-y-2">{post.comments.map(comment => <div key={comment.id} className="rounded-xl bg-[#F6F7FA] px-3 py-2 text-sm"><span className="font-semibold text-[#1B2A4A]">{displayName(comment.author.profile)}</span><span className="ml-2 text-[#5C6E8A]">{comment.body}</span></div>)}</div>}
    <form onSubmit={event => onComment(event, post.id)} className="mt-3 flex gap-2"><input name="comment" required maxLength={2000} aria-label={`Comment on ${name}'s post`} placeholder="Write a comment…" className="min-w-0 flex-1 rounded-full border border-[#E8E6DF] px-4 py-2 text-sm outline-none focus:border-[#2D6A4F]" /><Button type="submit" size="sm" disabled={saving}>Comment</Button></form>
  </article>
}

function EventForm({ saving, onSubmit, onCancel }: { saving: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return <form onSubmit={onSubmit} className="mb-5 rounded-2xl border border-[#74C69D] bg-white p-5 shadow-sm">
    <h2 className="font-display text-xl font-semibold text-[#1B2A4A]">Create a neighborhood event</h2>
    <div className="mt-4 grid gap-3 md:grid-cols-2"><input name="title" required minLength={3} maxLength={160} placeholder="Event title" className="rounded-xl border border-[#E8E6DF] px-3 py-2.5 text-sm" /><input name="location" required minLength={3} maxLength={300} placeholder="Location" className="rounded-xl border border-[#E8E6DF] px-3 py-2.5 text-sm" /><input name="startsAt" type="datetime-local" required className="rounded-xl border border-[#E8E6DF] px-3 py-2.5 text-sm" /><input name="capacity" type="number" min={1} max={100000} placeholder="Capacity (optional)" className="rounded-xl border border-[#E8E6DF] px-3 py-2.5 text-sm" /><textarea name="description" required minLength={10} maxLength={5000} rows={3} placeholder="Describe the event" className="rounded-xl border border-[#E8E6DF] px-3 py-2.5 text-sm md:col-span-2" /></div>
    <div className="mt-4 flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button><Button type="submit" size="sm" loading={saving}>Publish event</Button></div>
  </form>
}

function EventCard({ event, saving, onRsvp }: { event: ApiCommunityEvent; saving: boolean; onRsvp: (id: string, status: "GOING" | "INTERESTED" | "NOT_GOING") => void }) {
  const date = new Date(event.startsAt)
  return <article className="rounded-2xl border border-[#E8E6DF] bg-white p-5 shadow-sm">
    <div className="flex items-start gap-4"><div className="w-14 shrink-0 rounded-xl bg-[#FDE8E0] py-2 text-center"><div className="text-xs font-bold uppercase text-[#C4512D]">{date.toLocaleDateString(undefined, { month: "short" })}</div><div className="font-display text-2xl font-semibold text-[#1B2A4A]">{date.getDate()}</div></div><div><h2 className="font-display text-lg font-semibold text-[#1B2A4A]">{event.title}</h2><p className="mt-1 text-xs text-[#8A9AB5]">{date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p><p className="text-xs text-[#5C6E8A]">{event.location}</p></div></div>
    <p className="mt-4 text-sm leading-6 text-[#5C6E8A]">{event.description}</p>
    <div className="mt-4 flex items-center justify-between gap-3"><span className="text-xs font-medium text-[#5C6E8A]">{event.goingCount} going{event.capacity ? ` · ${event.capacity} spots` : ""}</span><div className="flex gap-2"><Button size="xs" variant={event.viewerRsvp === "INTERESTED" ? "soft" : "outline"} disabled={saving} onClick={() => onRsvp(event.id, "INTERESTED")}>Interested</Button><Button size="xs" variant={event.viewerRsvp === "GOING" ? "primary" : "outline"} disabled={saving} onClick={() => onRsvp(event.id, "GOING")}>Going</Button></div></div>
  </article>
}

function LoadingCards() {
  return <div aria-live="polite" className="space-y-3"><span className="sr-only">Loading community activity</span>{[1, 2].map(item => <div key={item} className="h-36 animate-pulse rounded-2xl border border-[#E8E6DF] bg-white" />)}</div>
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="rounded-2xl border border-dashed border-[#C5CCDA] bg-white p-10 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F0FBF3] text-[#2D6A4F]"><Icon name="message" size={21} /></span><h2 className="mt-4 font-display text-xl font-semibold text-[#1B2A4A]">{title}</h2><p className="mx-auto mt-1 max-w-md text-sm text-[#5C6E8A]">{body}</p></div>
}
