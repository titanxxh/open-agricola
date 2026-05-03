import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { computeExtraSowableFields } from '../../shared/cards/card-effects'
import { readCardExtraData, writeCardExtraData } from '../../shared/cards/helpers/card-state'
import { validateSowSelection } from '../../shared/logic/farm/sow-validation'

import { markAllWorkersUsed } from '../../shared/game/player'
const CARD_ID = 'E68_CherryOrchard'
const VIRTUAL_TILE = { row: -1, col: 68 }
const harvestRounds = [4, 7, 9, 11, 13, 14]

const loadCard = () => import('../../shared/cards/E/E68_CherryOrchard')

type CardCrop = { crop: 'wood'; remaining: number }

const setup = (options?: {
  withCard?: boolean
  grain?: number
  wood?: number
  vegetable?: number
  fields?: { row: number; col: number; stacks: { kind: 'grain' | 'vegetable'; remaining: number }[] }[]
  round?: number
  cardCrop?: CardCrop | null
}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = options?.round ?? 1
  state.roundPhase = 'work'
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'grain-utilization'

  const player = state.players[0]!
  player.workersAvailable =
    options?.round && harvestRounds.includes(options.round) ? 0 : 2
  player.resources.food = 10
  player.resources.grain = options?.grain ?? 0
  player.resources.wood = options?.wood ?? 0
  player.resources.vegetable = options?.vegetable ?? 0
  player.fields = options?.fields ?? []

  if (options?.withCard ?? true) {
    player.minorPlayed.push(CARD_ID)
  }

  if (options?.cardCrop !== undefined) {
    writeCardExtraData(player, CARD_ID, 'cardCrop', options.cardCrop)
  }

  if (options?.round && harvestRounds.includes(options.round)) {
    for (const current of state.players) {
      markAllWorkersUsed(state, current)
      current.resources.food = 10
    }
    state.players[0]!.resources.grain = options?.grain ?? 0
    state.players[0]!.resources.wood = options?.wood ?? 0
    state.players[0]!.resources.vegetable = options?.vegetable ?? 0
  }

  session.loadState(state)
  return session
}

describe('E68_CherryOrchard session', () => {
  it('allows wood only on extra sow fields', () => {
    const session = setup({
      withCard: false,
      wood: 1,
      fields: [{ row: 0, col: 0, stacks: [] }],
    })
    const player = session.getState().state.players[0]!

    const extraFieldResult = validateSowSelection(
      player,
      [{ row: VIRTUAL_TILE.row, col: VIRTUAL_TILE.col, crop: 'wood' }],
      {
        extraAllowedCrops: new Map([
          [`${VIRTUAL_TILE.row}-${VIRTUAL_TILE.col}`, ['wood']],
        ]),
      },
    )

    expect(extraFieldResult.ok).toBe(true)
    if (extraFieldResult.ok) {
      expect(extraFieldResult.player.resources.wood).toBe(1)
    }

    const regularFieldResult = validateSowSelection(player, [
      { row: 0, col: 0, crop: 'wood' },
    ])
    expect(regularFieldResult).toEqual({
      ok: false,
      error: { code: 'INVALID_CROP' },
    })
  })

  it('exposes a wood-only virtual field and stores wood crop state after sow', async () => {
    await loadCard()

    const session = setup({
      wood: 2,
      fields: [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }],
    })
    const player = session.getState().state.players[0]!

    const extras = computeExtraSowableFields(player)
    expect(extras).toEqual([
      {
        tile: VIRTUAL_TILE,
        allowedCrops: ['wood'],
        sourceCard: CARD_ID,
      },
    ])

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)

    expect(resp.ok).toBe(true)

    resp = session.resolveChoice(0, 'confirm', {
      crops: [{ row: VIRTUAL_TILE.row, col: VIRTUAL_TILE.col, crop: 'wood' }],
    })
    expect(resp.ok).toBe(true)

    const playerAfter = resp.state.players[0]!
    expect(playerAfter.resources.wood).toBe(1)
    expect(readCardExtraData<CardCrop>(playerAfter, CARD_ID, 'cardCrop')).toEqual({
      crop: 'wood',
      remaining: 3,
    })
  })

  it('exposes sourceCard on the sow interaction for the orchard virtual tile', async () => {
    await loadCard()

    const session = setup({
      wood: 2,
      fields: [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }],
    })

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('farmSelect')

    if (resp.interaction.stateId !== 'farmSelect' || resp.interaction.farm.farmType !== 'sow') {
      throw new Error('expected sow interaction')
    }

    expect(resp.interaction.farm.selectableFields).toContainEqual({
      tile: VIRTUAL_TILE,
      allowedCrops: ['wood'],
      sourceCard: CARD_ID,
    })
  })

  it('rejects grain on the orchard virtual tile', async () => {
    await loadCard()

    const session = setup({
      grain: 1,
      wood: 1,
      fields: [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }],
    })

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)

    expect(resp.ok).toBe(true)

    resp = session.resolveChoice(0, 'confirm', {
      crops: [{ row: VIRTUAL_TILE.row, col: VIRTUAL_TILE.col, crop: 'grain' }],
    })
    expect(resp.ok).toBe(false)
    expect(readCardExtraData<CardCrop | null>(session.getState().state.players[0]!, CARD_ID, 'cardCrop')).toBeUndefined()
    expect(session.getState().state.players[0]!.resources.wood).toBe(1)
  })

  it('gives 1 vegetable on the last harvested wood and clears card state', async () => {
    await loadCard()

    const session = setup({
      round: 4,
      wood: 0,
      vegetable: 0,
      cardCrop: { crop: 'wood', remaining: 1 },
    })

    const resp = session.performRoundEnd()
    const playerAfter = resp.state.players[0]!

    expect(playerAfter.resources.wood).toBe(1)
    expect(playerAfter.resources.vegetable).toBe(1)
    expect(readCardExtraData<CardCrop | null>(playerAfter, CARD_ID, 'cardCrop')).toBeNull()
  })
})
