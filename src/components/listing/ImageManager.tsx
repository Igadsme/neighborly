import { useEffect, useRef, useState } from "react"
import { api, ApiError, readError, readStatus } from "../../api/client"
import type { ApiListing, StoredImage } from "../../api/types"
import { Alert, primaryButton, secondaryButton } from "../account-ui"

const MAX_IMAGES = 8
const MAX_BYTES = 5 * 1024 * 1024
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"]

export interface ImageManagerProps {
  listingId: string | null
  /** The listing being created has no id until the API returns one. */
  onListingCreated?: (listing: ApiListing) => void
  initialImages?: StoredImage[]
  /**
   * Creates the draft the first photo attaches to. Photos cannot upload
   * until that id exists.
   */
  createDraft?: () => Promise<ApiListing>
  onImages?: (images: StoredImage[]) => void
}

/**
 * Real uploads against the API.
 *
 * The file is posted to `POST /listings/:id/images`; the object lands in
 * object storage and the returned record is what the gallery renders, so a
 * reload shows the same images rather than a local preview that disappears.
 */
export default function ImageManager({
  listingId,
  onListingCreated,
  initialImages = [],
  createDraft,
  onImages,
}: ImageManagerProps) {
  const [images, setImages] = useState<StoredImage[]>(initialImages)
  const [storageReady, setStorageReady] = useState<boolean | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const inputRef = useRef<HTMLInputElement | null>(null)
  const dragActive = useRef(false)

  function remember(next: StoredImage[]) {
    setImages(next)
    onImages?.(next)
  }

  useEffect(() => {
    api.listings
      .storageStatus()
      .then((status: { configured: boolean }) => setStorageReady(status.configured))
      .catch(() => setStorageReady(false))
  }, [])

  useEffect(() => {
    if (initialImages.length) setImages(initialImages)
  }, [initialImages])

  async function upload(files: FileList | File[]) {
    const file = files[0]
    setError("")
    setNotice("")
    if (!file) return
    if (!ACCEPTED.includes(file.type)) {
      setError("Only JPEG, PNG, WebP, or GIF images are accepted.")
      return
    }
    if (file.size > MAX_BYTES) {
      setError("Images must be 5 MB or smaller.")
      return
    }
    if (images.length >= MAX_IMAGES) {
      setError(`A listing can have at most ${MAX_IMAGES} images.`)
      return
    }

    let target = listingId
    if (!target) {
      if (!createDraft) {
        setError("Photos wait until a draft exists.")
        return
      }
      try {
        const draft = await createDraft()
        if (!draft?.id) {
          setError("Photos wait until a draft exists.")
          return
        }
        target = draft.id
        onListingCreated?.(draft)
        setNotice("Draft saved. The photo is uploading to it.")
      } catch (cause) {
        setError(readError(cause, "Photos wait until a draft exists."))
        return
      }
    }

    setUploading(true)
    setProgress(0)
    try {
      await api.listings.uploadImage(target, file, setProgress)
      // Re-read from the server rather than trusting a local object URL, so
      // the gallery only ever shows persisted rows.
      const refreshed: { images?: StoredImage[] } = await api.listings.manage(target)
      remember((refreshed.images as StoredImage[]) ?? [])
      setNotice("Image uploaded.")
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 415
          ? "That file is not an image the API accepts."
          : readStatus(cause, "Upload failed. Try again."),
      )
    } finally {
      setUploading(false)
      setProgress(0)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function remove(imageId: string) {
    if (!listingId) return
    setError("")
    try {
      await api.listings.removeImage(listingId, imageId)
      setImages(current => {
        const next = current.filter(image => image.id !== imageId)
        onImages?.(next)
        return next
      })
    } catch (cause) {
      setError(readError(cause, "Could not remove that image."))
    }
  }

  /** Moves an image one slot earlier. The server owns the final ordering. */
  async function move(index: number, delta: number) {
    if (!listingId) return
    const next = [...images]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    const [row] = next.splice(index, 1)
    next.splice(target, 0, row)
    setImages(next)
    try {
      const reordered = await api.listings.reorderImages(
        listingId,
        next.map(image => image.id),
      )
      remember(reordered)
    } catch (cause) {
      setError(readError(cause, "Could not reorder the images."))
      await api.listings
        .manage(listingId)
        .then((row: { images?: StoredImage[] }) => remember(row.images ?? []))
    }
  }

  return (
    <section className="space-y-4" aria-labelledby="listing-images-heading">
      <div className="flex items-center justify-between">
        <h2 id="listing-images-heading" className="font-display text-lg font-semibold text-[#1B2A4A]">
          Photos
        </h2>
        <span className="text-xs text-[#5A6B85]">
          {images.length}/{MAX_IMAGES}
        </span>
      </div>

      {storageReady === false && (
        <Alert tone="error">
          Image storage is not configured on this server, so photos cannot be uploaded. Your
          listing text still saves normally.
        </Alert>
      )}

      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image, index) => (
            <li key={image.id} className="rounded-xl border border-[#D8DED8] bg-white p-2">
              <img
                src={image.url}
                alt={`Listing photo ${index + 1}`}
                className="h-28 w-full rounded-lg object-cover"
                loading="lazy"
              />
              <div className="mt-2 flex items-center justify-between gap-1">
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="rounded border border-[#D8DED8] px-2 py-1 text-xs disabled:opacity-40"
                    onClick={() => move(index, -1)}
                    disabled={index === 0 || !listingId}
                    aria-label={`Move photo ${index + 1} earlier`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="rounded border border-[#D8DED8] px-2 py-1 text-xs disabled:opacity-40"
                    onClick={() => move(index, 1)}
                    disabled={index === images.length - 1 || !listingId}
                    aria-label={`Move photo ${index + 1} later`}
                  >
                    ↓
                  </button>
                </div>
                <button
                  type="button"
                  className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-40"
                  onClick={() => remove(image.id)}
                  disabled={!listingId}
                  aria-label={`Remove photo ${index + 1}`}
                >
                  Remove
                </button>
              </div>
              {index === 0 && (
                <p className="mt-1 text-[10px] uppercase tracking-wide text-[#5A6B85]">
                  Primary photo
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {uploading && (
        <div>
          <label htmlFor="listing-image-progress" className="text-sm text-[#1B2A4A]">
            Uploading… {Math.round(progress * 100)}%
          </label>
          <progress
            id="listing-image-progress"
            className="mt-1 w-full"
            max={1}
            value={progress}
            aria-label="Image upload progress"
          />
        </div>
      )}

      <label
        htmlFor="listing-image-input"
        onDragOver={event => {
          event.preventDefault()
          dragActive.current = true
        }}
        onDragLeave={() => {
          dragActive.current = false
        }}
        onDrop={event => {
          event.preventDefault()
          dragActive.current = false
          if (event.dataTransfer?.files?.length) void upload(event.dataTransfer.files)
        }}
        className="block cursor-pointer rounded-xl border-2 border-dashed border-[#D8DED8] bg-white px-4 py-6 text-center hover:border-[#2D6A4F]"
      >
        <span className="text-sm font-medium text-[#1B2A4A]">
          {uploading ? "Uploading…" : "Add a photo"}
        </span>
        <span className="block text-xs text-[#5A6B85]">
          Drag and drop or browse. JPEG, PNG, WebP, or GIF up to 5 MB.
        </span>
      </label>
      <input
        ref={inputRef}
        id="listing-image-input"
        type="file"
        accept={ACCEPTED.join(",")}
        className="sr-only"
        disabled={uploading || storageReady === false || images.length >= MAX_IMAGES}
        onChange={event => {
          if (event.target.files?.length) void upload(event.target.files)
        }}
      />

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
    </section>
  )
}

export { primaryButton, secondaryButton }