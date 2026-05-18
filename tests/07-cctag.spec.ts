import { test, expect } from '@playwright/test';
import { waitForAppReady, dismissInfoDialog } from './helpers/app';

async function openCCTagMenu(page) {
  await expect(page.locator('#add-cctag-btn')).toBeEnabled();
  await page.click('#add-cctag-btn');
  await expect(page.locator('#cctag-dropdown')).toBeVisible();
}

async function addDesktopCCTag(page, markerId = '1', addId = true) {
  await openCCTagMenu(page);
  await page.locator('#cctag-marker').selectOption(markerId);
  await page.locator('#cctag-add-id').setChecked(addId);
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

  test('opens menu without adding an element', async ({ page }) => {
    await openCCTagMenu(page);
    await expect(page.locator('#cctag-add-id')).toBeChecked();

    await page.click('#elements-btn');
    await expect(page.locator('#elements-list')).toContainText('No elements');
  });

  test('adds CCTag with normal ID text', async ({ page }) => {
    await addDesktopCCTag(page, '1', true);
    const elements = await saveDesignElements(page, 'cctag-with-id');

    expect(elements).toHaveLength(2);
    expect(elements[0]).toMatchObject({
      type: 'text',
      text: '(#01)',
      noWrap: false,
      clipOverflow: false,
      autoScale: false,
    });
    expect(elements[1]).toMatchObject({
      type: 'cctag',
      markerId: 1,
    });
    expect(elements[1].width).toBe(elements[1].height);
  });

  test('adds CCTag without ID and can add same marker repeatedly', async ({ page }) => {
    await addDesktopCCTag(page, '5', false);

    const pixels = await page.evaluate(() => {
      const canvas = document.querySelector('#preview-canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d');
      const x = Number((document.querySelector('#prop-x') as HTMLInputElement).value);
      const y = Number((document.querySelector('#prop-y') as HTMLInputElement).value);
      const width = Number((document.querySelector('#prop-width') as HTMLInputElement).value);
      const height = Number((document.querySelector('#prop-height') as HTMLInputElement).value);
      const labelOffset = 120;
      const cx = labelOffset + x + width / 2;
      const cy = labelOffset + y + height / 2;
      const outerRadius = Math.min(width, height) / 2;
      const luminanceAt = (radius: number) => {
        const data = ctx!.getImageData(Math.round(cx + radius), Math.round(cy), 1, 1).data;
        return (data[0] + data[1] + data[2]) / 3;
      };

      return {
        outerRing: luminanceAt(outerRadius * 0.94),
        nextRing: luminanceAt(outerRadius * 0.86),
      };
    });

    expect(pixels.outerRing).toBeLessThan(40);
    expect(pixels.nextRing).toBeGreaterThan(215);

    await addDesktopCCTag(page, '5', false);

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
    await expect(page.locator('#mobile-cctag-menu')).toBeVisible();

    await page.locator('#mobile-cctag-marker').selectOption('4');
    await page.locator('#mobile-cctag-add-id').setChecked(false);
    await page.click('#mobile-cctag-add-marker');

    await page.click('#mobile-edit-btn');
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
