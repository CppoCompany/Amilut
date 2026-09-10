/**
 * Writes the OpenAPI document to server/openapi.json WITHOUT starting an HTTP
 * listener, so the Angular client can generate types/enums from it offline.
 *
 * Usage: npm run openapi:export   (from server/)
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { buildOpenApiDocument } from '../src/openapi';

// AuthModule refuses to boot without these; dummies are fine for doc generation.
process.env.JWT_SECRET ??= 'openapi-export-dummy-secret';
process.env.GOOGLE_CLIENT_ID ??= 'openapi-export-dummy-client-id';

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api'); // keep paths identical to the live server
  await app.init();

  const document = buildOpenApiDocument(app);
  const outPath = resolve(__dirname, '..', 'openapi.json');
  writeFileSync(outPath, JSON.stringify(document, null, 2) + '\n', 'utf8');
  await app.close();

  const schemaCount = Object.keys(document.components?.schemas ?? {}).length;
  console.log(`OpenAPI written to ${outPath} (${schemaCount} schemas)`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
