import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class StandardErrorHandlingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(StandardErrorHandlingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        this.logger.log(`${request.method} ${request.url} ${response.statusCode} - ${duration}ms`);
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;

        // Log the error with context
        this.logger.error(`${request.method} ${request.url} - ${error.message}`, {
          error: error.stack,
          requestId: request.headers['x-request-id'],
          userAgent: request.headers['user-agent'],
          ip: request.ip,
          duration,
        });

        // Ensure we have a proper HTTP exception
        if (error instanceof HttpException) {
          return throwError(() => error);
        }

        // Convert unknown errors to internal server error
        const httpError = new HttpException(
          {
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error',
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            timestamp: new Date().toISOString(),
            path: request.url,
          },
          HttpStatus.INTERNAL_SERVER_ERROR
        );

        return throwError(() => httpError);
      })
    );
  }
}
