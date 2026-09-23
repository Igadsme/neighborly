import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, ReportTargetType } from '@prisma/client'
import { audit } from '../common/logger'
import { publicUserSelect } from '../common/public-user.select'
import { sanitizeOptional, sanitizeText } from '../common/text'
import { PrismaService } from '../prisma/prisma.service'
import { CreateReportDto, ModerationActionDto, ModerationKindName, ReportStatusName, ReportTargetTypeName } from './dto'

const reportSelect = {
  id: true,
  targetType: true,
  targetId: true,
  reason: true,
  details: true,
  status: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.ReportSelect

const staffReportSelect = {
  ...reportSelect,
  reporter: { select: publicUserSelect }
} satisfies Prisma.ReportSelect

@Injectable()
export class SafetyService {
  constructor(private readonly prisma: PrismaService) {}

  async createReport(reporterId: string, input: CreateReportDto) {
    const ownerId = await this.assertReportable(reporterId, input.targetType, input.targetId)
    if (ownerId === reporterId) throw new ConflictException('You cannot report your own content')
    const details = input.details === undefined ? null : sanitizeText(input.details, 2000) || null
    const existing = await this.prisma.report.findUnique({
      where: {
        reporterId_targetType_targetId: {
          reporterId,
          targetType: input.targetType,
          targetId: input.targetId
        }
      },
      select: { id: true }
    })
    if (existing) throw new ConflictException('You already reported this')
    try {
      return await this.prisma.report.create({
        data: {
          reporterId,
          targetType: input.targetType,
          targetId: input.targetId,
          reason: input.reason,
          details,
          status: 'OPEN'
        },
        select: reportSelect
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('You already reported this')
      }
      throw error
    }
  }

  listMine(reporterId: string) {
    return this.prisma.report.findMany({
      where: { reporterId },
      select: reportSelect,
      orderBy: { createdAt: 'desc' }
    })
  }

  async block(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) throw new ConflictException('You cannot block yourself')
    const person = await this.prisma.user.findFirst({
      where: { id: blockedId, deletedAt: null, status: { not: 'DELETED' } },
      select: { id: true }
    })
    if (!person) throw new NotFoundException('User not found')
    const existing = await this.prisma.blockedUser.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      select: { id: true, createdAt: true }
    })
    if (existing) throw new ConflictException('This person is already blocked')
    const row = await this.prisma.blockedUser.create({
      data: { blockerId, blockedId },
      select: { blockedId: true, createdAt: true }
    })
    return { blocked: true, userId: row.blockedId, createdAt: row.createdAt }
  }

  async unblock(blockerId: string, blockedId: string) {
    const result = await this.prisma.blockedUser.deleteMany({ where: { blockerId, blockedId } })
    if (result.count === 0) throw new NotFoundException('Block not found')
    return { blocked: false, userId: blockedId }
  }

  listBlocks(blockerId: string) {
    return this.prisma.blockedUser.findMany({
      where: { blockerId },
      select: { blockedId: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    }).then(rows => rows.map(row => ({ userId: row.blockedId, createdAt: row.createdAt })))
  }

  async listQueue(actorId: string, status: ReportStatusName = 'OPEN') {
    await this.requireStaff(actorId)
    return this.prisma.report.findMany({
      where: { status },
      select: staffReportSelect,
      orderBy: { createdAt: 'asc' }
    })
  }

  async getReport(actorId: string, id: string) {
    await this.requireStaff(actorId)
    const report = await this.prisma.report.findUnique({ where: { id }, select: staffReportSelect })
    if (!report) throw new NotFoundException('Report not found')
    return { ...report, preview: await this.preview(report.targetType, report.targetId) }
  }

  async act(actorId: string, reportId: string, input: ModerationActionDto) {
    await this.requireStaff(actorId)
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: { id: true, status: true, targetType: true, targetId: true }
    })
    if (!report) throw new NotFoundException('Report not found')
    if (report.status === 'RESOLVED' || report.status === 'DISMISSED') {
      throw new ConflictException('This report is already closed')
    }
    const note = sanitizeOptional(input.note, 2000) || null
    if (input.kind === 'DISMISS' || input.kind === 'RESOLVE') {
      return this.closeReport(actorId, report.id, input.kind, input.kind === 'DISMISS' ? 'DISMISSED' : 'RESOLVED', note)
    }
    if (input.kind === 'HIDE') return this.hide(actorId, report, note)
    return this.changeAccount(actorId, report, input.kind, note)
  }

  private async assertReportable(reporterId: string, targetType: ReportTargetTypeName, targetId: string) {
    if (targetType === 'LISTING') {
      const listing = await this.prisma.listing.findFirst({
        where: { id: targetId, deletedAt: null, status: { in: ['PUBLISHED', 'SOLD', 'ARCHIVED'] } },
        select: { sellerId: true }
      })
      if (!listing) throw new NotFoundException('Report target not found')
      return listing.sellerId
    }
    if (targetType === 'USER') {
      const user = await this.prisma.user.findFirst({
        where: { id: targetId, deletedAt: null, status: { not: 'DELETED' } },
        select: { id: true }
      })
      if (!user) throw new NotFoundException('Report target not found')
      return user.id
    }
    if (targetType === 'MESSAGE') {
      const message = await this.prisma.message.findUnique({
        where: { id: targetId },
        select: { senderId: true, conversationId: true }
      })
      if (!message) throw new NotFoundException('Report target not found')
      const participant = await this.prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId: message.conversationId, userId: reporterId } },
        select: { userId: true }
      })
      if (!participant) throw new NotFoundException('Report target not found')
      return message.senderId
    }
    const post = await this.prisma.communityPost.findFirst({
      where: { id: targetId, deletedAt: null, status: 'PUBLISHED' },
      select: { authorId: true }
    })
    if (!post) throw new NotFoundException('Report target not found')
    return post.authorId
  }

  private async requireStaff(userId: string) {
    const role = await this.prisma.staffRoleAssignment.findFirst({
      where: { userId, role: { in: ['MODERATOR', 'ADMIN'] } },
      select: { role: true }
    })
    if (!role) throw new ForbiddenException('Moderator access is required')
    return role.role
  }

  private async preview(targetType: ReportTargetType, targetId: string) {
    if (targetType === 'LISTING') {
      const row = await this.prisma.listing.findUnique({ where: { id: targetId }, select: { title: true, sellerId: true } })
      return row ? { title: row.title, ownerId: row.sellerId } : null
    }
    if (targetType === 'USER') {
      const row = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true, status: true } })
      return row ? { ownerId: row.id, status: row.status } : null
    }
    if (targetType === 'MESSAGE') {
      const row = await this.prisma.message.findUnique({
        where: { id: targetId },
        select: { body: true, senderId: true, hiddenAt: true }
      })
      if (!row) return null
      return { ownerId: row.senderId, hidden: Boolean(row.hiddenAt), excerpt: sanitizeText(row.body, 180) }
    }
    const row = await this.prisma.communityPost.findUnique({ where: { id: targetId }, select: { title: true, authorId: true } })
    return row ? { title: row.title, ownerId: row.authorId } : null
  }

  private async closeReport(actorId: string, reportId: string, kind: ModerationKindName, status: 'DISMISSED' | 'RESOLVED', note: string | null) {
    const [report] = await this.prisma.$transaction([
      this.prisma.report.update({ where: { id: reportId }, data: { status }, select: reportSelect }),
      this.prisma.moderationAction.create({ data: { reportId, actorId, kind, note } })
    ])
    return report
  }

  private async hide(
    actorId: string,
    report: { id: string; targetType: ReportTargetType; targetId: string },
    note: string | null
  ) {
    if (report.targetType === 'USER') throw new ConflictException('This action does not apply to that report')
    if (report.targetType === 'LISTING') {
      const updated = await this.prisma.listing.updateMany({
        where: { id: report.targetId, deletedAt: null },
        data: { status: 'ARCHIVED', deletedAt: new Date() }
      })
      if (updated.count === 0) {
        const exists = await this.prisma.listing.findUnique({ where: { id: report.targetId }, select: { id: true } })
        if (!exists) throw new NotFoundException('Report target not found')
      }
    } else if (report.targetType === 'COMMUNITY_POST') {
      const updated = await this.prisma.communityPost.updateMany({
        where: { id: report.targetId, deletedAt: null },
        data: { status: 'ARCHIVED', deletedAt: new Date() }
      })
      if (updated.count === 0) {
        const exists = await this.prisma.communityPost.findUnique({ where: { id: report.targetId }, select: { id: true } })
        if (!exists) throw new NotFoundException('Report target not found')
      }
    } else {
      const updated = await this.prisma.message.updateMany({
        where: { id: report.targetId, hiddenAt: null },
        data: { hiddenAt: new Date() }
      })
      if (updated.count === 0) {
        const exists = await this.prisma.message.findUnique({ where: { id: report.targetId }, select: { id: true } })
        if (!exists) throw new NotFoundException('Report target not found')
      }
    }
    return this.closeReport(actorId, report.id, 'HIDE', 'RESOLVED', note)
  }

  private async changeAccount(
    actorId: string,
    report: { id: string; targetType: ReportTargetType; targetId: string },
    kind: Extract<ModerationKindName, 'SUSPEND_USER' | 'RESTORE_USER'>,
    note: string | null
  ) {
    const ownerId = await this.ownerOf(report.targetType, report.targetId)
    if (!ownerId) throw new NotFoundException('Report target not found')
    if (ownerId === actorId) throw new ConflictException('You cannot change your own account from this report')
    const status = kind === 'SUSPEND_USER' ? 'SUSPENDED' : 'ACTIVE'
    const updated = await this.prisma.user.updateMany({
      where: { id: ownerId, deletedAt: null, status: { not: 'DELETED' } },
      data: { status }
    })
    if (updated.count === 0) throw new NotFoundException('Report target not found')
    const closed = await this.closeReport(actorId, report.id, kind, 'RESOLVED', note)
    audit(kind === 'SUSPEND_USER' ? 'moderation.suspend' : 'moderation.restore', {
      actorId,
      userId: ownerId,
      reportId: report.id
    })
    return closed
  }

  private async ownerOf(targetType: ReportTargetType, targetId: string) {
    if (targetType === 'USER') return targetId
    if (targetType === 'LISTING') {
      const row = await this.prisma.listing.findUnique({ where: { id: targetId }, select: { sellerId: true } })
      return row?.sellerId ?? null
    }
    if (targetType === 'MESSAGE') {
      const row = await this.prisma.message.findUnique({ where: { id: targetId }, select: { senderId: true } })
      return row?.senderId ?? null
    }
    const row = await this.prisma.communityPost.findUnique({ where: { id: targetId }, select: { authorId: true } })
    return row?.authorId ?? null
  }
}
