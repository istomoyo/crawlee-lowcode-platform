import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ExecutionService } from './execution.service';
import { CreateExecutionDto } from './dto/create-execution.dto';
import { UpdateExecutionDto } from './dto/update-execution.dto';

@Controller('execution')
export class ExecutionController {
  constructor(private readonly executionService: ExecutionService) {}

  @Post()
  create(@Body() createExecutionDto: CreateExecutionDto) {
    return this.executionService.create(createExecutionDto);
  }

  @Get()
  findAll() {
    return this.executionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.executionService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateExecutionDto: UpdateExecutionDto) {
    return this.executionService.update(+id, updateExecutionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.executionService.remove(+id);
  }
}
