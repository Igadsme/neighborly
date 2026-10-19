import { UsersService } from './users.service'

const baseUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ada@example.com',
  passwordHash: 'secret-hash',
  status: 'ACTIVE',
  profile: { firstName: 'Ada' },
  preference: null,
  notificationPreference: null
}

describe('UsersService.me staffRoles', () => {
  it('returns an empty staffRoles array when the member has no assignment', async () => {
    const findUnique = jest.fn().mockResolvedValue({ ...baseUser, staffRoles: [] })
    const service = new UsersService({ user: { findUnique } } as never)

    const me = await service.me(baseUser.id)

    expect(findUnique.mock.calls[0][0].include.staffRoles).toEqual({ select: { role: true } })
    expect(me.staffRoles).toEqual([])
    expect(me).not.toHaveProperty('passwordHash')
  })

  it('returns every StaffRoleAssignment role for a staff member', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      ...baseUser,
      staffRoles: [{ role: 'MODERATOR' }, { role: 'ADMIN' }]
    })
    const service = new UsersService({ user: { findUnique } } as never)

    const me = await service.me(baseUser.id)

    expect(me.staffRoles).toEqual(['ADMIN', 'MODERATOR'])
  })
})
