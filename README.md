# UML Semantic Annotation Tool

A local-only, frontend-only semantic annotation tool for handwritten UML class diagram datasets.

## Quick Start

1. Copy your diagram images into the `images/` folder (or load them at runtime)
2. Open `index.html` in any modern browser (Chrome, Firefox, Edge)
3. Select your role (Annotator or Verifier) and enter a username
4. Click **Load Images** to select your image files from disk
5. Annotate each diagram using the semantic editor on the right
6. Export your work as `annotations.json` using the Export button or `Ctrl+S`

## File Structure

```
uml-annotation-tool/
├── index.html        ← Open this in your browser
├── style.css         ← Stylesheet
├── app.js            ← Global state, coordination, keyboard shortcuts
├── ui.js             ← Rendering, forms, progress dashboard
├── storage.js        ← localStorage autosave, import/export
├── schema.js         ← JSON schema, validation, UML ontology
├── images/           ← Place your diagram images here (optional)
└── data/
    └── annotations.json  ← Sample / exported annotations
```

## Workflow

### Annotator Mode
- Load images from disk
- Fill in: description, classes (name, attributes, methods), relationships
- Click **Mark Complete** when an image is fully annotated
- Use **Validate** at any time to check for errors
- Export regularly with **Export JSON** or `Ctrl+S`

### Verifier Mode
- Import an existing `annotations.json`
- Load images
- Review each annotation
- Click **Mark Verified** to approve or **Remove Verification** to revoke
- Export the verified dataset

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `N` | Next image |
| `P` | Previous image |
| `Ctrl+S` | Export annotations.json |

## Annotation Format

```json
{
  "image_filename.png": {
    "metadata": {
      "annotator": "alice",
      "timestamp_created": "2026-01-01T00:00:00Z",
      "timestamp_modified": "2026-01-01T01:00:00Z",
      "verified": false,
      "verifier": null,
      "timestamp_verified": null,
      "status": "completed"
    },
    "description": "Natural language description of the diagram.",
    "classes": [
      {
        "name": "ClassName",
        "attributes": ["attr1", "attr2"],
        "methods": ["method1()"]
      }
    ],
    "relationships": [
      {
        "source": "ClassName",
        "target": "OtherClass",
        "type": "association",
        "multiplicity_source": "1",
        "multiplicity_target": "0..*"
      }
    ]
  }
}
```

### Status Values
- `not_started` — no content yet
- `in_progress` — partially annotated
- `completed` — fully annotated, ready for verification
- `verified` — reviewed and approved by a verifier

### Relationship Types
- `association`
- `inheritance`
- `aggregation`
- `composition`
- `dependency`
- `realization`

## Autosave & Recovery

The tool autosaves your work to `localStorage` every ~2 seconds after a change. If your browser closes unexpectedly, you'll be offered the chance to **Resume Session** on next launch.

Since `localStorage` does not persist object URLs for images across sessions, you'll need to reload your images after resuming. All annotation data is preserved.

## Notes

- No backend, no database, no authentication required
- All data stays in your browser/localStorage until exported
- Import existing `annotations.json` to continue collaborative work
- Images are referenced by filename — keep filenames consistent
