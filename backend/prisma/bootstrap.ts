import { PrismaClient } from '@prisma/client'

/**
 * Production reference data: the marketplace categories required for
 * listing and request creation. This bootstrap is deliberately separate
 * from prisma/seed.ts, which loads demo users, listings, messages, and
 * other fixtures that must never be imported into production.
 *
 * Idempotent: repeated runs upsert by category name, preserve existing
 * rows and identifiers, and never modify user-created records.
 */
export const categoryNames = [
  'Furniture',
  'Electronics',
  'Clothing & Accessories',
  'Vehicles',
  'Sports & Outdoors',
  'Toys & Games',
  'Books & Media',
  'Home & Garden',
  'Tools & Equipment',
  'Musical Instruments',
  'Art & Collectibles',
  'Housing',
  'Services',
  'Jobs',
  'Other'
]

export function categorySlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export async function bootstrapCategories(
  prisma: Pick<PrismaClient, 'category'> = new PrismaClient()
) {
  for (const name of categoryNames) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name, slug: categorySlug(name) }
    })
  }
}

if (require.main === module) {
  const prisma = new PrismaClient()
  bootstrapCategories(prisma)
    .then(() => {
      process.stdout.write(`Bootstrapped ${categoryNames.length} categories.\n`)
    })
    .catch(error => {
      process.stderr.write(`Category bootstrap failed: ${String(error)}\n`)
      process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
}
