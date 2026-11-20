// Screenshots a page at exactly 1200x630 through Chrome's DevTools protocol.
// --screenshot can't do this: headless Chrome keeps ~90px of the window for UI it never draws.
//   node render-card.mjs <url> <out.png>
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, out] = process.argv.slice(2);
const chrome = process.env.CHROME;
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'card-'));

const proc = spawn(chrome, [
	'--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-sandbox',
	`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const done = (code) => {
	proc.once('exit', () => {
		try { rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); } catch {}
		process.exit(code);
	});
	proc.kill();
};
setTimeout(() => { console.error('card render timed out'); done(1); }, 30000);

let target;
for (let i = 0; i < 100 && !target; i++) {
	try {
		const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
		target = list.find((t) => t.type === 'page');
	} catch {}
	if (!target) await sleep(100);
}
if (!target) { console.error('chrome did not start'); done(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
	const msg = JSON.parse(e.data);
	if (pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
const send = (method, params = {}) =>
	new Promise((resolve) => { pending.set(++id, resolve); ws.send(JSON.stringify({ id, method, params })); });

await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });

// the page sets body[data-ready] once fonts are in and the card is drawn
for (let i = 0; i < 100; i++) {
	const r = await send('Runtime.evaluate', { expression: 'document.body && document.body.dataset.ready === "1"' });
	if (r.result?.result?.value) break;
	await sleep(100);
}

const shot = await send('Page.captureScreenshot', {
	format: 'png', clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 }
});
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
done(0);
