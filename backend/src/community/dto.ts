import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'
import { communityPostTypes, lostFoundKinds, reactionEmojis } from '../common/vertical-values'

export class CreatePostDto {
  @IsIn(communityPostTypes)
  type!: (typeof communityPostTypes)[number]

  @IsString()
  @MinLength(3)
  @MaxLength(140)
  title!: string

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  body!: string

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  neighborhood!: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string
}

export class UpdatePostDto {
  @IsOptional()
  @IsIn(communityPostTypes)
  type?: (typeof communityPostTypes)[number]

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(140)
  title?: string

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  body?: string

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  neighborhood?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string
}

export class ListPostsQuery {
  @IsOptional()
  @IsIn(communityPostTypes)
  type?: (typeof communityPostTypes)[number]

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 24

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0
}

export class ReactionDto {
  @IsIn(reactionEmojis)
  emoji!: (typeof reactionEmojis)[number]
}

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string
}

export class CreateEventDto {
  @IsString()
  @MinLength(3)
  @MaxLength(140)
  title!: string

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  neighborhood!: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  dateLabel!: string

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  timeLabel!: string

  @IsOptional()
  @IsString()
  @MaxLength(300)
  imageKey?: string
}

export class UpdateEventDto {
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
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  neighborhood?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  dateLabel?: string

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  timeLabel?: string

  @IsOptional()
  @IsString()
  @MaxLength(300)
  imageKey?: string
}

export class CreateLostFoundDto {
  @IsIn(lostFoundKinds)
  type!: (typeof lostFoundKinds)[number]

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  item!: string

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  neighborhood!: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string

  @IsOptional()
  @IsString()
  @MaxLength(300)
  imageKey?: string
}

export class UpdateLostFoundDto {
  @IsOptional()
  @IsIn(lostFoundKinds)
  type?: (typeof lostFoundKinds)[number]

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  item?: string

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  neighborhood?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string

  @IsOptional()
  @IsString()
  @MaxLength(300)
  imageKey?: string
}

export class CreateGiveawayDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  item!: string

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  neighborhood!: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string
}

export class UpdateGiveawayDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  item?: string

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  neighborhood?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string
}

export class ListLimitQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 24

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0
}
