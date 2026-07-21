module.exports = {
  testEnvironment: 'node',
  roots: [
    '<rootDir>/test',
    '<rootDir>/packages',
    '<rootDir>/services',
    '<rootDir>/infra2',
  ],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@chum7/contracts$': '<rootDir>/packages/contracts/src/index.ts',
    '^@chum7/core$': '<rootDir>/packages/core/src/index.ts',
    '^@chum7/api-kit$': '<rootDir>/packages/api-kit/src/index.ts',
    '^@chum7/web-kit$': '<rootDir>/packages/web-kit/src/index.ts',
  },
};
