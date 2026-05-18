const CCTAG_ASSET_URL = new URL('./assets/cctag3.txt', import.meta.url);

export const CCTAG_MIN_ID = 0;
export const CCTAG_MAX_ID = 31;
export const CCTAG_MIN_SIZE = 16;

let cctagRadii = null;

export async function loadCCTagRadii() {
  if (cctagRadii) return cctagRadii;

  const response = await fetch(CCTAG_ASSET_URL.href);
  if (!response.ok) {
    throw new Error(`Failed to load CCTag radii: ${response.status}`);
  }

  const rows = (await response.text())
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split(/\s+/).map(value => Number.parseInt(value, 10)));

  if (
    rows.length !== 32 ||
    rows.some(row => row.length !== 5 || row.some(value => !Number.isFinite(value)))
  ) {
    throw new Error('Invalid CCTag radius table');
  }

  cctagRadii = rows;
  return cctagRadii;
}

export function isCCTagReady() {
  return Array.isArray(cctagRadii);
}

export function normalizeCCTagId(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return CCTAG_MIN_ID;
  return Math.max(CCTAG_MIN_ID, Math.min(CCTAG_MAX_ID, parsed));
}

export function formatCCTagId(value) {
  return `#${String(normalizeCCTagId(value)).padStart(2, '0')}`;
}

export function getCCTagRadii(value) {
  if (!cctagRadii) return null;
  return cctagRadii[normalizeCCTagId(value)];
}
