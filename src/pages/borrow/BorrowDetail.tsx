import { useCallback, useEffect, useState } from "react"
import { api, readStatus } from "../../api/client"
import type { BorrowRequest, BorrowRequestStatus } from "../../api/types"
import {
  Alert,
  Field,
  inputClass,
  ScreenTitle,
  primaryButton,
  secondaryButton
} from "../../components/account-ui"
import { date } from "./BorrowMarketplace"

interface BorrowDetailProps {
  requestId: string
  onNavigate: (page: string, id?: string) => void
}

/**
 * One borrowing, and only the actions that are legal right now.
 *
 * Two-sided actions are explicit about that. Confirming a pickup does not
 * move the item: the screen says who is still outstanding, because the API
 * refuses to complete a handoff until both parties have confirmed.
 */
export default function BorrowDetail({ requestId, onNavigate }: BorrowDetailProps) {
  const [record, setRecord] = useState<BorrowRequest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [scheduleAt, setScheduleAt] = useState("")
  const [locationNote, setLocationNote] = useState("")
  const [condition, setCondition] = useState("good")
  const [conditionNotes, setConditionNotes] = useState("")
  const [extensionEnd, setExtensionEnd] = useState("")
  const [disputeSummary, setDisputeSummary] = useState("")
  const [disputeReason, setDisputeReason] = useState("DAMAGE")

  const load = useCallback(async () => {
    try {
      setRecord(await api.borrow.request(requestId))
      setError(null)
    } catch (cause) {
      setError(readStatus(cause, "That borrowing could not be loaded."))
      setRecord(null)
    }
  }, [requestId])

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
      setError(readStatus(cause, "That change could not be applied."))
    } finally {
      setBusy(false)
    }
  }

  if (error && !record) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16 space-y-4">
        <ScreenTitle title="Borrowing unavailable" />
        <Alert tone="error">{error}</Alert>
        <button type="button" className={secondaryButton()} onClick={() => onNavigate("borrow-lent")}>
          Back to my borrowings
        </button>
      </main>
    )
  }

  if (!record) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <Alert tone="info">Loading borrowing…</Alert>
      </main>
    )
  }

  const status = record.status
  const isLender = record.role === "lender"
  const pickup = record.handoffs?.find(row => row.kind === "PICKUP")
  const returned = record.handoffs?.find(row => row.kind === "RETURN")
  const pendingExtension = record.extensions?.find(row => row.status === "REQUESTED")
  const openDispute = record.disputes?.find(row => row.status === "OPEN" || row.status === "UNDER_REVIEW")

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12 space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold text-[#1B2A4A]">{record.listing.title}</h1>
          <StatusPill status={status} />
        </div>
        <p className="text-sm text-[#5A6B85]">
          You are the {isLender ? "lender" : "borrower"} ·{" "}
          {isLender
            ? `${record.borrower?.profile?.firstName ?? "a neighbor"} is borrowing this`
            : `${record.listing.seller?.profile?.firstName ?? "a neighbor"} is lending this`}
        </p>
      </header>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <section className="rounded-2xl border border-[#E8E6DF] bg-white p-5">
        <dl className="grid gap-2 text-sm text-[#1B2A4A] sm:grid-cols-2">
          <div>
            <dt className="text-xs text-[#5A6B85]">Borrowing dates</dt>
            <dd>
              {date(record.startAt)} → {date(record.endAt)}
            </dd>
          </div>
          {record.originalEndAt !== record.endAt && (
            <div>
              <dt className="text-xs text-[#5A6B85]">Originally agreed until</dt>
              {/* Kept so an extension never rewrites what was first agreed. */}
              <dd>{date(record.originalEndAt)}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-[#5A6B85]">Pickup notice</dt>
            <dd>{record.listing.minNoticeHours ?? 0} hours</dd>
          </div>
          {record.message && (
            <div>
              <dt className="text-xs text-[#5A6B85]">Message</dt>
              <dd>{record.message}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* ---------------------------------------------------------- decisions */}
      {status === "REQUESTED" && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">Awaiting a decision</h2>
          <div className="flex flex-wrap gap-2">
            {isLender ? (
              <>
                <Action
                  label="Approve"
                  disabled={busy}
                  onClick={() => act(() => api.borrow.approve(record.id), "Approved and booked.")}
                />
                <Action
                  label="Decline"
                  disabled={busy}
                  onClick={() => act(() => api.borrow.decline(record.id), "Declined.")}
                />
              </>
            ) : (
              <Action
                label="Withdraw my request"
                danger
                disabled={busy}
                onClick={() => act(() => api.borrow.cancel(record.id), "Request withdrawn.")}
              />
            )}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------- pickup */}
      {(status === "APPROVED" || status === "PICKUP_SCHEDULED") && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">Pickup</h2>
          {pickup?.scheduledAt && (
            <p className="text-sm text-[#5A6B85]">
              Scheduled for {date(pickup.scheduledAt)}.
              {/* Only the two participants ever see the meeting point. */}
              {pickup.locationNote ? ` Meet at: ${pickup.locationNote}` : ""}
            </p>
          )}
          <form
            className="space-y-3 rounded-xl border border-[#D8DED8] p-3"
            onSubmit={event => {
              event.preventDefault()
              if (!scheduleAt) {
                setError("Choose a pickup time.")
                return
              }
              void act(
                () =>
                  api.borrow.schedulePickup(record.id, {
                    scheduledAt: new Date(scheduleAt).toISOString(),
                    locationNote: locationNote || undefined
                  }),
                "Pickup scheduled."
              )
            }}
            noValidate
          >
            <Field id="pickup-at" label="Pickup time">
              <input
                id="pickup-at"
                type="datetime-local"
                value={scheduleAt}
                onChange={event => setScheduleAt(event.target.value)}
                className={inputClass(null)}
              />
            </Field>
            <Field
              id="pickup-note"
              label="Meeting point (private to you two)"
              hint="Never shown publicly or in notifications."
            >
              <input
                id="pickup-note"
                value={locationNote}
                onChange={event => setLocationNote(event.target.value)}
                className={inputClass(null)}
              />
            </Field>
            <button type="submit" className={primaryButton()} disabled={busy}>
              {pickup?.scheduledAt ? "Reschedule" : "Schedule pickup"}
            </button>
          </form>

          <ConfirmPanel
            title="Confirm the handoff"
            body="The item only moves when both of you confirm. One click on its own changes nothing."
            record={record}
            kind="PICKUP"
            handoff={pickup}
            condition={condition}
            notes={conditionNotes}
            onCondition={setCondition}
            onNotes={setConditionNotes}
            busy={busy}
            onConfirm={notes =>
              act(
                () => api.borrow.confirmPickup(record.id, { condition, notes: notes || undefined }),
                "Confirmed."
              )
            }
          />

          {isLender && (
            <Action
              label="Cancel this pickup"
              danger
              disabled={busy}
              onClick={() => act(() => api.borrow.cancelPickup(record.id), "Pickup cancelled.")}
            />
          )}
        </section>
      )}

      {/* ------------------------------------------------------ while it is out */}
      {(status === "CHECKED_OUT" || status === "RETURN_REQUESTED" || status === "OVERDUE") && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">While you have it</h2>
          {status === "OVERDUE" && (
            <Alert tone="error">
              This borrowing is past its due date of {date(record.endAt)}. Bring it back as soon as you
              can.
            </Alert>
          )}
          {!isLender && status !== "RETURN_REQUESTED" && (
            <Action
              label="I am returning it"
              disabled={busy}
              onClick={() => act(() => api.borrow.requestReturn(record.id), "Return started.")}
            />
          )}
          {!isLender && status === "RETURN_REQUESTED" && (
            <Action
              label="Schedule the return"
              disabled={busy}
              onClick={() =>
                act(
                  () =>
                    api.borrow.requestReturn(
                      record.id,
                      new Date(Date.now() + 86_400_000).toISOString()
                    ),
                  "Return scheduled."
                )
              }
            />
          )}

          <ConfirmPanel
            title="Confirm the return"
            body="Both of you confirm, then the borrowing can be completed."
            record={record}
            kind="RETURN"
            handoff={returned}
            condition={condition}
            notes={conditionNotes}
            onCondition={setCondition}
            onNotes={setConditionNotes}
            busy={busy}
            onConfirm={notes =>
              act(
                () => api.borrow.confirmReturn(record.id, { condition, notes: notes || undefined }),
                "Confirmed."
              )
            }
          />

          {!isLender && !pendingExtension && (
            <form
              className="space-y-2 rounded-xl border border-[#D8DED8] p-3"
              onSubmit={event => {
                event.preventDefault()
                if (!extensionEnd) {
                  setError("Choose the new return date.")
                  return
                }
                void act(
                  () =>
                    api.borrow.requestExtension(record.id, {
                      requestedEndAt: new Date(extensionEnd).toISOString()
                    }),
                  "Extension requested."
                )
              }}
              noValidate
            >
              <p className="text-sm font-medium text-[#1B2A4A]">Need more time?</p>
              <Field id="extension-end" label="Return by instead">
                <input
                  id="extension-end"
                  type="date"
                  value={extensionEnd}
                  min={record.endAt.slice(0, 10)}
                  onChange={event => setExtensionEnd(event.target.value)}
                  className={inputClass(null)}
                />
              </Field>
              <button type="submit" className={secondaryButton()} disabled={busy}>
                Request an extension
              </button>
            </form>
          )}

          {pendingExtension && (
            <div className="rounded-xl border border-[#D8DED8] p-3">
              <p className="text-sm text-[#1B2A4A]">
                Extension requested until {date(pendingExtension.requestedEndAt)}.
              </p>
              {isLender && (
                <div className="mt-2 flex gap-2">
                  <Action
                    label="Approve"
                    disabled={busy}
                    onClick={() =>
                      act(() => api.borrow.approveExtension(pendingExtension.id), "Extension approved.")
                    }
                  />
                  <Action
                    label="Decline"
                    disabled={busy}
                    onClick={() =>
                      act(() => api.borrow.rejectExtension(pendingExtension.id), "Extension declined.")
                    }
                  />
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {status === "RETURNED" && (
        <section className="space-y-2">
          <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">Returned</h2>
          <p className="text-sm text-[#5A6B85]">
            Both sides confirmed the return. Complete the borrowing to close it out.
          </p>
          <Action
            label="Mark complete"
            disabled={busy}
            onClick={() => act(() => api.borrow.complete(record.id), "Borrowing complete.")}
          />
        </section>
      )}

      {/* ------------------------------------------------------------- dispute */}
      {!openDispute && ["CHECKED_OUT", "RETURN_REQUESTED", "OVERDUE", "RETURNED"].includes(status) && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">Something wrong?</h2>
          <p className="text-xs text-[#5A6B85]">
            Report damage, a missing item, or a late return. A dispute pauses the borrowing so
            nothing is settled while it is open. Neighborly does not charge anyone or adjudicate
            payment.
          </p>
          <form
            className="space-y-3"
            onSubmit={event => {
              event.preventDefault()
              if (disputeSummary.trim().length < 10) {
                setError("Describe what happened in at least 10 characters.")
                return
              }
              void act(
                () =>
                  api.borrow.openDispute(record.id, {
                    reason: disputeReason,
                    summary: disputeSummary.trim()
                  }),
                "Dispute opened."
              )
            }}
            noValidate
          >
            <Field id="dispute-reason" label="Reason">
              <select
                id="dispute-reason"
                value={disputeReason}
                onChange={event => setDisputeReason(event.target.value)}
                className={inputClass(null)}
              >
                <option value="DAMAGE">Damage to the item</option>
                <option value="MISSING_ITEM">Item not returned</option>
                <option value="LATE_RETURN">Returned late</option>
                <option value="OTHER">Something else</option>
              </select>
            </Field>
            <Field id="dispute-summary" label="What happened?">
              <textarea
                id="dispute-summary"
                rows={3}
                value={disputeSummary}
                onChange={event => setDisputeSummary(event.target.value)}
                className={inputClass(null)}
              />
            </Field>
            <button type="submit" className={secondaryButton()} disabled={busy}>
              Open a dispute
            </button>
          </form>
        </section>
      )}

      {openDispute && (
        <section className="space-y-2">
          <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">Open dispute</h2>
          <Alert tone="info">
            {openDispute.summary} · {openDispute.status.toLowerCase().replace("_", " ")}
          </Alert>
          <button
            type="button"
            className={secondaryButton()}
            onClick={() => onNavigate("borrow-dispute", openDispute.id)}
          >
            Open dispute center
          </button>
        </section>
      )}

      {/* -------------------------------------------------------------- record */}
      {record.conditionReports && record.conditionReports.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">Condition reports</h2>
          <ul className="space-y-2">
            {record.conditionReports.map(report => (
              <li key={report.id} className="rounded-xl border border-[#E8E6DF] bg-white p-3 text-sm">
                <span className="font-medium text-[#1B2A4A]">
                  {report.phase === "BEFORE" ? "At pickup" : "At return"}
                </span>
                <span className="text-[#5A6B85]">
                  {" "}
                  · {report.condition.replace(/_/g, " ")}
                  {report.notes ? ` · ${report.notes}` : ""}
                </span>
                <p className="mt-1 text-xs text-[#8A9AB5]">
                  Recorded by {report.reportedBy?.profile?.firstName ?? "a neighbor"} on{" "}
                  {date(report.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {record.events && record.events.length > 0 && (
        <details className="rounded-xl border border-[#D8DED8] bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-[#1B2A4A]">
            History ({record.events.length})
          </summary>
          <ol className="mt-3 space-y-1 text-xs text-[#5A6B85]">
            {record.events.map((entry, index) => (
              <li key={index}>
                {date(entry.createdAt)} — {entry.toStatus.toLowerCase().replace(/_/g, " ")}
                {entry.note ? ` (${entry.note})` : ""}
              </li>
            ))}
          </ol>
        </details>
      )}

      <button type="button" className={secondaryButton()} onClick={() => onNavigate("borrow-lent")}>
        Back to my borrowings
      </button>
    </main>
  )
}

function ConfirmPanel({
  title,
  body,
  record,
  kind,
  handoff,
  condition,
  notes,
  onCondition,
  onNotes,
  busy,
  onConfirm
}: {
  title: string
  body: string
  record: BorrowRequest
  kind: "PICKUP" | "RETURN"
  handoff?: { borrowerConfirmedAt?: string | null; lenderConfirmedAt?: string | null; completedAt?: string | null }
  condition: string
  notes: string
  onCondition: (value: string) => void
  onNotes: (value: string) => void
  busy: boolean
  onConfirm: (notes: string) => Promise<void>
}) {
  const isLender = record.role === "lender"
  const mine = isLender ? handoff?.lenderConfirmedAt : handoff?.borrowerConfirmedAt
  const theirs = isLender ? handoff?.borrowerConfirmedAt : handoff?.lenderConfirmedAt

  if (handoff?.completedAt) {
    return (
      <Alert tone="success">
        {title}: both of you confirmed on {date(handoff.completedAt)}.
      </Alert>
    )
  }

  return (
    <div className="space-y-2 rounded-xl border border-[#D8DED8] p-3">
      <p className="text-sm font-medium text-[#1B2A4A]">{title}</p>
      <p className="text-xs text-[#5A6B85]">{body}</p>
      <p className="text-xs text-[#5A6B85]">
        {mine ? "You have confirmed." : "You have not confirmed yet."}{" "}
        {theirs
          ? `${isLender ? "The borrower" : "The lender"} has confirmed.`
          : `Waiting on the ${isLender ? "borrower" : "lender"}.`}
      </p>
      {kind === "PICKUP" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field id={`${kind}-condition`} label="Condition at pickup">
            <select
              id={`${kind}-condition`}
              value={condition}
              onChange={event => onCondition(event.target.value)}
              className={inputClass(null)}
            >
              <option value="like_new">Like new</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="worn">Worn</option>
            </select>
          </Field>
          <Field id={`${kind}-notes`} label="Notes (optional)">
            <input
              id={`${kind}-notes`}
              value={notes}
              onChange={event => onNotes(event.target.value)}
              className={inputClass(null)}
            />
          </Field>
        </div>
      )}
      {!mine && (
        <button
          type="button"
          className={primaryButton()}
          disabled={busy}
          onClick={() => void onConfirm(notes)}
        >
          {busy ? "Saving…" : "I confirm"}
        </button>
      )}
    </div>
  )
}

function Action({
  label,
  onClick,
  disabled,
  danger
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        danger
          ? "rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          : "rounded-lg border border-[#D8DED8] px-3 py-1.5 text-sm text-[#1B2A4A] hover:bg-[#F4F6F2] disabled:opacity-50"
      }
    >
      {label}
    </button>
  )
}

export function StatusPill({ status }: { status: BorrowRequestStatus }) {
  const tones: Record<string, string> = {
    REQUESTED: "bg-[#FFF6E5] text-[#7A5210]",
    APPROVED: "bg-[#EEF6F1] text-[#1E4A36]",
    PICKUP_SCHEDULED: "bg-[#EAF1FB] text-[#1B3E6F]",
    CHECKED_OUT: "bg-[#EAF1FB] text-[#1B3E6F]",
    RETURN_REQUESTED: "bg-[#FFF6E5] text-[#7A5210]",
    RETURNED: "bg-[#EEF6F1] text-[#1E4A36]",
    COMPLETED: "bg-[#F1F3EF] text-[#5A6B85]",
    DECLINED: "bg-[#F7ECEA] text-[#7A2A1B]",
    CANCELLED: "bg-[#F1F3EF] text-[#5A6B85]",
    OVERDUE: "bg-[#F7ECEA] text-[#7A2A1B]",
    DISPUTED: "bg-[#F7ECEA] text-[#7A2A1B]"
  }
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
        tones[status] ?? tones.COMPLETED
      }`}
    >
      {status.toLowerCase().replace(/_/g, " ")}
    </span>
  )
}