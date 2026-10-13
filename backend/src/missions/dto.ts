import { Transform, Type } from 'class-transformer'
import {
  IsBoolean,
  IsDate,
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
import { MissionCategory, MissionStatus } from '@prisma/client'

export class CreateMissionDto {
  @IsString()
  @MinLength(4)
  @MaxLength(120)
  title!: string

  @IsString()
  @MinLength(20)
  @MaxLength(4000)
  description!: string

  @IsEnum(MissionCategory)
  category!: MissionCategory

  @Type(() => Date)
  @IsDate()
  startAt!: Date

  @Type(() => Date)
  @IsDate()
  endAt!: Date

  @IsOptional()
  @IsString()
  @MaxLength(80)
  neighborhood?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string

  /** Where to meet. Participant-only, and never published. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  meetingPoint?: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  capacity!: number

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  publishNow?: boolean
}

export class UpdateMissionDto {
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(120)
  title?: string

  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(4000)
  description?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  neighborhood?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  meetingPoint?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  capacity?: number

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startAt?: Date

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endAt?: Date

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean
}

export class MissionListQuery {
  @IsOptional()
  @IsEnum(MissionCategory)
  category?: MissionCategory

  @IsOptional()
  @IsEnum(MissionStatus)
  status?: MissionStatus

  @IsOptional()
  @IsString()
  @MaxLength(80)
  neighborhood?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date

  @IsOptional()
  @IsUUID()
  organizerId?: string

  /** Missions this member organizes. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  mine?: boolean

  /** Missions this member has joined and not left. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  joined?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number
}

export class ReasonDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string
}

export class ReportMissionDto extends ReasonDto {
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  reportReason!: string

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string
}

export class ToggleStaffVerificationDto {
  @IsBoolean()
  required!: boolean
}

export class ModerateMissionDto {
  @IsEnum(MissionStatus, { message: 'action must be PUBLISH, CANCEL, or COMPLETE' })
  @IsString()
  action!: 'hide' | 'restore'

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string
}