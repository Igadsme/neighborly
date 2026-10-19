import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { AuthService } from './auth.service'
import { AuthGuard } from './auth.guard'
import { ConfirmEmailDto, ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './dto'

const REFRESH_COOKIE = 'neighborly.refresh_token'

function cookieValue(request: Request) {
  return request.headers.cookie
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === REFRESH_COOKIE)?.[1]
}

function sessionContext(request: Request) {
  return {
    ipAddress: request.ip,
    userAgent: request.headers['user-agent']?.slice(0, 500),
  }
}

function setRefreshCookie(response: Response, token: string) {
  response.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/api/v1/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Body() input: RegisterDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const { refreshToken, ...result } = await this.auth.register(input, sessionContext(request))
    setRefreshCookie(response, refreshToken)
    return result
  }

  @Post('login')
  async login(@Body() input: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const { refreshToken, ...result } = await this.auth.login(input, sessionContext(request))
    setRefreshCookie(response, refreshToken)
    return result
  }

  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const { refreshToken, ...result } = await this.auth.refresh(cookieValue(request), sessionContext(request))
    setRefreshCookie(response, refreshToken)
    return result
  }

  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.logout(cookieValue(request))
    response.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' })
    return result
  }

  @Post('logout-all')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async logoutAll(@Req() request: Request & { user: { id: string } }, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.logoutAll(request.user.id)
    response.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' })
    return result
  }

  @Post('forgot-password')
  forgotPassword(@Body() input: ForgotPasswordDto) {
    return this.auth.forgotPassword(input.email)
  }

  @Post('reset-password')
  resetPassword(@Body() input: ResetPasswordDto) {
    return this.auth.resetPassword(input.token, input.password)
  }

  @Post('verify-email/request')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  requestEmailVerification(@Req() request: Request & { user: { id: string } }) {
    return this.auth.requestEmailVerification(request.user.id)
  }

  @Post('verify-email/confirm')
  confirmEmail(@Body() input: ConfirmEmailDto) {
    return this.auth.confirmEmail(input.token)
  }
}
