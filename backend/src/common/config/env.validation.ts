import Joi from 'joi'

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),
  // Used for rate-limit counters when set. An empty value keeps the in-process window.
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).optional().allow(''),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  // Unused: access tokens are the only credential issued today.
  JWT_REFRESH_SECRET: Joi.string().min(32).optional().allow(''),
  JWT_REFRESH_TTL: Joi.string().default('7d'),
  CORS_ORIGIN: Joi.string().required(),
  // Unused until an object-storage client exists.
  S3_ENDPOINT: Joi.string().uri().optional().allow(''),
  S3_BUCKET: Joi.string().min(3).optional().allow(''),
  S3_REGION: Joi.string().optional().allow('').default('us-east-1'),
  S3_ACCESS_KEY: Joi.string().optional().allow(''),
  S3_SECRET_KEY: Joi.string().optional().allow(''),
  MAPBOX_TOKEN: Joi.string().allow('').default(''),
  STRIPE_SECRET_KEY: Joi.string().allow('').default(''),
  STRIPE_WEBHOOK_SECRET: Joi.string().allow('').default(''),
  SENTRY_DSN: Joi.string().allow('').default('')
})
