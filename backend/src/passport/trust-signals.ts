/**
 * Trust signals.
 *
 * These are **facts derived from records the server owns**, not a single
 * opaque score. A number that nobody can explain is a number nobody can
 * audit, so this module produces named, interpretable signals instead, each
 * with the plain-language sentence a member sees and the reason it exists.
 *
 * Two categories are kept strictly apart:
 *
 * - **Observed behaviour** is something that happened and was recorded:
 *   exchanges completed, borrowings returned on time.
 * - **Verified identity** is something a process confirmed: an email address
 *   that was actually verified. The two are never combined, and neither is
 *   ever described as proving who someone is in the real world.
 */

export interface TrustSignal {
  /** Stable identifier, so the UI and the audit trail agree. */
  key: string
  label: string
  /** What the member sees when they ask why they have this. */
  explanation: string
  /** True when the underlying evidence exists right now. */
  earned: boolean
  /** The count behind it, or null when the signal is not countable. */
  count: number | null
}

/** A brand new account with no history. Every badge starts unearned. */
export const DEFAULT_INPUTS: TrustInputs = {
  accountAgeDays: 0,
  emailVerified: false,
  completedExchanges: 0,
  completedBorrowings: 0,
  borrowingsAsLender: 0,
  onTimeReturns: 0,
  completedBorrowingsAsBorrower: 0,
  publishedReviewsReceived: 0,
  distinctCounterparties: 0,
  hasOpenDispute: false,
  accountActive: true
}

export interface TrustInputs {
  accountAgeDays: number
  emailVerified: boolean
  completedExchanges: number
  completedBorrowings: number
  borrowingsAsLender: number
  /** Borrowings returned on or before the due date. */
  onTimeReturns: number
  completedBorrowingsAsBorrower: number
  publishedReviewsReceived: number
  /** Distinct counterparties, so a repeated single partner cannot inflate it. */
  distinctCounterparties: number
  hasOpenDispute: boolean
  /** A suspended or deleted account has every badge withdrawn. */
  accountActive: boolean
}

export const TENURE_BADGE_DAYS = 90
export const EXCHANGE_BADGE_COUNT = 3
export const LENDER_BADGE_COUNT = 2
export const REVIEW_BADGE_COUNT = 3
export const ON_TIME_BADGE_COUNT = 3

/**
 * Builds the signal list.
 *
 * Pure and total: every field has a defined meaning even when it is zero, so
 * a member with no activity sees "not yet" rather than a blank space.
 */
export function trustSignals(inputs: TrustInputs): TrustSignal[] {
  const { accountActive } = inputs
  const signals: TrustSignal[] = [
    {
      key: 'email_verified',
      label: 'Email confirmed',
      explanation:
        'They confirmed they can receive mail at their address. This says nothing about who they are in the real world.',
      earned: accountActive && inputs.emailVerified,
      count: inputs.emailVerified ? 1 : 0
    },
    {
      key: 'established_neighbor',
      label: 'Established neighbor',
      explanation: `Their account has been here for at least ${TENURE_BADGE_DAYS} days.`,
      earned: accountActive && inputs.accountAgeDays >= TENURE_BADGE_DAYS,
      count: inputs.accountAgeDays
    },
    {
      key: 'completed_exchanges',
      label: 'Completed exchanges',
      explanation: `They have completed at least ${EXCHANGE_BADGE_COUNT} marketplace exchanges. Counted once per exchange, from the exchange record itself.`,
      earned: accountActive && inputs.completedExchanges >= EXCHANGE_BADGE_COUNT,
      count: inputs.completedExchanges
    },
    {
      key: 'active_lender',
      label: 'Active lender',
      explanation: `They have lent items to ${LENDER_BADGE_COUNT} or more neighbors.`,
      earned: accountActive && inputs.borrowingsAsLender >= LENDER_BADGE_COUNT,
      count: inputs.borrowingsAsLender
    },
    {
      key: 'reliable_returner',
      label: 'Reliable returner',
      explanation: `They returned borrowed items on time at least ${ON_TIME_BADGE_COUNT} times. Late returns do not count toward this.`,
      earned:
        accountActive &&
        inputs.completedBorrowingsAsBorrower >= ON_TIME_BADGE_COUNT &&
        inputs.onTimeReturns >= ON_TIME_BADGE_COUNT,
      count: inputs.onTimeReturns
    },
    {
      key: 'reviewed_by_neighbors',
      label: 'Reviewed by neighbors',
      explanation: `They have ${REVIEW_BADGE_COUNT} or more published reviews from people they exchanged with. Reviews are only possible after a real completed exchange.`,
      earned: accountActive && inputs.publishedReviewsReceived >= REVIEW_BADGE_COUNT,
      count: inputs.publishedReviewsReceived
    },
    {
      key: 'varied_network',
      label: 'Varied network',
      explanation:
        'They have exchanged with several different neighbors, rather than repeatedly with the same one.',
      earned: accountActive && inputs.distinctCounterparties >= 3,
      count: inputs.distinctCounterparties
    }
  ]

  // An unresolved dispute withdraws the behavioural badges but never the
  // factual ones: the account is still old, the email is still confirmed.
  if (!accountActive || inputs.hasOpenDispute) {
    const withdrawn = new Set([
      'completed_exchanges',
      'active_lender',
      'reliable_returner',
      'reviewed_by_neighbors',
      'varied_network'
    ])
    for (const signal of signals) {
      if (!withdrawn.has(signal.key)) continue
      signal.earned = false
      signal.explanation = inputs.hasOpenDispute
        ? 'Withheld while an issue on this account is unresolved.'
        : 'Not shown for this account.'
    }
  }
  return signals
}

/** Only the earned ones, which is what a public passport shows by default. */
export function earnedSignals(inputs: TrustInputs): TrustSignal[] {
  return trustSignals(inputs).filter(signal => signal.earned)
}

/**
 * A plain-language rating summary.
 *
 * Averages are shown only when there are enough reviews for one to mean
 * anything, and the count is always alongside it, so a single five-star
 * review cannot read as a strong reputation.
 */
export const MINIMUM_RATING_SAMPLE = 3

export interface RatingSummary {
  average: number | null
  count: number
  /** Distribution from 1 to 5, always present so the shape is visible. */
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>
  /** True when there are too few reviews for the average to be meaningful. */
  tooFewToRate: boolean
}

export function ratingSummary(
  reviews: Array<{ rating: number }>
): RatingSummary {
  const distribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
  let total = 0
  for (const review of reviews) {
    const bucket = String(Math.min(5, Math.max(1, Math.round(review.rating)))) as
      | '1'
      | '2'
      | '3'
      | '4'
      | '5'
    distribution[bucket] += 1
    total += review.rating
  }
  const count = reviews.length
  return {
    // Null rather than a number when the sample is too small: inventing a
    // score from two reviews is how reputations get manipulated.
    average: count >= MINIMUM_RATING_SAMPLE ? Math.round((total / count) * 100) / 100 : null,
    count,
    distribution,
    tooFewToRate: count < MINIMUM_RATING_SAMPLE
  }
}

/**
 * How long a member has had their account, in whole days.
 */
export function accountAgeDays(createdAt: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000))
}

/** The public label for a review's role, in the reader's terms. */
export function roleLabel(role: string | null | undefined): string {
  switch (role) {
    case 'lender':
      return 'lent this item'
    case 'borrower':
      return 'borrowed this item'
    case 'seller':
      return 'sold this item'
    case 'buyer':
      return 'bought this item'
    default:
      return 'completed an exchange'
  }
}