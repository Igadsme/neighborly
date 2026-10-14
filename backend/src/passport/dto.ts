import { Transform, Type } from 'class-transformer'
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength
} from 'class-validator'
import { AppealStatus, VerificationMethod, VerificationStatus } from '@prisma/client'

/** Privacy settings. Defaults are chosen so nothing becomes hidden silently. */
export class PassportPrivacyDto {
  @IsOptional()
  @IsBoolean()
  showRatings?: boolean

  @IsOptional()
  @IsBoolean()
  showTenure?: boolean

  @IsOptional()
  @IsBoolean()
  showNeighborhood?: boolean

  @IsOptional()
  @IsBoolean()
  showCity?: boolean

  @IsOptional()
  @IsBoolean()
  showTrustSignals?: boolean

  @IsOptional()
  @IsBoolean()
  showContributions?: boolean

  @IsOptional()
  @IsBoolean()
  leaderboardOptIn?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  reviewWindowDays?: number
}

export class UpdatePassportProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  displayName?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  neighborhood?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string
}

export class CreateReviewDto {
  @IsUUID()
  transactionId!: string

  @IsUUID()
  subjectId!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  body!: string
}

export class UpdateReviewDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  body?: string
}

export class SubmitVerificationDto {
  @IsEnum(VerificationMethod)
  method!: VerificationMethod

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  statement?: string
}

export class ReviewVerificationDto {
  @IsEnum(VerificationStatus, { message: 'status must be APPROVED, REJECTED, or REVOKED' })
  @IsEnum(VerificationStatus)
  status!: VerificationStatus

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string
}

export class ModerateReviewDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string
}

export class SubmitAppealDto {
  @IsEnum(VerificationMethod, { message: 'subjectType must be REVIEW or VERIFICATION' })
  @IsString()
  subjectType!: 'REVIEW' | 'VERIFICATION' | 'REPORT'

  @IsUUID()
  subjectId!: string

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason!: string
}

export class ResolveAppealDto {
  @IsEnum(AppealStatus)
  status!: AppealStatus

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolution?: string
}

export class PassportQuery {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  scope?: string
}

export class ListPassportsQuery {
  /** Only members who opted in to being ranked appear here. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  leaderboard?: boolean

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