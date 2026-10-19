import { Injectable, NotFoundException } from '@nestjs/common'
import { StaffRole } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CompleteOnboardingDto } from './dto'

const accountInclude = {
  profile: true,
  preference: true,
  notificationPreference: true,
  staffRoles: { select: { role: true } }
} as const

/**
 * Account payload for GET /users/me. `staffRoles` is the role names only.
 * Moderation routes still authorize from StaffRoleAssignment on the server.
 */
export function presentAccount<T extends { passwordHash: string; staffRoles?: { role: StaffRole }[] }>(user: T) {
  const { passwordHash: _passwordHash, staffRoles = [], ...safeUser } = user
  return { ...safeUser, staffRoles: staffRoles.map(row => row.role).sort() }
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: accountInclude
    })
    if (!user) throw new NotFoundException('User not found')
    return presentAccount(user)
  }

  async completeOnboarding(userId: string, input: CompleteOnboardingDto) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        profile: {
          update: {
            neighborhood: input.neighborhood?.trim(),
            city: input.city?.trim(),
            state: input.state?.trim()
          }
        },
        preference: {
          upsert: {
            create: {
              interests: input.interests ?? [],
              capabilities: input.capabilities ?? [],
              completedAt: new Date()
            },
            update: {
              interests: input.interests ?? [],
              capabilities: input.capabilities ?? [],
              completedAt: new Date()
            }
          }
        },
        notificationPreference: {
          upsert: {
            create: {
              newListings: input.newListings ?? true,
              priceDrops: input.priceDrops ?? true,
              messages: input.messages ?? true,
              events: input.events ?? false,
              community: input.community ?? false
            },
            update: {
              newListings: input.newListings ?? true,
              priceDrops: input.priceDrops ?? true,
              messages: input.messages ?? true,
              events: input.events ?? false,
              community: input.community ?? false
            }
          }
        }
      }
    })
    return this.me(userId)
  }

  async publicProfile(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: 'ACTIVE', deletedAt: null },
      select: {
        id: true,
        createdAt: true,
        profile: {
          select: {
            displayName: true,
            firstName: true,
            lastName: true,
            bio: true,
            neighborhood: true,
            city: true,
            emailVerified: true
          }
        }
      }
    })
    if (!user?.profile) throw new NotFoundException('Profile not found')

    const [rating, soldCount] = await Promise.all([
      this.prisma.review.aggregate({
        where: { subjectId: userId },
        _avg: { rating: true },
        _count: { _all: true }
      }),
      this.prisma.listing.count({
        where: { sellerId: userId, status: 'SOLD', deletedAt: null }
      })
    ])

    const average = rating._avg.rating
    return {
      id: user.id,
      displayName: user.profile.displayName,
      firstName: user.profile.firstName,
      lastName: user.profile.lastName,
      bio: user.profile.bio,
      neighborhood: user.profile.neighborhood,
      city: user.profile.city,
      memberSince: user.createdAt,
      emailVerified: user.profile.emailVerified,
      ratingAverage: average == null ? null : Math.round(average * 10) / 10,
      reviewCount: rating._count._all,
      soldCount
    }
  }
}
