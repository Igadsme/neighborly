import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength
} from 'class-validator'
import { ExchangeMode, OfferStatus, RequestStatus } from '@prisma/client'

export const requestUrgencies = ['none', 'soon', 'urgent'] as const
export const requestSorts = ['newest', 'oldest', 'deadline', 'budget_asc', 'budget_desc', 'relevance'] as const

/**
 * Structured requirements. Kept as a flat, bounded set of optional fields so
 * a matching rule can read them without a migration, and so an unexpected
 * key cannot be smuggled in.
 */
export class RequestRequirementsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  quantity?: number

  @IsOptional()
  @IsString()
  @MaxLength(60)
  preferredCondition?: string

  @IsOptional()
  @IsString()
  @MaxLength(60)
  brand?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  keywords?: string
}

export class CreateRequestDto {
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
  budgetCents?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  minBudgetCents?: number

  @IsOptional()
  @IsBoolean()
  budgetFlexible?: boolean

  @IsOptional()
  @Type(() => RequestRequirementsDto)
  @IsObject()
  requirements?: RequestRequirementsDto

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number

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
  @IsInt()
  @Min(1)
  @Max(500)
  radiusMiles?: number

  @IsOptional()
  @IsDateString()
  deadline?: string

  @IsOptional()
  @IsIn(requestUrgencies)
  urgency?: string

  @IsEnum(ExchangeMode)
  mode!: ExchangeMode

  /** Publish immediately; otherwise the request starts as a draft. */
  @IsOptional()
  @IsBoolean()
  publish?: boolean
}

/** A draft may omit everything; the API fills in a placeholder title. */
export class SaveRequestDraftDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(140)
  title?: string

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  budgetCents?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  minBudgetCents?: number

  @IsOptional()
  @IsBoolean()
  budgetFlexible?: boolean

  @IsOptional()
  @Type(() => RequestRequirementsDto)
  @IsObject()
  requirements?: RequestRequirementsDto

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number

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
  @IsInt()
  @Min(1)
  @Max(500)
  radiusMiles?: number

  @IsOptional()
  @IsDateString()
  deadline?: string

  @IsOptional()
  @IsIn(requestUrgencies)
  urgency?: string

  @IsOptional()
  @IsEnum(ExchangeMode)
  mode?: ExchangeMode
}

export class UpdateRequestDto extends SaveRequestDraftDto {}

export class CreateOfferDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  amountCents?: number

  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  message!: string

  @IsOptional()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(8)
  listingIds?: string[]
}

export class ListOffersQuery {
  @IsOptional()
  @IsIn(['received', 'sent', 'all'])
  scope?: 'received' | 'sent' | 'all'

  @IsOptional()
  @IsEnum(OfferStatus)
  status?: OfferStatus

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

export class ListRequestsQuery {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  query?: string

  @IsOptional()
  @IsUUID()
  categoryId?: string

  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus

  @IsOptional()
  @IsEnum(ExchangeMode)
  mode?: ExchangeMode

  @IsOptional()
  @IsIn(requestUrgencies)
  urgency?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  minBudgetCents?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  maxBudgetCents?: number

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  neighborhood?: string

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

  /** Only requests whose deadline is still in the future. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  openOnly?: boolean

  @IsOptional()
  @IsIn(requestSorts)
  sort?: string

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

export class CounterOfferDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  amountCents?: number

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string
}

export class ListMyRequestsQuery {
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus

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