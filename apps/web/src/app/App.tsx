import { Providers } from './providers.tsx';
import { Router } from './router.tsx';

export function App() {
  return (
    <Providers>
      <Router />
    </Providers>
  );
}
