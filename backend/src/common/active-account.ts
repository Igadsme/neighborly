/**
 * Public discovery includes a row only while its owner account is ACTIVE.
 * `SUSPEND_USER` sets `User.status` to SUSPENDED and does not rewrite the
 * row, so this filter hides it. `RESTORE_USER` sets ACTIVE again and the
 * same row is public without a republish.
 */
export const activeAccountWhere = { status: 'ACTIVE' as const, deletedAt: null }
