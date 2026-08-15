const one = (selector, root = document) => root.querySelector(selector);
const all = (selector, root = document) => [...root.querySelectorAll(selector)];
const search = one('[data-search]');
const menu = one('[data-menu]');
let returnTo = null;

const main = one('.main');
if (main) {
  main.id = 'main-content';
  main.tabIndex = -1;
  document.body.insertAdjacentHTML('afterbegin', '<a class="skip-link" href="#main-content">跳到主要内容</a>');
}

function show(layer, trigger) {
  if (!layer) return;
  returnTo = trigger;
  layer.classList.add('open');
  layer.hidden = false;
  (one('input', layer) || one('button', layer))?.focus();
}

function hide(layer) {
  if (!layer) return;
  layer.classList.remove('open');
  layer.hidden = true;
  returnTo?.focus();
}

function hideMenu() {
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  menu.style.display = '';
  returnTo?.focus();
}

all('[data-open-search]').forEach((trigger) => {
  trigger.addEventListener('click', () => show(search, trigger));
});
all('[data-close-search]').forEach((trigger) => {
  trigger.addEventListener('click', () => hide(search));
});
all('[data-open-menu]').forEach((trigger) => {
  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!menu) return;
    menu.hidden = false;
    menu.style.display = 'block';
    returnTo = trigger;
    one('button', menu)?.focus();
  });
});

document.addEventListener('click', (event) => {
  if (menu && !menu.hidden && !menu.contains(event.target)) hideMenu();
});
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    show(search, one('[data-open-search]'));
  }
  if (event.key === 'Escape') {
    if (search && !search.hidden) hide(search);
    hideMenu();
  }
  if (event.key === 'Tab' && search && !search.hidden) {
    const focusable = all('button:not([disabled]), input:not([disabled])', search);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
});
search?.addEventListener('click', (event) => {
  if (event.target === search) hide(search);
});
