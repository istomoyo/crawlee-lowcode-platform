import { Injectable } from '@nestjs/common';
import { CreateExecutionDto } from './dto/create-execution.dto';
import { UpdateExecutionDto } from './dto/update-execution.dto';

@Injectable()
export class ExecutionService {
  create(createExecutionDto: CreateExecutionDto) {
    return 'This action adds a new execution';
  }

  findAll() {
    return `This action returns all execution`;
  }

  findOne(id: number) {
    return `This action returns a #${id} execution`;
  }

  update(id: number, updateExecutionDto: UpdateExecutionDto) {
    return `This action updates a #${id} execution`;
  }

  remove(id: number) {
    return `This action removes a #${id} execution`;
  }
}
