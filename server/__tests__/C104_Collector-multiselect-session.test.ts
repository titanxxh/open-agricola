import { afterEach, describe, expect, it } from 'vitest'

import '../../shared/cards/C/C104_Collector'

import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { writeCardExtraData } from '../../shared/cards/helpers/card-state'
import { GameSession } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import type { PlayerState } from '../../shared/contract/types'

const CARD_ID = 'C104_Collector'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const createSession = (options: { used?: number; currentPlayerIndex?: number } = {}) => {
  const session = createWorkSession({ seed: 42, configure: state => {
    state.currentPlayerIndex = options.currentPlayerIndex ?? 0
    state.round = 1
    state.players[0]!.occupationPlayed = [CARD_ID]
    if (options.used !== undefined) writeCardExtraData(state.players[0]!, CARD_ID, 'used', options.used)
    state.actionSpaces.push(...createPlayerActionSpaces(state))
  } })
  sessions.push(session)
  return session
}

describe('C104 — multi-select session (player action space)', () => {
  it('resolves the browser multi-select value through GameSession', () => {
    const session = createSession()
    const before = { ...session.state.players[0]!.resources }

    const started = session.takeAction(0, CARD_ID)
    expect(started.ok).toBe(true)
    expect(started.interaction).toMatchObject({
      stateId: 'wait',
      playerIndex: 0,
      request: { kind: 'choice' },
      promptParams: { needed: 6 },
    })
    expect(started.interaction.allowedCommands).toContain('resolveChoice')
    if (started.interaction.stateId !== 'wait' || started.interaction.request.kind !== 'choice') return
    expect(started.interaction.request.options).toHaveLength(10)

    const resolved = session.resolveChoice(0, 'wood,clay,reed,stone,food,grain')
    expect(resolved.ok).toBe(true)
    expect(resolved.state.players[0]!.resources).toMatchObject({
      wood: before.wood + 1,
      clay: before.clay + 1,
      reed: before.reed + 1,
      stone: before.stone + 1,
      food: before.food + 1,
      grain: before.grain + 1,
      begging: before.begging + 1,
    })
    expect(resolved.state.players[0]!.cardStates[CARD_ID]?.extraData?.used).toBe(1)
    expect(resolved.state.actionSpaces.find((space) => space.id === CARD_ID)?.takenBy).toHaveLength(1)
    expect(resolved.state.log).toEqual(started.state.log)
    expect(resolved.scores).toHaveLength(2)
  })

  it('keeps waiting when fewer than six distinct goods are submitted through GameSession', () => {
    const session = createSession()
    const before = { ...session.state.players[0]!.resources }
    expect(session.takeAction(0, CARD_ID).ok).toBe(true)

    const resolved = session.resolveChoice(0, 'wood,clay,reed,stone,food,wood')
    expect(resolved.ok).toBe(true)
    expect(resolved.interaction).toMatchObject({
      stateId: 'wait',
      playerIndex: 0,
      request: { kind: 'choice' },
      promptParams: { needed: 6 },
    })
    expect(resolved.state.players[0]!.resources).toEqual(before)
    expect(resolved.state.players[0]!.cardStates[CARD_ID]?.extraData?.used).toBeUndefined()
  })

  it.each([
    {
      used: 1,
      needed: 7,
      selection: 'wood,clay,reed,stone,food,grain,vegetable',
      goods: ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable'],
    },
    {
      used: 2,
      needed: 8,
      selection: 'wood,clay,reed,stone,food,grain,vegetable,sheep',
      goods: ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep'],
    },
    {
      used: 3,
      needed: 9,
      selection: 'wood,clay,reed,stone,food,grain,vegetable,sheep,boar',
      goods: ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep', 'boar'],
    },
  ])(
    'use $needed asks for and grants $needed distinct goods plus 1 begging through GameSession',
    ({ used, needed, selection, goods }) => {
      const session = createSession({ used })
      const before = { ...session.state.players[0]!.resources }

      const started = session.takeAction(0, CARD_ID)
      expect(started.ok).toBe(true)
      expect(started.interaction).toMatchObject({
        stateId: 'wait',
        playerIndex: 0,
        promptParams: { needed },
      })

      const resolved = session.resolveChoice(0, selection)

      expect(resolved.ok).toBe(true)
      for (const good of goods) {
        const key = good as keyof PlayerState['resources']
        expect(resolved.state.players[0]!.resources[key]).toBe((before[key] ?? 0) + 1)
      }
      expect(resolved.state.players[0]!.resources.begging).toBe(before.begging + 1)
      expect(resolved.state.players[0]!.cardStates[CARD_ID]?.extraData?.used).toBe(used + 1)
    },
  )

  it('does not execute a fifth use through GameSession', () => {
    const session = createSession({ used: 4 })
    const before = { ...session.state.players[0]!.resources }

    const response = session.takeAction(0, CARD_ID)

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.state.players[0]!.resources).toEqual(before)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.used).toBe(4)
  })

  it('does not execute the owner-only space for a non-owner through GameSession', () => {
    const session = createSession({ currentPlayerIndex: 1 })
    const before = { ...session.state.players[1]!.resources }

    const response = session.takeAction(1, CARD_ID)

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.state.players[1]!.resources).toEqual(before)
    expect(response.state.players[1]!.cardStates[CARD_ID]?.extraData?.used).toBeUndefined()
  })
})
