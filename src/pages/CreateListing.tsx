import { useEffect, useState } from "react"
import { Button, ProgressBar, Badge, Icon } from "../components/ui"
import { api, readError } from "../api/client"
import type { ListingInput } from "../api/types"

type Page = "home" | "dashboard"

interface CreateListingProps {
  onNavigate: (p: Page) => void
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

const categories = [
  "Furniture",
  "Electronics",
  "Clothing & Accessories",
  "Vehicles",
  "Sports & Outdoors",
  "Toys & Games",
  "Books & Media",
  "Home & Garden",
  "Tools & Equipment",
  "Musical Instruments",
  "Art & Collectibles",
  "Other",
]

const aiSuggestions = {
  title: "West Elm Mid-Century Modern Walnut Desk — Adjustable Height",
  desc: 'Selling my Herman Miller Ratio sit-stand desk. Walnut 60" x 30" top, quiet motor, smooth adjustment from 25–51". Light surface scratches. Original retail $1,000+. Works perfectly. Pet-free, smoke-free home. Cash or Venmo. Pickup only.',
  price: "$480",
  issues: [],
}

export default function CreateListing({ onNavigate }: CreateListingProps) {
  const [step, setStep] = useState(0)
  const [listingType, setListingType] = useState<string | null>(null)
  const [photos, setPhotos] = useState<string[]>([
    "photo-1593640408182-31c228067bec",
    "photo-1614744682560-11d22b92aab4",
  ])
  const [title, setTitle] = useState("My Herman Miller Standing Desk")
  const [description, setDescription] = useState(
    "Great desk, works perfectly. Minor scratch on top.",
  )
  const [price, setPrice] = useState("480")
  const [condition, setCondition] = useState("Good")
  const [category, setCategory] = useState("Furniture")
  const [tags, setTags] = useState<string[]>(["Desk", "Office", "WFH"])
  const [newTag, setNewTag] = useState("")
  const [pickup, setPickup] = useState(true)
  const [delivery, setDelivery] = useState(false)
  const [aiApplied, setAiApplied] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [published, setPublished] = useState(false)
  const [coverImage, setCoverImage] = useState(0)
  const [categoryId, setCategoryId] = useState("")
  const [publishError, setPublishError] = useState("")
  const [categoryLoading, setCategoryLoading] = useState(true)

  const steps = ["Type", "Photos", "Details", "AI Review", "Preview", "Publish"]

  useEffect(() => {
    api.categories
      .list()
      .then((items) => {
        if (items.length === 0) {
          setCategoryId("")
          setPublishError("No categories are available yet.")
          return
        }
        const match = items.find((item) => item.name === category)
        setCategoryId(match?.id ?? "")
      })
      .catch(() =>
        setPublishError(
          "Categories are unavailable. Please retry before publishing.",
        ),
      )
      .finally(() => setCategoryLoading(false))
  }, [category])

  const listingBody = (): ListingInput | null => {
    const trimmedTitle = title.trim()
    const trimmedDescription = description.trim()
    if (!categoryId) {
      setPublishError(
        categoryLoading
          ? "Categories are still loading. Please retry."
          : "Choose a valid category before publishing.",
      )
      return null
    }
    if (trimmedTitle.length < 3 || trimmedTitle.length > 140) {
      setPublishError("Add a title of 3 to 140 characters.")
      return null
    }
    if (trimmedDescription.length < 10) {
      setPublishError("Add a description of at least 10 characters.")
      return null
    }
    let priceCents: number | undefined
    if (price.trim() !== "") {
      const amount = Number(price)
      if (!Number.isFinite(amount) || amount < 0) {
        setPublishError("Enter a price using numbers only.")
        return null
      }
      priceCents = Math.round(amount * 100)
    }
    return {
      categoryId,
      title: trimmedTitle,
      description: trimmedDescription,
      condition,
      pickupAvailable: pickup,
      deliveryAvailable: delivery,
      ...(priceCents !== undefined ? { priceCents } : {}),
    }
  }

  const handlePublish = async () => {
    if (publishing || savingDraft) return
    const body = listingBody()
    if (!body) return
    setPublishing(true)
    setPublishError("")
    try {
      await api.listings.create(body)
      setPublished(true)
    } catch (cause) {
      setPublishError(
        readError(cause, "Unable to publish this listing. Please try again."),
      )
    } finally {
      setPublishing(false)
    }
  }

  const handleSaveDraft = async () => {
    if (publishing || savingDraft) return
    const body = listingBody()
    if (!body) return
    setSavingDraft(true)
    setPublishError("")
    try {
      await api.listings.saveDraft(body)
      onNavigate("home")
    } catch (cause) {
      setPublishError(
        readError(cause, "Unable to save this draft. Please try again."),
      )
    } finally {
      setSavingDraft(false)
    }
  }

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag("")
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
            {step > 0 && (
              <button
                onClick={() => {
                  void handleSaveDraft()
                }}
                disabled={publishing || savingDraft || categoryLoading}
                className="text-sm text-[#8A9AB5] hover:text-[#1B2A4A] transition-colors disabled:opacity-60"
              >
                {savingDraft ? "Saving..." : "Save draft"}
              </button>
            )}
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
          {publishError && step !== 5 && (
            <div
              className="mt-4 rounded-xl border border-[#E8694A]/30 bg-[#FFF5F2] px-4 py-3 text-sm text-[#A63D27]"
              role="alert"
            >
              {publishError}
            </div>
          )}
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
                  onClick={() => setListingType(type.id)}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${
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
            <p className="text-[#8A9AB5] mb-6">
              High-quality photos sell faster. Add up to 12 photos. The first
              photo is your cover image.
            </p>

            {/* Photo grid */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {photos.map((photo, i) => (
                <div
                  key={i}
                  className={`relative rounded-2xl overflow-hidden aspect-square border-2 ${
                    coverImage === i ? "border-[#2D6A4F]" : "border-transparent"
                  }`}
                >
                  <img
                    src={`https://images.unsplash.com/${photo}?w=300&h=300&fit=crop&auto=format`}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  {coverImage === i && (
                    <div className="absolute top-2 left-2 bg-[#2D6A4F] text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                      COVER
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex gap-1">
                    <button
                      onClick={() => setCoverImage(i)}
                      className="w-6 h-6 rounded-full bg-white/90 shadow flex items-center justify-center text-[9px]"
                    >
                      ⭐
                    </button>
                    <button
                      onClick={() =>
                        setPhotos(photos.filter((_, j) => j !== i))
                      }
                      className="w-6 h-6 rounded-full bg-white/90 shadow flex items-center justify-center"
                    >
                      <Icon name="x" size={10} className="text-[#E8694A]" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Add photo */}
              {photos.length < 12 && (
                <button
                  onClick={() => setPhotos([...photos, `photo-${Date.now()}`])}
                  className="aspect-square rounded-2xl border-2 border-dashed border-[#E8E6DF] flex flex-col items-center justify-center text-[#C5CCDA] hover:border-[#2D6A4F]/50 hover:text-[#2D6A4F] transition-all bg-white"
                >
                  <Icon name="plus" size={22} />
                  <span className="text-xs mt-1 font-medium">Add photo</span>
                </button>
              )}
            </div>

            {/* AI photo feedback */}
            <div className="bg-gradient-to-r from-[#F0FBF3] to-[#F0F7FF] border border-[#74C69D]/30 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span>✨</span>
                <span className="text-xs font-semibold text-[#2D6A4F]">
                  AI Photo Review
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-[#1B2A4A]">
                  <span className="text-[#2D6A4F]">✓</span> Good lighting
                  detected
                </div>
                <div className="flex items-center gap-2 text-xs text-[#1B2A4A]">
                  <span className="text-[#2D6A4F]">✓</span> Item clearly visible
                </div>
                <div className="flex items-center gap-2 text-xs text-[#D97706]">
                  ⚠️ Try to show multiple angles for best results
                </div>
              </div>
            </div>
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
                Be specific and honest — listings with complete details sell 3x
                faster.
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
                onChange={(e) => {
                  setTitle(e.target.value)
                  setPublishError("")
                }}
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
                onChange={(e) => {
                  setDescription(e.target.value)
                  setPublishError("")
                }}
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
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-11 px-3 bg-white border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] focus:outline-none focus:border-[#2D6A4F]"
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
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
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0"
                    className="w-full h-11 pl-8 pr-4 bg-white border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] focus:outline-none focus:border-[#2D6A4F] transition-all"
                  />
                </div>
                <label className="flex items-center gap-2 px-4 h-11 bg-white border border-[#E8E6DF] rounded-xl cursor-pointer hover:border-[#2D6A4F]/30 transition-colors">
                  <input type="checkbox" className="accent-[#2D6A4F]" />
                  <span className="text-sm text-[#1B2A4A]">Free item</span>
                </label>
              </div>
              <p className="text-xs text-[#8A9AB5] mt-1.5 flex items-center gap-1">
                💡 Similar items in Atlanta sell for $400–$600
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
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTag()}
                  placeholder="Add a tag (e.g. WFH, West Elm)"
                  className="flex-1 h-9 px-3 bg-white border border-[#E8E6DF] rounded-lg text-sm text-[#1B2A4A] focus:outline-none focus:border-[#2D6A4F]"
                />
                <button
                  onClick={addTag}
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
                <button className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-[#E8E6DF] bg-white">
                  <span className="text-2xl">📬</span>
                  <span className="text-xs font-semibold text-[#5C6E8A]">
                    Shipping
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: AI assistance */}
        {step === 3 && (
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
                <img
                  src={`https://images.unsplash.com/${photos[coverImage]}?w=800&h=500&fit=crop&auto=format`}
                  alt={title}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="font-display text-xl font-semibold text-[#1B2A4A] leading-tight">
                    {aiApplied ? aiSuggestions.title : title}
                  </h3>
                  <span className="text-2xl font-bold text-[#1B2A4A] flex-shrink-0">
                    ${price}
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
                    G
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#1B2A4A]">
                      Gad M. (You)
                    </p>
                    <p className="text-xs text-[#8A9AB5]">
                      Inman Park · Just now
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
                  Your listing is live and visible to neighbors nearby.
                </p>
                <p className="text-sm text-[#8A9AB5] mb-8">
                  Offers will show up on your dashboard.
                </p>
                <div className="flex justify-center gap-3">
                  <Button
                    variant="primary"
                    onClick={() => onNavigate("dashboard")}
                  >
                    View offers →
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
                      action: () => {
                        void handleSaveDraft()
                      },
                      primary: false,
                    },
                  ].map(({ label, desc, icon, action, primary }) => (
                    <button
                      key={label}
                      onClick={action}
                      disabled={publishing || savingDraft || categoryLoading}
                      className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all ${
                        primary
                          ? "border-[#2D6A4F] bg-[#F0FBF3] hover:bg-[#D8F3DC]"
                          : "border-[#E8E6DF] bg-white hover:border-[#2D6A4F]/30"
                      }`}
                    >
                      <span className="text-3xl">
                        {publishing && primary
                          ? "⏳"
                          : savingDraft && !primary
                            ? "⏳"
                            : icon}
                      </span>
                      <div>
                        <p
                          className={`font-semibold ${
                            primary ? "text-[#2D6A4F]" : "text-[#1B2A4A]"
                          }`}
                        >
                          {publishing && primary
                            ? "Publishing..."
                            : savingDraft && !primary
                              ? "Saving..."
                              : label}
                        </p>
                        <p className="text-xs text-[#8A9AB5] mt-0.5">{desc}</p>
                      </div>
                    </button>
                  ))}
                </div>

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
                    <Button variant="secondary" size="sm">
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
                onClick={() => setStep(step + 1)}
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
