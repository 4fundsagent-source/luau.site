// Usage: node scripts/find-overflow.mjs <url> — lists unclipped elements wider than a 375px viewport.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 375, height: 800 } });
await p.goto(process.argv[2], { waitUntil: 'networkidle' });
const r = await p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth + 1) {
      let a = el.parentElement, clipped = false;
      while (a) { const s = getComputedStyle(a); if (s.overflowX !== 'visible' || s.overflow === 'hidden') { clipped = true; break; } a = a.parentElement; }
      if (!clipped) out.push(`${el.tagName}.${(el.className?.baseVal ?? el.className).toString().slice(0,80)} right=${Math.round(rect.right)}`);
    }
  }
  return out.slice(0, 15);
});
console.log(r.join('\n'));
await b.close();
