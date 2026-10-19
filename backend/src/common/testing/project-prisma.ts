export type SelectSpec = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)
}

/** Applies the Prisma select the service passed. Unselected fields stay on the fixture so a widened query leaks them. */
export function projectSelect(record: Record<string, unknown>, select: SelectSpec): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, spec] of Object.entries(select)) {
    if (!spec) continue
    const value = record[key]
    if (spec === true) {
      output[key] = value
      continue
    }
    if (!isRecord(spec)) continue
    const nestedSelect = spec.select
    if (isRecord(nestedSelect)) {
      if (Array.isArray(value)) {
        output[key] = value.map(item => (isRecord(item) ? projectSelect(item, nestedSelect) : item))
      } else if (isRecord(value)) {
        output[key] = projectSelect(value, nestedSelect)
      } else {
        output[key] = value
      }
      continue
    }
    output[key] = value
  }
  return output
}

export function projectInclude(record: Record<string, unknown>, include: SelectSpec): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value) || isRecord(value)) continue
    output[key] = value
  }
  for (const [key, spec] of Object.entries(include)) {
    const value = record[key]
    if (spec === true) {
      output[key] = value
      continue
    }
    if (!isRecord(spec)) continue
    const nestedSelect = spec.select
    if (isRecord(nestedSelect)) {
      if (Array.isArray(value)) {
        output[key] = value.map(item => (isRecord(item) ? projectSelect(item, nestedSelect) : item))
      } else if (isRecord(value)) {
        output[key] = projectSelect(value, nestedSelect)
      } else {
        output[key] = value
      }
      continue
    }
    const nestedInclude = spec.include
    if (isRecord(nestedInclude) && isRecord(value)) output[key] = projectInclude(value, nestedInclude)
  }
  return output
}
