import { useCallback, useEffect, useState } from "react"
import { api, readStatus } from "../../api/client"
import type { MissionDetail } from "../../api/types"
import { Alert, ScreenTitle, primaryButton, secondaryButton } from "../../components/account-ui"

interface MissionDetailProps {
  missionId: string
  onNavigate: (page: string, id?: string) => void
}

/**
 * One mission, as the viewer is allowed to see it.
 *
 * The meeting point is not on this screen unless the server sent it, and the
 * screen says why when it is absent rather than showing an empty box that
 * looks like an oversight.
 */
export default function MissionDetailPage({ missionId, onNavigate }: MissionDetailProps) {
  const [mission, setMission] = useState<MissionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [reportReason, setReportReason] = useState("")
  const [reportDetails, setReportDetails] = useState("")

  const load = useCallback(async () => {
    try {
      setMission(await api.missions.detail(missionId))
      setError(null)
    } catch (cause) {
      setError(readStatus(cause, "That mission could not be loaded."))
      setMission(null)
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
      const result = (await action()) as { message?: string } | undefined
      // A waitlisted join says so in its own words rather than reporting a
      // generic success.
      setNotice(result?.message ?? message)
      await load()
    } catch (cause) {
      setError(readStatus(cause, "That could not be done."))
    } finally {
      setBusy(false)
    }
  }

  if (error && !mission) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16 space-y-4">
        <ScreenTitle title="Mission unavailable" />
        <Alert tone="error">{error}</Alert>
        <button type="button" className={secondaryButton()} onClick={() => onNavigate("missions")}>
          Back to missions
        </button>
      </main>
    )
  }

  if (!mission) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <Alert tone="info">Loading mission…</Alert>
      </main>
    )
  }

  const mine = mission.myParticipation
  const joined = mine && !["WITHDRAWN", "REMOVED"].includes(mine.status)
  const canJoin = !mission.isOrganizer && mission.status === "PUBLISHED" && !mission.ended

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12 space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-[#1B2A4A]">{mission.title}</h1>
        <p className="text-sm text-[#5A6B85]">
          {new Date(mission.startAt).toLocaleString()} – {new Date(mission.endAt).toLocaleTimeString()}
          {[mission.city, mission.neighborhood].filter(Boolean).join(" · ") || "Location not shared"}
        </p>
      </header>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {mission.status === "CANCELLED" && (
        <Alert tone="error">
          This mission was cancelled. Nothing is expected of anyone who joined it.
        </Alert>
      )}
      {mission.status === "COMPLETED" && (
        <Alert tone="info">
          This mission is complete. Verified participation appears on each
          participant&apos;s passport.
        </Alert>
      )}

      <p className="whitespace-pre-wrap text-sm text-[#1B2A4A]">{mission.description}</p>

      <section className="rounded-2xl border border-[#E8E6DF] bg-white p-4">
        <h2 className="text-sm font-semibold text-[#1B2A4A]">Where to meet</h2>
        {mission.meetingPoint ? (
          <p className="mt-1 text-sm text-[#5A6B85]">{mission.meetingPoint}</p>
        ) : (
          <p className="mt-1 text-sm text-[#5A6B85]">
            {/* Saying why it is hidden is better than an empty box. */}
            {mission.isOrganizer
              ? "No meeting point has been set."
              : "The meeting point is shared with confirmed participants once there is room."}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-[#E8E6DF] bg-white p-4">
        <h2 className="text-sm font-semibold text-[#1B2A4A]">Your place</h2>
        {joined ? (
          <div className="mt-2 space-y-2 text-sm text-[#5A6B85]">
            <p>
              You are{" "}
              <span className="font-semibold text-[#1B2A4A]">
                {mine?.status.toLowerCase().replace(/_/g, " ")}
              </span>
              {mine?.status === "WAITLISTED" && mine.waitlistPosition
                ? `, position ${mine.waitlistPosition}`
                : ""}
              .
            </p>
            {mine?.status === "VERIFIED" && (
              <p>
                Your participation is verified and counts toward your passport. Nothing further is
                needed from you.
              </p>
            )}
            {mine?.status === "ATTENDED" && (
              <p>
                Your attendance was confirmed. Once the organizer completes the mission, your
                participation becomes verified.
              </p>
            )}
            {mine?.status === "CHECKED_IN" && (
              <p>You checked in. Waiting for the organizer to confirm attendance.</p>
            )}
            {mission.status === "PUBLISHED" && !mission.ended && (
              <button
                type="button"
                className={secondaryButton()}
                disabled={busy}
                onClick={() => void act(() => api.missions.leave(missionId), "You have left the mission.")}
              >
                Leave this mission
              </button>
            )}
          </div>
        ) : canJoin ? (
          <div className="mt-2 space-y-2">
            <p className="text-sm text-[#5A6B85]">
              {mission.slotsLeft > 0
                ? `${mission.slotsLeft} of ${mission.capacity} places left.`
                : "This mission is full. You can join the waitlist."}
              {mission.requiresApproval && " The organizer approves each participant."}
            </p>
            <button
              type="button"
              className={primaryButton()}
              disabled={busy}
              onClick={() => void act(() => api.missions.join(missionId), "You joined the mission.")}
            >
              {mission.slotsLeft > 0 ? "Join this mission" : "Join the waitlist"}
            </button>
          </div>
        ) : (
          <p className="mt-1 text-sm text-[#5A6B85]">
            {mission.isOrganizer
              ? "You organized this mission."
              : "This mission is not open for joining."}
          </p>
        )}
      </section>

      {mine?.status === "CONFIRMED" && mission.status === "PUBLISHED" && !mission.ended && (
        <button
          type="button"
          className={primaryButton()}
          disabled={busy}
          onClick={() => void act(() => api.missions.checkIn(missionId), "You checked in.")}
        >
          I am here
        </button>
      )}

      {mission.isOrganizer && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryButton()} onClick={() => onNavigate("mission-manage", missionId)}>
            Manage participants
          </button>
          <button type="button" className={secondaryButton()} onClick={() => onNavigate("mission-edit", missionId)}>
            Edit mission
          </button>
        </div>
      )}

      {mission.status === "COMPLETED" && (
        <button
          type="button"
          className={secondaryButton()}
          onClick={() => onNavigate("mission-contributions")}
        >
          See my community record
        </button>
      )}

      {!mission.isOrganizer && mission.status === "PUBLISHED" && (
        <form
          className="space-y-3 rounded-2xl border border-[#D8DED8] p-4"
          onSubmit={event => {
            event.preventDefault()
            if (reportReason.trim().length < 3) {
              setError("Choose what you are reporting.")
              return
            }
            void act(
              () => api.missions.report(missionId, reportReason.trim(), reportDetails.trim() || undefined),
              "Thanks. A moderator will look at it."
            )
          }}
          noValidate
        >
          <h2 className="text-sm font-semibold text-[#1B2A4A]">Report this mission</h2>
          <p className="text-xs text-[#5C6E8A]">
            Reports go to moderators. Who reported is never shown to the organizer.
          </p>
          <label className="block text-sm text-[#1B2A4A]" htmlFor="report-reason">
            What is wrong?
          </label>
          <select
            id="report-reason"
            value={reportReason}
            onChange={event => setReportReason(event.target.value)}
            className="rounded-xl border border-[#D8DED8] px-3 py-2 text-sm"
          >
            <option value="">Choose a reason</option>
            <option value="SPAM">Spam or misleading</option>
            <option value="HARASSMENT">Harassment</option>
            <option value="PRIVATE_LOCATION">Private location disclosed</option>
            <option value="OTHER">Something else</option>
          </select>
          <label className="block text-sm text-[#1B2A4A]" htmlFor="report-details">
            Anything a moderator should know?
          </label>
          <textarea
            id="report-details"
            rows={2}
            value={reportDetails}
            onChange={event => setReportDetails(event.target.value)}
            className="w-full rounded-xl border border-[#D8DED8] px-3 py-2 text-sm"
          />
          <button type="submit" className={secondaryButton()} disabled={busy}>
            Send report
          </button>
        </form>
      )}

      <button type="button" className={secondaryButton()} onClick={() => onNavigate("missions")}>
        Back to missions
      </button>
    </main>
  )
}