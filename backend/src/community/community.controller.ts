import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { CommunityService } from './community.service'
import { CommunityQueryDto, CreateCommentDto, CreateEventDto, CreatePostDto, ReactToPostDto, RsvpDto } from './dto'

@ApiTags('community')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('community')
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  @Get('posts')
  posts(@Req() request: AuthenticatedRequest, @Query() query: CommunityQueryDto) {
    return this.community.listPosts(request.user.id, query)
  }

  @Post('posts')
  createPost(@Req() request: AuthenticatedRequest, @Body() input: CreatePostDto) {
    return this.community.createPost(request.user.id, input)
  }

  @Post('posts/:id/comments')
  comment(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: CreateCommentDto) {
    return this.community.comment(request.user.id, id, input)
  }

  @Post('posts/:id/reactions')
  react(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: ReactToPostDto) {
    return this.community.react(request.user.id, id, input)
  }

  @Delete('posts/:id')
  deletePost(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.community.deletePost(request.user.id, id)
  }

  @Get('events')
  events(@Req() request: AuthenticatedRequest, @Query() query: CommunityQueryDto) {
    return this.community.listEvents(request.user.id, query)
  }

  @Post('events')
  createEvent(@Req() request: AuthenticatedRequest, @Body() input: CreateEventDto) {
    return this.community.createEvent(request.user.id, input)
  }

  @Post('events/:id/rsvp')
  rsvp(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: RsvpDto) {
    return this.community.rsvp(request.user.id, id, input)
  }

  @Delete('events/:id')
  cancelEvent(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.community.cancelEvent(request.user.id, id)
  }
}
