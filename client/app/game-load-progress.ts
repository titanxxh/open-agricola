import type { WsStatus } from './ws-status'

export type GameLoadPhase =
  | 'manifest'
  | 'appShell'
  | 'auth'
  | 'wsConnecting'
  | 'wsCreating'
  | 'wsJoining'
  | 'fetchingState'
  | 'ready'

const PHASE_PERCENT: Record<GameLoadPhase, number> = {
  manifest: 15,
  appShell: 18,
  auth: 20,
  wsConnecting: 35,
  wsCreating: 45,
  wsJoining: 55,
  fetchingState: 80,
  ready: 100,
}

const PHASE_LABEL_KEY: Record<GameLoadPhase, string> = {
  manifest: 'platform.loadStep.manifest',
  appShell: 'platform.loadStep.appShell',
  auth: 'platform.loadStep.auth',
  wsConnecting: 'platform.loadStep.wsConnecting',
  wsCreating: 'platform.loadStep.wsCreating',
  wsJoining: 'platform.loadStep.wsJoining',
  fetchingState: 'platform.loadStep.fetchingState',
  ready: 'platform.loading',
}

export type GameLoadResolveInput = {
  manifestReady?: boolean
  authLoading?: boolean
  wsStatus?: WsStatus
  hasGameView?: boolean
}

export function getGameLoadProgress(phase: GameLoadPhase): { percent: number; labelKey: string } {
  return { percent: PHASE_PERCENT[phase], labelKey: PHASE_LABEL_KEY[phase] }
}

export function resolveGameLoadPhase(input: GameLoadResolveInput): GameLoadPhase | null {
  if (input.manifestReady === false) return 'manifest'
  if (input.authLoading) return 'auth'
  if (input.hasGameView) return 'ready'

  const ws = input.wsStatus
  if (ws) {
    switch (ws.phase) {
      case 'connecting':
        return 'wsConnecting'
      case 'creating':
        return 'wsCreating'
      case 'joining':
        return 'wsJoining'
      case 'ready':
        return 'fetchingState'
      case 'waiting':
      case 'error':
      case 'idle':
        return null
    }
  }

  if (!input.hasGameView) return 'fetchingState'
  return null
}
