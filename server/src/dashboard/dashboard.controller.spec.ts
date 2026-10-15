import { Test } from '@nestjs/testing';
import type { JwtPayload } from '../auth/auth.types';
import { DashboardController } from './dashboard.controller';
import {
  DashboardService,
  PENDING_CLASSIFICATION_LIST_LIMIT,
} from './dashboard.service';
import { DashboardResponseDto } from './dto/dashboard.dto';

// The service's DatabaseService import drags in @nestjs/config (ESM-only);
// the service itself is mocked below, so only the DI token is needed.
jest.mock('../database/database.service', () => ({
  DatabaseService: class DatabaseService {},
}));

describe('DashboardController', () => {
  let controller: DashboardController;
  let dashboard: {
    getDashboard: jest.Mock;
    findCcfsPendingClassification: jest.Mock;
  };

  beforeEach(async () => {
    dashboard = {
      getDashboard: jest.fn(),
      findCcfsPendingClassification: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: dashboard }],
    }).compile();
    controller = moduleRef.get(DashboardController);
  });

  it('passes the JWT subject (users.id) to the service, never a client-supplied id', async () => {
    const response: DashboardResponseDto = {
      myOrders: [],
      casesInRelease: [],
      ccfsPendingClassification: [],
      ccfs: [],
      importProcesses: [],
    };
    dashboard.getDashboard.mockResolvedValueOnce(response);
    const user: JwtPayload = {
      sub: 7,
      email: 'dana@example.com',
      name: 'Dana',
      role: 'admin',
    };

    await expect(controller.getDashboard(user)).resolves.toBe(response);
    expect(dashboard.getDashboard).toHaveBeenCalledWith(7);
  });

  it('lists the CCFs pending classification with the screen-list limit', async () => {
    dashboard.findCcfsPendingClassification.mockResolvedValueOnce([]);

    await expect(controller.getCcfsPendingClassification()).resolves.toEqual(
      [],
    );
    expect(dashboard.findCcfsPendingClassification).toHaveBeenCalledWith(
      PENDING_CLASSIFICATION_LIST_LIMIT,
    );
  });
});
