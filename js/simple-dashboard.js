(() => {
  const tabs = [
    ...document.querySelectorAll(
      "[data-dashboard-tab],[data-home-tab]"
    )
  ];

  if (!tabs.length) return;

  const tabValue = tab =>
    tab.dataset.dashboardTab ||
    tab.dataset.homeTab ||
    "";

  function select(tab) {
    const value = tabValue(tab);
    if (!value) return;

    tabs.forEach(item => {
      const active = item === tab;
      item.setAttribute("aria-selected", String(active));
      item.tabIndex = active ? 0 : -1;
    });

    document
      .querySelectorAll("[data-home-panel]")
      .forEach(panel => {
        panel.hidden =
          panel.dataset.homePanel !== value;
      });
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", event => {
      event.preventDefault();
      select(tab);
    });

    tab.addEventListener("keydown", event => {
      if (!["ArrowLeft","ArrowRight","Home","End"].includes(event.key)) return;
      event.preventDefault();

      let next;
      if (event.key === "Home") next = tabs[0];
      else if (event.key === "End") next = tabs.at(-1);
      else {
        const direction = event.key === "ArrowRight" ? 1 : -1;
        next = tabs[(index + direction + tabs.length) % tabs.length];
      }

      select(next);
      next.focus();
    });
  });

  select(
    tabs.find(tab => tab.getAttribute("aria-selected") === "true") ||
    tabs[0]
  );
})();