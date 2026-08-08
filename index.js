import { registerRootComponent } from 'expo';

import App from './App';
import ErrorBoundary from './src/ErrorBoundary';
import { SafeAreaProvider } from './src/SafeArea';

// Межа помилок обгортає весь застосунок: падіння в будь-якому екрані дасть
// зрозумілий текст замість білого екрана.
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
