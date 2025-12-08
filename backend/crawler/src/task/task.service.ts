// task.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { Repository, Like } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Task } from './entities/task.entity';

@Injectable()
export class TaskService {
  constructor(
    @InjectRepository(Task)
    private taskRepo: Repository<Task>,
  ) {}

  async getUserTasks(
    userId: number,
    params: { page: number; limit: number; search?: string; status?: string },
  ) {
    const { page, limit, search, status } = params;

    const where: any = { user: { id: userId } };
    if (search) where.name = Like(`%${search}%`);
    if (status) where.status = status;

    const [tasks, total] = await this.taskRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { total, page, limit, tasks };
  }

  async getAllTasks(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
  }) {
    const { page, limit, search, status } = params;

    const where: any = {};
    if (search) where.name = Like(`%${search}%`);
    if (status) where.status = status;

    const [tasks, total] = await this.taskRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['user'],
    });

    return { total, page, limit, tasks };
  }
}
