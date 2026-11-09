(function () {
  window.dialogEditor = window.dialogEditor || {};
  window.dialogEditor.Util = {
    removeExtension: function (path) {
      if (path) {
        return path.split('.').slice(0, -1).join('.')
      }
    },
    addHtmlExtension: function (path) {
      if (path && !path.endsWith('.html')) {
        return path + '.html'
      } else return path;
    },
    prefixWith: function (string, prefix) {
      if (!string || !prefix) return;
      var trimmed = string.trim();
      if (!trimmed.startsWith(prefix)) {
        return prefix + trimmed;
      } else return string;
    },
    /**
     * Turn whatever the user pasted (full URL, /editor.html/... path or plain content path)
     * into the suffix (+ query) AEM appends to the dialog request, e.g. "/content/site/en/page.html?x=1".
     */
    toRequestSuffix: function (input) {
      if (!input || !input.trim()) return '';
      var url = new URL(input.trim(), window.location.origin);
      var path = url.pathname.replace(/^\/editor\.html/, '');
      return (path === '/' ? '' : path) + url.search;
    },
    getDocumentViewPath(dialogPath) {
      return "/apps/dialogeditor.document-view.xml" + this.removeExtension(dialogPath);
    }
  }
})();