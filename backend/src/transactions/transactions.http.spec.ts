import { TransactionsController } from './transactions.controller'
import { TransactionsService } from './transactions.service'
import { bootApi } from '../common/testing/http-app'

describe('Transactions HTTP', () => {
  const prisma = {
    transaction: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => null)
    },
    $transaction: jest.fn()
  }

  let baseUrl = ''
  let token = ''
  let app: { close: () => Promise<void> }

  beforeAll(async () => {
    const booted = await bootApi({ controller: TransactionsController, service: TransactionsService, prisma })
    app = booted.app
    baseUrl = booted.baseUrl
    token = booted.token
  })

  afterAll(async () => {
    await app.close()
  })

  it('PATCH /api/v1/transactions/:id/status rejects a non-UUID with 400 before Prisma', async () => {
    prisma.transaction.findUnique.mockClear()
    const response = await fetch(`${baseUrl}/api/v1/transactions/not-a-uuid/status`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED' })
    })
    expect(response.status).toBe(400)
    expect(prisma.transaction.findUnique).not.toHaveBeenCalled()
  })
})
