// Dedicated, isolated config for tests/vfs_slicer.test.ts — see the explanation in
// jest.config.cjs. This file intentionally has no testPathIgnorePatterns for it; running it as
// its own separate `jest` invocation (own process) is what gives the real tree-sitter native
// addon a clean process instead of one shared with 260+ other tests.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/vfs_slicer.test.ts'],
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  moduleNameMapper: {
    '^uuid$': require.resolve('uuid'),
    '^(\\.\\.?/.*)\\.js$': '$1',
  },
};
