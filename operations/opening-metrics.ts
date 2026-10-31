import type { Pool } from 'pg'
import { openingsFunction } from './database-access.ts'

export type OpeningSample = { name: string; labels: Record<string, string>; value: number }
type OpeningRow = { name: string; labels: Record<string, string>; value: number | string | null }


export async function collectOpeningMetrics(pool: Pick<Pool, 'query'>): Promise<OpeningSample[]> {
  const { rows } = await pool.query<OpeningRow>(`SELECT name,labels,value FROM ${openingsFunction}() ORDER BY name,labels::text`)
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
