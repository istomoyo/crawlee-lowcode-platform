import request from "./request";

// 任务列表 / 查询参数
export interface TaskParams {
  status?: number;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

// 任务对象
export interface TaskItem {
  id: number;
  title: string;
  description?: string;
  status: 0 | 1 | 2; // 0=待办,1=进行中,2=完成
  createdAt: string;
  updatedAt: string;
}

// 获取任务列表
export function getTaskListApi(params?: TaskParams) {
  return request.get<TaskItem[]>("/task", { params });
}

// 获取任务详情
export function getTaskDetailApi(id: number) {
  return request.get<TaskItem>(`/task/${id}`);
}

// 创建任务
export interface CreateTaskParams {
  title: string;
  description?: string;
  status?: 0 | 1 | 2;
}
export function createTaskApi(data: CreateTaskParams) {
  return request.post("/task", data);
}

// 更新任务
export interface UpdateTaskParams {
  title?: string;
  description?: string;
  status?: 0 | 1 | 2;
}
export function updateTaskApi(id: number, data: UpdateTaskParams) {
  return request.patch(`/task/${id}`, data);
}

// 删除任务
export function deleteTaskApi(id: number) {
  return request.delete(`/task/${id}`);
}
