import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AirReferenceService } from './air-reference.service';
import {
  AirportDto,
  CargoTerminalDto,
  ListAirportsQuery,
  WeightRuleDto,
  WeightRuleQuery,
} from './dto/air-reference.dto';

/** Air-freight lookups. Authentication is enforced by the global JwtAuthGuard. */
@ApiTags('air')
@ApiBearerAuth()
@Controller('air')
export class AirController {
  constructor(private readonly reference: AirReferenceService) {}

  @Get('airports')
  @ApiOkResponse({ type: AirportDto, isArray: true })
  listAirports(@Query() query: ListAirportsQuery): Promise<AirportDto[]> {
    return this.reference.listAirports(query.importDestination ?? false);
  }

  @Get('cargo-terminals')
  @ApiOkResponse({ type: CargoTerminalDto, isArray: true })
  listCargoTerminals(): Promise<CargoTerminalDto[]> {
    return this.reference.listCargoTerminals();
  }

  /** The rule the client previews chargeable weight with; the server
   *  recalculates on every save, so the preview is never authoritative. */
  @Get('weight-rule')
  @ApiOkResponse({ type: WeightRuleDto })
  resolveWeightRule(@Query() query: WeightRuleQuery): Promise<WeightRuleDto> {
    return this.reference.resolveWeightRule(query.airlinePrefix ?? null);
  }
}
