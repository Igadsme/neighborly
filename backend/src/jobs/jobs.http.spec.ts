import { JobsController } from './jobs.controller'
import { JobsService } from './jobs.service'
import { bootApi } from '../common/testing/http-app'
import { projectSelect, SelectSpec } from '../common/testing/project-prisma'

const applicant = {
  id: 'user-1',
  email: 'secret-applicant@example.com',
  passwordHash: 'applicant-hash',
  profile: {
    displayName: 'Grace H',
    firstName: 'Grace',
    lastName: 'Hopper',
    neighborhood: 'Midtown',
    city: 'Atlanta',
    latitude: '40.712800',
    longitude: '-74.006000'
  }
}

const job = {
  id: 'job-1',
  ownerId: 'employer-1',
  title: 'Full-Stack Engineer',
  company: 'PeachTech Solutions',
  logoKey: 'photo-1611162617474-5b21e879e113',
  description: 'Build product features with a small Atlanta team.',
  responsibilities: ['Ship features', 'Review code'],
  employmentType: 'Full-time',
  level: 'Mid-Senior',
  salary: '$110k–$145k',
  location: 'Midtown Atlanta',
  remote: 'Hybrid',
  deadline: 'Rolling',
  tags: ['React', 'Node.js'],
  verified: true,
  status: 'PUBLISHED',
  latitude: '33.800001',
  longitude: '-84.380001',
  createdAt: new Date('2026-09-21T12:00:00.000Z'),
  updatedAt: new Date('2026-09-21T12:00:00.000Z'),
  deletedAt: null,
  owner: {
    id: 'employer-1',
    email: 'secret-employer@example.com',
    passwordHash: 'employer-hash',
    profile: {
      displayName: 'Tyler B',
      firstName: 'Tyler',
      lastName: 'Brooks',
      neighborhood: 'East Atlanta',
      city: 'Atlanta',
      latitude: '33.740001',
      longitude: '-84.340001'
    }
  },
  applications: [{ id: 'app-existing', applicant, message: 'secret application note' }]
}

function expectPublicJob(body: unknown) {
  const row = body as { type?: string; logo?: string; applications?: unknown; latitude?: unknown; owner?: { profile?: { lastName?: string } } }
  expect(row.type).toBe('Full-time')
  expect(row.logo).toBe('photo-1611162617474-5b21e879e113')
  expect(row.applications).toBeUndefined()
  expect(row.latitude).toBeUndefined()
  expect(row.owner?.profile?.lastName).toBeUndefined()
  const serialized = JSON.stringify(body)
  for (const secret of ['secret-employer@example.com', 'employer-hash', 'secret-applicant@example.com', 'applicant-hash', 'Brooks', 'Hopper', '33.800001', '-84.380001', '33.740001', '40.712800', 'passwordHash', 'secret application note']) {
    expect(serialized).not.toContain(secret)
  }
}

describe('Jobs HTTP', () => {
  let jobOwnerId = 'employer-1'
  let existingApplication: Record<string, unknown> | null = null
  let saved: Record<string, unknown> | null = null
  const prisma = {
    jobListing: {
      findMany: jest.fn(async (args: { select: SelectSpec }) => [projectSelect(job, args.select)]),
      findFirst: jest.fn(async (args: { select?: SelectSpec }) => {
        if (args.select && 'ownerId' in args.select && !('title' in args.select)) return { ownerId: jobOwnerId }
        return args.select ? projectSelect(job, args.select) : job
      }),
      findUnique: jest.fn(async () => ({ ownerId: jobOwnerId, deletedAt: null })),
      create: jest.fn(async (args: { data: Record<string, unknown>; select: SelectSpec }) =>
        projectSelect({ ...job, ...args.data, owner: job.owner }, args.select)
      ),
      update: jest.fn(async () => job)
    },
    jobApplication: {
      findUnique: jest.fn(async () => existingApplication),
      findMany: jest.fn(async () => []),
      create: jest.fn(async (args: { data: { jobId: string; message: string | null }; select: SelectSpec }) =>
        projectSelect(
          {
            id: 'app-1',
            jobId: args.data.jobId,
            message: args.data.message,
            createdAt: new Date('2026-09-23T12:00:00.000Z'),
            applicant
          },
          args.select
        )
      )
    },
    jobSave: {
      findUnique: jest.fn(async () => saved),
      findMany: jest.fn(async (args: { select: SelectSpec }) => [
        projectSelect(
          {
            createdAt: new Date('2026-09-23T12:00:00.000Z'),
            user: applicant,
            job
          },
          args.select
        )
      ]),
      create: jest.fn(async () => {
        saved = { userId: 'user-1', jobId: 'job-1' }
        return saved
      }),
      delete: jest.fn(async () => {
        saved = null
      })
    }
  }

  let baseUrl = ''
  let token = ''
  let app: { close: () => Promise<void> }

  beforeAll(async () => {
    const booted = await bootApi({ controller: JobsController, service: JobsService, prisma })
    app = booted.app
    baseUrl = booted.baseUrl
    token = booted.token
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    jobOwnerId = 'employer-1'
    existingApplication = null
    saved = null
    jest.clearAllMocks()
  })

  it('GET /api/v1/jobs hides employer and applicant private fields', async () => {
    const response = await fetch(`${baseUrl}/api/v1/jobs`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as unknown[]
    expectPublicJob(body[0])
  })

  it('GET /api/v1/jobs/:id hides employer and applicant private fields', async () => {
    const response = await fetch(`${baseUrl}/api/v1/jobs/job-1`)
    expect(response.status).toBe(200)
    expectPublicJob(await response.json())
  })

  it('POST /api/v1/jobs without a token is 401', async () => {
    const response = await fetch(`${baseUrl}/api/v1/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    expect(response.status).toBe(401)
    expect(prisma.jobListing.create).not.toHaveBeenCalled()
  })

  it('POST /api/v1/jobs/:id/apply without a token is 401', async () => {
    const response = await fetch(`${baseUrl}/api/v1/jobs/job-1/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    })
    expect(response.status).toBe(401)
    expect(prisma.jobApplication.create).not.toHaveBeenCalled()
  })

  it('POST /api/v1/jobs/:id/apply stores an application without returning applicant secrets', async () => {
    const response = await fetch(`${baseUrl}/api/v1/jobs/job-1/apply`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'I can start Monday' })
    })
    expect(response.status).toBe(201)
    const body = (await response.json()) as { message?: string; applicant?: { profile?: { displayName?: string; lastName?: string } } }
    expect(body.message).toBe('I can start Monday')
    expect(body.applicant).toEqual({
      id: 'user-1',
      profile: { displayName: 'Grace H', firstName: 'Grace', neighborhood: 'Midtown', city: 'Atlanta' }
    })
    expect(JSON.stringify(body)).not.toContain('secret-applicant@example.com')
    expect(JSON.stringify(body)).not.toContain('Hopper')
  })

  it('POST /api/v1/jobs/:id/apply rejects the employer', async () => {
    jobOwnerId = 'user-1'
    const response = await fetch(`${baseUrl}/api/v1/jobs/job-1/apply`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{}'
    })
    expect(response.status).toBe(400)
    expect(prisma.jobApplication.create).not.toHaveBeenCalled()
  })

  it('POST /api/v1/jobs/:id/save without a token is 401', async () => {
    const response = await fetch(`${baseUrl}/api/v1/jobs/job-1/save`, { method: 'POST' })
    expect(response.status).toBe(401)
    expect(prisma.jobSave.create).not.toHaveBeenCalled()
  })

  it('GET /api/v1/jobs/saved without a token is 401', async () => {
    const response = await fetch(`${baseUrl}/api/v1/jobs/saved`)
    expect(response.status).toBe(401)
  })

  it('POST /api/v1/jobs/:id/save toggles a bookmark', async () => {
    const headers = { authorization: `Bearer ${token}` }
    const first = await fetch(`${baseUrl}/api/v1/jobs/job-1/save`, { method: 'POST', headers })
    expect(first.status).toBe(201)
    expect(await first.json()).toEqual({ saved: true })
    const second = await fetch(`${baseUrl}/api/v1/jobs/job-1/save`, { method: 'POST', headers })
    expect(second.status).toBe(201)
    expect(await second.json()).toEqual({ saved: false })
  })
})
