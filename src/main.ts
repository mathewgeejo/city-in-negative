import '@fontsource/josefin-sans/300.css';
import '@fontsource/josefin-sans/400.css';
import '@fontsource/josefin-sans/600.css';
import '@fontsource/josefin-sans/700.css';
import '@fontsource/special-elite/400.css';
import '@fontsource/caveat/400.css';
import './ui/styles.css';
import { installDebug } from './debug';
import { Game } from './game/game';
import { loadSave } from './game/save';
import { CURATED_SEED } from './gen/history';
import { UI } from './ui/ui';

async function boot() {
  // Canvas lettering is drawn with these faces, so they must be ready before the atlas is built.
  await Promise.all([
    document.fonts.load('700 40px "Josefin Sans"'), document.fonts.load('400 20px "Josefin Sans"'),
    document.fonts.load('400 20px "Special Elite"'), document.fonts.load('400 20px "Caveat"'),
  ]).catch(() => {});
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const game = new Game(canvas);
  const ui = new UI(game);
  game.ui = ui;
  const params = new URLSearchParams(location.search);
  const seed = params.get('seed') ?? loadSave()?.seed ?? CURATED_SEED;
  await game.load(seed, null, false);
  game.start();
  installDebug(game);
  if (params.has('bench') || params.has('auto')) return;
  ui.showTitle();
}

void boot();
