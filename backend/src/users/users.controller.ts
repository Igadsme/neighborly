import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { CompleteOnboardingDto } from './dto'
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
}
