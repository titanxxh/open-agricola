import { PostgresDatabase } from '../database/postgres'

/** One bounded connection per collector, independent of the game command pool. */
export const createObservationDatabase = () => new PostgresDatabase({
  connectionString: process.env.DATABASE_URL,
  schema: process.env.DATABASE_SCHEMA,
  max: 1,
  connectionTimeoutMillis: 1000,
  statement_timeout: 2000,
})
