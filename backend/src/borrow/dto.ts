import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
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
import { BorrowAvailabilityKind, BorrowConditionPhase, BorrowDisputeReason } from '@prisma/client'

export const borrowSorts = ['newest', 'oldest', 'due_soon', 'due_late', 'ending_soon'] as const
export const borrowConditionValues = [
  'like_new',
  'good',
  'fair',
  'worn',
  'damaged',
  'not_returned'
] as const

/**
 * A requested borrowing window.
 *
 * Both dates arrive as ISO strings and are parsed once, here, so the service
 * never has to guess a format or a timezone. `endAt` is the moment the item
 * is due back.
 */
export class BorrowWindowDto {
  @IsDateString()
  startAt!: string

  @IsDateString()
  endAt!: string
}

export class CreateBorrowableItemDto {
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
  @IsString()
  @MaxLength(60)
  condition?: string

  /** How long this item may be out, in days. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  maxBorrowDays?: number

  /** Hours of notice the lender wants before a pickup. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(720)
  minNoticeHours?: number

  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  usageInstructions!: string

  /** Stated for transparency only. No payment is ever processed here. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_00)
  depositCents?: number

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
  @IsBoolean()
  publish?: boolean
}

/** A lender may edit anything except who owns the item. */
export class UpdateBorrowableItemDto {
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
  @MinLength(10)
  @MaxLength(5000)
  description?: string

  @IsOptional()
  @IsString()
  @MaxLength(60)
  condition?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  maxBorrowDays?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(720)
  minNoticeHours?: number

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  usageInstructions?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_00)
  depositCents?: number

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
}

export class CreateBorrowRequestDto extends BorrowWindowDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string
}

export class UpdateBorrowRequestDto {
  @IsOptional()
  @IsDateString()
  startAt?: string

  @IsOptional()
  @IsDateString()
  endAt?: string

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string
}

export class DecideBorrowRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string
}

export class ScheduleHandoffDto {
  @IsDateString()
  scheduledAt!: string

  /**
   * A meeting point the two parties agree on. Never rendered publicly, and
   * never placed in an event payload.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  locationNote?: string
}

export class ConfirmHandoffDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  condition?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string

  @IsOptional()
  @IsUUID('4', { each: true })
  @IsArray()
  @ArrayMaxSize(6)
  evidenceIds?: string[]
}

export class CreateExtensionDto {
  @IsDateString()
  requestedEndAt!: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string
}

export class DecideExtensionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string
}

export class OpenDisputeDto {
  @IsEnum(BorrowDisputeReason)
  reason!: BorrowDisputeReason

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  summary!: string
}

export class AddEvidenceDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string
}

export class RecordConditionDto {
  @IsEnum(BorrowConditionPhase)
  phase!: BorrowConditionPhase

  @IsIn(borrowConditionValues)
  condition!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string

  @IsOptional()
  @IsUUID('4', { each: true })
  @IsArray()
  @ArrayMaxSize(6)
  evidenceIds?: string[]
}

export class AvailabilityWindowDto {
  @IsEnum(BorrowAvailabilityKind)
  kind!: BorrowAvailabilityKind

  @IsDateString()
  startsAt!: string

  @IsDateString()
  endsAt!: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string
}

export class ListBorrowItemsQuery {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  query?: string

  @IsOptional()
  @IsUUID()
  categoryId?: string

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

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  availableNow?: boolean

  @IsOptional()
  @IsString()
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

export class ListBorrowRequestsQuery {
  @IsOptional()
  @IsIn(['borrowed', 'lent', 'all'])
  scope?: 'borrowed' | 'lent' | 'all'

  @IsOptional()
  @IsString()
  status?: string

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  overdueOnly?: boolean

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
