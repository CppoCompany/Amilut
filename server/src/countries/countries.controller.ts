import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CountriesService } from './countries.service';
import { CountryDto } from './dto/country.dto';

/** All routes are protected by the global JwtAuthGuard. */
@ApiTags('countries')
@ApiBearerAuth()
@Controller('countries')
export class CountriesController {
  constructor(private readonly countries: CountriesService) {}

  /** The full country lookup list (Hebrew name + ISO alpha-2 key), by name. */
  @Get()
  @ApiOkResponse({ type: CountryDto, isArray: true })
  findAll(): Promise<CountryDto[]> {
    return this.countries.findAll();
  }
}
