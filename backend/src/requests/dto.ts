import { Type } from 'class-transformer'
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator'
import { ExchangeMode } from '@prisma/client'

export class CreateRequestDto {
  @IsUUID()
  categoryId!: string
  @IsString()
  @MinLength(3)
  title!: string
  @IsString()
  @MinLength(10)
  description!: string
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  budgetCents?: number
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  radiusMiles?: number
  @IsOptional()
  @IsDateString()
  deadline?: string
  @IsOptional()
  @IsString()
  urgency?: string
  @IsEnum(ExchangeMode)
  mode!: ExchangeMode
}

export class CreateOfferDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountCents?: number
  @IsString()
  @MinLength(2)
  message!: string
  @IsOptional()
  @IsUUID('4', { each: true })
  listingIds?: string[]
}

export class CounterOfferDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountCents?: number
  @IsString()
  @MinLength(2)
  message!: string
}
