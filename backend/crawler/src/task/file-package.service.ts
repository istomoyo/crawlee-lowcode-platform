import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import axios from 'axios';
import { SelectorConfig } from './dto/execute-task.dto';

interface PackageConfig {
  structure?: {
    images?: string;
    files?: string;
    texts?: string;
    data?: string;
  };
  download?: {
    images?: boolean;
    files?: boolean;
    texts?: boolean;
    maxFileSize?: number;
    timeout?: number;
  };
  // 字段映射配置（可选，如果不提供则自动识别）
  fieldMapping?: {
    imageFields?: string[]; // 指定哪些字段是图片
    fileFields?: string[]; // 指定哪些字段是文件（链接）
    textFields?: string[]; // 指定哪些字段是文本
  };
}

interface ItemData {
  [key: string]: any;
}

@Injectable()
export class FilePackageService {
  private readonly logger = new Logger(FilePackageService.name);

  /**
   * 下载文件
   */
  private async downloadFile(
    url: string,
    destPath: string,
    maxSize: number = 10 * 1024 * 1024, // 默认10MB
    timeout: number = 30000, // 默认30秒
  ): Promise<boolean> {
    try {
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: timeout,
        maxContentLength: maxSize,
        maxBodyLength: maxSize,
      });

      // 确保目录存在
      const dir = path.dirname(destPath);
      await fs.mkdir(dir, { recursive: true });

      // 创建写入流
      const writer = fsSync.createWriteStream(destPath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(true));
        writer.on('error', (error) => {
          this.logger.warn(`下载文件失败 ${url}:`, error.message);
          resolve(false);
        });
        response.data.on('error', (error) => {
          this.logger.warn(`下载文件失败 ${url}:`, error.message);
          resolve(false);
        });
      });
    } catch (error) {
      this.logger.warn(`下载文件失败 ${url}:`, error.message);
      return false;
    }
  }

  /**
   * 清理文件名，移除非法字符
   */
  private sanitizeFileName(fileName: string): string {
    // 移除或替换非法字符
    return fileName
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 200); // 限制文件名长度
  }

  /**
   * 转义正则表达式中的特殊字符
   */
  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 解析文件路径模板，支持变量替换
   */
  private parsePathTemplate(
    template: string,
    itemData: ItemData,
    index: number,
    fieldName?: string,
    timestamp?: string,
  ): string {
    let result = template;

    // 替换基础变量
    result = result.replace(/{index}/g, String(index + 1));
    result = result.replace(/{timestamp}/g, timestamp || Date.now().toString());
    result = result.replace(/{date}/g, new Date().toISOString().split('T')[0]);

    // 替换{fieldName}变量（当前字段名）
    if (fieldName) {
      const escapedFieldName = this.escapeRegExp(fieldName);
      result = result.replace(new RegExp(`\\{${escapedFieldName}\\}`, 'g'), fieldName);
    }

    // 替换其他字段值（优先级更高，会覆盖{fieldName}的值）
    for (const key in itemData) {
      if (itemData.hasOwnProperty(key) && itemData[key]) {
        // 处理字段值：清理非法字符，但保留点号（因为可能用于扩展名）
        // 注意：点号不会被替换，这样可以支持文件名中包含点号的情况
        const value = String(itemData[key])
          .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
          .replace(/\s+/g, '_')
          .substring(0, 100);
        // 转义 key 中的正则表达式特殊字符
        const escapedKey = this.escapeRegExp(key);
        result = result.replace(new RegExp(`\\{${escapedKey}\\}`, 'g'), value);
      }
    }

    this.logger.debug(`路径模板解析: "${template}" -> "${result}"`);
    return result;
  }

  /**
   * 获取文件扩展名
   */
  private getFileExtension(url: string, defaultExt: string = 'jpg'): string {
    try {
      const urlObj = new URL(url);
      let pathname = urlObj.pathname;
      
      // 移除 @ 符号及其后面的参数（如B站图片URL格式：xxx.jpg@672w_378h_1c_!web-home-common-cover）
      // 移除 ? 查询参数
      // 移除 # 锚点
      pathname = pathname.split('@')[0].split('?')[0].split('#')[0];
      
      const ext = path.extname(pathname).toLowerCase().slice(1);
      return ext || defaultExt;
    } catch {
      return defaultExt;
    }
  }

  /**
   * 根据JSON数据自动识别字段类型
   */
  private detectFieldTypes(items: ItemData[], fieldMapping?: PackageConfig['fieldMapping']) {
    if (!items || items.length === 0) {
      return { imageFields: [], fileFields: [], textFields: [] };
    }

    // 如果提供了字段映射，直接使用
    if (fieldMapping) {
      return {
        imageFields: fieldMapping.imageFields || [],
        fileFields: fieldMapping.fileFields || [],
        textFields: fieldMapping.textFields || [],
      };
    }

    // 自动识别字段类型
    const imageFields = new Set<string>();
    const fileFields = new Set<string>();
    const textFields = new Set<string>();

    // 分析前几个数据项来确定字段类型
    const sampleItems = items.slice(0, Math.min(5, items.length));

    for (const item of sampleItems) {
      for (const [key, value] of Object.entries(item)) {
        if (value === null || value === undefined || value === '') continue;

        if (typeof value === 'string') {
          // 检查是否是URL
          if (value.startsWith('http://') || value.startsWith('https://')) {
            // 检查是否是图片URL
            // 支持多种格式：
            // 1. 标准格式：.jpg, .png 等
            // 2. 带查询参数：.jpg?xxx
            // 3. 带@参数：.jpg@xxx（如B站图片URL）
            // 4. 带锚点：.jpg#xxx
            const lowerValue = value.toLowerCase();
            // 改进的正则表达式，支持 @、?、# 和字符串结尾
            if (lowerValue.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?|@|#|$)/i)) {
              imageFields.add(key);
            } else {
              // 可能是文件链接
              fileFields.add(key);
            }
          } else {
            // 普通文本
            textFields.add(key);
          }
        } else if (typeof value === 'string' && value.length > 50) {
          // 长文本
          textFields.add(key);
        }
      }
    }

    return {
      imageFields: Array.from(imageFields),
      fileFields: Array.from(fileFields),
      textFields: Array.from(textFields),
    };
  }

  /**
   * 打包数据为压缩文件（使用字段映射）
   */
  async packageDataFromJson(
    items: ItemData[],
    packageConfig: PackageConfig,
    outputPath: string,
    taskId: number,
    executionId: number,
  ): Promise<string> {
    const timestamp = Date.now().toString();
    const tempDir = path.join(
      process.cwd(),
      'uploads',
      'temp',
      `package_${taskId}_${executionId}_${timestamp}`,
    );

    try {
      // 创建临时目录
      await fs.mkdir(tempDir, { recursive: true });

      const structure = packageConfig.structure || {};
      const download = packageConfig.download || {};
      const maxFileSize = download.maxFileSize || 10 * 1024 * 1024; // 10MB
      const timeout = download.timeout || 30000; // 30秒

      // 自动识别字段类型
      const { imageFields, fileFields, textFields } = this.detectFieldTypes(items, packageConfig.fieldMapping);

      this.logger.log(`识别到字段类型 - 图片: ${imageFields.join(', ')}, 文件: ${fileFields.join(', ')}, 文本: ${textFields.join(', ')}`);

      // 创建下载任务列表
      const downloadTasks: Array<Promise<void>> = [];

      // 处理每个数据项
      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // 下载图片
        if (download.images !== false && imageFields.length > 0) {
          for (const fieldName of imageFields) {
            const imageUrl = item[fieldName];
            if (imageUrl && typeof imageUrl === 'string' && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
              const imageTemplate = structure.images || 'images/{index}_{fieldName}.{ext}';
              const ext = this.getFileExtension(imageUrl, 'jpg');
              let imagePath = this.parsePathTemplate(imageTemplate, item, i, fieldName, timestamp);
              // 如果模板中没有扩展名，添加扩展名
              if (!path.extname(imagePath)) {
                imagePath = `${imagePath}.${ext}`;
              } else {
                imagePath = imagePath.replace(/{ext}/g, ext);
              }
              
              const fullImagePath = path.join(tempDir, imagePath);
              
              downloadTasks.push(
                this.downloadFile(imageUrl, fullImagePath, maxFileSize, timeout).then((success) => {
                  if (success) {
                    this.logger.log(`已下载图片: ${imagePath}`);
                  }
                }),
              );
            }
          }
        }

        // 下载文件（从fileFields）
        if (download.files !== false && fileFields.length > 0) {
          for (const fieldName of fileFields) {
            const fileUrl = item[fieldName];
            if (fileUrl && typeof fileUrl === 'string' && (fileUrl.startsWith('http://') || fileUrl.startsWith('https://'))) {
              const fileTemplate = structure.files || 'files/{index}_{fieldName}.{ext}';
              const ext = this.getFileExtension(fileUrl, 'bin');
              let filePath = this.parsePathTemplate(fileTemplate, item, i, fieldName, timestamp);
              // 如果模板中没有扩展名，添加扩展名
              if (!path.extname(filePath)) {
                filePath = `${filePath}.${ext}`;
              } else {
                filePath = filePath.replace(/{ext}/g, ext);
              }
              
              const fullFilePath = path.join(tempDir, filePath);
              
              downloadTasks.push(
                this.downloadFile(fileUrl, fullFilePath, maxFileSize, timeout).then((success) => {
                  if (success) {
                    this.logger.log(`已下载文件: ${filePath}`);
                  }
                }),
              );
            }
          }
        }

        // 保存文本为文件
        if (download.texts !== false && textFields.length > 0) {
          for (const fieldName of textFields) {
            const textValue = item[fieldName];
            if (textValue && typeof textValue === 'string' && textValue.trim()) {
              const textTemplate = structure.texts || 'texts/{index}_{fieldName}.txt';
              let textPath = this.parsePathTemplate(textTemplate, item, i, fieldName, timestamp);
              
              // 检查解析后的路径是否有扩展名
              // path.extname() 会返回最后一个点号后的内容（包括点号），如 ".md", ".txt"
              const ext = path.extname(textPath);
              this.logger.log(`[文本文件] 模板: "${textTemplate}" -> 路径: "${textPath}" -> 扩展名: "${ext}"`);
              
              // 如果模板中没有扩展名，才添加默认的 .txt 扩展名
              // 这样可以支持用户自定义扩展名，如 .md, .html 等
              if (!ext || ext === '') {
                textPath = `${textPath}.txt`;
                this.logger.log(`[文本文件] 路径无扩展名，添加默认 .txt: "${textPath}"`);
              } else {
                this.logger.log(`[文本文件] 保留模板中的扩展名: "${ext}"`);
              }
              
              const fullTextPath = path.join(tempDir, textPath);
              
              // 确保目录存在
              await fs.mkdir(path.dirname(fullTextPath), { recursive: true });
              
              // 写入文本文件
              await fs.writeFile(fullTextPath, textValue, 'utf-8');
              this.logger.log(`[文本文件] 已保存: ${textPath}`);
            }
          }
        }
      }

      // 等待所有下载任务完成
      await Promise.all(downloadTasks);

      // 保存数据JSON文件（仅当用户明确配置了structure.data时才生成）
      if (structure.data && structure.data.trim()) {
        const dataTemplate = structure.data;
        // 判断是单文件还是每个数据项一个文件
        if (dataTemplate.includes('{index}')) {
          // 每个数据项一个JSON文件
          for (let i = 0; i < items.length; i++) {
            const dataPath = path.join(tempDir, this.parsePathTemplate(dataTemplate, items[i], i, undefined, timestamp));
            if (!path.extname(dataPath)) {
              const fullDataPath = `${dataPath}.json`;
              await fs.writeFile(fullDataPath, JSON.stringify(items[i], null, 2), 'utf-8');
            } else {
              await fs.writeFile(dataPath, JSON.stringify(items[i], null, 2), 'utf-8');
            }
          }
        } else {
          // 单个JSON文件包含所有数据
          const dataPath = path.join(tempDir, this.parsePathTemplate(dataTemplate, items[0] || {}, 0, undefined, timestamp));
          const finalDataPath = path.extname(dataPath) ? dataPath : `${dataPath}.json`;
          await fs.writeFile(finalDataPath, JSON.stringify(items, null, 2), 'utf-8');
        }
      }
      // 不再默认生成data.json，只有当用户明确配置了structure.data时才生成

      // 创建ZIP压缩文件
      const zipPath = outputPath;
      await this.createZipArchive(tempDir, zipPath);

      // 清理临时目录
      await this.cleanupDirectory(tempDir);

      this.logger.log(`打包完成: ${zipPath}`);
      return zipPath;
    } catch (error) {
      this.logger.error('打包失败:', error);
      // 清理临时目录
      try {
        await this.cleanupDirectory(tempDir);
      } catch (cleanupError) {
        this.logger.error('清理临时目录失败:', cleanupError);
      }
      throw error;
    }
  }

  /**
   * 打包数据为压缩文件（使用选择器配置）
   */
  async packageData(
    items: ItemData[],
    selectors: SelectorConfig[],
    packageConfig: PackageConfig,
    outputPath: string,
    taskId: number,
    executionId: number,
  ): Promise<string> {
    const timestamp = Date.now().toString();
    const tempDir = path.join(
      process.cwd(),
      'uploads',
      'temp',
      `package_${taskId}_${executionId}_${timestamp}`,
    );

    try {
      // 创建临时目录
      await fs.mkdir(tempDir, { recursive: true });

      const structure = packageConfig.structure || {};
      const download = packageConfig.download || {};
      const maxFileSize = download.maxFileSize || 10 * 1024 * 1024; // 10MB
      const timeout = download.timeout || 30000; // 30秒

      // 识别不同类型的选择器
      const imageSelectors = selectors.filter((s) => s.type === 'image');
      const linkSelectors = selectors.filter((s) => s.type === 'link');
      const textSelectors = selectors.filter((s) => s.type === 'text');

      // 创建下载任务列表
      const downloadTasks: Array<Promise<void>> = [];

      // 处理每个数据项
      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // 下载图片
        if (download.images !== false && imageSelectors.length > 0) {
          for (const selector of imageSelectors) {
            const imageUrl = item[selector.name];
            if (imageUrl && typeof imageUrl === 'string' && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
              const imageTemplate = structure.images || 'images/{index}_{fieldName}.{ext}';
              const ext = this.getFileExtension(imageUrl, 'jpg');
              let imagePath = this.parsePathTemplate(imageTemplate, item, i, selector.name, timestamp);
              // 如果模板中没有扩展名，添加扩展名
              if (!path.extname(imagePath)) {
                imagePath = `${imagePath}.${ext}`;
              } else {
                imagePath = imagePath.replace(/{ext}/g, ext);
              }
              
              const fullImagePath = path.join(tempDir, imagePath);
              
              downloadTasks.push(
                this.downloadFile(imageUrl, fullImagePath, maxFileSize, timeout).then((success) => {
                  if (success) {
                    this.logger.log(`已下载图片: ${imagePath}`);
                  }
                }),
              );
            }
          }
        }

        // 下载文件（从link字段）
        if (download.files !== false && linkSelectors.length > 0) {
          for (const selector of linkSelectors) {
            const fileUrl = item[selector.name];
            if (fileUrl && typeof fileUrl === 'string' && (fileUrl.startsWith('http://') || fileUrl.startsWith('https://'))) {
              const fileTemplate = structure.files || 'files/{index}_{fieldName}.{ext}';
              const ext = this.getFileExtension(fileUrl, 'bin');
              let filePath = this.parsePathTemplate(fileTemplate, item, i, selector.name, timestamp);
              // 如果模板中没有扩展名，添加扩展名
              if (!path.extname(filePath)) {
                filePath = `${filePath}.${ext}`;
              } else {
                filePath = filePath.replace(/{ext}/g, ext);
              }
              
              const fullFilePath = path.join(tempDir, filePath);
              
              downloadTasks.push(
                this.downloadFile(fileUrl, fullFilePath, maxFileSize, timeout).then((success) => {
                  if (success) {
                    this.logger.log(`已下载文件: ${filePath}`);
                  }
                }),
              );
            }
          }
        }

        // 保存文本为文件
        if (download.texts !== false && textSelectors.length > 0) {
          for (const selector of textSelectors) {
            const textValue = item[selector.name];
            if (textValue && typeof textValue === 'string' && textValue.trim()) {
              const textTemplate = structure.texts || 'texts/{index}_{fieldName}.txt';
              let textPath = this.parsePathTemplate(textTemplate, item, i, selector.name, timestamp);
              
              // 检查解析后的路径是否有扩展名
              // path.extname() 会返回最后一个点号后的内容（包括点号），如 ".md", ".txt"
              const ext = path.extname(textPath);
              this.logger.log(`[文本文件] 模板: "${textTemplate}" -> 路径: "${textPath}" -> 扩展名: "${ext}"`);
              
              // 如果模板中没有扩展名，才添加默认的 .txt 扩展名
              // 这样可以支持用户自定义扩展名，如 .md, .html 等
              if (!ext || ext === '') {
                textPath = `${textPath}.txt`;
                this.logger.log(`[文本文件] 路径无扩展名，添加默认 .txt: "${textPath}"`);
              } else {
                this.logger.log(`[文本文件] 保留模板中的扩展名: "${ext}"`);
              }
              
              const fullTextPath = path.join(tempDir, textPath);
              
              // 确保目录存在
              await fs.mkdir(path.dirname(fullTextPath), { recursive: true });
              
              // 写入文本文件
              await fs.writeFile(fullTextPath, textValue, 'utf-8');
              this.logger.log(`[文本文件] 已保存: ${textPath}`);
            }
          }
        }
      }

      // 等待所有下载任务完成
      await Promise.all(downloadTasks);

      // 保存数据JSON文件（仅当用户明确配置了structure.data时才生成）
      if (structure.data && structure.data.trim()) {
        const dataTemplate = structure.data;
        // 判断是单文件还是每个数据项一个文件
        if (dataTemplate.includes('{index}')) {
          // 每个数据项一个JSON文件
          for (let i = 0; i < items.length; i++) {
            const dataPath = path.join(tempDir, this.parsePathTemplate(dataTemplate, items[i], i, undefined, timestamp));
            if (!path.extname(dataPath)) {
              const fullDataPath = `${dataPath}.json`;
              await fs.writeFile(fullDataPath, JSON.stringify(items[i], null, 2), 'utf-8');
            } else {
              await fs.writeFile(dataPath, JSON.stringify(items[i], null, 2), 'utf-8');
            }
          }
        } else {
          // 单个JSON文件包含所有数据
          const dataPath = path.join(tempDir, this.parsePathTemplate(dataTemplate, items[0] || {}, 0, undefined, timestamp));
          const finalDataPath = path.extname(dataPath) ? dataPath : `${dataPath}.json`;
          await fs.writeFile(finalDataPath, JSON.stringify(items, null, 2), 'utf-8');
        }
      }
      // 不再默认生成data.json，只有当用户明确配置了structure.data时才生成

      // 创建ZIP压缩文件
      const zipPath = outputPath;
      await this.createZipArchive(tempDir, zipPath);

      // 清理临时目录
      await this.cleanupDirectory(tempDir);

      this.logger.log(`打包完成: ${zipPath}`);
      return zipPath;
    } catch (error) {
      this.logger.error('打包失败:', error);
      // 清理临时目录
      try {
        await this.cleanupDirectory(tempDir);
      } catch (cleanupError) {
        this.logger.error('清理临时目录失败:', cleanupError);
      }
      throw error;
    }
  }

  /**
   * 创建ZIP压缩文件
   */
  private async createZipArchive(sourceDir: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // 确保输出目录存在
      const outputDir = path.dirname(outputPath);
      fs.mkdir(outputDir, { recursive: true }).then(() => {
        const output = fsSync.createWriteStream(outputPath);
        const archive = archiver('zip', {
          zlib: { level: 9 }, // 最高压缩级别
        });

        output.on('close', () => {
          this.logger.log(`ZIP文件创建完成，大小: ${archive.pointer()} 字节`);
          resolve();
        });

        archive.on('error', (err) => {
          reject(err);
        });

        archive.pipe(output);

        // 添加目录中的所有文件到ZIP
        archive.directory(sourceDir, false);

        archive.finalize();
      }).catch(reject);
    });
  }

  /**
   * 清理目录
   */
  private async cleanupDirectory(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      this.logger.warn(`清理目录失败 ${dirPath}:`, error.message);
    }
  }
}

