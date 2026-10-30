import { createCustomCardRegistrar } from '../../shared/custom-code/registrar.ts'
import { invokeCustomCodeEffectSync, invokeCustomCodeListenerSync } from './client.ts'

export const registerExecutorBackedCustomCard = createCustomCardRegistrar({
  invokeEffect: invokeCustomCodeEffectSync,
  invokeListener: invokeCustomCodeListenerSync,
  logPrefix: 'custom-code-runtime',
})
