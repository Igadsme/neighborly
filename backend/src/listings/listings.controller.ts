import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../auth/auth.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { CompleteListingImageUploadDto, CreateListingImageUploadDto, CreateListingDto, ListListingsQuery, ReorderListingImagesDto, SaveSearchDto, UpdateListingDto } from './dto'
import { ListingsService } from './listings.service'

@ApiTags('listings')
@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

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

  @Get('mine')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  mine(@Req() request: AuthenticatedRequest) {
    return this.listings.listMine(request.user.id)
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.listings.get(id)
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  create(@Req() request: AuthenticatedRequest, @Body() input: CreateListingDto) {
    return this.listings.create(request.user.id, input)
  }

  @Post(':id/publish')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  publish(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.listings.publish(request.user.id, id)
  }

  @Post(':id/images/upload')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  createImageUpload(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() input: CreateListingImageUploadDto,
  ) {
    return this.listings.createImageUpload(request.user.id, id, input)
  }

  @Post(':id/images/complete')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  completeImageUpload(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() input: CompleteListingImageUploadDto,
  ) {
    return this.listings.completeImageUpload(request.user.id, id, input)
  }

  @Post(':id/images/reorder')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  reorderImages(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() input: ReorderListingImagesDto,
  ) {
    return this.listings.reorderImages(request.user.id, id, input)
  }

  @Delete(':id/images/:imageId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  deleteImage(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.listings.deleteImage(request.user.id, id, imageId)
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  update(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: UpdateListingDto) {
    return this.listings.update(request.user.id, id, input)
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  archive(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.listings.archive(request.user.id, id)
  }

  @Post(':id/favorite')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  favorite(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.listings.toggleFavorite(request.user.id, id)
  }

  @Post('saved-searches')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  saveSearch(@Req() request: AuthenticatedRequest, @Body() input: SaveSearchDto) {
    return this.listings.saveSearch(request.user.id, input)
  }

  @Delete('saved-searches/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  deleteSavedSearch(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.listings.deleteSavedSearch(request.user.id, id)
  }
}
