/**
 * CustomCodeExecutor — injection-friendly interface for running custom card code.
 *
 * Two implementations (wired in later PRs):
 *   - ServerIsolateExecutor (server, isolated-vm + Worker Thread) — multiplayer
 *   - LocalBrowserExecutor (client, direct execution) — sandbox
 *
 * `shared/custom-code/runtime.ts` and `GameCore` depend on this interface,
 * not on either implementation.
 */
import type {
  CustomCodeEffectInvocation,
  CustomCodeEffectResult,
  CustomCodeListenerInvocation,
  CustomCodeListenerResult,
} from './types'

export interface CustomCodeExecutor {
  runEffect(req: CustomCodeEffectInvocation): CustomCodeEffectResult
  runListener(req: CustomCodeListenerInvocation): CustomCodeListenerResult
}
