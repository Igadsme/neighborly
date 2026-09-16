import { IsArray, IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator'

export class CompleteOnboardingDto {
  @IsOptional()
  @IsString()
  neighborhood?: string

  @IsOptional()
  @IsString()
  city?: string

  @IsOptional()
  @IsString()
  state?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capabilities?: string[]

  @IsOptional()
  @IsBoolean()
  newListings?: boolean

  @IsOptional()
  @IsBoolean()
  priceDrops?: boolean

  @IsOptional()
  @IsBoolean()
  messages?: boolean

  @IsOptional()
  @IsBoolean()
  events?: boolean

  @IsOptional()
  @IsBoolean()
  community?: boolean
}
