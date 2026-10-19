export interface Seller {
  id: string
  name: string
  avatar: string
  rating: number
  reviews: number
  verified: boolean
  idVerified: boolean
  responseTime: string
  transactions: number
  memberSince: string
  neighborhood: string
}

export interface Listing {
  id: string
  title: string
  price: number | null
  isFree: boolean
  condition: string
  category: string
  subcategory?: string
  neighborhood: string
  city: string
  distance: string
  postedAt: string
  images: string[]
  description: string
  seller: Seller
  saved: boolean
  tags: string[]
  views: number
  saves: number
  pickupAvailable: boolean
  deliveryAvailable: boolean
  shippingAvailable: boolean
}

export const sellers: Seller[] = [
  {
    id: 's1',
    name: 'Marcus Johnson',
    avatar: 'photo-1472099645785-5658abf4ff4e',
    rating: 4.9,
    reviews: 47,
    verified: true,
    idVerified: true,
    responseTime: '< 1 hour',
    transactions: 52,
    memberSince: 'Jan 2022',
    neighborhood: 'Decatur'
  },
  {
    id: 's2',
    name: 'Priya Patel',
    avatar: 'photo-1494790108755-2616b612b77c',
    rating: 5.0,
    reviews: 31,
    verified: true,
    idVerified: true,
    responseTime: '< 30 min',
    transactions: 35,
    memberSince: 'Mar 2021',
    neighborhood: 'Inman Park'
  },
  {
    id: 's3',
    name: 'David Chen',
    avatar: 'photo-1500648767791-00dcc994a43e',
    rating: 4.7,
    reviews: 18,
    verified: true,
    idVerified: false,
    responseTime: '< 2 hours',
    transactions: 21,
    memberSince: 'Sep 2022',
    neighborhood: 'Midtown'
  },
  {
    id: 's4',
    name: 'Aaliyah Williams',
    avatar: 'photo-1438761681033-6461ffad8d80',
    rating: 4.8,
    reviews: 63,
    verified: true,
    idVerified: true,
    responseTime: '< 45 min',
    transactions: 78,
    memberSince: 'Jun 2020',
    neighborhood: 'Buckhead'
  },
  {
    id: 's5',
    name: 'James Rivera',
    avatar: 'photo-1507003211169-0a1dd7228f2d',
    rating: 4.6,
    reviews: 12,
    verified: false,
    idVerified: false,
    responseTime: '< 4 hours',
    transactions: 14,
    memberSince: 'Feb 2023',
    neighborhood: 'Grant Park'
  },
  {
    id: 's6',
    name: 'Sofia Martinez',
    avatar: 'photo-1534528741775-53994a69daeb',
    rating: 4.9,
    reviews: 29,
    verified: true,
    idVerified: true,
    responseTime: '< 1 hour',
    transactions: 33,
    memberSince: 'Nov 2021',
    neighborhood: 'Little Five Points'
  },
  {
    id: 's7',
    name: 'Tyler Brooks',
    avatar: 'photo-1570295999919-56ceb5ecca61',
    rating: 4.5,
    reviews: 8,
    verified: true,
    idVerified: false,
    responseTime: '< 3 hours',
    transactions: 10,
    memberSince: 'May 2023',
    neighborhood: 'East Atlanta'
  },
  {
    id: 's8',
    name: 'Nadia Okonkwo',
    avatar: 'photo-1544005313-94ddf0286df2',
    rating: 4.9,
    reviews: 22,
    verified: true,
    idVerified: true,
    responseTime: '< 1 hour',
    transactions: 26,
    memberSince: 'Aug 2021',
    neighborhood: 'Westside'
  }
]

export const listings: Listing[] = [
  {
    id: 'l1',
    title: 'West Elm Mid-Century Modern Sofa — Excellent Condition',
    price: 650,
    isFree: false,
    condition: 'Like New',
    category: 'Furniture',
    subcategory: 'Sofas & Couches',
    neighborhood: 'Decatur',
    city: 'Atlanta',
    distance: '1.2 mi',
    postedAt: '2h ago',
    images: [
      'photo-1555041469-a586c61ea9bc',
      'photo-1493663284031-b7e3aefcae8e',
      'photo-1567538096630-e0c55bd6374c'
    ],
    description: 'Selling my West Elm mid-century modern sofa — it\'s in excellent shape with zero stains or wear. We\'re moving to a smaller place and it simply won\'t fit. Dimensions: 81" W × 33" D × 30" H. Original retail $1,299. Pet-free, smoke-free home. Pickup only — I can help load it. Cash or Venmo.',
    seller: sellers[0],
    saved: true,
    tags: ['West Elm', 'Sofa', 'Mid-Century', 'Modern'],
    views: 143,
    saves: 28,
    pickupAvailable: true,
    deliveryAvailable: false,
    shippingAvailable: false
  },
  {
    id: 'l2',
    title: 'Standing Desk — Herman Miller Sit/Stand, Height Adjustable',
    price: 480,
    isFree: false,
    condition: 'Good',
    category: 'Furniture',
    subcategory: 'Desks & Office',
    neighborhood: 'Inman Park',
    city: 'Atlanta',
    distance: '0.8 mi',
    postedAt: '5h ago',
    images: [
      'photo-1593640408182-31c228067bec',
      'photo-1614744682560-11d22b92aab4'
    ],
    description: 'Herman Miller Ratio sit-stand desk. Works perfectly — motor is quiet and smooth. 60" × 30" tabletop in walnut. I upgraded to a bigger desk and this one is just taking up space. Light scratches on the surface. Original price $1,000+.',
    seller: sellers[1],
    saved: false,
    tags: ['Herman Miller', 'Standing Desk', 'Office', 'WFH'],
    views: 89,
    saves: 15,
    pickupAvailable: true,
    deliveryAvailable: true,
    shippingAvailable: false
  },
  {
    id: 'l3',
    title: 'iPhone 14 Pro — 256GB Deep Purple, Unlocked',
    price: 699,
    isFree: false,
    condition: 'Excellent',
    category: 'Electronics',
    subcategory: 'Phones',
    neighborhood: 'Midtown',
    city: 'Atlanta',
    distance: '2.1 mi',
    postedAt: '1d ago',
    images: [
      'photo-1591337676887-a217a6970a8a',
      'photo-1556656793-08538906a9f8'
    ],
    description: 'iPhone 14 Pro 256GB in Deep Purple. Used for 8 months, always in a case with screen protector. Battery health at 97%. Includes original box, charger cable (no brick). Unlocked for all carriers.',
    seller: sellers[2],
    saved: true,
    tags: ['iPhone', 'Apple', '14 Pro', 'Unlocked'],
    views: 312,
    saves: 54,
    pickupAvailable: true,
    deliveryAvailable: false,
    shippingAvailable: true
  },
  {
    id: 'l4',
    title: 'Vintage Nikon FM2 Film Camera + 50mm Lens',
    price: 295,
    isFree: false,
    condition: 'Good',
    category: 'Electronics',
    subcategory: 'Cameras',
    neighborhood: 'Buckhead',
    city: 'Atlanta',
    distance: '3.5 mi',
    postedAt: '2d ago',
    images: [
      'photo-1516035069371-29a1b244cc32',
      'photo-1452780212461-39f2f6dcbcf1'
    ],
    description: 'Classic Nikon FM2 in great working condition. Light meter accurate, shutter fires on all speeds. Comes with the Nikkor 50mm f/1.8 lens and camera strap. Perfect for someone getting into film photography.',
    seller: sellers[3],
    saved: false,
    tags: ['Nikon', 'Film Camera', 'Vintage', 'Photography'],
    views: 78,
    saves: 19,
    pickupAvailable: true,
    deliveryAvailable: false,
    shippingAvailable: true
  },
  {
    id: 'l5',
    title: 'Free: IKEA KALLAX Shelf Unit (4×2)',
    price: null,
    isFree: true,
    condition: 'Fair',
    category: 'Furniture',
    subcategory: 'Storage',
    neighborhood: 'Grant Park',
    city: 'Atlanta',
    distance: '1.7 mi',
    postedAt: '3h ago',
    images: [
      'photo-1555664424-778a1e5e1b48',
      'photo-1556909114-f6e7ad7d3136'
    ],
    description: 'Free IKEA KALLAX 4x2 in white. A few scuff marks but structurally solid. Must pick up today or tomorrow — you will need two people and a truck or large SUV. First come first served.',
    seller: sellers[4],
    saved: false,
    tags: ['IKEA', 'KALLAX', 'Free', 'Storage', 'Shelf'],
    views: 201,
    saves: 43,
    pickupAvailable: true,
    deliveryAvailable: false,
    shippingAvailable: false
  },
  {
    id: 'l6',
    title: 'Trek Marlin 7 Mountain Bike — 2022, Size L',
    price: 560,
    isFree: false,
    condition: 'Good',
    category: 'Vehicles',
    subcategory: 'Bikes',
    neighborhood: 'Little Five Points',
    city: 'Atlanta',
    distance: '2.4 mi',
    postedAt: '1d ago',
    images: [
      'photo-1558618666-fcd25c85cd64',
      'photo-1571068316344-75bc76f77890'
    ],
    description: 'Trek Marlin 7 from 2022 in great shape. Used on weekend trails mostly. New brake pads installed last month. Hydraulic disc brakes, 1x10 drivetrain. Size Large (fits 6\'0–6\'3). Original price $969.',
    seller: sellers[5],
    saved: true,
    tags: ['Trek', 'Mountain Bike', 'Bike', 'Cycling'],
    views: 134,
    saves: 31,
    pickupAvailable: true,
    deliveryAvailable: false,
    shippingAvailable: false
  },
  {
    id: 'l7',
    title: 'Sony WH-1000XM5 Wireless Headphones — Like New',
    price: 230,
    isFree: false,
    condition: 'Like New',
    category: 'Electronics',
    subcategory: 'Audio',
    neighborhood: 'East Atlanta',
    city: 'Atlanta',
    distance: '0.6 mi',
    postedAt: '4h ago',
    images: [
      'photo-1505740420928-5e560c06d30e',
      'photo-1583394838336-acd977736f90'
    ],
    description: 'Sony XM5 in black. Bought 4 months ago, used a handful of times. Comes with original box, carrying case, charging cable, and aux cable. ANC is phenomenal. Retail $400.',
    seller: sellers[6],
    saved: false,
    tags: ['Sony', 'Headphones', 'Noise Cancelling', 'Wireless'],
    views: 267,
    saves: 47,
    pickupAvailable: true,
    deliveryAvailable: false,
    shippingAvailable: true
  },
  {
    id: 'l8',
    title: 'Handmade Ceramic Tableware Set — 4 Place Settings',
    price: 180,
    isFree: false,
    condition: 'New',
    category: 'Home & Garden',
    subcategory: 'Kitchen',
    neighborhood: 'Westside',
    city: 'Atlanta',
    distance: '3.2 mi',
    postedAt: '6h ago',
    images: [
      'photo-1610701596007-11502861dcfa',
      'photo-1565193566173-7a0ee3dbe261'
    ],
    description: 'Locally handmade ceramic tableware set. Earth-tone sage glaze, food-safe, dishwasher safe. Set includes 4 dinner plates, 4 bowls, 4 mugs. Made in my home studio in West Atlanta.',
    seller: sellers[7],
    saved: true,
    tags: ['Handmade', 'Ceramic', 'Pottery', 'Tableware', 'Local'],
    views: 55,
    saves: 22,
    pickupAvailable: true,
    deliveryAvailable: true,
    shippingAvailable: false
  }
]

export const jobs = [
  {
    id: 'j1',
    title: 'Full-Stack Engineer',
    company: 'PeachTech Solutions',
    logo: 'photo-1611162617474-5b21e879e113',
    type: 'Full-time',
    level: 'Mid-Senior',
    salary: '$110k–$145k',
    location: 'Midtown Atlanta',
    remote: 'Hybrid',
    posted: '2d ago',
    deadline: 'Rolling',
    verified: true,
    tags: ['React', 'Node.js', 'PostgreSQL']
  },
  {
    id: 'j2',
    title: 'Barista + Shift Supervisor',
    company: 'Revelator Coffee Co.',
    logo: 'photo-1495474472287-4d71bcdd2085',
    type: 'Part-time',
    level: 'Entry',
    salary: '$16–$19/hr',
    location: 'Inman Park',
    remote: 'On-site',
    posted: '1d ago',
    deadline: 'Oct 1, 2026',
    verified: true,
    tags: ['Coffee', 'Customer Service', 'Food & Bev']
  },
  {
    id: 'j3',
    title: 'Freelance Graphic Designer',
    company: 'Multiple clients',
    logo: 'photo-1626785774573-4b799315345d',
    type: 'Freelance',
    level: 'Mid',
    salary: '$45–$75/hr',
    location: 'Remote',
    remote: 'Remote',
    posted: '4h ago',
    deadline: 'Rolling',
    verified: false,
    tags: ['Figma', 'Branding', 'Print', 'Digital']
  },
  {
    id: 'j4',
    title: 'Licensed Electrician (Residential)',
    company: 'Atlanta Power Pros',
    logo: 'photo-1621905252507-b35492cc74b4',
    type: 'Full-time',
    level: 'Journeyman',
    salary: '$65k–$90k',
    location: 'Buckhead',
    remote: 'On-site',
    posted: '3d ago',
    deadline: 'Rolling',
    verified: true,
    tags: ['Electrical', 'Construction', 'Residential']
  },
  {
    id: 'j5',
    title: 'Marketing Coordinator',
    company: 'Southside Spirits',
    logo: 'photo-1567958451986-2de427a4a0be',
    type: 'Full-time',
    level: 'Entry-Mid',
    salary: '$48k–$58k',
    location: 'West Midtown',
    remote: 'Hybrid',
    posted: '1w ago',
    deadline: 'Sep 30, 2026',
    verified: true,
    tags: ['Marketing', 'Social Media', 'Content']
  }
]

export const services = [
  {
    id: 'sv1',
    title: 'House Cleaning',
    provider: 'Rosa\'s Spotless Cleaning',
    avatar: 'photo-1494790108755-2616b612b77c',
    providerName: 'Rosa Mendez',
    rating: 4.9,
    reviews: 142,
    startingPrice: 89,
    location: 'Decatur & Surrounding',
    backgroundCheck: true,
    availability: 'Mon–Sat',
    tags: ['Deep Clean', 'Move-In/Out', 'Weekly'],
    image: 'photo-1527515545081-5db817172677'
  },
  {
    id: 'sv2',
    title: 'Moving Help',
    provider: 'ATL Strong Movers',
    avatar: 'photo-1507003211169-0a1dd7228f2d',
    providerName: 'James Rivera',
    rating: 4.8,
    reviews: 98,
    startingPrice: 120,
    location: 'Metro Atlanta',
    backgroundCheck: true,
    availability: 'Weekends',
    tags: ['Local Moves', 'Loading/Unloading', 'Packing'],
    image: 'photo-1558618047-3c4f7f7f7b43'
  },
  {
    id: 'sv3',
    title: 'Math & Science Tutoring',
    provider: 'Tutor with David C.',
    avatar: 'photo-1500648767791-00dcc994a43e',
    providerName: 'David Chen',
    rating: 5.0,
    reviews: 36,
    startingPrice: 55,
    location: 'Online or Midtown',
    backgroundCheck: false,
    availability: 'Evenings & Weekends',
    tags: ['K-12', 'SAT Prep', 'Calculus', 'Physics'],
    image: 'photo-1434030216411-0b793f4b4173'
  },
  {
    id: 'sv4',
    title: 'Photography',
    provider: 'Sofia Captures',
    avatar: 'photo-1534528741775-53994a69daeb',
    providerName: 'Sofia Martinez',
    rating: 4.9,
    reviews: 74,
    startingPrice: 250,
    location: 'Inman Park & Beyond',
    backgroundCheck: false,
    availability: 'Flexible',
    tags: ['Portraits', 'Events', 'Real Estate'],
    image: 'photo-1542038784456-1ea8e935640e'
  },
  {
    id: 'sv5',
    title: 'Lawn Care & Landscaping',
    provider: 'Green Acres ATL',
    avatar: 'photo-1472099645785-5658abf4ff4e',
    providerName: 'Marcus Johnson',
    rating: 4.7,
    reviews: 55,
    startingPrice: 65,
    location: 'Decatur + East ATL',
    backgroundCheck: true,
    availability: 'Tue–Sat',
    tags: ['Mowing', 'Mulching', 'Pruning', 'Cleanup'],
    image: 'photo-1416879595882-3373a0480b5b'
  },
  {
    id: 'sv6',
    title: 'Computer Repair & IT Help',
    provider: 'Byte Fixers',
    avatar: 'photo-1570295999919-56ceb5ecca61',
    providerName: 'Tyler Brooks',
    rating: 4.6,
    reviews: 28,
    startingPrice: 45,
    location: 'East Atlanta',
    backgroundCheck: false,
    availability: 'Mon–Fri',
    tags: ['Mac & PC', 'Virus Removal', 'Setup', 'Data Recovery'],
    image: 'photo-1517336714731-489689fd1ca8'
  }
]

export const housingListings = [
  {
    id: 'h1',
    title: 'Sunny 2BR/1BA in Inman Park — Steps to BeltLine',
    type: 'Apartment',
    listingType: 'rent',
    price: 1850,
    priceUnit: '/mo',
    beds: 2,
    baths: 1,
    sqft: 920,
    neighborhood: 'Inman Park',
    distance: '0.9 mi',
    available: 'Oct 1, 2026',
    lease: '12 months',
    pets: true,
    furnished: false,
    utilities: 'Water included',
    images: ['photo-1560448204-e02f11c3d0e2', 'photo-1502672260266-1c1ef2d93688'],
    postedAt: '1d ago',
    verified: true,
    seller: sellers[1]
  },
  {
    id: 'h2',
    title: 'Modern Studio in Midtown with Rooftop Access',
    type: 'Studio',
    listingType: 'rent',
    price: 1350,
    priceUnit: '/mo',
    beds: 0,
    baths: 1,
    sqft: 550,
    neighborhood: 'Midtown',
    distance: '2.3 mi',
    available: 'Immediately',
    lease: '6 or 12 months',
    pets: false,
    furnished: true,
    utilities: 'All utilities included',
    images: ['photo-1522708323590-d24dbb6b0267', 'photo-1484154218962-a197022b5858'],
    postedAt: '3h ago',
    verified: true,
    seller: sellers[2]
  },
  {
    id: 'h3',
    title: '3BR/2BA Craftsman Bungalow For Sale — Grant Park',
    type: 'House',
    listingType: 'sale',
    price: 485000,
    priceUnit: '',
    beds: 3,
    baths: 2,
    sqft: 1620,
    neighborhood: 'Grant Park',
    distance: '1.7 mi',
    available: 'Oct 15, 2026',
    lease: 'N/A',
    pets: true,
    furnished: false,
    utilities: 'N/A',
    images: ['photo-1568605114967-8130f3a36994', 'photo-1449844908441-8829872d2607'],
    postedAt: '5d ago',
    verified: true,
    seller: sellers[3]
  },
  {
    id: 'h4',
    title: 'Private Room in Shared House — Decatur, Near MARTA',
    type: 'Room',
    listingType: 'rent',
    price: 750,
    priceUnit: '/mo',
    beds: 1,
    baths: 1,
    sqft: 0,
    neighborhood: 'Decatur',
    distance: '1.2 mi',
    available: 'Sep 25, 2026',
    lease: 'Month-to-month',
    pets: false,
    furnished: true,
    utilities: 'All included',
    images: ['photo-1631049307264-da0ec9d70304', 'photo-1540518614846-7eded433c457'],
    postedAt: '2d ago',
    verified: false,
    seller: sellers[0]
  },
  {
    id: 'h5',
    title: 'Luxury 1BR Condo in Buckhead — Concierge, Pool, Gym',
    type: 'Condo',
    listingType: 'rent',
    price: 2200,
    priceUnit: '/mo',
    beds: 1,
    baths: 1,
    sqft: 780,
    neighborhood: 'Buckhead',
    distance: '4.1 mi',
    available: 'Oct 1, 2026',
    lease: '12 months',
    pets: true,
    furnished: false,
    utilities: 'Resident pays utilities',
    images: ['photo-1606744824163-985d376605aa', 'photo-1554995207-c18c203602cb'],
    postedAt: '1w ago',
    verified: true,
    seller: sellers[3]
  },
  {
    id: 'h6',
    title: 'Sublet: 2BR in Westside — Sept through Dec',
    type: 'Sublet',
    listingType: 'rent',
    price: 1600,
    priceUnit: '/mo',
    beds: 2,
    baths: 1,
    sqft: 875,
    neighborhood: 'Westside',
    distance: '3.5 mi',
    available: 'Sep 20, 2026',
    lease: '3 months',
    pets: false,
    furnished: true,
    utilities: 'All included',
    images: ['photo-1493809842364-78817add7ffb', 'photo-1507089947368-19c1da9775ae'],
    postedAt: '4d ago',
    verified: false,
    seller: sellers[7]
  }
]

export const communityPosts = [
  {
    id: 'cp1',
    type: 'discussion',
    author: sellers[1],
    title: 'Best farmer\'s markets this weekend?',
    body: 'Heading to a few markets with the kids — anyone know which ones are worth it this time of year? We love the Decatur one but wondering if there are other good options nearby.',
    neighborhood: 'Inman Park',
    reactions: { like: 24, love: 8 },
    replies: 17,
    postedAt: '2h ago'
  },
  {
    id: 'cp2',
    type: 'announcement',
    author: sellers[3],
    title: 'Road closure: Ponce de Leon Ave this Friday 8am–6pm',
    body: 'Just saw the city notice — Ponce will be closed from Highland to N. Highland for utility work. Plan alternate routes if you\'re commuting through Midtown Friday.',
    neighborhood: 'Midtown',
    reactions: { like: 47, love: 3 },
    replies: 8,
    postedAt: '5h ago'
  },
  {
    id: 'cp3',
    type: 'lost_found',
    author: sellers[0],
    title: 'Found: Black Lab mix near Candler Park dog park',
    body: 'Found a friendly black Lab/shepherd mix near the CP dog park around 4pm today. No collar but seems well-cared-for. I have him at my place. DM me if this is your dog.',
    neighborhood: 'Decatur',
    reactions: { like: 15, love: 31 },
    replies: 22,
    postedAt: '3h ago'
  },
  {
    id: 'cp4',
    type: 'recommendation',
    author: sellers[5],
    title: 'Highly recommend Patel Auto Repair on Memorial Dr',
    body: 'Had a great experience getting my brakes done last week. Fair prices, no upselling, done on time. They\'ve been in the neighborhood for 20+ years. 10/10 recommend.',
    neighborhood: 'Little Five Points',
    reactions: { like: 38, love: 12 },
    replies: 6,
    postedAt: '1d ago'
  },
  {
    id: 'cp5',
    type: 'event',
    author: sellers[7],
    title: 'Westside Neighborhood Cleanup — Sat Sep 20, 9am',
    body: 'Join us for our quarterly community cleanup along the Westside Trail. Gloves and bags provided. Coffee and donuts after! Let\'s show some love for our neighborhood.',
    neighborhood: 'Westside',
    reactions: { like: 52, love: 19 },
    replies: 31,
    postedAt: '2d ago'
  },
  {
    id: 'cp6',
    type: 'giveaway',
    author: sellers[4],
    title: 'Free: 20+ potted plants — must take all',
    body: 'Moving next week and can\'t take all my plants. Mix of succulents, pothos, snake plants, and a big fiddle leaf fig. All free, all in good shape. Come pick up Saturday morning.',
    neighborhood: 'Grant Park',
    reactions: { like: 67, love: 44 },
    replies: 48,
    postedAt: '6h ago'
  }
]

export const mapListings = [
  { id: 'm1', title: 'West Elm Sofa', price: 650, x: 42, y: 38, image: 'photo-1555041469-a586c61ea9bc', category: 'Furniture' },
  { id: 'm2', title: 'iPhone 14 Pro', price: 699, x: 55, y: 52, image: 'photo-1591337676887-a217a6970a8a', category: 'Electronics' },
  { id: 'm3', title: 'Trek Marlin 7', price: 560, x: 30, y: 60, image: 'photo-1558618666-fcd25c85cd64', category: 'Bikes' },
  { id: 'm4', title: 'IKEA Shelf', price: null, x: 68, y: 35, image: 'photo-1555664424-778a1e5e1b48', category: 'Furniture' },
  { id: 'm5', title: 'Sony XM5', price: 230, x: 75, y: 62, image: 'photo-1505740420928-5e560c06d30e', category: 'Electronics' },
  { id: 'm6', title: 'Nikon FM2', price: 295, x: 48, y: 70, image: 'photo-1516035069371-29a1b244cc32', category: 'Cameras' },
  { id: 'm7', title: 'Ceramic Set', price: 180, x: 20, y: 44, image: 'photo-1610701596007-11502861dcfa', category: 'Home' },
  { id: 'm8', title: 'Standing Desk', price: 480, x: 62, y: 48, image: 'photo-1593640408182-31c228067bec', category: 'Furniture' },
  { id: 'm9', title: 'Garden Tools', price: 45, x: 38, y: 25, image: 'photo-1416879595882-3373a0480b5b', category: 'Garden' },
  { id: 'm10', title: 'Road Bike', price: 800, x: 82, y: 28, image: 'photo-1558618047-3c4f7f7f7b43', category: 'Bikes' },
  { id: 'm11', title: 'Leather Jacket', price: 120, x: 52, y: 22, image: 'photo-1551028719-00167b16eac5', category: 'Clothing' },
  { id: 'm12', title: 'Vintage Record Player', price: 175, x: 26, y: 72, image: 'photo-1526394931762-8a4ceaf1b596', category: 'Electronics' },
]

export const conversations = [
  {
    id: 'c1',
    with: sellers[0],
    listing: listings[0],
    lastMessage: 'Is the sofa still available? I can pick up this weekend.',
    lastTime: '10 min ago',
    unread: 2,
    status: 'active',
    messages: [
      { id: 'msg1', from: 'them', text: 'Hi! Is the sofa still available?', time: '2:14 PM' },
      { id: 'msg2', from: 'me', text: 'Yes it is! Are you interested?', time: '2:16 PM' },
      { id: 'msg3', from: 'them', text: 'Very much so. Would you take $600 for it?', time: '2:18 PM' },
      { id: 'msg4', from: 'me', text: 'I could do $625 — it\'s in really great shape.', time: '2:20 PM' },
      { id: 'msg5', from: 'them', text: 'Deal! Can I pick it up Saturday afternoon?', time: '2:45 PM' },
      { id: 'msg6', from: 'them', text: 'Is the sofa still available? I can pick up this weekend.', time: '3:12 PM' }
    ]
  },
  {
    id: 'c2',
    with: sellers[2],
    listing: listings[2],
    lastMessage: 'Sure, I can ship it. DM me your zip code.',
    lastTime: '1h ago',
    unread: 0,
    status: 'active',
    messages: [
      { id: 'msg1', from: 'them', text: 'Hey, would you ship the iPhone?', time: '1:00 PM' },
      { id: 'msg2', from: 'me', text: 'Sure, I can ship it. DM me your zip code.', time: '1:05 PM' }
    ]
  },
  {
    id: 'c3',
    with: sellers[5],
    listing: listings[5],
    lastMessage: 'Bike is sold. Thanks for the interest!',
    lastTime: '2d ago',
    unread: 0,
    status: 'archived',
    messages: [
      { id: 'msg1', from: 'me', text: 'Still have the Trek?', time: 'Mon 9:00 AM' },
      { id: 'msg2', from: 'them', text: 'Bike is sold. Thanks for the interest!', time: 'Mon 11:30 AM' }
    ]
  }
]
