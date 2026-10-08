import type { GameSession } from '../../server/game/authoritative-session'
import type { FixtureContext } from './fixtures/types'
import { confirmNextPlayer, confirmPlayerSwitch } from '../../server/__tests__/_helpers/pending-confirms'
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
    request?: {
      kind?: string
      options?: Array<{ value: string; labelKey?: string; labelParams?: { resourcesPaid?: Record<string, number> } }>
      farm?: {
        farmType?: string
        selectableTiles?: Array<{ row: number; col: number }>
      }
    }
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
    private readonly options: { historicalRecording?: boolean } = {},
  ) {}

  private record(label: string, resp: SessionResp): SessionResp {
    this.steps.push({ label, ok: resp.ok, error: resp.error, stateId: resp.interaction.stateId })
    if (!resp.ok) throw new Error(`${label} failed: ${resp.error ?? 'unknown error'}`)
    return resp
  }

  private drain(label: string, resp: SessionResp, exactPayment?: Record<string, number>): SessionResp {
    let cur = resp
    let guard = 0
    while (cur.interaction.stateId === 'wait') {
      if (++guard > 50) throw new Error(`driver drain exceeded 50 iterations at ${label}`)
      cur = this.resolveInteraction(label, cur, exactPayment)
      if (!cur.ok) return cur
    }
    return cur
  }

  private resolveInteraction(label: string, resp: SessionResp, exactPayment?: Record<string, number>): SessionResp {
    const it = resp.interaction
    const kind = it.request?.kind
    if (kind === 'confirm-next-player') {
      return this.record(label, confirmNextPlayer(this.session) as unknown as SessionResp)
    }
    if (kind === 'confirm-player-switch') {
      return this.record(label, confirmPlayerSwitch(this.session) as unknown as SessionResp)
    }
    if (kind === 'choice') {
      const opts = it.request?.options ?? []
      const signature = (cost: Record<string, number>) => JSON.stringify(Object.entries(cost).filter(([, amount]) => amount > 0).sort(([a], [b]) => a.localeCompare(b)))
      const payments = exactPayment ? opts.filter(option => option.labelParams?.resourcesPaid && signature(option.labelParams.resourcesPaid) === signature(exactPayment)) : []
      const pick =
        opts.find((o) => o.value === this.ctx.cardId) ??
        (payments.length === 1 ? payments[0] : undefined) ??
        (this.options.historicalRecording ? opts.find((o) => o.value !== '__skip__') ?? opts[0] : undefined)
      if (!pick) throw new Error(`driver: fixture must explicitly resolve choice at ${label}: ${JSON.stringify(it.request)}`)
      const pi = it.playerIndex ?? 0
      return this.resolveChoiceRaw(pi, pick.value)
    }
    if (this.options.historicalRecording && kind === 'farm-select' && it.request?.farm?.farmType === 'room') {
      const room = it.request.farm.selectableTiles?.[0]
      if (!room) throw new Error(`driver: room selection with no selectable tiles at ${label}`)
      const pi = it.playerIndex ?? 0
      return this.record(
        `commitSelectionChoice(${pi},room)`,
        this.session.commitSelectionChoice(pi, { rooms: [room] }) as unknown as SessionResp,
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

  resolveChoiceRaw(pi: number, choice: string): SessionResp {
    return this.record(
      `resolveChoice(${pi},'${choice}')`,
      this.session.resolveChoice(pi, choice) as unknown as SessionResp,
    )
  }

  commitSelectionRaw(pi: number, selection: Parameters<GameSession['commitSelectionChoice']>[1]): SessionResp {
    return this.record(`commitSelectionChoice(${pi})`, this.session.commitSelectionChoice(pi, selection) as unknown as SessionResp)
  }

  resolveChoice(pi: number, choice: string): SessionResp {
    const label = `resolveChoice(${pi},'${choice}')`
    return this.drain(label, this.resolveChoiceRaw(pi, choice))
  }

  getState(): ReturnType<GameSession['getState']> {
    return this.session.getState()
  }

  playMinorViaMeetingPlace(pi: number, exactPayment?: Record<string, number>): SessionResp {
    return this.drain(`meeting-place(${pi})`, this.openMinorChoice(pi), exactPayment)
  }

  openMinorChoice(pi: number): SessionResp {
    const response = this.takeActionRaw(pi, 'meeting-place')
    const improvements = response.interaction.request?.options?.filter(option => option.labelKey === 'actions.improvement.name') ?? []
    if (improvements.length > 1) throw new Error('Expected exactly one optional improvement action')
    return improvements.length === 1 ? this.resolveChoiceRaw(pi, improvements[0].value) : response
  }

  playOccupationViaLessons(pi: number): SessionResp {
    return this.takeAction(pi, 'lessons')
  }

  takeAnytimeAction(pi: number, anytimeId: string): SessionResp {
    // 不 drain：anytime 行动的 flow 通常自包含（纯资源操作），执行后会停回
    // 触发它的宿主 interaction（如 farmland 的 farm-select）——宿主 interaction
    // 不该被 driver 消化。若将来某 anytime flow 产生需 resolve 的 sub-interaction，
    // driver 需扩展（目前 11 个 fixture 无此需求）。
    return this.record(
      `takeAnytimeAction(${pi},'${anytimeId}')`,
      this.session.takeAnytimeAction(pi, anytimeId) as unknown as SessionResp,
    )
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
