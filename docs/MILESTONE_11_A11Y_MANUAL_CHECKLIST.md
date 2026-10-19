# Manual Screen-Reader Checklist

Milestone 11 verified accessibility with **axe-core (automated)** and **keyboard
navigation (manual, in a real browser)**. No screen-reader session was run.

**Automated results are not a WCAG 2.2 AA conformance claim.** axe-core finds a
bounded set of machine-checkable problems; it cannot tell you whether a screen
reader announces something meaningfully, whether a live region actually speaks,
or whether a focus order makes sense to a person.

This checklist is what remains before that claim could be made.

## How to run it

- macOS: VoiceOver — `Cmd` + `F5` to toggle.
- Browsers to cover: Safari (VoiceOver's default pairing) and Chrome.
- Turn on speech with `Cmd` + `F5`, then navigate with `Ctrl` + `Option` +
  arrow, activate with `Space`.

## Shell and navigation

- [ ] The skip link is the first Tab stop and is announced as "Skip to main
      content".
- [ ] Activating it moves focus into the main landmark, and the next Tab lands
      inside the page content, not back in the header.
- [ ] Each navigation landmark is announced with its name ("Main",
      "Primary", "Account menu").
- [ ] The active page is announced as current, not merely styled differently.
- [ ] The account menu announces its expanded/collapsed state, moves with arrow
      keys, and Escape returns focus to the button that opened it.
- [ ] The unread badge on the message and notification controls is announced as
      a count, not as bare colour or an unlabelled dot.

## Structure

- [ ] Each page announces exactly one `h1`, and the heading levels descend
      without skipping.
- [ ] Landmarks are announced (`main`, `navigation`) and appear only once.

## Missions (the flow most at risk)

- [ ] The mission feed announces the mission title, category, date, and the
      number of places left.
- [ ] Capacity is announced as a count ("5 of 6 places left"), not only as a
      visual bar.
- [ ] After joining, the participation status change is announced without focus
      jumping away from the control.
- [ ] A full mission announces that it is full and that the waitlist is open.
- [ ] The meeting point is **not** announced to a member who has not joined.
- [ ] Organizer-only controls are announced as belonging to the organizer, and
      are absent entirely for a non-organizer.

## Borrow

- [ ] The due date is announced as a full date, not "in 3 days" alone.
- [ ] Borrower actions and lender actions are distinguishable without relying on
      colour or position.
- [ ] Overdue status is announced as text, not only a red badge.
- [ ] The pickup and return confirmation dialogs announce their purpose and
      require an explicit confirmation.

## Forms

- [ ] Every field has a programmatically associated label; the placeholder is
      not the only label.
- [ ] Validation errors are announced, and are associated with their field, so a
      screen reader user is told *which* field failed and why.
- [ ] Required fields are announced as required.
- [ ] Submitting a form announces that it is in progress, and then announces the
      outcome.

## Dynamic content

- [ ] A successful action (listing created, mission joined, message sent) is
      announced through a polite live region.
- [ ] A failure is announced assertively and is actionable, not just "error".
- [ ] Incoming messages do not steal focus while the user is typing.

## Dialogs

- [ ] Opening a dialog moves focus into it and does not leave it behind.
- [ ] Tab and Shift+Tab cycle within the dialog and cannot escape.
- [ ] Escape closes the dialog and focus returns to the triggering control.

## Messaging

- [ ] Unread counts in the conversation list are announced.
- [ ] Message timestamps are announced meaningfully ("2:34 PM", not "2026-10-13
      14:34:00.000Z").
- [ ] Message grouping is conveyed without relying on background colour alone.

## Passport

- [ ] Trust badges state what they mean; the wording matches what the badge
      actually asserts.
- [ ] Verified facts and user-provided information are distinguishable when
      spoken.
- [ ] Verification states are not overstated.

## Recording the result

For each item record: pass / fail / not-applicable, the browser and OS version,
and a short note for anything that fails. A pass on one browser is not a pass on
all of them — VoiceOver's behaviour differs meaningfully between Safari and
Chrome, and both should be run before claiming conformance.