import { Type } from 'class-transformer'
import { IsInt, IsString, IsUUID, Max, Min, MinLength } from 'class-validator'

export class CreateReviewDto {
  @IsUUID()
  transactionId!: string

  @IsUUID()
  subjectId!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number

  @IsString()
  @MinLength(1)
  body!: string
}
