import { Prisma } from '@prisma/client'
import { PassportService } from './passport.service'

describe('PassportService leaderboard', () => {
  it('orders by completed exchanges in SQL before paging and does not call trustInputs per member', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        display_name: 'High',
        first_name: 'H',
        avatar_url: null,
        completed_exchanges: 1,
        completed_borrowings: 0,
        borrowings_as_lender: 0
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        display_name: null,
        first_name: 'Low',
        avatar_url: 'avatar',
        completed_exchanges: 5,
        completed_borrowings: 9,
        borrowings_as_lender: 4
      }
    ])
    const findMany = jest.fn()
    const findUnique = jest.fn()
    const service = new PassportService({
      $queryRaw: queryRaw,
      passportPrivacySettings: { findMany },
      user: { findUnique }
    } as never)

    const rows = await service.leaderboard({ limit: 2, offset: 4 })

    expect(findMany).not.toHaveBeenCalled()
    expect(findUnique).not.toHaveBeenCalled()
    expect(queryRaw).toHaveBeenCalledTimes(1)
    const sql = sqlOf(queryRaw.mock.calls[0][0])
    expect(sql.text).toContain('GROUP BY')
    expect(sql.text).toContain('privacy."leaderboardOptIn" = true')
    expect(sql.text).toContain('u."deletedAt" IS NULL')
    expect(sql.text).toContain("u.status::text = 'ACTIVE'")
    expect(sql.text).toContain('ORDER BY completed_exchanges DESC, u.id ASC')
    expect(sql.text).toContain('AS exchanges')
    expect(sql.text).toContain('AS borrows')
    expect(sql.text).not.toContain('LEFT JOIN "TransactionParticipant"')
    expect(sql.text).not.toContain('LEFT JOIN "BorrowRequest"')
    expect(sql.text.indexOf('ORDER BY')).toBeLessThan(sql.text.indexOf('LIMIT'))
    expect(sql.values).toEqual([2, 4])
    // The service keeps the SQL order. It does not re-sort the page by borrowings.
    expect(rows.map(row => row.userId)).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    ])
    expect(rows[1]).toMatchObject({
      displayName: 'Low',
      avatarUrl: 'avatar',
      completedExchanges: 5,
      completedBorrowings: 9,
      borrowingsAsLender: 4
    })
  })
})

function sqlOf(query: unknown): { text: string; values: unknown[] } {
  const sql = query as Prisma.Sql
  return { text: sql.text, values: sql.values }
}
