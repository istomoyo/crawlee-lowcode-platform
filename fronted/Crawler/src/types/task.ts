export type TaskItem = {
  id: number; // 任务ID，用于唯一标识
  name: string;
  url: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  progress: number;
  config?: string; // JSON配置字符串
  script?: string; // 爬虫脚本
  lastExecutionTime: string | null;
  createdAt: string;
  endTime: string | null;
  screenshotPath?: string;
  latestExecution: {
    id: number; // 执行ID，用于打包等操作
    status: string;
    log: string;
    startTime: string;
    endTime: string | null;
    resultPath?: string;
  } | null;
};
