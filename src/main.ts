import '@fontsource/limelight';
import '@fontsource/special-elite';
import '@fontsource/bebas-neue';
import './styles/main.css';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/app';
import { syncMotionAttribute } from './ui/dom';

syncMotionAttribute();
const app = new App(document.getElementById('app')!);

// Accès de débogage en développement uniquement (jamais dans le build).
if (import.meta.env.DEV) (window as unknown as { casino: App }).casino = app;

// Service worker : jeu jouable hors ligne après le premier chargement.
if ('serviceWorker' in navigator && import.meta.env.PROD) registerSW({ immediate: true });
