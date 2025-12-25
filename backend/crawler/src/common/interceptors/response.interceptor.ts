// src/common/interceptors/response.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { SUCCESS_MESSAGE } from '../decorators/success-message.decorator';

export interface ResponseFormat<T = any> {
  code: number;
  message: string;
  path: string;
  data: T;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ResponseFormat<T>
> {
  constructor(private reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ResponseFormat<T>> {
    const request = context.switchToHttp().getRequest();
    const path = request.url;

    const message = this.reflector.get<string>(
      SUCCESS_MESSAGE,
      context.getHandler(),
    );

    return next.handle().pipe(
      map((data) => ({
        code: 200,
        message: message || 'success',
        path,
        data,
      })),
    );
  }
}
