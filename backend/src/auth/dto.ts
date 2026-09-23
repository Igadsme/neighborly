import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  email!: string

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string

  @IsOptional()
  @IsString()
  neighborhood?: string

  @IsOptional()
  @IsString()
  city?: string

  @IsOptional()
  @IsString()
  state?: string
}

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string
}
