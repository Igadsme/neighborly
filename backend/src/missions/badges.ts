/**
 * Community badges.
 *
 * A badge is a claim, and a claim has to be narrower than the member would
 * like. Nothing here is monetary, redeemable, or convertible, and nothing here
 * is awarded for showing up in an app: every badge below is earned only by
 * participation whose attendance was confirmed by someone other than the
 * person being credited.
 *
 * The catalogue is declared once and seeded, so a badge's wording cannot drift
 * between the passport that shows it and the code that awards it.
 */

export interface BadgeDefinition {
  code: string
  label: string
  description: string
  /** Shown to a member who asks what they are holding. */
  explanation: string
  sortOrder: number
}

export const FIRST_MISSION_VERIFIED = 1
export const COMMUNITY_BUILDER_VERIFIED = 3
export const NEIGHBORHOOD_ANCHOR_VERIFIED = 10
/** Completed borrowings as lender, which is real lending rather than joining. */
export const GENEROUS_LENDER_LENDINGS = 3

export const COMMUNITY_BADGES: BadgeDefinition[] = [
  {
    code: 'FIRST_HELPER',
    label: 'First verified helper',
    description: 'Verified attendance at one neighborhood mission.',
    explanation:
      'A moderator or the organizing neighbor confirmed you were present at one mission that was actually completed. Clicking Join was never enough.',
    sortOrder: 10
  },
  {
    code: 'COMMUNITY_BUILDER',
    label: 'Community builder',
    description: 'Verified attendance at three neighborhood missions.',
    explanation:
      'You have confirmed attendance at three separate missions. Three is where showing up stops being luck.',
    sortOrder: 20
  },
  {
    code: 'NEIGHBORHOOD_ANCHOR',
    label: 'Neighborhood anchor',
    description: 'Verified attendance at ten neighborhood missions.',
    explanation:
      'Ten confirmed missions. This is a record of time spent, not an estimate of impact, and Neighborly makes no claim beyond the count.',
    sortOrder: 30
  },
  {
    code: 'GENEROUS_LENDER',
    label: 'Generous lender',
    description: 'Completed three Neighborly Borrow loans as the lender.',
    explanation:
      'You have lent items to three neighbors and all three borrowings were completed. This counts lending, not borrowing.',
    sortOrder: 40
  }
]

/**
 * Which badges a member's verified record earns.
 *
 * Pure, so the thresholds are testable without a database and so the same
 * function decides both the award and the passport projection.
 */
export function badgesForRecord(record: {
  verifiedMissions: number
  completedLendings: number
}): string[] {
  const earned: string[] = []
  if (record.verifiedMissions >= FIRST_MISSION_VERIFIED) earned.push('FIRST_HELPER')
  if (record.verifiedMissions >= COMMUNITY_BUILDER_VERIFIED) earned.push('COMMUNITY_BUILDER')
  if (record.verifiedMissions >= NEIGHBORHOOD_ANCHOR_VERIFIED) earned.push('NEIGHBORHOOD_ANCHOR')
  if (record.completedLendings >= GENEROUS_LENDER_LENDINGS) earned.push('GENEROUS_LENDER')
  return earned
}