/**
 * A rating is shown only when both numbers came from the API and describe
 * at least one review. Null, omitted fields, and a zero count are the same
 * case: there is nothing to display.
 */
export function hasDisplayableRating(
  rating: number | null | undefined,
  reviewCount: number | null | undefined,
): rating is number {
  return (
    typeof rating === "number" &&
    Number.isFinite(rating) &&
    rating > 0 &&
    typeof reviewCount === "number" &&
    Number.isFinite(reviewCount) &&
    reviewCount > 0
  )
}

export function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}
