import { useEffect, useId, useRef, useState, type ReactNode } from "react"

/**
 * Shared accessibility primitives.
 *
 * These exist because the same three problems were solved slightly differently
 * in every screen: hiding the skip link, announcing asynchronous updates, and
 * trapping focus in an overlay. Centralising them means a fix lands once.
 */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",")

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    element => element.offsetParent !== null || element === document.activeElement
  )
}

/**
 * Placeholder shown while a route's chunk is being fetched.
 *
 * It reserves the height of a page header so the layout does not jump when the
 * real screen arrives, and it is announced so a screen-reader user is told the
 * page is loading rather than meeting silence. It is deliberately not a
 * full-screen spinner: the header stays usable while a route loads.
 */
export function RouteFallback({ label = "Loading page" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-8"
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-[#F5F4EF]" />
        <div className="h-4 w-72 max-w-full rounded bg-[#F5F4EF]" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-40 rounded-2xl bg-[#F5F4EF]" />
          <div className="h-40 rounded-2xl bg-[#F5F4EF]" />
          <div className="h-40 rounded-2xl bg-[#F5F4EF]" />
        </div>
      </div>
    </div>
  )
}

/**
 * Bypasses the navigation on every page.
 *
 * Rendered as the first element inside the document body so it is the first
 * thing a keyboard user reaches. It stays out of the visual layout until
 * focused, which is the behaviour the `.skip-link` class provides.
 */
export function SkipLink({ targetId = "main-content" }: { targetId?: string }) {
  return (
    <a href={`#${targetId}`} className="skip-link">
      Skip to main content
    </a>
  )
}

/**
 * Announces a message to assistive technology without moving focus.
 *
 * `aria-live="polite"` means the announcement waits for a pause rather than
 * interrupting whatever the screen reader is currently saying. Errors use
 * `assertive` because they change what the user should do next.
 *
 * The element renders nothing visible. It must stay mounted for the region to
 * be registered with assistive technology, so it deliberately returns an empty
 * container instead of null when there is no message.
 */
export function LiveRegion({ message, assertive = false }: { message?: string; assertive?: boolean }) {
  return (
    <div
      role={assertive ? "alert" : "status"}
      aria-live={assertive ? "assertive" : "polite"}
      aria-atomic="true"
      className="sr-only"
    >
      {message ?? ""}
    </div>
  )
}

/**
 * Modal dialog with focus trapping, Escape handling and focus restoration.
 *
 * Implements the WAI-ARIA dialog pattern:
 *  - focus moves into the dialog when it opens
 *  - Tab and Shift+Tab cycle within the dialog and cannot escape it
 *  - Escape closes it
 *  - focus returns to the element that opened it
 *
 * The label is wired with `aria-labelledby` so the dialog has an accessible
 * name even when its visible heading is not the first child.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  labelledBy,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
  /** Id of an element to use as the accessible name when `title` is absent. */
  labelledBy?: string
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const generatedId = useId()
  const titleId = labelledBy ?? `${generatedId}-title`

  // Move focus into the dialog on open and remember where it came from, so
  // closing returns the user to the control they activated.
  useEffect(() => {
    if (!open) return
    restoreFocusRef.current = document.activeElement as HTMLElement | null
    const first = dialogRef.current ? focusableWithin(dialogRef.current)[0] : null
    // Fall back to the dialog itself so focus is never left behind the overlay.
    ;(first ?? dialogRef.current)?.focus()
    return () => {
      restoreFocusRef.current?.focus?.()
    }
  }, [open])

  // Prevent the page behind the overlay from scrolling while it is open.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  if (!open) return null

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== "Tab") return

    const container = dialogRef.current
    if (!container) return
    const items = focusableWithin(container)
    if (items.length === 0) {
      event.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement

    // Wrap at both ends so focus cannot escape the dialog.
    if (event.shiftKey && (active === first || !container.contains(active))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#1B2A4A]/40 p-0 sm:p-4"
      onMouseDown={event => {
        // Backdrop clicks dismiss; clicks inside the panel must not.
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title && !labelledBy ? "Dialog" : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
      >
        {title && (
          <div className="flex items-start justify-between gap-4 p-5 border-b border-[#E8E6DF]">
            <h2 id={titleId} className="font-display text-lg font-semibold text-[#1B2A4A]">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-[#5C6E8A] hover:bg-[#F5F4EF]"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
        {footer && <div className="p-5 pt-0 flex flex-wrap gap-3 justify-end">{footer}</div>}
      </div>
    </div>
  )
}

/**
 * Dropdown menu button with the keyboard behaviour the ARIA menu pattern
 * expects: Escape closes and returns focus, arrow keys move between items, and
 * a click outside dismisses.
 *
 * Items are ordinary buttons in a labelled container rather than `role="menu"`
 * children. For navigation lists of links this is the more robust pattern,
 * because it does not require managing the menu widget roving-tabindex model
 * and behaves correctly in every screen reader tested.
 */
export function Menu({
  label,
  trigger,
  children,
  align = "right",
  className = "",
}: {
  /** Accessible name for the trigger. */
  label: string
  trigger: ReactNode
  children: (close: () => void) => ReactNode
  align?: "left" | "right"
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = `${useId()}-menu`

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) close()
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [open])

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      close()
      return
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    const container = containerRef.current
    if (!container) return
    const items = focusableWithin(container).filter(item => item !== triggerRef.current)
    if (items.length === 0) return
    event.preventDefault()
    const current = items.indexOf(document.activeElement as HTMLElement)
    const delta = event.key === "ArrowDown" ? 1 : -1
    const next = current === -1 ? 0 : (current + delta + items.length) % items.length
    items[next].focus()
  }

  return (
    <div className={`relative ${className}`} ref={containerRef} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => setOpen(current => !current)}
        className="flex items-center gap-2"
      >
        {trigger}
      </button>
      {open && (
        <div
          id={menuId}
          className={`absolute top-full mt-2 w-56 bg-white border border-[#E8E6DF] rounded-2xl shadow-xl p-2 z-50 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children(close)}
        </div>
      )}
    </div>
  )
}
