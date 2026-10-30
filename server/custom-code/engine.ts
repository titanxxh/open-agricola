import ivm from 'isolated-vm'
import { validateAndCompileCard } from '../../shared/custom-code/validate-and-compile.ts'
import { EXECUTION_TIMEOUT_MS, ISOLATE_MEMORY_LIMIT_MB } from '../../shared/custom-code/runtime-limits.ts'

export const validateAndCompileCustomCode = (source: string, cardId: string) =>
  validateAndCompileCard(source, cardId, (script) => {
    const isolate = new ivm.Isolate({ memoryLimit: ISOLATE_MEMORY_LIMIT_MB })
    try {
      const context = isolate.createContextSync()
      context.global.setSync('global', context.global.derefInto())
      return isolate.compileScriptSync(script).runSync(context, { timeout: EXECUTION_TIMEOUT_MS })
    } finally {
      isolate.dispose()
    }
  })
