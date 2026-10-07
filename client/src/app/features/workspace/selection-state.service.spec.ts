import { TestBed } from '@angular/core/testing';

import type { HblDto, MblDto, OrderDto } from '../../api/models';
import {
  Destination,
  Incoterm,
  MblShippingType,
  MblStatus,
  OrderStatus,
  PaymentTerms,
  SeaMethod,
  ShipmentType,
} from '../../api/enums';
import { SelectionStateService } from './selection-state.service';

const ORDER_A: OrderDto = {
  id: 1001,
  customerId: 3,
  customerName: 'ACME Ltd.',
  handlerUserId: 7,
  handlerName: 'דנה לוי',
  createdAt: '2026-09-01T08:30:00.000Z',
  updatedAt: '2026-09-01T08:30:00.000Z',
  status: OrderStatus.PREPARING,
  shipmentType: ShipmentType.SEA,
  paymentTerms: PaymentTerms.PREPAID,
  incoterm: Incoterm.CFR,
  destination: Destination.ASHDOD,
  supplierId: null,
  supplierName: null,
  factoryReadyDate: null,
  factoryPickupDate: null,
  departureDate: null,
  etaDate: null,
  shippingLine: null,
  voyageNumber: null,
  airline: null,
  flightNumber: null,
  isActive: true,
};

const ORDER_B: OrderDto = { ...ORDER_A, id: 1002, customerName: 'Other Ltd.' };

const MBL_A: MblDto = {
  id: 1,
  shippingType: MblShippingType.SEA,
  seaMethod: SeaMethod.FCL_FCL,
  customerId: null,
  customerName: null,
  mblNumber: 'MBL-001',
  bookingNumber: null,
  vesselName: null,
  voyageNumber: null,
  portOfLoading: null,
  portOfDischarge: null,
  finalDestination: null,
  shipperName: null,
  shipperAddress: null,
  consigneeName: null,
  consigneeAddress: null,
  notifyPartyName: null,
  notifyPartyAddress: null,
  containerNumber: null,
  containerSealNumber: null,
  cargoDescription: null,
  grossWeightKg: null,
  volumeCbm: null,
  freightTerms: null,
  receiptDeliveryType: null,
  placeOfIssue: null,
  dateOfIssue: null,
  carrierName: null,
  status: MblStatus.OPEN,
  handlerUserId: null,
  handlerName: null,
  containers: [],
  createdAt: '2026-09-01T08:30:00.000Z',
  updatedAt: '2026-09-01T08:30:00.000Z',
};

const MBL_B: MblDto = { ...MBL_A, id: 2, mblNumber: 'MBL-002' };

const HBLS_A: HblDto[] = [];

describe('SelectionStateService', () => {
  let service: SelectionStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SelectionStateService);
  });

  it('starts with nothing selected', () => {
    expect(service.selected()).toBeNull();
    expect(service.selectedOrder()).toBeNull();
    expect(service.selectedShippingCase()).toBeNull();
  });

  it('selecting an order stores the full object', () => {
    service.selectOrder(ORDER_A);

    expect(service.selected()).toEqual({ kind: 'order', order: ORDER_A });
    expect(service.selectedOrder()).toEqual(ORDER_A);
    expect(service.selectedShippingCase()).toBeNull();
  });

  it('selecting a shipping case stores the full MBL + HBLs', () => {
    service.selectShippingCase(MBL_A, HBLS_A);

    expect(service.selected()).toEqual({ kind: 'shippingCase', mbl: MBL_A, hbls: HBLS_A });
    expect(service.selectedShippingCase()).toEqual({ kind: 'shippingCase', mbl: MBL_A, hbls: HBLS_A });
    expect(service.selectedOrder()).toBeNull();
  });

  it('selecting a shipping case while an order is selected removes the order (mutual exclusivity)', () => {
    service.selectOrder(ORDER_A);
    expect(service.selectedOrder()).toEqual(ORDER_A);

    service.selectShippingCase(MBL_A, HBLS_A);

    expect(service.selectedOrder()).toBeNull();
    expect(service.selectedShippingCase()?.mbl).toEqual(MBL_A);
  });

  it('selecting an order while a shipping case is selected removes the shipping case (mutual exclusivity)', () => {
    service.selectShippingCase(MBL_A, HBLS_A);
    expect(service.selectedShippingCase()).not.toBeNull();

    service.selectOrder(ORDER_A);

    expect(service.selectedShippingCase()).toBeNull();
    expect(service.selectedOrder()).toEqual(ORDER_A);
  });

  it('selecting a different order replaces the previous one, never holding two', () => {
    service.selectOrder(ORDER_A);
    service.selectOrder(ORDER_B);

    expect(service.selectedOrder()).toEqual(ORDER_B);
    expect(service.selected()).toEqual({ kind: 'order', order: ORDER_B });
  });

  it('selecting a different shipping case replaces the previous one, never holding two', () => {
    service.selectShippingCase(MBL_A, HBLS_A);
    service.selectShippingCase(MBL_B, HBLS_A);

    expect(service.selectedShippingCase()?.mbl).toEqual(MBL_B);
    expect(service.selected()).toEqual({ kind: 'shippingCase', mbl: MBL_B, hbls: HBLS_A });
  });

  it('clear() empties the selection', () => {
    service.selectOrder(ORDER_A);
    service.clear();

    expect(service.selected()).toBeNull();
    expect(service.selectedOrder()).toBeNull();
  });
});
