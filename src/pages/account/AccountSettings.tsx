import { useCallback, useEffect, useState } from "react"
import { api, readError, readStatus } from "../../api/client"
import type { AccountStatus, ActiveSession, CurrentUser } from "../../api/types"
import {
  Alert,
  describeDevice,
  emailProblem,
  Field,
  formatDate,
  inputClass,
  passwordProblem,
  primaryButton,
  ScreenTitle,
  secondaryButton,
} from "../../components/account-ui"

type Tab = "profile" | "privacy" | "security" | "sessions" | "email" | "danger"

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "profile", label: "Edit profile" },
  { id: "privacy", label: "Privacy" },
  { id: "email", label: "Change email" },
  { id: "security", label: "Change password" },
  { id: "sessions", label: "Sessions" },
  { id: "danger", label: "Delete account" },
]

interface AccountSettingsProps {
  onSignedOut: () => void
}

export default function AccountSettings({ onSignedOut }: AccountSettingsProps) {
  const [tab, setTab] = useState<Tab>("profile")
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      setStatus(await api.users.accountStatus())
    } catch (cause) {
      setLoadError(readStatus(cause, "Unable to load your account."))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 space-y-8">
      <ScreenTitle title="Account settings" subtitle="Profile, security, and active sessions." />

      <nav aria-label="Account settings sections" className="flex flex-wrap gap-2">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            aria-current={tab === entry.id ? "page" : undefined}
            className={
              tab === entry.id
                ? "rounded-full bg-[#2D6A4F] px-4 py-2 text-sm font-semibold text-white"
                : "rounded-full border border-[#D8DED8] bg-white px-4 py-2 text-sm font-medium text-[#1B2A4A] hover:bg-[#F4F6F2]"
            }
          >
            {entry.label}
          </button>
        ))}
      </nav>

      {loadError && <Alert tone="error">{loadError}</Alert>}
      {!loadError && !status && <Alert tone="info">Loading your account…</Alert>}

      {status && tab === "profile" && (
        <ProfileTab status={status} onSaved={load} />
      )}
      {status && tab === "privacy" && <PrivacyTab onSaved={load} />}
      {status && tab === "email" && (
        <EmailTab status={status} onChanged={load} />
      )}
      {status && tab === "security" && <PasswordTab onSignedOut={onSignedOut} />}
      {status && tab === "sessions" && <SessionsTab status={status} onChanged={load} />}
      {status && tab === "danger" && <DeleteTab onSignedOut={onSignedOut} />}
    </main>
  )
}

// --------------------------------------------------------------------- profile

function ProfileTab({
  status,
  onSaved,
}: {
  status: AccountStatus
  onSaved: () => Promise<void>
}) {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [bio, setBio] = useState("")
  const [neighborhood, setNeighborhood] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api.users
      .profile(status.id)
      .then((profile) => {
        setFirstName(profile.firstName ?? "")
        setLastName(profile.lastName ?? "")
        setDisplayName(profile.displayName ?? "")
        setBio(profile.bio ?? "")
        setNeighborhood(profile.neighborhood ?? "")
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true))
  }, [status.id])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are required.")
      return
    }
    setError(null)
    setSaving(true)
    try {
      await api.users.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        displayName: displayName.trim(),
        bio: bio.trim(),
        neighborhood: neighborhood.trim(),
      })
      setSaved(true)
      await onSaved()
    } catch (cause) {
      setError(readError(cause, "Unable to save your profile."))
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return <Alert tone="info">Loading your profile…</Alert>

  return (
    <form onSubmit={save} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="firstName" label="First name">
          <input
            id="firstName"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            className={inputClass(null)}
          />
        </Field>
        <Field id="lastName" label="Last name">
          <input
            id="lastName"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            className={inputClass(null)}
          />
        </Field>
      </div>
      <Field id="displayName" label="Display name" hint="Shown on your listings and messages.">
        <input
          id="displayName"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          className={inputClass(null)}
        />
      </Field>
      <Field id="bio" label="Bio" hint="Up to 500 characters.">
        <textarea
          id="bio"
          rows={4}
          maxLength={500}
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          className={inputClass(null)}
        />
      </Field>
      <Field id="neighborhood" label="Neighborhood">
        <input
          id="neighborhood"
          value={neighborhood}
          onChange={(event) => setNeighborhood(event.target.value)}
          className={inputClass(null)}
        />
      </Field>
      <p className="text-xs text-[#5A6B85]">
        Profile photos are not available yet: the API rejects file uploads. Your avatar stays
        as it is.
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      {saved && <Alert tone="success">Profile saved.</Alert>}
      <button type="submit" className={primaryButton()} disabled={saving}>
        {saving ? "Saving…" : "Save profile"}
      </button>
    </form>
  )
}

// --------------------------------------------------------------------- privacy

function PrivacyTab({ onSaved }: { onSaved: () => Promise<void> }) {
  const [prefs, setPrefs] = useState({
    newListings: true,
    priceDrops: true,
    messages: true,
    events: false,
    community: false,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.auth
      .me()
      .then((me: CurrentUser) => {
        const notifications = (me as CurrentUser & {
          notificationPreference?: Partial<typeof prefs>
        }).notificationPreference
        if (notifications) setPrefs(current => ({ ...current, ...notifications }))
      })
      .catch(() => undefined)
  }, [])

  const rows: Array<[keyof typeof prefs, string]> = [
    ["newListings", "New listings in my interests"],
    ["priceDrops", "Price drop alerts"],
    ["messages", "Messages"],
    ["events", "Community events"],
    ["community", "Community activity"],
  ]

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await api.users.updatePrivacy(prefs)
      setSaved(true)
      await onSaved()
    } catch (cause) {
      setError(readError(cause, "Unable to save your preferences."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <ul className="space-y-3">
        {rows.map(([key, label]) => (
          <li key={key} className="flex items-center justify-between rounded-xl border border-[#D8DED8] bg-white px-4 py-3">
            <label htmlFor={`pref-${key}`} className="text-sm text-[#1B2A4A]">
              {label}
            </label>
            <input
              id={`pref-${key}`}
              type="checkbox"
              checked={prefs[key]}
              onChange={(event) => setPrefs({ ...prefs, [key]: event.target.checked })}
              className="h-5 w-5 accent-[#2D6A4F]"
            />
          </li>
        ))}
      </ul>
      {error && <Alert tone="error">{error}</Alert>}
      {saved && <Alert tone="success">Preferences saved.</Alert>}
      <button type="button" className={primaryButton()} disabled={saving} onClick={save}>
        {saving ? "Saving…" : "Save preferences"}
      </button>
    </div>
  )
}

// ----------------------------------------------------------------------- email

function EmailTab({
  status,
  onChanged,
}: {
  status: AccountStatus
  onChanged: () => Promise<void>
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const problem = emailProblem(email)
    if (problem) {
      setError(problem)
      return
    }
    if (!password) {
      setError("Confirm your current password to change your email.")
      return
    }
    setError(null)
    setSaving(true)
    try {
      await api.users.requestEmailChange(email.trim(), password)
      setPending(true)
      setEmail("")
      setPassword("")
      await onChanged()
    } catch (cause) {
      setError(readError(cause, "Unable to start the email change."))
    } finally {
      setSaving(false)
    }
  }

  async function cancel() {
    await api.users.cancelEmailChange()
    setPending(false)
    await onChanged()
  }

  return (
    <div className="space-y-5">
      <Alert tone={status.emailVerified ? "success" : "info"}>
        {status.email} is {status.emailVerified ? "verified" : "not verified yet"}.
      </Alert>
      {status.pendingEmail && (
        <>
          <Alert tone="info">
            A verification link was sent to {status.pendingEmail}. Your current address stays
            active until you confirm.
          </Alert>
          <button type="button" className={secondaryButton()} onClick={cancel}>
            Cancel email change
          </button>
        </>
      )}
      {!status.pendingEmail && (
        <form onSubmit={submit} className="space-y-5" noValidate>
          <Field id="newEmail" label="New email address" error={error && !password ? error : null}>
            <input
              id="newEmail"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass(error)}
            />
          </Field>
          <Field id="currentPassword" label="Current password">
            <input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass(null)}
            />
          </Field>
          {error && password && <Alert tone="error">{error}</Alert>}
          <button type="submit" className={primaryButton()} disabled={saving}>
            {saving ? "Sending…" : "Send confirmation link"}
          </button>
        </form>
      )}
      {pending && <p className="text-sm text-[#5A6B85]">Check your inbox to finish.</p>}
    </div>
  )
}

// -------------------------------------------------------------------- password

function PasswordTab({ onSignedOut }: { onSignedOut: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const problem = passwordProblem(password)
    if (problem) {
      setError(problem)
      return
    }
    if (password !== confirm) {
      setError("The two passwords do not match.")
      return
    }
    setError(null)
    setSaving(true)
    try {
      await api.auth.changePassword(currentPassword, password)
      setDone(true)
      setCurrentPassword("")
      setPassword("")
      setConfirm("")
    } catch (cause) {
      setError(readStatus(cause, "Unable to change your password."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <Alert tone="info">
        Changing your password signs you out on every other device.
      </Alert>
      {done && (
        <Alert tone="success">
          Password changed. <button type="button" className="underline" onClick={onSignedOut}>Sign out now</button>
        </Alert>
      )}
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Field id="currentPassword" label="Current password">
          <input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className={inputClass(null)}
          />
        </Field>
        <Field
          id="newPassword"
          label="New password"
          hint="At least 12 characters with upper case, lower case, and a number."
        >
          <input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass(null)}
          />
        </Field>
        <Field id="confirmPassword" label="Confirm new password">
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className={inputClass(null)}
          />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        <button type="submit" className={primaryButton()} disabled={saving}>
          {saving ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  )
}

// -------------------------------------------------------------------- sessions

function SessionsTab({
  status,
  onChanged,
}: {
  status: AccountStatus
  onChanged: () => Promise<void>
}) {
  const [sessions, setSessions] = useState<ActiveSession[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setSessions(await api.users.sessions())
    } catch (cause) {
      setError(readError(cause, "Unable to load your sessions."))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function revoke(id: string) {
    setBusy(id)
    try {
      await api.users.revokeSession(id)
      await load()
      await onChanged()
    } catch (cause) {
      setError(readError(cause, "Unable to revoke that session."))
    } finally {
      setBusy(null)
    }
  }

  async function revokeAll() {
    setBusy("all")
    try {
      await api.users.revokeAllSessions()
      await load()
      await onChanged()
    } catch (cause) {
      setError(readError(cause, "Unable to sign out other devices."))
    } finally {
      setBusy(null)
    }
  }

  if (error) return <Alert tone="error">{error}</Alert>
  if (!sessions) return <Alert tone="info">Loading your sessions…</Alert>

  return (
    <div className="space-y-5">
      {sessions.length === 0 ? (
        <Alert tone="info">No active sessions.</Alert>
      ) : (
        <ul className="space-y-3">
          {sessions.map((session, index) => (
            <li
              key={session.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D8DED8] bg-white px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-[#1B2A4A]">
                  {describeDevice(session.userAgent)}
                  {index === 0 && " (most recent)"}
                </p>
                <p className="text-xs text-[#5A6B85]">
                  {session.ipAddress ? `${session.ipAddress} · ` : ""}Last used{" "}
                  {formatDate(session.lastUsedAt)}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-[#D8DED8] px-3 py-1.5 text-sm font-medium text-[#1B2A4A] hover:bg-[#F4F6F2] disabled:opacity-60"
                disabled={busy === session.id}
                onClick={() => revoke(session.id)}
              >
                {busy === session.id ? "Revoking…" : "Sign out this device"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-[#5A6B85]">{status.activeSessions} active sessions.</p>
      <button
        type="button"
        className={secondaryButton()}
        disabled={busy === "all" || sessions.length === 0}
        onClick={revokeAll}
      >
        {busy === "all" ? "Signing out…" : "Sign out all devices"}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------- danger

function DeleteTab({ onSignedOut }: { onSignedOut: () => void }) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (confirm !== "DELETE") {
      setError("Type DELETE to confirm.")
      return
    }
    setError(null)
    setSaving(true)
    try {
      await api.users.deleteAccount(password, confirm)
      setDone(true)
      onSignedOut()
    } catch (cause) {
      setError(readStatus(cause, "Unable to delete your account."))
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return <Alert tone="success">Your account is deleted and every session is signed out.</Alert>
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Alert tone="error">
        Deleting your account signs out every device immediately and replaces your name and
        email with &quot;Deleted Account&quot;. Your listings and messages stay visible so other
        neighbors&rsquo; conversations are not broken, but they can no longer be managed by you.
      </Alert>
      <Field id="deletePassword" label="Your password">
        <input
          id="deletePassword"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass(null)}
        />
      </Field>
      <Field id="deleteConfirm" label="Type DELETE to confirm" error={error}>
        <input
          id="deleteConfirm"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          aria-invalid={Boolean(error)}
          className={inputClass(error)}
        />
      </Field>
      <button
        type="submit"
        className="w-full rounded-xl bg-red-700 px-5 py-3 font-semibold text-white hover:bg-red-800 disabled:opacity-60"
        disabled={saving}
      >
        {saving ? "Deleting…" : "Delete my account"}
      </button>
    </form>
  )
}