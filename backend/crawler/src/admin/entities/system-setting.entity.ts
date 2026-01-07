import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export enum SettingKey {
  BASIC = 'basic',
  CRAWLER = 'crawler',
  STORAGE = 'storage',
  SECURITY = 'security',
  EMAIL = 'email',
}

@Entity('system_settings')
export class SystemSetting {
  @PrimaryColumn({
    type: 'enum',
    enum: SettingKey,
  })
  key: SettingKey;

  @Column({ type: 'text' })
  value: string;

  @Column({ length: 255, nullable: true })
  description?: string;

  @UpdateDateColumn()
  updatedAt: Date;

  // 便捷方法
  static createSetting(key: SettingKey, value: any, description?: string): SystemSetting {
    const setting = new SystemSetting();
    setting.key = key;
    setting.value = value;
    setting.description = description;
    return setting;
  }

  // 获取默认设置
  static getDefaultSettings() {
    return {
      [SettingKey.BASIC]: {
        systemName: 'Crawlee System',
        systemDescription: '基于Crawlee的低代码爬虫平台',
        adminEmail: 'admin@example.com',
        language: 'zh-CN',
      },
      [SettingKey.CRAWLER]: {
        defaultConcurrency: 5,
        maxRequestsPerCrawl: 100,
        requestTimeout: 30,
        waitForTimeout: 30000,
        enableProxy: false,
        proxyUrl: '',
      },
      [SettingKey.STORAGE]: {
        datasetRetentionDays: 30,
        screenshotRetentionDays: 30,
        logRetentionDays: 90,
        autoCleanup: true,
        cleanupTime: '02:00',
      },
      [SettingKey.SECURITY]: {
        minPasswordLength: 8,
        loginFailLockCount: 5,
        lockDurationMinutes: 30,
        enableTwoFactor: false,
        sessionTimeoutMinutes: 60,
      },
      [SettingKey.EMAIL]: {
        enableEmail: false,
        smtpHost: '',
        smtpPort: 587,
        smtpUsername: '',
        smtpPassword: '',
        smtpSSL: true,
        fromEmail: '',
        fromName: 'Crawlee System',
      },
    };
  }
}
