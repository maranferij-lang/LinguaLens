import { registerRootComponent } from 'expo';

import App from './App';
import ErrorBoundary from './src/ErrorBoundary';
import { SafeAreaProvider } from './src/SafeArea';

// The error boundary wraps the whole app: a crash in any screen will show
// a clear message instead of a white screen.
function Root() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

registerRootComponent(Root);
