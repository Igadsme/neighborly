import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import helmet from 'helmet'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.use(helmet())
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',').map(value => value.trim()) ?? false })
  app.setGlobalPrefix('api/v1')
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Neighborly API')
    .setDescription('Request-first local marketplace and community exchange API')
    .setVersion('1.0')
    .addBearerAuth()
    .build()
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig))

  await app.listen(process.env.PORT ?? 3000)
}

bootstrap()
