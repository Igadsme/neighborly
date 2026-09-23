import { writeLog } from './logger'

/** Log a Prisma query event when it crosses the threshold. Params are never logged. */
export function noteSlowQuery(event: { duration: number; query: string }, thresholdMs: number) {
  if (event.duration < thresholdMs) return
  writeLog('warn', 'slow_query', { durationMs: event.duration, query: event.query })
}
