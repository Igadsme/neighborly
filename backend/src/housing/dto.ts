import { Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'
import { queryBoolean } from '../common/query-boolean'
import { housingListingTypes, housingPropertyTypes, housingSorts } from '../common/vertical-values'

export class CreateHousingDto {
  @IsString()
  @MinLength(3)
  @MaxLength(140)
  title!: string

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description!: string

  @IsIn(housingPropertyTypes)
  type!: (typeof housingPropertyTypes)[number]

  @IsIn(housingListingTypes)
  listingType!: (typeof housingListingTypes)[number]

  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceCents!: number

  @IsOptional()
  @IsString()
  @MaxLength(16)
  priceUnit?: string

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  beds!: number

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  baths!: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  sqft?: number

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
  @MaxLength(80)
  available?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lease?: string

  @IsOptional()
  @IsBoolean()
  pets?: boolean

  @IsOptional()
  @IsBoolean()
  furnished?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(80)
  utilities?: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  imageKeys?: string[]

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

export class UpdateHousingDto {
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
  @IsIn(housingPropertyTypes)
  type?: (typeof housingPropertyTypes)[number]

  @IsOptional()
  @IsIn(housingListingTypes)
  listingType?: (typeof housingListingTypes)[number]

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceCents?: number

  @IsOptional()
  @IsString()
  @MaxLength(16)
  priceUnit?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  beds?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  baths?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  sqft?: number

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
  @MaxLength(80)
  available?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lease?: string

  @IsOptional()
  @IsBoolean()
  pets?: boolean

  @IsOptional()
  @IsBoolean()
  furnished?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(80)
  utilities?: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  imageKeys?: string[]

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

export class ListHousingQuery {
  @IsOptional()
  @IsString()
  query?: string

  @IsOptional()
  @IsIn(housingListingTypes)
  listingType?: (typeof housingListingTypes)[number]

  @IsOptional()
  @IsIn(housingPropertyTypes)
  type?: (typeof housingPropertyTypes)[number]

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minBeds?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPriceCents?: number

  @IsOptional()
  @queryBoolean()
  @IsBoolean()
  pets?: boolean

  @IsOptional()
  @queryBoolean()
  @IsBoolean()
  furnished?: boolean

  @IsOptional()
  @queryBoolean()
  @IsBoolean()
  verified?: boolean

  @IsOptional()
  @queryBoolean()
  @IsBoolean()
  utilitiesIncluded?: boolean

  @IsOptional()
  @IsIn(housingSorts)
  sort: (typeof housingSorts)[number] = 'newest'

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
