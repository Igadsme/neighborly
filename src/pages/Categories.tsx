import { useCallback, useEffect, useState } from "react"
import { api, ApiError } from "../api/client"
import type { ApiListing } from "../api/types"
import { mapApiListing } from "../api/listing-mapper"
import { Button, Icon, ListingCard, SectionHeader } from "../components/ui"

type Page = "listing" | "explore"

interface CategoriesProps {
  onNavigate: (page: Page, value?: string) => void
}

const categoryEmojis = ["🛋️", "📱", "🔧", "🚲", "🎁", "🏠", "🎨", "📚"]

export default function Categories({ onNavigate }: CategoriesProps) {
  const [categories, setCategories] = useState<
    Array<{ id: string; name: string; slug: string }>
  >([])
  const [listings, setListings] = useState<ApiListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [retryToken, setRetryToken] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [availableCategories, recentListings] = await Promise.all([
        api.categories.list(),
        api.listings.list({ limit: 6, sort: "newest" }),
      ])
      setCategories(availableCategories)
      setListings(recentListings)
    } catch (cause: unknown) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Marketplace categories could not be loaded.",
      )
    } finally {
      setLoading(false)
    }
  }, [retryToken])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="min-h-screen bg-[#FAFAF7] pb-24 md:pb-0">
      <main className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
        <header className="mb-10 text-center">
          <h1 className="mb-3 font-display text-4xl font-semibold text-[#1B2A4A] md:text-5xl">
            Browse by category
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-[#5C6E8A]">
            Explore listings that neighbors have actually published.
          </p>
        </header>

        {error && (
          <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E8694A]/20 bg-[#FFF5F2] p-4 text-sm text-[#C4512D]">
            <span>{error}</span>
            <button onClick={() => setRetryToken((token) => token + 1)} className="font-semibold underline">
              Retry
            </button>
          </div>
        )}

        <section className="mb-12">
          <SectionHeader
            title="Marketplace categories"
            subtitle="Category names come from the Neighborly catalog."
          />
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((item) => (
                <div key={item} className="h-36 animate-pulse rounded-3xl bg-white" />
              ))}
            </div>
          ) : categories.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category, index) => (
                <button
                  key={category.id}
                  onClick={() => onNavigate("explore", category.name)}
                  className="group flex min-h-36 items-center gap-4 rounded-3xl border border-[#E8E6DF] bg-white p-5 text-left transition-all hover:border-[#2D6A4F]/40 hover:shadow-sm"
                >
                  <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-[#F0FBF3] text-3xl">
                    {categoryEmojis[index % categoryEmojis.length]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-lg font-semibold text-[#1B2A4A]">
                      {category.name}
                    </span>
                    <span className="mt-1 block text-sm text-[#8A9AB5]">
                      Browse published listings
                    </span>
                    <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#2D6A4F]">
                      Explore <Icon name="chevronRight" size={11} />
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#E8E6DF] bg-white p-8 text-center text-sm text-[#8A9AB5]">
              No marketplace categories are available.
            </div>
          )}
        </section>

        <section className="mb-12">
          <SectionHeader
            title="Recently listed"
            subtitle="The newest published marketplace inventory"
            action={() => onNavigate("explore")}
            actionLabel="Browse all"
          />
          {loading ? (
            <div className="listing-grid">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="h-64 animate-pulse rounded-2xl bg-white" />
              ))}
            </div>
          ) : listings.length ? (
            <div className="listing-grid">
              {listings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={mapApiListing(listing)}
                  onClick={() => onNavigate("listing", listing.id)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#E8E6DF] bg-white p-8 text-center">
              <p className="text-sm text-[#8A9AB5]">No published listings yet.</p>
              <Button variant="soft" size="xs" className="mt-3" onClick={() => onNavigate("explore")}>
                Explore marketplace
              </Button>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-[#E8E6DF] bg-white p-6 md:p-8">
          <h2 className="font-display text-2xl font-semibold text-[#1B2A4A]">
            Other Neighborly modules
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#5C6E8A]">
            Housing, local services, jobs, community posts, and events do not yet have persisted APIs. They are intentionally not shown as populated categories until published records can be retrieved from the backend.
          </p>
        </section>
      </main>
    </div>
  )
}
