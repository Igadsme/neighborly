import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { SendMessageDto } from './dto'
import { CreateConversationDto } from './create-conversation.dto'
import { MessagingGateway } from './messaging.gateway'
import { MessagingService } from './messaging.service'

@ApiTags('messaging')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('conversations')
export class MessagingController {
  constructor(private readonly messaging: MessagingService, private readonly gateway: MessagingGateway) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) { return this.messaging.listConversations(req.user.id) }

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() input: CreateConversationDto) {
    return this.messaging.createConversation(req.user.id, input.participantId)
  }

  @Get(':id/messages')
  messages(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.messaging.listMessages(req.user.id, id) }

  @Post(':id/messages')
  async send(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: SendMessageDto) {
    const message = await this.messaging.sendMessage(req.user.id, id, input.body)
    this.gateway.publishMessage(id, message)
    return message
  }

  @Patch(':id/read')
  async read(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const participant = await this.messaging.markRead(req.user.id, id)
    this.gateway.publishReadReceipt(id, req.user.id, participant.lastReadAt ?? new Date())
    return participant
  }
}
