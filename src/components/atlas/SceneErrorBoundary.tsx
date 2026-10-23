"use client";

import { Component, type ReactNode } from "react";

interface Props {
  onError: (error: unknown) => void;
  fallback: ReactNode;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/** Catches WebGL/renderer creation failures so the 2D fallback can take over. */
export class SceneErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
