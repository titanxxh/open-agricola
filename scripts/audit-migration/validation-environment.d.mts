export function validationEnvironment(input: {
  services: { databaseEnv: string; localServicesEnv: string; projectName: string }
  output: string
  host?: NodeJS.ProcessEnv
}): { environment: NodeJS.ProcessEnv & { LOCAL_SERVICES_DIR: string }; localServicesContents: string }
