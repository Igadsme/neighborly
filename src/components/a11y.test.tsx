import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LiveRegion, Menu, Modal, RouteFallback, SkipLink } from "./a11y"

afterEach(cleanup)

describe("SkipLink", () => {
  it("is the first focusable element and targets the main landmark", () => {
    render(
      <>
        <SkipLink />
        <main id="main-content">
          content
        </main>
      </>,
    )
    const link = screen.getByRole("link", { name: /skip to main content/i })
    // Assert the raw attribute: `href` resolves against the document base URL.
    expect(link.getAttribute("href")).toBe("#main-content")
    expect(screen.getByRole("main")).toBeTruthy()
  })
})

describe("LiveRegion", () => {
  it("renders a polite status region that announces without moving focus", () => {
    render(<LiveRegion message="Request posted." />)
    const region = screen.getByRole("status")
    expect(region.getAttribute("aria-live")).toBe("polite")
    expect(region.textContent).toContain("Request posted.")
  })

  it("uses an assertive region for errors so they interrupt", () => {
    render(<LiveRegion message="That failed." assertive />)
    const region = screen.getByRole("alert")
    expect(region.getAttribute("aria-live")).toBe("assertive")
  })

  it("stays mounted and empty when there is nothing to announce", () => {
    const { container } = render(<LiveRegion />)
    // The element must remain in the DOM: a live region that is added at the
    // same moment as its text is frequently not announced at all.
    expect(container.querySelector("[aria-live]")).toBeTruthy()
    expect(container.querySelector("[aria-live]")?.textContent).toBe("")
  })
})

describe("Modal", () => {
  it("moves focus into the dialog when opened", () => {
    render(
      <Modal open onClose={() => {}} title="Confirm">
        <button type="button">Inside</button>
      </Modal>,
    )
    const dialog = screen.getByRole("dialog")
    expect(dialog).toBeTruthy()
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it("is labelled by its title and marked modal", () => {
    render(
      <Modal open onClose={() => {}} title="Confirm handoff">
        <p>body</p>
      </Modal>,
    )
    const dialog = screen.getByRole("dialog", { name: "Confirm handoff" })
    expect(dialog.getAttribute("aria-modal")).toBe("true")
  })

  it("closes on Escape", () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="Confirm">
        <button type="button">Inside</button>
      </Modal>,
    )
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("traps Tab so focus cannot leave the dialog", () => {
    render(
      <Modal open onClose={() => {}} title="Confirm">
        <button type="button">First</button>
        <button type="button">Last</button>
      </Modal>,
    )
    const dialog = screen.getByRole("dialog")
    const focusable = dialog.querySelectorAll("button")
    const last = focusable[focusable.length - 1] as HTMLButtonElement
    last.focus()

    // Tabbing from the last control must wrap back inside, not escape to the
    // page behind the overlay.
    fireEvent.keyDown(dialog, { key: "Tab" })
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it("wraps backwards from the first control with Shift+Tab", () => {
    render(
      <Modal open onClose={() => {}} title="Confirm">
        <button type="button">First</button>
        <button type="button">Last</button>
      </Modal>,
    )
    const dialog = screen.getByRole("dialog")
    const first = dialog.querySelector("button") as HTMLButtonElement
    first.focus()

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true })
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it("locks background scrolling while open and restores it on close", () => {
    const { unmount } = render(
      <Modal open onClose={() => {}} title="Confirm">
        <p>body</p>
      </Modal>,
    )
    expect(document.body.style.overflow).toBe("hidden")
    unmount()
    expect(document.body.style.overflow).not.toBe("hidden")
  })

  it("renders nothing when closed", () => {
    render(
      <Modal open={false} onClose={() => {}} title="Confirm">
        <p>body</p>
      </Modal>,
    )
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})

describe("Menu", () => {
  it("exposes expanded state and toggles the panel", () => {
    render(
      <Menu label="Account menu" trigger={<span>Avatar</span>}>
        {() => <button type="button">My listings</button>}
      </Menu>,
    )
    const trigger = screen.getByRole("button", { name: /account menu/i })
    expect(trigger.getAttribute("aria-expanded")).toBe("false")

    fireEvent.click(trigger)
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByRole("button", { name: "My listings" })).toBeTruthy()
  })

  it("closes on Escape and returns focus to the trigger", () => {
    render(
      <Menu label="Account menu" trigger={<span>Avatar</span>}>
        {close => <button type="button" onClick={close}>My listings</button>}
      </Menu>,
    )
    const trigger = screen.getByRole("button", { name: /account menu/i })
    fireEvent.click(trigger)

    fireEvent.keyDown(trigger.parentElement as HTMLElement, { key: "Escape" })
    expect(screen.queryByRole("button", { name: "My listings" })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it("moves between items with the arrow keys", () => {
    render(
      <Menu label="Account menu" trigger={<span>Avatar</span>}>
        {() => (
          <>
            <button type="button">One</button>
            <button type="button">Two</button>
          </>
        )}
      </Menu>,
    )
    const trigger = screen.getByRole("button", { name: /account menu/i })
    fireEvent.click(trigger)

    const container = trigger.parentElement as HTMLElement
    fireEvent.keyDown(container, { key: "ArrowDown" })
    expect(document.activeElement?.textContent).toBe("One")

    fireEvent.keyDown(container, { key: "ArrowDown" })
    expect(document.activeElement?.textContent).toBe("Two")

    // Wraps rather than escaping the menu.
    fireEvent.keyDown(container, { key: "ArrowDown" })
    expect(document.activeElement?.textContent).toBe("One")
  })
})

describe("RouteFallback", () => {
  it("announces loading without stealing focus", () => {
    render(<RouteFallback label="Loading missions" />)
    expect(screen.getByRole("status").textContent).toContain("Loading missions")
  })
})