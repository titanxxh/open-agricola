# Security Policy

## Supported Versions

Only the latest `main` branch and the current live deployment are supported.
There are no maintained release branches.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, use one of these private channels:

- **GitHub private vulnerability reporting** (preferred): go to the
  [Security tab](https://github.com/titanxxh/open-agricola/security) of this
  repository and click "Report a vulnerability".
- **Email**: <titanxxh@gmail.com>

Please include:

- A description of the vulnerability and its impact
- Steps to reproduce, or a proof of concept
- The affected component (e.g. auth, WebSocket rooms, custom card sandbox,
  HTTP API, deployment configuration)

You can expect an acknowledgement within 7 days. Once the issue is confirmed
and fixed, we will credit you in the fix (unless you prefer to stay anonymous).

## Scope

Reports of particular interest:

- Custom card sandbox escapes (isolated-vm / worker isolation)
- Authentication, session, and OAuth flaws
- Cross-room information leaks or unauthorized state mutation over WebSocket
- SQL injection or data-integrity issues

Out of scope: denial of service against the public demo instance, and issues
requiring physical access to the server.
