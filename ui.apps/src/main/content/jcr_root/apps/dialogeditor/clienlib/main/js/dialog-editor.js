/**
 * This works and I very much aknowledge that it needs refactoring. Maybe some day :) 
 */

$(function () {
  // constants
    SELECTOR = {
      container: '#dialog-editor',
      dialog: '#dialog',
      refreshButton: '#save-refresh',
      splitDirectionButton: '#split-direction',
      editorSplitPane: '#split-editor',
      dialogSplitPane: '#split-result',
      currentDialogPath: '#current-dialog-path',
      requestUrl: '#request-url'
    };

  window.dialogEditor = window.dialogEditor || {};
  var Util = window.dialogEditor.Util;

  // Page-editor-only code often sits in cq.authoring.dialog (e.g. toolbar actions doing
  // `new Granite.author.ui.ToolbarAction(...)` at load). Outside the editor that throws and
  // aborts the rest of the merged cq.authoring.dialog.all JS. This stub (any property access,
  // call or `new` returns the stub) is set ONLY while dialog scripts load, then removed, so
  // runtime checks like AEM's `if (!Granite.author) return null` still see "not in editor".
  var authorStub = new Proxy(function () {}, {
    get: function (t, key) { return key === 'then' || typeof key === 'symbol' ? undefined : authorStub; },
    apply: function () { return authorStub; },
    construct: function () { return authorStub; }
  });
  window.dialogEditor.App = {
    config: {
      panelDirection: 'horizontal', // default direction
      requestUrl: '' // request URL the dialog is rendered for (drives granite:rendercondition)
    },
    _containerEl: null, // the editor container element 
    _dialogContainerEl: null,  // the dialog preview container
    _dialogPath: null, // the current dialog path in JCR
    _docViewPath: null,
    codeEditor: null, // CodeMirror instance
    _split: null, // PanelSplit instance

    init: function (selector) {
      this._containerEl = $(SELECTOR.container);
      this._dialogContainerEl = this._containerEl.find(SELECTOR.dialog);
      this.setDialogPath(this._containerEl.data('dialog-path'));
      var localStorageState = JSON.parse(localStorage.getItem('dialogEditorState')) || {};
      this.config = Object.assign(this.config, localStorageState)

      if (!this._dialogPath) {
        this._renderError();
        return;
      }


      // initial refresh
      this._superTypeSelector = new window.dialogEditor.SuperTypeSelector(this._dialogPath);
      this._panelSplit = new window.dialogEditor.PanelSplit(SELECTOR.editorSplitPane, SELECTOR.dialogSplitPane);
      this._panelSplit.changeDirection(this.config.panelDirection);
      this.updatePanelDirectionButton(this.config.panelDirection)
      this._initCodeEditor();
      this.refresh();
      this._bindEvents();

    },
    _saveConfig() {
      localStorage.setItem('dialogEditorState', JSON.stringify(this.config));
    },
    _renderError: function () {
      this._containerEl.children().hide();
      this._containerEl.append("<h1>No dialog path provided in request suffix, it should be a path to a dialog path<h1>")

      console.warn("No dialog path provided in requets suffix")
    },
    /**
     * Bind event handlers
     */
    _bindEvents: function () {
      var that = this;

      $(SELECTOR.refreshButton)
        .click((function () {
          that.updateDialogNode()
        }));

      $(SELECTOR.splitDirectionButton)
        .click((function () {
          var newDirection = that.togglePanelDirection();
        }));

      $(SELECTOR.requestUrl)
        .val(that.config.requestUrl)
        .on('change', function () {
          that.config.requestUrl = this.value;
          that._saveConfig();
          that.refreshDialog();
        });
      
      // handle parent selector change
      that._superTypeSelector.addHandler(function(path) {
        var pathWithExtension = Util.addHtmlExtension(path)
        that.setDialogPath(pathWithExtension);
        that.refresh();
      })
        
    },
    _initCodeEditor: function () {
      this.codeEditor = CodeMirror.fromTextArea(document.getElementById("code"), {
        mode: "xml",
        lineNumbers: true,
        //lineWrapping: true,
      });
    },
    // changes panel direction
    togglePanelDirection: function () {
      this.config.panelDirection = this._panelSplit.toggleDirection()
      this.updatePanelDirectionButton(this.config.panelDirection)
      this._saveConfig();
    },
    updatePanelDirectionButton: function (newDirection) {
      var splitDirectionButton = $(SELECTOR.splitDirectionButton)
      splitDirectionButton.removeClass('vertical');
      splitDirectionButton.removeClass('horizontal');
      splitDirectionButton.addClass(newDirection);
    },
    /**
     * Set current dialog path being worked on. Shoul be followed with a call to refresh() for changes to take effect.
     */
    setDialogPath: function (dialogPath) {
      $(SELECTOR.currentDialogPath).html(dialogPath);
      this._dialogPath = dialogPath;
      this._dialogPath = Util.addHtmlExtension(this._dialogPath);
      this._docViewPath = Util.getDocumentViewPath(this._dialogPath);
    },

    /**
     * Pull the dialog code and html from JCR and update UI.
     */
    refresh: function () {
      this.refreshDialog();
      this.refreshCode();
    },

    /**
     * Get the dialog XML from JCR.
     */
    refreshCode: function () {
      var that = this;
      var scrollInfo = that.codeEditor.getScrollInfo();
      var docViewPath = Util.getDocumentViewPath(this._dialogPath)
      $.get(docViewPath)
        .then(function (result) {
          that.codeEditor.setValue(result);
          that.codeEditor.scrollTo(scrollInfo.left, scrollInfo.top);
        })
    },

    /**
     * Get dialog HTML and replace displayed dialog.
     */
    refreshDialog: function () {
      var that = this;
      // mangled `_cq_dialog` like the page editor requests it; renderconditions may parse the URL for it
      var overridePath = Util.prefixWith(that._dialogPath, '/mnt/override').replace('/cq:dialog.', '/_cq_dialog.')
      // suffix = content path, same as AEM's editor does: cq:dialog.html/content/...
      var suffix = Util.toRequestSuffix(that.config.requestUrl) || '/';
      // dialog.jsp 400s when the suffix resource doesn't exist, unless resourceType is passed
      // (then it renders on a SyntheticResource, like the editor does for a newly inserted component)
      var resourceType = Util.removeExtension(that._dialogPath).replace(/^\/(apps|libs)\//, '').replace(/\/cq:dialog$/, '');
      var url = overridePath + suffix + (suffix.indexOf('?') < 0 ? '?' : '&') + 'resourceType=' + encodeURIComponent(resourceType);
      $.get(url)
        .fail(function (xhr) {
          $.toast({ heading: "Dialog failed to load (" + xhr.status + ")", text: url });
        })
        .then(function (data) {
          var parsedHtml = $.parseHTML(data, document, true); // keepScripts: extraClientlibs JS lives in <head>
          var dialogEl = parsedHtml.find(function (el) {
            return el.tagName && el.tagName === "CORAL-DIALOG"
          })
          var css = parsedHtml.filter(function (el) {
            return el.tagName && el.tagName === "LINK"
          });
          // Only external scripts not loaded yet (jQuery/Coral/Granite are already on this page,
          // and extraClientlibs must not re-run on every refresh and double-bind handlers).
          // ponytail: inline <script>s are skipped; load them too if a dialog ever needs one.
          var loaded = that._loadedScripts = that._loadedScripts ||
            new Set($('script[src]').map(function () { return this.src; }).get());
          var js = parsedHtml.filter(function (el) {
            if (el.tagName !== "SCRIPT" || !el.src || loaded.has(el.src)) return false;
            loaded.add(el.src);
            return true;
          });
          if (!dialogEl) return;
          // insert dialog first, then CSS/JS (jQuery evaluates appended scripts in order)
          that._dialogContainerEl.empty().append(dialogEl)
          that._dialogContainerEl.append(css);
          var stubbed = window.Granite && !Granite.author;
          if (stubbed) Granite.author = authorStub;
          try {
            that._dialogContainerEl.append(js); // jQuery runs these synchronously
          } finally {
            if (stubbed) delete Granite.author;
          }

          // same events the page editor fires once a dialog is open
          var $dialog = $(dialogEl);
          Coral.commons.ready(dialogEl, function () {
            $dialog.trigger('foundation-contentloaded');
            // core components read e.dialog; keep the 2nd arg for older custom code
            $(document).trigger($.Event('dialog-loaded', { dialog: $dialog }), { dialog: dialogEl });
          });
        });
    },

    /**
     * Post changes from editor to the JCR.
     */
    updateDialogNode: function () {
      var that = this;
      $.ajax({
        url: that._docViewPath,
        data: that.codeEditor.getValue(),
        type: 'POST',
        contentType: "text/xml",
        dataType: "text"
      })
        .done(function () {
          that.refresh();
          $.toast({ heading: "Success!", text: "Code Saved and Dialog Refreshed!" })
        })
        .fail(function (response) {
          $.toast({ heading: "Failed!", text: "See console logs." })
          console.error(response);
        })
    }
  }

  window.dialogEditor.App.init();
})
