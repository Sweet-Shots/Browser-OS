/* =====================================================================
   CORE 0: PRISTINE TEMPLATE SNAPSHOT
   ---------------------------------------------------------------------
   This MUST be the first code that runs. The whole OS is a single
   classic <script> placed last in <body>, so by the time this line
   executes the entire document has been parsed but nothing has been
   modified yet. Every save is built from this snapshot, with only the
   contents of <script id="os-data"> replaced, so runtime DOM (windows,
   menus, lock screen...) can never leak into a saved file.
   ===================================================================== */
var __OS_PRISTINE__ = (function () {
  var nodes = [];
  for (var n = document.firstChild; n; n = n.nextSibling) nodes.push(n.cloneNode(true));
  return nodes;
})();
