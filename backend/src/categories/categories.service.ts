import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { listings: { where: { status: 'PUBLISHED', deletedAt: null } } } }
      }
    })
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      listingCount: row._count.listings
    }))
  }
}
