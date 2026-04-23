import React from 'react';
import ErrorPage from '../pages/ErrorPage.jsx';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  handleRetry() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen app-shell text-white flex items-center justify-center p-4">
          <ErrorPage error={this.state.error} onRetry={this.handleRetry} />
        </div>
      );
    }
    return this.props.children;
  }
}
