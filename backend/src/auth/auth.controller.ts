import { Body, Controller, Post, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { clientAddress, enforceRateLimit } from '../common/rate-limit'
import { AuthService } from './auth.service'
import { LoginDto, RegisterDto } from './dto'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Req() request: { headers?: Record<string, string | string[] | undefined>; ip?: string }, @Body() input: RegisterDto) {
    await enforceRateLimit('authRegister', clientAddress(request))
    return this.auth.register(input)
  }

  @Post('login')
  async login(@Req() request: { headers?: Record<string, string | string[] | undefined>; ip?: string }, @Body() input: LoginDto) {
    await enforceRateLimit('authLogin', clientAddress(request))
    return this.auth.login(input)
  }
}
