import type { WebPushKind } from '../../shared/contract/web-push'
import type { PushDelivery, WebPushStore } from './store'

type ProviderResult = { kind: 'accepted' | 'expired' | 'discarded' } | { kind: 'retry'; retryAt?: number }
export type PushProvider = (delivery: PushDelivery, ttl: number) => Promise<ProviderResult>

const BATCH_SIZE = 20
const RETRY_DELAYS = [5_000, 30_000, 120_000, 300_000]

export class WebPushDelivery {
  private running = false
  private readonly store: WebPushStore
  private readonly send: PushProvider
  private readonly now: () => number

  constructor(store: WebPushStore, send: PushProvider, now = Date.now) {
    this.store = store
    this.send = send
    this.now = now
  }

  async deliverDue(kinds: readonly WebPushKind[]) {
    if (this.running) return
    this.running = true
    try {
      for (let index = 0; index < BATCH_SIZE; index++) {
        const claim = await this.store.claimDue(kinds)
        if (!claim) return
        const delivery = await this.store.attempt(claim)
        const ttl = delivery ? Math.floor((delivery.expiresAt - this.now()) / 1_000) : 0
        if (!delivery || ttl <= 0) {
          await this.store.settle(claim, 'discarded')
          continue
        }
        const result = await this.send(delivery, ttl).catch((): ProviderResult => ({ kind: 'retry' }))
        if (result.kind === 'accepted') {
          await this.store.settle(claim, 'accepted')
        } else if (result.kind === 'expired') {
          await this.store.expireBinding(delivery.bindingId)
          await this.store.settle(claim, 'discarded')
        } else if (result.kind === 'retry') {
          const delay = RETRY_DELAYS[claim.attempts - 1]
          const retryAt = delay ? Math.max(this.now() + delay, result.retryAt ?? 0) : delivery.expiresAt
          await this.store.settle(claim, retryAt < delivery.expiresAt ? { retryAt } : 'discarded')
        } else {
          await this.store.settle(claim, 'discarded')
        }
      }
    } finally {
      this.running = false
    }
  }
}
