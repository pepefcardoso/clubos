"use client";
import { Component, type ReactNode } from "react";

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    errorId?: string;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(): State {
        return { hasError: true, errorId: crypto.randomUUID() };
    }

    componentDidCatch(error: Error, info: { componentStack: string }) {
        // Sentry.captureException(error, { extra: info });
        console.error("[ErrorBoundary]", error, info.componentStack);
    }

    render() {
        if (this.state.hasError) {
            return (
                this.props.fallback ?? (
                    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                        <p className="font-semibold text-neutral-700">
                            Algo deu errado nesta seção.
                        </p>
                        <p className="text-sm text-neutral-400 mt-1">
                            Recarregue a página ou contate o suporte.
                        </p>
                        <button
                            type="button"
                            onClick={() => this.setState({ hasError: false })}
                            className="mt-4 text-sm text-primary-600 underline hover:text-primary-700"
                        >
                            Tentar novamente
                        </button>
                    </div>
                )
            );
        }
        return this.props.children;
    }
}