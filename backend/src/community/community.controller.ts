import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { CommunityService } from './community.service'
import {
  CreateCommentDto,
  CreateEventDto,
  CreateGiveawayDto,
  CreateLostFoundDto,
  CreatePostDto,
  ListLimitQuery,
  ListPostsQuery,
  ReactionDto,
  UpdateEventDto,
  UpdateGiveawayDto,
  UpdateLostFoundDto,
  UpdatePostDto
} from './dto'

@ApiTags('community')
@Controller('community')
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  @Get('summary')
  summary() {
    return this.community.summary()
  }

  @Get('posts')
  listPosts(@Query() query: ListPostsQuery) {
    return this.community.listPosts(query)
  }

  @Post('posts')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  createPost(@Req() request: AuthenticatedRequest, @Body() input: CreatePostDto) {
    return this.community.createPost(request.user.id, input)
  }

  @Get('posts/:id')
  getPost(@Param('id') id: string) {
    return this.community.getPost(id)
  }

  @Patch('posts/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  updatePost(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: UpdatePostDto) {
    return this.community.updatePost(request.user.id, id, input)
  }

  @Delete('posts/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  archivePost(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.community.archivePost(request.user.id, id)
  }

  @Post('posts/:id/reactions')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  react(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: ReactionDto) {
    return this.community.react(request.user.id, id, input)
  }

  @Get('posts/:id/comments')
  comments(@Param('id') id: string) {
    return this.community.listComments(id)
  }

  @Post('posts/:id/comments')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  comment(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: CreateCommentDto) {
    return this.community.createComment(request.user.id, id, input)
  }

  @Get('events')
  listEvents(@Query() query: ListLimitQuery) {
    return this.community.listEvents(query)
  }

  @Post('events')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  createEvent(@Req() request: AuthenticatedRequest, @Body() input: CreateEventDto) {
    return this.community.createEvent(request.user.id, input)
  }

  @Get('events/:id')
  getEvent(@Param('id') id: string) {
    return this.community.getEvent(id)
  }

  @Patch('events/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  updateEvent(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: UpdateEventDto) {
    return this.community.updateEvent(request.user.id, id, input)
  }

  @Delete('events/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  archiveEvent(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.community.archiveEvent(request.user.id, id)
  }

  @Post('events/:id/rsvp')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  rsvp(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.community.toggleRsvp(request.user.id, id)
  }

  @Get('lost-found')
  listLostFound(@Query() query: ListLimitQuery) {
    return this.community.listLostFound(query)
  }

  @Post('lost-found')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  createLostFound(@Req() request: AuthenticatedRequest, @Body() input: CreateLostFoundDto) {
    return this.community.createLostFound(request.user.id, input)
  }

  @Get('lost-found/:id')
  getLostFound(@Param('id') id: string) {
    return this.community.getLostFound(id)
  }

  @Patch('lost-found/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  updateLostFound(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: UpdateLostFoundDto) {
    return this.community.updateLostFound(request.user.id, id, input)
  }

  @Delete('lost-found/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  archiveLostFound(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.community.archiveLostFound(request.user.id, id)
  }

  @Get('giveaways')
  listGiveaways(@Query() query: ListLimitQuery) {
    return this.community.listGiveaways(query)
  }

  @Post('giveaways')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  createGiveaway(@Req() request: AuthenticatedRequest, @Body() input: CreateGiveawayDto) {
    return this.community.createGiveaway(request.user.id, input)
  }

  @Get('giveaways/:id')
  getGiveaway(@Param('id') id: string) {
    return this.community.getGiveaway(id)
  }

  @Patch('giveaways/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  updateGiveaway(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: UpdateGiveawayDto) {
    return this.community.updateGiveaway(request.user.id, id, input)
  }

  @Delete('giveaways/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  archiveGiveaway(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.community.archiveGiveaway(request.user.id, id)
  }

  @Post('giveaways/:id/claim')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  claim(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.community.claimGiveaway(request.user.id, id)
  }
}
