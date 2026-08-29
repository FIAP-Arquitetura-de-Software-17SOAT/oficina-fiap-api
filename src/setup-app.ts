import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NextFunction, Request, Response } from 'express';
import { DomainExceptionFilter } from './shared/http/filters/domain-exception.filter';

export const API_PREFIX = 'api/v1';

export function configureApp(app: INestApplication): INestApplication {
  const httpInstance = app.getHttpAdapter().getInstance();

  if (typeof httpInstance.disable === 'function') {
    httpInstance.disable('x-powered-by');
  }

  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  app.setGlobalPrefix(API_PREFIX);

  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new DomainExceptionFilter());

  return app;
}

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Oficina FIAP API')
    .setDescription('API de gestão da oficina')
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Access token returned by POST /api/v1/auth/login',
    })
    .build();

  SwaggerModule.setup(`${API_PREFIX}/docs`, app, () =>
    SwaggerModule.createDocument(app, config),
  );
}
