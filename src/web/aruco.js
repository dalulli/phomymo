import { ARUCO_DICTIONARIES } from './aruco-data.js?v=2';

export const ARUCO_DICTIONARY_ORDER = [
  'DICT_4X4_50',
  'DICT_5X5_100',
  'DICT_6X6_250',
  'DICT_7X7_250',
];

export const ARUCO_MIN_SIZE = 16;

export function getArUcoDictionaries() {
  return ARUCO_DICTIONARY_ORDER.filter(name => ARUCO_DICTIONARIES[name]);
}

export function getArUcoDictionary(name = 'DICT_6X6_250') {
  return ARUCO_DICTIONARIES[name] || ARUCO_DICTIONARIES.DICT_6X6_250;
}

export function normalizeArUcoDictionary(name) {
  return getArUcoDictionary(name).name;
}

export function getArUcoMaxId(dictionaryName) {
  return getArUcoDictionary(dictionaryName).codes.length - 1;
}

export function normalizeArUcoId(value, dictionaryName) {
  const maxId = getArUcoMaxId(dictionaryName);
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(maxId, parsed));
}

export function formatArUcoId(value, dictionaryName = 'DICT_6X6_250') {
  const id = normalizeArUcoId(value, dictionaryName);
  return `${normalizeArUcoDictionary(dictionaryName)} #${String(id).padStart(3, '0')}`;
}

export function getArUcoMatrix(dictionaryName, id) {
  const dictionary = getArUcoDictionary(dictionaryName);
  const normalizedId = normalizeArUcoId(id, dictionary.name);
  const code = BigInt(dictionary.codes[normalizedId]);
  const totalWidth = dictionary.totalWidth;
  const markerSize = dictionary.markerSize;
  const matrix = Array.from({ length: totalWidth }, () => Array(totalWidth).fill(false));

  for (let y = 0; y < totalWidth; y++) {
    for (let x = 0; x < totalWidth; x++) {
      const isBorder = x === 0 || y === 0 || x === totalWidth - 1 || y === totalWidth - 1;
      matrix[y][x] = isBorder;
    }
  }

  for (let bit = 0; bit < markerSize * markerSize; bit++) {
    const mask = 1n << BigInt(markerSize * markerSize - 1 - bit);
    const x = 1 + (bit % markerSize);
    const y = 1 + Math.floor(bit / markerSize);
    matrix[y][x] = (code & mask) !== 0n;
  }

  return matrix;
}
