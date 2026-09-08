import type { GameState, PlayerState, SupplyWorkerSource, Worker, WorkerRef } from '../contract/types'
import { inactiveWorkersInSupply } from './player'
import { clearLinkedSpaceBlocksForWorker, removeWorkerRef } from './space'
import { releaseWorkerFromCard } from '../cards/helpers/card-held-workers'

export const findSupplyWorker = (
  player: PlayerState,
  sourceCard?: string,
  workerId?: string,
): Worker | undefined => {
  if (!workerId) return inactiveWorkersInSupply(player)[0]
  return player.workers.find((worker) =>
    worker.id === workerId && !worker.isActive && !worker.removedFromSupply &&
    (!worker.supplyUse || (
      worker.supplyUse.sourceCard === sourceCard &&
      worker.supplyUse.status !== 'temporary'
    )),
  )
}

export const reserveSupplyWorker = (
  player: PlayerState,
  sourceCard: string,
): Worker | undefined => {
  const worker = inactiveWorkersInSupply(player)[0]
  if (worker) {
    worker.supplyUse = { sourceCard, disposition: 'return-to-supply', status: 'reserved' }
  }
  return worker
}

export const releaseSupplyWorker = (state: GameState, player: PlayerState, worker: Worker): void => {
  for (const space of state.actionSpaces) removeWorkerRef(space, player.id, worker.id)
  clearLinkedSpaceBlocksForWorker(state, player.id, worker.id)
  for (const [cardId, cardState] of Object.entries(player.cardStates ?? {})) {
    if (cardState.extraData?.heldWorkerId === worker.id) releaseWorkerFromCard(player, cardId)
  }
  if (worker.supplyUse?.disposition === 'remove-from-game') worker.removedFromSupply = true
  worker.isActive = false
  worker.isNewborn = false
  delete worker.supplyUse
}

export const returnSupplyWorkers = (state: GameState): {
  disposition: SupplyWorkerSource['disposition']
  workers: WorkerRef[]
}[] => {
  const returned: WorkerRef[] = []
  const removed: WorkerRef[] = []
  for (const player of state.players) {
    for (const worker of player.workers) {
      const use = worker.supplyUse
      if (!use || use.returnRound === undefined || use.returnRound > state.round) continue
      const target = use.disposition === 'remove-from-game' ? removed : returned
      target.push({ playerId: player.id, workerId: worker.id })
      releaseSupplyWorker(state, player, worker)
    }
  }
  const groups: { disposition: SupplyWorkerSource['disposition']; workers: WorkerRef[] }[] = [
    { disposition: 'return-to-supply', workers: returned },
    { disposition: 'remove-from-game', workers: removed },
  ]
  return groups.filter((entry) => entry.workers.length > 0)
}
