import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator'
import { ReportStatus } from '@prisma/client'

export class CreateReportDto {
  @IsIn(['USER', 'LISTING', 'REQUEST', 'MESSAGE'])
  targetType!: 'USER' | 'LISTING' | 'REQUEST' | 'MESSAGE'

  @IsUUID()
  targetId!: string

  @IsString()
  @MinLength(3)
  @MaxLength(100)
  reason!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  details?: string
}

export class ResolveReportDto {
  @IsIn(Object.values(ReportStatus))
  status!: ReportStatus

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  action!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string
}

export class ReportQueryDto {
  @IsOptional()
  @IsIn(Object.values(ReportStatus))
  status?: ReportStatus
}
