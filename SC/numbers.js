/* Localize presentation only. Stored values, form values and identifiers stay intact. */
(() => {
  const originals = new WeakMap();
  const digits = '٠١٢٣٤٥٦٧٨٩';
  const canonical = text => text.replace(/[٠-٩]/g, c => String(digits.indexOf(c))).replace(/٬/g, ',').replace(/٫/g, '.').replace(/٪/g, '%');
  const format = (text, arabic) => {
    const source = canonical(text);
    if (!arabic) return source;
    return source.replace(/(?<![\p{L}\p{N}_@.\-])\d+(?:[,.]\d+)*(?:%)?(?![\p{L}\p{N}_@.\-])/gu,
      token => token.replace(/[0-9,.%]/g, c => c === ',' ? '٬' : c === '.' ? '٫' : c === '%' ? '٪' : digits[Number(c)]));
  };
  const ignored = 'script,style,textarea,input,code,pre,[data-number-format="off"],a[href^="mailto:"],a[href^="http"],.leaflet-control-attribution';
  let observer;
  const refresh = () => {
    observer?.disconnect();
    const arabic = document.documentElement.lang === 'ar';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest(ignored)) continue;
      // Isolated IDs/SKUs/emails are kept verbatim; money and phone displays are numeric.
      if (parent.closest('bdi') && !parent.closest('.sar-money,.scms-footer-contact')) continue;
      const previous = originals.get(node);
      const source = previous && node.data === previous.output ? previous.source : node.data;
      const output = format(source, arabic);
      originals.set(node, {source, output});
      if (node.data !== output) node.data = output;
    }
    observer?.observe(document.body, {childList:true, subtree:true, characterData:true});
  };
  window.SCMSNumbers = {formatText:format, refresh};
  observer = new MutationObserver(refresh);
  refresh();
  new MutationObserver(refresh).observe(document.documentElement, {attributes:true, attributeFilter:['lang']});
})();
