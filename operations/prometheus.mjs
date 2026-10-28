export function prometheusConfig({ app, host, accounts, self = 'localhost:9090' }) {
  const authorization = '    authorization:\n      credentials_file: /etc/prometheus/metrics-token\n'
  return `global:
  scrape_interval: 15s
  scrape_timeout: 5s
scrape_configs:
  - job_name: agricola-ingress
    metrics_path: /internal/metrics
${authorization}    static_configs:
      - targets: ['${app}']
  - job_name: agricola-app
${authorization}    http_sd_configs:
      - url: http://${app}/internal/metrics/targets
        refresh_interval: 15s
        authorization:
          credentials_file: /etc/prometheus/metrics-token
  - job_name: accounts
    metrics_path: /internal/metrics
${authorization}    static_configs:
      - targets: ['${accounts}']
  - job_name: host
    static_configs:
      - targets: ['${host}']
  - job_name: prometheus
    static_configs:
      - targets: ['${self}']
`
}
