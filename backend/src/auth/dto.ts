import { registerDecorator } from 'class-validator'
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

/**
 * Password strength rules enforced identically on both sides of the wire.
 * A 12-character minimum with a character-class mix rejects the obvious
 * choices without rejecting long passphrases.
 */
export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 128

export function passwordProblem(password: string): string | undefined {
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`
  if (password.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters`
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter'
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter'
  if (!/[0-9]/.test(password)) return 'Password must include a number'
  return undefined
}

/**
 * Whitelisting is on globally, so unknown fields are already rejected. The
 * pattern keeps the client and the server agreeing on one strength rule.
 */
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])[\x21-\x7e]{12,128}$/
export const PASSWORD_MESSAGE =
  'Password must be 12-128 characters and include a lowercase letter, an uppercase letter, and a number'

export function PasswordRule(options?: { each?: boolean }) {
  // Mixin keeps the rule on a single field name across DTOs.
  return function (target: object, propertyKey: string) {
    registerDecorator({
      name: 'isPassword',
      target: target.constructor,
      propertyName: propertyKey,
      constraints: [PASSWORD_PATTERN],
      options,
      validator: {
        validate: (value: unknown) => typeof value === 'string' && PASSWORD_PATTERN.test(value),
        defaultMessage: () => PASSWORD_MESSAGE
      }
    })
  }
}

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  email!: string

  @IsString()
  @PasswordRule()
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

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(16)
  @MaxLength(512)
  token!: string

  @IsString()
  @PasswordRule()
  password!: string
}

export class VerifyEmailDto {
  @IsString()
  @MinLength(16)
  @MaxLength(512)
  token!: string
}

export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(254)
  email!: string
}

export class ResendVerificationDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string

  @IsString()
  @PasswordRule()
  password!: string
}