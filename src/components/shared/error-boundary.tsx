"use client";

import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive mb-4" />
          <h2 className="text-sm font-bold mb-2">页面出现异常</h2>
          <p className="text-xs text-muted-foreground mb-4 max-w-md">
            {this.state.error?.message || "未知错误"}
          </p>
          <Button variant="outline" size="sm" className="text-xs" onClick={this.handleRetry}>
            <RefreshCw className="h-3 w-3 mr-1" /> 重试
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
