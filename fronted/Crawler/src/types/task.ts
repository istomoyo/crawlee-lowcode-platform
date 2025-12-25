export type TaskItem = {
  name: string;
  url: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  progress: number;
  lastExecutionTime: string | null;
  createdAt: string;
  endTime: string | null;
  screenshotPath?: string;
  latestExecution: {
    status: string;
    log: string;
    startTime: string;
    endTime: string | null;
    resultPath?: string;
  } | null;
};
