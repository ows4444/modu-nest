import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as Record<string, any>;
        message = responseObj.message || message;
        details = responseObj;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      
      // Log the full error details in development
      if (process.env.NODE_ENV === 'development') {
        details = {
          stack: exception.stack,
          name: exception.name,
        };
      }
    }

    // Log error details
    this.logger.error(
      `${request.method} ${request.url} ${status} - ${message}`,
      {
        exception: exception instanceof Error ? exception.stack : exception,
        requestId: request.headers['x-request-id'],
        userAgent: request.headers['user-agent'],
        ip: request.ip,
        body: request.body,
        query: request.query,
        params: request.params,
      }
    );

    const errorResponse = {
      statusCode: status,
      message,
      error: HttpStatus[status],
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId: request.headers['x-request-id'],
      ...(details && process.env.NODE_ENV === 'development' && { details }),
    };

    response.status(status).json(errorResponse);
  }
}