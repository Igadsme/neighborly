import { useCallback, useEffect, useState } from "react"
import { api, readStatus } from "../../api/client"
import type { ApiListing } from "../../api/types"
import { listingFromApi } from "../../lib/view"
import { Alert, inputClass, primaryButton, ScreenTitle, secondaryButton } from "../../components/account-ui"
import ImageManager from "../../components/listing/ImageManager"

interface MyListingsProps {
  onNavigate: (page: string, id?: string) => void
}

type Filter = "ALL" | "DRAFT" | "PUBLISHED" | "SOLD" | "ARCHIVED"

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "DRAFT", label: "Drafts" },
  { id: "PUBLISHED", label: "Live" },
  { id: "SOLD", label: "Sold" },
  { id: "ARCHIVED", label: "Archived" },
]

/**
 * Owner management for every listing. Each row exposes only the transitions
 * that are legal from its current status, so the screen cannot offer an
 * action the API would reject.
 */
export default function MyListings({ onNavigate }: MyListingsProps) {
  const [filter, setFilter] = useState<Filter>("ALL")
  const [rows, setRows] = useState<ApiListing[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<ApiListing | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const listings = await api.listings.mine(filter === "ALL" ? undefined : filter)
      setRows(listings)
    } catch (cause) {
      setError(readStatus(cause, "Your listings could not be loaded."))
      setRows([])
    }
  }, [filter])

  useEffect(() => {
    setRows(null)
    void load()
  }, [load])

  async function act(listing: ApiListing, action: string) {
    setBusy(listing.id)
    setError(null)
    try {
      if (action === "publish") await api.listings.publish(listing.id)
      if (action === "archive") await api.listings.archive(listing.id)
      if (action === "restore") await api.listings.restore(listing.id)
      if (action === "sold") await api.listings.markSold(listing.id)
      if (action === "pause") await api.listings.pause(listing.id)
      await load()
    } catch (cause) {
      setError(readStatus(cause, "That change could not be applied."))
    } finally {
      setBusy(null)
    }
  }

  async function remove(listing: ApiListing) {
    if (!window.confirm("Delete this listing permanently? Offers and conversations that reference it are kept.")) {
      return
    }
    setBusy(listing.id)
    setError(null)
    try {
      await api.listings.remove(listing.id)
      await load()
    } catch (cause) {
      setError(readStatus(cause, "That listing could not be deleted."))
    } finally {
      setBusy(null)
    }
  }

  if (editing) {
    return <EditListing listing={editing} onDone={() => { setEditing(null); void load() }} />
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12 space-y-6">
      <ScreenTitle
        title="My listings"
        subtitle="Draft, publish, pause, archive, restore, or delete your listings."
      />

      <nav aria-label="Filter listings by status" className="flex flex-wrap gap-2">
        {FILTERS.map(entry => (
          <button
            key={entry.id}
            type="button"
            aria-current={filter === entry.id ? "page" : undefined}
            onClick={() => setFilter(entry.id)}
            className={
              filter === entry.id
                ? "rounded-full bg-[#2D6A4F] px-4 py-2 text-sm font-semibold text-white"
                : "rounded-full border border-[#D8DED8] bg-white px-4 py-2 text-sm text-[#1B2A4A] hover:bg-[#F4F6F2]"
            }
          >
            {entry.label}
          </button>
        ))}
      </nav>

      {error && <Alert tone="error">{error}</Alert>}
      {!rows && <Alert tone="info">Loading your listings…</Alert>}

      {rows && rows.length === 0 && (
        <Alert tone="info">
          No listings here yet. Create one and it will show up in this list.
        </Alert>
      )}

      <ul className="space-y-4">
        {(rows ?? []).map(listing => {
          const live = listing.id === busy
          return (
            <li key={listing.id} className="rounded-2xl border border-[#E8E6DF] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display font-semibold text-[#1B2A4A]">{listing.title}</p>
                  <p className="text-xs text-[#5A6B85]">
                    {listingFromApi(listing).price} · {listing.status} ·{" "}
                    {listingFromApi(listing).postedAt}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-[#D8DED8] px-3 py-1.5 text-sm hover:bg-[#F4F6F2]"
                  onClick={() => onNavigate("listing", listing.id)}
                >
                  View
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {listing.status === "DRAFT" && (
                  <Action label="Publish" onClick={() => act(listing, "publish")} disabled={live} />
                )}
                {listing.status === "PUBLISHED" && (
                  <>
                    <Action label="Mark sold" onClick={() => act(listing, "sold")} disabled={live} />
                    <Action label="Pause" onClick={() => act(listing, "pause")} disabled={live} />
                    <Action label="Archive" onClick={() => act(listing, "archive")} disabled={live} />
                  </>
                )}
                {listing.status === "ARCHIVED" && (
                  <>
                    <Action label="Restore" onClick={() => act(listing, "restore")} disabled={live} />
                    <Action label="Mark sold" onClick={() => act(listing, "sold")} disabled={live} />
                  </>
                )}
                {listing.status !== "SOLD" && (
                  <Action
                    label="Edit"
                    onClick={async () => {
                      const detail = await api.listings.manage(listing.id)
                      setEditing(detail)
                    }}
                    disabled={live}
                  />
                )}
                <Action
                  label="Delete"
                  tone="danger"
                  onClick={() => remove(listing)}
                  disabled={live}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </main>
  )
}

function Action({
  label,
  onClick,
  disabled,
  tone = "default",
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  tone?: "default" | "danger"
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        tone === "danger"
          ? "rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          : "rounded-lg border border-[#D8DED8] px-3 py-1.5 text-sm text-[#1B2A4A] hover:bg-[#F4F6F2] disabled:opacity-50"
      }
    >
      {label}
    </button>
  )
}

interface EditListingProps {
  listing: ApiListing
  onDone: () => void
}

function EditListing({ listing, onDone }: EditListingProps) {
  const [title, setTitle] = useState(listing.title ?? "")
  const [description, setDescription] = useState(listing.description ?? "")
  const [price, setPrice] = useState(
    listing.priceCents != null ? String(listing.priceCents / 100) : "",
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [images, setImages] = useState(listing.images ?? [])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSaved(false)
    if (title.trim().length < 3) {
      setError("Title must be at least 3 characters.")
      return
    }
    if (description.trim().length < 10) {
      setError("Description must be at least 10 characters.")
      return
    }
    const parsed = price.trim() === "" ? undefined : Number(price)
    if (parsed !== undefined && (!Number.isFinite(parsed) || parsed < 0)) {
      setError("Price must be a positive number.")
      return
    }
    setSaving(true)
    try {
      await api.listings.update(listing.id, {
        title: title.trim(),
        description: description.trim(),
        ...(parsed !== undefined ? { priceCents: Math.round(parsed * 100) } : {}),
      })
      setSaved(true)
      setTimeout(onDone, 400)
    } catch (cause) {
      setError(readStatus(cause, "Your listing could not be saved."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 space-y-6">
      <ScreenTitle title="Edit listing" subtitle={listing.title} />
      <form onSubmit={save} className="space-y-5" noValidate>
        <div>
          <label htmlFor="edit-title" className="block text-sm font-medium text-[#1B2A4A]">
            Title
          </label>
          <input
            id="edit-title"
            value={title}
            onChange={event => setTitle(event.target.value)}
            className={`${inputClass(null)} mt-1.5`}
          />
        </div>
        <div>
          <label htmlFor="edit-description" className="block text-sm font-medium text-[#1B2A4A]">
            Description
          </label>
          <textarea
            id="edit-description"
            rows={5}
            value={description}
            onChange={event => setDescription(event.target.value)}
            className={`${inputClass(null)} mt-1.5`}
          />
        </div>
        <div>
          <label htmlFor="edit-price" className="block text-sm font-medium text-[#1B2A4A]">
            Price
          </label>
          <input
            id="edit-price"
            inputMode="decimal"
            value={price}
            onChange={event => setPrice(event.target.value)}
            className={`${inputClass(null)} mt-1.5`}
          />
        </div>

        <ImageManager
          listingId={listing.id}
          initialImages={images}
          onListingCreated={created => setImages(created.images ?? [])}
        />

        {error && <Alert tone="error">{error}</Alert>}
        {saved && <Alert tone="success">Listing saved.</Alert>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="submit" className={primaryButton()} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button type="button" className={secondaryButton()} onClick={onDone}>
            Cancel
          </button>
        </div>
      </form>
    </main>
  )
}

export { viewerIdUnused as _viewerId }
const viewerIdUnused = undefined