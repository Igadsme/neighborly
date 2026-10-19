import MarketplaceCategory from "./MarketplaceCategory"

const categoryTerms = ["job", "gig", "employment"]

interface JobsProps {
  onNavigate: (
    page: "listing" | "create",
    listingId?: string,
  ) => void
}

export default function Jobs({ onNavigate }: JobsProps) {
  return (
    <MarketplaceCategory
      title="Jobs & gigs"
      description="Browse persisted job and gig marketplace listings. Applications, employer profiles, and hiring workflows are not available."
      categoryTerms={categoryTerms}
      onNavigate={onNavigate}
    />
  )
}
