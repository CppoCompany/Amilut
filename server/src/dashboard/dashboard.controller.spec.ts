import { Test } from '@nestjs/testing';
import type { JwtPayload } from '../auth/auth.types';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardResponseDto } from './dto/dashboard.dto';

// The service's DatabaseService import drags in @nestjs/config (ESM-only);
// the service itself is mocked below, so only the DI token is needed.
jest.mock('../database/database.service', () => ({
  DatabaseService: class DatabaseService {},
}));

describe('DashboardController', () => {
  let controller: DashboardController;
  let dashboard: { getDashboard: jest.Mock };

  beforeEach(async () => {
    dashboard = { getDashboard: jest.fn() };
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
      myClassifications: [],
      myCases: [],
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
});
