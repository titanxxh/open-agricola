import type { GameSession } from '../../server/game/authoritative-session'
import type { FixtureContext } from './fixtures/types'
import { confirmNextPlayer, confirmPlayerSwitch } from '../../server/__tests__/_helpers/legacy-confirms'
import { autoAdvanceRoundEnd } from './session-helpers'

export interface DriverStep {
  label: string
  ok: boolean
  error?: string
  stateId: string
}

type SessionResp = {
  ok: boolean
  error?: string
  interaction: {
    stateId: string
    request?: { kind?: string }
    playerIndex?: number
    options?: Array<{ value: string }>
    anytimeActions?: Array<{ id: string; sourceCard?: string }>
  }
}

export class Driver {
  readonly steps: DriverStep[] = []

  constructor(
    private readonly session: GameSession,
    private readonly ctx: FixtureContext,
  ) {}

  private record(label: string, resp: SessionResp): SessionResp {
    this.steps.push({ label, ok: resp.ok, error: resp.error, stateId: resp.interaction.stateId })
    return resp
  }

  private drain(label: string, resp: SessionResp): SessionResp {
    let cur = resp
    let guard = 0
    while (cur.interaction.stateId === 'wait') {
      if (++guard > 50) throw new Error(`driver drain exceeded 50 iterations at ${label}`)
      cur = this.resolveInteraction(label, cur)
      if (!cur.ok) return cur
    }
    return cur
  }

  private resolveInteraction(label: string, resp: SessionResp): SessionResp {
    const it = resp.interaction
    const kind = it.request?.kind
    if (kind === 'confirm-next-player') {
      return this.record(label, confirmNextPlayer(this.session) as unknown as SessionResp)
    }
    if (kind === 'confirm-player-switch') {
      return this.record(label, confirmPlayerSwitch(this.session) as unknown as SessionResp)
    }
    if (kind === 'choice') {
      const opts = it.options ?? []
      const pick =
        opts.find((o) => o.value === this.ctx.cardId) ??
        opts.find((o) => o.value !== '__skip__') ??
        opts[0]
      if (!pick) throw new Error(`driver: choice with no options at ${label}`)
      const pi = it.playerIndex ?? 0
      return this.record(
        `resolveChoice(${pi},'${pick.value}')`,
        this.session.resolveChoice(pi, pick.value) as unknown as SessionResp,
      )
    }
    throw new Error(`driver needs extension: unknown interaction kind ${kind} (at ${label})`)
  }

  takeAction(pi: number, spaceId: string): SessionResp {
    const label = `takeAction(${pi},'${spaceId}')`
    const r0 = this.record(label, this.session.takeAction(pi, spaceId) as unknown as SessionResp)
    return this.drain(label, r0)
  }

  /**
   * 占行动位但不 drain——返回首个 response（可能停在 wait interaction）。
   * 用于需要在「行动产生的 wait interaction 进行中」操作的 fixture，
   * 例如 anytime 行动只在有 active interaction 时才暴露。
   */
  takeActionRaw(pi: number, spaceId: string): SessionResp {
    return this.record(
      `takeActionRaw(${pi},'${spaceId}')`,
      this.session.takeAction(pi, spaceId) as unknown as SessionResp,
    )
  }

  playMinorViaMeetingPlace(pi: number): SessionResp {
    return this.takeAction(pi, 'meeting-place')
  }

  playOccupationViaLessons(pi: number): SessionResp {
    return this.takeAction(pi, 'lessons')
  }

  takeAnytimeAction(pi: number, anytimeId: string): SessionResp {
    const label = `takeAnytimeAction(${pi},'${anytimeId}')`
    const r0 = this.record(label, this.session.takeAnytimeAction(pi, anytimeId) as unknown as SessionResp)
    return this.drain(label, r0)
  }

  /** 触发本卡的 anytime 行动；找不到则记录步骤并抛错。 */
  takeAnytimeForCard(pi: number): SessionResp {
    const anytimeId = this.findAnytimeId()
    if (!anytimeId) {
      this.steps.push({ label: `findAnytimeId('${this.ctx.cardId}'): none`, ok: false, stateId: 'idle' })
      throw new Error(`driver: no anytime action exposed for ${this.ctx.cardId}`)
    }
    return this.takeAnytimeAction(pi, anytimeId)
  }

  findAnytimeId(): string | undefined {
    const latest = this.session.getState() as {
      interaction?: { anytimeActions?: Array<{ id: string; sourceCard?: string }> }
    }
    return (latest.interaction?.anytimeActions ?? []).find((a) => a.sourceCard === this.ctx.cardId)?.id
  }

  hasAnytimeForCard(): boolean {
    return this.findAnytimeId() !== undefined
  }

  advanceToHarvest(): void {
    autoAdvanceRoundEnd(this.session)
    this.steps.push({ label: 'advanceToHarvest', ok: true, stateId: 'idle' })
  }

  advanceToGameEnd(): void {
    let guard = 0
    while (this.session.getState().state.gameOver !== true) {
      if (++guard > 30) throw new Error('advanceToGameEnd: game did not end after 30 round-ends')
      autoAdvanceRoundEnd(this.session, { maxIterations: 100 })
    }
    this.steps.push({ label: 'advanceToGameEnd', ok: true, stateId: 'gameover' })
  }
}
