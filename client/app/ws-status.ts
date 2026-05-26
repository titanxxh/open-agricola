export type WsStatus =
  | { phase: 'idle' }
  | { phase: 'connecting' }
  | { phase: 'creating' }
  | { phase: 'joining'; roomId: string }
  | { phase: 'waiting'; roomId: string; players: Array<{ playerIndex: number; name: string }>; maxPlayers: number }
  | { phase: 'ready'; roomId: string; playerIndex: number }
  | { phase: 'error'; message: string }
