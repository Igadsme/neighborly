import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { Prisma, ReportReason, ReviewStatus, TransactionStatus } from '@prisma/client'
import { assertNotBlocked } from '../common/blocks'
import { audit } from '../common/logger'
import { publicUserSelect } from '../common/public-user.select'
import { sanitizeText } from '../common/text'
import { PrismaService } from '../prisma/prisma.service'
import { CreateReviewDto, PassportPrivacyDto, UpdateReviewDto } from './dto'
import {
  PassportService,
  REVIEW_EDIT_WINDOW_DAYS
} from './passport.service'
import { roleLabel } from './trust-signals'

const DAY = 86_400_000

/**
 * Reviews, with a publication policy that is designed rather than incidental.
 *
 * **The policy.** A review is written the moment an exchange completes, but it
 * is not shown until either the other party has also reviewed, or the review
 * window closes. The reason is asymmetric pressure: someone who can publish
 * immediately can withhold until the other side pays, and someone who is
 * mid-exchange has real reasons not to want a public disagreement. Doubling
 * up removes that lever without creating a black market.
 *
 * The window is a deadline, not a permission: after it, the review publishes
 * whether or not the other party ever reviews.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passport: PassportService
  ) {}

  /**
   * Writes a review.
   *
   * Eligibility is decided from the exchange record itself, never from
   * anything the client sends: the caller must be a participant, the
   * transaction must be COMPLETED, and the subject must be the other party.
   */
  async createReview(authorId: string, input: CreateReviewDto) {
    const { authorRole } = await this.assertCanReview(authorId, input.transactionId, input.subjectId)
    const window = await this.windowDaysFor(authorId)
    const now = new Date()
    const body = sanitizeText(input.body, 2000)

    try {
      const review = await this.prisma.review.create({
        data: {
          transactionId: input.transactionId,
          authorId,
          subjectId: input.subjectId,
          rating: input.rating,
          body,
          // Recorded from the exchange record, not from the client, so a
          // public summary can describe the relationship accurately.
          authorRole,
          // Nothing is visible yet; publication is a separate decision.
          status: ReviewStatus.PENDING,
          windowClosesAt: new Date(now.getTime() + window * DAY),
          editableUntil: new Date(now.getTime() + REVIEW_EDIT_WINDOW_DAYS * DAY)
        }
      })
      // Publishing is decided by the *review*, not the author, so this cannot
      // be bypassed by writing the row directly. Both sides are considered:
      // the other party's submission is exactly what unblocks this one, so
      // publishing only the review just written would leave the first one
      // stranded until the next sweep.
      await this.publishIfDue(review.id, now)
      await this.publishCounterparty(review.transactionId, review.authorId, now)
      audit('review.created', { authorId, transactionId: input.transactionId })
      return this.describe(authorId, review.id)
    } catch (error) {
      // The unique index is the real guard against a concurrent double submit.
      if (isUniqueViolation(error)) {
        throw new ConflictException('You have already reviewed this exchange')
      }
      throw error
    }
  }

  /**
   * Every eligibility rule, in one place, so the endpoint and the tests cannot
   * disagree about who may review whom.
   */
  private async assertCanReview(authorId: string, transactionId: string, subjectId: string) {
    if (authorId === subjectId) throw new BadRequestException('You cannot review yourself')

    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      select: {
        status: true,
        offerId: true,
        participants: { select: { userId: true, role: true } }
      }
    })
    if (!transaction) throw new NotFoundException('Exchange not found')

    const author = transaction.participants.find(row => row.userId === authorId)
    if (!author) throw new ForbiddenException('You were not part of this exchange')
    const subject = transaction.participants.find(row => row.userId === subjectId)
    if (!subject) throw new ForbiddenException('You can only review the other person in this exchange')
    // Only genuinely completed exchanges count. Cancelled, disputed, and
    // refunded rows are refused outright rather than being scored.
    if (transaction.status !== TransactionStatus.COMPLETED) {
      throw new BadRequestException('You can review once the exchange is complete')
    }
    // A review of someone you have blocked, or who blocked you, is refused.
    await assertNotBlocked(this.prisma, authorId, subjectId)

    return { authorRole: author.role }
  }

  private async windowDaysFor(userId: string) {
    const settings = await this.prisma.passportPrivacySettings.findUnique({
      where: { userId },
      select: { reviewWindowDays: true }
    })
    return settings?.reviewWindowDays ?? 14
  }

  /**
   * Publishes one review if its window has closed or the other side has
   * reviewed. Idempotent: a second call changes nothing and writes no second
   * audit event.
   */
  async publishIfDue(reviewId: string, now = new Date()): Promise<boolean> {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, transactionId: true, authorId: true, status: true, windowClosesAt: true }
    })
    if (!review || review.status !== ReviewStatus.PENDING) return false

    const counterparty = await this.prisma.review.findFirst({
      where: { transactionId: review.transactionId, authorId: { not: review.authorId } },
      select: { status: true }
    })
    const counterpartyPublished = counterparty !== null && counterparty.status !== ReviewStatus.HIDDEN
    const windowClosed = review.windowClosesAt !== null && review.windowClosesAt.getTime() <= now.getTime()
    if (!counterpartyPublished && !windowClosed) return false

    const published = await this.prisma.$transaction(async tx => {
      // Conditional claim: two concurrent sweeps cannot both publish.
      const claimed = await tx.review.updateMany({
        where: { id: review.id, status: ReviewStatus.PENDING },
        data: { status: ReviewStatus.PUBLISHED, publishedAt: now }
      })
      if (claimed.count === 0) return null
      await tx.trustAuditEvent.create({
        data: {
          userId: review.authorId,
          kind: 'REVIEW_PUBLISHED',
          detail: counterpartyPublished
            ? 'Your review published because both sides reviewed'
            : 'Your review published because the review window closed',
          refId: review.id
        }
      })
      return tx.review.findUniqueOrThrow({ where: { id: review.id } })
    })
    if (published) {
      audit('review.published', { reviewId, reason: counterpartyPublished ? 'double' : 'window' })
    }
    return published !== null
  }

  /** Publishes the other party's review in the same exchange, if now due. */
  private async publishCounterparty(transactionId: string, authorId: string, now: Date) {
    const other = await this.prisma.review.findFirst({
      where: { transactionId, authorId: { not: authorId }, status: ReviewStatus.PENDING },
      select: { id: true }
    })
    if (other) await this.publishIfDue(other.id, now)
  }

  /**
   * The publication sweep. Bounded and idempotent: a restart in the middle is
   * safe because the conditional claim means each review publishes once.
   */
  async publishDueReviews(now = new Date()): Promise<number> {
    const due = await this.prisma.review.findMany({
      where: { status: ReviewStatus.PENDING, windowClosesAt: { lte: now } },
      select: { id: true },
      take: 200
    })
    let published = 0
    for (const row of due) {
      if (await this.publishIfDue(row.id, now)) published += 1
    }
    if (published > 0) audit('review.publish_sweep', { published })
    return published
  }

  /**
   * A review of the caller's own. Publication state is explained rather than
   * merely reported, so a member is never left wondering why nothing shows.
   */
  async describe(viewerId: string, reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        transactionId: true,
        authorId: true,
        subjectId: true,
        authorRole: true,
        rating: true,
        body: true,
        status: true,
        windowClosesAt: true,
        editableUntil: true,
        editedAt: true,
        createdAt: true
      }
    })
    if (!review) throw new NotFoundException('Review not found')
    if (review.authorId !== viewerId) throw new NotFoundException('Review not found')
    return this.project(viewerId, review)
  }

  async myReviews(userId: string) {
    const rows = await this.prisma.review.findMany({
      where: { authorId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        transactionId: true,
        authorId: true,
        subjectId: true,
        authorRole: true,
        rating: true,
        body: true,
        status: true,
        windowClosesAt: true,
        editableUntil: true,
        editedAt: true,
        createdAt: true
      }
    })
    return rows.map(row => this.project(userId, row))
  }

  /** Exchanges this member may still review, with the counterparty's name. */
  async reviewableExchanges(userId: string) {
    const transactions = await this.prisma.transaction.findMany({
      where: { status: TransactionStatus.COMPLETED, participants: { some: { userId } } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        updatedAt: true,
        participants: {
          select: { userId: true, role: true, user: { select: publicUserSelect } }
        }
      }
    })
    const reviewed = await this.prisma.review.findMany({
      where: { authorId: userId },
      select: { transactionId: true }
    })
    const seen = new Set(reviewed.map(row => row.transactionId))
    return transactions
      .filter(row => !seen.has(row.id))
      .map(row => ({
        transactionId: row.id,
        completedAt: row.updatedAt,
        counterparty: row.participants.find(participant => participant.userId !== userId)?.user ?? null,
        myRole: row.participants.find(participant => participant.userId === userId)?.role ?? null
      }))
      .filter(row => row.counterparty)
  }

  /**
   * Edits a review inside its window.
   *
   * The window exists so a review cannot be rewritten later to answer a
   * dispute or to chase a rating; after it, the review is history.
   */
  async updateReview(authorId: string, reviewId: string, input: UpdateReviewDto) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, authorId: true, editableUntil: true, status: true }
    })
    if (!review || review.authorId !== authorId) throw new NotFoundException('Review not found')
    if (review.status === ReviewStatus.HIDDEN) {
      throw new BadRequestException('A hidden review cannot be edited')
    }
    if (review.editableUntil && review.editableUntil.getTime() < Date.now()) {
      throw new BadRequestException('This review can no longer be edited')
    }
    if (input.rating === undefined && input.body === undefined) {
      throw new BadRequestException('Nothing to update')
    }
    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        ...(input.rating !== undefined ? { rating: input.rating } : {}),
        ...(input.body !== undefined ? { body: sanitizeText(input.body, 2000) } : {}),
        editedAt: new Date()
      },
      select: {
        id: true,
        transactionId: true,
        authorId: true,
        subjectId: true,
        authorRole: true,
        rating: true,
        body: true,
        status: true,
        windowClosesAt: true,
        editableUntil: true,
        editedAt: true,
        createdAt: true
      }
    })
    audit('review.updated', { authorId, reviewId })
    return this.project(authorId, updated)
  }

  /**
   * Public reviews for a member. Only published ones, and never with anything
   * from the exchange beyond a neutral context phrase.
   */
  async listForSubject(subjectId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: subjectId, status: 'ACTIVE', deletedAt: null },
      select: { id: true, passportPrivacy: { select: { showRatings: true } } }
    })
    if (!user) throw new NotFoundException('Member not found')
    // A member who hides ratings gets an empty public list, not an error.
    if (user.passportPrivacy?.showRatings === false) return []

    const reviews = await this.prisma.review.findMany({
      where: { subjectId, status: ReviewStatus.PUBLISHED },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        rating: true,
        body: true,
        authorRole: true,
        createdAt: true,
        editedAt: true,
        transaction: { select: { offerId: true } },
        author: { select: publicUserSelect }
      }
    })

    // The item title is resolved in one batch rather than one query per
    // review, and only the title leaves the server: nothing about the
    // exchange, the listing, or the amount is disclosed.
    const offerIds = [
      ...new Set(
        reviews.map(row => row.transaction.offerId).filter((id): id is string => Boolean(id))
      )
    ]
    const titleByOffer = new Map<string, string>()
    if (offerIds.length > 0) {
      const items = await this.prisma.offerItem.findMany({
        where: { offerId: { in: offerIds } },
        select: { offerId: true, listing: { select: { title: true } } },
        orderBy: { id: 'asc' }
      })
      for (const item of items) {
        if (!titleByOffer.has(item.offerId)) titleByOffer.set(item.offerId, item.listing.title)
      }
    }

    return reviews.map(row => ({
      id: row.id,
      rating: row.rating,
      body: row.body,
      context: roleLabel(row.authorRole),
      itemTitle: row.transaction.offerId ? (titleByOffer.get(row.transaction.offerId) ?? null) : null,
      createdAt: row.createdAt,
      edited: row.editedAt !== null,
      // Rebuilt field by field rather than passed through, so a future column
      // on the profile cannot start leaking into a public review list.
      author: {
        id: row.author.id,
        profile: row.author.profile
          ? {
              displayName: row.author.profile.displayName,
              firstName: row.author.profile.firstName,
              neighborhood: row.author.profile.neighborhood,
              city: row.author.profile.city
            }
          : null
      }
    }))
  }

  // -------------------------------------------------------------- moderation

  /**
   * A member reports a review. The reporter's identity is stored but is never
   * part of any projection the subject can read.
   */
  async reportReview(userId: string, reviewId: string, reason: ReportReason, details?: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, authorId: true, subjectId: true }
    })
    if (!review) throw new NotFoundException('Review not found')
    if (review.authorId === userId) throw new BadRequestException('You cannot report your own review')
    // The existing Report model already enforces one report per reporter per
    // target, so a member cannot flood the moderation queue.
    return this.prisma.report.create({
      data: {
        reporterId: userId,
        targetType: 'REVIEW',
        targetId: reviewId,
        reason,
        details: details ? sanitizeText(details, 1000) : null
      }
    })
  }

  /** The moderation queue. Staff only, and the reporter is shown to staff only. */
  async moderationQueue(staffId: string) {
    await this.passport.assertStaff(staffId)
    const reports = await this.prisma.report.findMany({
      where: { targetType: 'REVIEW', status: 'OPEN' },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: {
        id: true,
        reason: true,
        details: true,
        createdAt: true,
        targetId: true,
        reporter: { select: publicUserSelect },
        // Prisma cannot join a polymorphic target, so the review itself is
        // fetched alongside rather than through the relation.
      }
    })
    // Each queue row carries the review it concerns, fetched in one batch
    // rather than one query per report.
    const reviewIds = [...new Set(reports.map(row => row.targetId))]
    const reviews = reviewIds.length
      ? await this.prisma.review.findMany({
          where: { id: { in: reviewIds } },
          select: { id: true, rating: true, body: true, authorId: true, subjectId: true, status: true }
        })
      : []
    const byId = new Map(reviews.map(row => [row.id, row]))
    return reports.map(row => ({ ...row, targetId: undefined, review: byId.get(row.targetId) ?? null }))
  }

  /**
   * Hides a review. The row is kept and the subject's summary recomputes from
   * published rows only, so hiding genuinely removes the rating without
   * destroying the record of what was reported.
   */
  async hideReview(staffId: string, reviewId: string, reason: string) {
    await this.passport.assertStaff(staffId)
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, authorId: true, status: true }
    })
    if (!review) throw new NotFoundException('Review not found')
    if (review.status === ReviewStatus.HIDDEN) throw new ConflictException('That review is already hidden')

    const hidden = await this.prisma.$transaction(async tx => {
      const row = await tx.review.update({
        where: { id: reviewId },
        data: { status: ReviewStatus.HIDDEN, hiddenAt: new Date(), hiddenReason: sanitizeText(reason, 500) }
      })
      await tx.trustAuditEvent.create({
        data: {
          userId: review.authorId,
          kind: 'REVIEW_HIDDEN',
          detail: `A moderator hid this review: ${sanitizeText(reason, 200)}`,
          refId: reviewId,
          actorId: staffId
        }
      })
      // A ModerationAction is attached to a Report when one exists, which is
      // the pre-existing audit surface. A hide with no report behind it is
      // still fully audited by the TrustAuditEvent written above, so no
      // placeholder row is invented just to satisfy a foreign key.
      const reportId = await this.reportIdForReview(reviewId)
      if (reportId) {
        await tx.moderationAction.create({
          data: {
            reportId,
            actorId: staffId,
            // The existing moderation enum has no review-specific action;
            // HIDE is the honest value, and the TrustAuditEvent written
            // alongside carries the precise reason.
            kind: 'HIDE',
            note: sanitizeText(reason, 500)
          }
        })
      }
      return row
    })
    audit('review.hidden', { staffId, reviewId })
    return { id: hidden.id, status: hidden.status }
  }

  /**
   * Restores a hidden review, used when an appeal succeeds.
   */
  async restoreReview(staffId: string, reviewId: string, reason: string) {
    await this.passport.assertStaff(staffId)
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, authorId: true, status: true }
    })
    if (!review) throw new NotFoundException('Review not found')
    if (review.status !== ReviewStatus.HIDDEN) throw new ConflictException('That review is not hidden')

    await this.prisma.$transaction(async tx => {
      await tx.review.update({
        where: { id: reviewId },
        data: { status: ReviewStatus.PUBLISHED, hiddenAt: null, hiddenReason: null }
      })
      await tx.trustAuditEvent.create({
        data: {
          userId: review.authorId,
          kind: 'REVIEW_RESTORED',
          detail: `A moderator restored this review: ${sanitizeText(reason, 200)}`,
          refId: reviewId,
          actorId: staffId
        }
      })
    })
    audit('review.restored', { staffId, reviewId })
    return { id: reviewId, status: ReviewStatus.PUBLISHED }
  }

  private async reportIdForReview(reviewId: string): Promise<string | null> {
    const report = await this.prisma.report.findFirst({
      where: { targetType: 'REVIEW', targetId: reviewId },
      orderBy: { createdAt: 'asc' },
      select: { id: true }
    })
    return report?.id ?? null
  }

  private project<T extends { authorId: string; status: string; windowClosesAt: Date | null }>(
    viewerId: string,
    review: T
  ) {
    return {
      ...review,
      visible: review.status === ReviewStatus.PUBLISHED,
      publicationNote:
        review.status === ReviewStatus.PUBLISHED
          ? 'Published.'
          : review.status === ReviewStatus.HIDDEN
            ? 'Hidden by a moderator.'
            : `Visible once the other person reviews, or by ${new Date(review.windowClosesAt ?? 0).toLocaleDateString()}.`
    }
  }

  /** The review window applied to a member's own future reviews. */
  async privacySummary(userId: string, input: PassportPrivacyDto) {
    return this.passport.updatePrivacy(userId, input)
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
}

export type { Prisma }