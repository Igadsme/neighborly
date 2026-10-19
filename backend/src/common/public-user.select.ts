import { Prisma } from '@prisma/client'

/** Public card shared by request and listing reads. No credentials, status, or coordinates. */
export const publicUserSelect = {
  id: true,
  profile: {
    select: {
      displayName: true,
      firstName: true,
      neighborhood: true,
      city: true
    }
  }
} satisfies Prisma.UserSelect
