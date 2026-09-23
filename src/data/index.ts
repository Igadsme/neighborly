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
  categoryId?: string
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
