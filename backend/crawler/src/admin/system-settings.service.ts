import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemSetting, SettingKey } from './entities/system-setting.entity';
import { SystemSettingsDto } from './dto/system-settings.dto';

@Injectable()
export class SystemSettingsService {
  private readonly logger = new Logger(SystemSettingsService.name);
  private settingsCache: Map<SettingKey, any> = new Map();

  constructor(
    @InjectRepository(SystemSetting)
    private readonly settingRepository: Repository<SystemSetting>,
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
        console.log(`[SETTINGS INIT] 初始化默认设置: ${key}`);
        this.logger.log(`初始化默认设置: ${key}`);
      } else {
        console.log(`[SETTINGS INIT] 设置已存在: ${key}`);
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
        result[setting.key] = { ...result[setting.key], ...parsedValue };
      } catch (error) {
        this.logger.error(`解析设置 ${setting.key} 失败:`, error);
        // 如果解析失败，使用默认值
      }
    });

    // 更新缓存
    Object.entries(result).forEach(([key, value]) => {
      this.settingsCache.set(key as SettingKey, value);
    });

    return result;
  }

  /**
   * 获取单个设置
   */
  async getSetting(key: SettingKey): Promise<any> {
    // 先检查缓存
    if (this.settingsCache.has(key)) {
      return this.settingsCache.get(key);
    }

    const setting = await this.settingRepository.findOne({
      where: { key },
    });

    if (setting) {
      try {
        const parsedValue = JSON.parse(setting.value);
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
        await this.settingRepository.upsert(
          {
            key: key as SettingKey,
            value: JSON.stringify(value),
            description: this.getSettingDescription(key as SettingKey),
          },
          ['key']
        );

        // 更新缓存
        this.settingsCache.set(key as SettingKey, value);

        this.logger.log(`更新系统设置: ${key}`);
      }
    }

    return updatedSettings;
  }

  /**
   * 更新单个设置
   */
  async updateSetting(key: SettingKey, value: any): Promise<void> {
    await this.settingRepository.upsert(
      {
        key,
        value: JSON.stringify(value),
        description: this.getSettingDescription(key),
      },
      ['key']
    );

    // 更新缓存
    this.settingsCache.set(key, value);

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
    return this.settingsCache.get(key);
  }
}
