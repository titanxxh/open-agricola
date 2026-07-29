import { Component, type ReactNode } from 'react'

type AppErrorBoundaryProps = {
  children: ReactNode
  fallback: ReactNode
}

type AppErrorBoundaryState = {
  failed: boolean
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
