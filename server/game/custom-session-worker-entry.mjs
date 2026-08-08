import { register } from 'tsx/esm/api'

register()
await import('./custom-session-worker.ts')
