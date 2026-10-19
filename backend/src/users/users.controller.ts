import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { enforceRateLimit } from '../common/rate-limit'
import { AccountService } from './account.service'
import {
  ChangeEmailDto,
  CompleteOnboardingDto,
  DeleteAccountDto,
  UpdatePrivacyDto,
  UpdateProfileDto
} from './dto'
import { UsersService } from './users.service'

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly account: AccountService
  ) {}

  @Get('me')
  me(@Req() req: AuthenticatedRequest) {
    return this.users.me(req.user.id)
  }

  @Patch('me/onboarding')
  async completeOnboarding(@Req() req: AuthenticatedRequest, @Body() input: CompleteOnboardingDto) {
    await enforceRateLimit('profile', req.user.id)
    return this.users.completeOnboarding(req.user.id, input)
  }

  @Get('me/status')
  status(@Req() req: AuthenticatedRequest) {
    return this.account.status(req.user.id)
  }

  @Patch('me/profile')
  async updateProfile(@Req() req: AuthenticatedRequest, @Body() input: UpdateProfileDto) {
    await enforceRateLimit('profile', req.user.id)
    return this.account.updateProfile(req.user.id, input)
  }

  @Patch('me/privacy')
  async updatePrivacy(@Req() req: AuthenticatedRequest, @Body() input: UpdatePrivacyDto) {
    await enforceRateLimit('profile', req.user.id)
    return this.account.updatePrivacy(req.user.id, input)
  }

  @Post('me/email')
  async changeEmail(@Req() req: AuthenticatedRequest, @Body() input: ChangeEmailDto) {
    await enforceRateLimit('accountEmail', req.user.id)
    return this.account.requestEmailChange(req.user.id, input, input.currentPassword)
  }

  @Delete('me/email/pending')
  async cancelEmailChange(@Req() req: AuthenticatedRequest) {
    await enforceRateLimit('accountEmail', req.user.id)
    return this.account.cancelEmailChange(req.user.id)
  }

  @Get('me/sessions')
  sessions(@Req() req: AuthenticatedRequest) {
    return this.account.listSessions(req.user.id)
  }

  @Delete('me/sessions/:id')
  @HttpCode(204)
  revokeSession(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.account.revokeSession(req.user.id, id)
  }

  @Post('me/sessions/revoke-all')
  @HttpCode(204)
  logoutAll(@Req() req: AuthenticatedRequest) {
    return this.account.logoutAll(req.user.id)
  }

  @Delete('me')
  async deleteAccount(@Req() req: AuthenticatedRequest, @Body() input: DeleteAccountDto) {
    // Deletion is irreversible, so it is throttled per account on top of
    // the password confirmation the body requires.
    await enforceRateLimit('authForgotPassword', req.user.id)
    return this.account.deleteAccount(req.user.id, input)
  }
}