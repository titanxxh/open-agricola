import { test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

const OUTPUT_DIR = path.resolve(process.cwd(), 'e2e-tests/output');
const API_BASE = 'http://localhost:5175';
const FRONTEND_BASE = 'http://localhost:5173';

test.use({ viewport: { width: 1920, height: 1080 } });

const screenshot = async (page: any, name: string) => {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const filePath = path.join(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`[Screenshot] ${name}.png`);
};

const logState = async (name: string) => {
  try {
    const resp = await fetch(`${API_BASE}/api/game/state`);
    const data = await resp.json();
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const filePath = path.join(OUTPUT_DIR, `${name}-state.json`);
    writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`[State] ${name}: pending=${data.pending?.type}, round=${data.state?.round}`);
    return data;
  } catch (e) {
    console.error('[State Error]', e);
    return null;
  }
};

test('round end confirmation flow', async ({ page }) => {
  test.setTimeout(120000);
  console.log('=== Round End Confirmation Test ===\n');
  
  // Reset and start
  await fetch(`${API_BASE}/api/game/new`, { method: 'POST' });
  await page.goto(`${FRONTEND_BASE}/?player=p1`);
  await page.waitForTimeout(2000);
  await screenshot(page, '01-start-round-1-p1');
  await logState('01');
  
  // P1: Click Fishing button
  console.log('\n-- P1: Fishing --');
  const fishingBtn = page.locator('button:has-text("Fishing")').first();
  await fishingBtn.click();
  await page.waitForTimeout(1500);
  await screenshot(page, '02-p1-fishing');
  const s2 = await logState('02');
  console.log('Workers:', s2?.state?.players?.map((p: any) => `${p.id}:${p.workersAvailable}`).join(', '));
  
  // Confirm P1 -> P2
  console.log('\n-- Confirm: P1 -> P2 --');
  await screenshot(page, '03-before-confirm-p1');
  const confirmBtn = page.locator('button:has-text("Confirm Switch")').first();
  await confirmBtn.click();
  await page.waitForTimeout(1500);
  await screenshot(page, '04-after-confirm-p1');
  const s4 = await logState('04');
  
  // P2: Clay Pit
  console.log('\n-- P2: Clay Pit --');
  await page.goto(`${FRONTEND_BASE}/?player=p2`);
  await page.waitForTimeout(1500);
  await screenshot(page, '05-p2-view');
  const clayBtn = page.locator('button:has-text("Clay Pit")').first();
  await clayBtn.click();
  await page.waitForTimeout(1500);
  await screenshot(page, '06-p2-clay');
  const s6 = await logState('06');
  console.log('Workers:', s6?.state?.players?.map((p: any) => `${p.id}:${p.workersAvailable}`).join(', '));
  
  // Confirm P2 -> P1
  console.log('\n-- Confirm: P2 -> P1 --');
  const confirmBtn2 = page.locator('button:has-text("Confirm Switch")').first();
  await confirmBtn2.click();
  await page.waitForTimeout(1500);
  await screenshot(page, '08-after-confirm-p2');
  const s8 = await logState('08');
  
  // P1: Day Laborer (2nd worker)
  console.log('\n-- P1: Day Laborer (2nd worker) --');
  await page.goto(`${FRONTEND_BASE}/?player=p1`);
  await page.waitForTimeout(1500);
  const dayBtn = page.locator('button:has-text("Day Laborer")').first();
  await dayBtn.click();
  await page.waitForTimeout(1500);
  await screenshot(page, '09-p1-day-laborer');
  const s9 = await logState('09');
  console.log('Workers after:', s9?.state?.players?.map((p: any) => `${p.id}:${p.workersAvailable}`).join(', '));
  console.log('Pending:', s9?.pending?.type);
  
  // Confirm P1 -> P2 (all P1 workers used)
  console.log('\n-- Confirm: P1 -> P2 (P1 done) --');
  const confirmBtn3 = page.locator('button:has-text("Confirm Switch")').first();
  await confirmBtn3.click();
  await page.waitForTimeout(1500);
  await screenshot(page, '11-after-confirm-p1-2nd');
  const s11 = await logState('11');
  console.log('Workers:', s11?.state?.players?.map((p: any) => `${p.id}:${p.workersAvailable}`).join(', '));
  
  // P2: Reed Bank (2nd worker - final action)
  console.log('\n-- P2: Reed Bank (Final action) --');
  await page.goto(`${FRONTEND_BASE}/?player=p2`);
  await page.waitForTimeout(1500);
  const reedBtn = page.locator('button:has-text("Reed Bank")').first();
  await reedBtn.click();
  await page.waitForTimeout(1500);
  await screenshot(page, '12-p2-reed-final');
  const s12 = await logState('12');
  console.log('Workers after final action:', s12?.state?.players?.map((p: any) => `${p.id}:${p.workersAvailable}`).join(', '));
  console.log('Pending:', s12?.pending?.type);
  
  // FINAL CONFIRM - Should trigger round end
  console.log('\n-- FINAL CONFIRM (Round End) --');
  await screenshot(page, '13-before-final-confirm');
  const finalConfirm = page.locator('button:has-text("Confirm Switch")').first();
  await finalConfirm.click();
  console.log('Clicked final confirm, waiting for round end...');
  await page.waitForTimeout(3000);
  await screenshot(page, '14-after-round-end');
  const s14 = await logState('14');
  
  // Check round 2
  console.log('\n-- Check Round 2 --');
  await page.waitForTimeout(1500);
  await screenshot(page, '15-round-2');
  const s15 = await logState('15');
  
  console.log('\n=== Test Complete ===');
  console.log('Final Round:', s15?.state?.round, '(Expected: 2)');
  console.log('All workers reset:', s15?.state?.players?.every((p: any) => p.workersAvailable === p.familySize) ? 'YES' : 'NO');
});
