import { useCallback, useEffect, useState } from "react"
import { api, ApiError, readStatus, type StaffReport } from "../../api/client"
import { Alert, ScreenTitle } from "../../components/account-ui"

type QueueStatus = "OPEN" | "RESOLVED"
type ActionKind = "HIDE" | "SUSPEND_USER" | "RESTORE_USER"

function reporterName(report: StaffReport) {
  return report.reporter?.profile?.displayName || report.reporter?.profile?.firstName || "A neighbor"
}

/**
 * Staff report queue on the existing moderation endpoints.
 *
 * A non-staff member who opens the URL sees the API's refusal and no
 * actions. Hide, suspend, and restore call the same action route and surface
 * its error when the server rejects them.
 */
export default function ReportQueue() {
  const [status, setStatus] = useState<QueueStatus>("OPEN")
  const [reports, setReports] = useState<StaffReport[] | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [note, setNote] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setForbidden(false)
    try {
      setReports(await api.moderation.reports(status))
    } catch (cause) {
      setReports([])
      if (cause instanceof ApiError && cause.status === 403) {
        setForbidden(true)
        setError(readStatus(cause, "Moderator access is required"))
        return
      }
      setError(readStatus(cause, "The report queue could not be loaded."))
    }
  }, [status])

  useEffect(() => {
    void load()
  }, [load])

  async function act(id: string, kind: ActionKind) {
    setBusyId(id)
    setError(null)
    setNotice("")
    try {
      await api.moderation.act(id, { kind, ...(note.trim() ? { note: note.trim() } : {}) })
      setNotice(
        kind === "HIDE"
          ? "Report hidden."
          : kind === "SUSPEND_USER"
            ? "Account suspended."
            : "Account restored.",
      )
      await load()
    } catch (cause) {
      setError(readStatus(cause, "That action could not be applied."))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-12 space-y-6">
      <ScreenTitle
        title="Report queue"
        subtitle="Open reports from neighbors. Actions use the moderation API."
      />

      {!forbidden && (
        <nav aria-label="Report status" className="flex flex-wrap gap-2">
          {(
            [
              ["OPEN", "Open"],
              ["RESOLVED", "Resolved"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-current={status === value ? "page" : undefined}
              onClick={() => setStatus(value)}
              className={
                status === value
                  ? "rounded-full bg-[#2D6A4F] px-4 py-2 text-sm font-semibold text-white"
                  : "rounded-full border border-[#D8DED8] bg-white px-4 py-2 text-sm text-[#1B2A4A] hover:bg-[#F4F6F2]"
              }
            >
              {label}
            </button>
          ))}
        </nav>
      )}

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {forbidden ? null : reports === null ? (
        <p className="text-sm text-[#5C6E8A]">Loading the report queue…</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-[#5C6E8A]">
          {status === "OPEN" ? "No open reports." : "No resolved reports."}
        </p>
      ) : (
        <div className="space-y-4">
          <label className="block text-sm text-[#1B2A4A]" htmlFor="report-action-note">
            Note for the next action (optional)
          </label>
          <textarea
            id="report-action-note"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="w-full rounded-xl border border-[#D8DED8] px-3 py-2 text-sm"
          />
          <ul className="space-y-3">
            {reports.map((report) => (
              <li key={report.id} className="rounded-2xl border border-[#D8DED8] bg-white p-4 space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-[#1B2A4A]">
                    {report.targetType} · {report.reason}
                  </p>
                  <p className="text-xs text-[#5C6E8A]">{new Date(report.createdAt).toLocaleString()}</p>
                </div>
                <p className="text-sm text-[#5C6E8A]">Reported by {reporterName(report)}</p>
                {report.details && <p className="text-sm text-[#1B2A4A]">{report.details}</p>}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg bg-[#2D6A4F] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={busyId === report.id}
                    onClick={() => void act(report.id, "HIDE")}
                  >
                    Hide
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-[#D8DED8] px-3 py-1.5 text-sm font-semibold text-[#1B2A4A] disabled:opacity-50"
                    disabled={busyId === report.id}
                    onClick={() => void act(report.id, "SUSPEND_USER")}
                  >
                    Suspend
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-[#D8DED8] px-3 py-1.5 text-sm font-semibold text-[#1B2A4A] disabled:opacity-50"
                    disabled={busyId === report.id}
                    onClick={() => void act(report.id, "RESTORE_USER")}
                  >
                    Restore
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
