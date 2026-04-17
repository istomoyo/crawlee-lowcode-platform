import { Controller, Get } from '@nestjs/common';
import { PlatformInfoDto } from './dto/system-settings.dto';
import { SystemSettingsService } from './system-settings.service';

@Controller('platform')
export class PlatformController {
  constructor(
    private readonly systemSettingsService: SystemSettingsService,
  ) {}

  @Get('info')
  async getPlatformInfo(): Promise<PlatformInfoDto> {
    return this.systemSettingsService.getPlatformInfo();
  }
}
