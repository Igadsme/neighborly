export function cleanText(value: string | undefined) {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

export function cleanList(values: string[] | undefined) {
  if (!values) return undefined
  return values.map(value => value.trim()).filter(value => value.length > 0)
}
