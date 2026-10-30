# Simplified SR2T editor

Implemented October 29, 2026.

Choose current stops, edit site details, attach PDFs, and Save. A new site reference and default name/location are supplied automatically; the name remains editable. Dates, source citations, imported-number resolution and staff notes are optional expandable sections. Existing site references and all existing values are preserved. New sites remain staff drafts until Show this site on the public SR2T map is checked. Plan file visibility remains separately controlled.

Selecting an actual current inventory stop links its ID and authoritative mapped location. On explicit Save, an existing exact current stop candidate shown in the selected-stop list can also become a mapped link. The reference records the inventory selection and retains the user's note; it does not invent plan/field verification. Ambiguous imports, nonexistent IDs, and old/missing network fingerprints still need a new explicit selection. Server-side active-network and authoritative geometry validation are unchanged.

Save reports field errors and upload/database/session errors beside the button. Duplicate submissions are blocked; controls recover after failure. Successful uploads are reused on retry. Success scrolls into view, and the overview shows the resulting stop locations. Draft visibility remains explicit; Save never silently publishes a draft.

Verification: 22 Node checks (8 original core, 9 uploads/picker, 5 simplified selection cases); actual client-normalized payload accepted by the live database in a rolled-back transaction with synthetic admin/session/site; original TEST row left unchanged. Browser fixture verified the reported short-note/publish case, one-step creation with two stops and generated reference/name, local required-field errors, upload failure/retry without duplication, and mobile saving at a 390-pixel iframe width. Auth, file access policies and database functions were not changed.

Installed locally; frontend GitHub publication is separate.
