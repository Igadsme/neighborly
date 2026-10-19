import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import * as argon2 from 'argon2'
import { randomBytes } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { CompleteOnboardingDto, DeleteAccountDto, UpdateProfileDto } from './dto'

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, preference: true, notificationPreference: true }
    })
    if (!user) throw new NotFoundException('User not found')
    const { passwordHash: _passwordHash, ...safeUser } = user
    return safeUser
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

  async updateProfile(userId: string, input: UpdateProfileDto) {
    await this.prisma.profile.update({
      where: { userId },
      data: {
        firstName: input.firstName?.trim(),
        lastName: input.lastName?.trim(),
        displayName: input.displayName?.trim() || null,
        bio: input.bio?.trim() || null,
        neighborhood: input.neighborhood?.trim() || null,
        city: input.city?.trim() || null,
        state: input.state?.trim() || null,
      },
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
            firstName: true,
            displayName: true,
            bio: true,
            neighborhood: true,
            city: true,
            state: true,
            emailVerified: true,
            phoneVerified: true,
          },
        },
        reviewsReceived: {
          select: { id: true, rating: true, body: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        listings: {
          where: { status: 'PUBLISHED', deletedAt: null },
          select: { id: true, title: true, priceCents: true, condition: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    })
    if (!user) throw new NotFoundException('User not found')
    return user
  }

  async exportData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        preference: true,
        notificationPreference: true,
        listings: { include: { images: true } },
        requests: { include: { offers: true } },
        offers: { include: { counterOffers: true, items: true } },
        favorites: true,
        savedSearches: true,
        notifications: true,
        conversations: {
          include: { conversation: { include: { messages: true } } },
        },
        reviewsGiven: true,
        reviewsReceived: true,
        transactionMembers: { include: { transaction: true } },
        reportsFiled: true,
        blocksInitiated: true,
      },
    })
    if (!user) throw new NotFoundException('User not found')
    const { passwordHash: _passwordHash, deviceSessions: _deviceSessions, ...safeUser } = {
      ...user,
      deviceSessions: undefined,
    }
    return { exportedAt: new Date().toISOString(), user: safeUser }
  }

  async deleteAccount(userId: string, input: DeleteAccountDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user || !(await argon2.verify(user.passwordHash, input.password))) {
      throw new UnauthorizedException('Password confirmation failed')
    }
    const replacementHash = await argon2.hash(randomBytes(48).toString('base64url'))
    await this.prisma.$transaction(async (tx) => {
      const now = new Date()
      await tx.deviceSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } })
      await tx.listing.updateMany({ where: { sellerId: userId, deletedAt: null }, data: { status: 'DELETED', deletedAt: now } })
      await tx.needRequest.updateMany({ where: { requesterId: userId, deletedAt: null }, data: { status: 'CANCELLED', deletedAt: now } })
      await tx.profile.update({
        where: { userId },
        data: {
          firstName: 'Deleted',
          lastName: 'User',
          displayName: 'Deleted user',
          bio: null,
          neighborhood: null,
          city: null,
          state: null,
          latitude: null,
          longitude: null,
        },
      })
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted+${userId}@neighborly.invalid`,
          passwordHash: replacementHash,
          status: 'DELETED',
          deletedAt: now,
        },
      })
    })
    return { deleted: true }
  }
}
