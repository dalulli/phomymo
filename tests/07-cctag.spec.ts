import { test, expect } from '@playwright/test';
import { waitForAppReady, dismissInfoDialog } from './helpers/app';

async function openCCTagProperties(page) {
  await expect(page.locator('#add-cctag-btn')).toBeEnabled();
  await page.click('#add-cctag-btn');
  await expect(page.locator('#props-cctag')).toBeVisible();
  await expect(page.locator('#cctag-marker-grid')).toBeVisible();
}

async function selectDesktopCCTagMarkers(page, markerIds: string[]) {
  await page.click('#cctag-clear-selection');
  for (const markerId of markerIds) {
    await page.locator(`#cctag-marker-grid .cctag-marker-option[data-marker-id="${markerId}"]`).click();
  }
}

async function addDesktopCCTag(page, markerId = '1', addId = true, size?: string) {
  await openCCTagProperties(page);
  await selectDesktopCCTagMarkers(page, [markerId]);
  await page.locator('#cctag-add-id').setChecked(addId);
  if (size !== undefined) {
    await page.locator('#cctag-size').fill(size);
  }
  await page.click('#cctag-add-marker');
  await expect(page.locator('#props-cctag')).toBeVisible();
}

async function saveDesignElements(page, name: string) {
  await page.click('#save-btn');
  await page.locator('#save-name').fill(name);
  await page.click('#save-confirm');

  return page.evaluate((designName) => {
    const designs = JSON.parse(localStorage.getItem('phomymo_designs') || '{}');
    return designs[designName]?.elements || [];
  }, name);
}

test.describe.serial('CCTag', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await waitForAppReady(page);
    await dismissInfoDialog(page);
  });

  test('loads CCTag radii and normalizes marker IDs', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const cctag = await import('/cctag.js');
      const elements = await import('/elements.js');
      const radii = await cctag.loadCCTagRadii();
      const marker = elements.createCCTagElement(99, { width: 12 });

      return {
        rowCount: radii.length,
        firstRow: radii[0],
        formatted: cctag.formatCCTagId(1),
        normalizedLow: cctag.normalizeCCTagId(-5),
        normalizedHigh: cctag.normalizeCCTagId(99),
        marker,
      };
    });

    expect(result.rowCount).toBe(32);
    expect(result.firstRow).toEqual([90, 80, 70, 60, 50]);
    expect(result.formatted).toBe('#01');
    expect(result.normalizedLow).toBe(0);
    expect(result.normalizedHigh).toBe(31);
    expect(result.marker.type).toBe('cctag');
    expect(result.marker.markerId).toBe(31);
    expect(result.marker.width).toBe(result.marker.height);
    expect(result.marker.width).toBeGreaterThanOrEqual(16);
  });

  test('opens CCTag properties without adding an element', async ({ page }) => {
    await openCCTagProperties(page);
    await expect(page.locator('#cctag-marker-grid .cctag-marker-option')).toHaveCount(32);
    await expect(page.locator('#cctag-selected-count')).toHaveText('1 selected');
    await expect(page.locator('#cctag-add-id')).toBeChecked();

    await page.click('#elements-btn');
    await expect(page.locator('#elements-list')).toContainText('No elements');
  });

  test('persists visual text defaults for new text and CCTag ID labels', async ({ page }) => {
    await page.click('#add-text');
    await page.locator('#prop-font-family').selectOption('Arial, sans-serif');
    await page.locator('#prop-font-size').fill('31');
    await page.locator('.align-btn[data-align="center"]').click();
    await page.locator('.valign-btn[data-valign="bottom"]').click();
    await page.click('#style-bold');
    await page.locator('#prop-no-wrap').setChecked(true);

    await page.reload({ waitUntil: 'networkidle' });
    await waitForAppReady(page);
    await dismissInfoDialog(page);

    await page.click('#add-text');
    let elements = await saveDesignElements(page, 'text-defaults');
    const text = elements.find(el => el.type === 'text' && el.text === 'New Text');
    expect(text).toMatchObject({
      fontFamily: 'Arial, sans-serif',
      fontSize: 31,
      align: 'center',
      verticalAlign: 'bottom',
      fontWeight: 'bold',
      noWrap: true,
    });

    await addDesktopCCTag(page, '1', true);
    elements = await saveDesignElements(page, 'cctag-default-label');
    const idText = elements.find(el => el.type === 'text' && el.text === '#01');
    expect(idText).toMatchObject({
      fontFamily: 'Arial, sans-serif',
      fontSize: 31,
      align: 'right',
      verticalAlign: 'bottom',
      fontWeight: 'bold',
      noWrap: true,
    });
  });

  test('adds CCTag with normal ID text', async ({ page }) => {
    await addDesktopCCTag(page, '1', true);
    const elements = await saveDesignElements(page, 'cctag-with-id');

    expect(elements).toHaveLength(2);
    expect(elements[0]).toMatchObject({
      type: 'text',
      text: '#01',
      noWrap: false,
      clipOverflow: false,
      autoScale: false,
      cctagBlockRole: 'id',
    });
    expect(elements[1]).toMatchObject({
      type: 'cctag',
      markerId: 1,
      cctagBlockRole: 'marker',
    });
    expect(elements[0].groupId).toBe(elements[1].groupId);
    expect(elements[0].cctagBlockId).toBe(elements[1].cctagBlockId);
    expect(elements[1].width).toBe(elements[1].height);
  });

  test('applies CCTag builder pixel size and clamps to 96px', async ({ page }) => {
    await addDesktopCCTag(page, '2', false, '120');
    const elements = await saveDesignElements(page, 'cctag-size-clamp');

    expect(elements).toHaveLength(1);
    expect(elements[0]).toMatchObject({
      type: 'cctag',
      markerId: 2,
      width: 96,
      height: 96,
    });
  });

  test('updates linked CCTag ID text when marker ID changes', async ({ page }) => {
    await addDesktopCCTag(page, '3', true);
    await page.locator('#prop-cctag-marker').selectOption('8');

    const elements = await saveDesignElements(page, 'cctag-id-sync');
    const text = elements.find(el => el.cctagBlockRole === 'id');
    const marker = elements.find(el => el.cctagBlockRole === 'marker');

    expect(text.text).toBe('#08');
    expect(marker.markerId).toBe(8);
    expect(text.cctagBlockId).toBe(marker.cctagBlockId);
  });

  test('edits CCTag ID text from CCTag properties', async ({ page }) => {
    await addDesktopCCTag(page, '3', true);
    await expect(page.locator('#cctag-id-text-controls')).toBeVisible();

    await page.locator('#prop-cctag-id-text').fill('A3');
    await page.locator('#prop-cctag-id-font-size').fill('18');
    await page.locator('#prop-cctag-id-font-size').dispatchEvent('input');

    const elements = await saveDesignElements(page, 'cctag-id-text-edit');
    const text = elements.find(el => el.cctagBlockRole === 'id');
    expect(text).toMatchObject({
      text: 'A3',
      fontSize: 18,
      align: 'right',
    });
  });

  test('adds an evenly spaced CCTag strip from selected previews', async ({ page }) => {
    await openCCTagProperties(page);
    await selectDesktopCCTagMarkers(page, ['2', '5', '7']);
    await page.locator('#cctag-layout').selectOption('even');
    await page.locator('#cctag-orientation').selectOption('landscape');
    await page.click('#cctag-add-marker');

    const elements = await saveDesignElements(page, 'cctag-strip-even');
    const markers = elements.filter(el => el.type === 'cctag');
    const texts = elements.filter(el => el.type === 'text');

    expect(markers.map(el => el.markerId)).toEqual([2, 5, 7]);
    expect(texts.map(el => el.text)).toEqual(['#02', '#05', '#07']);
    expect(new Set(markers.map(el => el.groupId)).size).toBe(3);
    expect(new Set(markers.map(el => el.cctagBlockId)).size).toBe(3);

    for (const marker of markers) {
      const text = texts.find(el => el.cctagBlockId === marker.cctagBlockId);
      expect(text.groupId).toBe(marker.groupId);
      expect(text.x + text.width).toBeLessThanOrEqual(marker.x);
    }
  });

  test('keeps CCTag strip properties visible for multi-block selection and applies gaps', async ({ page }) => {
    await openCCTagProperties(page);
    await selectDesktopCCTagMarkers(page, ['2', '5', '7']);
    await page.click('#cctag-add-marker');

    await expect(page.locator('#props-cctag')).toBeVisible();
    await expect(page.locator('#cctag-strip-edit-controls')).toBeVisible();
    await expect(page.locator('#cctag-strip-selected-count')).toHaveText('3 blocks');

    await page.locator('#cctag-strip-id-gap').fill('10');
    await page.locator('#cctag-strip-min-gap').fill('20');
    await page.locator('#cctag-strip-max-gap').fill('20');
    await page.click('#cctag-strip-apply');

    const elements = await saveDesignElements(page, 'cctag-strip-gap-edit');
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
    expect(blocks.every(block => block.idGap === 10)).toBe(true);
    expect(Math.round(blocks[1].minX - blocks[0].maxX)).toBe(20);
    expect(Math.round(blocks[2].minX - blocks[1].maxX)).toBe(20);
  });

  test('edits all selected CCTag ID text styles from multi-block properties', async ({ page }) => {
    await openCCTagProperties(page);
    await selectDesktopCCTagMarkers(page, ['2', '5', '7']);
    await page.click('#cctag-add-marker');

    await expect(page.locator('#cctag-id-text-controls')).toBeVisible();
    await page.locator('#prop-cctag-id-font-size').fill('19');
    await page.locator('#prop-cctag-id-font-size').dispatchEvent('input');
    await page.locator('#prop-cctag-id-font-family').selectOption('Arial, sans-serif');

    const elements = await saveDesignElements(page, 'cctag-multi-id-text-style');
    const texts = elements.filter(el => el.cctagBlockRole === 'id');
    expect(texts).toHaveLength(3);
    expect(texts.every(el => el.fontSize === 19)).toBe(true);
    expect(texts.every(el => el.fontFamily === 'Arial, sans-serif')).toBe(true);
    expect(texts.every(el => el.align === 'right')).toBe(true);
  });

  test('random strip layout keeps CCTag blocks from overlapping', async ({ page }) => {
    await openCCTagProperties(page);
    await selectDesktopCCTagMarkers(page, ['0', '1', '2', '3']);
    await page.locator('#cctag-layout').selectOption('random');
    await page.click('#cctag-add-marker');

    const elements = await saveDesignElements(page, 'cctag-strip-random');
    const groups = Array.from(new Set(elements.map(el => el.groupId).filter(Boolean))).map(groupId => {
      const members = elements.filter(el => el.groupId === groupId);
      return {
        minX: Math.min(...members.map(el => el.x)),
        maxX: Math.max(...members.map(el => el.x + el.width)),
      };
    }).sort((a, b) => a.minX - b.minX);

    expect(groups).toHaveLength(4);
    expect(groups[0].minX).toBeLessThan(1);
    expect(groups[groups.length - 1].maxX).toBeGreaterThan(390);
    for (let index = 1; index < groups.length; index++) {
      expect(groups[index].minX).toBeGreaterThanOrEqual(groups[index - 1].maxX);
    }
  });

  test('portrait CCTag block rotates only ID text', async ({ page }) => {
    await openCCTagProperties(page);
    await selectDesktopCCTagMarkers(page, ['4']);
    await page.locator('#cctag-orientation').selectOption('portrait');
    await page.click('#cctag-add-marker');

    const elements = await saveDesignElements(page, 'cctag-portrait');
    expect(elements).toHaveLength(2);
    const text = elements.find(el => el.cctagBlockRole === 'id');
    const marker = elements.find(el => el.cctagBlockRole === 'marker');
    expect(text.rotation).toBe(270);
    expect(marker.rotation).toBe(0);
    expect(elements[0].groupId).toBe(elements[1].groupId);
    expect(elements[0].cctagBlockOrientation).toBe('portrait');
    expect(elements[1].cctagBlockOrientation).toBe('portrait');
  });

  test('desktop rotation property rotates linked CCTag ID and marker together', async ({ page }) => {
    await addDesktopCCTag(page, '4', true);
    await page.locator('#prop-rotation').fill('45');
    await page.locator('#prop-rotation').dispatchEvent('change');

    const elements = await saveDesignElements(page, 'cctag-property-rotation');
    expect(elements).toHaveLength(2);
    expect(elements.every(el => el.rotation === 45)).toBe(true);
    expect(elements[0].groupId).toBe(elements[1].groupId);
  });

  test('adds CCTag without ID and can add same marker repeatedly', async ({ page }) => {
    await addDesktopCCTag(page, '5', false, '88');

    const pixels = await page.evaluate(() => {
      const canvas = document.querySelector('#preview-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d');
      const data = ctx!.getImageData(0, 0, canvas.width, canvas.height).data;
      let darkPixels = 0;
      let lightPixels = 0;
      for (let index = 0; index < data.length; index += 4) {
        const luminance = (data[index] + data[index + 1] + data[index + 2]) / 3;
        if (luminance < 40) darkPixels += 1;
        if (luminance > 215) lightPixels += 1;
      }

      return { darkPixels, lightPixels };
    });

    expect(pixels.darkPixels).toBeGreaterThan(50);
    expect(pixels.lightPixels).toBeGreaterThan(pixels.darkPixels);

    await addDesktopCCTag(page, '5', false, '88');

    const elements = await saveDesignElements(page, 'cctag-repeat');
    expect(elements).toHaveLength(2);
    expect(elements.every(el => el.type === 'cctag' && el.markerId === 5)).toBe(true);
  });

  test('desktop properties keep CCTag square and update marker ID', async ({ page }) => {
    await addDesktopCCTag(page, '2', false);

    await page.locator('#prop-cctag-marker').selectOption('7');
    await page.locator('#prop-width').fill('77');
    await page.locator('#prop-width').dispatchEvent('change');
    await expect(page.locator('#prop-height')).toHaveValue('77');

    await page.locator('#prop-height').fill('88');
    await page.locator('#prop-height').dispatchEvent('change');
    await expect(page.locator('#prop-width')).toHaveValue('88');

    const elements = await saveDesignElements(page, 'cctag-square');
    expect(elements).toHaveLength(1);
    expect(elements[0]).toMatchObject({ type: 'cctag', markerId: 7, width: 88, height: 88 });
  });

  test('duplicate and paste remap linked CCTag block IDs', async ({ page }) => {
    await addDesktopCCTag(page, '9', true);
    await page.click('#duplicate-btn');
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }));
    });

    const elements = await saveDesignElements(page, 'cctag-duplicate-paste');
    const markers = elements.filter(el => el.type === 'cctag');
    const texts = elements.filter(el => el.type === 'text');
    const groupIds = new Set(elements.map(el => el.groupId).filter(Boolean));
    const blockIds = new Set(elements.map(el => el.cctagBlockId).filter(Boolean));

    expect(markers).toHaveLength(3);
    expect(texts).toHaveLength(3);
    expect(groupIds.size).toBe(3);
    expect(blockIds.size).toBe(3);
    for (const marker of markers) {
      const text = texts.find(el => el.cctagBlockId === marker.cctagBlockId);
      expect(text.groupId).toBe(marker.groupId);
      expect(text.text).toBe('#09');
    }
  });

  test('save and load preserve CCTag fields', async ({ page }) => {
    await addDesktopCCTag(page, '3', false);
    await page.locator('#prop-width').fill('66');
    await page.locator('#prop-width').dispatchEvent('change');
    await saveDesignElements(page, 'cctag-load');

    await page.reload({ waitUntil: 'networkidle' });
    await waitForAppReady(page);
    await dismissInfoDialog(page);
    await expect(page.locator('#add-cctag-btn')).toBeEnabled();

    await page.click('#load-btn');
    await page.locator('.design-item[data-name="cctag-load"]').click();
    await page.click('#elements-btn');
    await page.locator('.element-list-item').filter({ hasText: 'CCTag #03' }).click();

    await expect(page.locator('#props-cctag')).toBeVisible();
    await expect(page.locator('#prop-cctag-marker')).toHaveValue('3');
    await expect(page.locator('#prop-width')).toHaveValue('66');
    await expect(page.locator('#prop-height')).toHaveValue('66');
  });

  test('mobile add and properties are reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle' });
    await waitForAppReady(page);
    await dismissInfoDialog(page);

    await page.click('#mobile-menu-btn');
    await expect(page.locator('#mobile-add-cctag')).toBeEnabled();
    await page.click('#mobile-add-cctag');
    await expect(page.locator('#mobile-props-panel')).toHaveClass(/props-open/);
    await expect(page.locator('#mobile-cctag-marker-grid')).toBeVisible();

    await page.click('#mobile-cctag-clear-selection');
    await page.locator('#mobile-cctag-marker-grid .cctag-marker-option[data-marker-id="4"]').click();
    await page.locator('#mobile-cctag-add-id').setChecked(false);
    await page.click('#mobile-cctag-add-marker');

    await expect(page.locator('#mobile-props-panel')).toHaveClass(/props-open/);
    await expect(page.locator('#mobile-prop-cctag-marker')).toHaveValue('4');

    await page.locator('#mobile-prop-cctag-marker').selectOption('6');
    await page.locator('#mobile-prop-width').fill('72');
    await page.locator('#mobile-prop-width').dispatchEvent('change');
    await expect(page.locator('#mobile-prop-height')).toHaveValue('72');

    await page.setViewportSize({ width: 1440, height: 900 });
    const elements = await saveDesignElements(page, 'mobile-cctag');
    expect(elements).toHaveLength(1);
    expect(elements[0]).toMatchObject({ type: 'cctag', markerId: 6, width: 72, height: 72 });
  });
});
