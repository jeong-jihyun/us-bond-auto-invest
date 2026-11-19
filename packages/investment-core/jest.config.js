module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: { strict: true, esModuleInterop: true, target: 'ES2020', module: 'commonjs' }, diagnostics: false }] },
};
