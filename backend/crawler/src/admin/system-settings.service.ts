import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemSetting, SettingKey } from './entities/system-setting.entity';
import {
  PlatformInfoDto,
  SystemSettingsDto,
} from './dto/system-settings.dto';

@Injectable()
export class SystemSettingsService {
  private readonly logger = new Logger(SystemSettingsService.name);
  private settingsCache: Map<SettingKey, any> = new Map();

  constructor(
    @InjectRepository(SystemSetting)
    private readonly settingRepository: Repository<SystemSetting>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 初始化默认设置
   */
  async initializeDefaultSettings() {
    const defaultSettings = SystemSetting.getDefaultSettings();

    for (const [key, value] of Object.entries(defaultSettings)) {
      const existingSetting = await this.settingRepository.findOne({
        where: { key: key as SettingKey },
      });

      if (!existingSetting) {
        const setting = SystemSetting.createSetting(
          key as SettingKey,
          JSON.stringify(value),
          this.getSettingDescription(key as SettingKey),
        );
        await this.settingRepository.save(setting);
        this.logger.log(`初始化默认设置: ${key}`);
      } else {
        this.logger.debug(`设置已存在: ${key}`);
      }
    }
  }

  /**
   * 获取所有系统设置
   */
  async getAllSettings(): Promise<SystemSettingsDto> {
    const settings = await this.settingRepository.find();

    const result: SystemSettingsDto = {
      basic: this.getDefaultSettings().basic,
      crawler: this.getDefaultSettings().crawler,
      storage: this.getDefaultSettings().storage,
      security: this.getDefaultSettings().security,
      email: this.getDefaultSettings().email,
    };

    // 覆盖默认设置
    settings.forEach(setting => {
      try {
        const parsedValue = JSON.parse(setting.value);
        result[setting.key] = this.normalizeSettingValue(setting.key, parsedValue);
      } catch (error) {
        this.logger.error(`解析设置 ${setting.key} 失败:`, error);
        // 如果解析失败，使用默认值
      }
    });

    // 更新缓存
    Object.entries(result).forEach(([key, value]) => {
      this.settingsCache.set(
        key as SettingKey,
        this.normalizeSettingValue(key as SettingKey, value),
      );
    });

    return result;
  }

  /**
   * 获取单个设置
   */
  async getSetting(key: SettingKey): Promise<any> {
    // 先检查缓存
    if (this.settingsCache.has(key)) {
      return this.normalizeSettingValue(key, this.settingsCache.get(key));
    }

    const setting = await this.settingRepository.findOne({
      where: { key },
    });

    if (setting) {
      try {
        const parsedValue = this.normalizeSettingValue(key, JSON.parse(setting.value));
        this.settingsCache.set(key, parsedValue);
        return parsedValue;
      } catch (error) {
        this.logger.error(`解析设置 ${key} 失败:`, error);
        // 如果解析失败，返回默认值
      }
    }

    // 返回默认值
    return this.getDefaultSettings()[key];
  }

  /**
   * 更新设置
   */
  async updateSettings(settings: SystemSettingsDto): Promise<SystemSettingsDto> {
    const updatedSettings: SystemSettingsDto = { ...settings };

    for (const [key, value] of Object.entries(settings)) {
      if (value !== undefined) {
        const normalizedValue = this.normalizeSettingValue(key as SettingKey, value);
        await this.settingRepository.upsert(
          {
            key: key as SettingKey,
            value: JSON.stringify(normalizedValue),
            description: this.getSettingDescription(key as SettingKey),
          },
          ['key']
        );

        // 更新缓存
        this.settingsCache.set(key as SettingKey, normalizedValue);
        updatedSettings[key] = normalizedValue as never;

        this.logger.log(`更新系统设置: ${key}`);
      }
    }

    return updatedSettings;
  }

  /**
   * 更新单个设置
   */
  async updateSetting(key: SettingKey, value: any): Promise<void> {
    const normalizedValue = this.normalizeSettingValue(key, value);
    await this.settingRepository.upsert(
      {
        key,
        value: JSON.stringify(normalizedValue),
        description: this.getSettingDescription(key),
      },
      ['key']
    );

    // 更新缓存
    this.settingsCache.set(key, normalizedValue);

    this.logger.log(`更新单个设置: ${key}`);
  }

  /**
   * 重置为默认设置
   */
  async resetToDefaults(): Promise<SystemSettingsDto> {
    const defaultSettings = this.getDefaultSettings();

    for (const [key, value] of Object.entries(defaultSettings)) {
      await this.settingRepository.upsert(
        {
          key: key as SettingKey,
          value: JSON.stringify(value),
          description: this.getSettingDescription(key as SettingKey),
        },
        ['key']
      );
    }

    // 清除缓存
    this.settingsCache.clear();

    this.logger.log('重置所有设置为默认值');

    return defaultSettings;
  }

  /**
   * 获取默认设置
   */
  private getDefaultSettings() {
    return SystemSetting.getDefaultSettings();
  }

  /**
   * 获取设置描述
   */
  private getSettingDescription(key: SettingKey): string {
    const descriptions = {
      [SettingKey.BASIC]: '基础系统设置',
      [SettingKey.CRAWLER]: '爬虫引擎配置',
      [SettingKey.STORAGE]: '数据存储配置',
      [SettingKey.SECURITY]: '安全策略配置',
      [SettingKey.EMAIL]: '邮件服务配置',
    };

    return descriptions[key] || '';
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.settingsCache.clear();
  }

  /**
   * 获取缓存的设置值
   */
  getCachedSetting(key: SettingKey): any {
    return this.normalizeSettingValue(key, this.settingsCache.get(key));
  }

  async getPlatformInfo(): Promise<PlatformInfoDto> {
    const basicSettings = this.normalizeSettingValue(
      SettingKey.BASIC,
      await this.getSetting(SettingKey.BASIC),
    );

    return {
      systemName: String(basicSettings.systemName || 'Crawlee System'),
      systemDescription: String(
        basicSettings.systemDescription || '基于 Crawlee 的低代码爬虫平台',
      ),
      announcement: {
        enabled: Boolean(basicSettings.announcementEnabled),
        title: String(basicSettings.announcementTitle || '平台公告'),
        content: String(basicSettings.announcementContent || ''),
        variant: basicSettings.announcementVariant || 'info',
      },
      capabilities: {
        unsafeCustomJsEnabled: Boolean(
          this.configService.get('security.unsafeCustomJsEnabled'),
        ),
      },
      maintenance: {
        enabled: Boolean(basicSettings.maintenanceEnabled),
        title: String(basicSettings.maintenanceTitle || '系统维护提醒'),
        content: String(basicSettings.maintenanceContent || ''),
        variant: basicSettings.maintenanceVariant || 'warning',
        startAt: String(basicSettings.maintenanceStartAt || ''),
        endAt: String(basicSettings.maintenanceEndAt || ''),
      },
    };
  }

  private normalizeSettingValue(key: SettingKey, value: any) {
    const defaultValue = this.getDefaultSettings()[key];

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { ...defaultValue, ...value };
    }

    return value ?? defaultValue;
  }
}
