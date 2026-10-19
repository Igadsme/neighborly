import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger'
import { BorrowAvailabilityKind, BorrowDisputeStatus, BorrowHandoffKind } from '@prisma/client'
import type { Response } from 'express'
import { AuthGuard } from '../auth/auth.guard'
import { OptionalAuthGuard } from '../auth/optional-auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { enforceRateLimit } from '../common/rate-limit'
import { StorageService } from '../storage/storage.service'
import { BorrowService } from './borrow.service'
import {
  AddEvidenceDto,
  ConfirmHandoffDto,
  CreateBorrowableItemDto,
  CreateBorrowRequestDto,
  CreateExtensionDto,
  DecideBorrowRequestDto,
  ListBorrowItemsQuery,
  ListBorrowRequestsQuery,
  OpenDisputeDto,
  RecordConditionDto,
  ScheduleHandoffDto,
  UpdateBorrowableItemDto,
  UpdateBorrowRequestDto
} from './dto'

@ApiTags('borrow')
@Controller('borrow')
export class BorrowController {
  constructor(
    private readonly borrow: BorrowService,
    private readonly storage: StorageService
  ) {}

  // ------------------------------------------------------- borrowable items

  @Get('items')
  listItems(@Query() query: ListBorrowItemsQuery) {
    return this.borrow.listItems(query)
  }

  @Get('items/mine')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  myItems(@Req() req: AuthenticatedRequest) {
    return this.borrow.listMyItems(req.user.id)
  }

  @Post('items')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async createItem(@Req() req: AuthenticatedRequest, @Body() input: CreateBorrowableItemDto) {
    await enforceRateLimit('listings', req.user.id)
    return this.borrow.createItem(req.user.id, input as unknown as Record<string, unknown>)
  }

  @Get('items/:listingId')
  @UseGuards(OptionalAuthGuard)
  getItem(
    @Req() req: { user?: { id: string } },
    @Param('listingId', ParseUUIDPipe) listingId: string
  ) {
    return this.borrow.getItem(listingId, req.user?.id)
  }

  @Patch('items/:listingId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  updateItem(
    @Req() req: AuthenticatedRequest,
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @Body() input: UpdateBorrowableItemDto
  ) {
    return this.borrow.updateItem(req.user.id, listingId, input as unknown as Record<string, unknown>)
  }

  @Post('items/:listingId/publish')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  publish(@Req() req: AuthenticatedRequest, @Param('listingId', ParseUUIDPipe) listingId: string) {
    return this.borrow.setItemPublished(req.user.id, listingId, true)
  }

  @Post('items/:listingId/unpublish')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  unpublish(@Req() req: AuthenticatedRequest, @Param('listingId', ParseUUIDPipe) listingId: string) {
    return this.borrow.setItemPublished(req.user.id, listingId, false)
  }

  @Post('items/:listingId/archive')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  archive(@Req() req: AuthenticatedRequest, @Param('listingId', ParseUUIDPipe) listingId: string) {
    return this.borrow.archiveItem(req.user.id, listingId)
  }

  // ------------------------------------------------------------ availability

  @Get('items/:listingId/availability')
  availability(@Param('listingId', ParseUUIDPipe) listingId: string) {
    return this.borrow.listAvailability(listingId)
  }

  @Post('items/:listingId/availability')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  addWindow(
    @Req() req: AuthenticatedRequest,
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @Body() body: { kind: BorrowAvailabilityKind; startsAt: string; endsAt: string; note?: string }
  ) {
    return this.borrow.addAvailabilityWindow(req.user.id, listingId, body)
  }

  @Delete('items/:listingId/availability/:windowId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  removeWindow(
    @Req() req: AuthenticatedRequest,
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @Param('windowId', ParseUUIDPipe) windowId: string
  ) {
    return this.borrow.removeAvailabilityWindow(req.user.id, listingId, windowId)
  }

  // -------------------------------------------------------- borrow requests

  @Get('requests')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  listRequests(@Req() req: AuthenticatedRequest, @Query() query: ListBorrowRequestsQuery) {
    return this.borrow.listRequests(req.user.id, query)
  }

  @Get('requests/:requestId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  getRequest(
    @Req() req: AuthenticatedRequest,
    @Param('requestId', ParseUUIDPipe) requestId: string
  ) {
    return this.borrow.getRequest(req.user.id, requestId)
  }

  @Post('items/:listingId/requests')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async createRequest(
    @Req() req: AuthenticatedRequest,
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @Body() input: CreateBorrowRequestDto
  ) {
    await enforceRateLimit('offers', req.user.id)
    return this.borrow.createRequest(req.user.id, listingId, input)
  }

  @Patch('requests/:requestId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  updateRequest(
    @Req() req: AuthenticatedRequest,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() input: UpdateBorrowRequestDto
  ) {
    return this.borrow.updateRequest(req.user.id, requestId, input)
  }

  @Post('requests/:requestId/approve')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  approve(
    @Req() req: AuthenticatedRequest,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() input: DecideBorrowRequestDto
  ) {
    return this.borrow.decide(req.user.id, requestId, 'approve', input)
  }

  @Post('requests/:requestId/decline')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  decline(
    @Req() req: AuthenticatedRequest,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() input: DecideBorrowRequestDto
  ) {
    return this.borrow.decide(req.user.id, requestId, 'decline', input)
  }

  @Post('requests/:requestId/cancel')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  cancel(@Req() req: AuthenticatedRequest, @Param('requestId', ParseUUIDPipe) requestId: string) {
    // The side is derived from the caller's role in the request, never from
    // the request body, so a borrower cannot cancel as the lender or the
    // reverse.
    return this.borrow.cancelAsParticipant(req.user.id, requestId)
  }

  // ------------------------------------------------------------- handoffs

  @Post('requests/:requestId/pickup')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  schedulePickup(
    @Req() req: AuthenticatedRequest,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() input: ScheduleHandoffDto
  ) {
    return this.borrow.schedulePickup(req.user.id, requestId, input)
  }

  @Post('requests/:requestId/pickup/confirm')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  confirmPickup(
    @Req() req: AuthenticatedRequest,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() input: ConfirmHandoffDto
  ) {
    return this.borrow.confirmHandoff(req.user.id, requestId, BorrowHandoffKind.PICKUP, input)
  }

  @Post('requests/:requestId/pickup/cancel')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  cancelPickup(@Req() req: AuthenticatedRequest, @Param('requestId', ParseUUIDPipe) requestId: string) {
    return this.borrow.cancelHandoff(req.user.id, requestId, BorrowHandoffKind.PICKUP)
  }

  @Post('requests/:requestId/return')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  requestReturn(
    @Req() req: AuthenticatedRequest,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() input: { scheduledAt?: string }
  ) {
    return this.borrow.requestReturn(req.user.id, requestId, input)
  }

  @Post('requests/:requestId/return/confirm')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  confirmReturn(
    @Req() req: AuthenticatedRequest,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() input: ConfirmHandoffDto
  ) {
    return this.borrow.confirmHandoff(req.user.id, requestId, BorrowHandoffKind.RETURN, input)
  }

  @Post('requests/:requestId/complete')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  complete(@Req() req: AuthenticatedRequest, @Param('requestId', ParseUUIDPipe) requestId: string) {
    return this.borrow.complete(req.user.id, requestId)
  }

  @Post('requests/:requestId/condition')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(201)
  recordCondition(
    @Req() req: AuthenticatedRequest,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() input: RecordConditionDto
  ) {
    return this.borrow.recordCondition(req.user.id, requestId, input)
  }

  // ------------------------------------------------------------ extensions

  @Post('requests/:requestId/extensions')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async requestExtension(
    @Req() req: AuthenticatedRequest,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() input: CreateExtensionDto
  ) {
    await enforceRateLimit('offers', req.user.id)
    return this.borrow.requestExtension(req.user.id, requestId, input)
  }

  @Post('extensions/:extensionId/approve')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  approveExtension(
    @Req() req: AuthenticatedRequest,
    @Param('extensionId', ParseUUIDPipe) extensionId: string,
    @Body() input: { note?: string }
  ) {
    return this.borrow.decideExtension(req.user.id, extensionId, 'approve', input)
  }

  @Post('extensions/:extensionId/reject')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  rejectExtension(
    @Req() req: AuthenticatedRequest,
    @Param('extensionId', ParseUUIDPipe) extensionId: string,
    @Body() input: { note?: string }
  ) {
    return this.borrow.decideExtension(req.user.id, extensionId, 'reject', input)
  }

  // -------------------------------------------------------------- disputes

  @Get('disputes')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  listDisputes(@Req() req: AuthenticatedRequest) {
    return this.borrow.listDisputes(req.user.id)
  }

  @Get('disputes/:disputeId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  getDispute(@Req() req: AuthenticatedRequest, @Param('disputeId', ParseUUIDPipe) disputeId: string) {
    return this.borrow.getDispute(req.user.id, disputeId)
  }

  @Post('requests/:requestId/disputes')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async openDispute(
    @Req() req: AuthenticatedRequest,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() input: OpenDisputeDto
  ) {
    await enforceRateLimit('reports', req.user.id)
    return this.borrow.openDispute(req.user.id, requestId, input)
  }

  @Post('disputes/:disputeId/review')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  reviewDispute(
    @Req() req: AuthenticatedRequest,
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
    @Body() body: { status: BorrowDisputeStatus; resolution?: string }
  ) {
    return this.borrow.reviewDispute(req.user.id, disputeId, body.status, { resolution: body.resolution })
  }

  // -------------------------------------------------------------- evidence

  @Get('disputes/:disputeId/evidence')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  listEvidence(@Req() req: AuthenticatedRequest, @Param('disputeId', ParseUUIDPipe) disputeId: string) {
    return this.borrow.listEvidence(req.user.id, disputeId)
  }

  /**
   * Uploads one photo as dispute evidence. Multipart is accepted only on
   * this route; every other borrow endpoint still refuses it, so the JSON
   * body limits cannot be bypassed by posting a file elsewhere.
   */
  @Post('disputes/:disputeId/evidence')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadEvidence(
    @Req() req: AuthenticatedRequest,
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
    @UploadedFile() file: { buffer?: Buffer; mimetype?: string; size?: number } | undefined,
    @Body() body: AddEvidenceDto
  ) {
    await enforceRateLimit('reports', req.user.id)
    // Authorization runs before the bytes are read, so an unrelated member
    // cannot even make the server accept a file.
    const listingId = await this.borrow.evidenceListingId(req.user.id, disputeId)
    if (!file || !file.buffer) {
      return { uploaded: false }
    }
    const stored = await this.storage.putEvidence(listingId, file.buffer, file.mimetype)
    const row = await this.borrow.addEvidence(req.user.id, disputeId, {
      listingId,
      objectKey: stored.objectKey,
      contentType: stored.contentType,
      sizeBytes: stored.size,
      note: body.note
    })
    return { uploaded: true, evidence: row }
  }

  /**
   * Streams one evidence photo. The object key is rebuilt from validated
   * parts and never taken from the URL, and the response is not cached
   * publicly: only a participant or staff can reach it at all.
   */
  @Get('evidence/:evidenceId/file')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async readEvidence(
    @Req() req: AuthenticatedRequest,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Res() response: Response
  ) {
    const objectKey = await this.borrow.evidenceObjectKey(req.user.id, evidenceId)
    const body = await this.storage.get(objectKey).catch(() => undefined)
    if (!body) {
      response.status(404).json({ statusCode: 404, message: 'Not found' })
      return
    }
    response.setHeader('Content-Type', body.contentType)
    // Private: a condition photo can show the inside of a home, so it must
    // not sit in a shared cache.
    response.setHeader('Cache-Control', 'private, no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.end(body.body)
  }
}