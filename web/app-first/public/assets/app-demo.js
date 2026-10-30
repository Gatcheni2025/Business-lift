(() => {
  'use strict';
  const root = document.querySelector('[data-teyza-demo]');
  if (!root) return;
  const controls = root.querySelector('[data-demo-controls]');
  const tabs = Array.from(root.querySelectorAll('[data-demo-step]'));
  const panels = Array.from(root.querySelectorAll('[data-demo-panel]'));
  const play = root.querySelector('[data-demo-play]');
  const device = root.querySelector('[data-demo-device]');
  const title = root.querySelector('[data-demo-title]');
  const description = root.querySelector('[data-demo-description]');
  const basket = root.querySelector('[data-demo-basket]');
  const request = root.querySelector('[data-demo-request]');
  const count = root.querySelector('[data-demo-count]');
  const items = root.querySelector('[data-demo-items]');
  const modes = Array.from(root.querySelectorAll('[data-demo-mode]'));
  const addButtons = Array.from(root.querySelectorAll('[data-demo-add]'));
  const descriptions = [
    ['Start close to home', 'Explore local shops and everyday essentials in the app.'],
    ['Find a nearby shop', 'Browse nearby shops, then open an example participating shop.'],
    ['Choose your essentials', 'Tap Add to put example items in the basket.'],
    ['Pick a service', 'Choose delivery or collection where offered by the shop.'],
    ['Send a request in the app', 'The shop confirms availability. This preview sends no order.']
  ];
  const selected = new Set();
  let step = 0;
  let playing = false;
  let started = false;
  let timer = null;
  let mode = 'delivery';

  function updateBasket() {
    const names = [...selected].map(name => name === 'milk' ? 'Fresh milk' : 'Bread');
    count.textContent = String(names.length);
    items.textContent = names.length ? names.join(' · ') : 'No items selected';
    basket.disabled = !names.length;
    request.disabled = !names.length;
    addButtons.forEach(button => {
      const chosen = selected.has(button.dataset.demoAdd);
      button.setAttribute('aria-pressed', String(chosen));
      button.firstChild.textContent = chosen ? 'Added' : 'Add';
      button.setAttribute('aria-label', (chosen ? 'Remove ' : 'Add ') +
        (button.dataset.demoAdd === 'milk' ? 'fresh milk' : 'bread') + ' in the example basket');
    });
    modes.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.demoMode === mode)));
  }
  function show(next) {
    step = Math.max(0, Math.min(panels.length - 1, next));
    panels.forEach((panel, i) => { panel.hidden = i !== step; });
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === step));
      tab.tabIndex = i === step ? 0 : -1;
    });
    title.textContent = descriptions[step][0];
    description.textContent = descriptions[step][1];
    updateBasket();
    updatePlay();
  }
  function updatePlay() {
    device.classList.toggle('is-playing', playing);
    play.firstChild.textContent = playing ? 'Pause example ' : step === 4 ? 'Replay example ' : 'Play example ';
  }
  function pause() {
    playing = false;
    clearTimeout(timer);
    timer = null;
    updatePlay();
  }
  function queue(delay = 4200) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!playing) return;
      if (step === 2 && !selected.size) {
        selected.add('milk');
        updateBasket();
        queue(1800);
      } else if (step < 4) {
        show(step + 1);
        if (step === 4) pause(); else queue();
      } else pause();
    }, delay);
  }
  function start() {
    started = true;
    if (step === 4) {
      selected.clear();
      mode = 'delivery';
      show(0);
    }
    playing = true;
    updatePlay();
    queue();
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => { pause(); show(i); });
    tab.addEventListener('keydown', event => {
      let next = i;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (i + 1) % tabs.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (i + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      pause();
      show(next);
      tabs[next].focus();
    });
  });
  root.querySelectorAll('[data-demo-next]').forEach(button => button.addEventListener('click', () => {
    pause(); show(Number(button.dataset.demoNext));
  }));
  addButtons.forEach(button => button.addEventListener('click', () => {
    pause();
    const name = button.dataset.demoAdd;
    if (selected.has(name)) selected.delete(name); else selected.add(name);
    updateBasket();
  }));
  modes.forEach(button => button.addEventListener('click', () => {
    pause(); mode = button.dataset.demoMode; updateBasket();
  }));
  basket.addEventListener('click', () => { if (selected.size) { pause(); show(3); } });
  request.addEventListener('click', () => { if (selected.size) { pause(); show(4); } });
  play.addEventListener('click', () => { if (playing) pause(); else start(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing) pause(); });
  show(0);
  controls.hidden = false;
  play.hidden = false;
  root.dataset.enhanced = 'true';
  updatePlay();
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !started) start();
        else if (!entry.isIntersecting && playing) pause();
      });
    }, { threshold: 0.25 });
    observer.observe(root);
  }
})();
