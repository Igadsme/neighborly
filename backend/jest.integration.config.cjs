module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.integration\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  // Storage specs are excluded here: they need a live object store and run
  // through scripts/run-storage-tests.sh instead.
  // `*.storage.integration.spec.ts` needs a live object store and runs through
  // scripts/run-storage-tests.sh.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/\\._',
    'storage\\.integration\\.spec\\.ts$'
  ],
  // Integration tests talk to a disposable local PostgreSQL.
  testTimeout: 30000
}
