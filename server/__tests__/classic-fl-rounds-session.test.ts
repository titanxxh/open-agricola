import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { GameState } from '../../shared/contract/types'
import { fl, flSession, chooseBranch } from './_helpers/classic-fl'
import { autoAdvanceRoundEnd } from './_helpers/round-end'
import { setWorkersAtHome } from '../../shared/domain/player'
import { getLogicalFields } from '../../shared/cards/helpers/card-field'
import { bonusScore } from './_helpers/card-play-lifecycle'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))
function endFixture(
  number: number,
  round: number,
  configure: (state: GameState) => void = () => {},
) {
  const session = flSession([number], (state) => {
    state.round = round
    for (const player of state.players) {
      setWorkersAtHome(state, player, 0)
      player.resources.food = 20
    }
    const card = fl[number]!
    if (card.meta.kind === 'occupation' || card.meta.playerActionCardType === 'occupation')
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
  it('Endive Field: plants after the harvest, not before that harvest reaps', () => {
    const session = endFixture(6, 4, (state) => {
      state.players[0]!.resources.vegetable = 1
    })
    const response = finish(session)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
    const field = session.withCtx(() =>
      getLogicalFields(session.state.players[0]!).find((field) => field.sourceCard === fl[6]!.id),
    )
    expect(field?.stacks).toEqual([{ kind: 'vegetable', remaining: 2 }])
  })

  it('Diamond Trading Post: first harvest trade pays stone and grants sheep before breeding', () => {
    const session = endFixture(7, 4, (state) => {
      const p = state.players[0]!
      p.resources.stone = 4
      p.cardStates[fl[7]!.id] = { counters: { stone: 3 } }
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
    expect(response.state.players[0]!.cardStates[fl[7]!.id]?.counters).toMatchObject({
      stone: 4,
      trades: 1,
    })
  })

  it('Jenever Distillery: stored wood grants food in the field phase before feeding', () => {
    const session = endFixture(14, 4, (state) => {
      state.players[0]!.cardStates[fl[14]!.id] = { counters: { wood: 4 } }
    })
    const response = finish(session)
    expect(response.state.players[0]!.resources.food).toBe(20)
    expect(
      response.state.events.some(
        (event) =>
          event.type === 'resource.moved' &&
          event.sourceCardId === fl[14]!.id &&
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
      expect(bonusScore(response, fl[21]!.id)).toBe(opponentFirst ? 0 : 1)
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
    expect(bonusScore(finish(session), fl[21]!.id)).toBe(1)
  })

  it.each([false, true])('Corn Maze: four grain fields form a square=%s', (square) => {
    const session = endFixture(22, 1, (state) => {
      state.players[0]!.fields = [
        { row: 0, col: 1 },
        { row: 0, col: 2 },
        { row: 1, col: 1 },
        { row: square ? 1 : 2, col: 2 },
      ].map((tile) => ({ ...tile, stacks: [{ kind: 'grain', remaining: 3 }] }))
    })
    const response = finish(session)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: square ? 1 : 0,
      reed: square ? 1 : 0,
    })
  })

  it('Carrot Museum: counts crops and fields at the end of the non-harvest eighth round', () => {
    const session = endFixture(23, 8, (state) => {
      state.players[0]!.resources.vegetable = 2
      state.players[0]!.fields = [{ row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 2 }] }]
    })
    const response = finish(session)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, stone: 1, vegetable: 2 })
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

  it('Elder: pays food from the card to take Fishing after all workers are used', () => {
    const session = endFixture(32, 1, (state) => {
      state.players[0]!.cardStates[fl[32]!.id] = { counters: { food: 2 } }
      state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = 3
    })
    const response = finish(session)
    expect(response.state.players[0]!.resources.food).toBe(23)
    expect(response.state.players[0]!.cardStates[fl[32]!.id]?.counters?.food).toBe(1)
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

  it('Vegetable Seller: end-game debt survives the card leaving play and gives begging for shortfall', () => {
    const session = endFixture(36, 14, (state) => {
      state.players[0]!.occupationPlayed = []
      state.players[0]!.cardStates[fl[36]!.id] = { extraData: { borrowed: 3 } }
      state.players[0]!.resources.vegetable = 1
    })
    const response = finish(session)
    expect(response.state.gameOver).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 0, begging: 2 })
    expect(response.state.players[0]!.cardStates[fl[36]!.id]?.extraData?.borrowed).toBe(0)
  })

  it('Anatomist: a reserved round-seven guest appears without increasing family size', () => {
    const session = endFixture(40, 6)
    const response = finish(session)
    expect(response.state.round).toBe(7)
    expect(response.state.players[0]!.workers.filter((worker) => worker.isGuest)).toHaveLength(1)
    expect(response.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(2)
  })

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
    expect(bonusScore(response, fl[50]!.id)).toBe(1)
  })

  it('Scribbler: unused Day Laborer stores one food at the end of work', () => {
    const session = endFixture(52, 1)
    const response = finish(session)
    expect(response.state.players[0]!.cardStates[fl[52]!.id]?.counters?.food).toBe(1)
  })

  it('Recluse: a column with the owner alone grants food once', () => {
    const session = endFixture(55, 1, (state) => {
      state.actionSpaces.find((space) => space.id === 'forest')!.takenBy = [
        { playerId: state.players[0]!.id, workerId: state.players[0]!.workers[0]!.id },
      ]
    })
    const response = finish(session)
    expect(response.state.players[0]!.resources.food).toBe(21)
  })

  it.each([1, 2])('Blackleg Chicken: %i stored food controls its harvest growth', (food) => {
    const session = endFixture(61, 4, (state) => {
      state.players[0]!.cardStates[fl[61]!.id] = { counters: { food } }
    })
    const response = finish(session)
    expect(response.state.players[0]!.cardStates[fl[61]!.id]?.counters?.food).toBe(
      food >= 2 ? food + 1 : food,
    )
  })
})
