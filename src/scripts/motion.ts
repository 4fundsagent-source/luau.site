/**
 * Runtime half of the motion system (see styles/motion.css). Loaded once per page.
 * Every effect is skipped when the visitor prefers reduced motion; the page is
 * fully usable without any of it.
 */

const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
export const motionOK = () => !reduce.matches;

// ------------------------------------------------------------------ reveal + count-up

const COUNT_MS = 1000;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

function countUp(el: HTMLElement) {
  const target = Number(el.dataset.countup);
  el.dataset.counted = '';
  if (!motionOK() || !Number.isFinite(target)) {
    el.textContent = String(target);
    return;
  }
  const decimals = (el.dataset.countup!.split('.')[1] ?? '').length;
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / COUNT_MS);
    el.textContent = (target * easeOut(t)).toFixed(decimals);
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = el.dataset.countup!;
  };
  el.textContent = (0).toFixed(decimals);
  requestAnimationFrame(tick);
}

function initReveal() {
  const reveals = document.querySelectorAll<HTMLElement>('[data-reveal]');
  const counters = document.querySelectorAll<HTMLElement>('[data-countup]');
  counters.forEach((el) => (el.dataset.countArmed = ''));

  if (!('IntersectionObserver' in window)) {
    reveals.forEach((el) => (el.dataset.inview = ''));
    counters.forEach(countUp);
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        if (el.hasAttribute('data-reveal')) el.dataset.inview = '';
        if (el.hasAttribute('data-countup') && !el.hasAttribute('data-counted')) countUp(el);
        io.unobserve(el);
      }
    },
    { rootMargin: '0px 0px -6% 0px' },
  );
  reveals.forEach((el) => io.observe(el));
  counters.forEach((el) => io.observe(el));
}

// ------------------------------------------------------------------ cursor spotlight on cards

function initSpotlight() {
  document.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      const card = (e.target as Element | null)?.closest<HTMLElement>('.card-hover');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    },
    { passive: true },
  );
}

// ------------------------------------------------------------------ press ripple

function initRipple() {
  document.addEventListener('pointerdown', (e) => {
    if (!motionOK() || e.button !== 0) return;
    const host = (e.target as Element | null)?.closest<HTMLElement>('.btn, .icon-btn, .seg-btn');
    if (!host) return;
    const r = host.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const dot = document.createElement('span');
    dot.className = 'ripple';
    dot.setAttribute('aria-hidden', 'true');
    dot.style.width = dot.style.height = `${size}px`;
    dot.style.left = `${e.clientX - r.left - size / 2}px`;
    dot.style.top = `${e.clientY - r.top - size / 2}px`;
    host.append(dot);
    dot.addEventListener('animationend', () => dot.remove(), { once: true });
  });
}

// ------------------------------------------------------------------ header scroll state

function initHeader() {
  const header = document.querySelector<HTMLElement>('.site-header');
  if (!header) return;
  const update = () => header.toggleAttribute('data-scrolled', window.scrollY > 8);
  update();
  window.addEventListener('scroll', update, { passive: true });
}

// ------------------------------------------------------------------ navigation progress bar

function initProgress() {
  const bar = document.createElement('div');
  bar.className = 'nav-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.append(bar);
  let timer: number | undefined;

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || (url.pathname === location.pathname && url.hash)) return;
    // Only show for loads that are actually slow; prefetched pages swap instantly.
    timer = window.setTimeout(() => bar.setAttribute('data-active', ''), 120);
  });
  window.addEventListener('pageshow', () => {
    window.clearTimeout(timer);
    bar.removeAttribute('data-active');
  });
}

// ------------------------------------------------------------------ theme switch

export function setTheme(next: 'light' | 'dark', origin?: { x: number; y: number }) {
  const apply = () => {
    root.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* storage unavailable — theme still applies for this page */
    }
  };
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };
  if (!doc.startViewTransition || !motionOK() || !origin) {
    apply();
    return;
  }
  root.classList.add('theme-vt');
  const t = doc.startViewTransition(apply);
  const radius = Math.hypot(Math.max(origin.x, innerWidth - origin.x), Math.max(origin.y, innerHeight - origin.y));
  t.ready
    .then(() =>
      root.animate(
        { clipPath: [`circle(0px at ${origin.x}px ${origin.y}px)`, `circle(${radius}px at ${origin.x}px ${origin.y}px)`] },
        { duration: 620, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', pseudoElement: '::view-transition-new(root)' },
      ),
    )
    .catch(() => {});
  t.finished.finally(() => root.classList.remove('theme-vt'));
}

/**
 * Run a DOM update as a same-document view transition when motion is allowed.
 * Only named elements animate; the page itself swaps instantly (`same-vt`).
 */
export function withTransition(update: () => void): Promise<void> {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  if (!doc.startViewTransition || !motionOK()) {
    update();
    return Promise.resolve();
  }
  root.classList.add('same-vt');
  return doc
    .startViewTransition(update)
    .finished.catch(() => {})
    .finally(() => root.classList.remove('same-vt'));
}

initReveal();
initSpotlight();
initRipple();
initHeader();
initProgress();
