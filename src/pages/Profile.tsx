import { useCallback, useEffect, useState, type FormEvent } from "react"
import { api, ApiError } from "../api/client"
import type { ApiListing, ApiTransaction, CurrentUser } from "../api/types"
import { mapApiListing } from "../api/listing-mapper"
import { Badge, Button, ListingCard } from "../components/ui"

type ProfileTab = "listings" | "reviews"

interface ProfileProps {
  onNavigate: (page: "listing", listingId?: string) => void
}

export default function Profile({ onNavigate }: ProfileProps) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [listings, setListings] = useState<ApiListing[]>([])
  const [transactions, setTransactions] = useState<ApiTransaction[]>([])
  const [activeTab, setActiveTab] = useState<ProfileTab>("listings")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [currentUser, availableListings, exchanges] = await Promise.all([
        api.auth.me(),
        api.listings.mine(),
        api.transactions.list(),
      ])
      setUser(currentUser)
      setListings(
        availableListings.filter(
          (listing) => listing.status === "PUBLISHED",
        ),
      )
      setTransactions(exchanges)
    } catch (cause: unknown) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Your profile could not be loaded.",
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSaving(true)
    setError("")
    try {
      const updated = await api.users.updateProfile({
        firstName: String(data.get("firstName") ?? ""),
        lastName: String(data.get("lastName") ?? ""),
        displayName: String(data.get("displayName") ?? ""),
        bio: String(data.get("bio") ?? ""),
        neighborhood: String(data.get("neighborhood") ?? ""),
        city: String(data.get("city") ?? ""),
        state: String(data.get("state") ?? ""),
      })
      setUser(updated)
      setEditing(false)
      setNotice("Your profile was updated.")
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "Your profile could not be updated.")
    } finally {
      setSaving(false)
    }
  }

  async function exportAccount() {
    setSaving(true)
    setError("")
    try {
      const data = await api.users.exportData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `neighborly-account-export-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      setNotice("Your account export was downloaded.")
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "Your account export could not be created.")
    } finally {
      setSaving(false)
    }
  }

  const name =
    [user?.profile?.firstName, user?.profile?.lastName]
      .filter(Boolean)
      .join(" ") || "Neighbor"
  const location = [
    user?.profile?.neighborhood,
    user?.profile?.city,
    user?.profile?.state,
  ]
    .filter(Boolean)
    .join(", ")
  const completedCount = transactions.filter(
    (transaction) => transaction.status === "COMPLETED",
  ).length
  const reviews = transactions.flatMap((transaction) =>
    transaction.reviews
      .filter((review) => review.subjectId === user?.id)
      .map((review) => ({ ...review, transactionId: transaction.id })),
  )

  return (
    <div className="min-h-screen bg-[#FAFAF7] pb-24 md:pb-0">
      <div className="h-32 bg-gradient-to-br from-[#1B2A4A] via-[#2D6A4F] to-[#40916C] md:h-44" />
      <main className="mx-auto max-w-4xl px-4 md:px-6">
        <section className="relative -mt-14 mb-8 rounded-3xl border border-[#E8E6DF] bg-white p-5 shadow-sm md:-mt-16 md:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#8A9AB5]">
                Neighborly profile
              </p>
              <h1 className="mt-1 font-display text-2xl font-semibold text-[#1B2A4A] md:text-3xl">
                {loading ? "Loading profile…" : name}
              </h1>
              <p className="mt-1 text-sm text-[#8A9AB5]">
                {location ||
                  user?.email ||
                  "Add your neighborhood during onboarding."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="navy">Your account</Badge>
              <Button variant="outline" size="xs" onClick={() => setEditing(value => !value)}>{editing ? "Cancel" : "Edit profile"}</Button>
            </div>
          </div>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-[#5C6E8A]">
            {user?.profile?.bio || "Add a short introduction so neighbors know a little more about you."}
          </p>
          {editing && user && (
            <form onSubmit={saveProfile} className="mt-5 rounded-2xl border border-[#74C69D] bg-[#F0FBF3] p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <ProfileField name="firstName" label="First name" defaultValue={user.profile?.firstName} required />
                <ProfileField name="lastName" label="Last name" defaultValue={user.profile?.lastName} required />
                <ProfileField name="displayName" label="Display name" defaultValue={user.profile?.displayName} />
                <ProfileField name="neighborhood" label="Neighborhood" defaultValue={user.profile?.neighborhood} />
                <ProfileField name="city" label="City" defaultValue={user.profile?.city} />
                <ProfileField name="state" label="State or region" defaultValue={user.profile?.state} />
                <label className="text-xs font-semibold text-[#5C6E8A] md:col-span-2">Bio<textarea name="bio" maxLength={1000} rows={3} defaultValue={user.profile?.bio ?? ""} className="mt-1 block w-full rounded-xl border border-[#E8E6DF] bg-white px-3 py-2 text-sm font-normal text-[#1B2A4A]" /></label>
              </div>
              <div className="mt-4 flex justify-end"><Button type="submit" size="sm" loading={saving}>Save profile</Button></div>
            </form>
          )}
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
            {[
              { label: "Published listings", value: listings.length },
              { label: "Completed exchanges", value: completedCount },
              { label: "Received reviews", value: reviews.length },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl bg-[#F5F4EF] p-3 text-center"
              >
                <p className="font-display text-xl font-semibold text-[#1B2A4A]">
                  {loading ? "—" : stat.value}
                </p>
                <p className="mt-1 text-xs text-[#8A9AB5]">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        {notice && <div role="status" className="mb-5 rounded-xl border border-[#74C69D] bg-[#F0FBF3] p-3 text-sm text-[#1B4332]">{notice}</div>}
        {error && (
          <div
            role="alert"
            className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E8694A]/30 bg-[#FFF5F2] p-3 text-sm text-[#C4512D]"
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

        <div className="mb-5 flex gap-1 rounded-xl bg-[#F5F4EF] p-1">
          {([
            ["listings", `Published listings (${listings.length})`],
            ["reviews", `Received reviews (${reviews.length})`],
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                activeTab === tab
                  ? "bg-white text-[#1B2A4A] shadow-sm"
                  : "text-[#8A9AB5] hover:text-[#1B2A4A]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="listing-grid" aria-label="Loading profile data">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-64 animate-pulse rounded-2xl bg-white"
              />
            ))}
          </div>
        ) : activeTab === "listings" ? (
          listings.length ? (
            <div className="listing-grid">
              {listings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={mapApiListing(listing)}
                  onClick={() => onNavigate("listing", listing.id)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#E8E6DF] bg-white p-10 text-center">
              <p className="font-semibold text-[#1B2A4A]">
                No published listings
              </p>
              <p className="mt-2 text-sm text-[#8A9AB5]">
                Your published marketplace listings will show here.
              </p>
            </div>
          )
        ) : reviews.length ? (
          <div className="space-y-3">
            {reviews.map((review) => (
              <article
                key={`${review.transactionId}-${review.id}`}
                className="rounded-2xl border border-[#E8E6DF] bg-white p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-sm text-[#1B2A4A]">
                    Exchange review
                  </p>
                  <span className="text-sm font-semibold text-[#D97706]">
                    {"★".repeat(Math.max(0, Math.min(5, review.rating)))}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[#5C6E8A]">
                  {review.body || "No written comment was provided."}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#E8E6DF] bg-white p-10 text-center">
            <p className="font-semibold text-[#1B2A4A]">No reviews yet</p>
            <p className="mt-2 text-sm text-[#8A9AB5]">
              Reviews will appear after completed exchanges.
            </p>
          </div>
        )}

        <section className="my-8 rounded-2xl border border-[#E8E6DF] bg-white p-5">
          <h2 className="font-semibold text-[#1B2A4A]">
            Trust and safety status
          </h2>
          <p className="mt-2 text-sm text-[#5C6E8A]">
            Reporting and blocking protections are active across messages,
            requests, and community activity. Email, phone, and identity
            verification are not enabled, so Neighborly does not display an
            unverified badge or invented trust score.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!user?.profile?.emailVerified && <Button variant="soft" size="xs" loading={saving} onClick={async () => {
              setSaving(true); setError("")
              try { await api.auth.requestEmailVerification(); setNotice("Verification email sent. Check your inbox.") }
              catch (cause: unknown) { setError(cause instanceof ApiError ? cause.message : "Verification email could not be sent.") }
              finally { setSaving(false) }
            }}>Verify my email</Button>}
            {user?.profile?.emailVerified && <Badge variant="verified">Email verified</Badge>}
            <Button variant="ghost" size="xs" loading={saving} onClick={() => void exportAccount()}>Download my account data</Button>
          </div>
        </section>
      </main>
    </div>
  )
}

function ProfileField({ name, label, defaultValue, required }: { name: string; label: string; defaultValue?: string | null; required?: boolean }) {
  return <label className="text-xs font-semibold text-[#5C6E8A]">{label}<input name={name} required={required} maxLength={120} defaultValue={defaultValue ?? ""} className="mt-1 block h-10 w-full rounded-xl border border-[#E8E6DF] bg-white px-3 text-sm font-normal text-[#1B2A4A]" /></label>
}
