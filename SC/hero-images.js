/* Hover/focus previews are temporary; click/keyboard activation commits a stage. */
(() => {
  const hero = document.querySelector('.guest-hero'), flow = document.querySelector('#chain-flow');
  if (!hero || !flow) return;
  const stages = [
    ['receiving.jpg', 'Supplier receiving and inspection operations', 'عمليات استلام بضائع الموردين وفحصها'],
    ['hero-purchase-orders.jpg', 'Purchase order documents checked against warehouse goods', 'مراجعة مستندات أوامر الشراء ومطابقتها ببضائع المستودع'],
    ['riyadh-warehouse.jpg', 'Modern warehouse storage at a Riyadh logistics facility', 'تخزين حديث في منشأة لوجستية بالرياض'],
    ['stock-handling.jpg', 'Organized inventory shelves and palletized stock', 'رفوف مخزون منظمة وبضائع على منصات تخزين'],
    ['hero-fulfillment.jpg', 'Warehouse team preparing and packing customer orders', 'فريق المستودع يجهز طلبات العملاء ويغلفها'],
    ['saudi-logistics.jpg', 'Saudi freight fleet ready for shipment transportation', 'أسطول شحن سعودي جاهز لنقل الشحنات']
  ];
  const initial = hero.querySelector('.hero-logistics-image');
  const incoming = initial.cloneNode(false);
  incoming.removeAttribute('fetchpriority');
  incoming.setAttribute('aria-hidden', 'true');
  initial.classList.add('hero-image-visible');
  hero.insertBefore(incoming, initial.nextSibling);
  const layers = [initial, incoming];
  let committed = 2, displayed = 2, visible = 0, request = 0, intended = 2;
  const ready = stages.map(([file]) => {
    const image = new Image(); image.src = 'assets/' + file;
    return image.decode().then(() => true).catch(() => false);
  });
  function highlight(index) {
    hero.dataset.heroPreview = String(index);
    hero.dataset.heroCommitted = String(committed);
    flow.querySelectorAll('[data-hero-step]').forEach(button => {
      const i = Number(button.dataset.heroStep);
      button.setAttribute('aria-pressed', String(i === committed));
      button.closest('li').classList.toggle('hero-step-active', i === index);
    });
  }
  const description = index => stages[index][document.documentElement.lang === 'ar' ? 2 : 1];
  async function show(index) {
    intended = index;
    const token = ++request;
    highlight(index);
    if (index === displayed) return;
    if (!await ready[index] || token !== request) return;
    const next = 1 - visible;
    layers[next].src = 'assets/' + stages[index][0];
    layers[next].alt = description(index);
    await layers[next].decode().catch(() => {});
    if (token !== request) return;
    layers[next].classList.add('hero-image-visible');
    layers[next].removeAttribute('aria-hidden');
    layers[visible].classList.remove('hero-image-visible');
    layers[visible].setAttribute('aria-hidden', 'true');
    visible = next; displayed = index;
    hero.dataset.heroImage = stages[index][0];
  }
  flow.addEventListener('pointerover', event => {
    const button = event.target.closest('[data-hero-step]');
    if (button && event.pointerType !== 'touch') show(Number(button.dataset.heroStep));
  });
  flow.addEventListener('pointerleave', () => show(committed));
  flow.addEventListener('focusin', event => {
    const button = event.target.closest('[data-hero-step]');
    if (button) show(Number(button.dataset.heroStep));
  });
  flow.addEventListener('focusout', event => { if (!flow.contains(event.relatedTarget)) show(committed); });
  flow.addEventListener('click', event => {
    const button = event.target.closest('[data-hero-step]');
    if (button) { committed = Number(button.dataset.heroStep); show(committed); }
  });
  new MutationObserver(() => {
    highlight(intended);
    layers[visible].alt = description(displayed);
  }).observe(flow, {childList:true});
  hero.dataset.heroImage = stages[displayed][0];
  initial.alt = description(displayed);
  highlight(displayed);
})();
