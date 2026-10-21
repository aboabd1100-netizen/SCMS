/* Dark Mode uses official emerald and sand ink with the original artwork's alpha. */
(() => {
  const synchronize = () => {
    document.querySelectorAll('.guest-brand img,.scms-footer-brand img,.official-brand img,img.header-brand').forEach(img => {
      if (img.getAttribute('src') !== window.SCMSLogo.src) img.setAttribute('src', window.SCMSLogo.src);
    });
  };
  synchronize();
  new MutationObserver(synchronize).observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['src']});
  const filters = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  filters.setAttribute('width', '0');
  filters.setAttribute('height', '0');
  filters.setAttribute('aria-hidden', 'true');
  filters.setAttribute('focusable', 'false');
  filters.style.position = 'absolute';
  filters.style.pointerEvents = 'none';
  filters.innerHTML = `<defs>
    <filter id="scms-logo-dark" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">
      <!-- Green has more green than red; gold has more red than green.
           Select the entire green gradient rather than only its darkest pixels. -->
      <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -12 12 0 0 0" result="greenMask"/>
      <feComponentTransfer in="greenMask" result="letterMask">
        <feFuncA type="linear" slope="1" intercept="0"/>
      </feComponentTransfer>
      <feComposite in="letterMask" in2="SourceAlpha" operator="in" result="opaqueLetters"/>
      <feFlood flood-color="#D6C6A5" result="sandInk"/>
      <feComposite in="sandInk" in2="SourceAlpha" operator="in" result="sandArtwork"/>
      <feFlood flood-color="#2F855A" result="lightInk"/>
      <feComposite in="lightInk" in2="opaqueLetters" operator="in" result="lightLetters"/>
      <!-- Keep the original alpha, including antialiased edges. -->
      <feComposite in="lightLetters" in2="sandArtwork" operator="atop"/>
    </filter>
  </defs>`;
  document.body.prepend(filters);
})();
