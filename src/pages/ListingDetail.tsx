import { Button, Icon } from "../components/ui"

interface ListingDetailProps {
  onNavigate: (page: "explore") => void
}

export default function ListingDetail({ onNavigate }: ListingDetailProps) {
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-[#FAFAF7] px-4 py-16">
      <section className="max-w-lg rounded-3xl border border-[#E8E6DF] bg-white p-8 text-center shadow-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0FBF3] text-[#2D6A4F]">
          <Icon name="tag" size={24} />
        </span>
        <h1 className="mt-5 font-display text-2xl font-semibold text-[#1B2A4A]">
          Listing details unavailable
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[#5C6E8A]">
          This link did not include a published listing ID. Prototype listing details are no longer shown as if they were real. Browse the marketplace and open a persisted listing instead.
        </p>
        <Button variant="primary" size="sm" className="mt-6" onClick={() => onNavigate("explore")}>
          <Icon name="search" size={14} />
          Browse listings
        </Button>
      </section>
    </main>
  )
}
