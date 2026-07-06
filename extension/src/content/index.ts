import { initInjection } from './inject';
import { startObserver } from './observer';

async function main(): Promise<void> {
  await initInjection();
  startObserver();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void main());
} else {
  void main();
}
