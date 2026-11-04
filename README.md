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
When Display Chords is enabled, chord labels prefer a selected staff whose
authored chord position is visible, preserving above/below placement. If only
chord-hidden staves are selected, the preview shows the chords above a selected
staff instead. Labels are deduplicated per notation transposition, not assigned
to a hidden chord position. Source chord visibility and playback are unchanged.

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

The header's **Tempo** number picker accepts any whole-number BPM from 1, with
no configured upper limit. It changes playback speed without stopping the tune
or changing pitch. Click the field for a scrollable list centered on the current
tempo, then click a BPM to select it. Scrolling reveals further values in either
direction; **Original** clears the override. Typing and the small `+`/`-` buttons
remain available. From a blank field, `+` starts at the original tempo plus 1
(and `-` at the original minus 1, with a minimum of 1). Arrow Up/Down also step
from the original tempo; Alt+Down opens the list and Escape closes it.
A blank field (`--`) uses the original tempo, labelled beside
the picker. The BPM uses the initial `Q:` beat unit (a quarter note at 120 BPM
when no tempo is specified). Each tune in a tunebook shows its own original
tempo. Later authored tempo changes scale proportionally: overriding an initial
120 BPM with 60 BPM also makes a later 90 BPM section play at 45 BPM.
Changes apply live as the player's already-scheduled notes finish.
The override is saved per file with personal preferences; clearing the picker
removes it. Tempo has no global default and never edits the ABC source.

When a previewed file changes (or is reopened), saved voice lists are rebuilt
from its current inventory. Existing IDs keep their selections; removed IDs
and stale per-voice notation overrides are dropped; new IDs follow defaults.
Renaming a voice's label keeps its choice if its ID is unchanged. Changing an
ID treats it as a new voice. Refreshes never edit the ABC source.

Display and playback voice/chord changes apply without interrupting playback.
Muted voices rejoin at the current position when enabled again, including notes
already sustaining. Instrument notation changes also keep playback running.
Source edits, song transposition and changing the Play tune selection still stop
playback; press Play to restart. Selection playback uses the complete audio model
even when some voices are hidden, and its range survives display changes.
Multi-tune files have a Play tune selector; saved voice filters and song shifts
are file-wide. Live mixing is implemented by the extension; bundled abc2svg
files are unchanged.

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
      "tempo": 90,
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
- `tempo` is a file-only BPM override in the shared abctools preferences schema.
  Omit it for original tempo. abctools validates, resolves and serializes it;
  the extension supplies the playback UI and persists preferences to disk.
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

Separate-voice staff layouts support plain selectors and static, non-nested
brace/bracket groups such as `%%score { melody bass }`. Voice selections retain
the authored staff order and groups; a group collapses when only one staff
remains. Selected voices omitted by an authored selector are appended.
Shared-staff/floating/barline operators, nested or changing layouts, layout
directives after the initial `K:`, legacy braced `%%staves` groups of more than
two voices are rejected explicitly. Voice overlays (`&` simultaneous branches)
remain part of their authored parent voice: they share its display/playback
selection and instrument notation, without separate checkboxes.
The bundled abc2svg parser includes a local correction for first-measure
overlay timing in hidden voices, preventing spurious duration errors and
extra trailing rests when a multi-branch overlay's parent is deselected.
Conflicting simultaneous harmonies, or hidden chords with no available event
at the same time in the selected staff, also produce explicit errors rather
than silently dropping or changing harmony.
Personal transforms on sources already declaring pitch/register transforms
require a confirmed source pitch basis and are not automatically guessed.
When discovery, filtering, personal transforms or projected engraving fail, the
preview retries the original content with its authored layout. A warning above
the sheet explains the failure and suggests resetting preferences, adjusting
the source when appropriate, or reporting the error. Recovery applies no
personal display/playback/chord choices, instrument overrides or transposition;
playback uses the original unfiltered music. The header identifies Original
display/playback mode. Saved preferences are not replaced by recovery settings,
and controls remain available to retry or reset unsupported personal choices.
Original-renderer diagnostics are shown alongside any recoverable sheet output.
If even the original sheet cannot render, both failure reasons are displayed.
Temporary editing errors do not disable `fit2box`: after the source becomes
valid again, the saved voice selection and fitted engraving are restored
without reloading the preview.

Source-position navigation and editor-position diagnostics are explicitly
disabled in this preview: configuration assembly, projections and fit2box do not
yet provide a composed source map. Errors are shown in the preview instead.

## Development and validation

The extension uses the published `abctools@0.2.1` npm package, including its
portable preferences and configuration APIs. No sibling checkout is required.

Development tooling requires Node.js 20.19+, 22.13+, or 24+. This does not
change the extension's VS Code runtime requirement. ESLint and TypeScript-ESLint
use a patched minimatch 11 override because their declared minimatch 10
dependencies are covered by GHSA-g3hv-75wg-m249. Revisit the override when
upstream dependencies adopt the fix. Asset copying uses Node's filesystem APIs
rather than the legacy copyfiles/glob dependency chain.

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