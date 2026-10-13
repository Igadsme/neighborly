import { useEffect, useState } from "react"
import { api, readStatus } from "../../api/client"
import type { MissionCategory } from "../../api/types"
import {
  Alert,
  Field,
  ScreenTitle,
  inputClass,
  primaryButton,
  secondaryButton
} from "../../components/account-ui"

const CATEGORIES: Array<{ id: MissionCategory; label: string }> = [
  { id: "CLEANUP", label: "Cleanup" },
  { id: "GARDENING", label: "Gardening" },
  { id: "DONATION", label: "Donation drive" },
  { id: "VOLUNTEER", label: "Volunteering" },
  { id: "ASSISTANCE", label: "Local assistance" },
  { id: "IMPROVEMENT", label: "Community improvement" }
]

function toLocalInput(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

interface MissionEditorProps {
  /** Present when editing an existing mission. */
  missionId?: string | null
  onNavigate: (page: string, id?: string) => void
}

/**
 * Create and edit, in one form.
 *
 * The meeting point field says in the form itself that it stays private: the
 * most common way a mission leaks a location is an organizer assuming a form
 * field is public because it is in the app.
 */
export default function MissionEditor({ missionId, onNavigate }: MissionEditorProps) {
  const editing = Boolean(missionId)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState<MissionCategory>("CLEANUP")
  const [neighborhood, setNeighborhood] = useState("")
  const [city, setCity] = useState("")
  const [meetingPoint, setMeetingPoint] = useState("")
  const [startAt, setStartAt] = useState("")
  const [endAt, setEndAt] = useState("")
  const [capacity, setCapacity] = useState(10)
  const [requiresApproval, setRequiresApproval] = useState(false)
  const [publishNow, setPublishNow] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!missionId) return
    api.missions
      .detail(missionId)
      .then(row => {
        setTitle(row.title)
        setDescription(row.description)
        setCategory(row.category)
        setNeighborhood(row.neighborhood ?? "")
        setCity(row.city ?? "")
        setMeetingPoint(row.meetingPoint ?? "")
        setStartAt(toLocalInput(row.startAt))
        setEndAt(toLocalInput(row.endAt))
        setCapacity(row.capacity)
        setRequiresApproval(row.requiresApproval)
      })
      .catch(cause => setError(readStatus(cause, "That mission could not be loaded.")))
  }, [missionId])

  function validate(): string | null {
    if (title.trim().length < 4) return "Give the mission a title of at least 4 characters."
    if (description.trim().length < 20) {
      return "Describe what people will actually be doing, in at least 20 characters."
    }
    if (!startAt || !endAt) return "Set when the mission starts and ends."
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      return "A mission must end after it starts."
    }
    if (capacity < 1) return "There must be at least one place."
    return null
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice("")
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    try {
      // Only the fields the server accepts are sent. There is no confirmedCount
      // here, no organizer, and no status: those are not a form's business.
      const payload = {
        title: title.trim(),
        description: description.trim(),
        category,
        neighborhood: neighborhood.trim() || undefined,
        city: city.trim() || undefined,
        meetingPoint: meetingPoint.trim() || undefined,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        capacity
      }
      if (editing) {
        await api.missions.update(missionId as string, { ...payload, requiresApproval })
        setNotice("Mission updated.")
      } else {
        const created = await api.missions.create({
          ...payload,
          requiresApproval,
          publishNow
        })
        onNavigate("mission-manage", created.id)
        return
      }
    } catch (cause) {
      setError(readStatus(cause, "That mission could not be saved."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12 space-y-6">
      <ScreenTitle
        title={editing ? "Edit mission" : "Organize a mission"}
        subtitle={
          editing
            ? "Changes apply to everyone already on the mission."
            : "Something neighbors will actually turn up for."
        }
      />

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <form className="space-y-4" onSubmit={submit} noValidate>
        <Field id="mission-title" label="Title">
          <input
            id="mission-title"
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder="Riverside park cleanup"
            className={inputClass(null)}
          />
        </Field>

        <Field
          id="mission-description"
          label="What will people do?"
          hint="Be concrete. People join because they can tell whether it suits them."
        >
          <textarea
            id="mission-description"
            rows={4}
            value={description}
            onChange={event => setDescription(event.target.value)}
            className={inputClass(null)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="mission-kind" label="Category">
            <select
              id="mission-kind"
              value={category}
              onChange={event => setCategory(event.target.value as MissionCategory)}
              className={inputClass(null)}
            >
              {CATEGORIES.map(entry => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="mission-capacity" label="Places">
            <input
              id="mission-capacity"
              type="number"
              min={1}
              max={500}
              value={capacity}
              onChange={event => setCapacity(Number(event.target.value))}
              className={inputClass(null)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="mission-start" label="Starts">
            <input
              id="mission-start"
              type="datetime-local"
              value={startAt}
              onChange={event => setStartAt(event.target.value)}
              className={inputClass(null)}
            />
          </Field>
          <Field id="mission-end" label="Ends">
            <input
              id="mission-end"
              type="datetime-local"
              value={endAt}
              onChange={event => setEndAt(event.target.value)}
              className={inputClass(null)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="mission-city" label="City">
            <input
              id="mission-city"
              value={city}
              onChange={event => setCity(event.target.value)}
              className={inputClass(null)}
            />
          </Field>
          <Field id="mission-neighborhood" label="Neighborhood">
            <input
              id="mission-neighborhood"
              value={neighborhood}
              onChange={event => setNeighborhood(event.target.value)}
              className={inputClass(null)}
            />
          </Field>
        </div>

        <Field
          id="mission-meeting-point"
          label="Meeting point"
          hint="Only confirmed participants and moderators ever see this. It is never published."
        >
          <textarea
            id="mission-meeting-point"
            rows={2}
            value={meetingPoint}
            onChange={event => setMeetingPoint(event.target.value)}
            placeholder="Meet at the north gate of Riverside Park"
            className={inputClass(null)}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-[#1B2A4A]">
          <input
            type="checkbox"
            className="h-5 w-5 accent-[#2D6A4F]"
            checked={requiresApproval}
            onChange={event => setRequiresApproval(event.target.checked)}
          />
          Approve each participant myself
        </label>

        {!editing && (
          <label className="flex items-center gap-2 text-sm text-[#1B2A4A]">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[#2D6A4F]"
              checked={publishNow}
              onChange={event => setPublishNow(event.target.checked)}
            />
            Publish now
          </label>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primaryButton()} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : publishNow ? "Publish mission" : "Save draft"}
          </button>
          <button
            type="button"
            className={secondaryButton()}
            onClick={() => onNavigate(editing ? `mission-manage:${missionId}` : "missions")}
          >
            Cancel
          </button>
        </div>
      </form>
    </main>
  )
}