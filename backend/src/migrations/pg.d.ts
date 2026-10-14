/**
 * Minimal ambient types for the `pg` driver.
 *
 * `pg` is a production dependency, but `@types/pg` is not installed and is not
 * needed by application code — only by the migration upgrade tests, which use
 * the driver directly because `prisma db execute` discards result sets.
 *
 * Declaring only the surface those tests use keeps the dependency graph
 * unchanged while still type-checking the spec.
 */
declare module 'pg' {
  export interface QueryResultRow {
    [column: string]: unknown
  }

  export interface QueryResult<R extends QueryResultRow = QueryResultRow> {
    rows: R[]
    rowCount: number
  }

  export class Client {
    constructor(config: { connectionString: string })
    connect(): Promise<void>
    query<R extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: unknown[]
    ): Promise<QueryResult<R>>
    end(): Promise<void>
  }
}