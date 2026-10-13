import { useEffect, useState } from "react"
import { api, readStatus } from "../../api/client"
import type { Passport } from "../../api/types"
import {
  Alert,
  Field,
  inputClass,
  primaryButton,
  ScreenTitle,
  secondaryButton
} from "../../components/account-ui"

/**
 * Editing the public parts of a passport.
 *
 * Only the four fields that are actually shown to others can be edited here.
 * Exact location, email, and every trust signal are derived from records the
 * server owns, so they are not writable from a profile form at all.
 */
export default function PassportEdit({ onNavigate }: { onNavigate: (page: string, id?: string) => void }) {
  const [passport, setPassport] = useState<Passport | null>(null)
  const [displayName, setDisplayName] = useState("")
  const [bio, setBio] = useState("")
  const [neighborhood, setNeighborhood] = useState("")
  const [city, setCity] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.passport
      .me()
      .then(row => {
        setPassport(row)
        setDisplayName(row.displayName === "A neighbor" ? "" : row.displayName)
        setBio(row.bio ?? "")
        setNeighborhood(row.neighborhood ?? "")
        setCity(row.city ?? "")
      })
      .catch(cause => setError(readStatus(cause, "Your passport could not be loaded.")))
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice("")
    if (displayName.trim().length > 60) {
      setError("That display name is too long.")
      return
    }
    setSaving(true)
    try {
      // Only the four editable fields are sent. Everything else on a
      // passport is derived, so there is nothing to mass-assign.
      await api.passport.updateMe({
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
        neighborhood: neighborhood.trim() || undefined,
        city: city.trim() || undefined
      })
      setNotice("Passport updated.")
      setPassport(await api.passport.me())
    } catch (cause) {
      setError(readStatus(cause, "Your passport could not be saved."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12 space-y-6">
      <ScreenTitle
        title="Edit your passport"
        subtitle="What other neighbors see when they look you up."
      />

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {!passport && !error && <Alert tone="info">Loading your passport…</Alert>}

      <form className="space-y-4" onSubmit={submit} noValidate>
        <Field id="passport-name" label="Display name">
          <input
            id="passport-name"
            value={displayName}
            onChange={event => setDisplayName(event.target.value)}
            placeholder="How neighbors see you"
            className={inputClass(null)}
          />
        </Field>
        <Field id="passport-bio" label="Short bio">
          <textarea
            id="passport-bio"
            rows={3}
            value={bio}
            onChange={event => setBio(event.target.value)}
            placeholder="What you are around here"
            className={inputClass(null)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="passport-neighborhood" label="Neighborhood">
            <input
              id="passport-neighborhood"
              value={neighborhood}
              onChange={event => setNeighborhood(event.target.value)}
              className={inputClass(null)}
            />
          </Field>
          <Field id="passport-city" label="City">
            <input
              id="passport-city"
              value={city}
              onChange={event => setCity(event.target.value)}
              className={inputClass(null)}
            />
          </Field>
        </div>

        <p className="text-xs text-[#5C6E8A]">
          Your exact location is never published and cannot be set here. Trust signals and
          verification are derived from your activity and reviewed by moderators, not typed in.
        </p>

        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primaryButton()} disabled={saving}>
            {saving ? "Saving…" : "Save passport"}
          </button>
          <button
            type="button"
            className={secondaryButton()}
            onClick={() => onNavigate("passport-settings")}
          >
            Privacy and reviews
          </button>
        </div>
      </form>
    </main>
  )
}