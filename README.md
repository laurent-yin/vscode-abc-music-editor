# vscode-abc-music-editor
A VS Code extension to add support to ABC Music notation using abc2svg.

## Features

### 🎼 Instant ABC Music Notation Preview  
  Preview your ABC music files as beautiful sheet music directly in VS Code with a single click on the note icon.
  
![Preview](resources/readme/click_note.png)

### ⚡ Live Updates  
  The preview panel updates automatically when you make changes to your `.abc` file, so you can see changes in real time.

### 📝 Syntax Highlighting
  Enjoy clear, colorful syntax highlighting for ABC notation, making your `.abc` files easier to read and edit.
![Syntax Highlighting](resources/readme/syntax_highlight.png)

### ▶️ Play Your Tunes  
  Listen to your ABC music directly in VS Code with integrated playback—perfect for quickly checking your compositions.

### 🔍 Selection-Based Playback  
  Play only the selected portion of your ABC file. To select, click on a note and drag in direction to another note.

![Play selection](resources/readme/select_play.png)

### 🗂️ Store your frequently-used ABC directives in separate files
  Support through [abctools](https://github.com/laurent-yin/abctools) of .abcconfig files, to store your %%directives in a common place for each folder.
  
  See [choro-abc](https://github.com/laurent-yin/choro-abc) for a real-world example of a repository that uses abctools to manage and export ABC music notation files.

### 📦 Integrated with abc2svg
  Leverages the power of abc2svg library for accurate rendering and advanced ABC features.

## Personal preview preferences

Open the gear on the playback toolbar to change personal preferences. Its
scrollable panel overlays the score rather than taking up extra score height.
Click outside it or press Escape to close it. Preference errors reopen the panel.

The header shows compact **Display** and **Playback** summaries. Click either
to expand its voice checkboxes. Voice labels use declared names with IDs for
clarity. **Chords** is a checkbox in both menus: chord labels for Display,
generated accompaniment for Playback. Each change saves a file preference;
unchecking every voice really hides or mutes every voice.

In the gear panel, set **By default, hide voices matching** for Display and
**By default, mute voices matching** for Playback. Separate multiple patterns
with `;`, for example `*bass*; *counterpoint*`. A match against any pattern
excludes that voice. Wildcards match the entire voice ID or name ignoring
case: `*bass*` matches names containing "bass", and `?` matches one character.
Blank entries are ignored; a blank field displays/plays every voice.
Defaults have separate **Display chords** and **Play chords** checkboxes.
Saving defaults preserves existing file overrides and song transposition.

The header also contains the file's **Instrument** and **Transpose**
controls. Instrument key affects notation only, and inherits the single
**Default instrument key** in the gear menu. Its compact dropdown shows only
the instrument code (`C`, `Bb`, etc.), or `--` for source notation when no
default is set. The menu groups default and file-override choices separately;
the tooltip identifies which is active. Each voice in Display has its
own optional file-specific key override and written octave shift. A voice
without an override follows the file key, which in turn follows the default.
Transposition affects notation and sound, is always per file, and resets at 0;
there is no default song transposition. Its box shows the resulting initial
sounding key of the first tune, e.g. `-2 (Fm)` for a tune starting in G minor.
This key is independent of instrument notation and later `K:` changes;
major keys use their tonic name, minor keys use `m`, and other modes retain
their full names. **Show in Web Editor** is in the gear
menu rather than the header.

When a previewed file changes (or is reopened), saved voice lists are rebuilt
from its current inventory. Existing IDs keep their selections; removed IDs
and stale per-voice notation overrides are dropped; new IDs follow defaults.
Renaming a voice's label keeps its choice if its ID is unchanged. Changing an
ID treats it as a new voice. Refreshes never edit the ABC source.

Changing preferences stops playback. Press Play to restart. Selection playback
uses the complete audio model even when some voices are hidden. Multi-tune files
have a Play tune selector; saved voice filters and song shifts are file-wide.

Preferences are app-managed outside your music repository by default, separately
for each workspace library. Use these Command Palette commands:

- **ABC: Choose Personal Preferences Folder**: select a directory containing
  `preferences.json`, or an empty directory where it will be created on save.
  This can be an external folder or an optional `.abcpreferences` folder.
- **ABC: Use App-managed Personal Preferences**: switch back to app storage.
- **ABC: Reload Personal Preferences**: reload after external edits or conflicts.

Switching stores does not copy or merge them. The preview shows the selected
location and whether settings come from defaults or a file override. Writes
check revisions and use an exclusive lock plus atomic replacement. A stale
`.lock` file is an explicit error; remove it only after confirming no writer is
active. Invalid/read-only/conflicting writes remain visibly unsaved.

### JSON format

```json
{
  "version": 1,
  "defaults": {
    "display": {
      "hideVoicesMatching": "*counterpoint*; *bass*",
      "chords": true
    },
    "playback": {
      "hideVoicesMatching": "",
      "chords": true
    },
    "notation": {
      "instrumentKey": "Bb"
    }
  },
  "files": {
    "collection/tune.raw.abc": {
      "display": {
        "selectedVoiceIds": ["melody"],
        "knownVoiceIds": ["melody", "bass"],
        "chords": true
      },
      "transposition": { "semitones": 2 },
      "notation": {
        "voices": {
          "bass": { "instrumentKey": "C", "octaveShift": 0 }
        }
      }
    }
  }
}
```

- `hideVoicesMatching` is a wildcard exclusion, not regex. No matches excludes
  nothing; `*` excludes all voices. Semicolon-separated patterns combine with
  OR, and surrounding whitespace/empty entries are ignored.
- `selectedVoiceIds` is an explicit file selection, including an empty array.
  `knownVoiceIds` records the inventory used to distinguish new and removed IDs.
- Legacy `voiceIdFilter` / `voiceIdRegexFilter` files remain readable and are
  converted to explicit file selections when previewed. Legacy regex matching
  still runs in a terminable worker with a two-second budget.
  All selects every current voice; subsequently added voices follow defaults.
- Instrument key changes notation only. C/Bb/Eb are instrument keys, not song
  destination keys. Written octave shift is independent and never changes sound.
- Song transposition changes notation and sound by -24 to +24 semitones. The
  resulting sounding key is shown. It is saved per file, never as a default.
  Enharmonic spelling currently follows abc2svg; there is no destination-key
  spelling picker.
- Reset this file removes its overrides. Default controls save only the
  corresponding global settings, preserving all file overrides. New per-voice
  notation changes are file-only; saving defaults clears legacy voice-specific
  notation defaults (with a notice when those are present).

Relative paths use `/` and are relative to the workspace folder (or the document
directory outside a workspace). Moving a whole library and rebinding its store
keeps those keys; individual moves/renames may lose override associations.
Raw and generated paths are separate. There are no UUID insertions or source
rewrites. Ordinary exports and shared `.abcconfig` files are unaffected.

### Current renderer boundaries

Simple separate-voice staff layouts are supported, including existing plain
`%%score` selectors. Grouped/changing staff layouts and voice overlays are
rejected explicitly.
Conflicting simultaneous harmonies, or hidden chords with no available event
at the same time in the selected staff, also produce explicit errors rather
than silently dropping or changing harmony.
Personal transforms on sources already declaring pitch/register transforms
require a confirmed source pitch basis and are not automatically guessed.
The controls remain available to reset unsupported personal choices.

Source-position navigation and editor-position diagnostics are explicitly
disabled in this preview: configuration assembly, projections and fit2box do not
yet provide a composed source map. Errors are shown in the preview instead.

## Development and validation

The extension uses the published `abctools@0.2.0` npm package, including its
portable preferences and configuration APIs. No sibling checkout is required.

```sh
npm install
npm test
npm run test:host
```

The test suite covers the portable store and bundled renderer. `test:host`
requires the installed `code` executable and a display; it uses an isolated
profile for activation/preview/bridge smoke tests. For a local
browser harness running the actual webview scripts with an invented tune:

```sh
node test/preview-server.mjs
```

Open the printed loopback URL. The harness uses temporary personal storage and
does not load library material. It is not an extension-host integration test.