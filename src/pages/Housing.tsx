import MarketplaceCategory from "./MarketplaceCategory"

const categoryTerms = ["housing", "rental", "room"]

interface HousingProps {
  onNavigate: (
    page: "listing" | "create",
    listingId?: string,
  ) => void
}

export default function Housing({ onNavigate }: HousingProps) {
  return (
    <MarketplaceCategory
      title="Housing"
      description="Browse persisted housing-category marketplace listings. Booking, applications, and housing-specific verification are not available."
      categoryTerms={categoryTerms}
      onNavigate={onNavigate}
    />
  )
}
