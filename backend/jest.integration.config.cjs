module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.integration\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/\\._'],
  // Integration tests talk to a disposable local PostgreSQL.
  testTimeout: 30000
}
