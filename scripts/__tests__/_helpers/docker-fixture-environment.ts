/** Fake Docker adapters own their connection context, independently of CI isolation. */
export function dockerFixtureEnvironment(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('DOCKER_'))), ...extra }
}
