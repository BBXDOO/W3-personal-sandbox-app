/* Mobile board navigation; changes presentation only, never project data. */
(() => {
  const mq = matchMedia('(max-width: 700px)');
  const tabs = [['grid','ตาราง'],['tools','เครื่องมือ'],['theme','ธีม'],['tiles','คลังภาพ'],['details','รายละเอียด']];
  const activate = (root, view) => {
    root.dataset.mobilePanel = view;
    root.querySelectorAll('.board-mobile-tab').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    const target = {theme:'.board-table-theme',tiles:'.board-tile-library',details:'.board-inspector'}[view];
    if (target) { const el = root.querySelector(target); if (el) el.open = true; }
  };
  const enhance = root => {
    if (!mq.matches || root.querySelector('.board-mobile-nav')) return;
    const nav = document.createElement('nav');
    nav.className = 'board-mobile-nav';
    nav.setAttribute('aria-label', 'เครื่องมือบอร์ดบนมือถือ');
    tabs.forEach(([view,label]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'board-mobile-tab'; b.dataset.view = view;
      b.textContent = label; b.addEventListener('click', () => activate(root, view)); nav.appendChild(b);
    });
    const expand = document.createElement('button');
    expand.type = 'button'; expand.className = 'board-mobile-expand';
    expand.setAttribute('aria-label', 'ขยายหรือย่อพื้นที่บอร์ด'); expand.textContent = '⛶ ขยาย';
    expand.addEventListener('click', () => {
      const on = root.classList.toggle('board-mobile-full');
      expand.textContent = on ? '✕ ย่อ' : '⛶ ขยาย';
      document.body.classList.toggle('board-mobile-full-active', on);
    });
    nav.appendChild(expand);
    root.insertBefore(nav, root.querySelector('.board-workspace-columns'));
    activate(root, 'grid');
  };
  const refresh = () => {
    const roots = [...document.querySelectorAll('.board-workspace')];
    if (!roots.some(root => root.classList.contains('board-mobile-full'))) document.body.classList.remove('board-mobile-full-active');
    roots.forEach(enhance);
  };
  new MutationObserver(refresh).observe(document.documentElement, {childList:true,subtree:true});
  mq.addEventListener('change', refresh);
  refresh();
})();