import { registerActionHook } from '../hooks'

export const registerBuiltinNoopHooks = () => {
  registerActionHook({
    id: 'builtin-noop',
    handler: () => {},
  })
}
