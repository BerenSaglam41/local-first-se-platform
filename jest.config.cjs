// tests/vfs_slicer.test.ts is the one suite that loads the real tree-sitter native C++ addon
// (every other suite either avoids it entirely or mocks it — see the rationale already
// documented in tests/bootstrap.test.ts and tests/knowledge.test.ts). Running --runInBand puts
// every test file in one shared process; tree-sitter's native binding does not tolerate the
// cumulative native allocations from 260+ unrelated tests sharing that process, and intermittently
// (empirically ~20-40% of full-suite runs) starts returning empty/corrupted parse trees. It is
// excluded from this config and run as its own isolated process — see jest.vfs.config.cjs and the
// combined `test`/`test:coverage` npm scripts.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/vfs_slicer\\.test\\.ts$'],
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
