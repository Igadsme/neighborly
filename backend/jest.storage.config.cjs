module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  // Storage integration specs: they need both a disposable PostgreSQL and a
  // live S3-compatible object store. Run via scripts/run-storage-tests.sh.
  testRegex: '.*\\.(storage\\.)?integration\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/\\._'],
  testTimeout: 30000
}
