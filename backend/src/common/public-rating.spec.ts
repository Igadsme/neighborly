import { EMPTY_RATING, toPublicRating } from './public-rating'

describe('toPublicRating', () => {
  it('returns rating null and reviewCount 0 when there are no reviews', () => {
    expect(toPublicRating(0, null)).toEqual(EMPTY_RATING)
    expect(toPublicRating(0, 0)).toEqual({ rating: null, reviewCount: 0 })
    expect(toPublicRating(0, 0).rating).not.toBe(0)
  })

  it('returns the rounded average when published reviews exist', () => {
    expect(toPublicRating(2, 4.5)).toEqual({ rating: 4.5, reviewCount: 2 })
    expect(toPublicRating(3, 4.44)).toEqual({ rating: 4.4, reviewCount: 3 })
  })

  it('keeps the count and drops a non-positive average instead of publishing 0', () => {
    expect(toPublicRating(1, 0)).toEqual({ rating: null, reviewCount: 1 })
    expect(toPublicRating(1, 0).rating).not.toBe(0)
  })
})
