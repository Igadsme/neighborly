import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class RegisterDto {
  @IsEmail()
  email!: string

  @IsString()
  @MinLength(12)
  password!: string

  @IsString()
  @MinLength(1)
  firstName!: string

  @IsString()
  @MinLength(1)
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
  email!: string

  @IsString()
  @MinLength(1)
  password!: string
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token!: string

  @IsString()
  @MinLength(12)
  @MaxLength(256)
  password!: string
}

export class ConfirmEmailDto {
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token!: string
}
