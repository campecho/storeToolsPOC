/**
 * Browser extensions (Dashlane, LastPass, 1Password, Grammarly, …) stamp
 * data-* attributes onto inputs/buttons between SSR and React hydration,
 * which React 19 reports as a hydration mismatch and answers with a full
 * client re-render. This inline script — rendered server-side as the first
 * thing in <body>, so it runs before hydration — strips those attributes as
 * they appear, then disconnects shortly after load so the extensions can
 * re-annotate and work normally.
 */
const GUARD = `(function () {
  var pattern = /^data-(dashlane|lastpass|1p-|onepassword|bw-|bitwarden|gr-|new-gr-|gramm|kwimpala)/i;
  function scrub(el) {
    if (!el || el.nodeType !== 1) return;
    for (var i = el.attributes.length - 1; i >= 0; i--) {
      var name = el.attributes[i].name;
      if (pattern.test(name)) el.removeAttribute(name);
    }
  }
  function sweep(root) {
    scrub(root);
    if (!root.querySelectorAll) return;
    var all = root.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) scrub(all[i]);
  }
  var observer = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.type === "attributes") {
        if (pattern.test(m.attributeName) && m.target.hasAttribute(m.attributeName)) {
          m.target.removeAttribute(m.attributeName);
        }
      } else if (m.type === "childList") {
        for (var j = 0; j < m.addedNodes.length; j++) sweep(m.addedNodes[j]);
      }
    }
  });
  observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
  sweep(document.documentElement);
  window.addEventListener("load", function () {
    setTimeout(function () { observer.disconnect(); }, 2000);
  });
})();`;

export function HydrationGuard() {
  return <script dangerouslySetInnerHTML={{ __html: GUARD }} />;
}
