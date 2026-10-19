import { IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

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

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  neighborhood?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  state?: string
}

export class DeleteAccountDto {
  @IsString()
  @MinLength(1)
  password!: string
}
