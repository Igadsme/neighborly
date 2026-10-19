import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { clientAddress, enforceRateLimit } from '../common/rate-limit'
import { AuthService } from './auth.service'
import { CsrfGuard, hasSetCookie, newCsrfToken } from './csrf.guard'
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  ResendVerificationDto,
  VerifyEmailDto
} from './dto'
import { CSRF_COOKIE, csrfCookieAttributes, REFRESH_COOKIE, refreshCookieAttributes } from './session-cookie'
import { AuthenticatedRequest } from './auth.types'
import { AuthGuard } from './auth.guard'

const SESSION_COOKIE_MAX_AGE = Math.floor((7 * 24 * 60 * 60 * 1000) / 1000)

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() input: RegisterDto
  ) {
    await enforceRateLimit('authRegister', clientAddress(request))
    const result = await this.auth.register(input, metaFrom(request))
    this.writeCookies(response, result.refreshToken)
    return publicAuth(result)
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() input: LoginDto
  ) {
    await enforceRateLimit('authLogin', clientAddress(request))
    const result = await this.auth.login(input, metaFrom(request))
    this.writeCookies(response, result.refreshToken)
    return publicAuth(result)
  }

  /**
   * Cookie-authenticated, so it is CSRF-guarded. Returns a fresh access
   * token and a rotated refresh cookie.
   */
  @Post('refresh')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.refresh(cookieValue(request), metaFrom(request))
    this.writeCookies(response, result.refreshToken)
    return publicAuth(result)
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(CsrfGuard)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(cookieValue(request))
    this.clearCookies(response)
  }

  @Post('logout-all')
  @ApiBearerAuth()
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async logoutAll(@Req() req: AuthenticatedRequest) {
    await this.auth.revokeAllSessions(req.user.id, 'logout_all')
  }

  @Get('sessions')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  sessions(@Req() req: AuthenticatedRequest) {
    return this.auth.listSessions(req.user.id)
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async revokeSession(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    await this.auth.revokeSession(req.user.id, id)
  }

  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Req() request: Request, @Body() input: VerifyEmailDto) {
    await enforceRateLimit('authVerify', clientAddress(request))
    return this.auth.verifyEmail(input.token)
  }

  @Post('resend-verification')
  @ApiBearerAuth()
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async resend(@Req() req: AuthenticatedRequest, @Body() input: ResendVerificationDto) {
    await enforceRateLimit('authResend', req.user.id)
    return this.auth.requestVerification(req.user.id, { email: input.email })
  }

  @Post('forgot-password')
  @HttpCode(202)
  async forgotPassword(@Req() request: Request, @Body() input: ForgotPasswordDto) {
    // Throttled by address so the endpoint cannot be used to probe or to
    // mail-bomb a single target.
    await enforceRateLimit('authForgotPassword', clientAddress(request))
    return this.auth.forgotPassword(input.email)
  }

  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Req() request: Request, @Body() input: ResetPasswordDto) {
    await enforceRateLimit('authResetPassword', clientAddress(request))
    return this.auth.resetPassword(input)
  }

  @Post('change-password')
  @ApiBearerAuth()
  @HttpCode(200)
  @UseGuards(AuthGuard)
  changePassword(@Req() req: AuthenticatedRequest, @Body() input: ChangePasswordDto) {
    return this.auth.changePassword(req.user.id, input.currentPassword, input.password)
  }

  private writeCookies(response: Response, refreshToken: string) {
    response.cookie(REFRESH_COOKIE, refreshToken, refreshCookieAttributes(SESSION_COOKIE_MAX_AGE))
    // The double-submit CSRF cookie is issued alongside the session so the
    // browser already holds it before its first cookie-authenticated
    // mutation. Register and login are the only unauthenticated writers,
    // which is why the cookie is minted here rather than only in the guard.
    if (!hasSetCookie(response, CSRF_COOKIE)) {
      response.cookie(CSRF_COOKIE, newCsrfToken(), csrfCookieAttributes())
    }
  }

  private clearCookies(response: Response) {
    response.clearCookie(REFRESH_COOKIE, refreshCookieAttributes(0))
    response.clearCookie(CSRF_COOKIE, csrfCookieAttributes())
  }
}

function publicAuth(result: { accessToken: string; user: unknown }) {
  return { user: result.user, accessToken: result.accessToken }
}

function metaFrom(request: Request) {
  const header = request.headers['user-agent']
  return {
    userAgent: Array.isArray(header) ? header[0] : header,
    ipAddress: clientAddress(request)
  }
}

function cookieValue(request: Request): string | undefined {
  const raw = request.headers.cookie
  if (typeof raw !== 'string') return undefined
  for (const part of raw.split(';')) {
    const index = part.indexOf('=')
    if (index < 1) continue
    if (part.slice(0, index).trim() === REFRESH_COOKIE) {
      return decodeURIComponent(part.slice(index + 1).trim())
    }
  }
  return undefined
}

