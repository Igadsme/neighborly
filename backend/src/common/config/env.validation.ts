import Joi from 'joi'

const placeholder = /change-me|replace-with|changeme|jwt_secret|^secret$|^password$|^neighborly$/i

export function isPlaceholderSecret(value: string) {
  const normalized = value.trim().toLowerCase()
  if (placeholder.test(normalized)) return true
  return new Set(normalized).size < 8
}

function httpOrigins(value: string, helpers: Joi.CustomHelpers) {
  const parts = value.split(',').map(part => part.trim()).filter(Boolean)
  if (parts.length === 0 || parts.includes('*')) return helpers.error('any.invalid')
  for (const part of parts) {
    let url: URL
    try {
      url = new URL(part)
    } catch {
      return helpers.error('any.invalid')
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return helpers.error('any.invalid')
    if (url.username || url.password) return helpers.error('any.invalid')
  }
  return value
}

function productionSecret(value: string, helpers: Joi.CustomHelpers) {
  const nodeEnv = helpers.state.ancestors[0]?.NODE_ENV
  if (nodeEnv === 'production' && isPlaceholderSecret(value)) return helpers.error('any.invalid')
  return value
}

const optionalUrl = Joi.string().uri().optional().allow('')
const optionalSecret = Joi.string().min(32).optional().allow('')
const rateLimit = Joi.number().integer().min(1).optional()
const optionalPositiveInt = Joi.number().integer().min(1).optional()

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),
  REDIS_URL: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().uri({ scheme: ['redis', 'rediss'] }).required(),
    otherwise: Joi.string().uri({ scheme: ['redis', 'rediss'] }).optional().allow('')
  }),
  JWT_SECRET: Joi.string().min(32).required().custom(productionSecret),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  // Milestone 3: refresh credentials are opaque random values stored only
  // as SHA-256 digests, so no refresh signing secret is used. The key stays
  // optional for compatibility with environments that already set it.
  JWT_REFRESH_SECRET: optionalSecret,
  JWT_REFRESH_TTL: Joi.string().default('7d'),
  // Absolute https origin of the web app, used to build verification and
  // reset links. Must be set in production or links point nowhere useful.
  PUBLIC_WEB_ORIGIN: Joi.string().uri({ scheme: ['http', 'https'] }).default('http://localhost:5173'),
  // `outbox` persists messages for a delivery provider to drain and is the
  // only value allowed in production. `console` is local development only.
  EMAIL_SENDER: Joi.string().valid('outbox', 'console').default('outbox'),
  // Overrides Secure on auth cookies. Defaults to Secure in production.
  //
  // Production must not be allowed to opt out: the session and refresh
  // cookies are the credentials that keep a member signed in, and a
  // non-Secure cookie is sent over plain HTTP. `0` is only meaningful for
  // local HTTP development, so it is refused when NODE_ENV is production.
  COOKIE_SECURE: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().valid('1').optional().allow(''),
    otherwise: Joi.string().valid('0', '1').optional().allow('')
  }),
  CORS_ORIGIN: Joi.string().required().custom(httpOrigins),
  // Set to 1 only when a proxy overwrites X-Forwarded-For. Production must choose.
  TRUST_PROXY: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().valid('0', '1').required(),
    otherwise: Joi.string().valid('0', '1').optional().allow('')
  }),
  // Unused until an object-storage client exists. A partial set is rejected.
  S3_ENDPOINT: optionalUrl,
  S3_BUCKET: Joi.string().min(3).optional().allow(''),
  S3_REGION: Joi.string().optional().allow('').default('us-east-1'),
  S3_ACCESS_KEY: Joi.string().optional().allow(''),
  S3_SECRET_KEY: Joi.string().optional().allow(''),
  MAPBOX_TOKEN: Joi.string().allow('').default(''),
  STRIPE_SECRET_KEY: Joi.string().allow('').default(''),
  STRIPE_WEBHOOK_SECRET: Joi.string().allow('').default(''),
  SENTRY_DSN: Joi.string().uri({ scheme: ['https'] }).allow('').default(''),
  MAX_UPLOAD_SIZE_MB: Joi.number().integer().min(1).max(10).default(5),
  ALLOWED_IMAGE_TYPES: Joi.string().default('image/jpeg,image/png,image/webp'),
  RATE_LIMIT_AUTH_REGISTER: rateLimit,
  RATE_LIMIT_AUTH_LOGIN: rateLimit,
  RATE_LIMIT_AUTH_VERIFY: rateLimit,
  RATE_LIMIT_AUTH_RESEND: rateLimit,
  RATE_LIMIT_AUTH_FORGOT_PASSWORD: rateLimit,
  RATE_LIMIT_AUTH_RESET_PASSWORD: rateLimit,
  RATE_LIMIT_MESSAGING: rateLimit,
  RATE_LIMIT_LISTINGS: rateLimit,
  RATE_LIMIT_LISTING_IMAGES: rateLimit,
  RATE_LIMIT_OFFERS: rateLimit,
  RATE_LIMIT_REQUESTS: rateLimit,
  RATE_LIMIT_REVIEWS: rateLimit,
  RATE_LIMIT_MISSIONS: rateLimit,
  SAVED_SEARCH_POLL_MS: optionalPositiveInt,
  REVIEW_PUBLISH_POLL_MS: optionalPositiveInt,
  MISSION_REMINDER_POLL_MS: optionalPositiveInt,
  NOTIFICATION_POLL_MS: optionalPositiveInt,
  // Read by NotificationDispatcher for the overdue sweep. Validated here so a
  // typo surfaces at boot rather than silently disabling the sweep: a bad value
  // becomes NaN, and `Number.isFinite(NaN)` is false, so the interval would
  // quietly never be scheduled.
  BORROW_OVERDUE_POLL_MS: optionalPositiveInt,
  RATE_LIMIT_REPORTS: rateLimit,
  RATE_LIMIT_HOUSING: rateLimit,
  RATE_LIMIT_JOBS: rateLimit,
  RATE_LIMIT_SERVICES: rateLimit,
  RATE_LIMIT_COMMUNITY: rateLimit,
  RATE_LIMIT_TRANSACTIONS: rateLimit,
  RATE_LIMIT_PROFILE: rateLimit,
  RATE_LIMIT_ACCOUNT_EMAIL: rateLimit,
  SLOW_QUERY_LOG: Joi.string().valid('0', '1').optional().allow(''),
  SLOW_QUERY_MS: Joi.number().integer().min(1).optional()
}).custom((value, helpers) => {
  // A console sender would write live verification and reset links to
  // stdout. Refuse that outright when NODE_ENV is production.
  if (value.NODE_ENV === 'production' && value.EMAIL_SENDER === 'console') {
    return helpers.error('any.invalid')
  }
  const s3 = [value.S3_ENDPOINT, value.S3_BUCKET, value.S3_ACCESS_KEY, value.S3_SECRET_KEY].map((item: string | undefined) => item?.trim() ?? '')
  const set = s3.filter(Boolean).length
  if (set !== 0 && set !== s3.length) return helpers.error('any.invalid')
  return value
})
