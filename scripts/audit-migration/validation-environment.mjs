import fs from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'

const fail = message => { throw new Error(message) }
const inheritedKeys = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'TERM', 'COLORTERM', 'CI', 'PNPM_HOME', 'COREPACK_HOME', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME']
const serviceKeys = ['LOCAL_POSTGRES_PASSWORD', 'LOCAL_POSTGRES_PORT', 'LOCAL_S3_ACCESS_KEY', 'LOCAL_S3_SECRET_KEY', 'LOCAL_S3_PORT']

function readEnvironment(file, name) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) fail(`services.${name} must name an explicit absolute local test configuration file`)
  const stat = fs.lstatSync(file)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) fail(`services.${name} must be a small regular file`)
  return parseEnv(fs.readFileSync(file, 'utf8'))
}

/** Restrict subprocess environment inheritance. HOME and filesystem access are not sandboxed. */
export function validationEnvironment({ services, output, host = process.env }) {
  if (typeof services?.projectName !== 'string' || !/^oa-audit-[a-z0-9][a-z0-9_-]{0,47}$/.test(services.projectName)) fail('services.projectName must be a private oa-audit- Compose project')
  const local = readEnvironment(services.localServicesEnv, 'localServicesEnv')
  for (const key of serviceKeys) if (typeof local[key] !== 'string' || !local[key].trim() || /[\r\n\0]/.test(local[key])) fail(`local test service configuration is missing a single-line ${key}`)
  for (const key of ['LOCAL_POSTGRES_PORT', 'LOCAL_S3_PORT']) {
    if (!/^[1-9][0-9]{0,4}$/.test(local[key]) || Number(local[key]) > 65535) fail(`local test service configuration has an invalid ${key}`)
  }
  const database = readEnvironment(services.databaseEnv, 'databaseEnv').TEST_DATABASE_URL
  let url
  try { url = new URL(database ?? '') } catch { fail('local TEST_DATABASE_URL is missing or invalid') }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.pathname !== '/agricola_test' || url.search || url.hash || url.username !== 'agricola'
    || decodeURIComponent(url.password) !== local.LOCAL_POSTGRES_PASSWORD || (url.port || '5432') !== local.LOCAL_POSTGRES_PORT) fail('TEST_DATABASE_URL must match the explicit local agricola_test service')
  const environment = Object.fromEntries(inheritedKeys.filter(key => typeof host[key] === 'string').map(key => [key, host[key]]))
  Object.assign(environment, {
    TEST_DATABASE_URL: database,
    TEST_S3_ENDPOINT: `http://127.0.0.1:${local.LOCAL_S3_PORT}`,
    TEST_S3_BUCKET: 'agricola-test', TEST_S3_REGION: 'us-east-1',
    TEST_S3_ACCESS_KEY_ID: local.LOCAL_S3_ACCESS_KEY, TEST_S3_SECRET_ACCESS_KEY: local.LOCAL_S3_SECRET_KEY,
    SHARED_DATA_DIR: path.join(output, 'services-data'), LOCAL_SERVICES_DIR: path.join(output, 'services-config'),
    AGRICOLA_TEST_EVIDENCE_DIR: path.join(output, 'native-evidence'),
    COMPOSE_PROJECT_NAME: services.projectName, DOCKER_CONTEXT: 'default',
  })
  const localServicesContents = `${serviceKeys.map(key => {
    const quote = ["'", '"'].find(delimiter => !local[key].includes(delimiter))
    if (!quote) fail(`local test service configuration cannot safely quote ${key}`)
    return `${key}=${quote}${local[key]}${quote}`
  }).join('\n')}\n`
  return { environment, localServicesContents }
}
