import { JwtService, JwtSignOptions } from '@nestjs/jwt'

interface AccessTokenClaims {
  sub?: string
  email?: string
}

export function accessTokenSignOptions(): JwtSignOptions {
  return {
    secret: process.env.JWT_SECRET,
    expiresIn: (process.env.JWT_ACCESS_TTL as JwtSignOptions['expiresIn']) ?? '15m',
    algorithm: 'HS256'
  }
}

export function readAccessToken(jwt: JwtService, token: string) {
  let payload: AccessTokenClaims | string
  try {
    payload = jwt.verify<AccessTokenClaims>(token, {
      secret: process.env.JWT_SECRET,
      algorithms: ['HS256']
    })
  } catch {
    throw new Error('Unauthorized')
  }
  if (!payload || typeof payload === 'string' || typeof payload.sub !== 'string' || !payload.sub || typeof payload.email !== 'string' || !payload.email) {
    throw new Error('Unauthorized')
  }
  return { sub: payload.sub, email: payload.email }
}
