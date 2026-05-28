/**
 * storage.js
 * Handles localStorage autosave, draft persistence, session recovery,
 * and JSON import/export via browser Blob downloads.
 */

'use strict';

const STORAGE_KEYS = {
  DRAFT: 'uml_annotation_draft',
  SESSION: 'uml_annotation_session',
};

// ─── Autosave (Draft) ─────────────────────────────────────────────────────────

/**
 * Saves the current full state (dataset + session info) to localStorage.
 * @param {object} state - The global app state to persist.
 */
function saveDraft(state) {
  try {
    const payload = {
      dataset: state.dataset,
      currentIndex: state.currentIndex,
      imageList: state.imageList,
      role: state.role,
      username: state.username,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEYS.DRAFT, JSON.stringify(payload));
    return true;
  } catch (e) {
    console.error('[Storage] Failed to save draft:', e);
    return false;
  }
}

/**
 * Loads the draft from localStorage.
 * @returns {object|null} The stored draft, or null if none.
 */
function loadDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DRAFT);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error('[Storage] Failed to load draft:', e);
    return null;
  }
}

/**
 * Removes the draft from localStorage.
 */
function clearDraft() {
  localStorage.removeItem(STORAGE_KEYS.DRAFT);
}

/**
 * Returns true if a draft exists in localStorage.
 */
function hasDraft() {
  return !!localStorage.getItem(STORAGE_KEYS.DRAFT);
}

// ─── Debounce Utility ────────────────────────────────────────────────────────

/**
 * Creates a debounced version of fn with the given delay (ms).
 */
function debounce(fn, delay = 2000) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ─── Export ──────────────────────────────────────────────────────────────────

/**
 * Triggers a browser download of the dataset as annotations.json.
 * @param {object} dataset - The full dataset to export.
 */
function exportDataset(dataset) {
  const json = JSON.stringify(dataset, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'annotations.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Import ──────────────────────────────────────────────────────────────────

/**
 * Opens a file picker and imports a JSON annotation file.
 * Returns a Promise that resolves with the parsed dataset object,
 * or rejects with an error message.
 * @returns {Promise<object>}
 */
function importDataset() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return reject('No file selected.');
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target.result);
          resolve(parsed);
        } catch (err) {
          reject('Invalid JSON file: ' + err.message);
        }
      };
      reader.onerror = () => reject('Failed to read file.');
      reader.readAsText(file);
    };
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  });
}

// ─── Image List Discovery ─────────────────────────────────────────────────────

/**
 * Allows the user to select image files from the images/ folder.
 * Returns a Promise resolving to an array of filenames (strings).
 *
 * Since we can't auto-scan directories in a static browser context,
 * we ask the user to select the files manually OR read from a
 * provided manifest JSON if present.
 */
function selectImages() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = (e) => {
      const files = Array.from(e.target.files);
      if (!files.length) return reject('No files selected.');
      resolve(files);
    };
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  });
}

window.Storage = {
  saveDraft,
  loadDraft,
  clearDraft,
  hasDraft,
  debounce,
  exportDataset,
  importDataset,
  selectImages,
};
