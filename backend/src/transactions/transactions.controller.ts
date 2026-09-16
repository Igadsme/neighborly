import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { TransitionTransactionDto } from './dto'
import { TransactionsService } from './transactions.service'

@ApiTags('transactions')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}
  @Get()
  list(@Req() req: AuthenticatedRequest) { return this.transactions.list(req.user.id) }
  @Patch(':id/status')
  transition(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: TransitionTransactionDto) {
    return this.transactions.transition(req.user.id, id, input)
  }
}
