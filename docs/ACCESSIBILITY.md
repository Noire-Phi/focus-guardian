# Accessibility

Focus Guardian aims at WCAG 2.2 level AA. This file records what was reviewed, what was
fixed, and how to keep it that way.

## Review summary

| Area                | Before                                                                                            | Now                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Text contrast       | Every text colour already 4.5:1 or more in both themes                                            | Unchanged (checked again, see below)                                                                |
| Control edges       | Input borders and the selected segment were 1.2–1.9:1, under the 3:1 needed to find the control   | New `--color-border-control` token, 3.1:1 or more on every surface                                  |
| Keyboard focus      | Pressing Enter to start, Stop, Calibrate, OK and Reset removed the focused button: focus was lost | Focus moves to the next sensible control (`useRestoreFocus`)                                        |
| Focus ring          | Drawn as a box-shadow only, which Windows high contrast mode removes                              | A transparent outline as well, which high contrast mode draws                                       |
| Sound-only alerts   | The end of a phase was only a chime                                                               | A message at the bottom of the window, the time left in the tab title, and an optional screen flash |
| Screen readers      | Phase ends and logged distractions weren't announced; the distraction alert re-read every second  | Announced once each through live regions                                                            |
| Labels              | Switch names ran label and hint together; ✓ and — read as symbols; progress bars hidden           | Label as the name, hint as the description; "done" / "not yet"; real progress bars                  |
| Single-key shortcut | D could not be turned off (a problem for speech input)                                            | Settings → Keyboard, and exposed with `aria-keyshortcuts`                                           |
| Form errors         | An out-of-range timer length only turned the border red                                           | A message says the allowed range, linked to the box with `aria-describedby`                         |

## Keyboard

Everything works with Tab, Shift+Tab, Enter and Space; radio groups (study mode, theme,
sensitivity) use the arrow keys. There are no keyboard traps.

When the control you're on disappears, focus is put back nearby instead of dropping to the
top of the page:

| You press                           | Focus goes to                                       |
| ----------------------------------- | --------------------------------------------------- |
| Enter in "What are you working on?" | Pause                                               |
| Stop                                | Start focus (or the intention box if it's empty)    |
| Dismiss on a phase message          | The timer's main button                             |
| Calibrate / Calibrate posture       | The calibration panel, so its instructions are read |
| OK after calibrating                | Recalibrate                                         |
| Reset to defaults                   | The (rebuilt) Reset button                          |
| Start a focus session (dashboard)   | The intention box                                   |

Enter in the intention box is consumed after starting, so it can't also press the Pause
button that focus moves to.

**D** jumps to the distraction note box during a focus session. It's ignored while typing,
and can be turned off in Settings → Keyboard.

## Screen readers

- Landmarks: header, `main`, a labelled "Focus session" region, and labelled cards.
- The clock is `role="timer"`, which isn't read out on every tick; the tab title shows it too.
- Polite announcements (`role="status"`): a phase ending ("Focus session done. Time for a
  5-minute break."), each distraction logged, calibration steps.
- Assertive (`role="alert"`): looking away, phone detected, posture, camera errors. The
  looking-away alert has a fixed sentence for screen readers; the ticking counter is hidden
  from them so it isn't re-read every second.
- Charts are canvases with `role="img"` and a text summary of every value.

## Colour contrast

Checked with the WCAG formula for both themes (light / dark):

| Pair                                   | Light | Dark | Needs |
| -------------------------------------- | ----- | ---- | ----- |
| Body text on page                      | 10.4  | 12.3 | 4.5   |
| Muted text on sunken tile (worst case) | 4.51  | 6.16 | 4.5   |
| Accent text on surface                 | 6.7   | 6.8  | 4.5   |
| Text on accent button                  | 6.7   | 7.2  | 4.5   |
| Success / danger / warning text        | 4.6+  | 6.2+ | 4.5   |
| Control border on any surface          | 3.1+  | 3.2+ | 3     |

Card borders are decorative (each card's content is labelled), so they stay subtle.
Disabled buttons are exempt. Meaning is never colour alone: alerts have a title, status
lines say what they mean in words.

## Alerts you don't have to hear

Every alert has a visual form:

- **Phase ends**: a message at the bottom of the window that stays until you dismiss it or use
  the timer, and the tab title changes ("4:59 Break", "Break’s over").
- **Looking away, phone, posture**: a message at the bottom of the window while it lasts.
- **Flash the screen** (Settings → Alerts, off by default): the window's edges light up once
  with each alert, so you notice it even when looking away. It's a single slow pulse, far
  from the three-flashes-a-second limit. With reduced motion on, the edges light up without
  animating.

## Also covered

- `lang="en"`, a page title, zoom and text resizing (rem units, no fixed heights on text).
- Reduced motion turns off transitions and the flash animation.
- High contrast mode: focus rings, the selected segment and the flash all still show.

## Not covered yet

- Not tested with a real screen reader (NVDA, VoiceOver); the semantics were checked in code
  and the browser.
- Chart legends can be clicked to hide a line but not used from the keyboard; the same data
  is in each chart's text summary.
