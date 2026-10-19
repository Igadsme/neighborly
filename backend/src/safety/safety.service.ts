import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ReportStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CreateReportDto, ResolveReportDto } from './dto'

@Injectable()
export class SafetyService {
  constructor(private readonly prisma: PrismaService) {}

  async block(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) throw new BadRequestException('You cannot block yourself')
    const target = await this.prisma.user.findFirst({
      where: { id: blockedId, status: 'ACTIVE' },
      select: { id: true },
    })
    if (!target) throw new NotFoundException('User not found')
    await this.prisma.blockedUser.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
    })
    return { blocked: true }
  }

  async unblock(blockerId: string, blockedId: string) {
    const result = await this.prisma.blockedUser.deleteMany({ where: { blockerId, blockedId } })
    return { blocked: false, changed: result.count > 0 }
  }

  listBlocks(userId: string) {
    return this.prisma.blockedUser.findMany({
      where: { blockerId: userId },
      select: {
        blockedId: true,
        createdAt: true,
        blocked: {
          select: {
            profile: { select: { firstName: true, lastName: true, displayName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async assertInteractionAllowed(firstUserId: string, secondUserId: string) {
    const blocked = await this.prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: firstUserId, blockedId: secondUserId },
          { blockerId: secondUserId, blockedId: firstUserId },
        ],
      },
      select: { blockerId: true },
    })
    if (blocked) throw new ForbiddenException('This interaction is unavailable')
  }

  async report(reporterId: string, input: CreateReportDto) {
    await this.assertTargetExists(input.targetType, input.targetId)
    if (input.targetType === 'USER' && input.targetId === reporterId) {
      throw new BadRequestException('You cannot report yourself')
    }
    const recent = await this.prisma.report.findFirst({
      where: {
        reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        status: { in: ['OPEN', 'REVIEWING'] },
      },
      select: { id: true },
    })
    if (recent) throw new ConflictException('You already have an open report for this item')
    return this.prisma.report.create({
      data: {
        reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason.trim(),
        details: input.details?.trim(),
      },
      select: { id: true, targetType: true, targetId: true, reason: true, status: true, createdAt: true },
    })
  }

  listReports(status?: ReportStatus) {
    return this.prisma.report.findMany({
      where: status ? { status } : undefined,
      include: {
        reporter: { select: { id: true, email: true, profile: true } },
        actions: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    })
  }

  async resolveReport(actorId: string, reportId: string, input: ResolveReportDto) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } })
    if (!report) throw new NotFoundException('Report not found')
    return this.prisma.$transaction(async (tx) => {
      await tx.moderationAction.create({
        data: {
          reportId,
          actorId,
          action: input.action.trim(),
          note: input.note?.trim(),
        },
      })
      return tx.report.update({ where: { id: reportId }, data: { status: input.status } })
    })
  }

  private async assertTargetExists(type: CreateReportDto['targetType'], id: string) {
    const exists = type === 'USER'
      ? await this.prisma.user.findUnique({ where: { id }, select: { id: true } })
      : type === 'LISTING'
        ? await this.prisma.listing.findUnique({ where: { id }, select: { id: true } })
        : type === 'REQUEST'
          ? await this.prisma.needRequest.findUnique({ where: { id }, select: { id: true } })
          : await this.prisma.message.findUnique({ where: { id }, select: { id: true } })
    if (!exists) throw new NotFoundException('Reported item not found')
  }
}
