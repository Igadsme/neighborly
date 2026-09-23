import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { assertNotBlocked } from '../common/blocks'
import { publicUserSelect } from '../common/public-user.select'
import { cleanList, cleanText, sanitizeText } from '../common/text'
import { PrismaService } from '../prisma/prisma.service'
import { ApplyJobDto, CreateJobDto, ListJobsQuery, UpdateJobDto } from './dto'

const publicJobSelect = {
  id: true,
  title: true,
  company: true,
  logoKey: true,
  description: true,
  responsibilities: true,
  employmentType: true,
  level: true,
  salary: true,
  location: true,
  remote: true,
  deadline: true,
  tags: true,
  verified: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: publicUserSelect }
} satisfies Prisma.JobListingSelect

const applicationSelect = {
  id: true,
  jobId: true,
  message: true,
  createdAt: true,
  applicant: { select: publicUserSelect }
} satisfies Prisma.JobApplicationSelect

function presentJob<T extends { employmentType: string; logoKey: string | null }>(row: T) {
  const { employmentType, logoKey, ...rest } = row
  return { ...rest, type: employmentType, logo: logoKey }
}

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListJobsQuery) {
    const search = query.query?.trim()
    const rows = await this.prisma.jobListing.findMany({
      where: {
        status: 'PUBLISHED',
        deletedAt: null,
        ...(query.type ? { employmentType: query.type } : {}),
        ...(query.level ? { level: { contains: query.level, mode: 'insensitive' } } : {}),
        ...(query.remote ? { remote: query.remote } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { company: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } }
              ]
            }
          : {})
      },
      select: publicJobSelect,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset
    })
    return rows.map(presentJob)
  }

  async get(id: string) {
    const row = await this.prisma.jobListing.findFirst({
      where: { id, status: 'PUBLISHED', deletedAt: null },
      select: publicJobSelect
    })
    if (!row) throw new NotFoundException('Job not found')
    return presentJob(row)
  }

  async create(ownerId: string, input: CreateJobDto) {
    const created = await this.prisma.jobListing.create({
      data: {
        ownerId,
        title: sanitizeText(input.title, 140),
        company: sanitizeText(input.company, 140),
        logoKey: cleanText(input.logoKey),
        description: sanitizeText(input.description),
        responsibilities: cleanList(input.responsibilities) ?? [],
        employmentType: input.type,
        level: input.level.trim(),
        salary: input.salary.trim(),
        location: input.location.trim(),
        remote: input.remote,
        deadline: cleanText(input.deadline),
        tags: cleanList(input.tags) ?? [],
        latitude: input.latitude,
        longitude: input.longitude,
        status: 'PUBLISHED'
      },
      select: publicJobSelect
    })
    return presentJob(created)
  }

  async update(userId: string, id: string, input: UpdateJobDto) {
    await this.requireOwner(id, userId)
    await this.prisma.jobListing.update({
      where: { id },
      data: {
        title: input.title?.trim(),
        company: input.company?.trim(),
        logoKey: cleanText(input.logoKey),
        description: input.description?.trim(),
        responsibilities: cleanList(input.responsibilities),
        employmentType: input.type,
        level: input.level?.trim(),
        salary: input.salary?.trim(),
        location: input.location?.trim(),
        remote: input.remote,
        deadline: cleanText(input.deadline),
        tags: cleanList(input.tags),
        latitude: input.latitude,
        longitude: input.longitude
      }
    })
    return this.get(id)
  }

  async archive(userId: string, id: string) {
    await this.requireOwner(id, userId)
    await this.prisma.jobListing.update({ where: { id }, data: { status: 'ARCHIVED', deletedAt: new Date() } })
    return { id, status: 'ARCHIVED' as const }
  }

  async apply(userId: string, jobId: string, input: ApplyJobDto) {
    const job = await this.prisma.jobListing.findFirst({
      where: { id: jobId, status: 'PUBLISHED', deletedAt: null },
      select: { ownerId: true }
    })
    if (!job) throw new NotFoundException('Job not found')
    if (job.ownerId === userId) throw new BadRequestException('You cannot apply to your own job')
    await assertNotBlocked(this.prisma, userId, job.ownerId)
    const existing = await this.prisma.jobApplication.findUnique({
      where: { jobId_applicantId: { jobId, applicantId: userId } },
      select: applicationSelect
    })
    if (existing) return existing
    return this.prisma.jobApplication.create({
      data: { jobId, applicantId: userId, message: cleanText(input.message) },
      select: applicationSelect
    })
  }

  async listMyApplications(userId: string) {
    const rows = await this.prisma.jobApplication.findMany({
      where: { applicantId: userId, job: { deletedAt: null, status: 'PUBLISHED' } },
      select: { id: true, message: true, createdAt: true, job: { select: publicJobSelect } },
      orderBy: { createdAt: 'desc' }
    })
    return rows.map(row => ({ ...row, job: presentJob(row.job) }))
  }

  async listApplicants(userId: string, jobId: string) {
    await this.requireOwner(jobId, userId)
    return this.prisma.jobApplication.findMany({
      where: { jobId },
      select: applicationSelect,
      orderBy: { createdAt: 'desc' }
    })
  }

  async toggleSave(userId: string, jobId: string) {
    await this.get(jobId)
    const existing = await this.prisma.jobSave.findUnique({ where: { userId_jobId: { userId, jobId } } })
    if (existing) {
      await this.prisma.jobSave.delete({ where: { userId_jobId: { userId, jobId } } })
      return { saved: false }
    }
    await this.prisma.jobSave.create({ data: { userId, jobId } })
    return { saved: true }
  }

  async listSaved(userId: string) {
    const rows = await this.prisma.jobSave.findMany({
      where: { userId, job: { deletedAt: null, status: 'PUBLISHED' } },
      select: { createdAt: true, job: { select: publicJobSelect } },
      orderBy: { createdAt: 'desc' }
    })
    return rows.map(row => ({ createdAt: row.createdAt, job: presentJob(row.job) }))
  }

  private async requireOwner(id: string, userId: string) {
    const row = await this.prisma.jobListing.findUnique({ where: { id }, select: { ownerId: true, deletedAt: true } })
    if (!row || row.deletedAt) throw new NotFoundException('Job not found')
    if (row.ownerId !== userId) throw new ForbiddenException('You can only change your own job')
  }
}
