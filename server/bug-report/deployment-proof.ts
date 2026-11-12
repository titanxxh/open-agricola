import { isCommitSha, type VerifiedFixPullRequest } from '../../shared/contract/bug-report-feedback'

export type ProductionRelease = { version: string; url: string; sha: string; publishedAt: number }
export type DeploymentProof = {
  repository: 'titanxxh/open-agricola'
  release: ProductionRelease & { draft: false; prerelease: false; tagSha: string }
  candidate: { status: 'passed'; repository: string; sha: string; configuration: string; requiredTaskIds: string[];
    tasks: Array<{ id: string; status: 'passed'; reason: null; runId: number; jobId: number; url: string }> }
  frontend: { format: 1; gameBuildId: string; basePath: string; url: string }
  backend: { gameBuildId: string; running: true; ready: true; containerId: string }
  ancestry: { format: 'git-raw-closure-v1'; commits: string[] }
  observedAt: number
}

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_deployment_proof')
  return Object.fromEntries(Object.entries(value))
}
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim()
export function parseDeploymentProof(value: unknown): DeploymentProof {
  const proof = object(value), release = object(proof.release), candidate = object(proof.candidate)
  const frontend = object(proof.frontend), backend = object(proof.backend), ancestry = object(proof.ancestry)
  if (proof.repository !== 'titanxxh/open-agricola' || !positive(proof.observedAt)
    || !text(release.version) || !/^v\d+\.\d+\.\d+$/.test(release.version)
    || release.url !== `https://github.com/titanxxh/open-agricola/releases/tag/${release.version}`
    || !isCommitSha(release.sha) || release.tagSha !== release.sha || release.draft !== false || release.prerelease !== false
    || !positive(release.publishedAt) || release.publishedAt > proof.observedAt
    || candidate.status !== 'passed' || candidate.repository !== proof.repository || candidate.sha !== release.sha
    || typeof candidate.configuration !== 'string' || !/^[a-f0-9]{64}$/.test(candidate.configuration)
    || !Array.isArray(candidate.requiredTaskIds) || !candidate.requiredTaskIds.length || candidate.requiredTaskIds.length > 64
    || !candidate.requiredTaskIds.every((id: unknown): id is string => typeof id === 'string' && /^[a-z0-9-]{1,100}$/.test(id))
    || new Set(candidate.requiredTaskIds).size !== candidate.requiredTaskIds.length
    || !Array.isArray(candidate.tasks) || !candidate.tasks.length
    || frontend.format !== 1 || frontend.gameBuildId !== release.sha || typeof frontend.basePath !== 'string'
    || !/^\/(?:[^?#\s]*\/)?$/.test(frontend.basePath) || !text(frontend.url)
    || backend.gameBuildId !== release.sha || backend.running !== true || backend.ready !== true || !text(backend.containerId)
    || ancestry.format !== 'git-raw-closure-v1' || !Array.isArray(ancestry.commits) || !ancestry.commits.every(isCommitSha)
    || !ancestry.commits.includes(release.sha)) throw new Error('invalid_deployment_proof')
  const tasks = candidate.tasks.map((entry: unknown) => {
    const task = object(entry)
    if (!text(task.id) || task.status !== 'passed' || task.reason !== null || !positive(task.runId) || !positive(task.jobId)
      || !text(task.url) || !task.url.startsWith('https://github.com/titanxxh/open-agricola/actions/runs/')) throw new Error('invalid_deployment_proof')
    return { id: task.id, status: task.status, reason: null, runId: task.runId, jobId: task.jobId, url: task.url } satisfies DeploymentProof['candidate']['tasks'][number]
  })
  if (new Set(tasks.map(task => task.id)).size !== tasks.length || tasks.length !== candidate.requiredTaskIds.length
    || !candidate.requiredTaskIds.every(id => tasks.some(task => task.id === id))) throw new Error('invalid_deployment_proof')
  const source = new URL(frontend.url)
  if (!['https:', 'http:'].includes(source.protocol) || source.username || source.password
    || source.pathname !== `${frontend.basePath}frontend-build.json`) throw new Error('invalid_deployment_proof')
  return { repository: proof.repository, observedAt: proof.observedAt,
    release: { version: release.version, url: release.url, sha: release.sha, tagSha: release.sha,
      draft: false, prerelease: false, publishedAt: release.publishedAt },
    candidate: { status: 'passed', repository: proof.repository, sha: release.sha, configuration: candidate.configuration, requiredTaskIds: candidate.requiredTaskIds, tasks },
    frontend: { format: 1, gameBuildId: release.sha, basePath: frontend.basePath, url: source.href },
    backend: { gameBuildId: release.sha, running: true, ready: true, containerId: backend.containerId },
    ancestry: { format: 'git-raw-closure-v1', commits: [...new Set(ancestry.commits)].sort() } }
}

export type VerifiedDeployment = { operationId: string; proof: DeploymentProof }
/** Read-only planner shared by live reconciliation and owner previews. */
export function planFixDeployment(pullRequests: VerifiedFixPullRequest[], deployments: VerifiedDeployment[]) {
  const requiredCommits = [...new Set(pullRequests.flatMap(pr => [...pr.requiredCommits, pr.mergeCommit]))].sort()
  const ordered = [...deployments].sort((a, b) => a.proof.observedAt - b.proof.observedAt || a.operationId.localeCompare(b.operationId))
  const included = requiredCommits.length ? ordered.filter(deployment => requiredCommits.every(sha => deployment.proof.ancestry.commits.includes(sha))) : []
  const latest = ordered.at(-1)
  const missingCommits = requiredCommits.filter(sha => !latest?.proof.ancestry.commits.includes(sha))
  return { requiredCommits, included, firstVerified: included[0],
    currentProduction: requiredCommits.length && latest && !missingCommits.length ? latest : undefined, missingCommits }
}
