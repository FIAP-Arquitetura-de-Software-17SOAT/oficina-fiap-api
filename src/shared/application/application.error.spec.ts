import { ApplicationError, ApplicationErrorKind } from './application.error';

class SampleError extends ApplicationError {
  constructor(code: string, kind: ApplicationErrorKind, message: string) {
    super(code, kind, message);
  }
}

describe('ApplicationError', () => {
  it('carries code, kind and message and takes the subclass name', () => {
    const error = new SampleError('SAMPLE_NOT_FOUND', 'NOT_FOUND', 'Sample');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error.code).toBe('SAMPLE_NOT_FOUND');
    expect(error.kind).toBe('NOT_FOUND');
    expect(error.message).toBe('Sample');
    expect(error.name).toBe('SampleError');
  });
});
