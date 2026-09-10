import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

import '../../shared/cards/A/A058_AsparagusKnife'
import '../../shared/cards/A/A059_PotatoRidger'

const FILLER = '__test_placeholder__'

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playSession = (cardId: string) => {
  const session = new GameSession(7058, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.resources.wood = 0
  })
  state.players[0]!.minorHand = [cardId]
  state.players[0]!.resources.wood = 1
  session.loadState(state)
  return session
}

const playMinor = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let guard = 0; guard < 6 && response.state.players[0]!.minorHand.includes(cardId); guard += 1) {
    if (response.interaction.stateId !== 'wait') break
    const card = options(response).find((option) => option.value === cardId)
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    const next = card ?? branch
    if (!next) break
    response = session.resolveChoice(response.interaction.playerIndex, next.value)
  }
  return response
}

const phaseSession = ({
  cardId, round, fields, reserveVegetable = 0,
}: {
  cardId: string
  round: number
  fields: Array<{ crop: 'vegetable' | 'grain'; remaining: number }>
  reserveVegetable?: number
}) => {
  const session = new GameSession(7158 + round, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 1)
    player.resources.food = 10
    player.resources.vegetable = 0
    player.fields = []
  })
  const owner = state.players[0]!
  owner.minorPlayed = [cardId]
  owner.resources.vegetable = reserveVegetable
  owner.fields = fields.map((field, index) => ({
    row: 0, col: index, stacks: [{ kind: field.crop, remaining: field.remaining }],
  }))
  session.loadState(state)
  return session
}

describe('A058 Asparagus Knife parity', () => {
  const CARD_ID = 'A058_AsparagusKnife'

  it('A058 S1: paying one wood plays Asparagus Knife', () => {
    const response = playMinor(playSession(CARD_ID), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  const finish = (session: GameSession, mode: 'accept-first' | 'accept-second' | 'decline' | 'none') => {
    autoAdvanceRoundEnd(session, {
      onChoice: (interaction, current) => {
        if (interaction.request.kind === 'choice') {
          const skip = interaction.request.options?.find((option) => option.value === '__skip__')
          const accept = interaction.request.options?.find((option) => option.value !== '__skip__')
          if (skip && mode === 'decline') return current.resolveChoice(interaction.playerIndex, skip.value)
          if (accept && mode !== 'none') return current.resolveChoice(interaction.playerIndex, accept.value)
        }
        if (interaction.request.kind === 'selection') {
          const col = mode === 'accept-second' ? 1 : 0
          return current.commitSelectionChoice(interaction.playerIndex, { positions: [{ row: 0, col }] })
        }
        return undefined
      },
    })
    return session.getState()
  }

  it('A058 S2: round eight may take one vegetable from one field for three food and one point', () => {
    const response = finish(phaseSession({
      cardId: CARD_ID, round: 8, fields: [{ crop: 'vegetable', remaining: 2 }],
    }), 'accept-first')
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(response.state.players[0]!.resources.food).toBe(13)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
  })

  it('A058 S3: the round-eight Asparagus Knife effect may be declined', () => {
    const response = finish(phaseSession({
      cardId: CARD_ID, round: 8, fields: [{ crop: 'vegetable', remaining: 2 }],
    }), 'decline')
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(2)
    expect(response.state.players[0]!.resources.food).toBe(10)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('A058 S4: with two vegetable fields Asparagus Knife takes from exactly the selected field', () => {
    const response = finish(phaseSession({
      cardId: CARD_ID, round: 8, fields: [
        { crop: 'vegetable', remaining: 2 }, { crop: 'vegetable', remaining: 1 },
      ],
    }), 'accept-second')
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(2)
    expect(response.state.players[0]!.fields[1]!.stacks).toEqual([])
    expect(response.state.players[0]!.resources.food).toBe(13)
  })

  it('A058 S5: non-trigger rounds or no vegetable field offer no Asparagus Knife effect', () => {
    const wrongRound = finish(phaseSession({
      cardId: CARD_ID, round: 7, fields: [{ crop: 'vegetable', remaining: 2 }],
    }), 'none')
    expect(wrongRound.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)

    const noVegetable = finish(phaseSession({
      cardId: CARD_ID, round: 8, fields: [{ crop: 'grain', remaining: 2 }],
    }), 'none')
    expect(noVegetable.state.players[0]!.resources.food).toBe(10)
  })
})

describe('A059 Potato Ridger parity', () => {
  const CARD_ID = 'A059_PotatoRidger'

  it('A059 S1: paying one wood plays Potato Ridger', () => {
    const response = playMinor(playSession(CARD_ID), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  const finish = (reserveVegetable: number, fields: number, mode: 'accept' | 'decline' | 'auto') => {
    const session = phaseSession({
      cardId: CARD_ID, round: 4, reserveVegetable,
      fields: Array.from({ length: fields }, () => ({ crop: 'vegetable' as const, remaining: 1 })),
    })
    autoAdvanceRoundEnd(session, {
      onChoice: (interaction, current) => {
        if (interaction.sourceCard !== CARD_ID || interaction.request.kind !== 'choice') return undefined
        const target = mode === 'decline'
          ? interaction.request.options?.find((option) => option.value === '__skip__')
          : interaction.request.options?.find((option) => option.value !== '__skip__')
        return target ? current.resolveChoice(interaction.playerIndex, target.value) : undefined
      },
    })
    return session.getState()
  }

  it('A059 S2: harvesting to exactly three vegetables may exchange one for six food', () => {
    const response = finish(2, 1, 'accept')
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 2, food: 14 })
  })

  it('A059 S3: the exchange at exactly three vegetables may be declined', () => {
    const response = finish(2, 1, 'decline')
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 3, food: 8 })
  })

  it('A059 S4: harvesting to four vegetables forces one vegetable into six food', () => {
    const response = finish(3, 1, 'auto')
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 3, food: 14 })
  })

  it('A059 S5: fewer than three vegetables or no harvested vegetable triggers no exchange', () => {
    const tooFew = finish(1, 1, 'auto')
    expect(tooFew.state.players[0]!.resources.vegetable).toBe(2)
    const noHarvest = finish(5, 0, 'auto')
    expect(noHarvest.state.players[0]!.resources.vegetable).toBe(5)
  })
})
