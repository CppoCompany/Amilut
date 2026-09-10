import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import {
  Destination,
  OrderStatus,
  PaymentTerms,
  ShipmentType,
} from './orders/orders.enums';

/** Swagger UI path (relative to the app; global prefix is NOT applied to it). */
export const OPENAPI_DOCS_PATH = 'api/docs';

/**
 * Enums exposed as NAMED schemas in `components.schemas`.
 * The key must equal the `enumName` used in `@ApiProperty({ enum, enumName })`.
 * Each entry is annotated with `x-enum-varnames` (TypeScript member names, in
 * declaration order) so a client generator can reproduce the same members.
 */
export const NAMED_ENUMS: Record<string, Record<string, string>> = {
  ShipmentType,
  OrderStatus,
  PaymentTerms,
  Destination,
};

type SchemaWithExtensions = {
  type?: string;
  enum?: unknown[];
  [ext: `x-${string}`]: unknown;
};

/**
 * Builds the OpenAPI document for `app` and post-processes the named enum
 * schemas. Shared by `main.ts` (live `/api/docs`) and `scripts/export-openapi.ts`.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Amilut API')
    .setDescription('Customs brokerage back office API')
    .setVersion('0.0.1')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  addEnumVarnames(document);
  return document;
}

function addEnumVarnames(document: OpenAPIObject): void {
  const schemas = (document.components?.schemas ?? {}) as Record<
    string,
    SchemaWithExtensions
  >;

  for (const [name, enumObject] of Object.entries(NAMED_ENUMS)) {
    const members = Object.entries(enumObject); // [MEMBER_NAME, value] in declaration order
    const values = members.map(([, value]) => value);
    const varnames = members.map(([member]) => member);

    const schema = schemas[name];
    if (!schema) {
      // Enum not referenced by any DTO yet — still publish it so clients can generate it.
      schemas[name] = {
        type: 'string',
        enum: values,
        'x-enum-varnames': varnames,
      };
      continue;
    }

    schema.type = 'string';
    schema.enum = values;
    schema['x-enum-varnames'] = varnames;
  }

  document.components = { ...document.components, schemas };
}
