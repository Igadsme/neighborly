import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const categories = [
  'Furniture', 'Electronics', 'Clothing & Accessories', 'Vehicles', 'Sports & Outdoors',
  'Toys & Games', 'Books & Media', 'Home & Garden', 'Tools & Equipment',
  'Musical Instruments', 'Art & Collectibles', 'Housing', 'Services', 'Jobs', 'Other'
]

async function main() {
  for (const name of categories) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') }
    })
  }
}

main().finally(() => prisma.$disconnect())
