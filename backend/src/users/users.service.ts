import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CompleteOnboardingDto } from './dto'

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
}
