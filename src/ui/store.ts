import { SKINS, VIEW_MODES, type SkinId, type ViewMode } from '../contracts';

const SKIN_KEY = 'snake3d.skin';
const VIEW_KEY = 'snake3d.view';
const HI_KEY = 'snake3d.highscore';

export function loadSkin(): SkinId {
  try {
    const v = localStorage.getItem(SKIN_KEY);
    if (v && (SKINS as readonly string[]).includes(v)) return v as SkinId;
  } catch { /* storage unavailable */ }
  return 'classic';
}
export function saveSkin(s: SkinId): void {
  try { localStorage.setItem(SKIN_KEY, s); } catch { /* ignore */ }
}
export function loadHighscore(): number {
  try {
    const n = Number(localStorage.getItem(HI_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch { return 0; }
}
export function saveHighscore(n: number): void {
  try { localStorage.setItem(HI_KEY, String(n)); } catch { /* ignore */ }
}
export function loadView(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v && (VIEW_MODES as readonly string[]).includes(v)) return v as ViewMode;
  } catch { /* storage unavailable */ }
  return '3d';
}
export function saveView(m: ViewMode): void {
  try { localStorage.setItem(VIEW_KEY, m); } catch { /* ignore */ }
}
