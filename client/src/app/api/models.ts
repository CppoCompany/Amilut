/**
 * Convenience aliases over the generated OpenAPI component schemas.
 * Never hand-write API shapes — regenerate with `npm run api:generate` (repo root).
 */
import type { components } from './generated/schema';

export type CustomerDto = components['schemas']['CustomerDto'];
export type CreateCustomerDto = components['schemas']['CreateCustomerDto'];
export type UpdateCustomerDto = components['schemas']['UpdateCustomerDto'];

export type OrderDto = components['schemas']['OrderDto'];
export type CreateOrderDto = components['schemas']['CreateOrderDto'];
export type UpdateOrderDto = components['schemas']['UpdateOrderDto'];

export type ShipmentSummaryDto = components['schemas']['ShipmentSummaryDto'];
export type ShipmentDto = components['schemas']['ShipmentDto'];
export type CreateShipmentDto = components['schemas']['CreateShipmentDto'];
export type UpdateShipmentDto = components['schemas']['UpdateShipmentDto'];
