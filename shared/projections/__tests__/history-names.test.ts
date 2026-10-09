import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LogEntry } from '../../contract/types'
import { projectHistoryLogNames } from '../history-names'

afterEach(() => vi.restoreAllMocks())

describe('history participant name projection', () => {
  it('only replaces existing string names when identity roles include unused fields', () => {
    const entry: LogEntry = { key: 'log.placeFarmer', playerId: 'p1', params: {
      player: 'Old name', action: 'actions.day-laborer.name', toPlayer: null,
    } }
    const projected = projectHistoryLogNames(entry, {
      'params.player': 'p1', 'params.playerName': 'p1', 'params.toPlayer': 'p1',
    }, { p1: 'Renamed player' })
    expect(projected.params).toEqual({
      player: 'Renamed player', action: 'actions.day-laborer.name', toPlayer: null,
    })
    expect(entry.params?.player).toBe('Old name')
  })

  it('returns unchanged records without JSON copying when names match or roles cannot apply', () => {
    const entry: LogEntry = { key: 'transfer', params: { player: 'Actor', details: null, count: 2 } }
    const parse = vi.spyOn(JSON, 'parse')
    const stringify = vi.spyOn(JSON, 'stringify')
    expect(projectHistoryLogNames(entry, { 'params.player': 'p1', 'params.count': 'p2',
      'params.details.toPlayer': 'p2', 'key': 'p2', 'params.missing.player': 'p2' }, { p1: 'Actor', p2: 'Other' })).toBe(entry)
    expect(projectHistoryLogNames(entry, undefined, { p1: 'New actor' })).toBe(entry)
    expect(projectHistoryLogNames(entry, { 'params.player': 'missing' }, {})).toBe(entry)
    expect(parse).not.toHaveBeenCalled()
    expect(stringify).not.toHaveBeenCalled()
  })

  it('projects nested roles including array entries without mutating raw values or unrelated strings', () => {
    const entry: LogEntry = { key: 'transfer', playerId: 'p1', params: {
      player: 'Old', details: [{ toPlayer: 'Old', cardName: 'Old', count: 2 }],
      resource: { wood: 2 },
    } }
    const before = structuredClone(entry)
    const roles = { 'params.player': 'p1', 'params.details.0.toPlayer': 'p2', 'params.details.0.cardName': 'p2' }
    const names = { p1: 'Actor', p2: 'Recipient' }
    const projected = projectHistoryLogNames(entry, roles, names)
    expect(projected).toEqual({ key: 'transfer', playerId: 'p1', params: {
      player: 'Actor', details: [{ toPlayer: 'Recipient', cardName: 'Old', count: 2 }], resource: { wood: 2 },
    } })
    expect(entry).toEqual(before)
    names.p1 = 'Renamed actor'
    expect(projectHistoryLogNames(entry, roles, names).params!.player).toBe('Renamed actor')
    expect(projected.params!.player).toBe('Actor')
    roles['params.player'] = 'p2'
    expect(projectHistoryLogNames(entry, roles, names).params!.player).toBe('Recipient')
  })
})
