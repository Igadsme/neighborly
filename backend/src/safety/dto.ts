import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'

export const reportTargetTypes = ['LISTING', 'USER', 'MESSAGE', 'COMMUNITY_POST'] as const
export const reportReasons = ['SPAM', 'SCAM', 'HARASSMENT', 'INAPPROPRIATE', 'OTHER'] as const
export const reportStatuses = ['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'] as const
export const moderationKinds = ['DISMISS', 'RESOLVE', 'HIDE', 'SUSPEND_USER', 'RESTORE_USER'] as const

export type ReportTargetTypeName = (typeof reportTargetTypes)[number]
export type ReportReasonName = (typeof reportReasons)[number]
export type ReportStatusName = (typeof reportStatuses)[number]
export type ModerationKindName = (typeof moderationKinds)[number]

export class CreateReportDto {
  @IsIn(reportTargetTypes)
  targetType!: ReportTargetTypeName

  @IsUUID()
  targetId!: string

  @IsIn(reportReasons)
  reason!: ReportReasonName

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  details?: string
}

export class BlockUserDto {
  @IsUUID()
  userId!: string
}

export class ListModerationQuery {
  @IsOptional()
  @IsIn(reportStatuses)
  status?: ReportStatusName
}

export class ModerationActionDto {
  @IsIn(moderationKinds)
  kind!: ModerationKindName

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string
}
