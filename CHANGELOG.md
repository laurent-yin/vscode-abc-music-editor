# Change Log

All notable changes to the "vscode-abc-music-editor" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.4.12] - 2026-11-14

### Added

- Display and Playback label a tune's only unnamed voice "Main voice" instead
  of showing just its numeric or internal ID.
- Score chords use the chord grids' bundled FreeSerif Bold and compact raised
  extensions/lowered slash basses by default. Explicit `%%gchordfont` settings
  retain their authored font and styling.

### Changed

- Shorter Marketplace description and README with refreshed preview, playback
  and chord grid screenshots; detailed guides are now under `docs/`.
- Score and grid chords use upright FreeSerif Bold for readability at small
  sizes. Regular FreeSerif and both FreeSans Bold variants remain bundled for
  future font choices.
- Root and slash-bass accidentals are smaller and closer to their note letters
  on scores and grids, without shrinking alterations in raised extensions.
- Tighten spacing after flats, including before diminished symbols and extension
  numbers, on scores and grids.

### Fixed

- Cross-row chord grid selections follow measure order even when voices are
  interleaved in the ABC source, without highlighting earlier unselected measures.
- Preserve custom chord fonts in personal score previews, including fitted
  layouts and chords projected from hidden voices, avoiding oversized or clipped labels.

## [0.4.11] - 2026-11-14

### Added

- Playback follows the complete current measure with a subtle grey background
  on scores and chord grids, without recoloring notes or chords. The general
  preferences can disable it; pause, stop and completion clear the highlight.
- Chord-only Display now shows a compact chord grid with a saved source-voice
  picker, inherited instrument notation and song transposition.
- General preferences offer source-line/automatic-wrap layouts and optional
  whole-measure `%` repetition, enabled by default. Grids preserve structural
  marks, selection playback and live playback during display changes.
- Chord source is confined to the Display menu when only Chords is selected.
  Chord-only grids fit the available width and height without scrollbars.
- Grid chords use a uniform font/size and shared page scaling. Internal ornament
  names such as `[uppermordent]` are no longer shown; authored tempo text remains.
- Chord grids use bundled FreeSerif, with compact raised extensions, musical
  accidentals and lowered slash basses. Roots keep a consistent size, and layout
  measures the complete composed labels before wrapping. Normal scores and audio
  are unchanged.
- General grid preferences can show authored text instructions (hidden by default).
  Fermatas and each part's incomplete pickup are omitted. Part labels and repeat
  starts are retained on the following measure, without changing audio playback.

## [0.4.10] - 2026-10-18

### Fixed

- Updated bundled abc2svg JavaScript to upstream trunk revision
  `429f935b53769471ea49f00804e50b0fcff1b606` (2026-10-17, based on
  `v1.23.6`). This fixes premature termination of header-directed part playback
  at the final section in the verified two-staff `AABBACCA` case.

## [0.4.9] - 2026-02-05

### Added

- Support for loading external soundfonts as .js files from any URL

- Initial release