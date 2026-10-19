import MarketplaceCategory from "./MarketplaceCategory"

const categoryTerms = ["service"]

interface ServicesProps {
  onNavigate: (
    page: "listing" | "create",
    listingId?: string,
  ) => void
}

export default function Services({ onNavigate }: ServicesProps) {
  return (
    <MarketplaceCategory
      title="Services"
      description="Browse persisted service-category marketplace listings. Provider profiles, availability, booking, and background checks are not available."
      categoryTerms={categoryTerms}
      onNavigate={onNavigate}
    />
  )
}
