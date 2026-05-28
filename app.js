/**
 * app.js
 * Global state management, app initialization, and coordination
 * between UI, Storage, and Schema modules.
 */

'use strict';

// ─── Global State ─────────────────────────────────────────────────────────────

const AppState = {
  // Session
  role: null,          // 'annotator' | 'verifier'
  username: '',

  // Image management
  imageList: [],       // Array of { name: string, url: string (object URL or path) }
  currentIndex: 0,

  // Dataset: { [filename]: annotationObject }
  dataset: {},

  // UI flags
  isDirty: false,      // Unsaved changes since last autosave
  autosaveStatus: 'idle', // 'idle' | 'pending' | 'saved'
};

// ─── Debounced Autosave ───────────────────────────────────────────────────────

const debouncedAutosave = Storage.debounce(() => {
  const ok = Storage.saveDraft(AppState);
  AppState.autosaveStatus = ok ? 'saved' : 'error';
  AppState.isDirty = false;
  UI.updateAutosaveIndicator();
}, 2000);

// ─── State Mutation Helpers ───────────────────────────────────────────────────

/**
 * Called whenever annotation data changes.
 * Marks state dirty and triggers debounced autosave.
 */
function markDirty() {
  AppState.isDirty = true;
  AppState.autosaveStatus = 'pending';
  UI.updateAutosaveIndicator();
  debouncedAutosave();
}

/**
 * Returns the annotation for the current image, creating a default if absent.
 */
function getCurrentAnnotation() {
  const img = AppState.imageList[AppState.currentIndex];
  if (!img) return null;
  if (!AppState.dataset[img.name]) {
    AppState.dataset[img.name] = Schema.makeDefaultAnnotation(AppState.username);
  }
  return AppState.dataset[img.name];
}

/**
 * Updates the timestamp_modified on the current annotation.
 */
function touchAnnotation() {
  const ann = getCurrentAnnotation();
  if (ann) ann.metadata.timestamp_modified = new Date().toISOString();
}

/**
 * Updates the status of the current annotation based on content.
 * Does not override 'verified'.
 */
function autoUpdateStatus() {
  const ann = getCurrentAnnotation();
  if (!ann) return;
  if (ann.metadata.status === 'verified') return;
  const hasContent = ann.classes.length > 0 || ann.description.trim().length > 0;
  ann.metadata.status = hasContent ? 'in_progress' : 'not_started';
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function navigateTo(index) {
  if (index < 0 || index >= AppState.imageList.length) return;
  // Validate current annotation before leaving (soft warning)
  AppState.currentIndex = index;
  UI.renderAll();
}

function nextImage() {
  navigateTo(AppState.currentIndex + 1);
}

function prevImage() {
  navigateTo(AppState.currentIndex - 1);
}

// ─── Annotation Save (Mark Complete) ─────────────────────────────────────────

function markCompleted() {
  const ann = getCurrentAnnotation();
  if (!ann) return;
  const imgName = AppState.imageList[AppState.currentIndex]?.name;
  // Use strict=true: requires description + at least one named class
  const result = Schema.validateAnnotation(ann, imgName, true);
  if (!result.valid) {
    UI.showValidationErrors(result.errors);
    UI.showToast(`Cannot complete: ${result.errors.length} error(s) found.`, 'error');
    return;
  }
  ann.metadata.status = 'completed';
  ann.metadata.timestamp_modified = new Date().toISOString();
  markDirty();
  UI.renderAll();
  UI.showToast('Annotation marked as completed.', 'success');
}

// ─── Verification ────────────────────────────────────────────────────────────

function verifyAnnotation(verifierName) {
  if (AppState.role !== 'verifier') return;
  const ann = getCurrentAnnotation();
  if (!ann) return;
  ann.metadata.verified = true;
  ann.metadata.verifier = verifierName || AppState.username;
  ann.metadata.timestamp_verified = new Date().toISOString();
  ann.metadata.status = 'verified';
  ann.metadata.timestamp_modified = new Date().toISOString();
  markDirty();
  UI.renderAll();
  UI.showToast('Annotation verified.', 'success');
}

function unverifyAnnotation() {
  if (AppState.role !== 'verifier') return;
  const ann = getCurrentAnnotation();
  if (!ann) return;
  ann.metadata.verified = false;
  ann.metadata.verifier = null;
  ann.metadata.timestamp_verified = null;
  ann.metadata.status = 'completed';
  ann.metadata.timestamp_modified = new Date().toISOString();
  markDirty();
  UI.renderAll();
  UI.showToast('Verification removed.', 'info');
}

// ─── Export / Import ──────────────────────────────────────────────────────────

function exportAnnotations() {
  Storage.exportDataset(AppState.dataset);
  UI.showToast('annotations.json exported.', 'success');
}

async function importAnnotations() {
  // Guard: images must be loaded first so annotations always have a diagram to show
  if (AppState.imageList.length === 0) {
    UI.showToast('Please load your images first, then import annotations.', 'error');
    return;
  }

  try {
    const imported = await Storage.importDataset();

    // ── Dataset / image-list size and name matching ──────────────────────────
    const importedKeys  = Object.keys(imported);
    const loadedNames   = new Set(AppState.imageList.map(i => i.name));
    const importedSet   = new Set(importedKeys);

    const notInImages   = importedKeys.filter(k => !loadedNames.has(k));   // in JSON but no image
    const notInJSON     = AppState.imageList                                // image loaded but no annotation
                            .map(i => i.name)
                            .filter(n => !importedSet.has(n));

    if (notInImages.length > 0 || notInJSON.length > 0) {
      let msg = `Dataset mismatch detected:\n\n`;
      if (importedKeys.length !== AppState.imageList.length) {
        msg += `• Loaded images: ${AppState.imageList.length}\n`;
        msg += `• Annotations in JSON: ${importedKeys.length}\n\n`;
      }
      if (notInImages.length > 0) {
        msg += `Annotations with no matching image (${notInImages.length}):\n`;
        msg += notInImages.slice(0, 5).map(k => `  - ${k}`).join('\n');
        if (notInImages.length > 5) msg += `\n  ... and ${notInImages.length - 5} more`;
        msg += '\n\n';
      }
      if (notInJSON.length > 0) {
        msg += `Images with no annotation in JSON (${notInJSON.length}):\n`;
        msg += notInJSON.slice(0, 5).map(n => `  - ${n}`).join('\n');
        if (notInJSON.length > 5) msg += `\n  ... and ${notInJSON.length - 5} more`;
        msg += '\n\n';
      }
      msg += 'Import anyway?';
      if (!confirm(msg)) return;
    }

    // ── Schema validation ────────────────────────────────────────────────────
    const result = Schema.validateDataset(imported);
    if (!result.valid) {
      UI.showValidationErrors(result.errors);
      const proceed = confirm(
        `Import has ${result.errors.length} schema error(s).\n\n` +
        result.errors.slice(0, 5).join('\n') +
        '\n\nImport anyway?'
      );
      if (!proceed) return;
    }

    // Merge: imported annotations take precedence
    Object.assign(AppState.dataset, imported);
    // Add any new image keys to the image list (shouldn't happen after mismatch
    // check, but kept as safety net if user chose to proceed anyway)
    for (const key of importedKeys) {
      if (!AppState.imageList.find(i => i.name === key)) {
        AppState.imageList.push({ name: key, url: null });
      }
    }
    markDirty();
    UI.renderAll();
    UI.showToast(`Imported ${importedKeys.length} annotation(s).`, 'success');
  } catch (err) {
    UI.showToast('Import failed: ' + err, 'error');
  }
}

// ─── Image Loading ────────────────────────────────────────────────────────────

async function loadImages() {
  try {
    const files = await Storage.selectImages();
    // Revoke old object URLs
    AppState.imageList.forEach(img => { if (img.url) URL.revokeObjectURL(img.url); });
    AppState.imageList = files.map(file => ({
      name: file.name,
      url: URL.createObjectURL(file),
      file,
    }));
    // Ensure dataset entries exist for new images
    AppState.imageList.forEach(img => {
      if (!AppState.dataset[img.name]) {
        AppState.dataset[img.name] = Schema.makeDefaultAnnotation(AppState.username);
      }
    });
    AppState.currentIndex = 0;
    markDirty();
    UI.renderAll();
    UI.showToast(`Loaded ${files.length} image(s).`, 'success');
  } catch (err) {
    UI.showToast('Image load cancelled or failed: ' + err, 'info');
  }
}

// ─── Session Startup ──────────────────────────────────────────────────────────

function startSession(role, username) {
  AppState.role = role;
  AppState.username = username;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'flex';
  UI.renderAll();
}

function initApp() {
  // Wire keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Escape closes About modal
    if (e.key === 'Escape') {
      var m = document.getElementById('about-modal');
      if (m && m.style.display === 'flex') { m.style.display = 'none'; return; }
    }
    // Ignore when typing in inputs
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag)) {
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        exportAnnotations();
      }
      return;
    }
    if (e.key === 'n' || e.key === 'N') nextImage();
    if (e.key === 'p' || e.key === 'P') prevImage();
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      exportAnnotations();
    }
  });

  // Check for draft
  if (Storage.hasDraft()) {
    UI.showDraftRecoveryDialog();
  } else {
    UI.renderLoginScreen();
  }
}

function resumeDraft() {
  const draft = Storage.loadDraft();
  if (!draft) return;
  AppState.dataset = draft.dataset || {};
  AppState.imageList = (draft.imageList || []).map(img => ({
    ...img,
    url: null, // Object URLs don't survive reload; images need re-loading
  }));
  AppState.currentIndex = draft.currentIndex || 0;
  AppState.role = draft.role || 'annotator';
  AppState.username = draft.username || '';
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'flex';
  UI.showToast('Session resumed from draft. Please reload images.', 'info');
  UI.renderAll();
}

function discardDraft() {
  Storage.clearDraft();
  UI.renderLoginScreen();
}

// Expose to global scope for UI event handlers
window.App = {
  state: AppState,
  markDirty,
  getCurrentAnnotation,
  touchAnnotation,
  autoUpdateStatus,
  navigateTo,
  nextImage,
  prevImage,
  markCompleted,
  verifyAnnotation,
  unverifyAnnotation,
  exportAnnotations,
  importAnnotations,
  loadImages,
  startSession,
  resumeDraft,
  discardDraft,
  initApp,
};

// Boot
document.addEventListener('DOMContentLoaded', () => {
  App.initApp();
});

// ─── Sign Out ─────────────────────────────────────────────────────────────────

// NOTE: appended after initial window.App definition; we extend it below.

function signOut() {
  const hasWork = Object.keys(AppState.dataset).length > 0;
  if (hasWork) {
    const ok = confirm(
      'Sign out and return to the login screen?\n\n' +
      'Your current draft is saved in localStorage and will be offered for recovery on next login.\n\n' +
      'If you want a clean slate, use Discard Draft at startup.'
    );
    if (!ok) return;
  }

  // Save draft so work is not lost
  Storage.saveDraft(AppState);

  // Reset in-memory state
  AppState.role = null;
  AppState.username = '';
  AppState.currentIndex = 0;
  // Keep dataset and imageList in draft but clear from live state
  AppState.dataset = {};
  AppState.imageList = [];
  AppState.isDirty = false;
  AppState.autosaveStatus = 'idle';

  // Return to login — and immediately show draft recovery if a draft exists
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('login-username').value = '';
  if (Storage.hasDraft()) {
    UI.showDraftRecoveryDialog();
  } else {
    document.getElementById('login-screen').style.display = 'flex';
  }
}

// Extend the already-created window.App object
App.signOut = signOut;
