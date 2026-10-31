import type { Pool } from 'pg'

export type OpeningSample = { name: string; labels: Record<string, string>; value: number }
type OpeningRow = { name: string; labels: Record<string, string>; value: number | string | null }

const openingQuery = `
WITH tracking AS (
  SELECT tracking_since FROM game_opening_tracking WHERE singleton
), windows(period, since) AS (
  VALUES ('today', extract(epoch FROM
    (date_trunc('day', to_timestamp($1::double precision / 1000) AT TIME ZONE 'Asia/Singapore') AT TIME ZONE 'Asia/Singapore')) * 1000),
    ('last_24h', $1::bigint - 86400000), ('last_7d', $1::bigint - 604800000)
), modes(mode) AS (
  VALUES ('all'), ('solo'), ('hotseat'), ('multiplayer'), ('unknown')
), facts AS MATERIALIZED (
  SELECT f.*, c.created_at, c.lifecycle FROM game_opening_facts f
    JOIN game_contexts c USING(room_id) CROSS JOIN tracking t
    WHERE f.started_at >= greatest(t.tracking_since, $1::bigint-2592000000) AND f.started_at <= $1
), cohorts(cohort, since) AS (
  VALUES ('last_7d', $1::bigint - 604800000), ('last_30d', $1::bigint - 2592000000)
), eligible AS MATERIALIZED (
  SELECT c.cohort, u.id, u.created_at FROM cohorts c CROSS JOIN tracking t
    JOIN users u ON u.created_at >= greatest(c.since, t.tracking_since) AND u.created_at <= $1::bigint - 86400000
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
    LEFT JOIN game_opening_accounts a USING(room_id) GROUP BY w.period,m.mode
  UNION ALL
  SELECT 'agricola_opening_current',jsonb_build_object('stage',s.stage,'presence',p.presence,'mode',m.mode),count(o.stage)::numeric
    FROM modes m CROSS JOIN (VALUES ('waiting'),('color_confirmation'),('parent_selection'),('draft'),('solo_hand_selection'),('playing'),('unknown')) s(stage)
    CROSS JOIN (VALUES ('online'),('retained')) p(presence)
    LEFT JOIN operations_current_openings o ON o.stage=s.stage AND o.presence=p.presence AND (m.mode='all' OR o.mode=m.mode)
    GROUP BY m.mode,s.stage,p.presence
  UNION ALL
  SELECT 'agricola_opening_conversion', jsonb_build_object('cohort',c.cohort,'milestone',m.milestone), count(e.id) FILTER (
    WHERE m.milestone='eligible' OR EXISTS (
      SELECT 1 FROM game_opening_accounts a JOIN facts f USING(room_id)
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
SELECT name,labels,value FROM samples ORDER BY name,labels::text
`

export async function collectOpeningMetrics(pool: Pick<Pool, 'query'>, now: number): Promise<OpeningSample[]> {
  const { rows } = await pool.query<OpeningRow>(openingQuery, [now])
  if (!rows.some(row => row.name === 'agricola_opening_tracking_since_unixtime')) throw new Error('Opening tracking coverage is unavailable')
  return rows.map(row => {
    if (row.value === null || !Number.isFinite(Number(row.value))) throw new Error('Invalid opening aggregate')
    return { name: row.name, labels: row.labels, value: Number(row.value) }
  })
}

export function openingMetricLines(samples: OpeningSample[]): string[] {
  const names = new Set<string>()
  return samples.flatMap(({ name, labels, value }) => {
    const prefix = names.has(name) ? [] : [`# TYPE ${name} gauge`]
    names.add(name)
    const tags = Object.entries(labels).map(([key, label]) => `${key}=${JSON.stringify(label)}`).join(',')
    return [...prefix, `${name}${tags ? `{${tags}}` : ''} ${value}`]
  })
}
