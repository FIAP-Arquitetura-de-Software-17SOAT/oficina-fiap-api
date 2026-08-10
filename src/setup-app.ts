import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { DomainExceptionFilter } from './shared/http/filters/domain-exception.filter';

export const API_PREFIX = 'api/v1';

export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix(API_PREFIX);

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
    .build();

  SwaggerModule.setup(`${API_PREFIX}/docs`, app, () =>
    SwaggerModule.createDocument(app, config),
  );
}
