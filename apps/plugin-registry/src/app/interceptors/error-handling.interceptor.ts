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
import { catchError } from 'rxjs/operators';

@Injectable()
export class ErrorHandlingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ErrorHandlingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((error) => {
        const request = context.switchToHttp().getRequest();

        // Log the error with context
        this.logger.error(`Error in ${request.method} ${request.url}`, error.stack || error.message);

        // Handle different types of errors
        if (error instanceof HttpException) {
          return throwError(() => error);
        }

        // Handle validation errors
        if (error.name === 'ValidationError') {
          return throwError(
            () =>
              new HttpException(
                {
                  statusCode: HttpStatus.BAD_REQUEST,
                  message: 'Validation failed',
                  errors: error.details || error.message,
                  timestamp: new Date().toISOString(),
                  path: request.url,
                },
                HttpStatus.BAD_REQUEST
              )
          );
        }

        // Handle multer errors (file upload)
        if (error.code === 'LIMIT_FILE_SIZE') {
          return throwError(
            () =>
              new HttpException(
                {
                  statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
                  message: 'File too large',
                  error: 'File size exceeds the maximum allowed limit',
                  timestamp: new Date().toISOString(),
                  path: request.url,
                },
                HttpStatus.PAYLOAD_TOO_LARGE
              )
          );
        }

        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
          return throwError(
            () =>
              new HttpException(
                {
                  statusCode: HttpStatus.BAD_REQUEST,
                  message: 'Invalid file upload',
                  error: 'Unexpected file field or file type',
                  timestamp: new Date().toISOString(),
                  path: request.url,
                },
                HttpStatus.BAD_REQUEST
              )
          );
        }

        // Handle file system errors
        if (error.code === 'ENOENT') {
          return throwError(
            () =>
              new HttpException(
                {
                  statusCode: HttpStatus.NOT_FOUND,
                  message: 'Resource not found',
                  error: 'The requested file or directory was not found',
                  timestamp: new Date().toISOString(),
                  path: request.url,
                },
                HttpStatus.NOT_FOUND
              )
          );
        }

        if (error.code === 'ENOSPC') {
          return throwError(
            () =>
              new HttpException(
                {
                  statusCode: HttpStatus.INSUFFICIENT_STORAGE,
                  message: 'Storage full',
                  error: 'Not enough storage space available',
                  timestamp: new Date().toISOString(),
                  path: request.url,
                },
                HttpStatus.INSUFFICIENT_STORAGE
              )
          );
        }

        // Handle generic errors
        return throwError(
          () =>
            new HttpException(
              {
                statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                message: 'Internal server error',
                error: error.message || 'An unexpected error occurred',
                timestamp: new Date().toISOString(),
                path: request.url,
              },
              HttpStatus.INTERNAL_SERVER_ERROR
            )
        );
      })
    );
  }
}
