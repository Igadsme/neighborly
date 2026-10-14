import {
  IsBoolean,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from 'class-validator'

export class CompleteOnboardingDto {
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
  @MaxLength(40)
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

/**
 * Every property is optional so the route is a true partial update, and
 * every property maps onto exactly one `Profile` column. `avatarUrl` is
 * deliberately absent: it is only ever set from a validated upload.
 */
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
  @MaxLength(80)
  displayName?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string

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
  @MaxLength(40)
  state?: string
}

export class UpdatePrivacyDto {
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

/** Changing the address requires live proof of the current password. */
export class ChangeEmailDto {
  @IsEmail()
  @MaxLength(254)
  email!: string

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string
}

export class DeleteAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  confirm!: string
}