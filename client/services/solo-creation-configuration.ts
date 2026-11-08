import { isSoloCreationConfiguration, type SoloCreationConfigurationResponse, type SoloCreationErrorCode, type SoloCreationIssue } from '../../shared/contract/game-creation'
import { API_BASE } from '../config'

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const reasons: SoloCreationIssue['reason'][] = ['missing', 'not-live', 'load-failed', 'not-applicable', 'community-takeover']
const issue = (value: unknown): value is SoloCreationIssue => object(value)
  && typeof value.workshopCardId === 'string' && reasons.some(reason => reason === value.reason)
  && (value.logicalCardId === undefined || typeof value.logicalCardId === 'string')
const codes: SoloCreationErrorCode[] = ['login_required', 'not_participant', 'source_not_completed', 'source_not_solo', 'source_removed', 'creation_configuration_unavailable', 'creation_requires_adjustment']
const errorCode = (value: unknown): value is SoloCreationErrorCode => codes.some(code => code === value)

export async function readSoloCreationConfiguration(roomId: string, signal?: AbortSignal): Promise<SoloCreationConfigurationResponse> {
  const response = await fetch(`${API_BASE}/api/v1/game-contexts/${encodeURIComponent(roomId)}/creation-configuration`, {
    credentials: 'include', cache: 'no-store', signal,
  })
  const value: unknown = await response.json()
  if (object(value) && value.ok === true && response.ok && isSoloCreationConfiguration(value.configuration)
    && Array.isArray(value.issues) && value.issues.every(issue)) {
    return { ok: true, configuration: value.configuration, issues: value.issues }
  }
  if (object(value) && value.ok === false && errorCode(value.code) && typeof value.message === 'string') {
    return { ok: false, code: value.code, message: value.message }
  }
  throw new Error('Creation configuration response unavailable')
}
