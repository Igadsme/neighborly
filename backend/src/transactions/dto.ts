import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator'
import { TransactionStatus } from '@prisma/client'

export class TransitionTransactionDto {
  @IsEnum(TransactionStatus)
  status!: TransactionStatus
}

export class ScheduleAppointmentDto {
  @IsDateString()
  startsAt!: string

  @IsOptional()
  @IsString()
  @MinLength(3)
  locationNote?: string
}

export class CreateReviewDto {
  @IsString()
  @MinLength(1)
  subjectId!: string

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number

  @IsString()
  @MinLength(3)
  body!: string
}
