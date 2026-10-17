import { execFileSync } from 'node:child_process'

const bot = 'chatgpt-codex-connector[bot]'
const gate = (state, reasons = [], evidence = []) => ({ state, reasons, evidence })
const sha = /^[a-f0-9]{40}$/

export function github(root, args) {
  return JSON.parse(execFileSync('gh', args, { cwd: root, encoding: 'utf8', timeout: 45000, maxBuffer: 32 * 1024 * 1024 }))
}

function pages(root, endpoint, property) {
  const result = []
  for (let page = 1; page <= 1000; page++) {
    const response = github(root, ['api', `${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100&page=${page}`])
    const items = property ? response[property] : response
    if (!Array.isArray(items)) throw new Error(`invalid GitHub page: ${endpoint}`)
    result.push(...items)
    if (items.length < 100) return result
  }
  throw new Error('GitHub pagination exceeded bound; evidence is incomplete')
}

function graphql(root, query, fields) {
  const response = github(root, ['api', 'graphql', '-f', `query=${query}`, ...Object.entries(fields).flatMap(([key, value]) => ['-F', `${key}=${value}`])])
  if (response.errors) throw new Error(`GitHub GraphQL errors: ${JSON.stringify(response.errors)}`)
  return response.data
}

function allThreads(root, repository, pr) {
  const [owner, name] = repository.split('/')
  const result = []
  let cursor = null
  do {
    const query = `query($owner:String!,$name:String!,$number:Int!,$cursor:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100,after:$cursor){nodes{id isResolved isOutdated comments(first:100){nodes{databaseId author{login} body commit{oid}} pageInfo{hasNextPage endCursor}}} pageInfo{hasNextPage endCursor}}}}}`
    const response = graphql(root, query, { owner, name, number: pr, cursor: cursor ?? 'null' }).repository.pullRequest.reviewThreads
    if (!Array.isArray(response.nodes) || typeof response.pageInfo?.hasNextPage !== 'boolean') throw new Error('incomplete review thread connection')
    for (const thread of response.nodes) {
      if (!thread.comments || !Array.isArray(thread.comments.nodes) || typeof thread.comments.pageInfo?.hasNextPage !== 'boolean') throw new Error('incomplete thread comments connection')
      let commentsCursor = thread.comments.pageInfo.hasNextPage ? thread.comments.pageInfo.endCursor : null
      while (commentsCursor) {
        const commentQuery = `query($id:ID!,$cursor:String!){node(id:$id){... on PullRequestReviewThread{comments(first:100,after:$cursor){nodes{databaseId author{login} body commit{oid}} pageInfo{hasNextPage endCursor}}}}}`
        const connection = graphql(root, commentQuery, { id: thread.id, cursor: commentsCursor }).node.comments
        if (!Array.isArray(connection.nodes) || typeof connection.pageInfo?.hasNextPage !== 'boolean') throw new Error('incomplete subsequent thread comments page')
        thread.comments.nodes.push(...connection.nodes)
        if (connection.pageInfo.hasNextPage && (!connection.pageInfo.endCursor || connection.pageInfo.endCursor === commentsCursor)) throw new Error('thread comments pagination did not advance')
        commentsCursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null
      }
      if (thread.comments.pageInfo.hasNextPage && !thread.comments.pageInfo.endCursor) throw new Error('missing thread comments cursor')
      result.push(thread)
    }
    if (response.pageInfo.hasNextPage && (!response.pageInfo.endCursor || response.pageInfo.endCursor === cursor)) throw new Error('review thread pagination did not advance')
    cursor = response.pageInfo.hasNextPage ? response.pageInfo.endCursor : null
  } while (cursor)
  return result
}

function metadata(body, marker) {
  const match = body.match(new RegExp(`<!-- ${marker}:v1 ([\\s\\S]*?) -->`))
  return match ? JSON.parse(match[1]) : null
}

function reviewGate(summary, kind, head) {
  if (!summary) return { observation: gate('unknown', ['no Codex review summary']), completedAt: null }
  const evidence = [summary.html_url ?? `comment:${summary.id}`]
  const body = summary.body
  let state, security
  try { state = metadata(body, 'codex-review-state'); security = metadata(body, 'codex-security-review') } catch { return { observation: gate('unknown', ['malformed review metadata'], evidence), completedAt: null } }
  const machine = state?.[kind === 'Code Review' ? 'code_review' : 'security_review']
  const line = body.split('\n').find(value => value.includes(`**${kind}**`)) ?? ''
  const short = line.match(/`([a-f0-9]{7,40})`/)?.[1]
  const timestamp = line.match(/datetime="([^"]+)"/)?.[1]
  const completedAt = timestamp && Number.isFinite(Date.parse(timestamp)) ? timestamp : null
  const humanCompleted = /Completed/.test(line) && short && head.startsWith(short) && completedAt
  const cleanProse = /no (?:major|actionable|security|code|unresolved)?\s*(?:issues|findings)|found no (?:issues|findings)/i.test(body)
  if (!machine) return { observation: gate('unknown', [`${kind} exact-head machine state missing`], evidence), completedAt: null }
  if (machine.commit_sha !== head) return { observation: gate('fail', [`${kind} machine state belongs to another head`], evidence), completedAt: null }
  const findings = machine.has_any_findings === true || machine.has_unresolved_findings === true
  const clean = machine.status === 'completed' && machine.has_any_findings === false && machine.has_unresolved_findings === false
  if (findings && cleanProse) return { observation: gate('conflict', [`${kind} prose and machine findings disagree`], evidence), completedAt: humanCompleted ? completedAt : null }
  if (findings) return { observation: gate('fail', [`${kind} machine state reports findings`], evidence), completedAt: humanCompleted ? completedAt : null }
  if (!clean || !humanCompleted) return { observation: gate('unknown', [`${kind} is not completed with clean exact-head metadata and timestamp`], evidence), completedAt: null }
  if (kind === 'Security Review' && (!security || security.headSha !== head || security.status !== 'completed')) return { observation: gate(security ? 'conflict' : 'unknown', ['Security metadata does not confirm the same completed head'], evidence), completedAt: null }
  return { observation: gate('pass', [], evidence), completedAt }
}

export function pullIdentity({ pull, pr, head, repository = 'titanxxh/open-agricola', merged = false }) {
  const reasons = []
  if (pull.number !== pr) reasons.push('PR number differs from the requested target')
  if (pull.head?.sha !== head) reasons.push('PR head differs from the requested exact head')
  if (pull.base?.ref !== 'main') reasons.push('PR base is not main')
  if (pull.base?.repo?.full_name !== repository || pull.head?.repo?.full_name !== repository) reasons.push('PR repository differs from the workflow repository')
  if (pull.draft !== false) reasons.push('PR draft identity is not ready')
  if (merged ? pull.state !== 'closed' || pull.merged !== true || !sha.test(pull.merge_commit_sha) : pull.state !== 'open' || pull.merged === true) reasons.push(merged ? 'PR is not a confirmed merged PR' : 'PR is not open')
  return gate(reasons.length ? 'fail' : 'pass', reasons)
}

export function deriveReview({ pr, expectedHead, expectedPr = pr.number, repository = 'titanxxh/open-agricola', merged = false, comments, reactions, threads }) {
  const head = pr.head.sha
  const summaries = comments.filter(comment => comment.user?.login === bot && typeof comment.body === 'string' && comment.body.includes('<!-- codex-pull-request-review-summary -->'))
  summaries.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
  const summary = summaries[0]
  const code = reviewGate(summary, 'Code Review', head)
  const security = reviewGate(summary, 'Security Review', head)
  const reviewedAt = code.completedAt && security.completedAt ? Math.max(Date.parse(code.completedAt), Date.parse(security.completedAt)) : null
  const thumbs = reviewedAt === null ? [] : reactions.filter(reaction => reaction.user?.login === bot && reaction.content === '+1' && Number.isFinite(Date.parse(reaction.created_at)) && Date.parse(reaction.created_at) >= reviewedAt)
  const unresolved = threads.filter(thread => thread.isResolved !== true)
  return {
    pr: pr.number, head,
    identity: pullIdentity({ pull: pr, pr: expectedPr, head: expectedHead, repository, merged }),
    codeReview: code.observation, securityReview: security.observation,
    physicalThumb: gate(reviewedAt === null ? 'unknown' : thumbs.length ? 'pass' : 'fail', reviewedAt === null ? ['both exact-head review completion times are required to bind the reaction'] : thumbs.length ? [] : ['no physical Codex thumbs-up after both reviews'], thumbs.map(reaction => reaction.url ?? `reaction:${reaction.id}`)),
    threads: gate(unresolved.length ? 'fail' : 'pass', unresolved.length ? [`${unresolved.length} unresolved review threads`] : [], threads.map(thread => thread.id)),
    summary: summary?.html_url ?? null,
    thumbHeadBinding: 'Inferred from the physical reaction time after both exact-head completion timestamps',
  }
}

export function inspectReviews({ root, repository = 'titanxxh/open-agricola', pr, head, merged = false }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !Number.isSafeInteger(pr) || pr < 1 || !sha.test(head)) throw new Error('status requires repository, positive pr and exact head')
  try {
    const pull = github(root, ['api', `repos/${repository}/pulls/${pr}`])
    const comments = pages(root, `repos/${repository}/issues/${pr}/comments`)
    const reactions = pages(root, `repos/${repository}/issues/${pr}/reactions`)
    const threads = allThreads(root, repository, pr)
    return deriveReview({ pr: pull, expectedHead: head, expectedPr: pr, repository, merged, comments, reactions, threads })
  } catch (error) {
    return { pr, head, ...Object.fromEntries(['identity', 'codeReview', 'securityReview', 'physicalThumb', 'threads'].map(name => [name, gate('unknown', [error.message])])) }
  }
}

export function inspectCi({ root, repository = 'titanxxh/open-agricola', head, event, names }) {
  try {
    const paths = { CI: 'ci.yml', 'CI Full': 'ci-full.yml', E2E: 'e2e.yml' }
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !sha.test(head) || !Array.isArray(names) || !names.length || names.some(name => !Object.hasOwn(paths, name))) throw new Error('CI observation requires known workflow policies and an exact repository/head')
    const repo = github(root, ['api', `repos/${repository}`])
    if (repo.full_name !== repository || typeof repo.default_branch !== 'string' || !repo.default_branch.trim()) throw new Error('trusted default branch is unavailable')
    const workflows = names.map(name => {
      const expectedPath = `.github/workflows/${paths[name]}`
      const file = github(root, ['api', `repos/${repository}/contents/${expectedPath}?ref=${encodeURIComponent(repo.default_branch)}`])
      const workflow = github(root, ['api', `repos/${repository}/actions/workflows/${paths[name]}`])
      if (file.type !== 'file' || file.path !== expectedPath || !sha.test(file.sha) || !Number.isSafeInteger(workflow.id) || workflow.id < 1 || workflow.path !== expectedPath || workflow.state !== 'active') throw new Error(`trusted default-branch workflow is unavailable: ${name}`)
      return workflow
    })
    const runs = pages(root, `repos/${repository}/actions/runs?head_sha=${head}&event=${event}`, 'workflow_runs')
    const latest = workflows.map(workflow => runs.filter(run => run.head_sha === head && run.event === event && run.workflow_id === workflow.id
      && run.path === workflow.path && run.repository?.full_name === repository).sort((a, b) => b.id - a.id)[0])
    if (latest.some(run => !run)) return gate('unknown', ['a required exact-head workflow run is absent'])
    if (latest.some(run => run.status === 'completed' && run.conclusion !== 'success')) return gate('fail', ['a required workflow failed'], latest.map(run => run.html_url))
    return gate(latest.every(run => run.status === 'completed' && run.conclusion === 'success') ? 'pass' : 'unknown', [], latest.map(run => run.html_url))
  } catch (error) { return gate('unknown', [error.message]) }
}

/** A CI waiver never replaces the server's atomic up-to-date merge check. */
export function inspectMergeProtection({ root, repository = 'titanxxh/open-agricola', branch = 'main' }) {
  try {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || branch !== 'main') throw new Error('merge protection requires the exact repository/main branch')
    const [owner, name] = repository.split('/')
    const observed = graphql(root, 'query($owner:String!,$name:String!,$branch:String!){repository(owner:$owner,name:$name){nameWithOwner mergeQueue(branch:$branch){id}}}', { owner, name, branch }).repository
    if (observed?.nameWithOwner !== repository || !Object.hasOwn(observed, 'mergeQueue')) throw new Error('merge-queue protection is unknown')
    if (observed.mergeQueue !== null) return gate('fail', ['merge queues are not supported by the rebase-only delivery recipe'])
    const rules = pages(root, `repos/${repository}/rules/branches/${branch}`)
    if (rules.some(rule => rule.type === 'merge_queue')) return gate('fail', ['merge queue is required'])
    if (rules.some(rule => !Number.isSafeInteger(rule.ruleset_id) || rule.ruleset_id < 1)) throw new Error('active ruleset identity is incomplete')
    const details = [...new Set(rules.map(rule => rule.ruleset_id))].map(id => {
      const result = github(root, ['api', `repos/${repository}/rulesets/${id}?includes_parents=true`])
      if (result.id !== id || result.enforcement !== 'active' || result.target !== 'branch' || !Array.isArray(result.bypass_actors) || !Array.isArray(result.rules)) throw new Error('active ruleset enforcement or bypass information is incomplete')
      return result
    })
    if (details.some(rule => rule.bypass_actors.length)) return gate('fail', ['an active ruleset permits bypass'])
    if (details.some(rule => rule.rules.some(item => item.type === 'merge_queue'))) return gate('fail', ['merge queue is required by an active ruleset'])
    let classic = null
    try { classic = github(root, ['api', `repos/${repository}/branches/${branch}/protection`]) } catch (error) {
      if (!/\(HTTP 404\)/.test(String(error.stderr ?? ''))) throw new Error('classic branch protection could not be observed')
    }
    if (classic && (typeof classic.enforce_admins?.enabled !== 'boolean' || !Object.hasOwn(classic, 'required_status_checks'))) throw new Error('classic protection fields are incomplete')
    const allowances = classic?.required_pull_request_reviews?.bypass_pull_request_allowances
    if (classic?.required_pull_request_reviews && (!allowances || ['users', 'teams', 'apps'].some(key => !Array.isArray(allowances[key])))) throw new Error('classic review bypass information is incomplete')
    if (allowances && ['users', 'teams', 'apps'].some(key => allowances[key].length)) return gate('fail', ['classic branch protection permits review bypass'])
    const checks = value => Array.isArray(value) && value.length > 0 && value.every(item => typeof item.context === 'string' && item.context.trim())
    const strict = rule => rule.type === 'required_status_checks' && rule.parameters?.strict_required_status_checks_policy === true && checks(rule.parameters.required_status_checks)
    const classicChecks = classic?.required_status_checks
    const classicStrict = classic?.enforce_admins.enabled === true && classicChecks?.strict === true
      && (checks(classicChecks.checks) || (Array.isArray(classicChecks.contexts) && classicChecks.contexts.length > 0 && classicChecks.contexts.every(context => typeof context === 'string' && context.trim())))
    const rulesetStrict = rules.some(rule => strict(rule) && details.some(detail => detail.id === rule.ruleset_id && detail.rules.some(strict)))
    if (!classicStrict && !rulesetStrict) return gate('fail', ['server-enforced strict up-to-date checks without bypass are required'])
    return gate('pass', [], [{ policy: classicStrict ? 'classic-strict-no-bypass' : 'ruleset-strict-no-bypass', branch, rulesets: details.map(detail => detail.id), mergeQueue: false }])
  } catch (error) { return gate('unknown', [error.message]) }
}
