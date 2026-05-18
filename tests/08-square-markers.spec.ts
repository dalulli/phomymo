import { test, expect } from '@playwright/test';
import { waitForAppReady, dismissInfoDialog } from './helpers/app';

async function saveDesignElements(page, name: string) {
  await page.click('#save-btn');
  await page.locator('#save-name').fill(name);
  await page.click('#save-confirm');

  return page.evaluate((designName) => {
    const designs = JSON.parse(localStorage.getItem('phomymo_designs') || '{}');
    return designs[designName]?.elements || [];
  }, name);
}

async function openMarkerProperties(page, kind: 'apriltag' | 'aruco') {
  await page.click(`#add-${kind}-btn`);
  await expect(page.locator(`#props-${kind}`)).toBeVisible();
  await expect(page.locator(`#${kind}-marker-grid`)).toBeVisible();
}

async function selectMarkers(page, kind: 'apriltag' | 'aruco', ids: string[]) {
  await page.click(`#${kind}-clear-selection`);
  for (const id of ids) {
    await page.locator(`#${kind}-marker-grid .${kind}-marker-option[data-marker-id="${id}"]`).click();
  }
}

test.describe.serial('AprilTag and ArUco builders', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await waitForAppReady(page);
    await dismissInfoDialog(page);
  });

  test('loads AprilTag and ArUco data modules', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const apriltag = await import('/apriltag.js');
      const aruco = await import('/aruco.js');
      return {
        aprilFamilies: apriltag.getAprilTagFamilies(),
        aprilMatrixCells: apriltag.getAprilTagMatrix('tag25h9', 0).length,
        aprilHighId: apriltag.normalizeAprilTagId(9999, 'tag25h9'),
        arucoDictionaries: aruco.getArUcoDictionaries(),
        arucoMatrixCells: aruco.getArUcoMatrix('DICT_4X4_50', 0).length,
        arucoHighId: aruco.normalizeArUcoId(9999, 'DICT_4X4_50'),
      };
    });

    expect(result.aprilFamilies).toContain('tag25h9');
    expect(result.aprilMatrixCells).toBeGreaterThan(0);
    expect(result.aprilHighId).toBeGreaterThan(0);
    expect(result.arucoDictionaries).toEqual([
      'DICT_4X4_50',
      'DICT_5X5_100',
      'DICT_6X6_250',
      'DICT_7X7_250',
    ]);
    expect(result.arucoMatrixCells).toBe(6);
    expect(result.arucoHighId).toBe(49);
  });

  test('adds an AprilTag block with editable ID text', async ({ page }) => {
    await openMarkerProperties(page, 'apriltag');
    await page.locator('#apriltag-family').selectOption('tag25h9');
    await selectMarkers(page, 'apriltag', ['3']);
    await page.locator('#apriltag-size').fill('120');
    await page.click('#apriltag-add-marker');

    await expect(page.locator('#props-apriltag')).toBeVisible();
    await expect(page.locator('#apriltag-id-text-controls')).toBeVisible();
    await page.locator('#prop-apriltag-id-text').fill('AT3');

    const elements = await saveDesignElements(page, 'apriltag-block');
    const marker = elements.find(el => el.type === 'apriltag');
    const text = elements.find(el => el.cctagBlockKind === 'apriltag' && el.cctagBlockRole === 'id');

    expect(marker).toMatchObject({
      markerId: 3,
      aprilTagFamily: 'tag25h9',
      width: 96,
      height: 96,
      cctagBlockRole: 'marker',
      cctagBlockKind: 'apriltag',
    });
    expect(text).toMatchObject({
      text: 'AT3',
      cctagBlockRole: 'id',
      cctagBlockKind: 'apriltag',
    });
    expect(text.groupId).toBe(marker.groupId);
    expect(text.cctagBlockId).toBe(marker.cctagBlockId);
  });

  test('adds and reflows an ArUco strip', async ({ page }) => {
    await openMarkerProperties(page, 'aruco');
    await page.locator('#aruco-dictionary').selectOption('DICT_4X4_50');
    await selectMarkers(page, 'aruco', ['1', '4', '6']);
    await page.locator('#aruco-layout').selectOption('even');
    await page.click('#aruco-add-marker');

    await expect(page.locator('#props-aruco')).toBeVisible();
    await expect(page.locator('#aruco-strip-edit-controls')).toBeVisible();
    await page.locator('#aruco-strip-id-gap').fill('8');
    await page.locator('#aruco-strip-min-gap').fill('14');
    await page.locator('#aruco-strip-max-gap').fill('14');
    await page.click('#aruco-strip-apply');

    const elements = await saveDesignElements(page, 'aruco-strip');
    const markers = elements.filter(el => el.type === 'aruco');
    const texts = elements.filter(el => el.cctagBlockKind === 'aruco' && el.cctagBlockRole === 'id');

    expect(markers.map(el => el.markerId)).toEqual([1, 4, 6]);
    expect(markers.every(el => el.arucoDictionary === 'DICT_4X4_50')).toBe(true);
    expect(texts.map(el => el.text)).toEqual(['#001', '#004', '#006']);

    const blocks = Array.from(new Set(elements.map(el => el.cctagBlockId).filter(Boolean))).map(blockId => {
      const members = elements.filter(el => el.cctagBlockId === blockId);
      const text = members.find(el => el.cctagBlockRole === 'id');
      const marker = members.find(el => el.cctagBlockRole === 'marker');
      return {
        minX: Math.min(...members.map(el => el.x)),
        maxX: Math.max(...members.map(el => el.x + el.width)),
        idGap: marker.x - (text.x + text.width),
      };
    }).sort((a, b) => a.minX - b.minX);

    expect(blocks).toHaveLength(3);
    expect(blocks.every(block => block.idGap === 8)).toBe(true);
    expect(Math.round(blocks[1].minX - blocks[0].maxX)).toBe(14);
    expect(Math.round(blocks[2].minX - blocks[1].maxX)).toBe(14);
  });
});
