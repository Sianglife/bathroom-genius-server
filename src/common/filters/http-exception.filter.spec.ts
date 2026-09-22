import { HttpExceptionFilter } from './http-exception.filter';
import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockArgumentsHost: ArgumentsHost;
  let mockStatusFn: jest.Mock;
  let mockJsonFn: jest.Mock;
  let mockGetResponseFn: jest.Mock;
  let mockGetRequestFn: jest.Mock;

  beforeEach(() => {
    filter = new HttpExceptionFilter();

    mockJsonFn = jest.fn();
    mockStatusFn = jest.fn().mockReturnValue({ json: mockJsonFn });

    mockGetResponseFn = jest.fn().mockReturnValue({
      status: mockStatusFn,
    });

    mockGetRequestFn = jest.fn().mockReturnValue({
      url: '/test-path',
    });

    mockArgumentsHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: mockGetResponseFn,
        getRequest: mockGetRequestFn,
      }),
    } as unknown as ArgumentsHost;
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should handle HttpException with string response', () => {
    const exception = new HttpException(
      'Custom Not Found',
      HttpStatus.NOT_FOUND,
    );

    filter.catch(exception, mockArgumentsHost);

    expect(mockStatusFn).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockJsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        path: '/test-path',
        message: 'Custom Not Found',
        timestamp: expect.any(String),
      }),
    );
  });

  it('should handle HttpException with object response containing message array', () => {
    const exception = new HttpException(
      { statusCode: 400, message: ['field must be a string'] },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockArgumentsHost);

    expect(mockStatusFn).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockJsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        path: '/test-path',
        message: ['field must be a string'],
        timestamp: expect.any(String),
      }),
    );
  });

  it('should handle HttpException with object response without message property', () => {
    const exception = new HttpException(
      { error: 'custom_error_code' },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockArgumentsHost);

    expect(mockStatusFn).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockJsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        path: '/test-path',
        message: JSON.stringify({ error: 'custom_error_code' }),
        timestamp: expect.any(String),
      }),
    );
  });

  it('should handle generic Error and return 500 status', () => {
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    const exception = new Error('Database connection failed');

    filter.catch(exception, mockArgumentsHost);

    expect(mockStatusFn).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockJsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        path: '/test-path',
        message: 'Database connection failed',
        timestamp: expect.any(String),
      }),
    );
    expect(loggerSpy).toHaveBeenCalledWith(
      'Unhandled Exception: Database connection failed',
      exception.stack,
    );
    loggerSpy.mockRestore();
  });
});
