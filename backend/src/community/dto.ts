import { Transform, Type } from 'class-transformer'
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'
import { ReactionType, RsvpStatus } from '@prisma/client'

export class CommunityQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  neighborhood?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0
}

export class CreatePostDto {
  @IsString()
  @MinLength(2)
  @MaxLength(5000)
  body!: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  neighborhood?: string
}

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string
}

export class ReactToPostDto {
  @IsEnum(ReactionType)
  type!: ReactionType
}

export class CreateEventDto {
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description!: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  neighborhood?: string

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  location!: string

  @IsDateString()
  startsAt!: string

  @IsOptional()
  @IsDateString()
  endsAt?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  capacity?: number
}

export class RsvpDto {
  @IsEnum(RsvpStatus)
  status!: RsvpStatus
}
