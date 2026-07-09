import { initInjection } from './inject';
import { startObserver } from './observer';
import { initSidebar } from '../ui/sidebar';
import '../../styles/copy-button.css';
import '../../styles/sidebar.css';

async function main(): Promise<void> {
  await initInjection();
  await initSidebar();
  startObserver();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void main());
} else {
  void main();
}
