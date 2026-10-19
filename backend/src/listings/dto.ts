import { Transform, Type } from 'class-transformer'
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, Matches } from 'class-validator'

const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp']

export class CreateListingImageUploadDto {
  @IsIn(allowedImageTypes)
  contentType!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024)
  sizeBytes!: number
}

export class CompleteListingImageUploadDto {
  @IsString()
  @MaxLength(256)
  @Matches(/^listings\/[0-9a-f-]+\/[0-9a-f-]+\/[0-9a-f-]+\.(jpg|png|webp)$/i)
  key!: string
}

export class ReorderListingImagesDto {
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  imageIds!: string[]
}

export class CreateListingDto {
  @IsUUID()
  categoryId!: string

  @IsString()
  @MinLength(3)
  @MaxLength(140)
  title!: string

  @IsString()
  @MinLength(10)
  description!: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceCents?: number

  @IsOptional()
  @IsString()
  condition?: string

  @IsOptional()
  @IsString()
  neighborhood?: string

  @IsOptional()
  @IsString()
  city?: string

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

export class ListListingsQuery {
  @IsOptional()
  @IsString()
  query?: string

  @IsOptional()
  @IsUUID()
  categoryId?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPriceCents?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPriceCents?: number

  @IsOptional()
  @IsString()
  condition?: string

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  freeOnly?: boolean

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  deliveryAvailable?: boolean

  @IsOptional()
  @IsIn(['newest', 'price_asc', 'price_desc'])
  sort?: 'newest' | 'price_asc' | 'price_desc'

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

export class UpdateListingDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(140)
  title?: string

  @IsOptional()
  @IsString()
  @MinLength(10)
  description?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceCents?: number

  @IsOptional()
  @IsString()
  condition?: string

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

export class SaveSearchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  query!: string

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>
}
