import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { GameState } from '../../shared/contract/types'
import { getClassicCardKind } from '../../shared/cards/classic-catalog'
import { flCard, flSession, chooseBranch } from './_helpers/classic-fl'
import { autoAdvanceRoundEnd } from './_helpers/round-end'
import { setWorkersAtHome } from '../../shared/domain/player'
import { bonusScore, choose, restoreSession } from './_helpers/card-play-lifecycle'
import { createWorkSession } from './_helpers/session-fixtures'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))
function endFixture(
  number: number,
  round: number,
  configure: (state: GameState) => void = () => {},
) {
  const session = flSession((state) => {
    state.round = round
    for (const player of state.players) {
      setWorkersAtHome(state, player, 0)
      player.resources.food = 20
    }
    const card = flCard(number)
    if (getClassicCardKind(card.id) === 'occupation')
      state.players[0]!.occupationPlayed = [card.id]
    else state.players[0]!.minorPlayed = [card.id]
    configure(state)
  })
  sessions.push(session)
  return session
}
const finish = (session: GameSession) =>
  autoAdvanceRoundEnd(session, {
    onChoice: (_interaction, current) => chooseBranch(current, current.getState()),
  })

describe('FL: real round and harvest pipelines', () => {
  it('Diamond Trading Post: first harvest trade pays stone and grants sheep before breeding', () => {
    const session = endFixture(7, 4, (state) => {
      const p = state.players[0]!
      p.resources.stone = 4
      p.cardStates[flCard(7).id] = { counters: { stone: 3 } }
      p.pastures = [
        {
          id: 'p',
          tiles: [
            { row: 0, col: 1 },
            { row: 0, col: 2 },
          ],
          animalType: null,
          animalCount: 0,
        },
      ]
    })
    const response = finish(session)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 3, sheep: 3 })
    expect(response.state.players[0]!.cardStates[flCard(7).id]?.counters).toMatchObject({
      stone: 4,
      trades: 1,
    })
  })

  it('Jenever Distillery: stored wood grants food in the field phase before feeding', () => {
    const session = endFixture(14, 4, (state) => {
      state.players[0]!.cardStates[flCard(14).id] = { counters: { wood: 4 } }
    })
    const response = finish(session)
    expect(response.state.players[0]!.resources.food).toBe(20)
    expect(
      response.state.events.some(
        (event) =>
          event.type === 'resource.moved' &&
          event.sourceCardId === flCard(14).id &&
          event.resources.food === 4,
      ),
    ).toBe(true)
  })

  it.each([false, true])(
    'Lions Mound: first occupied round card belongs to opponent=%s',
    (opponentFirst) => {
      const session = endFixture(21, 7, (state) => {
        const id = state.roundActionOrder[0]!
        const p = state.players[opponentFirst ? 1 : 0]!
        state.actionSpaces.find((space) => space.id === id)!.takenBy = [
          { playerId: p.id, workerId: p.workers[0]!.id },
        ]
      })
      const response = finish(session)
      expect(bonusScore(response, flCard(21).id)).toBe(opponentFirst ? 0 : 1)
    },
  )

  it('Lions Mound: sharing the earliest occupied round space still earns the bonus', () => {
    const session = endFixture(21, 7, (state) => {
      const first = state.actionSpaces.find((space) => space.id === state.roundActionOrder[0])!
      first.takenBy = [state.players[1]!, state.players[0]!].map((player) => ({
        playerId: player.id,
        workerId: '1',
      }))
    })
    expect(bonusScore(finish(session), flCard(21).id)).toBe(1)
  })

  it('Trappist Beer: paying grain skips the field phase and feeding for its owner only', () => {
    const session = endFixture(27, 4, (state) => {
      state.players[0]!.resources.grain = 1
      state.players[0]!.resources.food = 0
      state.players[0]!.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] }]
    })
    const response = finish(session)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 0, begging: 0 })
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(2)
    expect(response.state.players[1]!.resources.food).toBe(16)
  })

  it('Bird Trap: extra harvest adds one crop without consuming the rest of the stack', () => {
    const session = endFixture(29, 4, (state) => {
      state.players[0]!.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 3 }] }]
    })
    const response = finish(session)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 2, food: 17 })
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
  })

  it.each([true, false])('Bird Trap: the harvest receipt and Labourer include the optional crop when accepted=%s', (accept) => {
    const birdTrap = flCard(29).id
    const labourer = 'C120_AgriculturalLabourer'
    let session = createWorkSession({
      seed: 6100,
      options: { playerCount: 2 },
      configure: (state) => {
        state.round = 4
        const [owner, opponent] = state.players
        setWorkersAtHome(state, owner!, 0)
        setWorkersAtHome(state, opponent!, 0)
        owner!.minorPlayed = [birdTrap]
        owner!.occupationPlayed = [labourer]
        owner!.cardStates[labourer] = { counters: { clay: 3 } }
        owner!.fields = [
          { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] },
          { row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 2 }] },
        ]
        Object.assign(owner!.resources, { clay: 0, food: 20, grain: 0, vegetable: 0 })
        Object.assign(opponent!.resources, { food: 0, grain: 1 })
      },
    })
    sessions.push(session)

    const offered = session.performRoundEnd()
    expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
    expect(offered.state.players[0]!.resources).toMatchObject({ clay: 0, food: 21, grain: 0 })
    expect(offered.state.players[0]!.stats.harvestedGrain).toBe(0)

    let feeding
    if (accept) {
      const selecting = chooseBranch(session, offered)
      expect(selecting.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice' } })
      session = restoreSession(session)
      sessions.push(session)
      feeding = choose(session, session.getState(), 'farmyard:0:1')
    } else {
      feeding = choose(session, offered, '__skip__')
    }

    expect(feeding.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, request: { kind: 'feed' } })
    const owner = feeding.state.players[0]!
    const amount = accept ? 2 : 1
    expect(owner.resources).toMatchObject({ clay: amount, food: 17, grain: amount, vegetable: 1 })
    expect(owner.stats.harvestedGrain).toBe(amount)
    expect(owner.cardStates[labourer]?.counters?.clay).toBe(3 - amount)
    expect(owner.cardStates[birdTrap]?.extraData?.selectedHarvestField).toBeUndefined()
    expect(feeding.state.harvestReapSummary?.[owner.id]).toMatchObject({
      resources: { grain: amount, vegetable: 1 },
      grainFields: 1,
      harvestedCrops: [
        { row: 0, col: 1, crop: 'grain', amount, sources: accept ? ['base', birdTrap] : ['base'] },
        { row: 0, col: 2, crop: 'vegetable', amount: 1, sources: ['base'] },
      ],
    })
    expect(feeding.state.log).toContainEqual(expect.objectContaining({
      key: 'log.cardEffectGain',
      params: expect.objectContaining({ cardId: labourer, gain: { clay: amount } }),
    }))
    expect(feeding.state.players[1]!.stats.harvestedGrain).toBe(0)

    const finished = autoAdvanceRoundEnd(session, { initialResponse: feeding })
    expect(finished.interaction.stateId).toBe('idle')
    expect(finished.state.round).toBe(5)
  })

  it.each([3, 6])('Old Master: %i forest wood determines the round-three reward', (forest) => {
    const session = endFixture(31, 2, (state) => {
      state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = forest - 3
    })
    const response = finish(session)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: forest === 3 ? 1 : 0,
      stone: forest === 6 ? 1 : 0,
    })
  })

  it.each(['wood', 'clay', 'stone'] as const)(
    'Freemason: only a two-room %s house gains matching material',
    (house) => {
      const session = endFixture(35, 1, (state) => {
        state.players[0]!.houseType = house
      })
      const response = finish(session)
      expect(response.state.players[0]!.resources).toMatchObject({
        clay: house === 'clay' ? 2 : 0,
        stone: house === 'stone' ? 2 : 0,
        wood: 0,
      })
    },
  )

  it('Meat Supplier: each other player gets food and the owner gains the bonus point', () => {
    const session = endFixture(50, 4, (state) => {
      state.players[0]!.resources.boar = 1
      state.players[0]!.houseAnimals = { '1-0': 'boar' }
    })
    const response = finish(session)
    expect(response.state.players[0]!.resources).toMatchObject({ boar: 0, food: 16 })
    expect(response.state.players.slice(1).map((player) => player.resources.food)).toEqual([
      17, 17, 17,
    ])
    expect(bonusScore(response, flCard(50).id)).toBe(1)
  })

  it.each([1, 2])('Blackleg Chicken: %i stored food controls its harvest growth', (food) => {
    const session = endFixture(61, 4, (state) => {
      state.players[0]!.cardStates[flCard(61).id] = { counters: { food } }
    })
    const response = finish(session)
    expect(response.state.players[0]!.cardStates[flCard(61).id]?.counters?.food).toBe(
      food >= 2 ? food + 1 : food,
    )
  })
})
