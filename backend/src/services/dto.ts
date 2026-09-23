import { Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'
import { serviceCategories } from '../common/vertical-values'

export class CreateServiceDto {
  @IsString()
  @MinLength(3)
  @MaxLength(140)
  title!: string

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  businessName!: string

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description!: string

  @IsIn(serviceCategories)
  category!: (typeof serviceCategories)[number]

  @Type(() => Number)
  @IsInt()
  @Min(0)
  startingPriceCents!: number

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  location!: string

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  availability!: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[]

  @IsOptional()
  @IsString()
  @MaxLength(300)
  imageKey?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number
}

export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(140)
  title?: string

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  businessName?: string

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description?: string

  @IsOptional()
  @IsIn(serviceCategories)
  category?: (typeof serviceCategories)[number]

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  startingPriceCents?: number

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  location?: string

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  availability?: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[]

  @IsOptional()
  @IsString()
  @MaxLength(300)
  imageKey?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number
}

export class ListServicesQuery {
  @IsOptional()
  @IsString()
  query?: string

  @IsOptional()
  @IsIn(serviceCategories)
  category?: (typeof serviceCategories)[number]

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

export class CreateQuoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  preferredDate?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  preferredTime?: string

  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  notes!: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string
}
