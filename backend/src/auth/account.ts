export const accountSelect = { id: true, email: true, status: true, deletedAt: true } as const

export function isActiveAccount(account: { status?: string | null; deletedAt?: Date | null } | null | undefined) {
  return Boolean(account && account.deletedAt == null && account.status === 'ACTIVE')
}
