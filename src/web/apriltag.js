import { APRILTAG_FAMILIES } from './apriltag-data.js?v=2';

export const APRILTAG_FAMILY_ORDER = [
  'tagStandard41h12',
  'tag36h11',
  'tag25h9',
  'tag16h5',
];

export const APRILTAG_MIN_SIZE = 16;

export function getAprilTagFamilies() {
  return APRILTAG_FAMILY_ORDER.filter(name => APRILTAG_FAMILIES[name]);
}

export function getAprilTagFamily(name = 'tag25h9') {
  return APRILTAG_FAMILIES[name] || APRILTAG_FAMILIES.tag25h9;
}

export function normalizeAprilTagFamily(name) {
  return getAprilTagFamily(name).name;
}

export function getAprilTagMaxId(familyName) {
  return getAprilTagFamily(familyName).codes.length - 1;
}

export function normalizeAprilTagId(value, familyName) {
  const maxId = getAprilTagMaxId(familyName);
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(maxId, parsed));
}

export function formatAprilTagId(value, familyName = 'tag25h9') {
  const id = normalizeAprilTagId(value, familyName);
  return `${normalizeAprilTagFamily(familyName)} #${String(id).padStart(3, '0')}`;
}

export function getAprilTagMatrix(familyName, id) {
  const family = getAprilTagFamily(familyName);
  const normalizedId = normalizeAprilTagId(id, family.name);
  const code = BigInt(family.codes[normalizedId]);
  const totalWidth = family.totalWidth;
  const matrix = Array.from({ length: totalWidth }, () => Array(totalWidth).fill(false));

  for (let y = 0; y < totalWidth; y++) {
    for (let x = 0; x < totalWidth; x++) {
      matrix[y][x] = family.reversedBorder;
    }
  }

  const borderOffset = Math.floor((totalWidth - family.widthAtBorder) / 2);
  for (let y = borderOffset; y < borderOffset + family.widthAtBorder; y++) {
    for (let x = borderOffset; x < borderOffset + family.widthAtBorder; x++) {
      matrix[y][x] = !family.reversedBorder;
    }
  }

  for (let bit = 0; bit < family.nbits; bit++) {
    const mask = 1n << BigInt(family.nbits - 1 - bit);
    const x = family.bitX[bit] + borderOffset;
    const y = family.bitY[bit] + borderOffset;
    matrix[y][x] = (code & mask) !== 0n;
  }

  return matrix;
}
