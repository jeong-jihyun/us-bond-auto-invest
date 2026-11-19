module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'],
  testTimeout: 60000,
  transform: { '^.+\\.ts$': ['ts-jest', { diagnostics: false }] },
};
