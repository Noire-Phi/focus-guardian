# Changelog

Notable changes to Focus Guardian. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- MIT license.
- An app icon (browser tab and home screen) and a preview image, with description and
  Open Graph tags so links to the site show a title, summary and picture.

## [1.0.0] - 2026-10-30

The first public release, live at https://noire-phi.github.io/focus-guardian/.

### Timer and sessions

- A Pomodoro timer with focus and break phases, plus pause, reset and skip.
- An intention for each session, and a history of past sessions.
- Leaving the tab during focus time is logged as a distraction; distractions can also be
  logged by hand, with a keyboard shortcut.
- Today's summary and an optional chime when a phase ends.

### Camera focus check

- Looking-away detection with MediaPipe Face Landmarker.
- Study modes (screen, book, mixed) with calibration for where you normally look.
- Phone detection, confirmed over several checks and alerted straight away in every mode.
- Posture detection with MediaPipe Pose, measured against a good-posture calibration.
- A focus score for each session from screen attention, phone use and posture.
- A privacy note in the camera card: all processing happens on the device, and no video is
  recorded or uploaded.

### Dashboard and settings

- A dashboard with the daily score, weekly trend, study time and distractions (Chart.js).
- Settings for timer lengths, detection switches, sensitivity, alert sound, theme, a
  screen-flash alert and the keyboard shortcut, plus a reset.
- Saved data is versioned and upgraded in place; data that can't be read is backed up
  instead of being lost.

### Design and accessibility

- A design system with color, spacing and type tokens, a two-column layout, and light, dark
  and system themes.
- Full keyboard use with visible focus, focus returned after dialogs, screen-reader labels and
  announcements, contrast fixes, and a screen flash as an alternative to sound.

### Performance

- Detection pauses while the tab is hidden, the models load only when the camera is first
  turned on, and the slower checks take turns so detection stays under about a quarter of
  one CPU core, even on slow computers.

### Fixed

- Camera time was mostly lost from the focus score when checks ran slowly.
- Refreshing the page during a session counted as leaving the tab, and turned the camera off.
- Calibration kept going when the camera was unplugged or the tab was hidden.
- Layout overflow and hidden alerts at phone width and on short landscape screens.

### Project

- Unit and component tests with Vitest and Testing Library (about 97% of statements).
- GitHub Actions checks formatting, lint, types and tests on every push and pull request,
  and deploys `main` to GitHub Pages after the checks pass.
- A README and design notes in `docs/`.

[Unreleased]: https://github.com/Noire-Phi/focus-guardian/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Noire-Phi/focus-guardian/releases/tag/v1.0.0
