import { Transform } from 'class-transformer'
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator'

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  body!: string
}

export class CreateConversationDto {
  @IsUUID()
  participantId!: string

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  body!: string

  /** Checked against the listing seller, then discarded. Not stored. */
  @IsOptional()
  @IsUUID()
  listingId?: string
}
