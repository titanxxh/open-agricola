import { AsyncLocalStorage } from 'node:async_hooks'
import { Pool, types, type PoolClient, type PoolConfig, type QueryResultRow } from 'pg'

type Transaction = { client: PoolClient; active: boolean; savepoint: number }
export type WriteResult = { changes: number }

/** Bind values only. Quoted SQL and comments are never interpreted as parameters. */
const parameters = (sql: string, args: unknown[]): { sql: string; values: unknown[] } => {
  const values: unknown[] = []
  let position = 0
  const names = new Map<string, number>()
  const text = sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\?|@([a-zA-Z_]\w*)/g, (match, name: string | undefined) => {
    if (match !== '?' && !name) return match
    if (name) {
      const bindings = args[0]
      if (args.length !== 1 || !bindings || typeof bindings !== 'object' || !Object.hasOwn(bindings, name)) {
        throw new Error(`Missing SQL binding: ${name}`)
      }
      if (!names.has(name)) {
        values.push((bindings as Record<string, unknown>)[name])
        names.set(name, values.length)
      }
      return `$${names.get(name)}`
    }
    if (position >= args.length) throw new Error('Missing positional SQL binding')
    values.push(args[position++])
    return `$${values.length}`
  })
  return { sql: text, values: text === sql ? args : values }
}

const safeInteger = (value: string): number => {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error('Database integer exceeds the safe integer range')
  return parsed
}

/** One asynchronous database boundary; a transaction owns one connection across awaits. */
export class PostgresDatabase {
  private readonly pool: Pool
  private readonly current = new AsyncLocalStorage<Transaction>()

  constructor({ schema = 'public', ...config }: PoolConfig & { schema?: string }) {
    if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('Invalid database schema')
    this.pool = new Pool({
      max: 10,
      connectionTimeoutMillis: 10_000,
      statement_timeout: 30_000,
      ...config,
      options: `-c search_path=${schema},public`,
      types: { getTypeParser: (oid: number) => oid === 20 ? safeInteger : types.getTypeParser(oid) },
    })
  }

  async query<Row extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) {
    const transaction = this.current.getStore()
    if (transaction && !transaction.active) throw new Error('Query escaped its transaction')
    return (transaction?.client ?? this.pool).query<Row>(sql, values)
  }

  async exec(sql: string): Promise<void> {
    await this.query(sql)
  }

  prepare(sql: string) {
    const query = <Row extends QueryResultRow>(args: unknown[]) => {
      const bound = parameters(sql, args)
      return this.query<Row>(bound.sql, bound.values)
    }
    return {
      get: async <Row extends QueryResultRow = QueryResultRow>(...values: unknown[]): Promise<Row | undefined> =>
        (await query<Row>(values)).rows[0],
      all: async <Row extends QueryResultRow = QueryResultRow>(...values: unknown[]): Promise<Row[]> =>
        (await query<Row>(values)).rows,
      run: async (...values: unknown[]): Promise<WriteResult> =>
        ({ changes: (await query(values)).rowCount ?? 0 }),
    }
  }

  transaction<Args extends unknown[], Result>(work: (...args: Args) => Result) {
    return async (...args: Args): Promise<Awaited<Result>> => {
      const parent = this.current.getStore()
      if (parent) {
        if (!parent.active) throw new Error('Transaction already completed')
        const savepoint = `nested_${++parent.savepoint}`
        await parent.client.query(`SAVEPOINT ${savepoint}`)
        try {
          const result = await work(...args)
          await parent.client.query(`RELEASE SAVEPOINT ${savepoint}`)
          return result
        } catch (error) {
          await parent.client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`)
          await parent.client.query(`RELEASE SAVEPOINT ${savepoint}`)
          throw error
        }
      }
      const client = await this.pool.connect()
      const transaction = { client, active: true, savepoint: 0 }
      try {
        await client.query('BEGIN')
        const result = await this.current.run(transaction, () => work(...args))
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        transaction.active = false
        client.release()
      }
    }
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}
