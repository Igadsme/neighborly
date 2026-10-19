import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength
} from 'class-validator'

export const listingSorts = ['newest', 'oldest', 'price_asc', 'price_desc', 'relevance'] as const
export const listingStatuses = ['DRAFT', 'PUBLISHED', 'SOLD', 'ARCHIVED', 'DELETED'] as const

/**
 * Stored condition values are a fixed enum so filtering and grouping stay
 * consistent. The create-listing form sends the human label the UI shows, so
 * the input is normalized rather than rejecting what a user already sees on
 * screen.
 */
export const listingConditions = ['new', 'like_new', 'good', 'fair', 'for_parts'] as const

const CONDITION_ALIASES: Record<string, (typeof listingConditions)[number]> = {
  new: 'new',
  'like new': 'like_new',
  'like-new': 'like_new',
  likenew: 'like_new',
  good: 'good',
  fair: 'fair',
  'for parts': 'for_parts',
  'for-parts': 'for_parts',
  forparts: 'for_parts'
}

export function normalizeCondition(value: string): (typeof listingConditions)[number] | undefined {
  return CONDITION_ALIASES[value.trim().toLowerCase()]
}

/** Renders a stored condition value as the label the UI shows. */
export function conditionLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

const MAX_IMAGES = 8

export class CreateListingDto {
  @IsUUID()
  categoryId!: string

  @IsString()
  @MinLength(3)
  @MaxLength(140)
  title!: string

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description!: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  priceCents?: number

  @IsOptional()
  @Transform(({ value }) => normalizeCondition(String(value)))
  @IsIn(listingConditions)
  condition?: (typeof listingConditions)[number]

  @IsOptional()
  @IsString()
  @MaxLength(80)
  neighborhood?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  radiusMiles?: number

  @IsOptional()
  @IsBoolean()
  pickupAvailable?: boolean

  @IsOptional()
  @IsBoolean()
  deliveryAvailable?: boolean

  @IsOptional()
  @IsBoolean()
  shippingAvailable?: boolean
}

export class UpdateListingDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(140)
  title?: string

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  priceCents?: number

  @IsOptional()
  @Transform(({ value }) => normalizeCondition(String(value)))
  @IsIn(listingConditions)
  condition?: (typeof listingConditions)[number]

  @IsOptional()
  @IsString()
  @MaxLength(80)
  neighborhood?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  radiusMiles?: number

  @IsOptional()
  @IsBoolean()
  pickupAvailable?: boolean

  @IsOptional()
  @IsBoolean()
  deliveryAvailable?: boolean

  @IsOptional()
  @IsBoolean()
  shippingAvailable?: boolean
}

/**
 * Every filter is optional and bounded. `limit`/`offset` are clamped in the
 * service so a client cannot ask for an unbounded result set.
 */
export class ListListingsQuery {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  query?: string

  @IsOptional()
  @IsUUID()
  categoryId?: string

  @IsOptional()
  @IsUUID()
  sellerId?: string

  @IsOptional()
  @IsIn(['PUBLISHED', 'SOLD'])
  status?: 'PUBLISHED' | 'SOLD'

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  minPriceCents?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  maxPriceCents?: number

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  neighborhood?: string

  /** Search origin. Combined with `radiusMiles` for distance filtering. */
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  radiusMiles?: number

  @IsOptional()
  @IsIn(listingSorts)
  sort?: (typeof listingSorts)[number]

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number
}

/** Ownership-scoped status filter for the "my listings" screen. */
export class MyListingsQuery {
  @IsOptional()
  @IsIn(listingStatuses)
  status?: (typeof listingStatuses)[number]

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number
}

export class AttachImagesDto {
  @IsArray()
  @ArrayMaxSize(MAX_IMAGES)
  @IsUUID('4', { each: true })
  imageIds!: string[]
}

export class ReorderImagesDto {
  @IsArray()
  @ArrayMaxSize(MAX_IMAGES)
  @IsUUID('4', { each: true })
  imageIds!: string[]
}

export class SaveSearchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  query!: string

  @IsOptional()
  filters?: Record<string, string | number | boolean | null>
}

export class UpdateSavedSearchDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  query?: string

  @IsOptional()
  filters?: Record<string, string | number | boolean | null>
}

export const MAX_LISTING_IMAGES = MAX_IMAGES