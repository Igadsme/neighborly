import { Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'
import { jobEmploymentTypes, jobWorkplaces } from '../common/vertical-values'

export class CreateJobDto {
  @IsString()
  @MinLength(3)
  @MaxLength(140)
  title!: string

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  company!: string

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description!: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  responsibilities?: string[]

  @IsIn(jobEmploymentTypes)
  type!: (typeof jobEmploymentTypes)[number]

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  level!: string

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  salary!: string

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  location!: string

  @IsIn(jobWorkplaces)
  remote!: (typeof jobWorkplaces)[number]

  @IsOptional()
  @IsString()
  @MaxLength(80)
  deadline?: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[]

  @IsOptional()
  @IsString()
  @MaxLength(300)
  logoKey?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number
}

export class UpdateJobDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(140)
  title?: string

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  company?: string

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description?: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  responsibilities?: string[]

  @IsOptional()
  @IsIn(jobEmploymentTypes)
  type?: (typeof jobEmploymentTypes)[number]

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  level?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  salary?: string

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  location?: string

  @IsOptional()
  @IsIn(jobWorkplaces)
  remote?: (typeof jobWorkplaces)[number]

  @IsOptional()
  @IsString()
  @MaxLength(80)
  deadline?: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[]

  @IsOptional()
  @IsString()
  @MaxLength(300)
  logoKey?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number
}

export class ListJobsQuery {
  @IsOptional()
  @IsString()
  query?: string

  @IsOptional()
  @IsIn(jobEmploymentTypes)
  type?: (typeof jobEmploymentTypes)[number]

  @IsOptional()
  @IsString()
  @MaxLength(40)
  level?: string

  @IsOptional()
  @IsIn(jobWorkplaces)
  remote?: (typeof jobWorkplaces)[number]

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 24

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0
}

export class ApplyJobDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string
}
