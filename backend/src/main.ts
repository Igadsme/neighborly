import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { HttpAdapterHost, NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { json, urlencoded } from 'express'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { corsOrigins, helmetOptions, jsonBodyLimit, swaggerEnabled, trustProxyEnabled } from './common/http-security'
import { LoggingExceptionFilter } from './common/logging.filter'
import { requestContextMiddleware } from './common/request-context'
import { allowMultipartForListingImages } from './common/uploads'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false })
  app.use(requestContextMiddleware)
  app.use(allowMultipartForListingImages)
  app.use(json({ limit: jsonBodyLimit }))
  app.use(urlencoded({ extended: false, limit: jsonBodyLimit }))
  app.use(helmet(helmetOptions()))
  if (trustProxyEnabled()) app.getHttpAdapter().getInstance().set('trust proxy', 1)
  // Credentialed CORS is required so the browser sends the HttpOnly
  // refresh cookie. corsOrigins() refuses `*` and empty lists, so only
  // explicitly listed origins may send credentials.
  app.enableCors({ origin: corsOrigins(), credentials: true })
  app.setGlobalPrefix('api/v1')
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  app.useGlobalFilters(new LoggingExceptionFilter(app.get(HttpAdapterHost).httpAdapter))

  if (swaggerEnabled()) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Neighborly API')
      .setDescription('Request-first local marketplace and community exchange API')
      .setVersion('1.0')
      .addBearerAuth()
      .build()
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig))
  }

  await app.listen(process.env.PORT ?? 3000)

  /*
   * Graceful shutdown.
   *
   * Without this, SIGTERM does nothing Nest knows about: Node's default
   * handler terminates the process immediately, so `docker stop`, a Compose
   * restart and an orchestrator rollout all cut in-flight requests mid-flight
   * and drop the Prisma pool and Redis connections without closing them.
   * Prisma and the notification worker rely on onModuleDestroy to release
   * their resources, so that path is what a deploy actually depends on.
   *
   * Signal handling has to be enabled on the running application, which is
   * only possible after the server is listening, hence the placement here.
   */
  app.enableShutdownHooks(['SIGTERM', 'SIGINT'])
}

bootstrap()
