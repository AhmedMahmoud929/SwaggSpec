import { initInjection } from './inject';
import { startObserver } from './observer';
import '../../styles/copy-button.css';

async function main(): Promise<void> {
  await initInjection();
  startObserver();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void main());
} else {
  void main();
}
