import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { buildOpenApiDocument, OPENAPI_DOCS_PATH } from './openapi';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: 'http://localhost:4200' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Swagger UI at /api/docs, raw document at /api/docs-json
  SwaggerModule.setup(OPENAPI_DOCS_PATH, app, () => buildOpenApiDocument(app), {
    jsonDocumentUrl: `${OPENAPI_DOCS_PATH}-json`,
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
