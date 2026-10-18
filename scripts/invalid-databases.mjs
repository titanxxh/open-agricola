/**
 * DROP DATABASE marks a database invalid before removing it. If the statement is
 * cancelled, the database stays invalid: nobody can connect to it, and it stops
 * autovacuum across the whole cluster. Finish those drops on `client`'s cluster.
 */
export async function dropInvalidDatabases(client, log = console.warn) {
  // Each DROP waits for a checkpoint; another cancellation would repeat the damage.
  await client.query('SET statement_timeout = 0')
  const { rows } = await client.query('SELECT datname FROM pg_database WHERE datconnlimit = -2 ORDER BY datname')
  for (const { datname } of rows) {
    log(`[services] dropping invalid database "${datname}" left by an interrupted DROP DATABASE`)
    await client.query(`DROP DATABASE IF EXISTS "${datname.replaceAll('"', '""')}"`)
  }
  return rows.map(row => row.datname)
}
