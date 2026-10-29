# Design system

The look is meant to be calm and quiet: a study tool shouldn't compete for attention.
Flat surfaces, warm paper-like neutrals, one accent colour, thin borders, no gradients,
and shadows only on things that float (alerts).

All tokens live in `src/index.css`; `src/App.css` uses only those. To change the look,
change a token, not individual rules.

## Colour

Each colour is one token with a light and a dark value, written with CSS `light-dark()`.

| Token                                  | Light                 | Dark                  | Used for                                        |
| -------------------------------------- | --------------------- | --------------------- | ----------------------------------------------- |
| `--color-bg`                           | `#f6f5f1`             | `#121311`             | Page background                                 |
| `--color-surface`                      | `#ffffff`             | `#1b1c1a`             | Cards, inputs, buttons                          |
| `--color-surface-sunken`               | `#efeee9`             | `#161715`             | Stat tiles, camera frame, idle timer            |
| `--color-border` / `-strong`           | `#e3e1da` / `#cfccc3` | `#2c2d2a` / `#43443f` | Card edges / input and button edges             |
| `--color-text`                         | `#3b3a36`             | `#d4d2cb`             | Body text                                       |
| `--color-text-strong`                  | `#171715`             | `#f4f3ef`             | Headings, values, button text                   |
| `--color-text-muted`                   | `#6f6c64`             | `#9a978f`             | Hints, labels, secondary text                   |
| `--color-accent` (+ `-hover`, `-soft`) | `#2f4fd0`             | `#8b9ef5`             | Focus phase, primary buttons, links, focus ring |
| `--color-on-accent`                    | `#ffffff`             | `#0f1330`             | Text on the accent                              |
| `--color-success` (+ `-soft`)          | `#2b7a4b`             | `#6cc792`             | Break phase, "good" states                      |
| `--color-warning` (+ `-soft`)          | `#9a5b07`             | `#e3a955`             | Posture alerts                                  |
| `--color-danger` (+ `-soft`)           | `#bf342d`             | `#f0857d`             | Distraction alerts, errors                      |

Rules:

- **One accent.** Blue means "focus" and "you can act on this". Green, amber and red only
  carry meaning (break/good, nudge, distraction/error); they're never decoration.
- **One primary button per area** (e.g. Start focus, Pause, Turn on camera). Everything
  else is a quiet button.
- In dark mode the accent gets lighter and the text on it gets dark, so contrast holds.

## Theme

Settings → Appearance: **System** (default), **Light** or **Dark**. System follows the
operating system; Light and Dark set `data-theme` on `<html>`, which sets `color-scheme`
and so which half of every `light-dark()` is used. The theme is applied before the first
render, so a forced theme doesn't flash. Charts re-read the colours when the theme changes.

## Spacing

A 4 px scale. Use the tokens, never raw pixel values for spacing.

| Token       | px  | Typical use                                 |
| ----------- | --- | ------------------------------------------- |
| `--space-1` | 4   | Tight gaps (label to value, segmented pads) |
| `--space-2` | 8   | Between related controls                    |
| `--space-3` | 12  | Inside small tiles, list gaps               |
| `--space-4` | 16  | Page gutter on phones, gaps between cards   |
| `--space-5` | 24  | Card padding, between sections in a card    |
| `--space-6` | 32  | Session card padding on wide screens        |
| `--space-7` | 48  | Large empty states, bottom of the page      |
| `--space-8` | 64  | Reserved                                    |

## Type

System fonts (no web font to download). Sizes: `--text-xs` 12, `--text-sm` 14,
`--text-md` 16, `--text-lg` 18, `--text-xl` 22, `--text-2xl` 28 px. Weights: 500
(medium) and 600 (semibold). The timer uses tabular numbers so digits don't jump.

Two heading levels, never confused:

- **Card titles**: small, uppercase, muted (`.section-title`): TODAY, CAMERA, SETTINGS.
- **Group labels inside a card**: normal case, semibold, strong: "Study mode", "Posture",
  "Detections".

## Shape

Radius `--radius-sm` 6 (segments), `--radius-md` 10 (buttons, inputs, tiles),
`--radius-lg` 14 (cards), `--radius-pill` (progress bars). Borders are 1 px. The only
shadow is `--shadow-float`, on alerts.

## Shared patterns

- `.card`: surface, border, large radius, `--space-5` padding.
- `.button`, `.button--primary`, `.link-button`.
- Text inputs share one style (40 px tall, strong border, accent border on focus).
- Segmented controls (view switch, study mode, sensitivity, theme) share one style: a
  sunken track with the selected option raised to the surface.
- Focus is always visible: a 2 px accent ring with a gap (`--focus-ring`).

## Layout and breakpoints

| Width        | Layout                                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| under 480 px | One column, 16 px gutters, smaller card padding, session buttons in a 2×2 grid                                                                                                             |
| 480–899 px   | One column; camera preview capped at 480 px wide                                                                                                                                           |
| 900 px +     | Two columns: the session card (sticky) on the left, Today / Camera / Settings on the right. Dashboard: totals in a row of four, weekly trend full width, the other two charts side by side |

Content is capped at 1080 px wide. Motion is short (120–200 ms) and turned off when the
system asks for reduced motion.
