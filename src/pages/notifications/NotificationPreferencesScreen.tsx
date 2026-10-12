import { useCallback, useEffect, useState } from "react"
import { api, readError } from "../../api/client"
import type { NotificationPreferences } from "../../api/types"
import { Alert, ScreenTitle, primaryButton, secondaryButton } from "../../components/account-ui"

interface NotificationPreferencesScreenProps {
  onNavigate: (page: string, id?: string) => void
}

/**
 * Each category the backend actually consults before delivering, so turning
 * one off here genuinely suppresses that class of notification rather than
 * only hiding it in the UI.
 */
const GROUPS: Array<{
  title: string
  hint: string
  fields: Array<{ key: keyof NotificationPreferences; label: string }>
}> = [
  {
    title: "Messages",
    hint: "A new message in one of your conversations.",
    fields: [{ key: "messages", label: "New messages" }]
  },
  {
    title: "Offers",
    hint: "Someone offers on your request, or an offer you made is decided.",
    fields: [
      { key: "offers", label: "Offer activity" },
      { key: "requestUpdates", label: "Changes to your requests" }
    ]
  },
  {
    title: "Discovery",
    hint: "Matches and alerts from what you are watching.",
    fields: [
      { key: "matches", label: "New relevant matches" },
      { key: "savedSearches", label: "Saved-search alerts" },
      { key: "newListings", label: "New listings" },
      { key: "priceDrops", label: "Price drops" }
    ]
  },
  {
    title: "Community",
    hint: "Optional updates beyond what you asked for.",
    fields: [
      { key: "events", label: "Events" },
      { key: "community", label: "Community activity" }
    ]
  }
]

export default function NotificationPreferencesScreen({
  onNavigate
}: NotificationPreferencesScreenProps) {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setPreferences(await api.notifications.preferences())
      setError(null)
    } catch (cause) {
      setError(readError(cause, "Preferences could not be loaded."))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!preferences) return
    setSaving(true)
    setError(null)
    setNotice("")
    try {
      // Persisted immediately, so the change applies to the next event
      // rather than only to what is rendered here.
      const updated = await api.notifications.updatePreferences(preferences)
      setPreferences(updated)
      setNotice("Preferences saved.")
    } catch (cause) {
      setError(readError(cause, "Preferences could not be saved."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12 space-y-6">
      <ScreenTitle
        title="Notification preferences"
        subtitle="Choose what you hear about. Changes apply to the next event."
      />

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {!preferences && !error && <Alert tone="info">Loading preferences…</Alert>}

      {preferences && (
        <form
          className="space-y-6"
          onSubmit={event => {
            event.preventDefault()
            void save()
          }}
          noValidate
        >
          {GROUPS.map(group => (
            <fieldset key={group.title} className="rounded-2xl border border-[#E8E6DF] bg-white p-5">
              <legend className="px-1 text-sm font-semibold text-[#1B2A4A]">{group.title}</legend>
              <p className="mb-3 text-xs text-[#8A9AB5]">{group.hint}</p>
              <div className="space-y-2">
                {group.fields.map(field => (
                  <label key={field.key} className="flex items-center gap-2 text-sm text-[#1B2A4A]">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-[#2D6A4F]"
                      checked={preferences[field.key]}
                      onChange={event =>
                        setPreferences(current =>
                          current ? { ...current, [field.key]: event.target.checked } : current
                        )
                      }
                    />
                    {field.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <div className="flex gap-2">
            <button type="submit" className={primaryButton()} disabled={saving}>
              {saving ? "Saving…" : "Save preferences"}
            </button>
            <button type="button" className={secondaryButton()} onClick={() => onNavigate("notifications")}>
              Back
            </button>
          </div>
        </form>
      )}
    </main>
  )
}