module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.test.js'],
  testTimeout: 30000,
  globalSetup: '<rootDir>/test/globalSetup.js',
  verbose: true,
};