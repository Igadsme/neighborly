import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { enforceRateLimit } from '../common/rate-limit'
import { maxUploadBytes } from '../common/uploads'
import { StorageService } from '../storage/storage.service'
import {
  AttachImagesDto,
  CreateListingDto,
  ListListingsQuery,
  MyListingsQuery,
  ReorderImagesDto,
  SaveSearchDto,
  UpdateListingDto,
  UpdateSavedSearchDto
} from './dto'
import { ListingsService } from './listings.service'

@ApiTags('listings')
@Controller('listings')
export class ListingsController {
  constructor(
    private readonly listings: ListingsService,
    private readonly storage: StorageService
  ) {}

  @Get()
  list(@Query() query: ListListingsQuery) {
    return this.listings.list(query)
  }

  @Get('favorites')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  favorites(@Req() request: AuthenticatedRequest) {
    return this.listings.listFavorites(request.user.id)
  }

  @Get('saved-searches')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  savedSearches(@Req() request: AuthenticatedRequest) {
    return this.listings.listSavedSearches(request.user.id)
  }

  @Patch('saved-searches/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  updateSavedSearch(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateSavedSearchDto
  ) {
    return this.listings.updateSavedSearch(request.user.id, id, input)
  }

  @Delete('saved-searches/:id')
  @ApiBearerAuth()
  @HttpCode(204)
  @UseGuards(AuthGuard)
  deleteSavedSearch(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.listings.deleteSavedSearch(request.user.id, id)
  }

  @Post('saved-searches')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  saveSearch(@Req() request: AuthenticatedRequest, @Body() input: SaveSearchDto) {
    return this.listings.saveSearch(request.user.id, input)
  }

  @Get('neighborhoods')
  neighborhoods() {
    return this.listings.neighborhoodCounts()
  }

  @Get('storage-status')
  storageStatus() {
    return { configured: this.storage.isConfigured() }
  }

  @Get('mine')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  mine(@Req() request: AuthenticatedRequest, @Query() query: MyListingsQuery) {
    return this.listings.listMine(request.user.id, query)
  }

  @Get(':id')
  get(@Param('id') id: string, @Query('latitude') latitude?: string, @Query('longitude') longitude?: string) {
    return this.listings.get(id, {
      latitude: latitude === undefined ? undefined : Number(latitude),
      longitude: longitude === undefined ? undefined : Number(longitude)
    })
  }

  @Get(':id/manage')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  manage(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.listings.getForOwner(request.user.id, id)
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async create(@Req() request: AuthenticatedRequest, @Body() input: CreateListingDto) {
    await enforceRateLimit('listings', request.user.id)
    return this.listings.create(request.user.id, input)
  }

  @Post('drafts')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async saveDraft(@Req() request: AuthenticatedRequest, @Body() input: Partial<CreateListingDto>) {
    await enforceRateLimit('listings', request.user.id)
    return this.listings.saveDraft(request.user.id, input)
  }

  @Post(':id/publish')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  publish(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.listings.publish(request.user.id, id)
  }

  @Post(':id/pause')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  pause(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.listings.pause(request.user.id, id)
  }

  @Post(':id/sold')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  markSold(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.listings.markSold(request.user.id, id)
  }

  @Post(':id/restore')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  restore(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.listings.restore(request.user.id, id)
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() input: UpdateListingDto
  ) {
    return this.listings.update(request.user.id, id, input)
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  archive(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.listings.archive(request.user.id, id)
  }

  /**
   * Permanent removal, distinct from archive. Archive keeps the listing
   * recoverable; this one detaches dependent history and deletes media.
   */
  @Delete(':id/permanent')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  remove(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.listings.remove(request.user.id, id)
  }

  @Post(':id/favorite')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  favorite(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.listings.toggleFavorite(request.user.id, id)
  }

  @Post(':id/images')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: maxUploadBytes() } }))
  async uploadImage(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFile() file?: { buffer?: Buffer; mimetype?: string; size?: number }
  ) {
    await enforceRateLimit('listingImages', request.user.id)
    // `FileInterceptor` already enforced the byte cap; this catches the case
    // where the stream was truncated before the limit was applied.
    if (file?.size !== undefined && file.size > maxUploadBytes()) {
      throw new BadRequestException('Image exceeds the upload size limit')
    }
    return this.listings.addImage(request.user.id, id, file ?? {})
  }

  @Post(':id/images/attach')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  attachImages(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: AttachImagesDto) {
    return this.listings.attachImages(request.user.id, id, input)
  }

  @Post(':id/images/reorder')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  reorderImages(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: ReorderImagesDto) {
    return this.listings.reorderImages(request.user.id, id, input)
  }

  @Delete(':id/images/:imageId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  removeImage(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string
  ) {
    return this.listings.removeImage(request.user.id, id, imageId)
  }
}