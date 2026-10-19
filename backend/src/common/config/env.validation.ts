import Joi from 'joi'

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).optional().allow(''),
  RATE_LIMIT_WINDOW_MS: Joi.number().integer().min(1000).default(60000),
  RATE_LIMIT_MAX: Joi.number().integer().min(1).default(300),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  // Retained for secret separation and future signed refresh-token migration.
  JWT_REFRESH_SECRET: Joi.string().min(32).optional().allow(''),
  JWT_REFRESH_TTL: Joi.string().default('7d'),
  CORS_ORIGIN: Joi.string().required(),
  APP_URL: Joi.string().uri().default('http://localhost:8443'),
  RESEND_API_KEY: Joi.string().allow('').default(''),
  EMAIL_FROM: Joi.string().allow('').default(''),
  // Optional at boot so non-media routes can run; upload routes fail closed.
  S3_ENDPOINT: Joi.string().uri().optional().allow(''),
  S3_BUCKET: Joi.string().min(3).optional().allow(''),
  S3_REGION: Joi.string().optional().allow('').default('us-east-1'),
  S3_ACCESS_KEY: Joi.string().optional().allow(''),
  S3_SECRET_KEY: Joi.string().optional().allow(''),
  S3_PUBLIC_URL: Joi.string().uri().optional().allow(''),
  S3_FORCE_PATH_STYLE: Joi.boolean().truthy('true').falsy('false').default(true),
  S3_AUTO_CREATE_BUCKET: Joi.boolean().truthy('true').falsy('false').default(false),
  MAPBOX_TOKEN: Joi.string().allow('').default(''),
  STRIPE_SECRET_KEY: Joi.string().allow('').default(''),
  STRIPE_WEBHOOK_SECRET: Joi.string().allow('').default(''),
  SENTRY_DSN: Joi.string().allow('').default('')
})
