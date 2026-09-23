let requestIdProvider: () => string | undefined = () => undefined

export function setRequestIdProvider(provider: () => string | undefined) {
  requestIdProvider = provider
}

export function currentRequestId() {
  return requestIdProvider()
}

export function writeLog(level: 'info' | 'warn' | 'error', msg: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

/** Auth and moderation events. Lines can include an email. Keep the log drain access-controlled. */
export function audit(event: string, fields: Record<string, unknown> = {}) {
  writeLog('info', event, { audit: true, requestId: currentRequestId(), ...fields })
}

/**
 * Single server-error hook. Logs a structured line today.
 * When `SENTRY_DSN` is set, this is the function that should forward the error.
 * `@sentry/node` is not a dependency of this release.
 */
export function captureException(error: unknown, fields: Record<string, unknown> = {}) {
  const name = error instanceof Error ? error.name : 'Error'
  const message = error instanceof Error ? error.message : 'Unknown error'
  const stack = error instanceof Error ? error.stack : undefined
  writeLog('error', 'exception', { requestId: currentRequestId(), error: { name, message, stack }, ...fields })
}
