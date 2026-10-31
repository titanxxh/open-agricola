import pg from 'pg'

export const accountsFunction = 'operations_account_metrics'
export const openingsFunction = 'operations_opening_metrics'

const identifier = (value: string) => '"' + value.replaceAll('"', '""') + '"'

const accountQuery = (schema: string) => `SELECT count(*)::integer AS total,
      count(*) FILTER (WHERE created_at >= extract(epoch FROM
        (date_trunc('day', to_timestamp($1 / 1000.0) AT TIME ZONE 'Asia/Singapore') AT TIME ZONE 'Asia/Singapore'))*1000)::integer AS today,
      count(*) FILTER (WHERE created_at >= $1-86400000)::integer AS last_24h,
      count(*) FILTER (WHERE created_at >= $1-604800000)::integer AS last_7d
      FROM ${schema}.users`

const openingQuery = (schema: string) => `
WITH tracking AS (
  SELECT tracking_since FROM ${schema}.game_opening_tracking WHERE singleton
), windows(period, since) AS (
  VALUES ('today', extract(epoch FROM
    (date_trunc('day', to_timestamp($1::double precision / 1000) AT TIME ZONE 'Asia/Singapore') AT TIME ZONE 'Asia/Singapore')) * 1000),
    ('last_24h', $1::bigint - 86400000), ('last_7d', $1::bigint - 604800000)
), modes(mode) AS (
  VALUES ('all'), ('solo'), ('hotseat'), ('multiplayer'), ('unknown')
), facts AS MATERIALIZED (
  SELECT f.*, c.created_at, c.lifecycle FROM ${schema}.game_opening_facts f
    JOIN ${schema}.game_contexts c USING(room_id) CROSS JOIN tracking t
    WHERE f.started_at >= greatest(t.tracking_since, $1::bigint-2592000000) AND f.started_at <= $1
), cohorts(cohort, since) AS (
  VALUES ('last_7d', $1::bigint - 604800000), ('last_30d', $1::bigint - 2592000000)
), eligible AS MATERIALIZED (
  SELECT c.cohort, u.id, u.created_at FROM cohorts c CROSS JOIN tracking t
    JOIN ${schema}.users u ON u.created_at >= greatest(c.since, t.tracking_since) AND u.created_at <= $1::bigint - 86400000
), durations AS MATERIALIZED (
  SELECT w.period, 'waiting' AS stage, (f.started_at-f.created_at)/1000.0 AS seconds
    FROM windows w JOIN facts f ON f.started_at >= w.since
    WHERE f.origin='live' AND f.created_at<=f.started_at
  UNION ALL
  SELECT w.period, 'preparation', (f.playing_at-f.started_at)/1000.0
    FROM windows w JOIN facts f ON f.started_at >= w.since
    WHERE f.origin='live' AND f.playing_at>=f.started_at AND f.playing_at<=$1
), duration_stats AS (
  SELECT w.period, s.stage, count(d.seconds) AS samples,
    percentile_cont(0.5) WITHIN GROUP(ORDER BY d.seconds) AS p50,
    percentile_cont(0.9) WITHIN GROUP(ORDER BY d.seconds) AS p90
    FROM windows w CROSS JOIN (VALUES ('waiting'),('preparation')) s(stage)
    LEFT JOIN durations d ON d.period=w.period AND d.stage=s.stage
    GROUP BY w.period,s.stage
), samples AS (
  SELECT 'agricola_opening_tracking_since_unixtime' AS name, '{}'::jsonb AS labels, tracking_since/1000.0 AS value FROM tracking
  UNION ALL
  SELECT 'agricola_opening_games', jsonb_build_object('window',w.period,'mode',m.mode), count(f.room_id)::numeric
    FROM windows w CROSS JOIN modes m LEFT JOIN facts f ON f.started_at>=w.since AND (m.mode='all' OR f.mode=m.mode)
    GROUP BY w.period,m.mode
  UNION ALL
  SELECT 'agricola_opening_accounts', jsonb_build_object('window',w.period,'mode',m.mode), count(DISTINCT a.user_id)::numeric
    FROM windows w CROSS JOIN modes m LEFT JOIN facts f ON f.started_at>=w.since AND (m.mode='all' OR f.mode=m.mode)
    LEFT JOIN ${schema}.game_opening_accounts a USING(room_id) GROUP BY w.period,m.mode
  UNION ALL
  SELECT 'agricola_opening_current',jsonb_build_object('stage',s.stage,'presence',p.presence,'mode',m.mode),count(o.stage)::numeric
    FROM modes m CROSS JOIN (VALUES ('waiting'),('color_confirmation'),('parent_selection'),('draft'),('solo_hand_selection'),('playing'),('unknown')) s(stage)
    CROSS JOIN (VALUES ('online'),('retained')) p(presence)
    LEFT JOIN ${schema}.operations_current_openings o ON o.stage=s.stage AND o.presence=p.presence AND (m.mode='all' OR o.mode=m.mode)
    GROUP BY m.mode,s.stage,p.presence
  UNION ALL
  SELECT 'agricola_opening_conversion', jsonb_build_object('cohort',c.cohort,'milestone',m.milestone), count(e.id) FILTER (
    WHERE m.milestone='eligible' OR EXISTS (
      SELECT 1 FROM ${schema}.game_opening_accounts a JOIN facts f USING(room_id)
        WHERE a.user_id=e.id AND CASE WHEN m.milestone='started_24h' THEN f.started_at ELSE f.playing_at END
          BETWEEN e.created_at AND e.created_at+86400000
    ))::numeric
    FROM cohorts c CROSS JOIN (VALUES ('eligible'),('started_24h'),('playing_24h')) m(milestone)
    LEFT JOIN eligible e ON e.cohort=c.cohort GROUP BY c.cohort,m.milestone
  UNION ALL
  SELECT 'agricola_opening_duration_samples',jsonb_build_object('window',period,'stage',stage),samples::numeric FROM duration_stats
  UNION ALL
  SELECT 'agricola_opening_duration_seconds',jsonb_build_object('window',d.period,'stage',d.stage,'quantile',q.quantile),q.value::numeric
    FROM duration_stats d CROSS JOIN LATERAL (VALUES ('0.5',d.p50),('0.9',d.p90)) q(quantile,value) WHERE d.samples>0
  UNION ALL
  SELECT 'agricola_opening_outcomes',jsonb_build_object('window',w.period,'mode',m.mode,'outcome',o.outcome),count(f.room_id)::numeric
    FROM windows w CROSS JOIN modes m CROSS JOIN (VALUES ('active'),('completed'),('terminated'),('expired'),('removed')) o(outcome)
    LEFT JOIN facts f ON f.started_at>=w.since AND f.lifecycle=o.outcome AND (m.mode='all' OR f.mode=m.mode)
    GROUP BY w.period,m.mode,o.outcome
  UNION ALL
  SELECT 'agricola_opening_seats',jsonb_build_object('window',w.period,'seats',s.seats::text),count(f.room_id)::numeric
    FROM windows w CROSS JOIN generate_series(1,6) s(seats) LEFT JOIN facts f ON f.started_at>=w.since AND f.seat_count=s.seats
    GROUP BY w.period,s.seats
  UNION ALL
  SELECT 'agricola_opening_variants',jsonb_build_object('window',w.period,'variant',v.variant),count(f.room_id) FILTER(WHERE
    CASE v.variant WHEN 'parent_cards' THEN f.parent_cards WHEN 'through_the_seasons' THEN f.through_the_seasons
      WHEN 'farmers_of_the_moor' THEN f.farmers_of_the_moor WHEN 'snake_opening' THEN f.snake_opening
      WHEN 'moor_balance_rules' THEN f.moor_balance_rules WHEN 'community_deck' THEN f.community_deck END)::numeric
    FROM windows w CROSS JOIN (VALUES ('parent_cards'),('through_the_seasons'),('farmers_of_the_moor'),('snake_opening'),('moor_balance_rules'),('community_deck')) v(variant)
    LEFT JOIN facts f ON f.started_at>=w.since GROUP BY w.period,v.variant
)
SELECT name,labels,value FROM samples ORDER BY name,labels::text`

export async function provisionOperationsDatabase({ databaseUrl, password, schema = 'public', role = 'agricola_operations_accounts' }: {
  databaseUrl: string; password: string; schema?: string; role?: string
}): Promise<{ databaseUrl: string; schema: string; role: string }> {
  if (!/^[a-f0-9]{64}$/.test(password) || !/^[a-z_][a-z0-9_]{0,62}$/.test(schema) || !/^[a-z_][a-z0-9_]{0,62}$/.test(role)) {
    throw new Error('Invalid operations database provisioning input')
  }
  const readerUrl = new URL(databaseUrl)
  readerUrl.username = role
  readerUrl.password = password
  const client = new pg.Client({ connectionString: databaseUrl, statement_timeout: 5000, options: '-c jit=off -c search_path=pg_catalog' })
  const target = identifier(schema)
  const reader = identifier(role)
  let transaction = false
  try {
    await client.connect()
    await client.query('BEGIN')
    transaction = true
    await client.query("SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('operations-provision:'||current_database(), 0))")
    const identity = await client.query<{ owner: string; database: string }>('SELECT current_user AS owner,current_database() AS database')
    const owner = identity.rows[0]
    if (!owner || owner.owner === role) throw new Error('Operations reader cannot be the database provisioning owner')
    const existing = await client.query('SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=$1', [role])
    if (!existing.rowCount) await client.query(`CREATE ROLE ${reader} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`)
    const owned = await client.query(`SELECT 1 FROM pg_catalog.pg_shdepend d
      JOIN pg_catalog.pg_roles r ON r.oid=d.refobjid
      WHERE d.refclassid='pg_catalog.pg_authid'::pg_catalog.regclass AND d.deptype='o' AND r.rolname=$1 LIMIT 1`, [role])
    if (owned.rowCount) throw new Error('Operations reader must not own database objects')
    await client.query(`ALTER ROLE ${reader} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`)
    await client.query(`ALTER ROLE ${reader} SET default_transaction_read_only=on`)
    const memberships = await client.query<{ role: string }>(`SELECT parent.rolname AS role FROM pg_catalog.pg_auth_members m
      JOIN pg_catalog.pg_roles parent ON parent.oid=m.roleid
      JOIN pg_catalog.pg_roles member ON member.oid=m.member WHERE member.rolname=$1`, [role])
    for (const membership of memberships.rows) await client.query(`REVOKE ${identifier(membership.role)} FROM ${reader}`)
    const remainingMemberships = await client.query(`SELECT 1 FROM pg_catalog.pg_auth_members m
      JOIN pg_catalog.pg_roles member ON member.oid=m.member WHERE member.rolname=$1 LIMIT 1`, [role])
    if (remainingMemberships.rowCount) throw new Error('Operations reader still has role memberships')
    await client.query(`REVOKE ALL PRIVILEGES ON SCHEMA ${target} FROM ${reader}`)
    await client.query(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${target} FROM ${reader}`)
    const columns = await client.query<{ relation: string; columns: string[] }>(`SELECT c.relname AS relation,
      pg_catalog.array_agg(a.attname::text ORDER BY a.attnum) AS columns
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
      WHERE n.nspname=$1 AND c.relkind IN ('r','p','v','m','f') GROUP BY c.oid,c.relname`, [schema])
    for (const relation of columns.rows) {
      await client.query(`REVOKE ALL PRIVILEGES (${relation.columns.map(identifier).join(',')}) ON TABLE ${target}.${identifier(relation.relation)} FROM ${reader}`)
    }
    const exposed = await client.query(`SELECT 1
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
      WHERE n.nspname=$1 AND c.relkind IN ('r','p','v','m','f')
        AND pg_catalog.has_column_privilege($2,c.oid,a.attnum,'SELECT') LIMIT 1`, [schema, role])
    if (exposed.rowCount) throw new Error('Operations reader still has raw data access through shared privileges')
    const writableSchema = await client.query<{ writable: boolean }>("SELECT pg_catalog.has_schema_privilege($1,$2,'CREATE') AS writable", [role, schema])
    if (writableSchema.rows[0]?.writable) throw new Error('Operations reader must not create database objects')
    const openingRelations = await client.query<{ available: boolean }>(`SELECT pg_catalog.bool_and(pg_catalog.to_regclass(pg_catalog.format('%I.%I',$1::text,relation)) IS NOT NULL) AS available
      FROM (VALUES ('game_opening_facts'),('game_opening_accounts'),('game_opening_tracking'),('game_contexts'),('users'),('operations_current_openings')) required(relation)`, [schema])
    const openingsAvailable = openingRelations.rows[0]?.available === true
    await client.query(`CREATE OR REPLACE FUNCTION ${target}.${accountsFunction}(bigint)
      RETURNS TABLE(total integer,today integer,last_24h integer,last_7d integer)
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
      AS $metrics$${accountQuery(target)}$metrics$`)
    const openingBody = openingsAvailable
      ? `LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $metrics$${openingQuery(target)}$metrics$`
      : `LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $metrics$
          BEGIN RAISE EXCEPTION 'Opening tracking coverage is unavailable' USING ERRCODE='55000'; END $metrics$`
    await client.query(`CREATE OR REPLACE FUNCTION ${target}.${openingsFunction}(bigint)
      RETURNS TABLE(name text,labels jsonb,value numeric) ${openingBody}`)
    for (const name of [accountsFunction, openingsFunction]) {
      await client.query(`REVOKE ALL PRIVILEGES ON FUNCTION ${target}.${name}(bigint) FROM PUBLIC`)
      await client.query(`GRANT EXECUTE ON FUNCTION ${target}.${name}(bigint) TO ${reader}`)
    }
    const connection = await client.query<{ allowed: boolean }>("SELECT pg_catalog.has_database_privilege($1,$2,'CONNECT') AS allowed", [role, owner.database])
    if (!connection.rows[0]?.allowed) await client.query(`GRANT CONNECT ON DATABASE ${identifier(owner.database)} TO ${reader}`)
    await client.query(`GRANT USAGE ON SCHEMA ${target} TO ${reader}`)
    await client.query(`SET LOCAL ROLE ${reader}`)
    const observedAt = Date.now()
    await client.query(`SELECT * FROM ${target}.${accountsFunction}($1)`, [observedAt])
    if (openingsAvailable) await client.query(`SELECT * FROM ${target}.${openingsFunction}($1)`, [observedAt])
    await client.query('RESET ROLE')
    await client.query('COMMIT')
    transaction = false
    return { databaseUrl: readerUrl.toString(), schema, role }
  } catch (error) {
    if (transaction) await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }
}
