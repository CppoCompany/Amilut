/**
 * Convenience aliases over the generated OpenAPI component schemas.
 * Never hand-write API shapes — regenerate with `npm run api:generate` (repo root).
 */
import type { components } from './generated/schema';

export type CustomerDto = components['schemas']['CustomerDto'];
export type CreateCustomerDto = components['schemas']['CreateCustomerDto'];
export type UpdateCustomerDto = components['schemas']['UpdateCustomerDto'];

export type SupplierDto = components['schemas']['SupplierDto'];
export type CreateSupplierDto = components['schemas']['CreateSupplierDto'];
export type UpdateSupplierDto = components['schemas']['UpdateSupplierDto'];

export type OrderDto = components['schemas']['OrderDto'];
export type CreateOrderDto = components['schemas']['CreateOrderDto'];
export type UpdateOrderDto = components['schemas']['UpdateOrderDto'];

export type MblDto = components['schemas']['MblDto'];
export type MblSummaryDto = components['schemas']['MblSummaryDto'];
export type CreateMblDto = components['schemas']['CreateMblDto'];
export type UpdateMblDto = components['schemas']['UpdateMblDto'];
export type MblContainerDto = components['schemas']['MblContainerDto'];
export type CreateMblContainerDto = components['schemas']['CreateMblContainerDto'];

export type HblDto = components['schemas']['HblDto'];
export type CreateHblDto = components['schemas']['CreateHblDto'];
export type UpdateHblDto = components['schemas']['UpdateHblDto'];
export type HblOrderSummaryDto = components['schemas']['HblOrderSummaryDto'];

export type UploadedImportFileDto = components['schemas']['UploadedImportFileDto'];
export type InvoiceLineItemDto = components['schemas']['InvoiceLineItemDto'];
export type LineItemClassificationDto = components['schemas']['LineItemClassificationDto'];
export type LineItemClassificationUpdateDto =
  components['schemas']['LineItemClassificationUpdateDto'];
export type SaveLineItemClassificationsDto =
  components['schemas']['SaveLineItemClassificationsDto'];

export type CountryDto = components['schemas']['CountryDto'];

export type DashboardResponseDto = components['schemas']['DashboardResponseDto'];
export type DashboardOrderRowDto = components['schemas']['DashboardOrderRowDto'];
export type DashboardCaseInReleaseRowDto = components['schemas']['DashboardCaseInReleaseRowDto'];
export type DashboardClassificationRowDto = components['schemas']['DashboardClassificationRowDto'];
export type DashboardCaseRowDto = components['schemas']['DashboardCaseRowDto'];
export type DashboardImportProcessRowDto = components['schemas']['DashboardImportProcessRowDto'];
