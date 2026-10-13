import { PrismaClient } from '@prisma/client'
import * as argon2 from 'argon2'

/**
 * Milestone 10 browser-verification fixtures.
 *
 * The main seed covers marketplace, housing, jobs, services and community, but
 * not missions, borrow or I Need — the three areas most in need of an
 * authenticated per-screen review. This script fills exactly those gaps with
 * deterministic rows so the browser harness has stable data to assert against.
 *
 * Local fixture password only. Not a production credential.
 * It targets a DISPOSABLE database (neighborly_m10), never the dev database.
 */
const prisma = new PrismaClient()
const SEED_PASSWORD = 'neighborly-local-seed'

const USERS = [
  { key: 'marcus', id: '10000000-0000-4000-8000-000000000001', first: 'Marcus', last: 'Johnson', hood: 'Decatur' },
  { key: 'priya', id: '10000000-0000-4000-8000-000000000002', first: 'Priya', last: 'Patel', hood: 'Inman Park' },
  { key: 'david', id: '10000000-0000-4000-8000-000000000003', first: 'David', last: 'Chen', hood: 'Midtown' },
  { key: 'aaliyah', id: '10000000-0000-4000-8000-000000000004', first: 'Aaliyah', last: 'Williams', hood: 'Buckhead' },
  { key: 'james', id: '10000000-0000-4000-8000-000000000005', first: 'James', last: 'Rivera', hood: 'Grant Park' },
  { key: 'sofia', id: '10000000-0000-4000-8000-000000000006', first: 'Sofia', last: 'Martinez', hood: 'Little Five Points' }
]

const byKey = new Map(USERS.map(u => [u.key, u]))

function at(daysFromNow: number, hour: number) {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  d.setHours(hour, 0, 0, 0)
  return d
}

async function seedUsers(passwordHash: string) {
  for (const u of USERS) {
    const email = `seed.${u.first.toLowerCase()}@example.com`
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: { id: u.id, email, passwordHash, status: 'ACTIVE' }
    })
    await prisma.profile.upsert({
      where: { userId: u.id },
      update: {},
      create: {
        id: u.id.replace('10000000', '11000000'),
        userId: u.id,
        firstName: u.first,
        lastName: u.last,
        displayName: `${u.first} ${u.last}`,
        neighborhood: u.hood,
        city: 'Atlanta',
        state: 'GA'
      }
    })
  }
}

async function seedCategories() {
  const existing = await prisma.category.findMany({ select: { id: true, slug: true } })
  if (existing.length === 0) throw new Error('Run the main seed first: categories are required.')
}

async function seedMissions() {
  // Marcus organises, so the organizer dashboard has real participants.
  const organizer = byKey.get('marcus')!.id
  const missionId = '20000000-0000-4000-8000-000000000001'

  const mission = await prisma.neighborhoodMission.upsert({
    where: { id: missionId },
    update: {},
    create: {
      id: missionId,
      organizerId: organizer,
      title: 'Decatur Park cleanup',
      description:
        'Join neighbours for a morning litter pick and recycling sort. Gloves and bags are provided.',
      category: 'CLEANUP',
      status: 'PUBLISHED',
      neighborhood: 'Decatur',
      city: 'Atlanta',
      meetingPoint: 'Decatur community garden, gate B',
      startAt: at(3, 9),
      endAt: at(3, 12),
      capacity: 6,
      requiresApproval: true
    }
  })

  // One participant confirmed so the organizer view is not empty. The
  // confirmedCount is maintained by the service in real use; the fixture sets
  // it directly and stays inside the capacity check constraint.
  const priya = byKey.get('priya')!.id
  await prisma.missionParticipant.upsert({
    where: { missionId_userId: { missionId: mission.id, userId: priya } },
    update: {},
    create: {
      missionId: mission.id,
      userId: priya,
      status: 'CONFIRMED'
    }
  })
  await prisma.neighborhoodMission.update({
    where: { id: mission.id },
    data: { confirmedCount: 1 }
  })

  // A second, wide-open mission with no meeting point yet, so the feed shows a
  // mission that a member can actually join.
  const sofia = byKey.get('sofia')!.id
  await prisma.neighborhoodMission.upsert({
    where: { id: '20000000-0000-4000-8000-000000000002' },
    update: {},
    create: {
      id: '20000000-0000-4000-8000-000000000002',
      organizerId: sofia,
      title: 'Little Five Points food drive',
      description: 'Collect shelf-stable donations for the local pantry. Drop-off any time Saturday.',
      category: 'DONATION',
      status: 'PUBLISHED',
      neighborhood: 'Little Five Points',
      city: 'Atlanta',
      meetingPoint: null,
      startAt: at(6, 10),
      endAt: at(6, 14),
      capacity: 20
    }
  })

  // A draft, so the organizer dashboard is not the only place missions show.
  await prisma.neighborhoodMission.upsert({
    where: { id: '20000000-0000-4000-8000-000000000003' },
    update: {},
    create: {
      id: '20000000-0000-4000-8000-000000000003',
      organizerId: organizer,
      title: 'Grant Park tree planting (draft)',
      description: 'Not published yet. Organizer-only.',
      category: 'CLEANUP',
      status: 'DRAFT',
      neighborhood: 'Grant Park',
      city: 'Atlanta',
      startAt: at(9, 9),
      endAt: at(9, 12),
      capacity: 12
    }
  })
}

async function seedBorrowableListings() {
  const david = byKey.get('david')!.id
  const aaliyah = byKey.get('aaliyah')!.id

  const existing = await prisma.listing.count({ where: { borrowable: true } })
  if (existing > 0) return

  await prisma.listing.create({
    data: {
      sellerId: david,
      categoryId: (await firstCategory('Home & Garden'))!,
      title: 'Cordless drill set',
      description: '18V drill with two batteries and a charger. Borrowed twice, both times returned clean.',
      priceCents: 0,
      borrowable: true,
      status: 'PUBLISHED',
      neighborhood: 'Midtown',
      city: 'Atlanta',
      condition: 'GOOD',
    }
  })

  await prisma.listing.create({
    data: {
      sellerId: aaliyah,
      categoryId: (await firstCategory('Home & Garden'))!,
      title: 'Extension ladder',
      description: '20 foot aluminium ladder. Please return it dry.',
      priceCents: 0,
      borrowable: true,
      status: 'PUBLISHED',
      neighborhood: 'Buckhead',
      city: 'Atlanta',
      condition: 'FAIR',
    }
  })
}

async function firstCategory(nameFragment: string) {
  const category = await prisma.category.findFirst({
    where: { name: { contains: nameFragment } },
    select: { id: true }
  })
  return category?.id
}

async function seedNeedRequests() {
  const marcus = byKey.get('marcus')!.id
  const david = byKey.get('david')!.id
  const category = await firstCategory('Home')

  // An open request so the feed and My Requests are both non-empty.
  await prisma.needRequest.upsert({
    where: { id: '30000000-0000-4000-8000-000000000001' },
    update: {},
    create: {
      id: '30000000-0000-4000-8000-000000000001',
      requesterId: marcus,
      categoryId: category!,
      title: 'Looking for a ladder, any height',
      description: 'Need to reach a gutter this weekend. Happy to collect from Midtown or Decatur.',
      budgetCents: 3000,
      budgetFlexible: true,
      neighborhood: 'Decatur',
      city: 'Atlanta',
      radiusMiles: 5,
      deadline: at(5, 18),
      status: 'PUBLISHED',
      mode: 'BORROW'
    }
  })

  // A second request owned by someone else, so an offer can be made against it.
  await prisma.needRequest.upsert({
    where: { id: '30000000-0000-4000-8000-000000000002' },
    update: {},
    create: {
      id: '30000000-0000-4000-8000-000000000002',
      requesterId: david,
      categoryId: category!,
      title: 'Someone with a drill I can borrow',
      description: 'Putting up shelves. Happy to return the same day.',
      budgetFlexible: true,
      neighborhood: 'Midtown',
      city: 'Atlanta',
      radiusMiles: 5,
      deadline: at(4, 18),
      status: 'PUBLISHED',
      mode: 'BORROW'
    }
  })
}

async function main() {
  // The guard exists so this script can never be pointed at a real database.
  // Both names are disposable, per-milestone databases this repository creates
  // for local and end-to-end verification.
  const disposable = /neighborly_m1[01](\?|$)/.test(process.env.DATABASE_URL ?? '')
  if (!disposable) {
    throw new Error(
      'Refusing to run: DATABASE_URL must point at a disposable ' +
        'neighborly_m10 or neighborly_m11 database. ' +
        `Got: ${process.env.DATABASE_URL}`
    )
  }
  const passwordHash = await argon2.hash(SEED_PASSWORD)
  await seedUsers(passwordHash)
  await seedCategories()
  await seedMissions()
  await seedBorrowableListings()
  await seedNeedRequests()

  const counts = {
    users: await prisma.user.count(),
    missions: await prisma.neighborhoodMission.count(),
    borrowableListings: await prisma.listing.count({ where: { borrowable: true } }),
    needRequests: await prisma.needRequest.count()
  }
  process.stdout.write(`Milestone 10 fixtures ready: ${JSON.stringify(counts)}\n`)
}

main()
  .catch(error => {
    process.stderr.write(`${error.stack || error}\n`)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())