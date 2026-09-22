import { ExecutionContext } from '@nestjs/common';
import { getCurrentUserByContext } from './current-user.decorator';

describe('CurrentUser Decorator', () => {
  const createMockContext = (user?: any): ExecutionContext => {
    const request = { user };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  it('should return undefined if req.user is not set', () => {
    const context = createMockContext(undefined);
    const result = getCurrentUserByContext(undefined, context);
    expect(result).toBeUndefined();
  });

  it('should return the whole user object if no data parameter is passed', () => {
    const mockUser = { userId: '123', username: 'john_doe' };
    const context = createMockContext(mockUser);
    const result = getCurrentUserByContext(undefined, context);
    expect(result).toEqual(mockUser);
  });

  it('should return a specific user field if data parameter is provided', () => {
    const mockUser = { userId: '123', username: 'john_doe' };
    const context = createMockContext(mockUser);

    const userId = getCurrentUserByContext('userId', context);
    const username = getCurrentUserByContext('username', context);

    expect(userId).toBe('123');
    expect(username).toBe('john_doe');
  });

  it('should return undefined if specific user field does not exist', () => {
    const mockUser = { userId: '123' };
    const context = createMockContext(mockUser);

    const nonExistent = getCurrentUserByContext('email', context);
    expect(nonExistent).toBeUndefined();
  });
});
