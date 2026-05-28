/**
 * schema.js
 * JSON schema definitions, validation utilities, and UML ontology constraints.
 */

'use strict';

// ─── UML Ontology ────────────────────────────────────────────────────────────

const RELATIONSHIP_TYPES = [
  'association',
  'inheritance',
  'aggregation',
  'composition',
  'dependency',
  'realization',
];

const STATUS_VALUES = [
  'not_started',
  'in_progress',
  'completed',
  'verified',
];

const MULTIPLICITY_EXAMPLES = [
  '1', '0..1', '1..*', '0..*', '*', '1..1', 'n', 'm..n'
];

// ─── Default Structures ───────────────────────────────────────────────────────

function makeDefaultAnnotation(annotator) {
  return {
    metadata: {
      annotator: annotator || '',
      timestamp_created: new Date().toISOString(),
      timestamp_modified: new Date().toISOString(),
      verified: false,
      verifier: null,
      timestamp_verified: null,
      status: 'not_started',
    },
    description: '',
    classes: [],
    relationships: [],
  };
}

function makeDefaultClass() {
  return {
    name: '',
    attributes: [],
    methods: [],
  };
}

function makeDefaultRelationship() {
  return {
    source: '',
    target: '',
    type: 'association',
    multiplicity_source: null,
    multiplicity_target: null,
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates a single annotation object.
 *
 * Two modes:
 *   strict = false (default) — structural check: types, duplicates, enum values,
 *            integrity of relationships. Used by the Validate button.
 *   strict = true            — completeness check: also requires at least one
 *            class with a name, a non-empty description, and no unnamed classes
 *            or empty relationship endpoints. Used by Mark Complete.
 *
 * Returns { valid: boolean, errors: string[] }
 */
function validateAnnotation(annotation, imageKey, strict) {
  const errors = [];
  const prefix = imageKey ? `[${imageKey}] ` : '';
  strict = strict || false;

  if (!annotation || typeof annotation !== 'object') {
    return { valid: false, errors: [`${prefix}Annotation must be an object.`] };
  }

  // ── Metadata ────────────────────────────────────────────────────────────────
  const meta = annotation.metadata;
  if (!meta || typeof meta !== 'object') {
    errors.push(`${prefix}Missing metadata block.`);
  } else {
    if (!meta.annotator || typeof meta.annotator !== 'string' || !meta.annotator.trim()) {
      errors.push(`${prefix}metadata.annotator must be a non-empty string.`);
    }
    if (!meta.status || !STATUS_VALUES.includes(meta.status)) {
      errors.push(`${prefix}metadata.status must be one of: ${STATUS_VALUES.join(', ')}.`);
    }
    if (meta.verified && (!meta.verifier || !meta.verifier.trim())) {
      errors.push(`${prefix}metadata.verifier required when verified is true.`);
    }
    if (meta.verified && !meta.timestamp_verified) {
      errors.push(`${prefix}metadata.timestamp_verified required when verified is true.`);
    }
  }

  // ── Description ─────────────────────────────────────────────────────────────
  if (typeof annotation.description !== 'string') {
    errors.push(`${prefix}description must be a string.`);
  } else if (strict && !annotation.description.trim()) {
    errors.push(`${prefix}Description must not be empty (required to mark as complete).`);
  }

  // ── Classes ─────────────────────────────────────────────────────────────────
  const classes = annotation.classes;
  if (!Array.isArray(classes)) {
    errors.push(`${prefix}classes must be an array.`);
  } else {

    // Completeness: at least one class required to mark complete
    if (strict && classes.length === 0) {
      errors.push(`${prefix}At least one class must be defined (required to mark as complete).`);
    }

    const classNames = new Set();
    classes.forEach((cls, i) => {
      if (!cls.name || typeof cls.name !== 'string' || !cls.name.trim()) {
        errors.push(`${prefix}Class #${i + 1} has an empty name — all classes must be named.`);
      } else {
        const normalized = cls.name.trim();
        if (classNames.has(normalized.toLowerCase())) {
          errors.push(`${prefix}Duplicate class name: "${normalized}".`);
        } else {
          classNames.add(normalized.toLowerCase());
        }
      }
      if (!Array.isArray(cls.attributes)) {
        errors.push(`${prefix}classes[${i}].attributes must be an array.`);
      }
      if (!Array.isArray(cls.methods)) {
        errors.push(`${prefix}classes[${i}].methods must be an array.`);
      }
    });

    // ── Relationships ────────────────────────────────────────────────────────
    const relationships = annotation.relationships;
    if (!Array.isArray(relationships)) {
      errors.push(`${prefix}relationships must be an array.`);
    } else {
      const knownClassNames = new Set(
        classes.map(c => c.name && c.name.trim ? c.name.trim().toLowerCase() : '').filter(Boolean)
      );
      relationships.forEach((rel, i) => {
        const rLabel = `Relationship #${i + 1}`;
        if (!rel.source || !rel.source.trim()) {
          errors.push(`${prefix}${rLabel}: source class must not be empty.`);
        } else if (!knownClassNames.has(rel.source.trim().toLowerCase())) {
          errors.push(`${prefix}${rLabel}: source "${rel.source}" does not match any defined class.`);
        }
        if (!rel.target || !rel.target.trim()) {
          errors.push(`${prefix}${rLabel}: target class must not be empty.`);
        } else if (!knownClassNames.has(rel.target.trim().toLowerCase())) {
          errors.push(`${prefix}${rLabel}: target "${rel.target}" does not match any defined class.`);
        }
        if (!rel.type || !RELATIONSHIP_TYPES.includes(rel.type)) {
          errors.push(`${prefix}${rLabel}: type must be one of: ${RELATIONSHIP_TYPES.join(', ')}.`);
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a full dataset object (map of imageKey → annotation).
 * Returns { valid: boolean, errors: string[] }
 */
function validateDataset(dataset) {
  if (!dataset || typeof dataset !== 'object' || Array.isArray(dataset)) {
    return { valid: false, errors: ['Dataset must be a JSON object (map of filename → annotation).'] };
  }
  const allErrors = [];
  for (const [key, annotation] of Object.entries(dataset)) {
    const result = validateAnnotation(annotation, key);
    allErrors.push(...result.errors);
  }
  return { valid: allErrors.length === 0, errors: allErrors };
}

// Export as module-like object on window
window.Schema = {
  RELATIONSHIP_TYPES,
  STATUS_VALUES,
  MULTIPLICITY_EXAMPLES,
  makeDefaultAnnotation,
  makeDefaultClass,
  makeDefaultRelationship,
  validateAnnotation,
  validateDataset,
};
