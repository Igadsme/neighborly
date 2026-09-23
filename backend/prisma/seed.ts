import { PrismaClient } from '@prisma/client'
import * as argon2 from 'argon2'

const prisma = new PrismaClient()

// Local fixture password only. Not a production credential.
const SEED_PASSWORD = 'neighborly-local-seed'

const categories = [
  'Furniture', 'Electronics', 'Clothing & Accessories', 'Vehicles', 'Sports & Outdoors',
  'Toys & Games', 'Books & Media', 'Home & Garden', 'Tools & Equipment',
  'Musical Instruments', 'Art & Collectibles', 'Housing', 'Services', 'Jobs', 'Other'
]

const users = {
  marcus: person('10000000-0000-4000-8000-000000000001', 'Marcus', 'Johnson', 'Decatur'),
  priya: person('10000000-0000-4000-8000-000000000002', 'Priya', 'Patel', 'Inman Park'),
  david: person('10000000-0000-4000-8000-000000000003', 'David', 'Chen', 'Midtown'),
  aaliyah: person('10000000-0000-4000-8000-000000000004', 'Aaliyah', 'Williams', 'Buckhead'),
  james: person('10000000-0000-4000-8000-000000000005', 'James', 'Rivera', 'Grant Park'),
  sofia: person('10000000-0000-4000-8000-000000000006', 'Sofia', 'Martinez', 'Little Five Points'),
  tyler: person('10000000-0000-4000-8000-000000000007', 'Tyler', 'Brooks', 'East Atlanta'),
  nadia: person('10000000-0000-4000-8000-000000000008', 'Nadia', 'Okonkwo', 'Westside'),
  rosa: person('10000000-0000-4000-8000-000000000009', 'Rosa', 'Mendez', 'Decatur')
}

function person(id: string, firstName: string, lastName: string, neighborhood: string) {
  return {
    id,
    profileId: id.replace('10000000', '11000000'),
    email: `seed.${firstName.toLowerCase()}@example.com`,
    firstName,
    lastName,
    neighborhood
  }
}

function at(iso: string) {
  return new Date(iso)
}

async function seedUsers(passwordHash: string) {
  for (const user of Object.values(users)) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: { id: user.id, email: user.email, passwordHash, status: 'ACTIVE' }
    })
    await prisma.profile.upsert({
      where: { userId: user.id },
      update: {
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: `${user.firstName} ${user.lastName}`,
        neighborhood: user.neighborhood,
        city: 'Atlanta',
        state: 'GA'
      },
      create: {
        id: user.profileId,
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: `${user.firstName} ${user.lastName}`,
        neighborhood: user.neighborhood,
        city: 'Atlanta',
        state: 'GA'
      }
    })
  }
}

async function seedHousing() {
  const rows = [
    {
      id: '20000000-0000-4000-8000-000000000001',
      ownerId: users.priya.id,
      title: 'Sunny 2BR/1BA in Inman Park — Steps to BeltLine',
      description: 'Bright two-bedroom apartment a short walk from the BeltLine. Hardwood floors, updated kitchen, and a small balcony.',
      propertyType: 'Apartment',
      listingType: 'rent',
      priceCents: 185000,
      priceUnit: '/mo',
      beds: 2,
      baths: 1,
      sqft: 920,
      neighborhood: 'Inman Park',
      available: 'Oct 1, 2026',
      lease: '12 months',
      pets: true,
      furnished: false,
      utilities: 'Water included',
      verified: true,
      latitude: 33.761,
      longitude: -84.363,
      createdAt: at('2026-09-22T12:00:00.000Z'),
      images: ['photo-1560448204-e02f11c3d0e2', 'photo-1502672260266-1c1ef2d93688']
    },
    {
      id: '20000000-0000-4000-8000-000000000002',
      ownerId: users.david.id,
      title: 'Modern Studio in Midtown with Rooftop Access',
      description: 'Furnished studio with rooftop access, in-unit laundry, and a quick walk to MARTA.',
      propertyType: 'Studio',
      listingType: 'rent',
      priceCents: 135000,
      priceUnit: '/mo',
      beds: 0,
      baths: 1,
      sqft: 550,
      neighborhood: 'Midtown',
      available: 'Immediately',
      lease: '6 or 12 months',
      pets: false,
      furnished: true,
      utilities: 'All utilities included',
      verified: true,
      latitude: 33.781,
      longitude: -84.383,
      createdAt: at('2026-09-23T09:00:00.000Z'),
      images: ['photo-1522708323590-d24dbb6b0267', 'photo-1484154218962-a197022b5858']
    },
    {
      id: '20000000-0000-4000-8000-000000000003',
      ownerId: users.aaliyah.id,
      title: '3BR/2BA Craftsman Bungalow For Sale — Grant Park',
      description: 'Renovated craftsman bungalow with a front porch, fenced yard, and a two-car driveway off the park.',
      propertyType: 'House',
      listingType: 'sale',
      priceCents: 48500000,
      priceUnit: null,
      beds: 3,
      baths: 2,
      sqft: 1620,
      neighborhood: 'Grant Park',
      available: 'Oct 15, 2026',
      lease: 'N/A',
      pets: true,
      furnished: false,
      utilities: 'N/A',
      verified: true,
      latitude: 33.737,
      longitude: -84.369,
      createdAt: at('2026-09-18T12:00:00.000Z'),
      images: ['photo-1568605114967-8130f3a36994', 'photo-1449844908441-8829872d2607']
    },
    {
      id: '20000000-0000-4000-8000-000000000004',
      ownerId: users.marcus.id,
      title: 'Private Room in Shared House — Decatur, Near MARTA',
      description: 'Furnished private room in a quiet shared house. Shared kitchen and a ten-minute walk to the Decatur station.',
      propertyType: 'Room',
      listingType: 'rent',
      priceCents: 75000,
      priceUnit: '/mo',
      beds: 1,
      baths: 1,
      sqft: 0,
      neighborhood: 'Decatur',
      available: 'Sep 25, 2026',
      lease: 'Month-to-month',
      pets: false,
      furnished: true,
      utilities: 'All included',
      verified: false,
      latitude: 33.775,
      longitude: -84.296,
      createdAt: at('2026-09-21T12:00:00.000Z'),
      images: ['photo-1631049307264-da0ec9d70304', 'photo-1540518614846-7eded433c457']
    },
    {
      id: '20000000-0000-4000-8000-000000000005',
      ownerId: users.aaliyah.id,
      title: 'Luxury 1BR Condo in Buckhead — Concierge, Pool, Gym',
      description: 'One-bedroom condo with concierge, pool, and gym. Resident pays utilities. Cats and small dogs welcome.',
      propertyType: 'Condo',
      listingType: 'rent',
      priceCents: 220000,
      priceUnit: '/mo',
      beds: 1,
      baths: 1,
      sqft: 780,
      neighborhood: 'Buckhead',
      available: 'Oct 1, 2026',
      lease: '12 months',
      pets: true,
      furnished: false,
      utilities: 'Resident pays utilities',
      verified: true,
      latitude: 33.839,
      longitude: -84.379,
      createdAt: at('2026-09-16T12:00:00.000Z'),
      images: ['photo-1606744824163-985d376605aa', 'photo-1554995207-c18c203602cb']
    },
    {
      id: '20000000-0000-4000-8000-000000000006',
      ownerId: users.nadia.id,
      title: 'Sublet: 2BR in Westside — Sept through Dec',
      description: 'Furnished two-bedroom sublet through December. Walkable to the Westside Trail. No pets for this short stay.',
      propertyType: 'Sublet',
      listingType: 'rent',
      priceCents: 160000,
      priceUnit: '/mo',
      beds: 2,
      baths: 1,
      sqft: 875,
      neighborhood: 'Westside',
      available: 'Sep 20, 2026',
      lease: '3 months',
      pets: false,
      furnished: true,
      utilities: 'All included',
      verified: false,
      latitude: 33.77,
      longitude: -84.42,
      createdAt: at('2026-09-19T12:00:00.000Z'),
      images: ['photo-1493809842364-78817add7ffb', 'photo-1507089947368-19c1da9775ae']
    }
  ]

  for (const [housingIndex, row] of rows.entries()) {
    const { id, images, ...data } = row
    await prisma.housingListing.upsert({
      where: { id },
      update: { ...data, city: 'Atlanta', status: 'PUBLISHED', deletedAt: null },
      create: { id, ...data, city: 'Atlanta', status: 'PUBLISHED' }
    })
    for (const [sortOrder, objectKey] of images.entries()) {
      const imageId = `21000000-0000-4000-8000-${(housingIndex * 10 + sortOrder + 1).toString(16).padStart(12, '0')}`
      await prisma.housingImage.upsert({
        where: { id: imageId },
        update: { objectKey, sortOrder, housingId: id },
        create: { id: imageId, housingId: id, objectKey, sortOrder }
      })
    }
  }
}

async function seedJobs() {
  const rows = [
    {
      id: '30000000-0000-4000-8000-000000000001',
      ownerId: users.tyler.id,
      title: 'Full-Stack Engineer',
      company: 'PeachTech Solutions',
      logoKey: 'photo-1611162617474-5b21e879e113',
      description: 'PeachTech is hiring a full-stack engineer for a hybrid Midtown team. You will ship product features in React and Node against PostgreSQL.',
      responsibilities: ['Lead feature work with a focus on quality', 'Collaborate with product and design', 'Review code and mentor newer engineers'],
      employmentType: 'Full-time',
      level: 'Mid-Senior',
      salary: '$110k–$145k',
      location: 'Midtown Atlanta',
      remote: 'Hybrid',
      deadline: 'Rolling',
      verified: true,
      tags: ['React', 'Node.js', 'PostgreSQL'],
      createdAt: at('2026-09-21T12:00:00.000Z')
    },
    {
      id: '30000000-0000-4000-8000-000000000002',
      ownerId: users.priya.id,
      title: 'Barista + Shift Supervisor',
      company: 'Revelator Coffee Co.',
      logoKey: 'photo-1495474472287-4d71bcdd2085',
      description: 'Revelator Coffee is hiring a part-time barista and shift supervisor for the Inman Park cafe. On-site shifts, including weekends.',
      responsibilities: ['Open and close the cafe', 'Train new baristas', 'Keep the bar and lobby guest-ready'],
      employmentType: 'Part-time',
      level: 'Entry',
      salary: '$16–$19/hr',
      location: 'Inman Park',
      remote: 'On-site',
      deadline: 'Oct 1, 2026',
      verified: true,
      tags: ['Coffee', 'Customer Service', 'Food & Bev'],
      createdAt: at('2026-09-22T12:00:00.000Z')
    },
    {
      id: '30000000-0000-4000-8000-000000000003',
      ownerId: users.sofia.id,
      title: 'Freelance Graphic Designer',
      company: 'Multiple clients',
      logoKey: 'photo-1626785774573-4b799315345d',
      description: 'Ongoing freelance design work for Atlanta brands. Remote, project-based, with branding, print, and digital deliverables.',
      responsibilities: ['Design brand and campaign assets', 'Prepare print and digital files', 'Join short client reviews'],
      employmentType: 'Freelance',
      level: 'Mid',
      salary: '$45–$75/hr',
      location: 'Remote',
      remote: 'Remote',
      deadline: 'Rolling',
      verified: false,
      tags: ['Figma', 'Branding', 'Print', 'Digital'],
      createdAt: at('2026-09-23T08:00:00.000Z')
    },
    {
      id: '30000000-0000-4000-8000-000000000004',
      ownerId: users.marcus.id,
      title: 'Licensed Electrician (Residential)',
      company: 'Atlanta Power Pros',
      logoKey: 'photo-1621905252507-b35492cc74b4',
      description: 'Atlanta Power Pros needs a licensed residential electrician for on-site work around Buckhead and intown neighborhoods.',
      responsibilities: ['Complete residential service calls', 'Pull permits when required', 'Leave job sites clean and labeled'],
      employmentType: 'Full-time',
      level: 'Journeyman',
      salary: '$65k–$90k',
      location: 'Buckhead',
      remote: 'On-site',
      deadline: 'Rolling',
      verified: true,
      tags: ['Electrical', 'Construction', 'Residential'],
      createdAt: at('2026-09-20T12:00:00.000Z')
    },
    {
      id: '30000000-0000-4000-8000-000000000005',
      ownerId: users.david.id,
      title: 'Marketing Coordinator',
      company: 'Southside Spirits',
      logoKey: 'photo-1567958451986-2de427a4a0be',
      description: 'Southside Spirits is hiring a marketing coordinator in West Midtown. Hybrid schedule with social, content, and event support.',
      responsibilities: ['Draft social and email content', 'Help staff neighborhood events', 'Track campaign results'],
      employmentType: 'Full-time',
      level: 'Entry-Mid',
      salary: '$48k–$58k',
      location: 'West Midtown',
      remote: 'Hybrid',
      deadline: 'Sep 30, 2026',
      verified: true,
      tags: ['Marketing', 'Social Media', 'Content'],
      createdAt: at('2026-09-16T12:00:00.000Z')
    }
  ]

  for (const row of rows) {
    const { id, ...data } = row
    await prisma.jobListing.upsert({
      where: { id },
      update: { ...data, status: 'PUBLISHED', deletedAt: null },
      create: { id, ...data, status: 'PUBLISHED' }
    })
  }

  await prisma.jobApplication.upsert({
    where: { jobId_applicantId: { jobId: '30000000-0000-4000-8000-000000000002', applicantId: users.david.id } },
    update: { message: 'I can cover weekend opening shifts.' },
    create: {
      id: '31000000-0000-4000-8000-000000000001',
      jobId: '30000000-0000-4000-8000-000000000002',
      applicantId: users.david.id,
      message: 'I can cover weekend opening shifts.'
    }
  })

  await prisma.jobSave.upsert({
    where: { userId_jobId: { userId: users.marcus.id, jobId: '30000000-0000-4000-8000-000000000003' } },
    update: {},
    create: { userId: users.marcus.id, jobId: '30000000-0000-4000-8000-000000000003' }
  })
}

async function seedServices() {
  const rows = [
    {
      id: '40000000-0000-4000-8000-000000000001',
      ownerId: users.rosa.id,
      title: 'House Cleaning',
      businessName: "Rosa's Spotless Cleaning",
      description: 'Deep cleans, move-in and move-out cleans, and weekly upkeep for Decatur homes.',
      category: 'Cleaning',
      startingPriceCents: 8900,
      location: 'Decatur & Surrounding',
      availability: 'Mon–Sat',
      tags: ['Deep Clean', 'Move-In/Out', 'Weekly'],
      imageKey: 'photo-1527515545081-5db817172677',
      backgroundCheck: true,
      rating: 4.9,
      reviewCount: 142,
      createdAt: at('2026-09-20T12:00:00.000Z')
    },
    {
      id: '40000000-0000-4000-8000-000000000002',
      ownerId: users.james.id,
      title: 'Moving Help',
      businessName: 'ATL Strong Movers',
      description: 'Local moves, loading help, and packing for metro Atlanta apartments and houses.',
      category: 'Moving',
      startingPriceCents: 12000,
      location: 'Metro Atlanta',
      availability: 'Weekends',
      tags: ['Local Moves', 'Loading/Unloading', 'Packing'],
      imageKey: 'photo-1558618047-3c4f7f7f7b43',
      backgroundCheck: true,
      rating: 4.8,
      reviewCount: 98,
      createdAt: at('2026-09-19T12:00:00.000Z')
    },
    {
      id: '40000000-0000-4000-8000-000000000003',
      ownerId: users.david.id,
      title: 'Math & Science Tutoring',
      businessName: 'Tutor with David C.',
      description: 'K-12 math and science tutoring, SAT prep, calculus, and physics. Online or in Midtown.',
      category: 'Tutoring',
      startingPriceCents: 5500,
      location: 'Online or Midtown',
      availability: 'Evenings & Weekends',
      tags: ['K-12', 'SAT Prep', 'Calculus', 'Physics'],
      imageKey: 'photo-1434030216411-0b793f4b4173',
      backgroundCheck: false,
      rating: 5,
      reviewCount: 36,
      createdAt: at('2026-09-18T12:00:00.000Z')
    },
    {
      id: '40000000-0000-4000-8000-000000000004',
      ownerId: users.sofia.id,
      title: 'Photography',
      businessName: 'Sofia Captures',
      description: 'Portraits, events, and real-estate photos. Based in Inman Park and willing to travel intown.',
      category: 'Photography',
      startingPriceCents: 25000,
      location: 'Inman Park & Beyond',
      availability: 'Flexible',
      tags: ['Portraits', 'Events', 'Real Estate'],
      imageKey: 'photo-1542038784456-1ea8e935640e',
      backgroundCheck: false,
      rating: 4.9,
      reviewCount: 74,
      createdAt: at('2026-09-17T12:00:00.000Z')
    },
    {
      id: '40000000-0000-4000-8000-000000000005',
      ownerId: users.marcus.id,
      title: 'Lawn Care & Landscaping',
      businessName: 'Green Acres ATL',
      description: 'Mowing, mulching, pruning, and seasonal cleanup for Decatur and East Atlanta yards.',
      category: 'Lawn Care',
      startingPriceCents: 6500,
      location: 'Decatur + East ATL',
      availability: 'Tue–Sat',
      tags: ['Mowing', 'Mulching', 'Pruning', 'Cleanup'],
      imageKey: 'photo-1416879595882-3373a0480b5b',
      backgroundCheck: true,
      rating: 4.7,
      reviewCount: 55,
      createdAt: at('2026-09-16T12:00:00.000Z')
    },
    {
      id: '40000000-0000-4000-8000-000000000006',
      ownerId: users.tyler.id,
      title: 'Computer Repair & IT Help',
      businessName: 'Byte Fixers',
      description: 'Mac and PC repair, virus removal, new-device setup, and data recovery. East Atlanta shop and house calls.',
      category: 'Tech Help',
      startingPriceCents: 4500,
      location: 'East Atlanta',
      availability: 'Mon–Fri',
      tags: ['Mac & PC', 'Virus Removal', 'Setup', 'Data Recovery'],
      imageKey: 'photo-1517336714731-489689fd1ca8',
      backgroundCheck: false,
      rating: 4.6,
      reviewCount: 28,
      createdAt: at('2026-09-15T12:00:00.000Z')
    }
  ]

  for (const row of rows) {
    const { id, ...data } = row
    await prisma.serviceListing.upsert({
      where: { id },
      update: { ...data, status: 'PUBLISHED', deletedAt: null },
      create: { id, ...data, status: 'PUBLISHED' }
    })
  }

  await prisma.serviceQuote.upsert({
    where: { id: '41000000-0000-4000-8000-000000000001' },
    update: { status: 'PENDING', address: '42 Example Avenue, Decatur' },
    create: {
      id: '41000000-0000-4000-8000-000000000001',
      serviceId: '40000000-0000-4000-8000-000000000001',
      requesterId: users.david.id,
      preferredDate: '2026-10-03',
      preferredTime: '10:00 AM',
      notes: '2BR apartment, deep clean needed before move-in.',
      address: '42 Example Avenue, Decatur',
      status: 'PENDING'
    }
  })

  await prisma.serviceQuote.upsert({
    where: { id: '41000000-0000-4000-8000-000000000002' },
    update: { status: 'ACCEPTED', address: '18 Example Lane, Inman Park' },
    create: {
      id: '41000000-0000-4000-8000-000000000002',
      serviceId: '40000000-0000-4000-8000-000000000002',
      requesterId: users.priya.id,
      preferredDate: '2026-10-04',
      preferredTime: '8:00 AM',
      notes: 'One-bedroom load and unload, third-floor walkup.',
      address: '18 Example Lane, Inman Park',
      status: 'ACCEPTED'
    }
  })
}

async function seedCommunity() {
  const posts = [
    {
      id: '50000000-0000-4000-8000-000000000001',
      authorId: users.priya.id,
      type: 'discussion',
      title: "Best farmer's markets this weekend?",
      body: 'Heading to a few markets with the kids — anyone know which ones are worth it this time of year? We love the Decatur one but wondering if there are other good options nearby.',
      neighborhood: 'Inman Park',
      createdAt: at('2026-09-23T10:00:00.000Z')
    },
    {
      id: '50000000-0000-4000-8000-000000000002',
      authorId: users.aaliyah.id,
      type: 'announcement',
      title: 'Road closure: Ponce de Leon Ave this Friday 8am–6pm',
      body: 'Ponce will be closed from Highland to N. Highland for utility work. Plan alternate routes if you are commuting through Midtown Friday.',
      neighborhood: 'Midtown',
      createdAt: at('2026-09-23T07:00:00.000Z')
    },
    {
      id: '50000000-0000-4000-8000-000000000003',
      authorId: users.marcus.id,
      type: 'lost_found',
      title: 'Found: Black Lab mix near Candler Park dog park',
      body: 'Found a friendly black Lab/shepherd mix near the Candler Park dog park around 4pm. No collar, but well cared for. Message me if this is your dog.',
      neighborhood: 'Decatur',
      createdAt: at('2026-09-23T09:00:00.000Z')
    },
    {
      id: '50000000-0000-4000-8000-000000000004',
      authorId: users.sofia.id,
      type: 'recommendation',
      title: 'Highly recommend Patel Auto Repair on Memorial Dr',
      body: 'Had a great experience getting my brakes done last week. Fair prices, no upselling, done on time. They have been in the neighborhood for 20+ years.',
      neighborhood: 'Little Five Points',
      createdAt: at('2026-09-22T12:00:00.000Z')
    },
    {
      id: '50000000-0000-4000-8000-000000000005',
      authorId: users.nadia.id,
      type: 'event',
      title: 'Westside Neighborhood Cleanup — Sat Sep 20, 9am',
      body: 'Join the quarterly cleanup along the Westside Trail. Gloves and bags provided. Coffee and donuts after.',
      neighborhood: 'Westside',
      createdAt: at('2026-09-21T12:00:00.000Z')
    },
    {
      id: '50000000-0000-4000-8000-000000000006',
      authorId: users.james.id,
      type: 'giveaway',
      title: 'Free: 20+ potted plants — must take all',
      body: 'Moving next week and cannot take all the plants. Mix of succulents, pothos, snake plants, and a fiddle leaf fig. Pickup Saturday morning.',
      neighborhood: 'Grant Park',
      createdAt: at('2026-09-23T06:00:00.000Z')
    }
  ]

  for (const post of posts) {
    const { id, ...data } = post
    await prisma.communityPost.upsert({
      where: { id },
      update: { ...data, city: 'Atlanta', status: 'PUBLISHED', deletedAt: null },
      create: { id, ...data, city: 'Atlanta', status: 'PUBLISHED' }
    })
  }

  await prisma.communityReaction.upsert({
    where: { postId_userId: { postId: posts[0].id, userId: users.david.id } },
    update: { emoji: '👍' },
    create: { postId: posts[0].id, userId: users.david.id, emoji: '👍' }
  })

  await prisma.communityComment.upsert({
    where: { id: '50100000-0000-4000-8000-000000000001' },
    update: { body: 'The East Atlanta market was great last Saturday.' },
    create: {
      id: '50100000-0000-4000-8000-000000000001',
      postId: posts[0].id,
      authorId: users.marcus.id,
      body: 'The East Atlanta market was great last Saturday.'
    }
  })

  const events = [
    {
      id: '51000000-0000-4000-8000-000000000001',
      organizerId: users.nadia.id,
      title: 'Westside Neighborhood Cleanup',
      description: 'Quarterly cleanup along the Westside Trail. Gloves, bags, coffee, and donuts.',
      neighborhood: 'Westside',
      dateLabel: 'Sat Sep 20',
      timeLabel: '9:00 AM',
      imageKey: 'photo-1566438480900-0609be27a4be',
      createdAt: at('2026-09-18T12:00:00.000Z')
    },
    {
      id: '51000000-0000-4000-8000-000000000002',
      organizerId: users.priya.id,
      title: "East ATL Farmer's Market",
      description: 'Saturday market with produce, bread, and flowers.',
      neighborhood: 'East Atlanta',
      dateLabel: 'Sat Sep 20',
      timeLabel: '8:00 AM',
      imageKey: 'photo-1488459716781-31db52582fe9',
      createdAt: at('2026-09-18T13:00:00.000Z')
    },
    {
      id: '51000000-0000-4000-8000-000000000003',
      organizerId: users.aaliyah.id,
      title: 'Decatur Book Festival',
      description: 'Authors, kids’ tent, and bookstore tables around the square.',
      neighborhood: 'Decatur Square',
      dateLabel: 'Sat–Sun Sep 21–22',
      timeLabel: '10:00 AM',
      imageKey: 'photo-1481627834876-b7833e8f5570',
      createdAt: at('2026-09-18T14:00:00.000Z')
    },
    {
      id: '51000000-0000-4000-8000-000000000004',
      organizerId: users.sofia.id,
      title: 'Little Five Points Halloween Parade',
      description: 'Evening parade through Little Five Points. Costumes encouraged.',
      neighborhood: 'L5P',
      dateLabel: 'Fri Oct 4',
      timeLabel: '7:00 PM',
      imageKey: 'photo-1492684223066-81342ee5ff30',
      createdAt: at('2026-09-18T15:00:00.000Z')
    }
  ]

  for (const event of events) {
    const { id, ...data } = event
    await prisma.communityEvent.upsert({
      where: { id },
      update: { ...data, city: 'Atlanta', status: 'PUBLISHED', deletedAt: null },
      create: { id, ...data, city: 'Atlanta', status: 'PUBLISHED' }
    })
  }

  await prisma.communityEventRsvp.upsert({
    where: { eventId_userId: { eventId: events[0].id, userId: users.marcus.id } },
    update: {},
    create: { eventId: events[0].id, userId: users.marcus.id }
  })

  const lost = [
    {
      id: '52000000-0000-4000-8000-000000000001',
      authorId: users.marcus.id,
      kind: 'lost',
      item: 'Black Lab mix, answers to Scout',
      neighborhood: 'Candler Park',
      imageKey: 'photo-1587300003388-59208cc962cb',
      createdAt: at('2026-09-23T09:00:00.000Z')
    },
    {
      id: '52000000-0000-4000-8000-000000000002',
      authorId: users.priya.id,
      kind: 'found',
      item: 'Pair of AirPods Pro, gold case found at Ponce City Market',
      neighborhood: 'Midtown',
      imageKey: 'photo-1505740420928-5e560c06d30e',
      createdAt: at('2026-09-22T12:00:00.000Z')
    },
    {
      id: '52000000-0000-4000-8000-000000000003',
      authorId: users.sofia.id,
      kind: 'lost',
      item: 'Set of Toyota car keys with green keychain',
      neighborhood: 'Inman Park',
      imageKey: 'photo-1523987740908-adadcd8a8d35',
      createdAt: at('2026-09-21T12:00:00.000Z')
    }
  ]

  for (const item of lost) {
    const { id, ...data } = item
    await prisma.lostFoundItem.upsert({
      where: { id },
      update: { ...data, city: 'Atlanta', status: 'PUBLISHED', deletedAt: null },
      create: { id, ...data, city: 'Atlanta', status: 'PUBLISHED' }
    })
  }

  const giveaways = [
    {
      id: '53000000-0000-4000-8000-000000000001',
      authorId: users.james.id,
      item: '20+ potted plants (succulents, pothos, fiddle leaf fig)',
      neighborhood: 'Grant Park',
      claimed: false,
      claimedById: null,
      createdAt: at('2026-09-23T06:00:00.000Z')
    },
    {
      id: '53000000-0000-4000-8000-000000000002',
      authorId: users.priya.id,
      item: "Children's books — 3 boxes, all ages",
      neighborhood: 'Inman Park',
      claimed: false,
      claimedById: null,
      createdAt: at('2026-09-22T12:00:00.000Z')
    },
    {
      id: '53000000-0000-4000-8000-000000000003',
      authorId: users.nadia.id,
      item: 'Twin bed frame + box spring',
      neighborhood: 'Westside',
      claimed: true,
      claimedById: users.marcus.id,
      createdAt: at('2026-09-21T12:00:00.000Z')
    }
  ]

  for (const giveaway of giveaways) {
    const { id, ...data } = giveaway
    await prisma.giveaway.upsert({
      where: { id },
      update: { ...data, city: 'Atlanta', status: 'PUBLISHED', deletedAt: null },
      create: { id, ...data, city: 'Atlanta', status: 'PUBLISHED' }
    })
  }
}

async function main() {
  for (const name of categories) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') }
    })
  }

  const passwordHash = await argon2.hash(SEED_PASSWORD)
  await seedUsers(passwordHash)
  await seedHousing()
  await seedJobs()
  await seedServices()
  await seedCommunity()
}

main().finally(() => prisma.$disconnect())
