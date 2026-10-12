import { useEffect, useState } from "react"
import { api, readError, readStatus } from "../../api/client"
import type { ApiRequestSummary } from "../../api/types"
import {
  Alert,
  Field,
  inputClass,
  primaryButton,
  ScreenTitle,
  secondaryButton,
} from "../../components/account-ui"

interface RequestFormProps {
  onDone: (request: ApiRequestSummary) => void
  onNavigate: (page: string, id?: string) => void
  categories: Array<{ id: string; name: string }>
  /** Editing an existing request rather than creating one. */
  existing?: ApiRequestSummary | null
}

const MODES = [
  { id: "BUY", label: "I want to buy" },
  { id: "BORROW", label: "I want to borrow" },
  { id: "RENT", label: "I want to rent" },
  { id: "HIRE", label: "I want to hire" },
  { id: "TRADE", label: "I want to trade" },
  { id: "SKILL_SWAP", label: "Skill swap" },
  { id: "FREE", label: "Free / giveaway" },
] as const

const URGENCIES = [
  { id: "none", label: "No rush" },
  { id: "soon", label: "Soon" },
  { id: "urgent", label: "Urgent" },
]

/**
 * Create or edit a request. Validation mirrors the API DTOs so a user is
 * not corrected only after a round trip, and the publish toggle sends the
 * draft or the published form rather than faking either state locally.
 */
export default function RequestForm({
  onDone,
  onNavigate,
  categories,
  existing,
}: RequestFormProps) {
  const [title, setTitle] = useState(existing?.title ?? "")
  const [description, setDescription] = useState(existing?.description ?? "")
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? categories[0]?.id ?? "")
  const [mode, setMode] = useState<string>(existing?.mode ?? "BUY")
  const [budget, setBudget] = useState(
    existing?.budgetCents != null ? String(existing.budgetCents / 100) : "",
  )
  const [minBudget, setMinBudget] = useState(
    existing?.minBudgetCents != null ? String(existing.minBudgetCents / 100) : "",
  )
  const [budgetFlexible, setBudgetFlexible] = useState(existing?.budgetFlexible ?? true)
  const [neighborhood, setNeighborhood] = useState(existing?.neighborhood ?? "")
  const [radius, setRadius] = useState(String(existing?.radiusMiles ?? 10))
  const [urgency, setUrgency] = useState(existing?.urgency ?? "none")
  const [deadline, setDeadline] = useState(
    existing?.deadline ? existing.deadline.slice(0, 10) : "",
  )
  const [quantity, setQuantity] = useState("1")
  const [preferredCondition, setPreferredCondition] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setCategoryId(existing?.categoryId ?? categories[0]?.id ?? "")
  }, [categories, existing?.categoryId])

  function validate(publish: boolean): string | null {
    if (publish && title.trim().length < 3) return "Title must be at least 3 characters."
    if (publish && description.trim().length < 10) {
      return "Description must be at least 10 characters."
    }
    if (!categoryId) return "Choose a category."
    const parsed = budget.trim() === "" ? undefined : Number(budget)
    if (parsed !== undefined && (!Number.isFinite(parsed) || parsed < 0)) {
      return "Budget must be a positive number."
    }
    const parsedMin = minBudget.trim() === "" ? undefined : Number(minBudget)
    if (parsedMin !== undefined && (!Number.isFinite(parsedMin) || parsedMin < 0)) {
      return "Minimum budget must be a positive number."
    }
    if (parsed !== undefined && parsedMin !== undefined && parsedMin > parsed) {
      return "Minimum budget cannot be higher than the maximum."
    }
    return null
  }

  function payload(publish: boolean) {
    const parsed = budget.trim() === "" ? undefined : Math.round(Number(budget) * 100)
    const parsedMin = minBudget.trim() === "" ? undefined : Math.round(Number(minBudget) * 100)
    return {
      categoryId,
      title: title.trim() || "Untitled draft",
      description: description.trim() || "Draft description pending.",
      mode: mode as never,
      ...(parsed !== undefined ? { budgetCents: parsed } : {}),
      ...(parsedMin !== undefined ? { minBudgetCents: parsedMin } : {}),
      budgetFlexible,
      urgency,
      ...(neighborhood.trim() ? { neighborhood: neighborhood.trim() } : {}),
      ...(radius ? { radiusMiles: Number(radius) } : {}),
      ...(deadline ? { deadline: new Date(deadline).toISOString() } : {}),
      requirements: {
        quantity: Number(quantity) || 1,
        ...(preferredCondition.trim() ? { preferredCondition: preferredCondition.trim() } : {}),
      },
      publish,
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const problem = validate(true)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    try {
      // A double submit cannot create two requests: the button is disabled
      // while `saving` is true, and the response carries the real row.
      const result = existing
        ? await api.requests.update(existing.id, payload(true))
        : await api.requests.create(payload(true) as never)
      onDone(result)
    } catch (cause) {
      setError(readStatus(cause, "That request could not be saved."))
    } finally {
      setSaving(false)
    }
  }

  async function saveDraft() {
    setError(null)
    const problem = validate(false)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    try {
      const result = await api.requests.saveDraft(payload(false) as never)
      onDone(result)
    } catch (cause) {
      setError(readError(cause, "That draft could not be saved."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12 space-y-6">
      <ScreenTitle
        title={existing ? "Edit request" : "Post what you need"}
        subtitle="Neighbors with what you want can make you an offer."
      />

      <form onSubmit={submit} className="space-y-5" noValidate>
        <Field id="request-title" label="Title" error={error && title.trim().length < 3 ? error : null}>
          <input
            id="request-title"
            value={title}
            onChange={event => setTitle(event.target.value)}
            aria-invalid={title.trim().length > 0 && title.trim().length < 3}
            className={inputClass(null)}
          />
        </Field>

        <Field
          id="request-description"
          label="Description"
          error={error && title.trim().length >= 3 && description.trim().length < 10 ? error : null}
        >
          <textarea
            id="request-description"
            rows={5}
            value={description}
            onChange={event => setDescription(event.target.value)}
            aria-invalid={description.trim().length > 0 && description.trim().length < 10}
            className={inputClass(null)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="request-category" label="Category">
            <select
              id="request-category"
              value={categoryId}
              onChange={event => setCategoryId(event.target.value)}
              className={inputClass(null)}
            >
              {categories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="request-mode" label="What do you want?">
            <select
              id="request-mode"
              value={mode}
              onChange={event => setMode(event.target.value)}
              className={inputClass(null)}
            >
              {MODES.map(entry => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <fieldset className="rounded-xl border border-[#D8DED8] p-4">
          <legend className="px-1 text-sm font-medium text-[#1B2A4A]">Budget</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="request-budget" label="Up to ($)">
              <input
                id="request-budget"
                inputMode="decimal"
                value={budget}
                onChange={event => setBudget(event.target.value)}
                className={inputClass(null)}
              />
            </Field>
            <Field id="request-min-budget" label="At least ($)">
              <input
                id="request-min-budget"
                inputMode="decimal"
                value={minBudget}
                onChange={event => setMinBudget(event.target.value)}
                className={inputClass(null)}
              />
            </Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-[#1B2A4A]">
            <input
              type="checkbox"
              checked={budgetFlexible}
              onChange={event => setBudgetFlexible(event.target.checked)}
              className="h-5 w-5 accent-[#2D6A4F]"
            />
            I am flexible on price
          </label>
        </fieldset>

        <fieldset className="rounded-xl border border-[#D8DED8] p-4">
          <legend className="px-1 text-sm font-medium text-[#1B2A4A]">Requirements</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="request-quantity" label="How many?">
              <input
                id="request-quantity"
                type="number"
                min={1}
                max={999}
                value={quantity}
                onChange={event => setQuantity(event.target.value)}
                className={inputClass(null)}
              />
            </Field>
            <Field id="request-condition" label="Preferred condition">
              <input
                id="request-condition"
                value={preferredCondition}
                onChange={event => setPreferredCondition(event.target.value)}
                placeholder="good or better"
                className={inputClass(null)}
              />
            </Field>
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="request-neighborhood" label="Neighborhood">
            <input
              id="request-neighborhood"
              value={neighborhood}
              onChange={event => setNeighborhood(event.target.value)}
              className={inputClass(null)}
            />
          </Field>
          <Field id="request-radius" label="Radius (miles)">
            <input
              id="request-radius"
              type="number"
              min={1}
              max={500}
              value={radius}
              onChange={event => setRadius(event.target.value)}
              className={inputClass(null)}
            />
          </Field>
          <Field id="request-deadline" label="Needed by">
            <input
              id="request-deadline"
              type="date"
              value={deadline}
              onChange={event => setDeadline(event.target.value)}
              className={inputClass(null)}
            />
          </Field>
        </div>

        <Field id="request-urgency" label="Urgency">
          <select
            id="request-urgency"
            value={urgency}
            onChange={event => setUrgency(event.target.value)}
            className={inputClass(null)}
          >
            {URGENCIES.map(entry => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>

        {error && title.trim().length >= 3 && description.trim().length >= 10 && (
          <Alert tone="error">{error}</Alert>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="submit" className={primaryButton()} disabled={saving}>
            {saving ? "Saving…" : existing ? "Save changes" : "Post request"}
          </button>
          {!existing && (
            <button type="button" className={secondaryButton()} disabled={saving} onClick={saveDraft}>
              Save as draft
            </button>
          )}
          <button type="button" className={secondaryButton()} onClick={() => onNavigate("requests")}>
            Cancel
          </button>
        </div>
      </form>
    </main>
  )
}