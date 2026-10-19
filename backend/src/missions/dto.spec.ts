import { ValidationPipe } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { CreateMissionDto, UpdateMissionDto } from './dto'

/**
 * Mission creation and editing over real JSON.
 *
 * Milestone 11 found that every mission create and edit sent from the app was
 * rejected with HTTP 400 `startAt must be a Date instance`. The DTO declared
 * `@IsDate()` without the matching `@Type(() => Date)`, so a JSON body left the
 * value as a string and validation failed.
 *
 * Milestone 9's integration tests did not catch it because they call the
 * service or pass already-constructed Date objects, bypassing the HTTP layer
 * where the conversion happens.
 *
 * These tests run the real ValidationPipe over a real JSON body, which is what
 * the controller does.
 */

async function validate<T extends object>(
  cls: new () => T,
  payload: Record<string, unknown>,
): Promise<string[]> {
  // The same pipe configuration main.ts applies application-wide.
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
  const instance = plainToInstance(cls, payload)
  try {
    await pipe.transform(instance, { type: 'body', metatype: cls } as never)
    return []
  } catch (error) {
    return (error as { getResponse?: () => { message?: string[] } })
      .getResponse?.()
      .message?.map(String) ?? [String(error)]
  }
}

const baseMission = {
  title: 'Park cleanup',
  description: 'Join neighbours for a morning litter pick and recycling sort.',
  category: 'CLEANUP',
  neighborhood: 'Decatur',
  city: 'Atlanta',
  capacity: 8,
}

describe('mission DTOs over JSON', () => {
  it('accepts the ISO strings the editor sends', async () => {
    const errors = await validate(CreateMissionDto, {
      ...baseMission,
      startAt: '2026-10-20T09:00:00.000Z',
      endAt: '2026-10-20T12:00:00.000Z',
    })
    expect(errors).toEqual([])
  })

  it('converts the strings to Date instances', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true })
    const dto = plainToInstance(CreateMissionDto, {
      ...baseMission,
      startAt: '2026-10-20T09:00:00.000Z',
      endAt: '2026-10-20T12:00:00.000Z',
    })
    await pipe.transform(dto, { type: 'body', metatype: CreateMissionDto } as never)
    expect(dto.startAt).toBeInstanceOf(Date)
    expect(dto.endAt).toBeInstanceOf(Date)
    expect(dto.startAt.toISOString()).toBe('2026-10-20T09:00:00.000Z')
  })

  it('accepts ISO strings on update', async () => {
    const errors = await validate(UpdateMissionDto, {
      startAt: '2026-11-01T09:00:00.000Z',
      endAt: '2026-11-01T12:00:00.000Z',
    })
    expect(errors).toEqual([])
  })

  it('still rejects a value that is not a date at all', async () => {
    const errors = await validate(CreateMissionDto, {
      ...baseMission,
      startAt: 'not-a-date',
      endAt: '2026-10-20T12:00:00.000Z',
    })
    expect(errors.length).toBeGreaterThan(0)
  })

  it('still rejects a missing end time', async () => {
    const errors = await validate(CreateMissionDto, {
      ...baseMission,
      startAt: '2026-10-20T09:00:00.000Z',
    })
    expect(errors.join(' ')).toMatch(/endAt/)
  })
})