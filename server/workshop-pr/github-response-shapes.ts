const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const positiveInteger = (value: unknown): boolean => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const sha = (value: unknown): boolean => object(value) && text(value.sha)
const ref = (value: unknown): boolean => object(value) && sha(value.object)
const prHead = (value: unknown): boolean => object(value) && sha(value.head)
const repositoryName = (value: unknown): boolean => object(value) && text(value.full_name)

function pullRequest(value: unknown): boolean {
  return object(value) && positiveInteger(value.number) && text(value.html_url)
    && object(value.head) && text(value.head.sha) && text(value.head.ref)
    && (value.head.repo === null || repositoryName(value.head.repo))
    && object(value.base) && text(value.base.ref) && typeof value.draft === 'boolean'
    && (value.state === 'open' || value.state === 'closed')
    && (value.body == null || typeof value.body === 'string')
    && (value.merged_at == null || typeof value.merged_at === 'string')
    && (value.merged === undefined || typeof value.merged === 'boolean')
}

/** Validate fields consumed by each operation before returning untrusted JSON to its caller. */
export const githubResponseShapes = {
  installation_token: (value: unknown) => object(value) && text(value.token)
    && text(value.expires_at) && Number.isFinite(Date.parse(value.expires_at)),
  blob_create: sha,
  commit_read: (value: unknown) => object(value) && sha(value.tree),
  tree_create: sha,
  commit_create: sha,
  main_read: ref,
  branch_read: ref,
  repository_read: (value: unknown) => object(value) && text(value.node_id),
  repository_lineage: (value: unknown) => object(value)
    && (value.source == null || repositoryName(value.source))
    && (value.parent == null || repositoryName(value.parent)),
  branch_publish: (value: unknown) => object(value)
    && (value.errors == null || Array.isArray(value.errors) && value.errors.every(error => object(error) && text(error.message)))
    && (Array.isArray(value.errors) && value.errors.length > 0 || object(value.data) && object(value.data.updateRefs)),
  pr_read: pullRequest,
  pr_head_read: prHead,
  pr_list: (value: unknown) => Array.isArray(value) && value.every(pullRequest),
  tree_read: (value: unknown) => object(value) && typeof value.truncated === 'boolean'
    && Array.isArray(value.tree) && value.tree.every(entry =>
      object(entry) && text(entry.path) && text(entry.mode) && text(entry.type)),
  pr_files: (value: unknown) => Array.isArray(value) && value.every(entry =>
    object(entry) && text(entry.filename) && text(entry.sha) && text(entry.status)
    && (entry.previous_filename === undefined || text(entry.previous_filename))
    && (entry.patch === undefined || typeof entry.patch === 'string')),
  pr_create: (value: unknown) => object(value) && positiveInteger(value.number) && text(value.html_url),
  contents_read: (value: unknown) => object(value) && typeof value.content === 'string'
    && value.encoding === 'base64' && text(value.sha),
}

export type GitHubOperation = keyof typeof githubResponseShapes
