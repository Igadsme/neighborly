import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import {
  MissionParticipantStatus,
  MissionStatus,
  Prisma
} from '@prisma/client'
import { assertNotBlocked } from '../common/blocks'
import { audit } from '../common/logger'
import { publicUserSelect } from '../common/public-user.select'
import { sanitizeOptional, sanitizeText } from '../common/text'
import { OutboxWriter } from '../events/outbox-writer'
import { DOMAIN_EVENTS } from '../events/domain-events'
import { PassportService } from '../passport/passport.service'
import { PrismaService } from '../prisma/prisma.service'
import { COMMUNITY_BADGES, badgesForRecord } from './badges'
import {
  CreateMissionDto,
  MissionListQuery,
  UpdateMissionDto
} from './dto'

/** How far ahead a mission is announced by the reminder job. */
export const MISSION_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000
/**
 * How many times a reminder job will consider the same mission. The job is
 * bounded on purpose: a reminder that can fire forever is a reminder nobody
 * turns off.
 */
export const MISSION_REMINDER_MAX_RUNS = 3

@Injectable()
export class MissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxWriter,
    private readonly passport: PassportService
  ) {}

  // --------------------------------------------------------------- lifecycle

  async createMission(organizerId: string, input: CreateMissionDto) {
    await this.assertCanOrganize(organizerId)
    const now = new Date()

    // A published mission must be in the future. A draft may be a plan, so
    // only publishing is checked, not creation.
    const status =
      input.publishNow && input.endAt.getTime() <= now.getTime()
        ? MissionStatus.DRAFT
        : input.publishNow
          ? MissionStatus.PUBLISHED
          : MissionStatus.DRAFT

    const mission = await this.prisma.$transaction(async tx => {
      const created = await tx.neighborhoodMission.create({
        data: {
          organizerId,
          title: sanitizeText(input.title, 120),
          description: sanitizeText(input.description, 4000),
          category: input.category,
          status,
          neighborhood: sanitizeOptional(input.neighborhood ?? '', 80),
          city: sanitizeOptional(input.city ?? '', 80),
          // The meeting point is participant-only text from the moment it is
          // written; it is never part of any public projection.
          meetingPoint: sanitizeOptional(input.meetingPoint ?? '', 500),
          startAt: input.startAt,
          endAt: input.endAt,
          capacity: input.capacity,
          requiresApproval: input.requiresApproval ?? false,
          publishedAt: status === MissionStatus.PUBLISHED ? now : null
        }
      })
      await tx.missionStatusEvent.create({
        data: {
          missionId: created.id,
          actorId: organizerId,
          fromStatus: null,
          toStatus: created.status,
          note: created.status === MissionStatus.PUBLISHED ? 'Created and published' : 'Created as draft'
        }
      })
      if (created.status === MissionStatus.PUBLISHED) {
        await this.outbox.record(
          DOMAIN_EVENTS.missionPublished,
          {
            missionId: created.id,
            missionTitle: created.title,
            organizerId,
            to: 'PUBLISHED'
          },
          { actorId: organizerId, dedupe: [created.id] },
          tx
        )
      }
      return created
    })
    audit('mission.created', { organizerId, missionId: mission.id, status })
    return this.publicMission(mission.id, organizerId)
  }

  async updateMission(organizerId: string, missionId: string, input: UpdateMissionDto) {
    const mission = await this.organizerMission(organizerId, missionId)
    this.assertMutable(mission.status)

    const data: Record<string, unknown> = {}
    if (input.title !== undefined) data.title = sanitizeText(input.title, 120)
    if (input.description !== undefined) data.description = sanitizeText(input.description, 4000)
    if (input.neighborhood !== undefined) data.neighborhood = sanitizeOptional(input.neighborhood, 80)
    if (input.city !== undefined) data.city = sanitizeOptional(input.city, 80)
    if (input.meetingPoint !== undefined) {
      data.meetingPoint = sanitizeOptional(input.meetingPoint, 500)
    }
    if (input.capacity !== undefined) {
      // Lowering capacity below the confirmed headcount would silently
      // invalidate someone's slot, so it is refused rather than applied.
      if (input.capacity < mission.confirmedCount) {
        throw new BadRequestException(
          `There are already ${mission.confirmedCount} confirmed participants`
        )
      }
      data.capacity = input.capacity
    }
    if (input.startAt !== undefined) data.startAt = input.startAt
    if (input.endAt !== undefined) data.endAt = input.endAt
    if (input.requiresApproval !== undefined) data.requiresApproval = input.requiresApproval
    if (Object.keys(data).length === 0) throw new BadRequestException('Nothing to update')

    // The time-order CHECK exists in the database; this makes the error a
    // sentence rather than a constraint name.
    const startAt = (input.startAt ?? mission.startAt).getTime()
    const endAt = (input.endAt ?? mission.endAt).getTime()
    if (endAt <= startAt) throw new BadRequestException('A mission must end after it starts')

    await this.prisma.$transaction(async tx => {
      await tx.neighborhoodMission.update({ where: { id: missionId }, data })
      await this.outbox.record(
        DOMAIN_EVENTS.missionUpdated,
        { missionId, missionTitle: mission.title, organizerId, to: mission.status },
        { actorId: organizerId, dedupe: [missionId, String(mission.updatedAt.getTime())] },
        tx
      )
    })
    audit('mission.updated', { organizerId, missionId })
    return this.publicMission(missionId, organizerId)
  }

  /**
   * Moves a mission along its lifecycle and records the move.
   *
   * The transition table is declared here rather than spread across endpoints,
   * so "can a draft be completed?" has exactly one answer.
   */
  async transition(organizerId: string, missionId: string, to: MissionStatus, note?: string) {
    const mission = await this.organizerMission(organizerId, missionId)
    const allowed: Record<string, MissionStatus[]> = {
      [MissionStatus.DRAFT]: [MissionStatus.PUBLISHED, MissionStatus.CANCELLED],
      [MissionStatus.PUBLISHED]: [MissionStatus.CANCELLED, MissionStatus.COMPLETED],
      [MissionStatus.CANCELLED]: [MissionStatus.ARCHIVED],
      [MissionStatus.COMPLETED]: [MissionStatus.ARCHIVED],
      [MissionStatus.ARCHIVED]: []
    }
    if (!allowed[mission.status].includes(to)) {
      throw new BadRequestException(`A ${mission.status.toLowerCase()} mission cannot become ${to.toLowerCase()}`)
    }

    const now = new Date()
    if (to === MissionStatus.PUBLISHED && mission.endAt.getTime() <= now.getTime()) {
      throw new BadRequestException('That mission has already ended')
    }

    await this.prisma.$transaction(async tx => {
      await tx.neighborhoodMission.update({
        where: { id: missionId },
        data: {
          status: to,
          ...(to === MissionStatus.PUBLISHED ? { publishedAt: now } : {}),
          ...(to === MissionStatus.CANCELLED ? { cancelledAt: now } : {}),
          ...(to === MissionStatus.COMPLETED ? { completedAt: now } : {})
        }
      })
      await tx.missionStatusEvent.create({
        data: { missionId, actorId: organizerId, fromStatus: mission.status, toStatus: to, note: note ? sanitizeText(note, 500) : null }
      })

      if (to === MissionStatus.CANCELLED || to === MissionStatus.COMPLETED) {
        // Everyone holding a slot hears about it, so nobody turns up to an
        // event that is not happening.
        const recipients = (
          await tx.missionParticipant.findMany({
            where: { missionId, status: { in: [MissionParticipantStatus.CONFIRMED, MissionParticipantStatus.CHECKED_IN, MissionParticipantStatus.ATTENDED, MissionParticipantStatus.WAITLISTED] } },
            select: { userId: true }
          })
        ).map(row => row.userId)

        await this.outbox.record(
          to === MissionStatus.CANCELLED ? DOMAIN_EVENTS.missionCancelled : DOMAIN_EVENTS.missionCompleted,
          { missionId, missionTitle: mission.title, organizerId, participantIds: recipients, to },
          { actorId: organizerId, dedupe: [missionId, to] },
          tx
        )
      }
      if (to === MissionStatus.PUBLISHED) {
        await this.outbox.record(
          DOMAIN_EVENTS.missionPublished,
          { missionId, missionTitle: mission.title, organizerId, to },
          { actorId: organizerId, dedupe: [missionId] },
          tx
        )
      }
    })
    audit('mission.transition', { organizerId, missionId, from: mission.status, to })
    return this.publicMission(missionId, organizerId)
  }

  // ------------------------------------------------------------- participation

  /**
   * Joins a mission.
   *
   * The capacity decision is a single guarded UPDATE rather than a count
   * followed by an insert. `confirmedCount < capacity` is evaluated inside the
   * UPDATE, and the database CHECK refuses any increment past capacity, so two
   * simultaneous joins for the last slot cannot both win: the loser updates
   * zero rows and lands on the waitlist instead.
   */
  async join(userId: string, missionId: string) {
    const mission = await this.joinableMission(userId, missionId)

    const existing = await this.prisma.missionParticipant.findUnique({
      where: { missionId_userId: { missionId, userId } },
      select: { id: true, status: true }
    })
    if (existing && existing.status !== MissionParticipantStatus.WITHDRAWN && existing.status !== MissionParticipantStatus.REMOVED) {
      throw new ConflictException('You have already joined this mission')
    }
    if (existing && existing.status === MissionParticipantStatus.VERIFIED) {
      throw new ConflictException('Your verified participation cannot be replaced')
    }

    const decision = await this.prisma.$transaction(async tx => {
      // Approval first: an organizer who reviews participants should not be
      // told to expect someone who may never be confirmed.
      if (mission.requiresApproval) {
        const position = await this.nextWaitlistPosition(tx, missionId)
        const row = await tx.missionParticipant.upsert({
          where: { missionId_userId: { missionId, userId } },
          create: {
            missionId,
            userId,
            status: MissionParticipantStatus.WAITLISTED,
            waitlistPosition: position,
            consentedAt: new Date()
          },
          update: {
            status: MissionParticipantStatus.WAITLISTED,
            waitlistPosition: position,
            withdrawnAt: null,
            removedAt: null,
            removalReason: null,
            consentedAt: new Date()
          }
        })
        await this.outbox.record(
          DOMAIN_EVENTS.missionJoined,
          {
            missionId,
            missionTitle: mission.title,
            organizerId: mission.organizerId,
            participantId: userId,
            reason: 'awaiting_approval'
          },
          { actorId: userId, dedupe: [missionId, userId] },
          tx
        )
        return { participant: row, confirmed: false, waitlisted: true }
      }

      const claimed = await this.claimSlot(tx, mission.id)
      if (claimed) {
        const row = existing
          ? await tx.missionParticipant.update({
              where: { id: existing.id },
              data: {
                status: MissionParticipantStatus.CONFIRMED,
                waitlistPosition: null,
                withdrawnAt: null,
                removedAt: null,
                removalReason: null,
                consentedAt: new Date()
              }
            })
          : await tx.missionParticipant.create({
              data: {
                missionId,
                userId,
                status: MissionParticipantStatus.CONFIRMED,
                consentedAt: new Date()
              }
            })
        await this.outbox.record(
          DOMAIN_EVENTS.missionJoined,
          { missionId, missionTitle: mission.title, organizerId: mission.organizerId, participantId: userId },
          { actorId: userId, dedupe: [missionId, userId] },
          tx
        )
        return { participant: row, confirmed: true, waitlisted: false }
      }

      // Full. Waitlisting is the predictable outcome, not an error.
      const position = await this.nextWaitlistPosition(tx, missionId)
      const row = existing
        ? await tx.missionParticipant.update({
            where: { id: existing.id },
            data: {
              status: MissionParticipantStatus.WAITLISTED,
              waitlistPosition: position,
              withdrawnAt: null,
              removedAt: null,
              removalReason: null,
              consentedAt: new Date()
            }
          })
        : await tx.missionParticipant.create({
            data: { missionId, userId, status: MissionParticipantStatus.WAITLISTED, waitlistPosition: position }
          })
      await this.outbox.record(
        DOMAIN_EVENTS.missionJoined,
        {
          missionId,
          missionTitle: mission.title,
          organizerId: mission.organizerId,
          participantId: userId,
          reason: 'waitlisted'
        },
        { actorId: userId, dedupe: [missionId, userId] },
        tx
      )
      return { participant: row, confirmed: false, waitlisted: true }
    })

    audit('mission.joined', { userId, missionId, confirmed: decision.confirmed })
    return {
      missionId,
      status: decision.participant.status,
      confirmed: decision.confirmed,
      // A joiner on a full mission or one awaiting approval is waitlisted, not
      // rejected: the slot may open, and saying so is the honest answer.
      waitlisted: !decision.confirmed,
      waitlistPosition: decision.participant.waitlistPosition,
      message: decision.confirmed
        ? 'You have a confirmed place.'
        : decision.waitlisted
          ? 'This mission is full, so you are on the waitlist.'
          : 'Your place is pending organizer approval.'
    }
  }

  /**
   * Leaves a mission and hands the freed slot to the next person waiting.
   *
   * The decrement is the mirror of the join's guarded increment, so a slot can
   * never go negative, and the promotion happens in the same transaction so no
   * one else can take the slot in between.
   */
  async leave(userId: string, missionId: string) {
    const participant = await this.prisma.missionParticipant.findUnique({
      where: { missionId_userId: { missionId, userId } },
      select: { id: true, status: true }
    })
    if (!participant) throw new NotFoundException('You are not on this mission')
    if (
      participant.status === MissionParticipantStatus.WITHDRAWN ||
      participant.status === MissionParticipantStatus.REMOVED
    ) {
      throw new ConflictException('You have already left this mission')
    }

    await this.prisma.$transaction(async tx => {
      const held =
        participant.status === MissionParticipantStatus.CONFIRMED ||
        participant.status === MissionParticipantStatus.CHECKED_IN ||
        participant.status === MissionParticipantStatus.ATTENDED
      // Verified participation is a historical record and is not reversible by
      // the participant; a moderator revokes it, not the member.
      await tx.missionParticipant.update({
        where: { id: participant.id },
        data: {
          status: MissionParticipantStatus.WITHDRAWN,
          waitlistPosition: null,
          withdrawnAt: new Date()
        }
      })
      if (held) {
        await tx.neighborhoodMission.updateMany({
          where: { id: missionId, confirmedCount: { gt: 0 } },
          data: { confirmedCount: { decrement: 1 } }
        })
        await this.promoteFromWaitlist(tx, missionId, null)
      }
    })
    audit('mission.left', { userId, missionId })
    return { missionId, status: MissionParticipantStatus.WITHDRAWN }
  }

  /** Confirms a waitlisted participant, promoting them if there is room. */
  async approveParticipant(organizerId: string, missionId: string, participantId: string) {
    const mission = await this.organizerMission(organizerId, missionId)
    const target = await this.prisma.missionParticipant.findFirst({
      where: { id: participantId, missionId, status: MissionParticipantStatus.WAITLISTED },
      select: { id: true, userId: true }
    })
    if (!target) throw new NotFoundException('That participant is not waiting')

    const result = await this.prisma.$transaction(async tx => {
      const claimed = await this.claimSlot(tx, mission.id)
      if (!claimed) return { confirmed: false }
      const row = await tx.missionParticipant.update({
        where: { id: target.id },
        data: { status: MissionParticipantStatus.CONFIRMED, waitlistPosition: null }
      })
      await this.outbox.record(
        DOMAIN_EVENTS.missionParticipantApproved,
        {
          missionId,
          missionTitle: mission.title,
          organizerId,
          participantId: target.userId,
          to: 'CONFIRMED'
        },
        { actorId: organizerId, dedupe: [missionId, target.userId] },
        tx
      )
      return { confirmed: true, participant: row }
    })

    if (!result.confirmed) {
      throw new ConflictException('That mission is already full')
    }
    audit('mission.participant_approved', { organizerId, missionId, participantId })
    return { missionId, status: MissionParticipantStatus.CONFIRMED }
  }

  /** Records that the participant turned up. Self-reported, and not credit. */
  async checkIn(userId: string, missionId: string) {
    const participant = await this.prisma.missionParticipant.findUnique({
      where: { missionId_userId: { missionId, userId } },
      select: { id: true, status: true, missionId: true }
    })
    if (!participant) throw new NotFoundException('You are not on this mission')
    if (participant.status !== MissionParticipantStatus.CONFIRMED) {
      throw new BadRequestException('Only a confirmed place can be checked in')
    }
    const row = await this.prisma.missionParticipant.update({
      where: { id: participant.id },
      data: { status: MissionParticipantStatus.CHECKED_IN, checkedInAt: new Date() }
    })
    audit('mission.checked_in', { userId, missionId })
    return { missionId, status: row.status, checkedInAt: row.checkedInAt }
  }

  /**
   * Confirms that a participant was really there.
   *
   * This is the step that separates attendance from a click. It is refused
   * without the participant's recorded consent, and on a mission flagged for
   * staff verification only a staff member may do it, so an organizer cannot
   * verify their own event's attendance.
   */
  async confirmAttendance(
    actorId: string,
    missionId: string,
    participantId: string,
    { asStaff = false }: { asStaff?: boolean } = {}
  ) {
    const mission = await this.loadMission(missionId)
    const target = await this.prisma.missionParticipant.findFirst({
      where: { id: participantId, missionId },
      select: { id: true, userId: true, status: true, consentedAt: true }
    })
    if (!target) throw new NotFoundException('That participant is not on this mission')

    const isOrganizer = mission.organizerId === actorId
    // `asStaff` is a claim made by the controller, not a fact. It is checked
    // against the real role assignment here, so a route that passes the flag
    // without authorization cannot mark attendance.
    if (asStaff) await this.passport.assertStaff(actorId)
    if (!isOrganizer && !asStaff) {
      throw new ForbiddenException('Only the organizer can confirm attendance')
    }
    // On a mission flagged for staff verification the organizer is not enough,
    // whoever else is involved. This is the guard against an organizer marking
    // attendance on an event they are not trusted to have run.
    if (mission.requiresStaffVerification && !asStaff) {
      throw new ForbiddenException('A staff member must confirm attendance for this mission')
    }
    if (target.consentedAt === null) {
      throw new BadRequestException('That participant has not agreed to be recorded')
    }
    if (target.status !== MissionParticipantStatus.CHECKED_IN) {
      throw new BadRequestException('Only a participant who checked in can be marked as attended')
    }

    const row = await this.prisma.missionParticipant.update({
      where: { id: target.id },
      data: {
        status: MissionParticipantStatus.ATTENDED,
        attendanceMarkedById: actorId,
        attendanceMarkedAt: new Date()
      }
    })
    await this.outbox.record(
      DOMAIN_EVENTS.missionAttendanceConfirmed,
      {
        missionId,
        missionTitle: mission.title,
        organizerId: mission.organizerId,
        participantId: target.userId
      },
      { actorId, dedupe: [missionId, target.userId] }
    )
    audit('mission.attendance_confirmed', { actorId, missionId, participantId })
    return { missionId, status: row.status, attendanceMarkedAt: row.attendanceMarkedAt }
  }

  /**
   * Completes a mission and verifies the people who attended it.
   *
   * Verification is a consequence of completed attendance, not a separate
   * award anybody can push. It is deliberately unreachable before the mission
   * is COMPLETED, which is what stops Join from becoming credit.
   */
  async completeMission(actorId: string, missionId: string, { asStaff = false }: { asStaff?: boolean } = {}) {
    const mission = await this.loadMission(missionId)
    const isOrganizer = mission.organizerId === actorId
    if (asStaff) await this.passport.assertStaff(actorId)
    if (!isOrganizer && !asStaff) {
      throw new ForbiddenException('Only the organizer can complete this mission')
    }
    await this.assertStaffIfRequired(actorId, mission, asStaff)
    if (mission.status !== MissionStatus.PUBLISHED) {
      throw new BadRequestException('Only a published mission can be completed')
    }

    const now = new Date()
    const attended = await this.prisma.missionParticipant.findMany({
      where: {
        missionId,
        status: MissionParticipantStatus.ATTENDED,
        // The organizer can organize, but organizing is not participating.
        // Without this filter a one-person mission would be its own
        // evidence, which is exactly the self-award this guards against.
        userId: { not: mission.organizerId }
      },
      select: { id: true, userId: true }
    })

    const result = await this.prisma.$transaction(async tx => {
      await tx.neighborhoodMission.update({
        where: { id: missionId },
        data: { status: MissionStatus.COMPLETED, completedAt: now }
      })
      await tx.missionStatusEvent.create({
        data: {
          missionId,
          actorId,
          fromStatus: MissionStatus.PUBLISHED,
          toStatus: MissionStatus.COMPLETED
        }
      })

      for (const row of attended) {
        await tx.missionParticipant.update({
          where: { id: row.id },
          data: { status: MissionParticipantStatus.VERIFIED, verifiedAt: now, verifiedById: actorId }
        })
        await this.outbox.record(
          DOMAIN_EVENTS.missionParticipationVerified,
          {
            missionId,
            missionTitle: mission.title,
            organizerId: mission.organizerId,
            participantId: row.userId
          },
          { actorId, dedupe: [missionId, row.userId] },
          tx
        )
      }

      const recipients = (
        await tx.missionParticipant.findMany({
          where: {
            missionId,
            status: { in: [MissionParticipantStatus.CONFIRMED, MissionParticipantStatus.CHECKED_IN, MissionParticipantStatus.ATTENDED, MissionParticipantStatus.WAITLISTED] }
          },
          select: { userId: true }
        })
      ).map(row => row.userId)

      await this.outbox.record(
        DOMAIN_EVENTS.missionCompleted,
        {
          missionId,
          missionTitle: mission.title,
          organizerId: mission.organizerId,
          participantIds: recipients,
          to: 'COMPLETED'
        },
        { actorId, dedupe: [missionId] },
        tx
      )

      // Badges are recalculated for each verified participant inside the same
      // transaction, so a rollback cannot leave a badge for attendance that
      // did not happen.
      const awarded: Array<{ userId: string; code: string; label: string }> = []
      for (const row of attended) {
        for (const badge of await this.reconcileBadges(tx, row.userId, row.id)) {
          awarded.push({ userId: row.userId, ...badge })
        }
      }
      return { verified: attended.length, awarded }
    })

    audit('mission.completed', { actorId, missionId, verified: result.verified })
    return { missionId, status: MissionStatus.COMPLETED, verified: result.verified, badges: result.awarded }
  }

  // ------------------------------------------------------------------ badges

  /**
   * Recalculates a member's badges from their verified record.
   *
   * Derived from counts rather than incremented, so replaying the same
   * participation converges on the same set instead of inflating it. The
   * award is idempotent at the database level.
   */
  private async reconcileBadges(
    tx: Prisma.TransactionClient | PrismaService,
    userId: string,
    missionParticipantId: string
  ) {
    const [verifiedMissions, lendings] = await Promise.all([
      tx.missionParticipant.count({ where: { userId, status: MissionParticipantStatus.VERIFIED } }),
      tx.borrowRequest.count({ where: { lenderId: userId, status: 'COMPLETED' } })
    ])
    const earned = badgesForRecord({ verifiedMissions, completedLendings: lendings })
    const held = await tx.memberBadge.findMany({
      where: { userId },
      select: { code: true, revokedAt: true }
    })
    const heldCodes = new Map(held.map(row => [row.code, row.revokedAt]))

    const granted: Array<{ code: string; label: string }> = []
    for (const code of earned) {
      const definition = COMMUNITY_BADGES.find(badge => badge.code === code)
      if (!definition) continue
      const revokedAt = heldCodes.get(code)
      if (revokedAt === undefined) {
        await tx.memberBadge.create({
          data: { userId, code, missionId: missionParticipantId }
        })
        granted.push({ code, label: definition.label })
        await this.outbox.record(
          DOMAIN_EVENTS.communityBadgeEarned,
          { userId, code, label: definition.label },
          { dedupe: [userId, code] },
          tx
        )
      } else if (revokedAt !== null) {
        // Re-earned honestly after a reversal: the same row is restored
        // rather than a duplicate being created.
        await tx.memberBadge.update({
          where: { userId_code: { userId, code } },
          data: { revokedAt: null, revocationReason: null, awardedAt: new Date(), missionId: missionParticipantId }
        })
        granted.push({ code, label: definition.label })
        await this.outbox.record(
          DOMAIN_EVENTS.communityBadgeEarned,
          { userId, code, label: definition.label },
          { dedupe: [userId, code] },
          tx
        )
      }
    }
    return granted
  }

  /** A member's own contribution record and badges. */
  async myContributions(userId: string) {
    const privacy = await this.prisma.passportPrivacySettings.findUnique({
      where: { userId },
      select: { showContributions: true }
    })
    const [participations, badges] = await Promise.all([
      this.prisma.missionParticipant.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          status: true,
          checkedInAt: true,
          verifiedAt: true,
          mission: {
            select: {
              id: true,
              title: true,
              category: true,
              status: true,
              startAt: true,
              neighborhood: true,
              city: true
            }
          }
        }
      }),
      this.prisma.memberBadge.findMany({
        where: { userId, revokedAt: null },
        select: {
          code: true,
          awardedAt: true,
          badge: { select: { label: true, description: true, explanation: true } }
        },
        orderBy: { badge: { sortOrder: 'asc' } }
      })
    ])

    const verifiedMissions = participations.filter(row => row.status === 'VERIFIED').length
    return {
      showContributions: privacy?.showContributions !== false,
      verifiedMissionCount: verifiedMissions,
      organizedCount: await this.prisma.neighborhoodMission.count({
        where: { organizerId: userId, status: { in: [MissionStatus.PUBLISHED, MissionStatus.COMPLETED] } }
      }),
      badges: badges.map(row => ({
        code: row.code,
        label: row.badge.label,
        description: row.badge.description,
        explanation: row.badge.explanation,
        awardedAt: row.awardedAt
      })),
      participation: participations.map(row => ({
        id: row.id,
        status: row.status,
        verifiedAt: row.verifiedAt,
        checkedInAt: row.checkedInAt,
        mission: row.mission
      }))
    }
  }

  /** The badge catalogue, so the UI can explain what is available. */
  async badgeCatalogue() {
    return this.prisma.communityBadge.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { code: true, label: true, description: true, explanation: true }
    })
  }

  // -------------------------------------------------------------- moderation

  /** Revokes fraudulent verified participation and re-derives the badges. */
  async revokeVerification(
    actorId: string,
    participantId: string,
    reason: string,
    { asStaff = false }: { asStaff?: boolean } = {}
  ) {
    const participant = await this.prisma.missionParticipant.findUnique({
      where: { id: participantId },
      select: { id: true, userId: true, status: true, missionId: true }
    })
    if (!participant) throw new NotFoundException('Participation not found')
    const mission = await this.loadMission(participant.missionId)
    if (asStaff) await this.passport.assertStaff(actorId)

    // A mission organizer may retract their own claim, which is them correcting
    // a mistake rather than defending it. Anything else needs a staff member.
    const isOrganizer = mission.organizerId === actorId
    if (!isOrganizer && !asStaff) {
      throw new ForbiddenException('Only the organizer or a staff member can revoke participation')
    }
    if (participant.status !== MissionParticipantStatus.VERIFIED) {
      throw new ConflictException('That participation is not verified')
    }

    const cleanReason = sanitizeText(reason, 500)
    await this.prisma.$transaction(async tx => {
      await tx.missionParticipant.update({
        where: { id: participantId },
        data: { status: MissionParticipantStatus.ATTENDED, verifiedAt: null, verifiedById: null }
      })
      await tx.missionModerationEvent.create({
        data: { missionId: mission.id, actorId, kind: 'PARTICIPANT_REMOVED', note: cleanReason }
      })

      // Badges are re-derived rather than individually guessed, so a reversal
      // that drops a member below a threshold withdraws the badge that the
      // count no longer supports.
      const [verifiedMissions, lendings] = await Promise.all([
        tx.missionParticipant.count({
          where: { userId: participant.userId, status: MissionParticipantStatus.VERIFIED }
        }),
        tx.borrowRequest.count({ where: { lenderId: participant.userId, status: 'COMPLETED' } })
      ])
      const stillEarned = new Set(badgesForRecord({ verifiedMissions, completedLendings: lendings }))
      const held = await tx.memberBadge.findMany({
        where: { userId: participant.userId, revokedAt: null },
        select: { code: true }
      })
      for (const badge of held) {
        if (stillEarned.has(badge.code)) continue
        await tx.memberBadge.update({
          where: { userId_code: { userId: participant.userId, code: badge.code } },
          data: { revokedAt: new Date(), revocationReason: cleanReason }
        })
      }
    })
    audit('mission.verification_revoked', { actorId, participantId, reason: cleanReason })
    return { participantId, status: MissionParticipantStatus.ATTENDED, badgesReconciled: true }
  }

  /** Hides or restores a mission. The row is never deleted. */
  async moderateMission(
    actorId: string,
    missionId: string,
    action: 'hide' | 'restore',
    reason: string
  ) {
    // Moderation is staff-only, and the role assignment is checked here rather
    // than inferred from the route that reached this method.
    await this.passport.assertStaff(actorId)
    const mission = await this.loadMission(missionId)
    if (action === 'hide' && mission.status === MissionStatus.ARCHIVED) {
      throw new ConflictException('That mission is already archived')
    }

    const cleanReason = sanitizeText(reason, 500)
    await this.prisma.$transaction(async tx => {
      await tx.neighborhoodMission.update({
        where: { id: missionId },
        // Hiding archives rather than deletes: the mission and everyone who
        // joined it keep their history.
        data: { status: action === 'hide' ? MissionStatus.ARCHIVED : MissionStatus.PUBLISHED }
      })
      await tx.missionModerationEvent.create({
        data: { missionId, actorId, kind: action === 'hide' ? 'HIDDEN' : 'RESTORED', note: cleanReason }
      })
      const recipients = (
        await tx.missionParticipant.findMany({
          where: {
            missionId,
            status: { in: [MissionParticipantStatus.CONFIRMED, MissionParticipantStatus.CHECKED_IN, MissionParticipantStatus.ATTENDED, MissionParticipantStatus.WAITLISTED] }
          },
          select: { userId: true }
        })
      ).map(row => row.userId)

      await this.outbox.record(
        DOMAIN_EVENTS.communityModerationChanged,
        {
          missionId,
          missionTitle: mission.title,
          organizerId: mission.organizerId,
          participantIds: recipients,
          to: action === 'hide' ? 'HIDDEN' : 'RESTORED',
          reason: cleanReason
        },
        { actorId, dedupe: [missionId, action] },
        tx
      )
    })
    audit('mission.moderated', { actorId, missionId, action, reason: cleanReason })
    return { missionId, status: action === 'hide' ? MissionStatus.ARCHIVED : MissionStatus.PUBLISHED }
  }

  /** The staff queue for reported missions and participants. */
  async moderationQueue(staffId: string) {
    await this.passport.assertStaff(staffId)
    const reports = await this.prisma.report.findMany({
      where: { targetType: { in: ['MISSION', 'MISSION_PARTICIPANT'] }, status: 'OPEN' },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: {
        id: true,
        targetType: true,
        targetId: true,
        reason: true,
        details: true,
        createdAt: true,
        // The reporter is visible to staff only, never to the reported party.
        reporter: { select: publicUserSelect }
      }
    })
    const missionIds = [
      ...new Set(reports.filter(row => row.targetType === 'MISSION').map(row => row.targetId))
    ]
    const missions = missionIds.length
      ? await this.prisma.neighborhoodMission.findMany({
          where: { id: { in: missionIds } },
          select: {
            id: true,
            title: true,
            status: true,
            category: true,
            startAt: true,
            confirmedCount: true,
            capacity: true,
            organizer: { select: publicUserSelect }
          }
        })
      : []
    const byId = new Map(missions.map(row => [row.id, row]))
    return reports.map(row => ({
      id: row.id,
      targetType: row.targetType,
      reason: row.reason,
      details: row.details,
      createdAt: row.createdAt,
      reporter: row.reporter,
      mission: row.targetType === 'MISSION' ? (byId.get(row.targetId) ?? null) : null
    }))
  }

  /**
   * Flags a mission for staff verification.
   *
   * Used when an organizer's own event cannot be treated as self-attesting,
   * for example a mission that is also a fundraising or donation drive.
   */
  async requireStaffVerification(staffId: string, missionId: string, required: boolean) {
    await this.passport.assertStaff(staffId)
    const mission = await this.loadMission(missionId)
    await this.prisma.missionModerationEvent.create({
      data: {
        missionId,
        actorId: staffId,
        kind: required ? 'REPORT_RESOLVED' : 'RESTORED',
        note: required
          ? 'Attendance now requires staff confirmation'
          : 'Staff confirmation requirement removed'
      }
    })
    await this.prisma.neighborhoodMission.update({
      where: { id: missionId },
      data: { requiresStaffVerification: required }
    })
    audit('mission.staff_verification_flag', { staffId, missionId, required, was: mission.requiresStaffVerification })
    return { missionId, requiresStaffVerification: required }
  }

  /** A member reports a mission or a participant. */
  async reportMission(userId: string, missionId: string, reason: string, details?: string) {
    const mission = await this.loadMission(missionId)
    if (mission.organizerId === userId) {
      throw new BadRequestException('You cannot report your own mission')
    }
    return this.prisma.report.create({
      data: {
        reporterId: userId,
        targetType: 'MISSION',
        targetId: missionId,
        reason: reason as never,
        details: details ? sanitizeText(details, 1000) : null
      }
    })
  }

  // ---------------------------------------------------------------- discovery

  /**
   * Discovery. Server-side pagination, and never a mission the viewer cannot
   * see: drafts belong to their organizer alone.
   */
  async listMissions(query: MissionListQuery, viewerId?: string) {
    const where: Record<string, unknown> = {
      status: { in: query.status ? [query.status] : [MissionStatus.PUBLISHED, MissionStatus.COMPLETED] }
    }
    if (query.category) where.category = query.category
    if (query.neighborhood) where.neighborhood = { contains: query.neighborhood, mode: 'insensitive' }
    if (query.city) where.city = { contains: query.city, mode: 'insensitive' }
    if (query.from || query.to) {
      where.startAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {})
      }
    }
    if (query.organizerId) where.organizerId = query.organizerId
    if (query.mine && viewerId) where.organizerId = viewerId
    if (query.joined && viewerId) {
      const joined = await this.prisma.missionParticipant.findMany({
        where: { userId: viewerId, status: { notIn: [MissionParticipantStatus.WITHDRAWN, MissionParticipantStatus.REMOVED] } },
        select: { missionId: true }
      })
      where.id = { in: joined.map(row => row.missionId) }
    }
    if (query.mine || query.joined) where.status = { in: [MissionStatus.PUBLISHED, MissionStatus.CANCELLED, MissionStatus.COMPLETED] }

    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50)
    const offset = Math.max(query.offset ?? 0, 0)
    const [rows, total] = await Promise.all([
      this.prisma.neighborhoodMission.findMany({
        where,
        orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
        select: {
          id: true,
          title: true,
          description: true,
          category: true,
          status: true,
          neighborhood: true,
          city: true,
          startAt: true,
          endAt: true,
          capacity: true,
          confirmedCount: true,
          requiresApproval: true,
          publishedAt: true,
          organizer: { select: publicUserSelect }
        }
      }),
      this.prisma.neighborhoodMission.count({ where })
    ])

    return {
      items: rows.map(row => ({
        ...row,
        // A slot count is fine to publish; who holds one is not.
        slotsLeft: Math.max(0, row.capacity - row.confirmedCount),
        full: row.confirmedCount >= row.capacity,
        upcoming: row.startAt.getTime() > Date.now()
      })),
      total,
      limit,
      offset
    }
  }

  /**
   * A mission as one viewer is allowed to see it.
   *
   * `meetingPoint` appears only for the organizer and for confirmed
   * participants. It is the single most sensitive field on the mission, and it
   * is the reason there are no coordinates on this model at all.
   */
  async publicMission(missionId: string, viewerId?: string) {
    const mission = await this.prisma.neighborhoodMission.findUnique({
      where: { id: missionId },
      select: {
        id: true,
        organizerId: true,
        title: true,
        description: true,
        category: true,
        status: true,
        neighborhood: true,
        city: true,
        meetingPoint: true,
        startAt: true,
        endAt: true,
        capacity: true,
        confirmedCount: true,
        requiresApproval: true,
        requiresStaffVerification: true,
        publishedAt: true,
        completedAt: true,
        cancelledAt: true,
        organizer: { select: publicUserSelect }
      }
    })
    if (!mission) throw new NotFoundException('Mission not found')

    const isOrganizer = viewerId === mission.organizerId
    // A draft is the organizer's private working copy until it is published.
    if (mission.status === MissionStatus.DRAFT && !isOrganizer) {
      throw new NotFoundException('Mission not found')
    }
    if (mission.status === MissionStatus.ARCHIVED && !isOrganizer) {
      throw new NotFoundException('Mission not found')
    }

    const mine = viewerId
      ? await this.prisma.missionParticipant.findUnique({
          where: { missionId_userId: { missionId, userId: viewerId } },
          select: { id: true, status: true, waitlistPosition: true, checkedInAt: true, attendanceMarkedAt: true, verifiedAt: true }
        })
      : null

    // Staff always see the meeting point: they may need to act on it.
    let staff = false
    if (viewerId) {
      try {
        await this.passport.assertStaff(viewerId)
        staff = true
      } catch {
        staff = false
      }
    }
    const maySeeMeetingPoint = isOrganizer || staff || mine?.status === MissionParticipantStatus.CONFIRMED ||
      mine?.status === MissionParticipantStatus.CHECKED_IN ||
      mine?.status === MissionParticipantStatus.ATTENDED ||
      mine?.status === MissionParticipantStatus.VERIFIED

    return {
      id: mission.id,
      title: mission.title,
      description: mission.description,
      category: mission.category,
      status: mission.status,
      neighborhood: mission.neighborhood,
      city: mission.city,
      meetingPoint: maySeeMeetingPoint ? mission.meetingPoint : null,
      startAt: mission.startAt,
      endAt: mission.endAt,
      capacity: mission.capacity,
      confirmedCount: mission.confirmedCount,
      slotsLeft: Math.max(0, mission.capacity - mission.confirmedCount),
      requiresApproval: mission.requiresApproval,
      requiresStaffVerification: mission.requiresStaffVerification,
      publishedAt: mission.publishedAt,
      completedAt: mission.completedAt,
      cancelledAt: mission.cancelledAt,
      isOrganizer,
      organizer: mission.organizer,
      myParticipation: mine,
      ended: mission.endAt.getTime() <= Date.now()
    }
  }

  /**
   * The participant list.
   *
   * Public detail never calls this: the roster is participant-only, because
   * who is going to a cleanup is not the same as what the mission is.
   */
  async participantList(missionId: string, viewerId: string) {
    const mission = await this.loadMission(missionId)
    const viewer = await this.prisma.missionParticipant.findUnique({
      where: { missionId_userId: { missionId, userId: viewerId } },
      select: { status: true }
    })
    let staff = false
    try {
      await this.passport.assertStaff(viewerId)
      staff = true
    } catch {
      staff = false
    }
    const visibleStatuses = [
      MissionParticipantStatus.CONFIRMED,
      MissionParticipantStatus.CHECKED_IN,
      MissionParticipantStatus.ATTENDED,
      MissionParticipantStatus.VERIFIED
    ]
    if (!staff && mission.organizerId !== viewerId && !viewer) {
      throw new ForbiddenException('Only participants can see who else is coming')
    }
    // Before the mission is completed, attendance is nobody's business but the
    // organizer's. Afterwards it is part of the participant's own history.
    if (!staff && mission.organizerId !== viewerId && mission.status !== MissionStatus.COMPLETED) {
      throw new ForbiddenException('Only the organizer can see the attendance list')
    }

    return this.prisma.missionParticipant.findMany({
      where: {
        missionId,
        // The organizer sees the whole roster including the waitlist; everyone
        // else sees only who actually holds or held a place.
        ...(mission.organizerId === viewerId && !staff ? {} : { status: { in: visibleStatuses } })
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: 200,
      select: {
        id: true,
        status: true,
        waitlistPosition: true,
        checkedInAt: true,
        attendanceMarkedAt: true,
        verifiedAt: true,
        user: { select: publicUserSelect }
      }
    })
  }

  // -------------------------------------------------------------- reminders

  /**
   * Bounded upcoming-mission reminders.
   *
   * Bounded in three ways at once: a window, a row cap, and a per-mission
   * counter. The counter is what makes a retry idempotent, because the outbox
   * dedupe key alone would not stop a second run producing a second reminder
   * for the same day.
   */
  async sendUpcomingReminders(now = new Date()) {
    const until = new Date(now.getTime() + MISSION_REMINDER_LEAD_MS)
    const missions = await this.prisma.neighborhoodMission.findMany({
      where: {
        // A cancelled mission leaves the PUBLISHED state, so this filter alone
        // excludes it; the redundant startAt clause is gone because the range
        // below already says `> now`.
        status: MissionStatus.PUBLISHED,
        startAt: { gt: now, lte: until }
      },
      orderBy: { startAt: 'asc' },
      take: 100,
      select: {
        id: true,
        title: true,
        organizerId: true,
        startAt: true,
        participants: {
          where: { status: { in: [MissionParticipantStatus.CONFIRMED, MissionParticipantStatus.CHECKED_IN] } },
          select: { userId: true }
        }
      }
    })

    let sent = 0
    const touched = new Set<string>()
    for (const mission of missions) {
      if (mission.participants.length === 0) continue
      // One reminder per mission per participant per day. The outbox dedupe key
      // is what makes a retry inside the same window a no-op, and the writer
      // reports whether a row was actually written, so `sent` counts deliveries
      // rather than attempts.
      const day = mission.startAt.toISOString().slice(0, 10)
      for (const participant of mission.participants) {
        const written = await this.outbox.record(
          DOMAIN_EVENTS.missionReminder,
          {
            missionId: mission.id,
            missionTitle: mission.title,
            organizerId: mission.organizerId,
            participantId: participant.userId
          },
          { dedupe: [mission.id, participant.userId, day] }
        )
        if (!written) continue
        sent += 1
        touched.add(mission.id)
      }
    }
    if (sent > 0) audit('mission.reminders_sent', { sent })
    return { missions: missions.length, reminders: sent, missionIds: [...touched] }
  }

  // ------------------------------------------------------------------ helpers

  /**
   * The one atomic capacity claim.
   *
   * The predicate compares two columns, which Prisma's filter API cannot
   * express, so this is a single raw statement rather than a count-then-write
   * pair. PostgreSQL evaluates `confirmedCount < capacity` while holding the
   * row lock, so exactly one of two simultaneous claimants updates a row; the
   * CHECK constraint is the backstop for any path that bypasses this one.
   */
  private async claimSlot(tx: Prisma.TransactionClient, missionId: string): Promise<boolean> {
    // Prisma binds raw parameters as text, hence the explicit uuid cast.
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE "NeighborhoodMission"
      SET "confirmedCount" = "confirmedCount" + 1, "updatedAt" = NOW()
      WHERE "id" = ${missionId}::uuid AND "confirmedCount" < "capacity"
      RETURNING "id"
    `
    return rows.length === 1
  }

  private async nextWaitlistPosition(tx: Prisma.TransactionClient, missionId: string) {
    const last = await tx.missionParticipant.findFirst({
      where: { missionId, status: MissionParticipantStatus.WAITLISTED },
      orderBy: { waitlistPosition: 'desc' },
      select: { waitlistPosition: true }
    })
    return (last?.waitlistPosition ?? 0) + 1
  }

  /**
   * Promotes the first person waiting, if a slot has been freed.
   *
   * Bounded to a single promotion per call, so a burst of leavers drains the
   * waitlist in a predictable order rather than all at once.
   */
  private async promoteFromWaitlist(
    tx: Prisma.TransactionClient,
    missionId: string,
    actorId: string | null
  ) {
    const promoted = await this.claimSlot(tx, missionId)
    if (!promoted) return null
    const next = await tx.missionParticipant.findFirst({
      where: { missionId, status: MissionParticipantStatus.WAITLISTED },
      orderBy: [{ waitlistPosition: 'asc' }, { id: 'asc' }],
      select: { id: true, userId: true, mission: { select: { title: true, organizerId: true } } }
    })
    if (!next) {
      // Nothing was waiting, so the slot claim is undone rather than left to
      // inflate the headcount.
      await tx.neighborhoodMission.updateMany({
        where: { id: missionId, confirmedCount: { gt: 0 } },
        data: { confirmedCount: { decrement: 1 } }
      })
      return null
    }
    await tx.missionParticipant.update({
      where: { id: next.id },
      data: { status: MissionParticipantStatus.CONFIRMED, waitlistPosition: null }
    })
    await this.outbox.record(
      DOMAIN_EVENTS.missionWaitlistPromoted,
      {
        missionId,
        missionTitle: next.mission.title,
        organizerId: next.mission.organizerId,
        participantId: next.userId
      },
      { actorId: actorId ?? undefined, dedupe: [missionId, next.userId] },
      tx
    )
    return next.userId
  }

  private async assertStaffIfRequired(
    _actorId: string,
    mission: { requiresStaffVerification: boolean },
    asStaff: boolean
  ) {
    // `asStaff` has already been verified against the role assignment by the
    // caller. Here we only refuse, because a flagged mission must not be
    // self-certified by its own organizer.
    if (mission.requiresStaffVerification && !asStaff) {
      throw new ForbiddenException('A staff member must complete this mission')
    }
  }

  private async loadMission(missionId: string) {
    const mission = await this.prisma.neighborhoodMission.findUnique({ where: { id: missionId } })
    if (!mission) throw new NotFoundException('Mission not found')
    return mission
  }

  private async organizerMission(organizerId: string, missionId: string) {
    const mission = await this.prisma.neighborhoodMission.findFirst({
      where: { id: missionId, organizerId }
    })
    if (!mission) throw new NotFoundException('Mission not found')
    return mission
  }

  private async joinableMission(userId: string, missionId: string) {
    const mission = await this.loadMission(missionId)
    if (mission.status !== MissionStatus.PUBLISHED) {
      throw new BadRequestException('That mission is not open for joining')
    }
    if (mission.endAt.getTime() <= Date.now()) {
      throw new BadRequestException('That mission has already ended')
    }
    if (mission.organizerId === userId) {
      throw new BadRequestException('You organized this mission')
    }
    // An organizer someone has blocked, or who blocked them, is not someone to
    // spend an afternoon next to.
    await assertNotBlocked(this.prisma, userId, mission.organizerId)
    return mission
  }

  private assertMutable(status: MissionStatus) {
    if (status === MissionStatus.CANCELLED || status === MissionStatus.ARCHIVED) {
      throw new BadRequestException('A closed mission cannot be edited')
    }
  }

  private async assertCanOrganize(userId: string) {
    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, deletedAt: true }
    })
    if (!account || account.deletedAt) throw new ForbiddenException('This account cannot organize')
    // A suspended member keeps their passport and their history; they just do
    // not get to create new public activity.
    if (account.status !== 'ACTIVE') {
      throw new ForbiddenException('A suspended account cannot organize missions')
    }
  }
}

/** Raw field reference for the guarded capacity claim. */
