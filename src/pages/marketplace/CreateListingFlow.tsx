import { useMemo, useState } from "react"
import { api, readStatus } from "../../api/client"
import type { ApiListing, HousingCreateInput } from "../../api/types"
import {
  Alert,
  Field,
  inputClass,
  primaryButton,
  ScreenTitle,
  secondaryButton,
} from "../../components/account-ui"
import ImageManager from "../../components/listing/ImageManager"

/**
 * Which backend contract a category belongs to.
 *
 * A specialized category must not be submitted to the generic marketplace
 * endpoint: that would create a `Listing` row where the vertical screens
 * expect a `HousingListing`, and the listing would appear in the wrong
 * discovery experience. Selecting one of these routes the form to the
 * matching API instead.
 */
export type Domain = "marketplace" | "housing" | "jobs" | "services"

const DOMAIN_BY_CATEGORY: Record<string, Domain> = {
  housing: "housing",
  jobs: "jobs",
  services: "services",
}

export const DOMAIN_OPTIONS: Array<{ id: Domain; label: string; description: string }> = [
  { id: "marketplace", label: "General marketplace", description: "Sell an item you no longer need." },
  { id: "housing", label: "Housing", description: "Rent, lease, or list a property." },
  { id: "jobs", label: "Jobs", description: "Post a role for local candidates." },
  { id: "services", label: "Services", description: "Offer a local service." },
]

interface CategoryOption {
  id: string
  name: string
  slug: string
}

interface CreateListingFlowProps {
  categories: CategoryOption[]
  onDone: (listing: ApiListing) => void
  onNavigate: (page: string, id?: string) => void
  /** Preserved when the user navigates back from another step. */
  initialCategoryId?: string
}

/**
 * One entry point that routes to the right contract per category, so a
 * specialized listing can never be created through the generic path.
 */
export default function CreateListingFlow({
  categories,
  onDone,
  onNavigate,
  initialCategoryId,
}: CreateListingFlowProps) {
  const [domain, setDomain] = useState<Domain>("marketplace")
  const [categoryId, setCategoryId] = useState(initialCategoryId ?? categories[0]?.id ?? "")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [price, setPrice] = useState("")
  const [condition, setCondition] = useState("Good")
  const [neighborhood, setNeighborhood] = useState("")
  const [housingType, setHousingType] = useState<HousingCreateInput["type"]>("Apartment")
  const [beds, setBeds] = useState("1")
  const [neighborhoodRequired, setNeighborhoodRequired] = useState("Inman Park")
  const [company, setCompany] = useState("")
  const [businessName, setBusinessName] = useState("")
  const [serviceCategory, setServiceCategory] = useState("Cleaning")
  const [availability, setAvailability] = useState("Weekdays")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Switching the domain switches the category select to that domain's
  // category, so the selection can never disagree with the chosen contract.
  const visibleCategories = useMemo(() => {
    if (domain === "marketplace") return categories
    return categories.filter(entry => DOMAIN_BY_CATEGORY[entry.slug] === domain)
  }, [categories, domain])

  const effectiveCategoryId =
    visibleCategories.some(entry => entry.id === categoryId) ? categoryId : visibleCategories[0]?.id ?? ""

  function pickDomain(next: Domain) {
    setDomain(next)
    const nextCategories =
      next === "marketplace"
        ? categories
        : categories.filter(entry => DOMAIN_BY_CATEGORY[entry.slug] === next)
    setCategoryId(nextCategories[0]?.id ?? "")
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (title.trim().length < 3) {
      setError("Title must be at least 3 characters.")
      return
    }
    if (description.trim().length < 10) {
      setError("Description must be at least 10 characters.")
      return
    }
    const parsedPrice = price.trim() === "" ? undefined : Number(price)
    if (parsedPrice !== undefined && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      setError("Price must be a positive number.")
      return
    }
    setSubmitting(true)
    try {
      if (domain === "housing") {
        // Housing requires a neighborhood, so it is enforced here rather than
        // discovered as a 400 after submit.
        if (!neighborhoodRequired.trim()) {
          setError("Housing listings need a neighborhood.")
          return
        }
        const created = await api.housing.create({
          title: title.trim(),
          description: description.trim(),
          type: housingType,
          listingType: "rent",
          priceCents: Math.round((parsedPrice ?? 0) * 100),
          beds: Number(beds) || 0,
          baths: 1,
          neighborhood: neighborhoodRequired.trim()
        })
        onDone({ id: created.id, title: title.trim() } as ApiListing)
        return
      }
      if (domain === "jobs") {
        if (!company.trim()) {
          setError("Job listings need a company name.")
          return
        }
        const created = await api.jobs.create({
          title: title.trim(),
          company: company.trim(),
          description: description.trim()
        })
        onDone({ id: created.id, title: title.trim() } as ApiListing)
        return
      }
      if (domain === "services") {
        if (!businessName.trim()) {
          setError("Service listings need a business name.")
          return
        }
        const created = await api.services.create({
          title: title.trim(),
          businessName: businessName.trim(),
          description: description.trim(),
          category: serviceCategory,
          startingPriceCents: Math.round((parsedPrice ?? 0) * 100),
          location: neighborhoodRequired.trim() || "Atlanta",
          availability
        })
        onDone({ id: created.id, title: title.trim() } as ApiListing)
        return
      }

      const created = await api.listings.create({
        categoryId: effectiveCategoryId,
        title: title.trim(),
        description: description.trim(),
        ...(parsedPrice !== undefined ? { priceCents: Math.round(parsedPrice * 100) } : {}),
        condition,
        ...(neighborhood.trim() ? { neighborhood: neighborhood.trim() } : {}),
      } as never)
      onDone(created)
    } catch (cause) {
      setError(readStatus(cause, "That listing could not be created."))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-2xl px-6 py-12 space-y-6">
      <ScreenTitle title="Create a listing" subtitle="Pick a category and the right form appears." />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-[#1B2A4A]">What are you posting?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {DOMAIN_OPTIONS.map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => pickDomain(option.id)}
              aria-pressed={domain === option.id}
              className={
                domain === option.id
                  ? "rounded-xl border-2 border-[#2D6A4F] bg-[#EEF6F1] px-4 py-3 text-left"
                  : "rounded-xl border border-[#D8DED8] bg-white px-4 py-3 text-left hover:bg-[#F4F6F2]"
              }
            >
              <span className="block text-sm font-semibold text-[#1B2A4A]">{option.label}</span>
              <span className="block text-xs text-[#5A6B85]">{option.description}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <form onSubmit={submit} className="space-y-5" noValidate>
        {domain === "marketplace" && (
          <>
            <Field id="categoryId" label="Category">
              <select
                id="categoryId"
                value={effectiveCategoryId}
                onChange={event => setCategoryId(event.target.value)}
                className={inputClass(null)}
              >
                {visibleCategories.map(entry => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="condition" label="Condition">
              <select
                id="condition"
                value={condition}
                onChange={event => setCondition(event.target.value)}
                className={inputClass(null)}
              >
                {["New", "Like New", "Good", "Fair", "For Parts"].map(value => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="neighborhood" label="Neighborhood" hint="Used for nearby search.">
              <input
                id="neighborhood"
                value={neighborhood}
                onChange={event => setNeighborhood(event.target.value)}
                className={inputClass(null)}
              />
            </Field>
            <ImageManager listingId={null} />
          </>
        )}

        {domain === "housing" && (
          <>
            <Field id="housingType" label="Property type">
              <select
                id="housingType"
                value={housingType}
                onChange={event => setHousingType(event.target.value as HousingCreateInput['type'])}
                className={inputClass(null)}
              >
                {["Apartment", "House", "Condo", "Room", "Studio", "Sublet"].map(value => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="housingNeighborhood" label="Neighborhood" hint="Required for housing.">
              <input
                id="housingNeighborhood"
                value={neighborhoodRequired}
                onChange={event => setNeighborhoodRequired(event.target.value)}
                className={inputClass(null)}
              />
            </Field>
            <Field id="beds" label="Bedrooms">
              <input
                id="beds"
                type="number"
                min={0}
                max={30}
                value={beds}
                onChange={event => setBeds(event.target.value)}
                className={inputClass(null)}
              />
            </Field>
          </>
        )}

        {domain === "jobs" && (
          <Field id="company" label="Company">
            <input
              id="company"
              value={company}
              onChange={event => setCompany(event.target.value)}
              className={inputClass(null)}
            />
          </Field>
        )}

        {domain === "services" && (
          <>
            <Field id="businessName" label="Business name">
              <input
                id="businessName"
                value={businessName}
                onChange={event => setBusinessName(event.target.value)}
                className={inputClass(null)}
              />
            </Field>
            <Field id="serviceCategory" label="Service category">
              <select
                id="serviceCategory"
                value={serviceCategory}
                onChange={event => setServiceCategory(event.target.value)}
                className={inputClass(null)}
              >
                {["Cleaning", "Moving", "Tutoring", "Handyman", "Other"].map(value => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="availability" label="Availability">
              <input
                id="availability"
                value={availability}
                onChange={event => setAvailability(event.target.value)}
                className={inputClass(null)}
              />
            </Field>
          </>
        )}

        <Field id="title" label="Title" error={error && title.trim().length < 3 ? error : null}>
          <input
            id="title"
            value={title}
            onChange={event => setTitle(event.target.value)}
            aria-invalid={title.trim().length > 0 && title.trim().length < 3}
            className={inputClass(null)}
          />
        </Field>
        <Field id="description" label="Description">
          <textarea
            id="description"
            rows={5}
            value={description}
            onChange={event => setDescription(event.target.value)}
            aria-invalid={description.trim().length > 0 && description.trim().length < 10}
            className={inputClass(null)}
          />
        </Field>
        <Field
          id="price"
          label={domain === "services" ? "Starting price" : "Price"}
        >
          <input
            id="price"
            inputMode="decimal"
            value={price}
            onChange={event => setPrice(event.target.value)}
            className={inputClass(null)}
          />
        </Field>

        {error && title.trim().length >= 3 && <Alert tone="error">{error}</Alert>}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="submit" className={primaryButton()} disabled={submitting}>
            {submitting ? "Posting…" : domain === "marketplace" ? "Post listing" : `Post ${domain}`}
          </button>
          <button type="button" className={secondaryButton()} onClick={() => onNavigate("home")}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  )
}