import { useEffect, useState } from "react"
import { Button, ProgressBar, Badge, Icon } from "../components/ui"
import { api, ApiError } from "../api/client"

type Page = "home" | "listing"

interface CreateListingProps {
  onNavigate: (p: Page, entityId?: string) => void
}

interface LocalPhoto {
  id: string
  file: File
}

const listingTypes = [
  {
    id: "item",
    emoji: "📦",
    label: "Item for Sale",
    desc: "Sell a physical item locally",
  },
  {
    id: "housing",
    emoji: "🏠",
    label: "Housing",
    desc: "Rent, sublet, or sell a property",
  },
  {
    id: "job",
    emoji: "💼",
    label: "Job or Gig",
    desc: "Post a local job or freelance gig",
  },
  {
    id: "service",
    emoji: "🔧",
    label: "Service",
    desc: "Offer a local service to neighbors",
  },
  {
    id: "free",
    emoji: "🎁",
    label: "Free Item",
    desc: "Give something away for free",
  },
  {
    id: "event",
    emoji: "🎭",
    label: "Event",
    desc: "Share a local event or happening",
  },
  {
    id: "vehicle",
    emoji: "🚗",
    label: "Vehicle",
    desc: "Cars, bikes, boats, and parts",
  },
  {
    id: "lost-found",
    emoji: "🔍",
    label: "Lost & Found",
    desc: "Help reunite lost items or pets",
  },
]

export default function CreateListing({ onNavigate }: CreateListingProps) {
  const [step, setStep] = useState(0)
  const [listingType, setListingType] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [price, setPrice] = useState("")
  const [aiApplied, setAiApplied] = useState(false)
  const aiSuggestions = { title: "", desc: "", price: "", issues: [] as string[] }
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState("")
  const [condition, setCondition] = useState("Good")
  const [category, setCategory] = useState("")
  const [categoryItems, setCategoryItems] = useState<Array<{ id: string; name: string }>>([])
  const [isFree, setIsFree] = useState(false)
  const [pickup, setPickup] = useState(true)
  const [delivery, setDelivery] = useState(false)
  const [shipping, setShipping] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const [categoryId, setCategoryId] = useState("")
  const [publishError, setPublishError] = useState("")
  const [draftNotice, setDraftNotice] = useState("")
  const [categoryLoading, setCategoryLoading] = useState(true)
  const [createdListingId, setCreatedListingId] = useState("")
  const [photos, setPhotos] = useState<LocalPhoto[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [uploadedImageIds, setUploadedImageIds] = useState<Record<string, string>>({})
  const [uploadProgress, setUploadProgress] = useState(0)

  const steps = ["Type", "Photos", "Details", "Review", "Preview", "Publish"]

  const addTag = () => setPublishError("Tags are not stored by the listing API yet.")

  const addPhotos = (files: File[]) => {
    const accepted = files.filter((file) =>
      ["image/jpeg", "image/png", "image/webp"].includes(file.type) &&
      file.size > 0 &&
      file.size <= 10 * 1024 * 1024,
    )
    if (accepted.length !== files.length) {
      setPublishError("Use JPG, PNG, or WebP photos no larger than 10 MB each.")
    } else {
      setPublishError("")
    }
    const available = Math.max(0, 5 - photos.length)
    if (accepted.length > available) {
      setPublishError("A listing can have at most 5 photos.")
    }
    setPhotos((current) => [
      ...current,
      ...accepted.slice(0, available).map((file) => ({
        id: crypto.randomUUID(),
        file,
      })),
    ])
  }

  const movePhoto = (index: number, direction: -1 | 1) => {
    setPhotos((current) => {
      const destination = index + direction
      if (destination < 0 || destination >= current.length) return current
      const next = [...current]
      ;[next[index], next[destination]] = [next[destination], next[index]]
      return next
    })
  }

  useEffect(() => {
    let current = true
    api.categories.list()
      .then(items => {
        if (!current) return
        setCategoryItems(items)
        const initial = items.find(item => item.name === "Furniture") ?? items[0]
        if (initial) setCategory(initial.name)
      })
      .catch(() => current && setPublishError("Categories are unavailable. Please retry before publishing."))
      .finally(() => current && setCategoryLoading(false))
    return () => { current = false }
  }, [])

  useEffect(() => {
    const previews = photos.map((photo) => URL.createObjectURL(photo.file))
    setPhotoPreviews(previews)
    return () => previews.forEach((preview) => URL.revokeObjectURL(preview))
  }, [photos])

  useEffect(() => {
    const match = categoryItems.find(item => item.name === category)
    setCategoryId(match?.id ?? "")
  }, [category, categoryItems])

  const validateListing = () => {
    if (title.trim().length < 3 || description.trim().length < 10) {
      setPublishError("Add a title of at least 3 characters and a description of at least 10 characters.")
      setStep(2)
      return false
    }
    if (!categoryId) {
      setPublishError("Choose a valid category before publishing.")
      return false
    }
    return true
  }

  const saveDraft = async () => {
    let listingId = createdListingId
    if (!listingId) {
      const created = await api.listings.create({
        categoryId,
        title: title.trim(),
        description: description.trim(),
        priceCents: isFree ? 0 : price ? Math.round(Number(price) * 100) : undefined,
        condition,
        pickupAvailable: pickup,
        deliveryAvailable: delivery,
        shippingAvailable: shipping,
      })
      listingId = created.id
      setCreatedListingId(listingId)
    } else {
      await api.listings.update(listingId, {
        title: title.trim(),
        description: description.trim(),
        priceCents: isFree ? 0 : price ? Math.round(Number(price) * 100) : undefined,
        condition,
        pickupAvailable: pickup,
        deliveryAvailable: delivery,
        shippingAvailable: shipping,
      })
    }
    const imageIds = { ...uploadedImageIds }
    for (const photo of photos) {
      if (imageIds[photo.id]) continue
      setUploadProgress(0)
      const uploaded = await api.listings.uploadImage(listingId, photo.file, setUploadProgress)
      imageIds[photo.id] = uploaded.id
      setUploadedImageIds((current) => ({ ...current, [photo.id]: uploaded.id }))
    }
    if (photos.length) {
      await api.listings.reorderImages(listingId, photos.map((photo) => imageIds[photo.id]))
    }
    return listingId
  }

  const handleSaveDraft = async () => {
    if (!validateListing()) return
    setPublishing(true)
    setPublishError("")
    setDraftNotice("")
    try {
      await saveDraft()
      setDraftNotice("Draft saved. You can edit or publish it from My dashboard.")
    } catch (cause) {
      setPublishError(cause instanceof ApiError ? cause.message : "Unable to save this draft. Please try again.")
    } finally {
      setPublishing(false)
    }
  }

  const handlePublish = async () => {
    if (!validateListing()) return
    setPublishing(true)
    setPublishError("")
    setDraftNotice("")
    let hasSavedDraft = Boolean(createdListingId)
    try {
      const listingId = await saveDraft()
      hasSavedDraft = true
      await api.listings.publish(listingId)
      setPublished(true)
    } catch (cause) {
      setPublishError(
        cause instanceof ApiError
          ? `${hasSavedDraft ? "Your draft is saved. Retry publishing to continue. " : ""}${cause.message}`
          : "Unable to publish this listing. Please try again.",
      )
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] pb-24 md:pb-0">
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="font-display text-2xl font-semibold text-[#1B2A4A]">
              Post a listing
            </h1>
            {step > 0 && <span className="text-xs text-[#8A9AB5]">Drafts are managed from My dashboard</span>}
          </div>
          <ProgressBar steps={6} current={step} />
          <div className="flex justify-between mt-2">
            {steps.map((s, i) => (
              <span
                key={s}
                className={`text-xs font-medium transition-colors ${
                  i === step
                    ? "text-[#2D6A4F]"
                    : i < step
                      ? "text-[#74C69D]"
                      : "text-[#C5CCDA]"
                }`}
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        {/* Step 0: Listing type */}
        {step === 0 && (
          <div className="animate-fade-in">
            <h2 className="font-display text-xl font-semibold text-[#1B2A4A] mb-2">
              What are you listing?
            </h2>
            <p className="text-[#8A9AB5] mb-6">
              Choose the type that best fits what you're offering.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {listingTypes.map((type) => (
                <button
                  key={type.id}
                  disabled={!["item", "free", "vehicle"].includes(type.id)}
                  onClick={() => {
                    setListingType(type.id)
                    const categoryName = type.id === "vehicle" ? "Vehicles" : "Furniture"
                    const target = categoryItems.find(item => item.name === categoryName)
                    if (target) setCategory(target.name)
                    setIsFree(type.id === "free")
                    if (type.id === "free") setPrice("0")
                    else if (isFree) setPrice("")
                  }}
                  className={`p-4 rounded-2xl border-2 text-left transition-all disabled:cursor-not-allowed disabled:opacity-55 ${
                    listingType === type.id
                      ? "border-[#2D6A4F] bg-[#F0FBF3]"
                      : "border-[#E8E6DF] bg-white hover:border-[#2D6A4F]/30"
                  }`}
                >
                  <span className="text-3xl mb-3 block">{type.emoji}</span>
                  <p
                    className={`font-semibold text-sm ${
                      listingType === type.id
                        ? "text-[#2D6A4F]"
                        : "text-[#1B2A4A]"
                    }`}
                  >
                    {type.label}
                  </p>
                  <p className="text-xs text-[#8A9AB5] mt-0.5 leading-tight">
                    {type.desc}
                  </p>
                  {!["item", "free", "vehicle"].includes(type.id) && <p className="mt-2 text-[10px] font-semibold text-[#C4512D]">Not available yet</p>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Photos */}
        {step === 1 && (
          <div className="animate-fade-in">
            <h2 className="font-display text-xl font-semibold text-[#1B2A4A] mb-2">
              Add photos
            </h2>
            <p className="text-[#8A9AB5] mb-6">Add up to 5 JPG, PNG, or WebP photos (10 MB maximum each). Files upload directly to secure storage when you publish.</p>
            {publishError && (
              <p role="alert" className="mb-3 text-sm text-[#C4512D]">{publishError}</p>
            )}
            <label className={`flex min-h-36 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#E8E6DF] bg-white text-center ${createdListingId ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-[#2D6A4F]"}`}>
              <Icon name="camera" size={28} className="text-[#C5CCDA]" />
              <span className="mt-3 text-sm font-semibold text-[#5C6E8A]">
                {createdListingId ? "Photos locked while the saved draft is being resumed" : "Choose photos"}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={Boolean(createdListingId)}
                onChange={(event) => {
                  addPhotos(Array.from(event.target.files ?? []))
                  event.target.value = ""
                }}
                className="sr-only"
              />
            </label>
            {photos.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((photo, index) => (
                  <div key={photo.id} className="overflow-hidden rounded-xl border border-[#E8E6DF] bg-white">
                    <img src={photoPreviews[index]} alt={`Listing photo ${index + 1} preview`} className="aspect-square w-full object-cover" />
                    <div className="flex items-center justify-between gap-2 p-2">
                      <span className="text-xs font-medium text-[#5C6E8A]">{index === 0 ? "Cover photo" : `Photo ${index + 1}`}</span>
                      <div className="flex gap-1">
                        <button type="button" disabled={Boolean(createdListingId) || index === 0} onClick={() => movePhoto(index, -1)} aria-label="Move photo earlier" className="rounded px-1 text-[#5C6E8A] disabled:opacity-40">↑</button>
                        <button type="button" disabled={Boolean(createdListingId) || index === photos.length - 1} onClick={() => movePhoto(index, 1)} aria-label="Move photo later" className="rounded px-1 text-[#5C6E8A] disabled:opacity-40">↓</button>
                        <button type="button" disabled={Boolean(createdListingId)} onClick={() => setPhotos((current) => current.filter((item) => item.id !== photo.id))} aria-label={`Remove photo ${index + 1}`} className="rounded px-1 text-[#C4512D] disabled:opacity-40">×</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Details */}
        {step === 2 && (
          <div className="animate-fade-in space-y-5">
            <div>
              <h2 className="font-display text-xl font-semibold text-[#1B2A4A] mb-2">
                Listing details
              </h2>
              <p className="text-[#8A9AB5] mb-6">
                Be specific and honest so nearby neighbors can decide whether
                your listing meets their needs.
              </p>
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-[#5C6E8A] uppercase tracking-wide mb-1.5">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. West Elm Mid-Century Sofa, Excellent Condition"
                className="w-full h-12 px-4 bg-white border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] focus:outline-none focus:border-[#2D6A4F] transition-all"
              />
              <p className="text-xs text-[#C5CCDA] mt-1 text-right">
                {title.length}/80 characters
              </p>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-[#5C6E8A] uppercase tracking-wide mb-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Describe the item — condition, dimensions, brand, reason for selling, and any defects."
                className="w-full p-4 bg-white border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] resize-none focus:outline-none focus:border-[#2D6A4F] transition-all"
              />
            </div>

            {/* Category + Condition */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#5C6E8A] uppercase tracking-wide mb-1.5">
                  Category
                </label>
                <select
                  value={category}
                  required
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-11 px-3 bg-white border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] focus:outline-none focus:border-[#2D6A4F]"
                >
                  <option value="">Choose category</option>
                  {categoryItems.map((c) => (
                    <option key={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#5C6E8A] uppercase tracking-wide mb-1.5">
                  Condition
                </label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full h-11 px-3 bg-white border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] focus:outline-none focus:border-[#2D6A4F]"
                >
                  {["New", "Like New", "Good", "Fair", "For Parts"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Price */}
            <div>
              <label className="block text-xs font-semibold text-[#5C6E8A] uppercase tracking-wide mb-1.5">
                Price
              </label>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8A9AB5]">
                    $
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={price}
                    disabled={isFree}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0"
                    className="w-full h-11 pl-8 pr-4 bg-white border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] focus:outline-none focus:border-[#2D6A4F] transition-all"
                  />
                </div>
                <label className="flex items-center gap-2 px-4 h-11 bg-white border border-[#E8E6DF] rounded-xl cursor-pointer hover:border-[#2D6A4F]/30 transition-colors">
                  <input type="checkbox" checked={isFree} onChange={event => { setIsFree(event.target.checked); if (event.target.checked) setPrice("0"); else if (price === "0") setPrice("") }} className="accent-[#2D6A4F]" />
                  <span className="text-sm text-[#1B2A4A]">Free item</span>
                </label>
              </div>
              <p className="text-xs text-[#8A9AB5] mt-1.5 flex items-center gap-1">
                Price suggestions are unavailable; choose a price based on your item.
              </p>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-xs font-semibold text-[#5C6E8A] uppercase tracking-wide mb-1.5">
                Tags
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1.5 px-3 py-1 bg-[#F0FBF3] border border-[#74C69D]/30 text-[#2D6A4F] rounded-full text-xs font-medium"
                  >
                    {tag}
                    <button
                      onClick={() => setTags(tags.filter((t) => t !== tag))}
                      className="hover:text-[#E8694A]"
                    >
                      <Icon name="x" size={10} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTag}
                  disabled
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTag()}
                  placeholder="Add a tag (e.g. WFH, West Elm)"
                  className="flex-1 h-9 px-3 bg-white border border-[#E8E6DF] rounded-lg text-sm text-[#1B2A4A] focus:outline-none focus:border-[#2D6A4F]"
                />
                <button
                  onClick={addTag}
                  disabled
                  className="px-3 h-9 bg-[#F0FBF3] text-[#2D6A4F] border border-[#74C69D]/30 rounded-lg text-sm font-medium hover:bg-[#D8F3DC] transition-colors"
                >
                  + Add
                </button>
              </div>
            </div>

            {/* Pickup/Delivery */}
            <div>
              <label className="block text-xs font-semibold text-[#5C6E8A] uppercase tracking-wide mb-3">
                Exchange options
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  {
                    key: "pickup",
                    label: "Pickup",
                    icon: "📍",
                    state: pickup,
                    set: setPickup,
                  },
                  {
                    key: "delivery",
                    label: "Delivery",
                    icon: "🚚",
                    state: delivery,
                    set: setDelivery,
                  },
                ].map(({ key, label, icon, state, set }) => (
                  <button
                    key={key}
                    onClick={() => set(!state)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                      state
                        ? "border-[#2D6A4F] bg-[#F0FBF3]"
                        : "border-[#E8E6DF] bg-white"
                    }`}
                  >
                    <span className="text-2xl">{icon}</span>
                    <span
                      className={`text-xs font-semibold ${
                        state ? "text-[#2D6A4F]" : "text-[#5C6E8A]"
                      }`}
                    >
                      {label}
                    </span>
                  </button>
                ))}
                <button onClick={() => setShipping(!shipping)} className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 ${shipping ? "border-[#2D6A4F] bg-[#F0FBF3]" : "border-[#E8E6DF] bg-white"}`}>
                  <span className="text-2xl">📬</span>
                  <span className="text-xs font-semibold text-[#5C6E8A]">
                    Shipping {shipping ? "✓" : ""}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-fade-in rounded-2xl border border-[#E8E6DF] bg-white p-6">
            <h2 className="font-display text-xl font-semibold text-[#1B2A4A]">Review your details</h2>
            <p className="mt-2 text-sm text-[#8A9AB5]">Automated writing, pricing, photo, and moderation assistance is not enabled. Check your own listing details before continuing.</p>
            <div className="mt-5 space-y-2 rounded-xl bg-[#FAFAF7] p-4 text-sm">
              <p><strong>Title:</strong> {title || "Not entered"}</p>
              <p><strong>Category:</strong> {category || "Not selected"}</p>
              <p><strong>Photos:</strong> {photos.length} selected for secure upload</p>
              <p><strong>Price:</strong> {isFree ? "Free" : price ? `$${price}` : "Negotiable"}</p>
            </div>
          </div>
        )}

        {/* AI assistance intentionally disabled in v1. */}
        {step === 30 && (
          <div className="animate-fade-in">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2D6A4F] to-[#4A7FB5] flex items-center justify-center text-xl">
                ✨
              </div>
              <div>
                <h2 className="font-display text-xl font-semibold text-[#1B2A4A]">
                  AI listing assistant
                </h2>
                <p className="text-sm text-[#8A9AB5]">
                  Neighborly AI reviewed your listing and has suggestions.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Better title */}
              <div className="bg-white rounded-2xl border border-[#E8E6DF] p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#1B2A4A]">
                      Suggested title
                    </span>
                    <Badge variant="blue" size="sm">
                      Improved
                    </Badge>
                  </div>
                </div>
                <div className="p-3 bg-[#F5F4EF] rounded-xl mb-3">
                  <p className="text-xs text-[#8A9AB5] font-medium mb-1">
                    YOURS
                  </p>
                  <p className="text-sm text-[#5C6E8A]">{title}</p>
                </div>
                <div className="p-3 bg-[#F0FBF3] border border-[#74C69D]/30 rounded-xl mb-3">
                  <p className="text-xs text-[#2D6A4F] font-medium mb-1">
                    AI SUGGESTED
                  </p>
                  <p className="text-sm text-[#1B2A4A] font-medium">
                    {aiSuggestions.title}
                  </p>
                </div>
                <p className="text-xs text-[#8A9AB5] mb-3">
                  More specific titles get 40% more views. Including brand and
                  key features helps buyers find your listing faster.
                </p>
                <button
                  onClick={() => {
                    setTitle(aiSuggestions.title)
                    setAiApplied(true)
                  }}
                  className={`text-sm font-semibold ${
                    aiApplied ? "text-[#2D6A4F]" : "text-[#4A7FB5]"
                  } hover:underline`}
                >
                  {aiApplied ? "✓ Applied" : "Apply suggestion"}
                </button>
              </div>

              {/* Price */}
              <div className="bg-white rounded-2xl border border-[#E8E6DF] p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-[#1B2A4A]">
                    Price analysis
                  </span>
                  <Badge variant="green" size="sm">
                    Fair market price
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-2 bg-[#E8E6DF] rounded-full relative">
                    <div className="absolute left-0 h-full w-[60%] bg-gradient-to-r from-[#D8F3DC] to-[#74C69D] rounded-full" />
                    <div
                      className="absolute h-4 w-1 bg-[#2D6A4F] rounded-full top-1/2 -translate-y-1/2"
                      style={{ left: "60%" }}
                    />
                  </div>
                  <span className="text-sm font-bold text-[#2D6A4F]">$480</span>
                </div>
                <p className="text-xs text-[#8A9AB5]">
                  Similar Herman Miller desks in Atlanta are listing at
                  $400–$650. Your price of $480 is well-positioned.
                </p>
              </div>

              {/* No issues */}
              <div className="bg-[#F0FBF3] border border-[#74C69D]/30 rounded-2xl p-5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#D8F3DC] flex items-center justify-center text-[#2D6A4F]">
                    <Icon name="check" size={16} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-[#1B2A4A]">
                      No issues detected
                    </p>
                    <p className="text-xs text-[#5C6E8A]">
                      This listing passed all content and policy checks.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Preview */}
        {step === 4 && (
          <div className="animate-fade-in">
            <h2 className="font-display text-xl font-semibold text-[#1B2A4A] mb-2">
              Preview your listing
            </h2>
            <p className="text-[#8A9AB5] mb-6">
              This is exactly how buyers will see your listing. Make any last
              edits before publishing.
            </p>

            <div className="bg-white rounded-3xl border border-[#E8E6DF] shadow-md overflow-hidden">
              {/* Image */}
              <div className="h-64 bg-[#F5F4EF] overflow-hidden">
                {photoPreviews[0]
                  ? <img src={photoPreviews[0]} alt="Listing cover preview" className="h-full w-full object-cover" />
                  : <div className="flex h-full items-center justify-center text-sm text-[#8A9AB5]">No cover photo selected</div>}
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="font-display text-xl font-semibold text-[#1B2A4A] leading-tight">
                    {title || "Your listing title"}
                  </h3>
                  <span className="text-2xl font-bold text-[#1B2A4A] flex-shrink-0">
                    {isFree ? "Free" : price ? `$${price}` : "Negotiable"}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="navy">{condition}</Badge>
                  {pickup && <Badge variant="green">Pickup</Badge>}
                </div>
                <p className="text-sm text-[#5C6E8A] mb-4 line-clamp-3">
                  {description}
                </p>
                <div className="flex items-center gap-2 pt-4 border-t border-[#F5F4EF]">
                  <div className="w-8 h-8 rounded-full bg-[#D8F3DC] flex items-center justify-center text-sm font-bold text-[#2D6A4F]">
                    <Icon name="user" size={15} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#1B2A4A]">
                      Your profile
                    </p>
                    <p className="text-xs text-[#8A9AB5]">
                      Member profile
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Publish */}
        {step === 5 && (
          <div className="animate-fade-in">
            <h2 className="font-display text-xl font-semibold text-[#1B2A4A] mb-2">
              Ready to go live?
            </h2>
            <p className="text-[#8A9AB5] mb-8">
              Choose when to publish your listing.
            </p>
            {publishError && (
              <div
                className="mb-4 rounded-xl border border-[#E8694A]/30 bg-[#FFF5F2] px-4 py-3 text-sm text-[#A63D27]"
                role="alert"
              >
                {publishError}
              </div>
            )}

            {published ? (
              <div className="text-center py-12">
                <div className="w-20 h-20 rounded-full bg-[#D8F3DC] flex items-center justify-center text-4xl mx-auto mb-5">
                  🎉
                </div>
                <h3 className="font-display text-2xl font-semibold text-[#1B2A4A] mb-2">
                  Listing published!
                </h3>
                <p className="text-[#5C6E8A] mb-2">
                  Your listing is published and visible in marketplace search.
                </p>
                <p className="text-sm text-[#8A9AB5] mb-8">
                  Your photos are stored securely with the listing.
                </p>
                <div className="flex justify-center gap-3">
                  <Button
                    variant="primary"
                    onClick={() => createdListingId ? onNavigate("listing", createdListingId) : onNavigate("home")}
                  >
                    View my listing →
                  </Button>
                  <Button variant="outline" onClick={() => onNavigate("home")}>
                    Go to feed
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3">
                  {[
                    {
                      label: "Publish now",
                      desc: "Go live immediately — start getting messages right away",
                      icon: "⚡",
                      action: handlePublish,
                      primary: true,
                    },
                    {
                      label: "Save as draft",
                      desc: "Save your work and publish when you're ready",
                      icon: "📝",
                      action: handleSaveDraft,
                      primary: false,
                    },
                ].map(({ label, desc, icon, action, primary }) => (
                    <button
                      key={label}
                      onClick={action}
                      disabled={publishing || categoryLoading}
                      className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all ${
                        primary
                          ? "border-[#2D6A4F] bg-[#F0FBF3] hover:bg-[#D8F3DC]"
                          : "border-[#E8E6DF] bg-white hover:border-[#2D6A4F]/30"
                      }`}
                    >
                      <span className="text-3xl">
                        {publishing && primary ? "⏳" : icon}
                      </span>
                      <div>
                        <p
                          className={`font-semibold ${
                            primary ? "text-[#2D6A4F]" : "text-[#1B2A4A]"
                          }`}
                        >
                          {publishing && primary
                            ? uploadProgress > 0 && uploadProgress < 100
                              ? `Uploading photo (${uploadProgress}%)...`
                              : "Publishing..."
                            : label}
                        </p>
                        <p className="text-xs text-[#8A9AB5] mt-0.5">
                          {primary
                            ? `${photos.length} photo${photos.length === 1 ? "" : "s"} upload securely before the listing goes live.`
                            : desc}
                        </p>
                      </div>
                    </button>
                ))}
                </div>
                {draftNotice && <div role="status" className="rounded-xl border border-[#74C69D] bg-[#F0FBF3] p-3 text-sm text-[#1B4332]">{draftNotice}</div>}

                {/* Promote option */}
                <div className="bg-gradient-to-r from-[#FDE8E0] to-[#FFF5F2] border border-[#E8694A]/20 rounded-2xl p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-[#1B2A4A] text-sm">
                        🚀 Boost your listing
                      </p>
                      <p className="text-xs text-[#8A9AB5] mt-0.5">
                        Get 5× more views with a promoted listing — $4.99 for 7
                        days
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" disabled title="Paid promotions are not available yet">
                      Promote
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        {!published && (
          <div className="flex items-center justify-between mt-10">
            {step > 0 ? (
              <Button
                variant="ghost"
                size="md"
                onClick={() => setStep(step - 1)}
              >
                ← Back
              </Button>
            ) : (
              <button
                onClick={() => onNavigate("home")}
                className="text-sm text-[#8A9AB5] hover:text-[#1B2A4A]"
              >
                Cancel
              </button>
            )}
            {step < 5 && (
              <Button
                variant="primary"
                size="md"
                onClick={() => setStep(step === 2 ? 3 : step + 1)}
                disabled={step === 0 && !listingType}
              >
                {step === 4 ? "Continue to publish →" : "Continue →"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
