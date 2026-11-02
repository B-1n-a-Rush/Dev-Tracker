# SR2T React form components

The site editor and field-visit editor now use shared, typed React form components. React renders site details, dates, staff fields, visit observations and notes, photo caption/purpose rows, and improvement rows. Existing stop-search/review widgets, map previews, PDF selection widgets, save footers and service controllers remain separate adapters. This is an incremental migration of the editable controls, not a rewrite of the whole SR2T workspace.

The original site-save function and field-photo preparation function are byte-for-byte preserved. Existing publication checks, private file defaults, per-stop matching, optimistic versions, completed-upload reuse, conflict handling and session guards continue using the existing APIs. No database migration or public record changes were made.

`src/react/editors/Fields.tsx` provides reusable fields and repeated rows. Fields use React's supported uncontrolled-input pattern so the established native form-validation, capture and automatic stop-name fill contract remains intact. Stable object keys preserve the identities of photo and improvement rows when another row is removed. The legacy controller owns service state; React owns only explicitly mounted child containers. React roots are unmounted before a draft is discarded or authentication is lost. Inputs are never copied into a second competing state store.

`trackside-editor-react.js` loads the existing shared React bundle on demand and supplies the renderer adapter. The export window and editors share that same bundle. Both loader cache identifiers are updated by `scripts/react-postbuild.cjs`. The bundle is about 227 KB uncompressed / 71 KB gzip, versus 224 KB / 70 KB for the initial export-only build. No packages, authentication changes or paid services were added.

Use the existing paths: **Admin → SR2T sites → Manage SR2T sites → Edit site**, or select a site and use **Field visits → Record field visit**. Existing native stop matching, PDF and save controls remain available in the same places.

## Verification

- Strict TypeScript checking and Vite production build passed with the pinned dependencies.
- Browser tests used an isolated transport fixture with the actual React renderer. A site edit retained Fulton County, added a second stop, saved an improvement and a PDF, then reopened with the saved data. A failed site save retained the draft.
- A field visit saved its observation and prepared photo, reopened with its notes, retried a simulated failed save with exactly one photo upload, and cleared all mounted fields after session loss. No console errors remained after correcting an old focus reference.
- Both editors fit a 390-pixel phone frame without horizontal overflow. The actual content width was 375 pixels after the fixture scrollbar.
- Existing SR2T core, stop matching, uploads, field validation and export regression checks are run after local installation.

Testing used synthetic records and photos. No real site was edited or photo uploaded. The stop/PDF widgets and service controllers deliberately remain independent modules; later migration can replace those widgets without changing the form or database contract. This update is installed locally for review and does not publish to GitHub.
