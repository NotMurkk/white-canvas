// What the app's "/" route mounts. Loaded in the browser only: Phaser needs a real DOM and WebGL.
import { App } from './App.tsx';
import './styles.css';

export default function MapEditor({ gameUrl }: { gameUrl: string }) {
  return <App gameUrl={gameUrl} />;
}
