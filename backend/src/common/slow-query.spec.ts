import { noteSlowQuery } from './slow-query'

describe('noteSlowQuery', () => {
  it('logs the statement and duration once the threshold is crossed', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    noteSlowQuery({ duration: 10, query: 'SELECT 1' }, 200)
    expect(warn).not.toHaveBeenCalled()
    noteSlowQuery({ duration: 250, query: 'SELECT "User"."id" FROM "User" WHERE "User"."id" = $1' }, 200)
    const line = String(warn.mock.calls[0][0])
    expect(line).toContain('slow_query')
    expect(line).toContain('SELECT')
    expect(line).not.toContain('params')
    warn.mockRestore()
  })
})
