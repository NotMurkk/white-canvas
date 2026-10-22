// What the app's "/" route mounts. Loaded in the browser only: Phaser needs a real DOM and WebGL.
import { App } from './App.tsx';
import type { MapStorage } from './editor/storage.ts';
import './styles.css';

export default function MapEditor({ gameUrl, storage }: { gameUrl: string; storage?: MapStorage | undefined }) {
  return <App gameUrl={gameUrl} storage={storage} />;
}
