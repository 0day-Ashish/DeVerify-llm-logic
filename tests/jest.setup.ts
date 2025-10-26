// Global Jest setup for unit tests
// By default, mock ioredis and bullmq to avoid real TCP connections during unit tests.
// To opt-out (e.g., for integration tests), set TEST_USE_REAL_REDIS=1.

if (process.env.TEST_USE_REAL_REDIS !== '1') {
  jest.mock('ioredis');
  jest.mock('bullmq');
}
