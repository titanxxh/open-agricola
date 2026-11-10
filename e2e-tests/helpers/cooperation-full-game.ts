import { createWorkSession } from '../../server/__tests__/_helpers/session-fixtures'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'

export function cooperationFullGameFixture() {
  return createWorkSession({ seed: 1632, options: { playerCount: 4, teamConfig: {
    mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'private', cooperationRules: true,
  } }, configure(state) {
    state.round = 13
    state.roundPhase = 'work'
    state.currentPlayerIndex = 0
    state.roundFirstPlayerId = 'p1'
    for (const [index, player] of state.players.entries()) {
      player.name = ['Builder', 'Opponent 2', 'Partner', 'Opponent 4'][index]!
      player.nameIsDefault = false
      player.startPlayer = index === 0
      player.minorHand = ['__test_placeholder__']; player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []; player.occupationPlayed = []; player.improvements = []; player.cardStates = {}
      player.houseType = index === 2 ? 'clay' : 'wood'
      player.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }, ...(index === 0 ? [{ row: 1, col: 1 }] : [])]
      player.rooms = player.roomTiles.length
      player.fields = []; player.pastures = []; player.stableTiles = []; player.fenceSegments = []
      player.houseAnimals = {}; player.stableAnimals = {}
      setActiveWorkerCount(player, index === 0 ? 3 : 2)
      setWorkersAtHome(state, player, index === 0 ? 3 : 2)
      Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
    }
    Object.assign(state.players[0]!.resources, { wood: 30, clay: 6, reed: 3 })
    for (const space of state.actionSpaces) {
      space.takenBy = []
      if (space.id === 'forest') space.resources.wood = 1
      if (space.id === 'reed-bank') space.resources.reed = 1
      if (space.id === 'clay-pit') space.resources.clay = 1
    }
  } })
}
