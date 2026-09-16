import { Type } from 'class-transformer'
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator'

export class CreateListingDto {
  @IsUUID()
  categoryId!: string

  @IsString()
  @MinLength(3)
  @MaxLength(140)
  title!: string

  @IsString()
  @Min(10)
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
  query!: string

  filters!: Record<string, unknown>
}
