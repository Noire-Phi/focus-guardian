# Saved data

Everything is saved in the browser's `localStorage`. `utils/storage.ts` is the only code
that reads or writes it. Tests: `utils/storage.test.ts`.

## What's saved

| Key                        | Contents                                                   |
| -------------------------- | ---------------------------------------------------------- |
| `focus-guardian:sessions`  | Every finished focus session (history, focus score inputs) |
| `focus-guardian:timer`     | The running timer and the session in progress              |
| `focus-guardian:settings`  | Focus/break lengths and sound                              |
| `focus-guardian:attention` | Study mode, screen/book calibration, good-posture baseline |
| `focus-guardian:backup:…`  | Copies of data that couldn't be read (see below)           |

Each session is added to the history as it finishes (completed, stopped or skipped), and
the history is saved straight away.

## The versioned format

Every value is saved wrapped like this:

```json
{ "version": 1, "data": [ … ] }
```

`version` says which format `data` is in. The current version is `STORAGE_VERSION`.

### Changing the format later

1. Bump `STORAGE_VERSION`.
2. Add a step to `MIGRATIONS` that turns data from the old version into the new one:
   `MIGRATIONS[1] = (data, key) => …` upgrades version 1 to version 2.
3. Add a test for it.

When the app loads data saved by an older version, `upgrade()` runs each step in turn
(1 → 2 → 3 …) up to the current version. Small additions that older data can simply lack
(like a session's optional `camera` stats) don't need a new version: the checks accept
the field being missing.

## Missing or corrupted data

Loading never throws, and the app always starts.

| Situation                                                 | What happens                                                |
| --------------------------------------------------------- | ----------------------------------------------------------- |
| Nothing saved yet                                         | Defaults (empty history, 25/5 minutes, …). No backup.       |
| Storage blocked (private mode, browser settings)          | Defaults; saving quietly does nothing. The app still works. |
| Not valid JSON (e.g. a half-written save)                 | **Backed up**, then defaults                                |
| Valid JSON but not `{ version, data }`                    | **Backed up**, then defaults                                |
| A version this app can't read (newer, or no upgrade step) | **Backed up**, then defaults                                |
| Some sessions fail the checks                             | The good ones load; the whole saved value is **backed up**  |
| Settings with some bad fields                             | Bad fields fall back to defaults, good ones are kept        |

Every value is checked field by field before it's used (types, ranges, required
fields), so broken data can't crash the app or show nonsense.

### Backups

The app saves its state as soon as it starts, which replaces unreadable data straight
away. So while loading, before that happens, the stored text is copied to
`focus-guardian:backup:<time>:<key>`, along with why it couldn't be read. Only the
**3 newest** backups are kept, so repeated problems can't fill up storage.

`listBackups()` returns them, newest first, ready for a future "recover data" screen. To
look at them now, open the browser's developer tools → Application → Local Storage.
