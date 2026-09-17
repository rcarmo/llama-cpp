#!/usr/bin/env bun
import { chromium } from '../../../../../scripts/playwright/node_modules/playwright';

const url = process.env.HUIHUI_UI_URL ?? 'http://192.168.1.70:8094/';
const screenshot = process.env.HUIHUI_UI_SCREENSHOT ?? '/tmp/huihui-security-audit-ui.png';
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/var/home/agent/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
});
const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
const errors: string[] = [];
const failedResponses: Array<{status: number; url: string}> = [];
page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
page.on('response', response => {
    const disabledTools = response.status() === 403 && new URL(response.url()).pathname === '/tools';
    if (response.status() >= 400 && !disabledTools) failedResponses.push({status: response.status(), url: response.url()});
});
page.on('console', message => {
    const text = message.text();
    const expectedBrowserWarning = text.includes('Cross-Origin-Opener-Policy') || text.includes('403 (Forbidden)');
    if (message.type() === 'error' && !expectedBrowserWarning) errors.push(`console: ${text}`);
});
const response = await page.goto(url, {waitUntil: 'networkidle', timeout: 60_000});
if (!response?.ok()) throw new Error(`UI HTTP ${response?.status()}`);
await page.waitForTimeout(2000);
const body = (await page.locator('body').innerText()).trim();
if (body.length < 100) throw new Error(`UI body is unexpectedly short: ${body.length}`);
const interactive = await page.locator('textarea, input, button, [contenteditable="true"]').count();
if (interactive < 3) throw new Error(`UI has too few interactive controls: ${interactive}`);
const title = await page.title();
await page.screenshot({path: screenshot, fullPage: true});
await browser.close();
console.log(JSON.stringify({passed: errors.length === 0 && failedResponses.length === 0, url, title, body_characters: body.length, interactive_controls: interactive, failed_responses: failedResponses, console_errors: errors, screenshot}, null, 2));
if (errors.length || failedResponses.length) process.exitCode = 1;
