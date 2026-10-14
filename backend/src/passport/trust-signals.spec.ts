import {
  DEFAULT_INPUTS,
  MINIMUM_RATING_SAMPLE,
  TrustInputs,
  accountAgeDays,
  earnedSignals,
  ratingSummary,
  roleLabel,
  trustSignals
} from './trust-signals'

const NOW = new Date('2026-10-01T12:00:00.000Z')

/**
 * Trust signals are pure, so they are tested without a database. What matters
 * is that they are explainable, that nothing is earned without evidence, and
 * that a reversal actually withdraws the badge rather than merely dimming it.
 */
function inputs(overrides: Partial<TrustInputs> = {}): TrustInputs {
  return { ...DEFAULT_INPUTS, ...overrides }
}

describe('trust signals', () => {
  it('earns nothing for a brand new account', () => {
    expect(earnedSignals(inputs())).toEqual([])
  })

  it('does not claim email verification without a verified address', () => {
    const signals = trustSignals(inputs({ emailVerified: false }))
    expect(signals.find(s => s.key === 'email_verified')?.earned).toBe(false)
    expect(signals.find(s => s.key === 'email_verified')?.explanation).toMatch(/nothing about who they are/i)
  })

  it('earns tenure only past the threshold', () => {
    const signals = trustSignals(inputs({ accountAgeDays: 89 }))
    expect(signals.find(s => s.key === 'established_neighbor')?.earned).toBe(false)
    expect(trustSignals(inputs({ accountAgeDays: 90 })).find(s => s.key === 'established_neighbor')?.earned).toBe(true)
  })

  it('earns the exchange badge only at the real count', () => {
    expect(trustSignals(inputs({ completedExchanges: 2 })).find(s => s.key === 'completed_exchanges')?.earned).toBe(false)
    expect(trustSignals(inputs({ completedExchanges: 3 })).find(s => s.key === 'completed_exchanges')?.earned).toBe(true)
  })

  it('requires completed borrowings before trusting on-time returns', () => {
    const signals = trustSignals(
      inputs({ onTimeReturns: 5, completedBorrowingsAsBorrower: 1 })
    )
    // Three returns cannot be on time if only one borrowing completed.
    expect(signals.find(s => s.key === 'reliable_returner')?.earned).toBe(false)
  })

  it('does not confuse lending with borrowing', () => {
    const lentOnly = trustSignals(inputs({ borrowingsAsLender: 5, completedBorrowingsAsBorrower: 0 }))
    expect(lentOnly.find(s => s.key === 'active_lender')?.earned).toBe(true)
    expect(lentOnly.find(s => s.key === 'reliable_returner')?.earned).toBe(false)
  })

  it('withdraws behavioural badges while an issue is open', () => {
    const signals = trustSignals(
      inputs({
        emailVerified: true,
        accountAgeDays: 400,
        completedExchanges: 10,
        borrowingsAsLender: 5,
        onTimeReturns: 5,
        completedBorrowingsAsBorrower: 5,
        publishedReviewsReceived: 5,
        distinctCounterparties: 8,
        hasOpenDispute: true
      })
    )
    const byKey = new Map(signals.map(signal => [signal.key, signal]))
    expect(byKey.get('completed_exchanges')?.earned).toBe(false)
    expect(byKey.get('active_lender')?.earned).toBe(false)
    expect(byKey.get('reliable_returner')?.earned).toBe(false)
    expect(byKey.get('completed_exchanges')?.explanation).toMatch(/unresolved/i)
    // Factual signals survive: the account is still old and the address is
    // still confirmed.
    expect(byKey.get('email_verified')?.earned).toBe(true)
    expect(byKey.get('established_neighbor')?.earned).toBe(true)
  })

  it('withdraws everything behavioural for a suspended account', () => {
    const signals = trustSignals(
      inputs({ emailVerified: true, completedExchanges: 20, accountAgeDays: 900, accountActive: false })
    )
    expect(signals.filter(signal => signal.earned).map(signal => signal.key)).toEqual([])
  })

  it('gives every signal an explanation, earned or not', () => {
    for (const signal of trustSignals(inputs())) {
      expect(signal.explanation.length).toBeGreaterThan(10)
      expect(signal.label.length).toBeGreaterThan(0)
    }
  })

  it('is deterministic for identical inputs', () => {
    const state = inputs({ emailVerified: true, completedExchanges: 4 })
    expect(trustSignals(state)).toEqual(trustSignals(state))
  })
})

describe('rating summary', () => {
  it('refuses to average a sample that is too small', () => {
    const summary = ratingSummary([{ rating: 5 }, { rating: 5 }])
    expect(summary.average).toBeNull()
    expect(summary.tooFewToRate).toBe(true)
    expect(summary.count).toBe(2)
  })

  it('averages once there are enough reviews to mean anything', () => {
    const summary = ratingSummary([{ rating: 5 }, { rating: 4 }, { rating: 5 }])
    expect(summary.average).toBe(4.67)
    expect(summary.tooFewToRate).toBe(false)
  })

  it('always shows the distribution, so the shape is visible', () => {
    const summary = ratingSummary([{ rating: 1 }, { rating: 5 }, { rating: 5 }, { rating: 3 }])
    expect(summary.distribution).toEqual({ '1': 1, '2': 0, '3': 1, '4': 0, '5': 2 })
  })

  it('handles an empty review list honestly', () => {
    const summary = ratingSummary([])
    expect(summary).toMatchObject({ average: null, count: 0, tooFewToRate: true })
  })

  it('clamps an out-of-range rating rather than losing it', () => {
    expect(ratingSummary([{ rating: 9 }, { rating: 0 }, { rating: 3 }]).count).toBe(3)
  })

  it('uses a published threshold of three', () => {
    expect(MINIMUM_RATING_SAMPLE).toBe(3)
  })
})

describe('account age', () => {
  it('counts whole days and never goes negative', () => {
    expect(accountAgeDays(new Date('2026-09-01T12:00:00.000Z'), NOW)).toBe(30)
    expect(accountAgeDays(NOW, NOW)).toBe(0)
    expect(accountAgeDays(new Date('2026-10-05T12:00:00.000Z'), NOW)).toBe(0)
  })
})

describe('role labels', () => {
  it('describes the exchange in the reader terms', () => {
    expect(roleLabel('lender')).toBe('lent this item')
    expect(roleLabel('borrower')).toBe('borrowed this item')
    expect(roleLabel('seller')).toBe('sold this item')
    expect(roleLabel(null)).toBe('completed an exchange')
    expect(roleLabel(undefined)).toBe('completed an exchange')
  })
})