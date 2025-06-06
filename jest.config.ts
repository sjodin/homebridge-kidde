/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.js$': 'babel-jest', // Ensure Jest understands JavaScript
  },
  moduleNameMapper: {
    '^(\\./.*)\\.js$': '$1', // Remove .js in Jest environment
  },
};
