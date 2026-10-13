import { useCallback, useEffect, useState } from "react"
import { api, readStatus } from "../../api/client"
import { Alert, ScreenTitle, primaryButton, secondaryButton } from "../../components/account-ui"

type Row = {
  id: string
  targetType: string
  reason: string
  details?: string | null
  createdAt: string
  reporter: { profile?: { displayName?: string | null; firstName?: string | null } | null }
  mission: {
    id: string
    title: string
    status: string
    confirmedCount: number
    capacity: number
    organizer: { profile?: { displayName?: string | null; firstName?: string | null } | null }
  } | null
}

/**
 * Staff queue for reported missions.
 *
 * Reuses the Milestone 8 queue and the same staff check on the server; nothing
 * here decides authorization. Hiding archives rather than deletes, so the
 * mission and everyone who joined it keep their history, and the screen says so
 * before the moderator presses the button.
 */
export default function CommunityModeration({ onNavigate }: { onNavigate: (page: string, id?: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ missionId: string; action: "hide" | "restore" } | null>(null)
  const [note, setNote] = useState("")

  const load = useCallback(async () => {
    try {
      setRows((await api.missions.staffQueue()) as Row[])
      setError(null)
    } catch (cause) {
      setError(readStatus(cause, "The moderation queue could not be loaded."))
      setRows([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function apply() {
    if (!pending) return
    if (note.trim().length < 5) {
      setError("Give a reason. It is stored with the action and shown to participants.")
      return
    }
    const target = pending
    setPending(null)
    setBusy(true)
    setError(null)
    setNotice("")
    try {
      await api.missions.staffModerate(target.missionId, target.action, note.trim())
      setNotice(
        target.action === "hide"
          ? "Mission archived. It stays on record, and everyone on it was told."
          : "Mission restored."
      )
      await load()
    } catch (cause) {
      setError(readStatus(cause, "That action could not be applied."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12 space-y-6">
      <ScreenTitle
        title="Community moderation"
        subtitle="Reported missions, with the reason each action was taken."
      />

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {pending && (
        <form
          className="space-y-3 rounded-2xl border border-[#D8DED8] bg-white p-4"
          onSubmit={event => {
            event.preventDefault()
            void apply()
          }}
          noValidate
        >
          <label className="block text-sm text-[#1B2A4A]" htmlFor="moderation-note">
            Reason for {pending.action === "hide" ? "archiving" : "restoring"} this mission
          </label>
          <textarea
            id="moderation-note"
            rows={2}
            value={note}
            onChange={event => setNote(event.target.value)}
            className="w-full rounded-xl border border-[#D8DED8] px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button type="submit" className={primaryButton()} disabled={busy}>
              {busy ? "Applying…" : "Confirm"}
            </button>
            <button type="button" className={secondaryButton()} onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {rows === null && <Alert tone="info">Loading the queue…</Alert>}
      {rows !== null && rows.length === 0 && <Alert tone="info">Nothing waiting for review.</Alert>}

      {rows !== null && rows.length > 0 && (
        <ul className="space-y-4">
          {rows.map(row => (
            <li key={row.id} className="rounded-2xl border border-[#E8E6DF] bg-white p-4">
              <p className="text-sm font-medium text-[#1B2A4A]">
                {row.mission?.title ?? "Reported participant"}
              </p>
              <p className="mt-1 text-sm text-[#5A6B85]">
                Reported for {String(row.reason).toLowerCase().replace(/_/g, " ")}
              </p>
              {row.details && <p className="mt-1 text-sm text-[#5A6B85]">{row.details}</p>}
              <p className="mt-1 text-xs text-[#8A9AB5]">
                Reported by{" "}
                {row.reporter?.profile?.displayName || row.reporter?.profile?.firstName || "a neighbor"}
                {" · "}
                {new Date(row.createdAt).toLocaleDateString()}
              </p>

              {row.mission && (
                <>
                  <p className="mt-2 text-xs text-[#8A9AB5]">
                    {row.mission.status.toLowerCase()} · {row.mission.confirmedCount} of{" "}
                    {row.mission.capacity} places taken · organized by{" "}
                    {row.mission.organizer?.profile?.displayName ||
                      row.mission.organizer?.profile?.firstName ||
                      "a neighbor"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={secondaryButton()}
                      onClick={() => {
                        setNote("")
                        setPending({ missionId: row.mission!.id, action: "hide" })
                      }}
                    >
                      Archive mission
                    </button>
                    <button
                      type="button"
                      className={secondaryButton()}
                      onClick={() => {
                        setNote("")
                        setPending({ missionId: row.mission!.id, action: "restore" })
                      }}
                    >
                      Restore mission
                    </button>
                    <button
                      type="button"
                      className={secondaryButton()}
                      onClick={() => onNavigate("mission-detail", row.mission!.id)}
                    >
                      View mission
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <button type="button" className={secondaryButton()} onClick={() => onNavigate("missions")}>
        Back to missions
      </button>
    </main>
  )
}