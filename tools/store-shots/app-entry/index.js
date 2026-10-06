// Вхід для скріншотів App Store. export.mjs кладе його замість index.js у
// тимчасову копію версії (тому імпорти — від кореня застосунку); у збірку
// застосунку він не потрапляє. Той самий Root, що в index.js, і два
// перемикачі з адреси:
//   ?ins=max   відступи безпечної зони iPhone 17 Pro Max (62 зверху, 34
//              знизу), щоб веб-збірка лягала рівно як на телефоні. Сам
//              статус-бар потім не потрібен: кадри обрізають його.
//   ?shot=1    замість застосунку один елемент з window.__SHOT__: картка,
//              наліпка чи перегляд віджетів (shot-gallery.js).
import { registerRootComponent } from 'expo';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import App from './App';
import ErrorBoundary from './src/ErrorBoundary';
import { SafeAreaProvider } from './src/SafeArea';
import ShotGallery from './shot-gallery';

const q = typeof window !== 'undefined' && window.location ? new URLSearchParams(window.location.search) : new URLSearchParams('');
const INSETS = q.get('ins') === 'max' ? { top: 62, bottom: 34, left: 0, right: 0 } : null;

function Root() {
  const body = <ErrorBoundary>{q.get('shot') ? <ShotGallery /> : <App />}</ErrorBoundary>;
  return (
    <SafeAreaProvider>
      {INSETS ? <SafeAreaInsetsContext.Provider value={INSETS}>{body}</SafeAreaInsetsContext.Provider> : body}
    </SafeAreaProvider>
  );
}

registerRootComponent(Root);
