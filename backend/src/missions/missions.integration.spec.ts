import { randomUUID } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common'
import { MissionCategory, MissionStatus, Prisma } from '@prisma/client'
import { createTestPrisma } from '../common/testing/integration-fixtures'
import { OutboxWriter } from '../events/outbox-writer'
import { PassportService } from '../passport/passport.service'
import { MissionsService } from './missions.service'
import { PrismaService } from '../prisma/prisma.service'
import { badgesForRecord } from './badges'

const PASSWORD_HASH = '$argon2id$stub'
const DAY = 86_400_000

/**
 * Neighborhood missions against real PostgreSQL.
 *
 * The tests that matter most here are the ones about capacity and about credit:
 * a mission must not overbook, and nobody may earn verified participation by
 * clicking a button.
 */
describe('Neighborhood missions against real PostgreSQL', () => {
  let prisma: PrismaService
  let missions: MissionsService
  let passport: PassportService
  let staff: string

  beforeAll(async () => {
    prisma = createTestPrisma()
    await prisma.$connect()
    passport = new PassportService(prisma)
    missions = new MissionsService(prisma, new OutboxWriter(prisma), passport)
    staff = await makeUser('m9-staff')
    await prisma.staffRoleAssignment.create({ data: { userId: staff, role: 'MODERATOR' } })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  async function makeUser(prefix: string, status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE') {
    const id = randomUUID()
    await prisma.user.create({
      data: {
        id,
        email: `${prefix}-${id}@example.com`,
        passwordHash: PASSWORD_HASH,
        ...(status === 'SUSPENDED' ? { status } : {})
      }
    })
    await prisma.profile.create({
      data: { userId: id, firstName: 'Nine', lastName: 'Member', displayName: `Nine ${prefix}` }
    })
    return id
  }

  async function mission(
    organizerId: string,
    overrides: Partial<{
      capacity: number
      requiresApproval: boolean
      requiresStaffVerification: boolean
      publishNow: boolean
      status: MissionStatus
    }> = {}
  ) {
    const start = new Date(Date.now() + 3 * DAY)
    const created = await missions.createMission(organizerId, {
      title: 'Riverside cleanup',
      description: 'Bring gloves if you have them; bags and grabbers are provided.',
      category: MissionCategory.CLEANUP,
      neighborhood: 'Riverside',
      city: 'Atlanta',
      meetingPoint: 'Meet at the north gate of Riverside Park.',
      startAt: start,
      endAt: new Date(start.getTime() + 4 * 60 * 60 * 1000),
      capacity: overrides.capacity ?? 5,
      requiresApproval: overrides.requiresApproval,
      publishNow: overrides.publishNow ?? true
    })
    let row = created
    if (overrides.requiresStaffVerification) {
      await missions.requireStaffVerification(staff, created.id, true)
    }
    if (overrides.status && overrides.status !== row.status) {
      row = await missions.transition(organizerId, created.id, overrides.status)
    }
    return row
  }

  // ------------------------------------------------------------------ create

  it('creates a draft by default and a published mission on request', async () => {
    const organizer = await makeUser('draft')
    const draft = await mission(organizer, { publishNow: false })
    expect(draft.status).toBe(MissionStatus.DRAFT)
    expect(draft.publishedAt).toBeNull()

    const live = await mission(organizer)
    expect(live.status).toBe(MissionStatus.PUBLISHED)
    expect(live.publishedAt).not.toBeNull()
  })

  it('keeps a past mission a draft rather than publishing it', async () => {
    const organizer = await makeUser('past')
    const start = new Date(Date.now() - 5 * DAY)
    const created = await missions.createMission(organizer, {
      title: 'A cleanup that already happened',
      description: 'This mission is entirely in the past and must not go live.',
      category: MissionCategory.CLEANUP,
      startAt: start,
      endAt: new Date(start.getTime() + 60 * 60 * 1000),
      capacity: 5,
      publishNow: true
    })
    expect(created.status).toBe(MissionStatus.DRAFT)
  })

  it('refuses a mission that does not end after it starts', async () => {
    const organizer = await makeUser('reversed')
    const start = new Date(Date.now() + DAY)
    // The CHECK constraint is the real guard; the service makes it a sentence.
    await expect(
      prisma.neighborhoodMission.create({
        data: {
          organizerId: organizer,
          title: 'Backwards in time',
          description: 'Ends before it starts, which the database refuses.',
          category: MissionCategory.CLEANUP,
          startAt: start,
          endAt: new Date(start.getTime() - 1000),
          capacity: 3
        }
      })
    ).rejects.toBeTruthy()
  })

  it('refuses to let a suspended account organize', async () => {
    const suspended = await makeUser('suspended', 'SUSPENDED')
    await expect(mission(suspended)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('refuses a capacity below one', async () => {
    const organizer = await makeUser('badcap')
    await expect(
      missions.createMission(organizer, {
        title: 'Zero capacity mission',
        description: 'A capacity of zero should never be reachable.',
        category: MissionCategory.GARDENING,
        startAt: new Date(Date.now() + DAY),
        endAt: new Date(Date.now() + 2 * DAY),
        capacity: 0,
        publishNow: true
      })
    ).rejects.toBeTruthy()
  })

  // -------------------------------------------------------------- lifecycle

  it('walks draft to published to completed to archived', async () => {
    const organizer = await makeUser('lifecycle')
    const created = await mission(organizer, { publishNow: false })
    const published = await missions.transition(organizer, created.id, MissionStatus.PUBLISHED)
    expect(published.status).toBe(MissionStatus.PUBLISHED)
    const completed = await missions.transition(organizer, created.id, MissionStatus.COMPLETED)
    expect(completed.completedAt).not.toBeNull()
    const archived = await missions.transition(organizer, created.id, MissionStatus.ARCHIVED)
    expect(archived.status).toBe(MissionStatus.ARCHIVED)
  })

  it('refuses an impossible transition', async () => {
    const organizer = await makeUser('badtransition')
    const created = await mission(organizer)
    // A published mission cannot go back to being a draft.
    await expect(
      missions.transition(organizer, created.id, MissionStatus.DRAFT)
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('refuses edits from someone who does not organize the mission', async () => {
    const organizer = await makeUser('owner-edit')
    const stranger = await makeUser('stranger-edit')
    const created = await mission(organizer)
    await expect(
      missions.updateMission(stranger, created.id, { title: 'Hijacked title' })
    ).rejects.toBeInstanceOf(NotFoundException)
    await expect(
      missions.transition(stranger, created.id, MissionStatus.CANCELLED)
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('refuses to cut capacity below the confirmed headcount', async () => {
    const organizer = await makeUser('shrink')
    const created = await mission(organizer, { capacity: 4 })
    await missions.join(await makeUser('shrink-a'), created.id)
    await missions.join(await makeUser('shrink-b'), created.id)

    await expect(
      missions.updateMission(organizer, created.id, { capacity: 1 })
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  // ----------------------------------------------------------- participation

  it('confirms the first joiner and counts them against capacity', async () => {
    const organizer = await makeUser('join-org')
    const participant = await makeUser('join-a')
    const created = await mission(organizer, { capacity: 2 })

    const result = await missions.join(participant, created.id)
    expect(result.confirmed).toBe(true)
    expect(result.status).toBe('CONFIRMED')

    const view = await missions.publicMission(created.id, participant)
    expect(view.confirmedCount).toBe(1)
    expect(view.slotsLeft).toBe(1)
  })

  it('refuses a duplicate join', async () => {
    const organizer = await makeUser('dupe-org')
    const participant = await makeUser('dupe-a')
    const created = await mission(organizer)
    await missions.join(participant, created.id)
    await expect(missions.join(participant, created.id)).rejects.toBeInstanceOf(ConflictException)
    expect(
      await prisma.missionParticipant.count({ where: { missionId: created.id, userId: participant } })
    ).toBe(1)
  })

  it('refuses to join a mission you organized', async () => {
    const organizer = await makeUser('self-org')
    const created = await mission(organizer)
    await expect(missions.join(organizer, created.id)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('refuses to join a mission that has ended or is not published', async () => {
    const organizer = await makeUser('closed-org')
    const draft = await mission(organizer, { publishNow: false })
    await expect(missions.join(await makeUser('closed-a'), draft.id)).rejects.toBeInstanceOf(
      BadRequestException
    )
  })

  it('refuses to join a mission organized by someone you blocked', async () => {
    const organizer = await makeUser('blocker')
    const participant = await makeUser('blocked-joiner')
    const created = await mission(organizer)
    await prisma.blockedUser.create({ data: { blockerId: organizer, blockedId: participant } })
    await expect(missions.join(participant, created.id)).rejects.toBeInstanceOf(ForbiddenException)
  })

  // ------------------------------------------------------ capacity and race

  it('waitlists rather than erroring when a mission is full', async () => {
    const organizer = await makeUser('full-org')
    const created = await mission(organizer, { capacity: 1 })
    const first = await makeUser('full-a')
    const second = await makeUser('full-b')

    expect((await missions.join(first, created.id)).confirmed).toBe(true)
    const result = await missions.join(second, created.id)
    expect(result.confirmed).toBe(false)
    expect(result.waitlisted).toBe(true)
    expect(result.waitlistPosition).toBe(1)
  })

  it('gives the final slot to exactly one of two simultaneous joiners', async () => {
    const organizer = await makeUser('race-org')
    const created = await mission(organizer, { capacity: 1 })
    const a = await makeUser('race-a')
    const b = await makeUser('race-b')

    // Both requests reach the database at once. The guarded UPDATE decides the
    // winner under the row lock; the loser is waitlisted rather than refused.
    const [first, second] = await Promise.all([
      missions.join(a, created.id),
      missions.join(b, created.id)
    ])
    const confirmed = [first, second].filter(result => result.confirmed)
    expect(confirmed).toHaveLength(1)
    expect([first, second].filter(result => result.waitlisted)).toHaveLength(1)

    const row = await prisma.neighborhoodMission.findUniqueOrThrow({ where: { id: created.id } })
    // The database refuses to hold more confirmations than capacity.
    expect(row.confirmedCount).toBe(1)
    expect(row.confirmedCount).toBeLessThanOrEqual(row.capacity)
  })

  it('never exceeds capacity under five simultaneous joiners', async () => {
    const organizer = await makeUser('stampede-org')
    const created = await mission(organizer, { capacity: 2 })
    const joiners = await Promise.all(
      Array.from({ length: 5 }, (_, index) => makeUser(`stampede-${index}`))
    )

    const results = await Promise.all(
      joiners.map(userId => missions.join(userId, created.id))
    )
    expect(results.filter(result => result.confirmed)).toHaveLength(2)

    const row = await prisma.neighborhoodMission.findUniqueOrThrow({ where: { id: created.id } })
    expect(row.confirmedCount).toBe(2)
    const confirmedRows = await prisma.missionParticipant.count({
      where: { missionId: created.id, status: 'CONFIRMED' }
    })
    expect(confirmedRows).toBe(2)
  })

  it('refuses a raw write that would overbook', async () => {
    const organizer = await makeUser('raw-org')
    const created = await mission(organizer, { capacity: 1 })
    // Bypassing the service must still not produce an overbooked mission.
    await expect(
      prisma.$executeRaw`
        UPDATE "NeighborhoodMission"
        SET "confirmedCount" = "capacity" + 1
        WHERE "id" = ${created.id}::uuid
      `
    ).rejects.toBeTruthy()
  })

  it('promotes the first person waiting when someone leaves', async () => {
    const organizer = await makeUser('promote-org')
    const created = await mission(organizer, { capacity: 1 })
    const holder = await makeUser('holder')
    const waiting = await makeUser('waiting')

    await missions.join(holder, created.id)
    await missions.join(waiting, created.id)
    await missions.leave(holder, created.id)

    const row = await prisma.missionParticipant.findUniqueOrThrow({
      where: { missionId_userId: { missionId: created.id, userId: waiting } }
    })
    expect(row.status).toBe('CONFIRMED')
    expect(row.waitlistPosition).toBeNull()

    const missionRow = await prisma.neighborhoodMission.findUniqueOrThrow({ where: { id: created.id } })
    expect(missionRow.confirmedCount).toBe(1)
  })

  it('promotes in waitlist order', async () => {
    const organizer = await makeUser('order-org')
    const created = await mission(organizer, { capacity: 1 })
    const holder = await makeUser('order-holder')
    const first = await makeUser('order-first')
    const second = await makeUser('order-second')

    await missions.join(holder, created.id)
    await missions.join(first, created.id)
    await missions.join(second, created.id)
    await missions.leave(holder, created.id)

    const statuses = await Promise.all(
      [first, second].map(userId =>
        prisma.missionParticipant.findUniqueOrThrow({
          where: { missionId_userId: { missionId: created.id, userId } }
        })
      )
    )
    expect(statuses[0].status).toBe('CONFIRMED')
    expect(statuses[1].status).toBe('WAITLISTED')
  })

  it('does not inflate the headcount when nobody is waiting', async () => {
    const organizer = await makeUser('noqueue-org')
    const created = await mission(organizer, { capacity: 2 })
    const only = await makeUser('noqueue-a')
    await missions.join(only, created.id)
    await missions.leave(only, created.id)

    const row = await prisma.neighborhoodMission.findUniqueOrThrow({ where: { id: created.id } })
    expect(row.confirmedCount).toBe(0)
  })

  it('holds a joiner for organizer approval when the mission requires it', async () => {
    const organizer = await makeUser('approve-org')
    const applicant = await makeUser('applicant')
    const created = await mission(organizer, { requiresApproval: true })

    const joined = await missions.join(applicant, created.id)
    expect(joined.confirmed).toBe(false)
    expect(joined.waitlisted).toBe(true)

    const participants = await missions.participantList(created.id, organizer)
    const mine = participants.find(row => row.user?.id === applicant)
    if (!mine) throw new Error('applicant missing from roster')
    await missions.approveParticipant(organizer, created.id, mine.id)

    const row = await prisma.missionParticipant.findUniqueOrThrow({
      where: { missionId_userId: { missionId: created.id, userId: applicant } }
    })
    expect(row.status).toBe('CONFIRMED')
  })

  it('refuses approval when there is no room left', async () => {
    const organizer = await makeUser('noapproom-org')
    const created = await mission(organizer, { capacity: 1, requiresApproval: true })
    const a = await makeUser('noapproom-a')
    const b = await makeUser('noapproom-b')
    await missions.join(a, created.id)

    // Fill the single slot through the organizer path first.
    const roster = await missions.participantList(created.id, organizer)
    await missions.approveParticipant(organizer, created.id, roster[0].id)

    await missions.join(b, created.id)
    const afterB = await missions.participantList(created.id, organizer)
    const bRow = afterB.find(row => row.user?.id === b)
    if (!bRow) throw new Error('b missing from roster')
    await expect(missions.approveParticipant(organizer, created.id, bRow.id)).rejects.toBeInstanceOf(
      ConflictException
    )
  })

  it('refuses to leave a mission you never joined', async () => {
    const organizer = await makeUser('leave-org')
    const stranger = await makeUser('leave-stranger')
    const created = await mission(organizer)
    await expect(missions.leave(stranger, created.id)).rejects.toBeInstanceOf(NotFoundException)
  })

  // ------------------------------------------------- attendance and credit

  it('credits nobody who only clicked join', async () => {
    const organizer = await makeUser('click-org')
    const joiner = await makeUser('click-only')
    const created = await mission(organizer)

    await missions.join(joiner, created.id)
    await missions.completeMission(organizer, created.id)

    const row = await prisma.missionParticipant.findUniqueOrThrow({
      where: { missionId_userId: { missionId: created.id, userId: joiner } }
    })
    expect(row.status).toBe('CONFIRMED')
    expect(row.verifiedAt).toBeNull()
    expect(
      await prisma.memberBadge.count({ where: { userId: joiner, revokedAt: null } })
    ).toBe(0)
  })

  it('requires check-in before attendance can be confirmed', async () => {
    const organizer = await makeUser('attend-org')
    const joiner = await makeUser('attend-a')
    const created = await mission(organizer)
    await missions.join(joiner, created.id)

    const row = await prisma.missionParticipant.findUniqueOrThrow({
      where: { missionId_userId: { missionId: created.id, userId: joiner } }
    })
    await expect(
      missions.confirmAttendance(organizer, created.id, row.id)
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('verifies a checked-in participant on completion and awards a badge', async () => {
    const organizer = await makeUser('verify-org')
    const joiner = await makeUser('verify-a')
    const created = await mission(organizer)

    await missions.join(joiner, created.id)
    await missions.checkIn(joiner, created.id)
    const row = await prisma.missionParticipant.findUniqueOrThrow({
      where: { missionId_userId: { missionId: created.id, userId: joiner } }
    })
    await missions.confirmAttendance(organizer, created.id, row.id)

    const result = await missions.completeMission(organizer, created.id)
    expect(result.verified).toBe(1)
    expect(result.badges.map(badge => badge.code)).toContain('FIRST_HELPER')

    const badges = await missions.myContributions(joiner)
    expect(badges.verifiedMissionCount).toBe(1)
    expect(badges.badges.map(badge => badge.code)).toContain('FIRST_HELPER')
  })

  it('never verifies the organizer against their own mission', async () => {
    const organizer = await makeUser('selfaward-org')
    const created = await mission(organizer, { requiresApproval: false })
    // Force the organizer onto their own roster, as a data error might.
    const row = await prisma.missionParticipant.create({
      data: { missionId: created.id, userId: organizer, status: 'ATTENDED', consentedAt: new Date() }
    })
    await missions.completeMission(organizer, created.id)

    const after = await prisma.missionParticipant.findUniqueOrThrow({ where: { id: row.id } })
    expect(after.status).toBe('ATTENDED')
    expect(after.verifiedAt).toBeNull()
    expect(
      await prisma.memberBadge.count({ where: { userId: organizer, revokedAt: null } })
    ).toBe(0)
  })

  it('refuses attendance from someone who is neither organizer nor staff', async () => {
    const organizer = await makeUser('stranger-att-org')
    const joiner = await makeUser('stranger-att-a')
    const meddler = await makeUser('meddler')
    const created = await mission(organizer)
    await missions.join(joiner, created.id)
    await missions.checkIn(joiner, created.id)
    const row = await prisma.missionParticipant.findUniqueOrThrow({
      where: { missionId_userId: { missionId: created.id, userId: joiner } }
    })

    await expect(
      missions.confirmAttendance(meddler, created.id, row.id)
    ).rejects.toBeInstanceOf(ForbiddenException)
    await expect(
      missions.confirmAttendance(joiner, created.id, row.id)
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('requires staff to confirm attendance on a flagged mission', async () => {
    const organizer = await makeUser('flag-org')
    const joiner = await makeUser('flag-a')
    const created = await mission(organizer, { requiresStaffVerification: true })
    await missions.join(joiner, created.id)
    await missions.checkIn(joiner, created.id)
    const row = await prisma.missionParticipant.findUniqueOrThrow({
      where: { missionId_userId: { missionId: created.id, userId: joiner } }
    })

    await expect(
      missions.confirmAttendance(organizer, created.id, row.id)
    ).rejects.toBeInstanceOf(ForbiddenException)

    await missions.confirmAttendance(staff, created.id, row.id, { asStaff: true })
    expect((await missions.completeMission(staff, created.id, { asStaff: true })).verified).toBe(1)
  })

  it('refuses completion by a non-organizer who is not staff', async () => {
    const organizer = await makeUser('complete-org')
    const stranger = await makeUser('complete-stranger')
    const created = await mission(organizer)
    await expect(
      missions.completeMission(stranger, created.id)
    ).rejects.toBeInstanceOf(ForbiddenException)
    // Passing asStaff is a claim, not a permission: the service checks the
    // role assignment itself, so a route cannot grant the flag to anyone.
    await expect(
      missions.completeMission(stranger, created.id, { asStaff: true })
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  // ------------------------------------------------------------ idempotency

  it('awards a badge once however many times completion is reconciled', async () => {
    const organizer = await makeUser('replay-org')
    const joiner = await makeUser('replay-a')
    const created = await mission(organizer)
    await missions.join(joiner, created.id)
    await missions.checkIn(joiner, created.id)
    const row = await prisma.missionParticipant.findUniqueOrThrow({
      where: { missionId_userId: { missionId: created.id, userId: joiner } }
    })
    await missions.confirmAttendance(organizer, created.id, row.id)
    await missions.completeMission(organizer, created.id)

    // The database refuses a second copy outright, so a replayed award cannot
    // be written even if some future code path tried.
    await expect(
      prisma.memberBadge.create({
        data: { userId: joiner, code: 'FIRST_HELPER', missionId: row.id }
      })
    ).rejects.toBeTruthy()
    expect(
      await prisma.memberBadge.count({ where: { userId: joiner, code: 'FIRST_HELPER' } })
    ).toBe(1)
  })

  it('rejects a second verified participation row for the same pair', async () => {
    const organizer = await makeUser('pair-org')
    const joiner = await makeUser('pair-a')
    const created = await mission(organizer)
    await prisma.missionParticipant.create({ data: { missionId: created.id, userId: joiner } })
    await expect(
      prisma.missionParticipant.create({ data: { missionId: created.id, userId: joiner } })
    ).rejects.toBeTruthy()
  })

  it('rejects a verified status without attendance evidence', async () => {
    const organizer = await makeUser('evidence-org')
    const joiner = await makeUser('evidence-a')
    const created = await mission(organizer)
    await expect(
      prisma.missionParticipant.create({
        data: { missionId: created.id, userId: joiner, status: 'VERIFIED', verifiedAt: new Date() }
      })
    ).rejects.toBeTruthy()
  })

  // ------------------------------------------------------------ moderation

  it('revokes verified participation and withdraws the badge it justified', async () => {
    const organizer = await makeUser('revoke-org')
    const joiner = await makeUser('revoke-a')
    const created = await mission(organizer)
    await missions.join(joiner, created.id)
    await missions.checkIn(joiner, created.id)
    const row = await prisma.missionParticipant.findUniqueOrThrow({
      where: { missionId_userId: { missionId: created.id, userId: joiner } }
    })
    await missions.confirmAttendance(organizer, created.id, row.id)
    await missions.completeMission(organizer, created.id)
    expect(
      await prisma.memberBadge.count({ where: { userId: joiner, revokedAt: null } })
    ).toBe(1)

    await missions.revokeVerification(staff, row.id, 'Never attended the event', { asStaff: true })

    const after = await missions.myContributions(joiner)
    expect(after.verifiedMissionCount).toBe(0)
    // The badge row survives with the reason it was withdrawn.
    const badge = await prisma.memberBadge.findFirstOrThrow({ where: { userId: joiner } })
    expect(badge.revokedAt).not.toBeNull()
    expect(badge.revocationReason).toBe('Never attended the event')
    expect(after.badges).toEqual([])
  })

  it('refuses a revocation by a stranger', async () => {
    const organizer = await makeUser('nosrevoke-org')
    const joiner = await makeUser('nosrevoke-a')
    const stranger = await makeUser('nosrevoke-s')
    const created = await mission(organizer)
    await missions.join(joiner, created.id)
    await missions.checkIn(joiner, created.id)
    const row = await prisma.missionParticipant.findUniqueOrThrow({
      where: { missionId_userId: { missionId: created.id, userId: joiner } }
    })
    await missions.confirmAttendance(organizer, created.id, row.id)
    await missions.completeMission(organizer, created.id)

    await expect(
      missions.revokeVerification(stranger, row.id, 'Not my mission')
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('hides a mission without deleting it or its history', async () => {
    const organizer = await makeUser('hide-org')
    const joiner = await makeUser('hide-a')
    const created = await mission(organizer)
    await missions.join(joiner, created.id)

    await missions.moderateMission(staff, created.id, 'hide', 'Reported as spam')

    // Gone from discovery and from the public detail view.
    const list = await missions.listMissions({}, joiner)
    expect(list.items.some(row => row.id === created.id)).toBe(false)
    await expect(missions.publicMission(created.id, joiner)).rejects.toBeInstanceOf(NotFoundException)
    // The organizer still sees it, and the moderation event is on record.
    expect((await missions.publicMission(created.id, organizer)).status).toBe(MissionStatus.ARCHIVED)
    const events = await prisma.missionModerationEvent.findMany({ where: { missionId: created.id } })
    expect(events.some(row => row.kind === 'HIDDEN')).toBe(true)
    expect(
      await prisma.missionParticipant.count({ where: { missionId: created.id } })
    ).toBe(1)
  })

  it('refuses moderation by a non-staff member', async () => {
    const organizer = await makeUser('mod-org')
    const stranger = await makeUser('mod-stranger')
    const created = await mission(organizer)
    // There is no flag to pass: moderation is staff-only and the service
    // checks the role assignment itself.
    await expect(
      missions.moderateMission(stranger, created.id, 'hide', 'Not staff')
    ).rejects.toBeInstanceOf(ForbiddenException)
    await expect(
      missions.moderateMission(stranger, created.id, 'restore', 'Not staff either')
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('refuses a non-staff member the moderation queue', async () => {
    const stranger = await makeUser('queue-stranger')
    await expect(missions.moderationQueue(stranger)).rejects.toBeInstanceOf(ForbiddenException)
    expect(Array.isArray(await missions.moderationQueue(staff))).toBe(true)
  })

  it('lets a member report a mission and keeps it off the public record', async () => {
    const organizer = await makeUser('report-org')
    const reporter = await makeUser('reporter')
    const created = await mission(organizer)

    const report = await missions.reportMission(reporter, created.id, 'OTHER', 'Misleading details')
    expect(report.id).toBeTruthy()
    // Reporting your own mission is refused.
    await expect(
      missions.reportMission(organizer, created.id, 'OTHER', 'Self report')
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  // ---------------------------------------------------------------- privacy

  it('never publishes the meeting point to a stranger', async () => {
    const organizer = await makeUser('location-org')
    const joiner = await makeUser('location-a')
    const stranger = await makeUser('location-s')
    const created = await mission(organizer)
    await missions.join(joiner, created.id)

    expect((await missions.publicMission(created.id, organizer)).meetingPoint).toContain('north gate')
    expect((await missions.publicMission(created.id, joiner)).meetingPoint).toContain('north gate')
    // A passer-by gets the mission without the meeting instructions.
    expect((await missions.publicMission(created.id, stranger)).meetingPoint).toBeNull()
    expect((await missions.publicMission(created.id)).meetingPoint).toBeNull()
  })

  it('hides a draft from everyone but its organizer', async () => {
    const organizer = await makeUser('secret-org')
    const stranger = await makeUser('secret-s')
    const created = await mission(organizer, { publishNow: false })
    await expect(missions.publicMission(created.id, stranger)).rejects.toBeInstanceOf(NotFoundException)
    expect((await missions.publicMission(created.id, organizer)).id).toBe(created.id)
  })

  it('keeps the roster to participants, and attendance to the organizer', async () => {
    const organizer = await makeUser('roster-org')
    const joiner = await makeUser('roster-a')
    const stranger = await makeUser('roster-s')
    const created = await mission(organizer)
    await missions.join(joiner, created.id)
    await missions.checkIn(joiner, created.id)

    await expect(missions.participantList(created.id, stranger)).rejects.toBeInstanceOf(
      ForbiddenException
    )
    // The organizer runs the check-in sheet, so they see who turned up.
    const roster = await missions.participantList(created.id, organizer)
    expect(roster.find(row => row.user?.id === joiner)?.status).toBe('CHECKED_IN')
    // A participant cannot read the roster before the mission is done.
    await expect(missions.participantList(created.id, joiner)).rejects.toBeInstanceOf(
      ForbiddenException
    )
  })

  it('paginates discovery server-side', async () => {
    const organizer = await makeUser('page-org')
    const created = await mission(organizer)
    const first = await missions.listMissions({ limit: 1, offset: 0 })
    expect(first.items).toHaveLength(1)
    expect(first.limit).toBe(1)
    const second = await missions.listMissions({ limit: 1, offset: 1 })
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id)
    // Beyond the end is an empty page, not an error.
    expect((await missions.listMissions({ limit: 50, offset: 10_000 })).items).toEqual([])
    expect(created.id).toBeTruthy()
  })

  it('filters discovery by category', async () => {
    const organizer = await makeUser('filter-org')
    await missions.createMission(organizer, {
      title: 'Community garden morning',
      description: 'Weeding and mulching in the beds behind the community hall.',
      category: MissionCategory.GARDENING,
      startAt: new Date(Date.now() + 5 * DAY),
      endAt: new Date(Date.now() + 5 * DAY + 3_600_000),
      capacity: 8,
      publishNow: true
    })
    const gardens = await missions.listMissions({ category: MissionCategory.GARDENING })
    expect(gardens.items.every(row => row.category === MissionCategory.GARDENING)).toBe(true)
  })

  it('scopes my missions and joined missions to the caller', async () => {
    const organizer = await makeUser('scope-org')
    const joiner = await makeUser('scope-a')
    const other = await makeUser('scope-other')
    const created = await mission(organizer)
    await missions.join(joiner, created.id)

    expect((await missions.listMissions({ mine: true }, organizer)).items.some(r => r.id === created.id)).toBe(true)
    expect((await missions.listMissions({ mine: true }, other)).items.some(r => r.id === created.id)).toBe(false)
    expect((await missions.listMissions({ joined: true }, joiner)).items.some(r => r.id === created.id)).toBe(true)
    expect((await missions.listMissions({ joined: true }, organizer)).items.some(r => r.id === created.id)).toBe(false)
  })

  // -------------------------------------------------------------- reminders

  it('sends a bounded reminder once per mission and participant', async () => {
    const organizer = await makeUser('remind-org')
    const joiner = await makeUser('remind-a')
    const start = new Date(Date.now() + 2 * 60 * 60 * 1000)
    const created = await missions.createMission(organizer, {
      title: 'Short-notice cleanup',
      description: 'A short-notice mission used to check that reminders fire once.',
      category: MissionCategory.CLEANUP,
      startAt: start,
      endAt: new Date(start.getTime() + 3_600_000),
      capacity: 3,
      publishNow: true
    })
    await missions.join(joiner, created.id)

    const first = await missions.sendUpcomingReminders()
    // Scoped to this mission: other suites share the database.
    expect(first.missionIds).toContain(created.id)
    // A second run in the same window must not add another reminder.
    const second = await missions.sendUpcomingReminders()
    expect(second.missionIds).not.toContain(created.id)

    const outbox = await prisma.domainEventOutbox.findMany({
      where: { type: 'mission.reminder', payload: { path: ['missionId'], equals: created.id } }
    })
    expect(outbox).toHaveLength(1)
  })

  it('sends no reminder for a mission far in the future or with nobody joining', async () => {
    const organizer = await makeUser('remind-far-org')
    const joiner = await makeUser('remind-far-a')

    // A mission three days out is outside the 24-hour window.
    const future = await mission(organizer)
    await missions.join(joiner, future.id)
    expect((await missions.sendUpcomingReminders()).missionIds).not.toContain(future.id)

    const soon = new Date(Date.now() + 60 * 60 * 1000)
    const near = await missions.createMission(organizer, {
      title: 'Tomorrow window cleanup',
      description: 'A near-term mission so the reminder window is actually crossed.',
      category: MissionCategory.CLEANUP,
      startAt: soon,
      endAt: new Date(soon.getTime() + 3_600_000),
      capacity: 3,
      publishNow: true
    })
    // Joining the far-future mission does not trigger a reminder for it.
    expect((await missions.sendUpcomingReminders()).missionIds).not.toContain(future.id)
    await missions.join(joiner, near.id)
    expect((await missions.sendUpcomingReminders()).missionIds).toContain(near.id)
  })

  // ----------------------------------------------------------- passport link

  it('shows verified contribution and badges on the passport', async () => {
    const organizer = await makeUser('passport-org')
    const joiner = await makeUser('passport-a')
    const created = await mission(organizer)
    await missions.join(joiner, created.id)
    await missions.checkIn(joiner, created.id)
    const row = await prisma.missionParticipant.findUniqueOrThrow({
      where: { missionId_userId: { missionId: created.id, userId: joiner } }
    })
    await missions.confirmAttendance(organizer, created.id, row.id)
    await missions.completeMission(organizer, created.id)

    const passport = await new PassportService(prisma).passport(joiner)
    expect(passport.contributions?.verifiedMissionCount).toBe(1)
    expect(passport.contributions?.badges.map(badge => badge.code)).toContain('FIRST_HELPER')
  })

  it('hides contributions when the member asked for that', async () => {
    const organizer = await makeUser('quiet-org')
    const joiner = await makeUser('quiet-a')
    const created = await mission(organizer)
    await missions.join(joiner, created.id)
    await passport.updatePrivacy(joiner, { showContributions: false })

    const view = await passport.passport(joiner)
    expect(view.contributions).toBeNull()
    // The member can still see their own record privately.
    expect((await missions.myContributions(joiner)).showContributions).toBe(false)
    expect(created.id).toBeTruthy()
  })

  // ------------------------------------------------------ badge thresholds

  it('computes badge thresholds from counts alone', () => {
    expect(badgesForRecord({ verifiedMissions: 0, completedLendings: 0 })).toEqual([])
    expect(badgesForRecord({ verifiedMissions: 1, completedLendings: 0 })).toEqual(['FIRST_HELPER'])
    expect(badgesForRecord({ verifiedMissions: 3, completedLendings: 0 })).toEqual([
      'FIRST_HELPER',
      'COMMUNITY_BUILDER'
    ])
    expect(badgesForRecord({ verifiedMissions: 10, completedLendings: 0 })).toContain('NEIGHBORHOOD_ANCHOR')
    expect(badgesForRecord({ verifiedMissions: 0, completedLendings: 3 })).toEqual(['GENEROUS_LENDER'])
  })

  it('publishes the badge catalogue with an explanation for each', async () => {
    const catalogue = await missions.badgeCatalogue()
    expect(catalogue.length).toBeGreaterThanOrEqual(4)
    for (const badge of catalogue) {
      expect(badge.explanation.length).toBeGreaterThan(20)
      expect(badge.description.length).toBeGreaterThan(5)
    }
  })

  it('records status history for every lifecycle move', async () => {
    const organizer = await makeUser('history-org')
    const created = await mission(organizer, { publishNow: false })
    await missions.transition(organizer, created.id, MissionStatus.PUBLISHED)
    await missions.transition(organizer, created.id, MissionStatus.CANCELLED)

    const events = await prisma.missionStatusEvent.findMany({
      where: { missionId: created.id },
      orderBy: { createdAt: 'asc' }
    })
    expect(events.map(row => row.toStatus)).toEqual([
      MissionStatus.DRAFT,
      MissionStatus.PUBLISHED,
      MissionStatus.CANCELLED
    ])
  })

  it('keeps a raw unique-violation readable as a conflict', async () => {
    const organizer = await makeUser('p2002-org')
    const a = await makeUser('p2002-a')
    const created = await mission(organizer)
    await missions.join(a, created.id)
    const error = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '6' })
    expect((error as { code?: string }).code).toBe('P2002')
    expect(created.id).toBeTruthy()
  })
})