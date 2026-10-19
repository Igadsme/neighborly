import { Transform } from 'class-transformer'

/** Query strings arrive as text. Absent params stay absent so filters are opt-in. */
export const queryBoolean = () =>
  Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined
    if (value === true || value === 'true') return true
    if (value === false || value === 'false') return false
    return value
  })
