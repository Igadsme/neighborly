const markup = /<[^>]*>/g
const controls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

/** Strip markup and control characters, then trim. React already escapes text; this keeps stored copy plain. */
export function sanitizeText(value: string, maxLength = 8000) {
  return value.replace(markup, '').replace(controls, '').trim().slice(0, maxLength)
}

export function sanitizeOptional(value: string | undefined, maxLength = 8000) {
  if (value === undefined) return undefined
  return sanitizeText(value, maxLength)
}

export function cleanText(value: string | undefined, maxLength = 8000) {
  if (value === undefined) return undefined
  const cleaned = sanitizeText(value, maxLength)
  return cleaned.length ? cleaned : null
}

export function cleanList(values: string[] | undefined) {
  if (!values) return undefined
  return values.map(value => sanitizeText(value)).filter(value => value.length > 0)
}
