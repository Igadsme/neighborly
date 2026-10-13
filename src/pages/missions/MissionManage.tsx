import { useCallback, useEffect, useState } from "react"
import { api, readStatus } from "../../api/client"
import type { MissionDetail, MissionParticipantRow } from "../../api/types"
import { Alert, ScreenTitle, primaryButton, secondaryButton } from "../../components/account-ui"

interface MissionManageProps {
  missionId: string
  onNavigate: (page: string, id?: string) => void
}

/**
 * The organizer dashboard: the run sheet.
 *
 * Attendance is the important part. Marking somebody present is what turns a
 * click into verified participation, so each button says what it commits the
 * organizer to, and confirming attendance is offered only for somebody who
 * checked themselves in.
 */
export default function MissionManage({ missionId, onNavigate }: MissionManageProps) {
  const [mission, setMission] = useState<MissionDetail | null>(null)
  const [roster, setRoster] = useState<MissionParticipantRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ kind: string; id: string; label: string } | null>(null)
  const [reason, setReason] = useState("")

  const load = useCallback(async () => {
    try {
      const [detail, participants] = await Promise.all([
        api.missions.detail(missionId),
        api.missions.participants(missionId)
      ])
      setMission(detail)
      setRoster(participants)
      setError(null)
    } catch (cause) {
      setError(readStatus(cause, "This mission could not be loaded."))
      setMission(null)
      setRoster(null)
    }
  }, [missionId])

  useEffect(() => {
    void load()
  }, [load])

  async function act(action: () => Promise<unknown>, message: string) {
    setBusy(true)
    setError(null)
    setNotice("")
    try {
      await action()
      setNotice(message)
      await load()
    } catch (cause) {
      setError(readStatus(cause, "That could not be done."))
    } finally {
      setBusy(false)
    }
  }

  if (!mission) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16 space-y-4">
        {error ? (
          <>
            <ScreenTitle title="Mission unavailable" />
            <Alert tone="error">{error}</Alert>
          </>
        ) : (
          <Alert tone="info">Loading mission…</Alert>
        )}
      </main>
    )
  }

  if (!mission.isOrganizer) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16 space-y-4">
        <ScreenTitle title="Organizer only" />
        <Alert tone="error">Only the organizer of a mission can manage it.</Alert>
        <button
          type="button"
          className={secondaryButton()}
          onClick={() => onNavigate("mission-detail", missionId)}
        >
          View mission
        </button>
      </main>
    )
  }

  const waiting = roster?.filter(row => row.status === "WAITLISTED") ?? []
  const confirmed = roster?.filter(row => row.status !== "WAITLISTED") ?? []

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 space-y-6">
      <ScreenTitle title={mission.title} subtitle="Organizer dashboard" />

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {mission.requiresStaffVerification && (
        <Alert tone="info">
          A moderator has flagged this mission, so attendance is confirmed by staff rather than by
          you.
        </Alert>
      )}

      <section className="rounded-2xl border border-[#E8E6DF] bg-white p-4">
        <h2 className="text-sm font-semibold text-[#1B2A4A]">Status</h2>
        <p className="mt-1 text-sm text-[#5A6B85]">
          {mission.status.toLowerCase()} · {mission.confirmedCount} of {mission.capacity} places
          taken
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {mission.status === "DRAFT" && (
            <button
              type="button"
              className={primaryButton()}
              disabled={busy}
              onClick={() => void act(() => api.missions.setStatus(missionId, "PUBLISHED"), "Mission published.")}
            >
              Publish
            </button>
          )}
          {mission.status === "PUBLISHED" && (
            <>
              <button
                type="button"
                className={primaryButton()}
                disabled={busy}
                onClick={() => void act(() => api.missions.complete(missionId), "Mission completed.")}
              >
                Mark complete
              </button>
              <button
                type="button"
                className={secondaryButton()}
                onClick={() => {
                  setReason("")
                  setPending({ kind: "cancel", id: missionId, label: "cancelling this mission" })
                }}
              >
                Cancel mission
              </button>
            </>
          )}
          <button
            type="button"
            className={secondaryButton()}
            onClick={() => onNavigate("mission-edit", missionId)}
          >
            Edit details
          </button>
        </div>
      </section>

      {pending && (
        <form
          className="space-y-3 rounded-2xl border border-[#D8DED8] bg-white p-4"
          onSubmit={event => {
            event.preventDefault()
            if (reason.trim().length < 5) {
              setError("Give a reason; participants are told what happened.")
              return
            }
            const target = pending
            setPending(null)
            void act(
              async () => {
                if (target.kind === "cancel") {
                  await api.missions.setStatus(missionId, "CANCELLED", reason.trim())
                } else if (target.kind === "revoke") {
                  await api.missions.revoke(missionId, target.id, reason.trim())
                }
              },
              target.kind === "cancel" ? "Mission cancelled." : "Participation revoked."
            )
          }}
          noValidate
        >
          <label className="block text-sm text-[#1B2A4A]" htmlFor="manage-reason">
            Reason for {pending.label}
          </label>
          <textarea
            id="manage-reason"
            rows={2}
            value={reason}
            onChange={event => setReason(event.target.value)}
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

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">
          Confirmed ({confirmed.length})
        </h2>
        {roster === null && <Alert tone="info">Loading the run sheet…</Alert>}
        {roster && confirmed.length === 0 && (
          <p className="text-sm text-[#5A6B85]">Nobody has joined yet.</p>
        )}
        {roster !== null && confirmed.length > 0 && (
          <ul className="space-y-3">
            {confirmed.map(row => (
              <li key={row.id} className="rounded-2xl border border-[#E8E6DF] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-[#1B2A4A]">
                    {row.user?.profile?.displayName || row.user?.profile?.firstName || "A neighbor"}
                  </p>
                  <span className="rounded-full bg-[#F1F3EF] px-2 py-0.5 text-[11px] font-semibold text-[#5A6B85]">
                    {row.status.toLowerCase().replace(/_/g, " ")}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {/* Attendance is only offered for somebody who checked
                      themselves in, because confirming someone who did not
                      turn up is how verified credit gets faked. */}
                  {row.status === "CHECKED_IN" && !mission.requiresStaffVerification && (
                    <button
                      type="button"
                      className={secondaryButton()}
                      disabled={busy}
                      onClick={() =>
                        void act(
                          () => api.missions.markAttendance(missionId, row.id),
                          "Attendance confirmed."
                        )
                      }
                    >
                      Confirm they were there
                    </button>
                  )}
                  {row.status === "CHECKED_IN" && mission.requiresStaffVerification && (
                    <p className="text-xs text-[#5A6B85]">
                      Waiting for a moderator to confirm attendance.
                    </p>
                  )}
                  {row.status === "VERIFIED" && (
                    <>
                      <p className="text-xs text-[#1E4A36]">
                        Verified participation. It counts on their passport.
                      </p>
                      <button
                        type="button"
                        className={secondaryButton()}
                        onClick={() => {
                          setReason("")
                          setPending({ kind: "revoke", id: row.id, label: "revoking this participation" })
                        }}
                      >
                        Revoke participation
                      </button>
                    </>
                  )}
                  {row.status === "CONFIRMED" && (
                    <p className="text-xs text-[#8A9AB5]">Has not checked in yet.</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {waiting.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">
            Waiting ({waiting.length})
          </h2>
          <ul className="space-y-3">
            {waiting.map(row => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#E8E6DF] bg-white p-4"
              >
                <p className="text-sm text-[#1B2A4A]">
                  {row.user?.profile?.displayName || row.user?.profile?.firstName || "A neighbor"}
                  {row.waitlistPosition ? ` · waitlist ${row.waitlistPosition}` : ""}
                </p>
                <button
                  type="button"
                  className={secondaryButton()}
                  disabled={busy || mission.slotsLeft === 0}
                  onClick={() =>
                    void act(
                      () => api.missions.approve(missionId, row.id),
                      "Participant confirmed."
                    )
                  }
                >
                  {mission.slotsLeft === 0 ? "No places left" : "Give a place"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button type="button" className={secondaryButton()} onClick={() => onNavigate("missions")}>
        Back to missions
      </button>
    </main>
  )
}