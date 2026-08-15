const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

const searchDialog = qs('[data-search-dialog]');
const accountMenu = qs('[data-account-menu]');
let searchTrigger = null;
let menuTrigger = null;

function setSearch(open, trigger) {
  if (!searchDialog) return;
  searchDialog.dataset.open = String(open);
  searchDialog.setAttribute('aria-hidden', String(!open));
  if (open) {
    searchTrigger = trigger || searchTrigger;
    qs('input', searchDialog)?.focus();
  } else {
    searchTrigger?.focus();
  }
}

function setMenu(open, trigger) {
  if (!accountMenu) return;
  accountMenu.dataset.open = String(open);
  if (open) {
    menuTrigger = trigger || menuTrigger;
    qs('button', accountMenu)?.focus();
  } else {
    menuTrigger?.focus();
  }
}

qsa('[data-open-search]').forEach((button) => button.addEventListener('click', () => setSearch(true, button)));
qsa('[data-close-search]').forEach((button) => button.addEventListener('click', () => setSearch(false)));
qsa('[data-open-menu]').forEach((button) => button.addEventListener('click', () => setMenu(true, button)));

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    setSearch(true, qs('[data-open-search]'));
  }
  if (event.key === 'Escape') {
    if (searchDialog?.dataset.open === 'true') setSearch(false);
    if (accountMenu?.dataset.open === 'true') setMenu(false);
  }
});

searchDialog?.addEventListener('click', (event) => {
  if (event.target === searchDialog) setSearch(false);
});

document.addEventListener('click', (event) => {
  if (accountMenu?.dataset.open === 'true' && !accountMenu.contains(event.target) && !event.target.closest('[data-open-menu]')) setMenu(false);
});

const state = new URLSearchParams(location.search).get('state');
if (state === 'search') setSearch(true, qs('[data-open-search]'));
if (state === 'menu') setMenu(true, qs('[data-open-menu]'));
document.documentElement.dataset.prototypeState = state || 'default';
