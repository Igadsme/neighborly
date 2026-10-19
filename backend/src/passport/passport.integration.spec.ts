import { randomUUID } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common'
import { ReviewStatus, TransactionStatus, VerificationMethod, VerificationStatus } from '@prisma/client'
import { PassportService } from './passport.service'
import { ReviewsService } from './reviews.service'
import { PrismaService } from '../prisma/prisma.service'
import { createTestPrisma } from '../common/testing/integration-fixtures'

const PASSWORD_HASH = '$argon2id$stub'
const DAY = 86_400_000

/**
 * Passport, reviews, verification, and moderation against real PostgreSQL.
 *
 * The publication policy is the part most likely to be subtly wrong, so it
 * gets the most attention here: who can review, when a review becomes visible,
 * and what happens to it afterwards.
 */
describe('Passport and trust against real PostgreSQL', () => {
  let prisma: PrismaService
  let passport: PassportService
  let reviews: ReviewsService
  let staff: string

  beforeAll(async () => {
    prisma = createTestPrisma()
    await prisma.$connect()
    passport = new PassportService(prisma)
    reviews = new ReviewsService(prisma, passport)
    staff = randomUUID()
    await prisma.user.create({
      data: { id: staff, email: `staff-${staff}@example.com`, passwordHash: PASSWORD_HASH }
    })
    await prisma.profile.create({ data: { userId: staff, firstName: 'Staff', lastName: 'Member' } })
    await prisma.staffRoleAssignment.create({ data: { userId: staff, role: 'MODERATOR' } })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  async function makeUser(prefix: string, overrides: { status?: 'ACTIVE' | 'SUSPENDED'; emailVerified?: boolean; id?: string } = {}) {
    const id = overrides.id ?? randomUUID()
    await prisma.user.create({
      data: {
        id,
        email: `${prefix}-${id}@example.com`,
        passwordHash: PASSWORD_HASH,
        ...(overrides.status ? { status: overrides.status } : {})
      }
    })
    await prisma.profile.create({
      data: {
        userId: id,
        firstName: 'Test',
        lastName: 'Member',
        displayName: 'Test Member',
        neighborhood: 'Inman Park',
        city: 'Atlanta',
        emailVerified: overrides.emailVerified ?? true
      }
    })
    return id
  }

  /** A COMPLETED marketplace exchange between two members. */
  async function completedExchange(a: string, b: string, status: TransactionStatus = TransactionStatus.COMPLETED) {
    const transaction = await prisma.transaction.create({
      data: {
        status,
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

  // ------------------------------------------------------------- visibility

  it('builds a passport from real records and invents nothing', async () => {
    const a = await makeUser('pass-a')
    const b = await makeUser('pass-b')
    await completedExchange(a, b)
    await completedExchange(b, a)

    const view = await passport.passport(a)
    expect(view.counts.completedExchanges).toBe(2)
    expect(view.displayName).toBe('Test Member')
    expect(view.neighborhood).toBe('Inman Park')
    expect(view.trustSignals.length).toBeGreaterThan(0)
    // A member with no history must not show invented activity.
    expect(view.rating).toMatchObject({ average: null, count: 0, tooFewToRate: true })
  })

  it('never returns email, coordinates, or moderation state', async () => {
    const a = await makeUser('safe-a')
    const b = await makeUser('safe-b')
    await prisma.profile.update({
      where: { userId: a },
      data: { latitude: 33.7494, longitude: -84.388 }
    })
    await prisma.blockedUser.create({ data: { blockerId: a, blockedId: b } })

    const view = await passport.passport(a)
    const serialized = JSON.stringify(view)
    expect(serialized).not.toContain('@example.com')
    expect(serialized).not.toContain('33.7494')
    expect(serialized).not.toContain('-84.388')
    expect(serialized).not.toContain('SUSPENDED')
    expect(serialized).not.toContain('passwordHash')
    expect(view).not.toHaveProperty('email')
  })

  it('counts only completed exchanges', async () => {
    const a = await makeUser('count-a')
    const b = await makeUser('count-b')
    await completedExchange(a, b)
    await completedExchange(a, b, TransactionStatus.CANCELLED)
    await completedExchange(a, b, TransactionStatus.DISPUTED)

    expect((await passport.passport(a)).counts.completedExchanges).toBe(1)
  })

  it('counts borrowings and separates lending from borrowing', async () => {
    const lender = await makeUser('bor-lender')
    const borrower = await makeUser('bor-borrower')
    const category = randomUUID()
    await prisma.category.create({ data: { id: category, name: `M8 ${category.slice(0, 8)}`, slug: `m8-${category}` } })
    const listing = await prisma.listing.create({
      data: {
        sellerId: lender,
        categoryId: category,
        title: 'Drill',
        description: 'A reliable drill for borrowing.',
        status: 'PUBLISHED'
      }
    })
    const now = new Date()
    await prisma.borrowRequest.create({
      data: {
        listingId: listing.id,
        lenderId: lender,
        borrowerId: borrower,
        status: 'COMPLETED',
        startAt: new Date(now.getTime() - 10 * DAY),
        endAt: new Date(now.getTime() - 5 * DAY),
        originalEndAt: new Date(now.getTime() - 5 * DAY),
        returnedAt: new Date(now.getTime() - 5 * DAY),
        completedAt: new Date(now.getTime() - 5 * DAY)
      }
    })

    const lenderView = await passport.passport(lender)
    expect(lenderView.counts.borrowingsAsLender).toBe(1)
    expect(lenderView.counts.borrowingsAsBorrower).toBe(0)
    // Returned exactly on the due date, so it counts as on time.
    expect((await passport.trustInputs(borrower)).onTimeReturns).toBe(1)
  })

  it('does not count a late return as on time', async () => {
    const lender = await makeUser('late-lender')
    const borrower = await makeUser('late-borrower')
    const category = randomUUID()
    await prisma.category.create({ data: { id: category, name: `M8 ${category.slice(0, 8)}`, slug: `m8-${category}` } })
    const listing = await prisma.listing.create({
      data: {
        sellerId: lender,
        categoryId: category,
        title: 'Drill',
        description: 'A reliable drill for borrowing.',
        status: 'PUBLISHED'
      }
    })
    const now = new Date()
    await prisma.borrowRequest.create({
      data: {
        listingId: listing.id,
        lenderId: lender,
        borrowerId: borrower,
        status: 'COMPLETED',
        startAt: new Date(now.getTime() - 20 * DAY),
        endAt: new Date(now.getTime() - 10 * DAY),
        originalEndAt: new Date(now.getTime() - 10 * DAY),
        // Two days after the due date.
        returnedAt: new Date(now.getTime() - 8 * DAY),
        completedAt: new Date(now.getTime() - 8 * DAY)
      }
    })
    expect((await passport.trustInputs(borrower)).onTimeReturns).toBe(0)
  })

  it('withdraws behavioural badges while a dispute is open', async () => {
    const lender = await makeUser('disp-lender')
    const borrower = await makeUser('disp-borrower')
    await completedExchange(lender, borrower)
    await completedExchange(lender, borrower)
    await completedExchange(lender, borrower)
    const before = await passport.trustInputs(lender)
    expect(before.completedExchanges).toBe(3)

    const category = randomUUID()
    await prisma.category.create({ data: { id: category, name: `M8 ${category.slice(0, 8)}`, slug: `m8-${category}` } })
    const listing = await prisma.listing.create({
      data: {
        sellerId: lender,
        categoryId: category,
        title: 'Drill',
        description: 'A reliable drill for borrowing.',
        status: 'PUBLISHED'
      }
    })
    const borrow = await prisma.borrowRequest.create({
      data: {
        listingId: listing.id,
        lenderId: lender,
        borrowerId: borrower,
        status: 'DISPUTED',
        startAt: new Date(Date.now() - 10 * DAY),
        endAt: new Date(Date.now() - 5 * DAY),
        originalEndAt: new Date(Date.now() - 5 * DAY)
      }
    })
    await prisma.borrowDispute.create({
      data: { borrowRequestId: borrow.id, openedById: borrower, reason: 'DAMAGE', summary: 'Broken chuck' }
    })

    const after = await passport.trustInputs(lender)
    expect(after.hasOpenDispute).toBe(true)
    const signals = await passport.passport(lender)
    const exchangeBadge = signals.trustSignals.find(s => s.key === 'completed_exchanges')
    expect(exchangeBadge?.earned).toBe(false)
  })

  it('withdraws the passport of a suspended member', async () => {
    const a = await makeUser('susp-passport', { status: 'SUSPENDED' })
    await completedExchange(a, await makeUser('susp-other'))
    const view = await passport.passport(a)
    expect(view.withdrawn).toBe(true)
    expect(view.trustSignals.every(signal => !signal.earned)).toBe(true)
  })

  // --------------------------------------------------------------- privacy

  it('hides what the member chose to hide and nothing else', async () => {
    const a = await makeUser('priv-a')
    await completedExchange(a, await makeUser('priv-b'))
    await passport.updatePrivacy(a, { showRatings: false, showTenure: false })

    const view = await passport.passport(a)
    expect(view.rating).toBeNull()
    expect(view.memberSince).toBeNull()
    expect(view.accountAgeDays).toBeNull()
    // Activity counts stay public: they are aggregate facts, not opinions.
    expect(view.counts.completedExchanges).toBe(1)
  })

  it('keeps a member off the public leaderboard unless they opt in', async () => {
    const quiet = await makeUser('leader-quiet')
    const loud = await makeUser('leader-loud')
    await passport.updatePrivacy(quiet, { leaderboardOptIn: false })
    await passport.updatePrivacy(loud, { leaderboardOptIn: true })

    const board = await passport.leaderboard({ limit: 100 })
    expect(board.map(row => row.userId)).toContain(loud)
    expect(board.map(row => row.userId)).not.toContain(quiet)
  })

  it('ranks opted-in active members by completed exchanges before paging, and breaks ties on id', async () => {
    const partner = await makeUser('board-partner')
    const high = await makeUser('board-high')
    const low = await makeUser('board-low')
    const borrowed = await makeUser('board-borrowed')
    const quiet = await makeUser('board-quiet')
    const suspended = await makeUser('board-suspended', { status: 'SUSPENDED' })
    const removed = await makeUser('board-removed')
    const tieIds = [randomUUID(), randomUUID()].sort()
    const tieFirst = await makeUser('board-tie-a', { id: tieIds[0] })
    const tieSecond = await makeUser('board-tie-b', { id: tieIds[1] })

    for (const member of [high, low, borrowed, tieFirst, tieSecond, suspended, removed]) {
      await passport.updatePrivacy(member, { leaderboardOptIn: true })
    }
    await passport.updatePrivacy(quiet, { leaderboardOptIn: false })
    await prisma.user.update({ where: { id: removed }, data: { deletedAt: new Date() } })

    for (let count = 0; count < 3; count += 1) await completedExchange(high, partner)
    await completedExchange(low, partner)
    await completedExchange(tieFirst, partner)
    await completedExchange(tieFirst, await makeUser('board-extra-a'))
    await completedExchange(tieSecond, partner)
    await completedExchange(tieSecond, await makeUser('board-extra-b'))
    for (let count = 0; count < 4; count += 1) await completedExchange(suspended, partner)
    for (let count = 0; count < 4; count += 1) await completedExchange(removed, partner)
    for (let count = 0; count < 4; count += 1) await completedExchange(quiet, partner)

    const category = randomUUID()
    await prisma.category.create({ data: { id: category, name: `Board ${category.slice(0, 8)}`, slug: `board-${category}` } })
    const listing = await prisma.listing.create({
      data: {
        sellerId: partner,
        categoryId: category,
        title: 'Ladder',
        description: 'A ladder counted as a borrowing, not an exchange.',
        status: 'PUBLISHED'
      }
    })
    const now = new Date()
    await prisma.borrowRequest.create({
      data: {
        listingId: listing.id,
        lenderId: partner,
        borrowerId: borrowed,
        status: 'COMPLETED',
        startAt: new Date(now.getTime() - 10 * DAY),
        endAt: new Date(now.getTime() - DAY),
        originalEndAt: new Date(now.getTime() - DAY),
        returnedAt: new Date(now.getTime() - DAY),
        completedAt: new Date(now.getTime() - DAY)
      }
    })

    const wanted = [high, tieFirst, tieSecond, low, borrowed]
    const found: string[] = []
    let borrowedRow: { completedExchanges: number; completedBorrowings: number; borrowingsAsLender: number } | undefined
    let previousCount = Number.POSITIVE_INFINITY
    let previousId = ''
    for (let offset = 0; offset < 200; offset += 2) {
      const page = await passport.leaderboard({ limit: 2, offset })
      if (page.length === 0) break
      for (let index = 0; index < page.length; index += 1) {
        const row = page[index]
        const ahead = index === 0 ? { completedExchanges: previousCount, userId: previousId } : page[index - 1]
        expect(row.completedExchanges).toBeLessThanOrEqual(ahead.completedExchanges)
        if (row.completedExchanges === ahead.completedExchanges && ahead.userId) {
          expect(row.userId > ahead.userId).toBe(true)
        }
        previousCount = row.completedExchanges
        previousId = row.userId
        if (wanted.includes(row.userId)) {
          found.push(row.userId)
          const inputs = await passport.trustInputs(row.userId)
          expect(row.completedExchanges).toBe(inputs.completedExchanges)
          expect(row.completedBorrowings).toBe(inputs.completedBorrowings)
          expect(row.borrowingsAsLender).toBe(inputs.borrowingsAsLender)
        }
        if (row.userId === borrowed) borrowedRow = row
        expect([quiet, suspended, removed, partner]).not.toContain(row.userId)
      }
      if (page.length < 2) break
    }

    expect(found).toEqual(wanted)
    expect(borrowedRow).toMatchObject({ completedExchanges: 0, completedBorrowings: 1, borrowingsAsLender: 0 })
  })

  // --------------------------------------------------------- review eligibility

  it('lets a participant review after a completed exchange', async () => {
    const a = await makeUser('rev-a')
    const b = await makeUser('rev-b')
    const transactionId = await completedExchange(a, b)
    const review = await reviews.createReview(a, { transactionId, subjectId: b, rating: 5, body: 'Smooth handoff.' })
    expect(review.status).toBe(ReviewStatus.PENDING)
    expect(review.visible).toBe(false)
    expect(review.publicationNote).toMatch(/once the other person reviews/i)
  })

  it('refuses a review of an incomplete exchange', async () => {
    const a = await makeUser('early-a')
    const b = await makeUser('early-b')
    for (const status of [TransactionStatus.ACCEPTED, TransactionStatus.CANCELLED, TransactionStatus.DISPUTED]) {
      const transactionId = await completedExchange(a, b, status)
      await expect(
        reviews.createReview(a, { transactionId, subjectId: b, rating: 5, body: 'Too soon.' })
      ).rejects.toBeInstanceOf(BadRequestException)
    }
  })

  it('refuses a self-review', async () => {
    const a = await makeUser('self-a')
    const b = await makeUser('self-b')
    const transactionId = await completedExchange(a, b)
    await expect(
      reviews.createReview(a, { transactionId, subjectId: a, rating: 5, body: 'Reviewing myself.' })
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('refuses a review by someone who was not in the exchange', async () => {
    const a = await makeUser('stranger-a')
    const b = await makeUser('stranger-b')
    const outsider = await makeUser('stranger-out')
    const transactionId = await completedExchange(a, b)
    await expect(
      reviews.createReview(outsider, { transactionId, subjectId: b, rating: 1, body: 'Never met them.' })
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('refuses a review of a blocked member', async () => {
    const a = await makeUser('blocked-a')
    const b = await makeUser('blocked-b')
    const transactionId = await completedExchange(a, b)
    await prisma.blockedUser.create({ data: { blockerId: b, blockedId: a } })
    await expect(
      reviews.createReview(a, { transactionId, subjectId: b, rating: 5, body: 'Blocked relationship.' })
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('refuses a second review of the same exchange', async () => {
    const a = await makeUser('dupe-a')
    const b = await makeUser('dupe-b')
    const transactionId = await completedExchange(a, b)
    await reviews.createReview(a, { transactionId, subjectId: b, rating: 5, body: 'First one here.' })
    await expect(
      reviews.createReview(a, { transactionId, subjectId: b, rating: 1, body: 'Changing my mind.' })
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('lets exactly one of two concurrent reviews of the same exchange succeed', async () => {
    const a = await makeUser('race-a')
    const b = await makeUser('race-b')
    const transactionId = await completedExchange(a, b)
    const outcomes = await Promise.allSettled([
      reviews.createReview(a, { transactionId, subjectId: b, rating: 5, body: 'One of these will win.' }),
      reviews.createReview(a, { transactionId, subjectId: b, rating: 4, body: 'The other will lose.' })
    ])
    // The database unique index is the real guard, so both requests can reach
    // the write and only one commits.
    expect(outcomes.filter(row => row.status === 'fulfilled')).toHaveLength(1)
    expect(await prisma.review.count({ where: { transactionId, authorId: a } })).toBe(1)
  })

  it('refuses a rating outside one to five', async () => {
    const a = await makeUser('range-a')
    const b = await makeUser('range-b')
    const transactionId = await completedExchange(a, b)
    // The check constraint is the backstop behind the DTO validation.
    await expect(
      prisma.review.create({
        data: { transactionId, authorId: a, subjectId: b, rating: 9, body: 'Out of range value.' }
      })
    ).rejects.toBeTruthy()
  })

  // -------------------------------------------------- publication policy

  it('publishes both reviews once both sides have reviewed', async () => {
    const a = await makeUser('pub-a')
    const b = await makeUser('pub-b')
    const transactionId = await completedExchange(a, b)
    await reviews.createReview(a, { transactionId, subjectId: b, rating: 5, body: 'Reliable borrower here.' })
    await reviews.createReview(b, { transactionId, subjectId: a, rating: 4, body: 'Reliable lender here.' })

    const published = await reviews.listForSubject(b)
    expect(published).toHaveLength(1)
    expect(published[0].body).toBe('Reliable borrower here.')
  })

  it('holds a review until the window closes', async () => {
    const a = await makeUser('win-a')
    const b = await makeUser('win-b')
    const transactionId = await completedExchange(a, b)
    await passport.updatePrivacy(a, { reviewWindowDays: 1 })
    await reviews.createReview(a, { transactionId, subjectId: b, rating: 5, body: 'Waiting for the window.' })

    expect(await reviews.listForSubject(b)).toHaveLength(0)
    // Nothing publishes early.
    expect(await reviews.publishDueReviews()).toBe(0)
    expect(await reviews.listForSubject(b)).toHaveLength(0)

    // After the window, it publishes whether or not the other side reviews.
    expect(await reviews.publishDueReviews(new Date(Date.now() + 2 * DAY))).toBe(1)
    const published = await reviews.listForSubject(b)
    expect(published).toHaveLength(1)
    expect(published[0].context).toBe('lent this item')
  })

  it('publishes exactly once however many times the sweep runs', async () => {
    const a = await makeUser('once-a')
    const b = await makeUser('once-b')
    const transactionId = await completedExchange(a, b)
    await passport.updatePrivacy(a, { reviewWindowDays: 1 })
    const review = await reviews.createReview(a, {
      transactionId,
      subjectId: b,
      rating: 5,
      body: 'Publish me exactly once.'
    })

    const later = new Date(Date.now() + 2 * DAY)
    expect(await reviews.publishDueReviews(later)).toBe(1)
    expect(await reviews.publishDueReviews(later)).toBe(0)
    expect(await reviews.publishIfDue(review.id, later)).toBe(false)

    const events = await prisma.trustAuditEvent.count({
      where: { refId: review.id, kind: 'REVIEW_PUBLISHED' }
    })
    expect(events).toBe(1)
  })

  it('lets exactly one of two concurrent sweeps publish a review', async () => {
    const a = await makeUser('sweep-a')
    const b = await makeUser('sweep-b')
    const transactionId = await completedExchange(a, b)
    await passport.updatePrivacy(a, { reviewWindowDays: 1 })
    await reviews.createReview(a, { transactionId, subjectId: b, rating: 5, body: 'Race the sweep.' })

    const later = new Date(Date.now() + 2 * DAY)
    const results = await Promise.all([
      reviews.publishDueReviews(later),
      reviews.publishDueReviews(later)
    ])
    expect(results.reduce((total, value) => total + value, 0)).toBe(1)
  })

  // ------------------------------------------------------------- editing

  it('lets an author edit inside the window and refuses afterwards', async () => {
    const a = await makeUser('edit-a')
    const b = await makeUser('edit-b')
    const transactionId = await completedExchange(a, b)
    const review = await reviews.createReview(a, { transactionId, subjectId: b, rating: 3, body: 'Original wording here.' })

    const edited = await reviews.updateReview(a, review.id, { body: 'Corrected wording here.' })
    expect(edited.body).toBe('Corrected wording here.')
    expect(edited.editedAt).not.toBeNull()

    // After the edit window, the review is history.
    await prisma.review.update({
      where: { id: review.id },
      data: { editableUntil: new Date(Date.now() - 1000) }
    })
    await expect(
      reviews.updateReview(a, review.id, { body: 'Too late to change this.' })
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('refuses to edit somebody else review', async () => {
    const a = await makeUser('other-a')
    const b = await makeUser('other-b')
    const c = await makeUser('other-c')
    const transactionId = await completedExchange(a, b)
    const review = await reviews.createReview(a, { transactionId, subjectId: b, rating: 5, body: 'Mine to edit.' })
    await expect(reviews.updateReview(c, review.id, { body: 'Not yours to edit.' })).rejects.toBeInstanceOf(
      NotFoundException
    )
  })

  it('lists only completed exchanges the caller has not reviewed', async () => {
    const a = await makeUser('list-a')
    const b = await makeUser('list-b')
    const reviewed = await completedExchange(a, b)
    await completedExchange(a, b)
    await completedExchange(a, b, TransactionStatus.CANCELLED)
    await reviews.createReview(a, { transactionId: reviewed, subjectId: b, rating: 5, body: 'Already done here.' })

    const reviewable = await reviews.reviewableExchanges(a)
    expect(reviewable).toHaveLength(1)
    expect(reviewable.map(row => row.transactionId)).not.toContain(reviewed)
  })

  // ------------------------------------------------------------ moderation

  it('hides a reported review and removes it from the public summary', async () => {
    const a = await makeUser('hide-a')
    const b = await makeUser('hide-b')
    const c = await makeUser('hide-c')
    const transactionId = await completedExchange(a, b)
    await reviews.createReview(a, { transactionId, subjectId: b, rating: 5, body: 'A real review here.' })
    await reviews.createReview(b, { transactionId, subjectId: a, rating: 5, body: 'A real review there.' })

    const report = await reviews.reportReview(c, (
      await reviews.myReviews(a)
    )[0].id, 'SPAM' as never, 'Looks like review farming.')
    expect(report.id).toBeTruthy()

    const queue = await reviews.moderationQueue(staff)
    expect(queue.some(row => row.review?.id)).toBe(true)
    // The reporter is visible to staff, which is why the queue is staff-only.
    expect(queue[0].reporter).toBeTruthy()

    const target = (await reviews.myReviews(a))[0]
    await reviews.hideReview(staff, target.id, 'Review farming pattern')
    expect(await reviews.listForSubject(b)).toHaveLength(0)

    const row = await prisma.review.findUniqueOrThrow({ where: { id: target.id } })
    // The row survives with its moderation history intact.
    expect(row.status).toBe(ReviewStatus.HIDDEN)
    expect(row.hiddenReason).toBe('Review farming pattern')
  })

  it('refuses a moderator that is not staff', async () => {
    const a = await makeUser('nostaff-a')
    const b = await makeUser('nostaff-b')
    const transactionId = await completedExchange(a, b)
    const review = await reviews.createReview(a, { transactionId, subjectId: b, rating: 5, body: 'Nothing to hide.' })

    await expect(reviews.moderationQueue(a)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(reviews.hideReview(a, review.id, 'Not staff here')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('refuses to report your own review', async () => {
    const a = await makeUser('ownrep-a')
    const b = await makeUser('ownrep-b')
    const transactionId = await completedExchange(a, b)
    const review = await reviews.createReview(a, { transactionId, subjectId: b, rating: 5, body: 'My own review.' })
    await expect(reviews.reportReview(a, review.id, 'SPAM' as never)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('restores a hidden review and puts it back in the summary', async () => {
    const a = await makeUser('restore-a')
    const b = await makeUser('restore-b')
    const transactionId = await completedExchange(a, b)
    await reviews.createReview(a, { transactionId, subjectId: b, rating: 5, body: 'Restore me please.' })
    await reviews.createReview(b, { transactionId, subjectId: a, rating: 5, body: 'And restore me too.' })
    const review = (await reviews.myReviews(a))[0]

    await reviews.hideReview(staff, review.id, 'Under review')
    expect(await reviews.listForSubject(b)).toHaveLength(0)

    await reviews.restoreReview(staff, review.id, 'Cleared after checking')
    expect(await reviews.listForSubject(b)).toHaveLength(1)
  })

  // ------------------------------------------------------------- appeals

  it('lets a member appeal a hidden review and restores it on success', async () => {
    const a = await makeUser('appeal-a')
    const b = await makeUser('appeal-b')
    const transactionId = await completedExchange(a, b)
    await reviews.createReview(a, { transactionId, subjectId: b, rating: 5, body: 'Please do not hide this.' })
    await reviews.createReview(b, { transactionId, subjectId: a, rating: 5, body: 'Fair review back here.' })
    const review = (await reviews.myReviews(a))[0]

    await reviews.hideReview(staff, review.id, 'Investigating')
    const appeal = await passport.submitAppeal(a, {
      subjectType: 'REVIEW',
      subjectId: review.id,
      reason: 'This review is honest and I would like it back.'
    })
    expect(appeal.status).toBe('SUBMITTED')

    const queue = await passport.listAppealsForStaff(staff)
    expect(queue.some(row => row.id === appeal.id)).toBe(true)

    await passport.resolveAppeal(staff, appeal.id, {
      status: 'RESOLVED',
      resolution: 'Cleared'
    })
    expect(await reviews.listForSubject(b)).toHaveLength(1)
    const events = await prisma.trustAuditEvent.count({
      where: { userId: a, kind: 'APPEAL_RESOLVED' }
    })
    expect(events).toBe(1)
  })

  it('refuses an appeal for a review that was not acted on', async () => {
    const a = await makeUser('noappeal-a')
    const b = await makeUser('noappeal-b')
    const transactionId = await completedExchange(a, b)
    const review = await reviews.createReview(a, { transactionId, subjectId: b, rating: 5, body: 'Still visible here.' })
    await expect(
      passport.submitAppeal(a, { subjectType: 'REVIEW', subjectId: review.id, reason: 'Nothing to appeal yet.' })
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('refuses to appeal someone else review', async () => {
    const a = await makeUser('otherappeal-a')
    const b = await makeUser('otherappeal-b')
    const c = await makeUser('otherappeal-c')
    const transactionId = await completedExchange(a, b)
    await reviews.createReview(a, { transactionId, subjectId: b, rating: 5, body: 'Someone elses review here.' })
    await reviews.createReview(b, { transactionId, subjectId: a, rating: 5, body: 'Review back this way.' })
    const review = (await reviews.myReviews(a))[0]
    await reviews.hideReview(staff, review.id, 'Investigating')

    await expect(
      passport.submitAppeal(c, { subjectType: 'REVIEW', subjectId: review.id, reason: 'Not my review at all.' })
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  // ---------------------------------------------------------- verification

  it('refuses to let a member grant themselves email verification', async () => {
    const a = await makeUser('selfemail', { emailVerified: false })
    await expect(
      passport.submitVerification(a, { method: VerificationMethod.EMAIL, statement: 'Trust me.' })
    ).rejects.toBeInstanceOf(BadRequestException)
    const rows = await passport.myVerifications(a)
    expect(rows.emailVerified).toBe(false)
  })

  it('reports email verification from the account record, not a claim', async () => {
    const a = await makeUser('emailok', { emailVerified: true })
    const b = await makeUser('emailno', { emailVerified: false })
    expect((await passport.myVerifications(a)).emailVerified).toBe(true)
    expect((await passport.myVerifications(b)).emailVerified).toBe(false)

    const view = await passport.passport(b)
    const emailBadge = view.verifications.find(row => row.method === VerificationMethod.EMAIL)
    expect(emailBadge).toBeUndefined()
  })

  it('walks a staff-reviewed verification through pending to approved', async () => {
    const a = await makeUser('verify-a')
    const record = await passport.submitVerification(a, {
      method: VerificationMethod.COMMUNITY_REFERENCE,
      statement: 'Two neighbors can vouch for me.'
    })
    expect(record.status).toBe(VerificationStatus.PENDING)

    const queue = await passport.listPendingVerifications(staff)
    expect(queue.some(row => row.id === record.id)).toBe(true)

    await passport.reviewVerification(staff, record.id, { status: VerificationStatus.APPROVED, note: 'Checked' })
    const mine = await passport.myVerifications(a)
    expect(mine.records.find(row => row.id === record.id)?.status).toBe(VerificationStatus.APPROVED)

    // Only approved methods reach a public passport.
    const view = await passport.passport(a)
    expect(view.verifications.some(row => row.method === VerificationMethod.COMMUNITY_REFERENCE)).toBe(true)
  })

  it('keeps a rejected verification off the public passport', async () => {
    const a = await makeUser('reject-a')
    const record = await passport.submitVerification(a, {
      method: VerificationMethod.COMMUNITY_REFERENCE,
      statement: 'A claim I cannot support.'
    })
    await passport.reviewVerification(staff, record.id, { status: VerificationStatus.REJECTED, note: 'No evidence' })

    const view = await passport.passport(a)
    expect(view.verifications.some(row => row.method === VerificationMethod.COMMUNITY_REFERENCE)).toBe(false)
  })

  it('withdraws a revoked verification immediately', async () => {
    const a = await makeUser('revoke-a')
    const record = await passport.submitVerification(a, {
      method: VerificationMethod.COMMUNITY_REFERENCE,
      statement: 'Later found to be wrong.'
    })
    await passport.reviewVerification(staff, record.id, { status: VerificationStatus.APPROVED })
    expect((await passport.passport(a)).verifications.length).toBeGreaterThan(0)

    await passport.reviewVerification(staff, record.id, { status: VerificationStatus.REVOKED, note: 'Reversed' })
    expect((await passport.passport(a)).verifications).toEqual([])
    const events = await prisma.trustAuditEvent.count({
      where: { userId: a, kind: 'VERIFICATION_REVOKED' }
    })
    expect(events).toBe(1)
  })

  it('refuses a verification decision by a non-staff member', async () => {
    const a = await makeUser('nonstaff-verify')
    const record = await passport.submitVerification(a, {
      method: VerificationMethod.COMMUNITY_REFERENCE,
      statement: 'Waiting patiently here.'
    })
    await expect(
      passport.reviewVerification(a, record.id, { status: VerificationStatus.APPROVED })
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('refuses a second pending request for the same method', async () => {
    const a = await makeUser('dupeverify')
    await passport.submitVerification(a, {
      method: VerificationMethod.COMMUNITY_REFERENCE,
      statement: 'First claim here.'
    })
    await expect(
      passport.submitVerification(a, { method: VerificationMethod.COMMUNITY_REFERENCE, statement: 'Second claim.' })
    ).rejects.toBeInstanceOf(ConflictException)
  })

  // ---------------------------------------------------------------- audit

  it('leaves an audit trail a member can read', async () => {
    const a = await makeUser('audit-a')
    const b = await makeUser('audit-b')
    const transactionId = await completedExchange(a, b)
    await reviews.createReview(a, { transactionId, subjectId: b, rating: 5, body: 'An audited review here.' })
    await reviews.createReview(b, { transactionId, subjectId: a, rating: 5, body: 'Review back again here.' })

    const trail = await passport.auditTrail(a)
    expect(trail.some(row => row.kind === 'REVIEW_PUBLISHED')).toBe(true)
    expect(trail[0].detail.length).toBeGreaterThan(0)
  })

  it('does not leak another member audit trail', async () => {
    const a = await makeUser('cross-a')
    const b = await makeUser('cross-b')
    // b's trail is empty and cannot be read through a's; the audit endpoint is
    // scoped by user id, so one member never sees another's history.
    expect(await passport.auditTrail(b)).toHaveLength(0)
    const trail = await passport.auditTrail(a)
    expect(trail).toHaveLength(0)
  })

  it('keeps profile editing to the members own fields', async () => {
    const a = await makeUser('prof-a')
    const updated = await passport.updateProfile(a, { displayName: 'Ada L', bio: 'Lending since 2024.' })
    expect(updated.displayName).toBe('Ada L')
    await expect(passport.updateProfile(a, {})).rejects.toBeInstanceOf(BadRequestException)
  })
})
