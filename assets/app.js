const navToggle = document.querySelector('#navToggle');
const sidebar = document.querySelector('#sidebar');

if (navToggle && sidebar) {
    navToggle.addEventListener('click', () => {
        const isOpen = sidebar.classList.toggle('is-open');
        navToggle.setAttribute('aria-expanded', String(isOpen));
    });

    document.addEventListener('click', (event) => {
        if (window.innerWidth > 920) {
            return;
        }

        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }

        if (!sidebar.contains(target) && !navToggle.contains(target)) {
            sidebar.classList.remove('is-open');
            navToggle.setAttribute('aria-expanded', 'false');
        }
    });
}