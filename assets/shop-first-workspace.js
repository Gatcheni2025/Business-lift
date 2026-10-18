// Teyza phase-1 merchant experience: single shop workspace, no social connection steps.
(() => {
  const page = location.pathname.split('/').pop() || 'dashboard.html';
  const nav = document.querySelector('nav[aria-label="Primary navigation"]');
  const links = [
    ['dashboard.html', 'Dashboard', 'ph-house'],
    ['products.html', 'Products & stock', 'ph-package'],
    ['orders.html', 'Customer orders', 'ph-receipt'],
    ['services.html', 'Local services', 'ph-wrench'],
    ['delivery-settings.html', 'Pickup & delivery', 'ph-truck'],
    ['payments.html', 'Accounts', 'ph-wallet'],
    ['business-profile.html', 'My shop profile', 'ph-storefront'],
    ['support.html', 'Help & support', 'ph-question']
  ];
  if (nav) {
    nav.replaceChildren();
    const group = document.createElement('div');
    group.className = 'nav-group';
    const title = document.createElement('p');
    title.className = 'nav-group-label';
    title.textContent = 'Your local shop';
    group.appendChild(title);
    for (const [href, label, icon] of links) {
      const a = document.createElement('a');
      a.href = href;
      a.className = 'nav-link' + (page === href ? ' active' : '');
      if (page === href) a.setAttribute('aria-current', 'page');
      const i = document.createElement('i');
      i.className = 'ph ' + icon;
      i.setAttribute('aria-hidden', 'true');
      const span = document.createElement('span');
      span.textContent = label;
      a.append(i, span);
      group.appendChild(a);
    }
    nav.appendChild(group);
  }
  document.querySelectorAll('a[href*="sales-channels.html"],a[href*="social.html"],[data-social-shortcut],.dashboard-sales-channels,[data-dashboard-channel-list],.selling-channel-modal[data-selling-channel-modal]')
    .forEach(element => { element.hidden = true; element.setAttribute('aria-hidden', 'true'); });
  document.querySelectorAll('a[href="merchant-marketplace.html"]')
    .forEach(a => { a.href = 'dashboard.html'; a.textContent = 'My shop dashboard'; });
  const dock = document.querySelector('[data-teyza-app-dock]');
  if (dock) {
    dock.replaceChildren();
    for (const [href,label,icon] of [links[0],links[1],links[2],links[6]]) {
      const a = document.createElement('a');
      a.href = href;
      if (page === href) a.className = 'active';
      const i = document.createElement('i');
      i.className = 'ph ' + icon;
      const span = document.createElement('span');
      span.textContent = label;
      a.append(i, span);
      dock.appendChild(a);
    }
  }
})();
