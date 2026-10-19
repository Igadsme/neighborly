module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  testPathIgnorePatterns: ['/\\._[^/]*$'],
  modulePathIgnorePatterns: ['/\\._[^/]*$'],
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  collectCoverageFrom: ['**/*.ts', '!**/._*'],
  coveragePathIgnorePatterns: ['/node_modules/', '\\.module\\.ts$']
}
