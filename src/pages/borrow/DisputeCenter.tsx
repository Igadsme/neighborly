import { useCallback, useEffect, useRef, useState } from "react"
import { api, readStatus } from "../../api/client"
import type { BorrowDispute } from "../../api/types"
import { Alert, ScreenTitle, primaryButton, secondaryButton } from "../../components/account-ui"
import { date } from "./BorrowMarketplace"

interface DisputeCenterProps {
  disputeId?: string
  onNavigate: (page: string, id?: string) => void
}

interface EvidenceRow {
  id: string
  note?: string | null
  contentType: string
  createdAt: string
  uploadedBy: { profile?: { firstName?: string | null } | null }
}

/**
 * Dispute center.
 *
 * Evidence is only ever fetched through the authorized endpoint, and the
 * image URL points at the authenticated evidence route rather than the
 * object store: a condition photo can show the inside of someone's home, so
 * the bucket is private and every read is authorized.
 */
export default function DisputeCenter({ disputeId, onNavigate }: DisputeCenterProps) {
  const [disputes, setDisputes] = useState<BorrowDispute[] | null>(null)
  const [selected, setSelected] = useState<string | null>(disputeId ?? null)
  const [detail, setDetail] = useState<(BorrowDispute & { events: Array<{ toStatus: string; createdAt: string }> }) | null>(null)
  const [evidence, setEvidence] = useState<EvidenceRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [uploading, setUploading] = useState(false)
  const [note, setNote] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const loadList = useCallback(async () => {
    try {
      const rows = await api.borrow.listDisputes()
      setDisputes(rows)
      setSelected(current => current ?? rows[0]?.id ?? null)
      setError(null)
    } catch (cause) {
      setError(readStatus(cause, "Disputes could not be loaded."))
      setDisputes([])
    }
  }, [])

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetail(await api.borrow.dispute(id))
      setEvidence(await api.borrow.listEvidence(id))
    } catch (cause) {
      setError(readStatus(cause, "That dispute could not be loaded."))
      setDetail(null)
    }
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    if (selected) void loadDetail(selected)
  }, [selected, loadDetail])

  async function upload() {
    const file = fileRef.current?.files?.[0]
    if (!file || !selected) return
    setUploading(true)
    setError(null)
    setNotice("")
    try {
      const form = new FormData()
      form.append("file", file)
      if (note.trim()) form.append("note", note.trim())
      const response = await fetch(`/api/v1/borrow/disputes/${selected}/evidence`, {
        method: "POST",
        headers: { Authorization: `Bearer ${window.localStorage.getItem("neighborly.access_token") ?? ""}` },
        body: form
      })
      if (!response.ok) throw new Error(`upload failed: ${response.status}`)
      setNotice("Evidence uploaded.")
      setNote("")
      await loadDetail(selected)
    } catch (cause) {
      setError(readStatus(cause, "That photo could not be uploaded."))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-12 space-y-6">
      <ScreenTitle
        title="Disputes"
        subtitle="Reported problems on a borrowing. Only you, the other party, and staff can see them."
      />

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {!disputes && <Alert tone="info">Loading disputes…</Alert>}
      {disputes && disputes.length === 0 && (
        <Alert tone="info">No disputes. Hopefully it stays that way.</Alert>
      )}

      {disputes && disputes.length > 0 && (
        <div className="grid gap-6 md:grid-cols-[minmax(0,18rem)_1fr]">
          <nav aria-label="Disputes" className="space-y-2">
            {disputes.map(row => (
              <button
                key={row.id}
                type="button"
                aria-current={selected === row.id ? "true" : undefined}
                onClick={() => setSelected(row.id)}
                className={`w-full rounded-xl border p-3 text-left text-sm ${
                  selected === row.id
                    ? "border-[#2D6A4F] bg-[#F2F8F4]"
                    : "border-[#E8E6DF] bg-white hover:bg-[#F4F6F2]"
                }`}
              >
                <span className="block font-medium text-[#1B2A4A]">
                  {row.reason.toLowerCase().replace(/_/g, " ")}
                </span>
                <span className="block text-xs text-[#5A6B85]">
                  {row.status.toLowerCase().replace(/_/g, " ")} · {date(row.createdAt)}
                </span>
              </button>
            ))}
          </nav>

          {detail && (
            <section className="space-y-4">
              <div className="rounded-2xl border border-[#E8E6DF] bg-white p-4">
                <h2 className="font-display text-lg font-semibold text-[#1B2A4A]">
                  {detail.reason.toLowerCase().replace(/_/g, " ")}
                </h2>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[#1B2A4A]">{detail.summary}</p>
                <p className="mt-2 text-xs text-[#5A6B85]">
                  Opened by {detail.openedBy?.profile?.firstName ?? "a neighbor"} on {date(detail.createdAt)}
                </p>
                {detail.resolution && (
                  <Alert tone="info">
                    Resolution: {detail.resolution}
                  </Alert>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-[#1B2A4A]">Evidence</h3>
                {evidence.length === 0 && (
                  <p className="text-sm text-[#5A6B85]">No photos attached yet.</p>
                )}
                {evidence.length > 0 && (
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {evidence.map(row => (
                      <li key={row.id} className="rounded-xl border border-[#E8E6DF] bg-white p-2">
                        <img
                          src={api.borrow.uploadEvidenceUrl(selected ?? "", row.id)}
                          alt={row.note ?? "Evidence photo"}
                          className="h-24 w-full rounded-lg object-cover"
                        />
                        {row.note && <p className="mt-1 text-xs text-[#5A6B85]">{row.note}</p>}
                      </li>
                    ))}
                  </ul>
                )}

                <form
                  className="space-y-2 rounded-xl border border-[#D8DED8] p-3"
                  onSubmit={event => {
                    event.preventDefault()
                    void upload()
                  }}
                  noValidate
                >
                  <label className="block text-sm text-[#1B2A4A]" htmlFor="evidence-file">
                    Add a photo
                  </label>
                  <input
                    id="evidence-file"
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="block w-full text-sm"
                  />
                  <input
                    aria-label="Evidence note"
                    value={note}
                    onChange={event => setNote(event.target.value)}
                    placeholder="What this photo shows"
                    className="w-full rounded-xl border border-[#D8DED8] px-3 py-2 text-sm"
                  />
                  <button type="submit" className={primaryButton()} disabled={uploading}>
                    {uploading ? "Uploading…" : "Upload evidence"}
                  </button>
                  <p className="text-xs text-[#5A6B85]">
                    Photos are stored privately and are visible only to you, the other party, and
                    staff. Neither of you can delete what the other uploaded.
                  </p>
                </form>
              </div>

              <details className="rounded-xl border border-[#D8DED8] bg-white p-4">
                <summary className="cursor-pointer text-sm font-medium text-[#1B2A4A]">
                  Dispute history ({detail.events.length})
                </summary>
                <ol className="mt-2 space-y-1 text-xs text-[#5A6B85]">
                  {detail.events.map((entry, index) => (
                    <li key={index}>
                      {date(entry.createdAt)} — {entry.toStatus.toLowerCase().replace(/_/g, " ")}
                    </li>
                  ))}
                </ol>
              </details>

              <button
                type="button"
                className={secondaryButton()}
                onClick={() => onNavigate("borrow-detail", detail.borrowRequestId)}
              >
                Open the borrowing
              </button>
            </section>
          )}
        </div>
      )}
    </section>
  )
}