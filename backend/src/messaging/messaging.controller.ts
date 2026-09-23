import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { CreateConversationDto, SendMessageDto } from './dto'
import { MessagingService } from './messaging.service'

@ApiTags('messaging')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('conversations')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) { return this.messaging.listConversations(req.user.id) }

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() input: CreateConversationDto) {
    return this.messaging.createConversation(req.user.id, input)
  }

  @Get(':id/messages')
  messages(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.messaging.listMessages(req.user.id, id) }

  @Post(':id/messages')
  async send(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: SendMessageDto) {
    return this.messaging.sendMessage(req.user.id, id, input.body)
  }

  @Patch(':id/read')
  read(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.messaging.markRead(req.user.id, id) }
}
