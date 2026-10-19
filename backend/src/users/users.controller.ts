import { Body, Controller, Delete, Get, Param, Patch, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { CompleteOnboardingDto, DeleteAccountDto, UpdateProfileDto } from './dto'
import { UsersService } from './users.service'

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@Req() req: AuthenticatedRequest) {
    return this.users.me(req.user.id)
  }

  @Patch('me/onboarding')
  completeOnboarding(@Req() req: AuthenticatedRequest, @Body() input: CompleteOnboardingDto) {
    return this.users.completeOnboarding(req.user.id, input)
  }

  @Patch('me')
  updateProfile(@Req() req: AuthenticatedRequest, @Body() input: UpdateProfileDto) {
    return this.users.updateProfile(req.user.id, input)
  }

  @Get('me/export')
  exportData(@Req() req: AuthenticatedRequest) {
    return this.users.exportData(req.user.id)
  }

  @Delete('me')
  deleteAccount(@Req() req: AuthenticatedRequest, @Body() input: DeleteAccountDto) {
    return this.users.deleteAccount(req.user.id, input)
  }

  @Get(':id/profile')
  publicProfile(@Param('id') id: string) {
    return this.users.publicProfile(id)
  }
}
