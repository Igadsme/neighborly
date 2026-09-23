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
import { rejectMultipart } from './common/uploads'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false })
  app.use(requestContextMiddleware)
  app.use(rejectMultipart)
  app.use(json({ limit: jsonBodyLimit }))
  app.use(urlencoded({ extended: false, limit: jsonBodyLimit }))
  app.use(helmet(helmetOptions()))
  if (trustProxyEnabled()) app.getHttpAdapter().getInstance().set('trust proxy', 1)
  // Bearer tokens only. Cookies are not set, so credentialed CORS stays off.
  app.enableCors({ origin: corsOrigins(), credentials: false })
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
}

bootstrap()
