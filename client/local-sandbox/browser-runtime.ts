import { createCustomCardRegistrar } from '../../shared/custom-code/registrar.ts'
import { invokeCustomCodeEffectLocal, invokeCustomCodeListenerLocal } from './browser-executor.ts'

export const registerBrowserBackedCustomCard = createCustomCardRegistrar({
  invokeEffect: invokeCustomCodeEffectLocal,
  invokeListener: invokeCustomCodeListenerLocal,
  logPrefix: 'local-sandbox-runtime',
})
