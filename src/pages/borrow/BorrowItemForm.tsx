import { useEffect, useState } from "react"
import { api, readError, readStatus } from "../../api/client"
import type { BorrowableItem } from "../../api/types"
import {
  Alert,
  Field,
  inputClass,
  primaryButton,
  ScreenTitle,
  secondaryButton
} from "../../components/account-ui"

interface BorrowItemFormProps {
  categories: Array<{ id: string; name: string }>
  onDone: (item: BorrowableItem) => void
  onNavigate: (page: string, id?: string) => void
  existing?: BorrowableItem | null
}

/**
 * Create or edit a borrowable item. A borrowable item is an ordinary listing
 * with borrowing terms attached, so the Milestone 4 media, search, and
 * ownership machinery applies without a second model.
 */
export default function BorrowItemForm({
  categories,
  onDone,
  onNavigate,
  existing
}: BorrowItemFormProps) {
  const [title, setTitle] = useState(existing?.title ?? "")
  const [description, setDescription] = useState(existing?.description ?? "")
  const [usage, setUsage] = useState(existing?.usageInstructions ?? "")
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? categories[0]?.id ?? "")
  const [condition, setCondition] = useState(existing?.condition ?? "")
  const [maxDays, setMaxDays] = useState(String(existing?.maxBorrowDays ?? 7))
  const [noticeHours, setNoticeHours] = useState(String(existing?.minNoticeHours ?? 12))
  const [deposit, setDeposit] = useState(
    existing?.depositCents != null ? String(existing.depositCents / 100) : ""
  )
  const [neighborhood, setNeighborhood] = useState(existing?.neighborhood ?? "")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setCategoryId(existing?.categoryId ?? categories[0]?.id ?? "")
  }, [categories, existing?.categoryId])

  function validate() {
    if (title.trim().length < 3) return "Title must be at least 3 characters."
    if (description.trim().length < 10) return "Description must be at least 10 characters."
    if (usage.trim().length < 2) return "Tell the borrower how to use it."
    if (!categoryId) return "Choose a category."
    const days = Number(maxDays)
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      return "The maximum duration must be between 1 and 365 days."
    }
    const notice = Number(noticeHours)
    if (!Number.isFinite(notice) || notice < 0) return "Notice must be zero or more hours."
    if (deposit.trim() !== "") {
      const value = Number(deposit)
      if (!Number.isFinite(value) || value < 0) return "The deposit must be a positive number."
    }
    return null
  }

  async function submit(event: React.FormEvent, publish: boolean) {
    event.preventDefault()
    setError(null)
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    try {
      const payload = {
        categoryId,
        title: title.trim(),
        description: description.trim(),
        usageInstructions: usage.trim(),
        condition: condition.trim() || undefined,
        maxBorrowDays: Number(maxDays),
        minNoticeHours: Number(noticeHours),
        ...(deposit.trim() !== "" ? { depositCents: Math.round(Number(deposit) * 100) } : {}),
        ...(neighborhood.trim() ? { neighborhood: neighborhood.trim() } : {}),
        ...(publish ? { publish: true } : {})
      }
      const saved = existing
        ? await api.borrow.updateItem(existing.id, payload)
        : await api.borrow.createItem(payload)
      onDone(saved)
    } catch (cause) {
      setError(readStatus(cause, "That item could not be saved."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-2xl px-6 py-12 space-y-6">
      <ScreenTitle
        title={existing ? "Edit your item" : "Lend an item"}
        subtitle="Neighbors borrow it, return it, and you keep ownership throughout."
      />

      <form
        className="space-y-5"
        onSubmit={event => void submit(event, true)}
        noValidate
      >
        <Field id="item-title" label="Title">
          <input
            id="item-title"
            value={title}
            onChange={event => setTitle(event.target.value)}
            className={inputClass(null)}
          />
        </Field>

        <Field id="item-description" label="Description">
          <textarea
            id="item-description"
            rows={4}
            value={description}
            onChange={event => setDescription(event.target.value)}
            className={inputClass(null)}
          />
        </Field>

        <Field
          id="item-usage"
          label="Usage instructions"
          hint="What the borrower should know: what is included, what to avoid, how to care for it."
        >
          <textarea
            id="item-usage"
            rows={3}
            value={usage}
            onChange={event => setUsage(event.target.value)}
            className={inputClass(null)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="item-category" label="Category">
            <select
              id="item-category"
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
          <Field id="item-condition" label="Condition">
            <select
              id="item-condition"
              value={condition}
              onChange={event => setCondition(event.target.value)}
              className={inputClass(null)}
            >
              <option value="">Not specified</option>
              <option value="like_new">Like new</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="worn">Worn</option>
            </select>
          </Field>
        </div>

        <fieldset className="rounded-xl border border-[#D8DED8] p-4">
          <legend className="px-1 text-sm font-medium text-[#1B2A4A]">Borrowing terms</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="item-max-days" label="Maximum days">
              <input
                id="item-max-days"
                type="number"
                min={1}
                max={365}
                value={maxDays}
                onChange={event => setMaxDays(event.target.value)}
                className={inputClass(null)}
              />
            </Field>
            <Field id="item-notice" label="Notice (hours)">
              <input
                id="item-notice"
                type="number"
                min={0}
                max={720}
                value={noticeHours}
                onChange={event => setNoticeHours(event.target.value)}
                className={inputClass(null)}
              />
            </Field>
            <Field
              id="item-deposit"
              label="Deposit ($)"
              hint="Stated only. Neighborly never handles money."
            >
              <input
                id="item-deposit"
                inputMode="decimal"
                value={deposit}
                onChange={event => setDeposit(event.target.value)}
                className={inputClass(null)}
              />
            </Field>
          </div>
        </fieldset>

        <Field id="item-neighborhood" label="Neighborhood (optional)">
          <input
            id="item-neighborhood"
            value={neighborhood}
            onChange={event => setNeighborhood(event.target.value)}
            className={inputClass(null)}
          />
        </Field>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="flex flex-col gap-2 sm:flex-row">
          {/* Both actions are disabled while saving, so a double submit
              cannot create two items. */}
          <button type="submit" className={primaryButton()} disabled={saving}>
            {saving ? "Saving…" : existing ? "Save changes" : "List it for borrowing"}
          </button>
          {!existing && (
            <button
              type="button"
              className={secondaryButton()}
              disabled={saving}
              onClick={event => void submit(event as unknown as React.FormEvent, false)}
            >
              Save as draft
            </button>
          )}
          <button
            type="button"
            className={secondaryButton()}
            onClick={() => onNavigate("borrow-mine")}
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  )
}

export { readError }