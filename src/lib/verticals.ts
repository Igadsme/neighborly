import type {
  ApiCommunityEvent,
  ApiCommunityPost,
  ApiGiveaway,
  ApiHousing,
  ApiJob,
  ApiLostFound,
  ApiServiceListing,
} from "../api/types"
import { personName, relativeTime } from "./view"

export interface HousingCard {
  id: string
  title: string
  type: string
  listingType: "rent" | "sale"
  price: number
  priceUnit: string
  beds: number
  baths: number
  sqft: number
  neighborhood: string
  distance: string
  available: string
  lease: string
  pets: boolean
  furnished: boolean
  utilities: string
  images: string[]
  verified: boolean
  seller: {
    avatar: string
    name: string
    verified: boolean
    rating: number
    reviews: number
  }
}

export interface JobCard {
  id: string
  title: string
  company: string
  logo: string
  type: string
  level: string
  salary: string
  location: string
  remote: string
  posted: string
  deadline: string
  verified: boolean
  tags: string[]
  description: string
  responsibilities: string[]
}

export interface ServiceCard {
  id: string
  title: string
  provider: string
  avatar: string
  providerName: string
  rating: number
  reviews: number
  startingPrice: number
  location: string
  backgroundCheck: boolean
  availability: string
  tags: string[]
  image: string
}

export interface CommunityPostCard {
  id: string
  type: string
  title: string
  body: string
  neighborhood: string
  reactions: { like: number; love: number; wow: number }
  replies: number
  postedAt: string
  author: {
    avatar: string
    name: string
    verified: boolean
    neighborhood: string
  }
}

export interface CommunityEventCard {
  id: string
  title: string
  date: string
  time: string
  attending: number
  neighborhood: string
  image: string
}

export interface LostFoundCard {
  id: string
  type: string
  item: string
  neighborhood: string
  posted: string
  contact: string
  image: string
}

export interface GiveawayCard {
  id: string
  item: string
  neighborhood: string
  time: string
  claimed: boolean
  poster: { avatar: string; name: string; verified: boolean }
}

export function dollarsFromCents(cents: number) {
  return cents / 100
}

export function housingCard(row: ApiHousing): HousingCard {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    listingType: row.listingType === "sale" ? "sale" : "rent",
    price: dollarsFromCents(row.priceCents),
    priceUnit: row.priceUnit ?? "",
    beds: row.beds,
    baths: row.baths,
    sqft: row.sqft,
    neighborhood: row.neighborhood,
    distance: "Nearby",
    available: row.available || "soon",
    lease: row.lease || "N/A",
    pets: row.pets,
    furnished: row.furnished,
    utilities: row.utilities || "N/A",
    images: row.images.map((image) => image.objectKey || "").filter(Boolean),
    verified: row.verified,
    seller: {
      avatar: "",
      name: personName(row.owner),
      verified: false,
      rating: 0,
      reviews: 0,
    },
  }
}

export function jobCard(row: ApiJob): JobCard {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    logo: row.logo || "",
    type: row.type,
    level: row.level,
    salary: row.salary,
    location: row.location,
    remote: row.remote,
    posted: relativeTime(row.createdAt),
    deadline: row.deadline || "Rolling",
    verified: row.verified,
    tags: row.tags ?? [],
    description: row.description,
    responsibilities: row.responsibilities ?? [],
  }
}

export function serviceCard(row: ApiServiceListing): ServiceCard {
  return {
    id: row.id,
    title: row.title,
    provider: row.businessName,
    avatar: "",
    providerName: personName(row.owner, row.businessName),
    rating: row.rating ?? 0,
    reviews: row.reviewCount,
    startingPrice: dollarsFromCents(row.startingPriceCents),
    location: row.location,
    backgroundCheck: row.backgroundCheck,
    availability: row.availability,
    tags: row.tags ?? [],
    image: row.image || "",
  }
}

export function communityPostCard(row: ApiCommunityPost): CommunityPostCard {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    neighborhood: row.neighborhood,
    reactions: {
      like: row.reactions?.like ?? 0,
      love: row.reactions?.love ?? 0,
      wow: row.reactions?.wow ?? 0,
    },
    replies: row.replies ?? 0,
    postedAt: relativeTime(row.createdAt),
    author: {
      avatar: "",
      name: personName(row.author),
      verified: false,
      neighborhood: row.author.profile?.neighborhood || row.neighborhood,
    },
  }
}

export function communityEventCard(row: ApiCommunityEvent): CommunityEventCard {
  return {
    id: row.id,
    title: row.title,
    date: row.dateLabel,
    time: row.timeLabel,
    attending: row.attending,
    neighborhood: row.neighborhood,
    image: row.image || "",
  }
}

export function lostFoundCard(row: ApiLostFound): LostFoundCard {
  return {
    id: row.id,
    type: row.type,
    item: row.item,
    neighborhood: row.neighborhood,
    posted: relativeTime(row.createdAt),
    contact: personName(row.author),
    image: row.image || "",
  }
}

export function giveawayCard(row: ApiGiveaway): GiveawayCard {
  return {
    id: row.id,
    item: row.item,
    neighborhood: row.neighborhood,
    time: relativeTime(row.createdAt),
    claimed: row.claimed,
    poster: {
      avatar: "",
      name: personName(row.author),
      verified: false,
    },
  }
}
