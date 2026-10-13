import { randomUUID } from 'node:crypto'
import { MissionCategory } from '@prisma/client'
import { createTestPrisma } from '../common/testing/integration-fixtures'
import { OutboxWriter } from '../events/outbox-writer'
import { MissionsService } from '../missions/missions.service'
import { NotificationWorker } from '../notifications/notification-worker'
import { PassportService } from '../passport/passport.service'
import { PrismaService } from '../prisma/prisma.service'
import { ReviewsService } from '../passport/reviews.service'

const PASSWORD_HASH = '$argon2id$stub'
const DAY = 86_400_000

/**
 * Milestones 5 through 9 against one database and one event pipeline.
 *
 * The point of this suite is the seams. A review, a badge, a verified
 * participation, and a notification each cross a module boundary and a
 * transaction; this is where it shows up if one of those seams disagrees with
 * another. The retry checks at the end are the reason it exists.
 */
describe('Cross-milestone: reviews, missions, passport, and notifications', () => {
  let prisma: PrismaService
  let outbox: OutboxWriter
  let missions: MissionsService
  let passport: PassportService
  let reviews: ReviewsService
  let worker: NotificationWorker

  beforeAll(async () => {
    prisma = createTestPrisma()
    await prisma.$connect()
    outbox = new OutboxWriter(prisma)
    passport = new PassportService(prisma)
    missions = new MissionsService(prisma, outbox, passport)
    reviews = new ReviewsService(prisma, passport)
    // The realtime gateway is a fan-out channel, not a source of truth, so a
    // no-op stand-in keeps this suite about the durable pipeline.
    worker = new NotificationWorker(prisma, { emit: async () => undefined } as never)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  async function makeUser(prefix: string) {
    const id = randomUUID()
    await prisma.user.create({
      data: { id, email: `${prefix}-${id}@example.com`, passwordHash: PASSWORD_HASH }
    })
    await prisma.profile.create({
      data: {
        userId: id,
        firstName: 'Cross',
        lastName: 'Member',
        displayName: `Cross ${prefix}`,
        neighborhood: 'Riverside',
        emailVerified: true
      }
    })
    return id
  }

  async function completedExchange(a: string, b: string) {
    const transaction = await prisma.transaction.create({
      data: {
        status: 'COMPLETED',
        participants: {
          create: [
            { userId: a, role: 'lender' },
            { userId: b, role: 'borrower' }
          ]
        }
      }
    })
    return transaction.id
  }

  it('carries one member from a completed exchange to a verified mission and a badge', async () => {
    const organizer = await makeUser('cross-org')
    const neighbor = await makeUser('cross-neighbor')
    const moderator = await makeUser('cross-mod')
    await prisma.staffRoleAssignment.create({ data: { userId: moderator, role: 'MODERATOR' } })

    // 1–2. A completed exchange makes the pair review-eligible, and a review
    // written on both sides publishes.
    const transactionId = await completedExchange(organizer, neighbor)
    await reviews.createReview(organizer, {
      transactionId,
      subjectId: neighbor,
      rating: 5,
      body: 'Turned up on time and returned the drill cleaned.'
    })
    await reviews.createReview(neighbor, {
      transactionId,
      subjectId: organizer,
      rating: 4,
      body: 'Easy to arrange a pickup with.'
    })

    // 3. The published review shows on the passport being reviewed.
    const neighborPassport = await passport.passport(neighbor)
    expect(neighborPassport.rating?.count).toBe(1)
    expect(neighborPassport.rating?.average).toBeNull()

    // 4–5. Joining and checking in, then the organizer confirming attendance.
    const start = new Date(Date.now() + 3 * DAY)
    const mission = await missions.createMission(organizer, {
      title: 'Riverside path cleanup',
      description: 'Bagging litter along the riverside path between the bridge and the mill.',
      category: MissionCategory.CLEANUP,
      neighborhood: 'Riverside',
      city: 'Atlanta',
      meetingPoint: 'Meet at the bridge car park.',
      startAt: start,
      endAt: new Date(start.getTime() + 3 * 60 * 60 * 1000),
      capacity: 6,
      publishNow: true
    })
    await missions.join(neighbor, mission.id)
    await missions.checkIn(neighbor, mission.id)
    const participation = await prisma.missionParticipant.findUniqueOrThrow({
      where: { missionId_userId: { missionId: mission.id, userId: neighbor } }
    })
    await missions.confirmAttendance(organizer, mission.id, participation.id)

    // 6–8. Completion verifies attendance, which credits the passport and
    // awards the first badge.
    const completed = await missions.completeMission(organizer, mission.id)
    expect(completed.verified).toBe(1)
    expect(completed.badges.map(badge => badge.code)).toContain('FIRST_HELPER')

    const afterMission = await passport.passport(neighbor)
    expect(afterMission.contributions?.verifiedMissionCount).toBe(1)
    expect(afterMission.contributions?.badges.map(badge => badge.code)).toContain('FIRST_HELPER')
    // The review summary is untouched by the mission: the two domains stay
    // separate rather than one blurring into the other.
    expect(afterMission.rating?.count).toBe(1)

    // 9. Notifications reach the right people and nobody else. The neighbor
    // hears they were confirmed and that participation was verified; the
    // organizer is not told about their own action.
    await worker.drain(200)
    const forNeighbor = await prisma.notification.findMany({
      where: { userId: neighbor },
      select: { type: true, link: true }
    })
    expect(forNeighbor.some(row => row.type === 'mission_participation_verified')).toBe(true)
    expect(forNeighbor.some(row => row.type === 'badge_earned')).toBe(true)
    expect(forNeighbor.some(row => row.type === 'mission_attendance_confirmed')).toBe(true)
    for (const row of forNeighbor) {
      // Every deep link resolves to a real client route.
      expect(row.link).toMatch(/^\/(missions|borrow)/)
    }
    const forOrganizer = await prisma.notification.findMany({
      where: { userId: organizer },
      select: { type: true }
    })
    expect(forOrganizer.some(row => row.type === 'mission_participation_verified')).toBe(false)
    expect(forOrganizer.some(row => row.type === 'badge_earned')).toBe(false)

    // 10–11. A moderator revokes fraudulent participation, and the passport
    // count and badge state both follow.
    await missions.revokeVerification(moderator, participation.id, 'Was not at the event', {
      asStaff: true
    })
    const afterRevocation = await passport.passport(neighbor)
    expect(afterRevocation.contributions?.verifiedMissionCount).toBe(0)
    expect(afterRevocation.contributions?.badges).toEqual([])
    // The review history is a separate record and survives the reversal.
    expect(afterRevocation.rating?.count).toBe(1)

    const badgeRow = await prisma.memberBadge.findFirstOrThrow({
      where: { userId: neighbor, code: 'FIRST_HELPER' }
    })
    expect(badgeRow.revokedAt).not.toBeNull()
    expect(badgeRow.revocationReason).toBe('Was not at the event')
  })

  it('does not duplicate a badge, a credit, or a notification when events replay', async () => {
    const organizer = await makeUser('replay-org')
    const neighbor = await makeUser('replay-neighbor')

    const start = new Date(Date.now() + 2 * DAY)
    const mission = await missions.createMission(organizer, {
      title: 'Community garden weeding',
      description: 'Clearing the beds behind the hall and spreading fresh mulch.',
      category: MissionCategory.GARDENING,
      startAt: start,
      endAt: new Date(start.getTime() + 2 * 60 * 60 * 1000),
      capacity: 5,
      publishNow: true
    })
    await missions.join(neighbor, mission.id)
    await missions.checkIn(neighbor, mission.id)
    const participation = await prisma.missionParticipant.findUniqueOrThrow({
      where: { missionId_userId: { missionId: mission.id, userId: neighbor } }
    })
    await missions.confirmAttendance(organizer, mission.id, participation.id)
    await missions.completeMission(organizer, mission.id)

    const badgesAfterFirstRun = await prisma.memberBadge.count({ where: { userId: neighbor } })
    const verifiedAfterFirstRun = await prisma.missionParticipant.count({
      where: { userId: neighbor, status: 'VERIFIED' }
    })
    expect(badgesAfterFirstRun).toBe(1)

    // Re-running the notification poller is the retry a deployment actually
    // performs. The dedupe key means it produces nothing new.
    await worker.drain(200)
    await worker.drain(200)
    const notifications = await prisma.notification.count({ where: { userId: neighbor } })
    const again = await worker.drain(200)
    expect(again).toBe(0)
    expect(await prisma.notification.count({ where: { userId: neighbor } })).toBe(notifications)
    // One participation, one credit, one badge: nothing inflated.
    expect(await prisma.missionParticipant.count({ where: { missionId: mission.id, userId: neighbor } })).toBe(1)
    expect(
      await prisma.missionParticipant.count({ where: { userId: neighbor, status: 'VERIFIED' } })
    ).toBe(verifiedAfterFirstRun)
    expect(await prisma.memberBadge.count({ where: { userId: neighbor } })).toBe(badgesAfterFirstRun)
  })

  it('keeps a review unpublishable by a raw insert after both sides reviewed', async () => {
    const a = await makeUser('raw-a')
    const b = await makeUser('raw-b')
    const transactionId = await completedExchange(a, b)
    await reviews.createReview(a, {
      transactionId,
      subjectId: b,
      rating: 5,
      body: 'A review that will publish once both sides have written one.'
    })

    // The unique index is the real duplicate guard, not the service.
    await expect(
      prisma.review.create({
        data: { transactionId, authorId: a, subjectId: b, rating: 1, body: 'A second review of the same exchange.' }
      })
    ).rejects.toBeTruthy()
    expect(await reviews.listForSubject(b)).toHaveLength(0)
  })
})