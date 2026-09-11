# Media File Delete (Move to Trash) — Permission Rules

Scope: **media files only**. Folders and projects are not covered by these rules.

Deleting a media file always means **moving it to Trash**. It never permanently deletes the file.

---

## Rule 1: Who decides

| Workspace | File | Permission comes from |
|---|---|---|
| Public | Public | User's role |
| Private | Public | User's access level on the workspace |
| Any | Private | User's access level on the file |

## Rule 2: Who has the "Trash & Restore" permission

| Type | Has it | Does not have it |
|---|---|---|
| Role | Editor, Admin, Super Admin | Collaborator, Viewer |
| Access level | Can Edit, Full Access | Can View |

## Rule 3: What happens after Delete

| Who clicked | Result |
|---|---|
| Editor / Can Edit / Full Access / Super Admin | File moves to Trash |
| Admin | File goes to "Pending Super Admin review" (not Trash) |
| Anyone else | Delete is greyed out, cannot click |

## Rule 4: UI behaviour

| Situation | Behaviour |
|---|---|
| User allowed | Delete option active |
| User not allowed | Delete option greyed out |
| Multi-select with any non-deletable file | Bulk Delete disabled |
| Someone else deletes your file | You receive a notification |
| File uploaded by the user | No special rights — same rule as everyone |
| Folders and projects | Out of scope — Admin / Super Admin only (unchanged) |

---

## Test Cases

| # | Role | Workspace | Workspace access level | File | File access level | Expected |
|---|---|---|---|---|---|---|
| 1 | Editor | Public | — | Public | — | Delete active → Trash |
| 2 | Editor | Private | Not a member | Public | — | Delete greyed out |
| 3 | Editor | Private | Can View | Public | — | Delete greyed out |
| 4 | Editor | Private | Can Edit | Public | — | Delete active → Trash |
| 5 | Editor | Private | Full Access | Public | — | Delete active → Trash |
| 6 | Editor | Any | — | Private | None (even if uploader) | Delete greyed out |
| 7 | Editor | Any | — | Private | Can View | Delete greyed out |
| 8 | Editor | Any | — | Private | Can Edit | Delete active → Trash |
| 9 | Editor | Any | — | Private | Full Access | Delete active → Trash |
| 10 | Viewer | Public | — | Public | — | Delete greyed out |
| 11 | Viewer | Private | Full Access | Public | — | Delete active → Trash |
| 12 | Viewer | Private | Can Edit | Public | — | Delete active → Trash |
| 13 | Collaborator | Public | — | Public | — | Delete greyed out |
| 14 | Collaborator | Any | — | Private | Can View | Delete greyed out |
| 15 | Collaborator | Any | — | Private | Can Edit | Delete active → Trash |
| 16 | Admin | Any (own org) | — | Any | — | Delete active → Pending Super Admin review |
| 17 | Super Admin | Any (own org) | — | Any | — | Delete active → Trash |
| 18 | Any | Any | — | Any | — | Multi-select with one non-deletable file → Bulk Delete disabled |
| 19 | Any | Other organization | — | Any | — | Delete greyed out |
| 20 | Any role with Delete active | Any | — | Any | — | Click Delete → file appears in Trash, uploader notified if different user |
