module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.spec.ts', '**/?(*.)+(spec|test).ts'],
  clearMocks: true,
  restoreMocks: true,
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts']
};
