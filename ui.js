/**
 * ui.js
 * All rendering, DOM updates, form management, progress tracking,
 * toast notifications, and dialog handling.
 *
 * KEY FIX: The static editor DOM (textarea, containers, buttons) is NEVER
 * destroyed via innerHTML. An #editor-overlay div covers the editor when
 * no image is loaded; hiding it reveals the live editor. This ensures all
 * event listeners wired in wireGlobalButtons() remain valid always.
 */

'use strict';

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('uml_theme', theme);
  var btn = document.getElementById('btn-theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

var toastTimer = null;

function showToast(message, type) {
  type = type || 'info';
  var toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'toast toast--' + type + ' toast--visible';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toast.className = 'toast'; }, 3200);
}

// ---------------------------------------------------------------------------
// Autosave indicator
// ---------------------------------------------------------------------------

function updateAutosaveIndicator() {
  var el = document.getElementById('autosave-indicator');
  if (!el) return;
  var map = {
    idle:    { text: '',                cls: '' },
    pending: { text: 'Unsaved changes', cls: 'indicator--pending' },
    saved:   { text: 'Draft saved',     cls: 'indicator--saved' },
    error:   { text: 'Save failed',     cls: 'indicator--error' },
  };
  var s = map[App.state.autosaveStatus] || map.idle;
  el.textContent = s.text;
  el.className = 'autosave-indicator ' + s.cls;
}

// ---------------------------------------------------------------------------
// Login / recovery
// ---------------------------------------------------------------------------

function renderLoginScreen() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-shell').style.display = 'none';
}

function showDraftRecoveryDialog() {
  var draft = Storage.loadDraft();
  if (!draft) { renderLoginScreen(); return; }

  // Compute per-status counts from the draft dataset
  var dataset  = draft.dataset || {};
  var imgList  = draft.imageList || [];
  var counts   = { not_started: 0, in_progress: 0, completed: 0, verified: 0 };
  imgList.forEach(function (img) {
    var ann = dataset[img.name];
    var s   = (ann && ann.metadata && ann.metadata.status) || 'not_started';
    if (counts[s] !== undefined) counts[s]++;
    else counts.not_started++;
  });

  var savedAt   = draft.savedAt ? new Date(draft.savedAt).toLocaleString() : 'unknown';
  var annotator = draft.username || '?';
  var role      = draft.role     || '?';
  var total     = imgList.length;

  // Build the info block as structured HTML
  var html =
    '<table class="recovery-table">' +
      '<tr><td>Draft from</td><td><strong>' + savedAt + '</strong></td></tr>' +
      '<tr><td>User</td><td><strong>' + annotator + '</strong> (' + role + ')</td></tr>' +
      '<tr><td>Images</td><td><strong>' + total + '</strong></td></tr>' +
      '<tr><td>Not started</td><td><strong>' + counts.not_started + '</strong></td></tr>' +
      '<tr><td>In progress</td><td><strong>' + counts.in_progress + '</strong></td></tr>' +
      '<tr><td>Completed</td><td><strong>' + counts.completed + '</strong></td></tr>' +
      '<tr><td>Verified</td><td><strong>' + counts.verified + '</strong></td></tr>' +
    '</table>';

  document.getElementById('recovery-info').innerHTML = html;
  document.getElementById('recovery-dialog').style.display = 'flex';
}

// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------

function renderTopBar() {
  var img = App.state.imageList[App.state.currentIndex];
  document.getElementById('topbar-role').textContent = App.state.role || '-';
  document.getElementById('topbar-user').textContent = App.state.username || '-';
  document.getElementById('topbar-image').textContent = img ? img.name : 'No image';
  var ann = App.getCurrentAnnotation();
  var status = (ann && ann.metadata && ann.metadata.status) || 'not_started';
  var el = document.getElementById('topbar-status');
  el.textContent = status.replace(/_/g, ' ');
  el.className = 'status-badge status--' + status;
}

// ---------------------------------------------------------------------------
// Image viewer
// ---------------------------------------------------------------------------

function renderImageViewer() {
  var img = App.state.imageList[App.state.currentIndex];
  var viewer = document.getElementById('image-viewer');
  var ph = document.getElementById('image-placeholder');

  document.getElementById('image-filename').textContent = img ? img.name : '-';
  document.getElementById('image-counter').textContent =
    App.state.imageList.length > 0
      ? (App.state.currentIndex + 1) + ' / ' + App.state.imageList.length
      : '0 / 0';

  if (img && img.url) {
    viewer.src = img.url;
    viewer.style.display = 'block';
    ph.style.display = 'none';
  } else {
    viewer.style.display = 'none';
    ph.style.display = 'flex';
    ph.textContent = img
      ? 'Image not loaded (' + img.name + '). Use Load Images to reload.'
      : 'No images loaded. Use Load Images to begin.';
  }

  document.getElementById('btn-prev').disabled = App.state.currentIndex <= 0;
  document.getElementById('btn-next').disabled =
    App.state.currentIndex >= App.state.imageList.length - 1;
}

// ---------------------------------------------------------------------------
// Progress dashboard
// ---------------------------------------------------------------------------

function renderProgress() {
  var dataset = App.state.dataset;
  var imageList = App.state.imageList;
  var total = imageList.length;
  var completed = 0, verified = 0;

  imageList.forEach(function (img) {
    var ann = dataset[img.name];
    if (!ann) return;
    var s = ann.metadata && ann.metadata.status;
    if (s === 'verified')  { verified++; completed++; }
    else if (s === 'completed') { completed++; }
  });

  document.getElementById('prog-total').textContent = total;
  document.getElementById('prog-completed').textContent = completed;
  document.getElementById('prog-verified').textContent = verified;
  document.getElementById('prog-remaining').textContent = total - completed;

  var pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  document.getElementById('progress-bar-fill').style.width = pct + '%';
  document.getElementById('progress-pct').textContent = pct + '%';

  renderImageList();
}

function renderImageList() {
  var container = document.getElementById('image-list');
  if (!container) return;
  container.innerHTML = '';
  App.state.imageList.forEach(function (img, idx) {
    var ann = App.state.dataset[img.name];
    var status = (ann && ann.metadata && ann.metadata.status) || 'not_started';
    var item = document.createElement('div');
    item.className = 'image-list-item status--' + status +
      (idx === App.state.currentIndex ? ' active' : '');
    item.title = img.name;

    var nameEl = document.createElement('span');
    nameEl.className = 'image-list-name';
    nameEl.textContent = img.name;

    var statusEl = document.createElement('span');
    statusEl.className = 'image-list-status';
    statusEl.textContent = status.replace(/_/g, ' ');

    item.appendChild(nameEl);
    item.appendChild(statusEl);
    item.addEventListener('click', (function (i) {
      return function () { App.navigateTo(i); };
    })(idx));
    container.appendChild(item);
  });
}

// ---------------------------------------------------------------------------
// Semantic editor
//
// DESIGN: The editor's static DOM lives in #editor-content and is NEVER
// wiped. We simply show/hide #editor-overlay as a cover when no image
// is active. This preserves all attached event listeners at all times.
// ---------------------------------------------------------------------------

function renderEditor() {
  var ann = App.getCurrentAnnotation();
  var overlay = document.getElementById('editor-overlay');
  var content = document.getElementById('editor-content');

  if (!ann) {
    if (overlay) overlay.style.display = 'flex';
    if (content) content.style.display = 'none';
    return;
  }

  if (overlay) overlay.style.display = 'none';
  if (content) content.style.display = 'block';

  renderDescription(ann);
  renderClasses(ann);
  renderRelationships(ann);
  renderMetadataPanel(ann);
  renderVerifierPanel(ann);
  clearValidationErrors();
}

function renderDescription(ann) {
  var ta = document.getElementById('field-description');
  if (ta) ta.value = ann.description || '';
}

function renderClasses(ann) {
  var container = document.getElementById('classes-container');
  if (!container) return;
  container.innerHTML = '';

  (ann.classes || []).forEach(function (cls, ci) {
    var attrsHtml = (cls.attributes || []).map(function (attr, ai) {
      return '<div class="list-item">' +
        '<input class="input input--sm" type="text" value="' + escHtml(attr) + '"' +
        ' data-ci="' + ci + '" data-ai="' + ai + '" data-field="attribute">' +
        '<button class="btn btn-icon btn-danger" data-action="remove-attr"' +
        ' data-ci="' + ci + '" data-ai="' + ai + '">x</button>' +
        '</div>';
    }).join('');

    var methodsHtml = (cls.methods || []).map(function (m, mi) {
      return '<div class="list-item">' +
        '<input class="input input--sm" type="text" value="' + escHtml(m) + '"' +
        ' data-ci="' + ci + '" data-mi="' + mi + '" data-field="method">' +
        '<button class="btn btn-icon btn-danger" data-action="remove-method"' +
        ' data-ci="' + ci + '" data-mi="' + mi + '">x</button>' +
        '</div>';
    }).join('');

    var card = document.createElement('div');
    card.className = 'class-card';
    card.innerHTML =
      '<div class="class-card-header">' +
        '<input class="class-name-input input" type="text" placeholder="ClassName"' +
        ' value="' + escHtml(cls.name) + '" data-ci="' + ci + '" data-field="name">' +
        '<button class="btn btn-icon btn-danger" data-action="remove-class"' +
        ' data-ci="' + ci + '">x</button>' +
      '</div>' +
      '<div class="class-section">' +
        '<div class="class-section-label">Attributes</div>' +
        '<div class="list-items" id="attrs-' + ci + '">' + attrsHtml + '</div>' +
        '<button class="btn btn-sm btn-ghost" data-action="add-attr" data-ci="' + ci + '">+ Add Attribute</button>' +
      '</div>' +
      '<div class="class-section">' +
        '<div class="class-section-label">Methods</div>' +
        '<div class="list-items" id="methods-' + ci + '">' + methodsHtml + '</div>' +
        '<button class="btn btn-sm btn-ghost" data-action="add-method" data-ci="' + ci + '">+ Add Method</button>' +
      '</div>';
    container.appendChild(card);
  });
}

function renderRelationships(ann) {
  var container = document.getElementById('relationships-container');
  if (!container) return;
  container.innerHTML = '';

  var classNames = (ann.classes || []).map(function (c) { return c.name; }).filter(Boolean);

  (ann.relationships || []).forEach(function (rel, ri) {
    var srcOpts = classNames.map(function (n) {
      return '<option value="' + escHtml(n) + '"' + (rel.source === n ? ' selected' : '') + '>' + escHtml(n) + '</option>';
    }).join('');
    var tgtOpts = classNames.map(function (n) {
      return '<option value="' + escHtml(n) + '"' + (rel.target === n ? ' selected' : '') + '>' + escHtml(n) + '</option>';
    }).join('');
    var typeOpts = Schema.RELATIONSHIP_TYPES.map(function (t) {
      return '<option value="' + t + '"' + (rel.type === t ? ' selected' : '') + '>' + t + '</option>';
    }).join('');

    var card = document.createElement('div');
    card.className = 'relationship-card';
    card.innerHTML =
      '<div class="rel-row">' +
        '<div class="form-group form-group--sm"><label class="form-label">Source</label>' +
          '<select class="input select" data-ri="' + ri + '" data-field="source">' +
            '<option value="">- select -</option>' + srcOpts + '</select></div>' +
        '<div class="form-group form-group--sm"><label class="form-label">Type</label>' +
          '<select class="input select" data-ri="' + ri + '" data-field="type">' +
            typeOpts + '</select></div>' +
        '<div class="form-group form-group--sm"><label class="form-label">Target</label>' +
          '<select class="input select" data-ri="' + ri + '" data-field="target">' +
            '<option value="">- select -</option>' + tgtOpts + '</select></div>' +
        '<button class="btn btn-icon btn-danger" data-action="remove-rel" data-ri="' + ri + '">x</button>' +
      '</div>' +
      '<div class="rel-row rel-row--mult">' +
        '<div class="form-group form-group--sm"><label class="form-label">Mult. (source)</label>' +
          '<input class="input input--sm" type="text" placeholder="e.g. 0..1"' +
          ' value="' + escHtml(rel.multiplicity_source || '') + '"' +
          ' data-ri="' + ri + '" data-field="multiplicity_source"></div>' +
        '<div class="form-group form-group--sm"><label class="form-label">Mult. (target)</label>' +
          '<input class="input input--sm" type="text" placeholder="e.g. 1..*"' +
          ' value="' + escHtml(rel.multiplicity_target || '') + '"' +
          ' data-ri="' + ri + '" data-field="multiplicity_target"></div>' +
      '</div>';
    container.appendChild(card);
  });
}

function renderMetadataPanel(ann) {
  var el = document.getElementById('meta-panel');
  var meta = ann && ann.metadata;
  if (!el || !meta) return;

  var html =
    row('Annotator', escHtml(meta.annotator || '-')) +
    row('Created',   fmtDate(meta.timestamp_created)) +
    row('Modified',  fmtDate(meta.timestamp_modified)) +
    '<div class="meta-row"><span class="meta-key">Status</span>' +
      '<span class="meta-val"><span class="status-badge status--' + meta.status + '">' +
      meta.status.replace(/_/g, ' ') + '</span></span></div>';

  if (meta.verified) {
    html += row('Verifier', escHtml(meta.verifier || '-')) +
            row('Verified at', fmtDate(meta.timestamp_verified));
  }
  el.innerHTML = html;

  function row(key, val) {
    return '<div class="meta-row"><span class="meta-key">' + key +
           '</span><span class="meta-val">' + val + '</span></div>';
  }
}

function renderVerifierPanel(ann) {
  var panel = document.getElementById('verifier-panel');
  if (!panel) return;
  if (App.state.role !== 'verifier') { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  var verified = ann && ann.metadata && ann.metadata.verified;
  var btn = document.getElementById('verify-btn');
  btn.textContent = verified ? 'Remove Verification' : 'Mark Verified';
  btn.className = verified ? 'btn btn-warning' : 'btn btn-success';
}

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

function showValidationErrors(errors) {
  var el = document.getElementById('validation-errors');
  if (!el) return;
  el.innerHTML = errors.map(function (e) { return '<li>' + escHtml(e) + '</li>'; }).join('');
  el.style.display = errors.length ? 'block' : 'none';
}

function clearValidationErrors() {
  var el = document.getElementById('validation-errors');
  if (el) { el.innerHTML = ''; el.style.display = 'none'; }
}

// ---------------------------------------------------------------------------
// Render all
// ---------------------------------------------------------------------------

function renderAll() {
  renderTopBar();
  renderImageViewer();
  renderProgress();
  renderEditor();
  updateAutosaveIndicator();
}

// ---------------------------------------------------------------------------
// Event delegation — attached to #editor-content which is always in DOM
// ---------------------------------------------------------------------------

function wireEditorEvents() {
  var editorContent = document.getElementById('editor-content');
  if (!editorContent) return;
  editorContent.addEventListener('input', handleEditorInput);
  editorContent.addEventListener('change', handleEditorChange);
  editorContent.addEventListener('click', handleEditorClick);
}

function handleEditorInput(e) {
  var ann = App.getCurrentAnnotation();
  if (!ann) return;
  var el = e.target;

  if (el.id === 'field-description') {
    ann.description = el.value;
    App.touchAnnotation();
    App.autoUpdateStatus();
    App.markDirty();
    return;
  }
  if (el.dataset.field === 'name' && el.dataset.ci !== undefined) {
    var ci = +el.dataset.ci;
    if (ann.classes[ci]) {
      var oldName = ann.classes[ci].name;
      ann.classes[ci].name = el.value;
      ann.relationships.forEach(function (r) {
        if (r.source === oldName) r.source = el.value;
        if (r.target === oldName) r.target = el.value;
      });
      App.touchAnnotation();
      App.markDirty();
      renderRelationships(ann);
    }
    return;
  }
  if (el.dataset.field === 'attribute') {
    var cls = ann.classes[+el.dataset.ci];
    if (cls) { cls.attributes[+el.dataset.ai] = el.value; App.touchAnnotation(); App.markDirty(); }
    return;
  }
  if (el.dataset.field === 'method') {
    var cls2 = ann.classes[+el.dataset.ci];
    if (cls2) { cls2.methods[+el.dataset.mi] = el.value; App.touchAnnotation(); App.markDirty(); }
    return;
  }
  if (el.dataset.field === 'multiplicity_source' || el.dataset.field === 'multiplicity_target') {
    var rel = ann.relationships[+el.dataset.ri];
    if (rel) { rel[el.dataset.field] = el.value || null; App.touchAnnotation(); App.markDirty(); }
    return;
  }
}

function handleEditorChange(e) {
  var ann = App.getCurrentAnnotation();
  if (!ann) return;
  var el = e.target;
  if (el.dataset.field === 'source' || el.dataset.field === 'target' || el.dataset.field === 'type') {
    var rel = ann.relationships[+el.dataset.ri];
    if (rel) { rel[el.dataset.field] = el.value; App.touchAnnotation(); App.markDirty(); }
  }
}

function handleEditorClick(e) {
  var btn = e.target.closest('[data-action]');
  if (!btn) return;
  var ann = App.getCurrentAnnotation();
  if (!ann) return;
  var action = btn.dataset.action;

  if (action === 'remove-class') {
    var ci = +btn.dataset.ci;
    var name = ann.classes[ci] && ann.classes[ci].name;
    ann.classes.splice(ci, 1);
    ann.relationships = ann.relationships.filter(function (r) {
      return r.source !== name && r.target !== name;
    });
    App.touchAnnotation(); App.autoUpdateStatus(); App.markDirty();
    renderClasses(ann); renderRelationships(ann);
  }
  else if (action === 'add-attr') {
    var ci2 = +btn.dataset.ci;
    if (ann.classes[ci2]) {
      ann.classes[ci2].attributes.push('');
      App.touchAnnotation(); App.markDirty();
      renderClasses(ann);
      var inputs = document.querySelectorAll('#attrs-' + ci2 + ' input');
      if (inputs.length) inputs[inputs.length - 1].focus();
    }
  }
  else if (action === 'remove-attr') {
    var cls3 = ann.classes[+btn.dataset.ci];
    if (cls3) { cls3.attributes.splice(+btn.dataset.ai, 1); App.touchAnnotation(); App.markDirty(); renderClasses(ann); }
  }
  else if (action === 'add-method') {
    var ci4 = +btn.dataset.ci;
    if (ann.classes[ci4]) {
      ann.classes[ci4].methods.push('');
      App.touchAnnotation(); App.markDirty();
      renderClasses(ann);
      var minputs = document.querySelectorAll('#methods-' + ci4 + ' input');
      if (minputs.length) minputs[minputs.length - 1].focus();
    }
  }
  else if (action === 'remove-method') {
    var cls5 = ann.classes[+btn.dataset.ci];
    if (cls5) { cls5.methods.splice(+btn.dataset.mi, 1); App.touchAnnotation(); App.markDirty(); renderClasses(ann); }
  }
  else if (action === 'remove-rel') {
    ann.relationships.splice(+btn.dataset.ri, 1);
    App.touchAnnotation(); App.markDirty();
    renderRelationships(ann);
  }
}

// ---------------------------------------------------------------------------
// Global button wiring
// ---------------------------------------------------------------------------

function wireGlobalButtons() {
  document.getElementById('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var role = document.getElementById('login-role').value;
    var username = document.getElementById('login-username').value.trim();
    if (!username) { alert('Please enter a username.'); return; }
    App.startSession(role, username);
  });

  document.getElementById('btn-resume').addEventListener('click', function () {
    document.getElementById('recovery-dialog').style.display = 'none';
    App.resumeDraft();
  });
  document.getElementById('btn-discard').addEventListener('click', function () {
    document.getElementById('recovery-dialog').style.display = 'none';
    App.discardDraft();
  });

  document.getElementById('btn-prev').addEventListener('click', App.prevImage);
  document.getElementById('btn-next').addEventListener('click', App.nextImage);
  document.getElementById('btn-load-images').addEventListener('click', App.loadImages);

  document.getElementById('btn-add-class').addEventListener('click', function () {
    var ann = App.getCurrentAnnotation();
    if (!ann) return;
    ann.classes.push(Schema.makeDefaultClass());
    App.touchAnnotation(); App.autoUpdateStatus(); App.markDirty();
    renderClasses(ann);
    var inputs = document.querySelectorAll('.class-name-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  document.getElementById('btn-add-rel').addEventListener('click', function () {
    var ann = App.getCurrentAnnotation();
    if (!ann) return;
    ann.relationships.push(Schema.makeDefaultRelationship());
    App.touchAnnotation(); App.markDirty();
    renderRelationships(ann);
  });

  document.getElementById('btn-complete').addEventListener('click', App.markCompleted);

  document.getElementById('verify-btn').addEventListener('click', function () {
    var ann = App.getCurrentAnnotation();
    if (!ann) return;
    if (ann.metadata.verified) App.unverifyAnnotation();
    else App.verifyAnnotation(App.state.username);
  });

  document.getElementById('btn-validate').addEventListener('click', function () {
    var ann = App.getCurrentAnnotation();
    if (!ann) return;
    var imgName = App.state.imageList[App.state.currentIndex] &&
                  App.state.imageList[App.state.currentIndex].name;

    // Run both structural (loose) and completeness (strict) checks
    var looseResult  = Schema.validateAnnotation(ann, imgName, false);
    var strictResult = Schema.validateAnnotation(ann, imgName, true);

    if (!looseResult.valid) {
      // Structural errors — must be fixed
      showValidationErrors(looseResult.errors);
      showToast(looseResult.errors.length + ' structural error(s) found.', 'error');
    } else if (!strictResult.valid) {
      // Structurally OK but incomplete — warn user
      showValidationErrors(strictResult.errors);
      showToast('Annotation incomplete — cannot be marked as Complete yet.', 'info');
    } else {
      // Fully valid and complete
      clearValidationErrors();
      showToast('Validation passed — annotation is complete and ready.', 'success');
    }
  });

  document.getElementById('btn-export').addEventListener('click', App.exportAnnotations);
  document.getElementById('btn-import').addEventListener('click', App.importAnnotations);

  document.getElementById('image-viewer').addEventListener('click', function () {
    this.classList.toggle('zoomed');
  });

  // Sign out
  document.getElementById('btn-signout').addEventListener('click', function () {
    App.signOut();
  });

  // About modal — wired with null-safe helpers so any missing element never crashes the rest
  function openAbout()  { document.getElementById('about-modal').style.display = 'flex'; }
  function closeAbout() { document.getElementById('about-modal').style.display = 'none'; }

  function safeOn(id, ev, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(ev, fn);
  }

  safeOn('btn-about',       'click', openAbout);
  safeOn('btn-about-close', 'click', closeAbout);
  safeOn('btn-about-close-bottom', 'click', closeAbout);
  safeOn('about-modal', 'click', function (e) {
    if (e.target === this) closeAbout();
  });

  // Theme toggle — restore saved preference immediately
  var savedTheme = localStorage.getItem('uml_theme') || 'dark';
  applyTheme(savedTheme);
  document.getElementById('btn-theme-toggle').addEventListener('click', function () {
    var current = document.documentElement.dataset.theme || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleString(); } catch (e) { return iso; }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function initUI() {
  wireEditorEvents();
  wireGlobalButtons();
}

// expose for Escape key handler in app.js
window._aboutOpen  = function () { document.getElementById('about-modal').style.display = 'flex'; };
window._aboutClose = function () { document.getElementById('about-modal').style.display = 'none'; };

window.UI = {
  showToast: showToast,
  updateAutosaveIndicator: updateAutosaveIndicator,
  renderLoginScreen: renderLoginScreen,
  showDraftRecoveryDialog: showDraftRecoveryDialog,
  renderTopBar: renderTopBar,
  renderImageViewer: renderImageViewer,
  renderProgress: renderProgress,
  renderEditor: renderEditor,
  renderAll: renderAll,
  showValidationErrors: showValidationErrors,
  clearValidationErrors: clearValidationErrors,
  initUI: initUI,
};

document.addEventListener('DOMContentLoaded', function () { UI.initUI(); });
