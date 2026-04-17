export type TaskStatus =
  | "pending"
  | "running"
  | "stopping"
  | "success"
  | "failed";

export type TaskItem = {
  id: number;
  name: string;
  url: string;
  status: TaskStatus;
  progress: number;
  config?: string;
  script?: string;
  folder?: string | null;
  tags?: string[];
  isFavorite?: boolean;
  lastExecutionTime: string | null;
  createdAt: string;
  endTime: string | null;
  screenshotPath?: string;
  latestExecution: {
    id: number;
    status: string;
    log: string;
    startTime: string;
    endTime: string | null;
    resultPath?: string;
  } | null;
};
