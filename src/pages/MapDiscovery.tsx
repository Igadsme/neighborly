import { Button, Icon } from "../components/ui"

interface MapDiscoveryProps {
  onNavigate: (page: "explore") => void
}

export default function MapDiscovery({ onNavigate }: MapDiscoveryProps) {
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-[#FAFAF7] px-4 py-16">
      <section className="max-w-xl rounded-3xl border border-[#E8E6DF] bg-white p-8 text-center shadow-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#DDEEFF] text-[#4A7FB5]">
          <Icon name="map" size={24} />
        </span>
        <h1 className="mt-5 font-display text-2xl font-semibold text-[#1B2A4A]">
          Map discovery is not configured
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[#5C6E8A]">
          Map tiles, geospatial search, radius matching, and safe-meetup locations are not connected. Neighborly will not show simulated map pins or imply that a location has been verified.
        </p>
        <Button variant="primary" size="sm" className="mt-6" onClick={() => onNavigate("explore")}>
          <Icon name="search" size={14} />
          Search published listings
        </Button>
      </section>
    </main>
  )
}
