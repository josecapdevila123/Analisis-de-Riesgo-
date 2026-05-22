import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-[#E4E3E0] text-[#141414] p-8 font-sans">
          <AlertTriangle className="w-16 h-16 text-red-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2 uppercase tracking-tight">Algo salió mal</h1>
          <p className="text-sm opacity-70 mb-4 text-center max-w-md">
            Ocurrió un error inesperado en la aplicación. Por favor, recarga la página o contacta a soporte si el problema persiste.
          </p>
          <div className="bg-[#141414]/5 p-4 rounded text-xs font-mono max-w-2xl overflow-auto w-full text-left">
            {this.state.error?.message}
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="mt-8 px-6 py-2 bg-[#141414] text-[#E4E3E0] font-bold uppercase text-sm hover:bg-[#141414]/80 transition-colors"
          >
            Recargar Aplicación
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
