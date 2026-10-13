import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import {
  AppealStatus,
  AppealSubjectType,
  Prisma,
  ReviewStatus,
  TransactionStatus,
  VerificationMethod,
  VerificationStatus
} from '@prisma/client'
import { audit } from '../common/logger'
import { publicUserSelect } from '../common/public-user.select'
import { sanitizeOptional, sanitizeText } from '../common/text'
import { PrismaService } from '../prisma/prisma.service'
import {
  ListPassportsQuery,
  PassportPrivacyDto,
  ResolveAppealDto,
  ReviewVerificationDto,
  SubmitAppealDto,
  SubmitVerificationDto,
  UpdatePassportProfileDto
} from './dto'
import {
  TrustInputs,
  accountAgeDays,
  ratingSummary,
  roleLabel,
  trustSignals
} from './trust-signals'

/** Default review publication window, in days. */
export const DEFAULT_REVIEW_WINDOW_DAYS = 14
/** How long after publication a review may still be edited. */
export const REVIEW_EDIT_WINDOW_DAYS = 7

@Injectable()
export class PassportService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------- trust inputs

  /**
   * Everything a passport needs, derived from records the server owns.
   *
   * Written as one method so it is impossible for two endpoints to disagree
   * about a member's counts: the public passport and the moderation view both
   * read these exact numbers.
   */
  async trustInputs(userId: string, now = new Date()): Promise<TrustInputs> {
    const [user, completedExchanges, borrowings, reviewsReceived, openDispute] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { createdAt: true, status: true, deletedAt: true, profile: { select: { emailVerified: true } } }
        }),
        // Only COMPLETED exchanges count. Cancelled, disputed, and refunded
        // rows are excluded by the status filter rather than by subtraction,
        // so a reversal removes the evidence instead of merely reducing it.
        this.prisma.transaction.count({
          where: { status: TransactionStatus.COMPLETED, participants: { some: { userId } } }
        }),
        this.prisma.borrowRequest.findMany({
          where: { status: 'COMPLETED', OR: [{ lenderId: userId }, { borrowerId: userId }] },
          select: {
            lenderId: true,
            borrowerId: true,
            returnedAt: true,
            endAt: true,
            completedAt: true
          }
        }),
        this.prisma.review.count({
          where: { subjectId: userId, status: ReviewStatus.PUBLISHED }
        }),
        this.prisma.borrowDispute.count({
          where: {
            status: { in: ['OPEN', 'UNDER_REVIEW'] },
            borrowRequest: { OR: [{ lenderId: userId }, { borrowerId: userId }] }
          }
        })
      ])

    if (!user) throw new NotFoundException('Member not found')

    const lenderRows = borrowings.filter(row => row.lenderId === userId)
    const borrowerRows = borrowings.filter(row => row.borrowerId === userId)
    // On time means returned on or before the due date. A borrowing with no
    // recorded return time cannot count, because there is no evidence of when.
    const onTimeReturns = borrowerRows.filter(
      row => row.returnedAt !== null && row.returnedAt.getTime() <= row.endAt.getTime()
    ).length

    // Transaction counterparties: everyone who shared a completed exchange
    // with this member, excluding themselves.
    const exchangeCounterparties = new Set(
      (
        await this.prisma.transactionParticipant.findMany({
          where: { transaction: { status: TransactionStatus.COMPLETED, OR: [{ participants: { some: { userId } } }] } },
          select: { userId: true }
        })
      ).map(row => row.userId)
    )

    return {
      accountAgeDays: accountAgeDays(user.createdAt, now),
      emailVerified: user.profile?.emailVerified === true,
      completedExchanges,
      completedBorrowings: borrowings.length,
      borrowingsAsLender: lenderRows.length,
      onTimeReturns,
      completedBorrowingsAsBorrower: borrowerRows.length,
      publishedReviewsReceived: reviewsReceived,
      distinctCounterparties: exchangeCounterparties.size,
      hasOpenDispute: openDispute > 0,
      accountActive: user.deletedAt === null && user.status === 'ACTIVE'
    }
  }

  // ------------------------------------------------------------------ passport

  /**
   * The public passport.
   *
   * Built from an explicit projection rather than by trimming a full row, so
   * there is no field that can leak by being added later. Email, coordinates,
   * suspension state, moderation history, and transaction detail are not in
   * the query at all.
   */
  async passport(userId: string, viewerId?: string) {
    const member = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        createdAt: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
            displayName: true,
            bio: true,
            neighborhood: true,
            city: true,
            avatarUrl: true,
            emailVerified: true
          }
        },
        passportPrivacy: true
      }
    })
    if (!member) throw new NotFoundException('Member not found')

    // A deleted account's passport is withdrawn rather than showing a stale
    // history that no longer means anything.
    const withdrawn = await this.prisma.user.findFirst({
      where: { id: userId, status: { not: 'ACTIVE' } },
      select: { id: true }
    })

    const privacy = member.passportPrivacy
    const settings = {
      showRatings: privacy?.showRatings ?? true,
      showTenure: privacy?.showTenure ?? true,
      showNeighborhood: privacy?.showNeighborhood ?? true,
      showCity: privacy?.showCity ?? true,
      showTrustSignals: privacy?.showTrustSignals ?? true,
      showContributions: privacy?.showContributions ?? true
    }

    const inputs = await this.trustInputs(userId)
    const summary = await this.ratingSummaryFor(userId)

    return {
      id: member.id,
      displayName: member.profile?.displayName || member.profile?.firstName || 'A neighbor',
      avatarUrl: member.profile?.avatarUrl ?? null,
      bio: member.profile?.bio ?? null,
      memberSince: settings.showTenure ? member.createdAt : null,
      accountAgeDays: settings.showTenure ? inputs.accountAgeDays : null,
      // Neighborhood and city only. The Profile model also holds latitude and
      // longitude, and neither is selected above, so no code path can serve it.
      neighborhood: settings.showNeighborhood ? (member.profile?.neighborhood ?? null) : null,
      city: settings.showCity ? (member.profile?.city ?? null) : null,
      // Counts stay available to everyone: they are aggregate facts about
      // activity, and hiding them would make a busy member look unproven.
      counts: {
        completedExchanges: inputs.completedExchanges,
        completedBorrowings: inputs.completedBorrowings,
        borrowingsAsLender: inputs.borrowingsAsLender,
        borrowingsAsBorrower: inputs.completedBorrowingsAsBorrower
      },
      rating: settings.showRatings ? summary : null,
      trustSignals: settings.showTrustSignals ? trustSignals(inputs) : [],
      verifications: settings.showTrustSignals ? await this.publicVerifications(userId) : [],
      // Milestone 9: community contribution, on the member's own terms. A
      // revoked badge is excluded rather than shown as struck through, because
      // a withdrawn claim is not a claim.
      contributions: settings.showContributions ? await this.publicContributions(userId) : null,
      isSelf: viewerId === userId,
      withdrawn: withdrawn !== null
    }
  }

  /**
   * The public half of a member's community record: a count of verified
   * missions and the badges that count still supports.
   *
   * Written here rather than in the missions module so a passport cannot show
   * a contribution figure that disagrees with the badge list beside it.
   */
  private async publicContributions(userId: string) {
    const [verifiedMissionCount, organizedCount, badges] = await Promise.all([
      this.prisma.missionParticipant.count({ where: { userId, status: 'VERIFIED' } }),
      this.prisma.neighborhoodMission.count({
        where: { organizerId: userId, status: { in: ['PUBLISHED', 'COMPLETED'] } }
      }),
      this.prisma.memberBadge.findMany({
        where: { userId, revokedAt: null },
        select: { code: true, awardedAt: true, badge: { select: { label: true, description: true, explanation: true } } },
        orderBy: { badge: { sortOrder: 'asc' } }
      })
    ])
    return {
      verifiedMissionCount,
      organizedCount,
      badges: badges.map(row => ({
        code: row.code,
        label: row.badge.label,
        description: row.badge.description,
        explanation: row.badge.explanation,
        awardedAt: row.awardedAt
      }))
    }
  }

  private async ratingSummaryFor(userId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { subjectId: userId, status: ReviewStatus.PUBLISHED },
      select: { rating: true }
    })
    return ratingSummary(reviews)
  }

  /**
   * What a passer-by may see about verification.
   *
   * Only APPROVED methods, and only the method name: a pending request, a
   * staff note, or a rejection is nobody's business but the member's.
   */
  private async publicVerifications(userId: string) {
    const rows = await this.prisma.verificationRecord.findMany({
      where: { userId, status: VerificationStatus.APPROVED },
      select: { method: true, decidedAt: true }
    })
    const EMAIL = 'Email confirmed'
    return rows.map(row => ({
      method: row.method,
      label: row.method === VerificationMethod.EMAIL ? EMAIL : labelFor(row.method),
      explanation:
        row.method === VerificationMethod.EMAIL
          ? 'They confirmed they can receive mail at their address. This says nothing about who they are in the real world.'
          : explanationFor(row.method),
      decidedAt: row.decidedAt
    }))
  }

  // -------------------------------------------------------------- privacy etc.

  async privacy(userId: string) {
    const existing = await this.prisma.passportPrivacySettings.findUnique({ where: { userId } })
    if (existing) return existing
    // Materialized on first read so the settings screen always has a row.
    return this.prisma.passportPrivacySettings.create({ data: { userId } })
  }

  async updatePrivacy(userId: string, input: PassportPrivacyDto) {
    await this.privacy(userId)
    const data: Record<string, unknown> = {}
    for (const key of [
      'showRatings',
      'showTenure',
      'showNeighborhood',
      'showCity',
      'showTrustSignals',
      'showContributions',
      'leaderboardOptIn',
      'reviewWindowDays'
    ] as const) {
      if (input[key] !== undefined) data[key] = input[key]
    }
    if (Object.keys(data).length === 0) throw new BadRequestException('No settings to update')
    const updated = await this.prisma.passportPrivacySettings.update({ where: { userId }, data })
    audit('passport.privacy_updated', { userId, fields: Object.keys(data) })
    return updated
  }

  async updateProfile(userId: string, input: UpdatePassportProfileDto) {
    const data: Record<string, unknown> = {}
    if (input.displayName !== undefined) data.displayName = sanitizeOptional(input.displayName, 60)
    if (input.bio !== undefined) data.bio = sanitizeOptional(input.bio, 500)
    if (input.neighborhood !== undefined) data.neighborhood = sanitizeOptional(input.neighborhood, 80)
    if (input.city !== undefined) data.city = sanitizeOptional(input.city, 80)
    if (Object.keys(data).length === 0) throw new BadRequestException('Nothing to update')
    const profile = await this.prisma.profile.update({ where: { userId }, data })
    audit('passport.profile_updated', { userId })
    return profile
  }

  /**
   * Opt-in public ranking. Only members who chose to appear are listed, and
   * only their display name and verified contribution counts are shown.
   */
  async leaderboard(query: ListPassportsQuery) {
    const members = await this.prisma.passportPrivacySettings.findMany({
      where: { leaderboardOptIn: true, user: { deletedAt: null, status: 'ACTIVE' } },
      select: { user: { select: { id: true, profile: { select: { displayName: true, firstName: true, avatarUrl: true } } } } },
      take: Math.min(Math.max(query.limit ?? 25, 1), 100),
      skip: query.offset ?? 0
    })
    const rows = []
    for (const member of members) {
      const inputs = await this.trustInputs(member.user.id)
      rows.push({
        userId: member.user.id,
        displayName:
          member.user.profile?.displayName || member.user.profile?.firstName || 'A neighbor',
        avatarUrl: member.user.profile?.avatarUrl ?? null,
        completedBorrowings: inputs.completedBorrowings,
        borrowingsAsLender: inputs.borrowingsAsLender,
        completedExchanges: inputs.completedExchanges
      })
    }
    return rows.sort(
      (a, b) => b.completedBorrowings - a.completedBorrowings || a.userId.localeCompare(b.userId)
    )
  }

  // --------------------------------------------------------- audit and appeals

  /**
   * Appends a trust audit event.
   *
   * Every trust-affecting decision writes one, so a member can always be told
   * why their passport changed. The write is inside the caller's transaction
   * where there is one, which is what makes it impossible for a change to
   * commit without its explanation.
   */
  private async recordAudit(
    userId: string,
    kind: Prisma.TrustAuditEventCreateInput['kind'],
    detail: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
    options: { refId?: string; actorId?: string } = {}
  ) {
    return client.trustAuditEvent.create({
      data: { userId, kind, detail, refId: options.refId ?? null, actorId: options.actorId ?? null }
    })
  }

  async auditTrail(userId: string, limit = 50) {
    const mine = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!mine) throw new NotFoundException('Member not found')
    return this.prisma.trustAuditEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      select: { id: true, kind: true, detail: true, createdAt: true }
    })
  }

  async submitAppeal(userId: string, input: SubmitAppealDto) {
    await this.assertAppealSubject(userId, input.subjectType, input.subjectId)
    const existing = await this.prisma.moderationAppeal.findUnique({
      where: {
        userId_subjectType_subjectId: { userId, subjectType: input.subjectType, subjectId: input.subjectId }
      }
    })
    if (existing && existing.status !== AppealStatus.REJECTED) {
      throw new ConflictException('You have already appealed this')
    }
    const appeal = existing
      ? await this.prisma.moderationAppeal.update({
          where: { id: existing.id },
          data: { reason: sanitizeText(input.reason, 2000), status: AppealStatus.SUBMITTED, resolution: null, resolvedAt: null, handledById: null }
        })
      : await this.prisma.moderationAppeal.create({
          data: {
            userId,
            subjectType: input.subjectType as AppealSubjectType,
            subjectId: input.subjectId,
            reason: sanitizeText(input.reason, 2000)
          }
        })
    audit('passport.appeal_submitted', { userId, subjectType: input.subjectType, subjectId: input.subjectId })
    return appeal
  }

  async myAppeals(userId: string) {
    return this.prisma.moderationAppeal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, subjectType: true, subjectId: true, status: true, reason: true, resolution: true, createdAt: true, resolvedAt: true }
    })
  }

  /** A member may only appeal something that was decided against them. */
  private async assertAppealSubject(userId: string, subjectType: string, subjectId: string) {
    if (subjectType === 'REVIEW') {
      const review = await this.prisma.review.findUnique({
        where: { id: subjectId },
        select: { authorId: true, subjectId: true, status: true }
      })
      if (!review) throw new NotFoundException('Review not found')
      if (review.authorId !== userId) throw new ForbiddenException('You can only appeal your own review')
      if (review.status !== ReviewStatus.HIDDEN) {
        throw new BadRequestException('That review has not been acted on')
      }
      return
    }
    if (subjectType === 'VERIFICATION') {
      const record = await this.prisma.verificationRecord.findUnique({
        where: { id: subjectId },
        select: { userId: true }
      })
      if (!record) throw new NotFoundException('Verification not found')
      if (record.userId !== userId) throw new ForbiddenException('You can only appeal your own verification')
      return
    }
    const report = await this.prisma.report.findFirst({
      where: { targetType: 'REVIEW', targetId: subjectId, reporterId: userId },
      select: { id: true }
    })
    if (!report) throw new NotFoundException('Report not found')
  }

  // ---------------------------------------------------------- staff: appeals

  async resolveAppeal(staffId: string, appealId: string, input: ResolveAppealDto) {
    await this.assertStaff(staffId)
    const appeal = await this.prisma.moderationAppeal.findUnique({ where: { id: appealId } })
    if (!appeal) throw new NotFoundException('Appeal not found')
    if (appeal.status === AppealStatus.RESOLVED) throw new ConflictException('That appeal is already resolved')

    const updated = await this.prisma.$transaction(async tx => {
      const row = await tx.moderationAppeal.update({
        where: { id: appealId },
        data: {
          status: input.status,
          resolution: input.resolution ? sanitizeText(input.resolution, 2000) : null,
          handledById: staffId,
          resolvedAt: input.status === AppealStatus.RESOLVED ? new Date() : null
        }
      })
      // Resolving an appeal in the member's favour restores what was taken.
      if (input.status === AppealStatus.RESOLVED && appeal.subjectType === 'REVIEW') {
        await tx.review.updateMany({
          where: { id: appeal.subjectId, status: ReviewStatus.HIDDEN },
          data: { status: ReviewStatus.PUBLISHED, hiddenAt: null, hiddenReason: null }
        })
        await this.recordAudit(
          appeal.userId,
          'APPEAL_RESOLVED',
          'An appeal restored a hidden review',
          tx,
          { refId: appeal.subjectId, actorId: staffId }
        )
      }
      return row
    })
    audit('passport.appeal_resolved', { staffId, appealId, status: input.status })
    return updated
  }

  async listAppealsForStaff(staffId: string, status?: AppealStatus) {
    await this.assertStaff(staffId)
    return this.prisma.moderationAppeal.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: {
        id: true,
        subjectType: true,
        subjectId: true,
        status: true,
        reason: true,
        resolution: true,
        createdAt: true,
        // The member is identified to staff, who need to act on it.
        user: { select: publicUserSelect }
      }
    })
  }

  // ----------------------------------------------------- staff: verification

  async submitVerification(userId: string, input: SubmitVerificationDto) {
    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, deletedAt: true }
    })
    if (!account || account.deletedAt) throw new ForbiddenException('This account cannot request verification')

    // Email verification is owned by the account module; a member cannot
    // grant it to themselves by submitting a form.
    if (input.method === VerificationMethod.EMAIL) {
      throw new BadRequestException('Email is confirmed by confirming the address, not by requesting it')
    }

    const existing = await this.prisma.verificationRecord.findUnique({
      where: { userId_method: { userId, method: input.method } }
    })
    if (existing && existing.status === VerificationStatus.APPROVED) {
      throw new ConflictException('That verification is already approved')
    }
    if (existing && existing.status === VerificationStatus.PENDING) {
      throw new ConflictException('That verification is already awaiting review')
    }

    const record = existing
      ? await this.prisma.verificationRecord.update({
          where: { id: existing.id },
          data: {
            status: VerificationStatus.PENDING,
            statement: sanitizeOptional(input.statement ?? '', 1000),
            reviewedById: null,
            decidedAt: null,
            revokedAt: null,
            respondedAt: null,
            reviewNote: null
          }
        })
      : await this.prisma.verificationRecord.create({
          data: {
            userId,
            method: input.method,
            status: VerificationStatus.PENDING,
            statement: sanitizeOptional(input.statement ?? '', 1000)
          }
        })
    audit('passport.verification_submitted', { userId, method: input.method })
    return record
  }

  /**
   * Staff decision.
   *
   * REVOKED is a distinct outcome from REJECTED: it withdraws something a
   * member already held, and it removes it from their public passport
   * immediately.
   */
  async reviewVerification(staffId: string, recordId: string, input: ReviewVerificationDto) {
    await this.assertStaff(staffId)
    const record = await this.prisma.verificationRecord.findUnique({ where: { id: recordId } })
    if (!record) throw new NotFoundException('Verification request not found')
    if (record.status === input.status) throw new ConflictException('That is already the current status')

    const updated = await this.prisma.$transaction(async tx => {
      const row = await tx.verificationRecord.update({
        where: { id: recordId },
        data: {
          status: input.status,
          reviewNote: input.note ? sanitizeText(input.note, 1000) : null,
          reviewedById: staffId,
          decidedAt: new Date(),
          revokedAt: input.status === VerificationStatus.REVOKED ? new Date() : null
        }
      })
      const kind =
        input.status === VerificationStatus.APPROVED
          ? 'VERIFICATION_APPROVED'
          : input.status === VerificationStatus.REVOKED
            ? 'VERIFICATION_REVOKED'
            : 'VERIFICATION_REJECTED'
      await this.recordAudit(row.userId, kind, `Verification ${input.status.toLowerCase()} by staff`, tx, {
        refId: row.id,
        actorId: staffId
      })
      return row
    })
    audit('passport.verification_reviewed', { staffId, recordId, status: input.status })
    return updated
  }

  async myVerifications(userId: string) {
    const rows = await this.prisma.verificationRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        method: true,
        status: true,
        statement: true,
        // The staff note is for staff; the member is told the outcome and can
        // see their own statement back.
        createdAt: true,
        decidedAt: true
      }
    })
    const emailVerified = await this.prisma.profile.findUnique({
      where: { userId },
      select: { emailVerified: true }
    })
    return {
      records: rows.map(row => ({ ...row, label: labelFor(row.method), explanation: explanationFor(row.method) })),
      emailVerified: emailVerified?.emailVerified === true
    }
  }

  async listPendingVerifications(staffId: string) {
    await this.assertStaff(staffId)
    return this.prisma.verificationRecord.findMany({
      where: { status: VerificationStatus.PENDING, user: { deletedAt: null } },
      orderBy: { createdAt: 'asc' },
      take: 100,
      // Staff see who is asking and what they said.
      select: { id: true, method: true, statement: true, createdAt: true, user: { select: publicUserSelect } }
    })
  }

  // ------------------------------------------------------------------ helpers

  async assertStaff(userId: string) {
    const assignment = await this.prisma.staffRoleAssignment.findFirst({
      where: { userId, role: { in: ['MODERATOR', 'ADMIN'] } },
      select: { id: true }
    })
    if (!assignment) throw new ForbiddenException('Only staff can take that action')
  }

  /** Does this member have a review-eligible exchange with the other one? */
  async completedExchangeBetween(a: string, b: string) {
    return this.prisma.transaction.findFirst({
      where: {
        status: TransactionStatus.COMPLETED,
        AND: [{ participants: { some: { userId: a } } }, { participants: { some: { userId: b } } }]
      },
      select: { id: true }
    })
  }

  /**
   * True when the author has not yet reviewed the other party in this exchange.
   * Used to explain why a review is not visible yet.
   */
  async awaitingCounterReview(transactionId: string, authorId: string) {
    const [mine, theirs] = await Promise.all([
      this.prisma.review.findFirst({ where: { transactionId, authorId }, select: { status: true } }),
      this.prisma.review.findFirst({
        where: { transactionId, authorId: { not: authorId } },
        select: { status: true }
      })
    ])
    return {
      mineSubmitted: mine !== null,
      counterpartySubmitted: theirs !== null && theirs.status !== ReviewStatus.HIDDEN
    }
  }

  /** Re-exported so the controller layer can label a review's role. */
  readonly roleLabel = roleLabel
}

function labelFor(method: VerificationMethod): string {
  switch (method) {
    case VerificationMethod.COMMUNITY_REFERENCE:
      return 'Community reference'
    case VerificationMethod.VERIFIED_ACTIVITY:
      return 'Verified activity'
    default:
      return 'Email confirmed'
  }
}

function explanationFor(method: VerificationMethod): string {
  switch (method) {
    case VerificationMethod.COMMUNITY_REFERENCE:
      return 'A staff member confirmed this member is known to the neighborhood. It is a statement by Neighborly, not a background check.'
    case VerificationMethod.VERIFIED_ACTIVITY:
      return 'Awarded by the system from completed activity records. No one claims this for themselves.'
    default:
      return 'They confirmed they can receive mail at their address.'
  }
}