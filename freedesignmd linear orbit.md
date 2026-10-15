---
name: "Linear Orbit"
description: "Hairline-thin product workspace. Cool off-white surfaces, Inter Display with tight tracking, a single indigo accent, every divider 1px at 6% ink. Engineered calm."
tags: [developer, minimal, premium, saas, modern]
colors:
  primary:   "#0e1116"
  secondary: "#5a6273"
  tertiary:  "#0e1116"
  neutral:   "#f5f6f8"
  surface:   "#ffffff"
typography:
  display: "Inter Display"
  body:    Inter
  mono:    "JetBrains Mono"
  scale:
    hero: "3.25rem / 1.04 / 600 / -0.045em"
    h1:   "2.25rem / 1.12 / 600 / -0.035em"
    h2:   "1.5rem / 1.25 / 600 / -0.025em"
    body: "0.9375rem / 1.55 / 400 / -0.005em"
radius:
  sm: 5px
  md: 8px
  lg: 10px
  pill: 9999px
shadows:
  card:   "rgba(14,17,22,0.06) 0 0 0 1px, rgba(14,17,22,0.03) 0 1px 2px"
  button: "rgba(94,106,210,0.18) 0 1px 0 inset"
borders:
  card:    "1px solid rgba(14,17,22,0.06)"
  divider: rgba(14,17,22,0.06)
buttons:
  primary:
    background: #5e6ad2
    color: #ffffff
    border: none
    shape: rounded
    padding: 7px 14px
    font: 500 / 0.8125rem
    shadow: rgba(94,106,210,0.18) 0 1px 0 inset, rgba(0,0,0,0.04) 0 1px 1px
  secondary:
    background: #ffffff
    color: #0e1116
    border: 1px solid rgba(14,17,22,0.08)
    shape: rounded
    padding: 7px 14px
    font: 500 / 0.8125rem
  outline:
    background: transparent
    color: #0e1116
    border: 1px solid rgba(14,17,22,0.10)
    shape: rounded
    padding: 7px 14px
    font: 500 / 0.8125rem
  ghost:
    background: transparent
    color: #5a6273
    border: none
    shape: rounded
    padding: 7px 12px
    font: 500 / 0.8125rem
charts:
  variant: "thin-bars"
  stroke_width: 1.25
  fill_opacity: 0.05
  gridlines: true
  bar_gap: 10px
  highlight: single
  dot_marker: true
fonts_url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
dependencies: ["lucide-react"]
---

# Linear Orbit

## AI Build Instructions

> **Read this section before writing any code.** The rules below
> are non-negotiable. Every value used in the UI must come from this
> file's frontmatter — never substitute, approximate, or invent new
> colors, fonts, radii, or shadows. If a value is missing, ask the
> user before adding one.

### 1 · Your role

You are building UI for a project that has adopted **Linear Orbit** as its
design system. Treat `DESIGN.md` as the single source of truth.
Your job is to translate the user's product requirements into
components and pages that look like they were designed by the same
person who authored this file.

### 2 · Token compliance

- Pull every color, font family, radius, shadow, and spacing value
  from the frontmatter at the top of this file.
- Use semantic roles (e.g. `primary`, `accent`, `muted`) — never
  hard-code hex values that bypass the system.
- When a token can be expressed as a CSS variable, declare it once
  in your global stylesheet and reference it everywhere downstream.
- The Google Fonts `<link>` is provided in the Typography section.
  Add it to `<head>` before any component renders.

### 3 · Component recipes

Use these recipes verbatim when building the corresponding component.

#### Buttons

Four variants are defined. Pick one — never blend variants or invent a fifth.

- **Primary** — rounded shape, bg `#5e6ad2`, text `#ffffff`, padding `7px 14px`, weight `500`, shadow `rgba(94,106,210,0.18) 0 1px 0 inset, rgba(0,0,0,0.04) 0 1px 1px`.
- **Secondary** — rounded shape, bg `#ffffff`, text `#0e1116`, border `1px solid rgba(14,17,22,0.08)`, padding `7px 14px`, weight `500`.
- **Outline** — rounded shape, text `#0e1116`, border `1px solid rgba(14,17,22,0.10)`, padding `7px 14px`, weight `500`.
- **Ghost** — rounded shape, text `#5a6273`, padding `7px 12px`, weight `500`.

Reach for **primary** as the single dominant CTA per screen.
**Secondary** for the supporting action. **Outline** for tertiary
actions in toolbars. **Ghost** for inline links and table actions.

#### Cards

- Background: `#ffffff`
- Border: `1px solid rgba(14,17,22,0.06)`
- Shadow: `rgba(14,17,22,0.06) 0 0 0 1px, rgba(14,17,22,0.03) 0 1px 2px`
- Radius: `radius.lg` (`10px`)
- Internal padding: `20px` for compact cards, `24–28px` for content cards.

#### Tabs

Variant: `underline`. Flat row of labels. Active tab gets a 2px underline in the accent color — no fill.

#### Charts

- Bar/line variant: `thin-bars`
- Highlight strategy: `single` — emphasize a single bar/point per chart.

#### Typography pairings

- **Display (`Inter Display`)** — h1, h2, hero headlines, brand wordmarks.
- **Body (`Inter`)** — paragraphs, labels, button text, form inputs.
- **Mono (`JetBrains Mono`)** — code, eyebrows, metadata, numerals in tables.

### 4 · Hard constraints

Never do any of the following without explicit instruction from the user:

- Introduce a new color, font, radius, or shadow that isn't declared above.
- Mix this system with another (e.g. don't paste in Material or Bootstrap defaults).
- Use generic gradient defaults (purple→blue, peach→pink) — they break the system's voice.
- Reach for emoji icons. Use a consistent icon library and size icons in line with body type.
- Add motion that exceeds the system's restraint — keep transitions short (≤200ms) and subtle.

### 5 · Before you finish — verify

Run through this checklist for every screen you produce:

- [ ] Every color used appears in the Colors table above.
- [ ] Headlines use the display font; body copy uses the body font.
- [ ] Buttons match one of the declared variants exactly (shape, padding, weight).
- [ ] Border-radius values come from `radius.sm` / `radius.md` / `radius.lg` / `radius.pill`.
- [ ] Cards and dividers use the declared border + shadow tokens.
- [ ] No values were invented; if you needed something missing, you stopped and asked.

---

## 1. Atmosphere

Linear Orbit is the workspace UI distilled. The page is a cool off-white that reads as paper under daylight, never warm, never blue-tinted. Type runs at Inter with -0.045em tracking at hero scale — compressed, engineered, technical without being cold. The single accent is an indigo `#5e6ad2` reserved for the primary CTA, the active tab underline, and the focused chart series. Every other interactive surface lives in pure greyscale.

The signature move is restraint at the divider level: 1px hairlines at `rgba(14,17,22,0.06)` carry the entire structure. No card shadows, no fills, no chrome — the grid is the chrome.

**Signature moves**
- Inter Display at hero with -0.045em tracking — text feels engineered, not decorative
- 6% ink hairlines as the only divider — never a solid grey, never a fill
- Indigo `#5e6ad2` as the *only* color in the entire system
- Buttons sit on a 1px inset highlight, never a drop shadow
- Underline tabs with the indigo accent, never pills, never boxed
- Mono used exclusively for status labels and inline metrics

## 2. Palette

### Core
- **Ink** `#0e1116` — text, headings, dark surface
- **Surface** `#ffffff` — cards, modals
- **Page** `#f5f6f8` — cool off-white background
- **Hairline** `rgba(14,17,22,0.06)` — every divider, every card edge

### Accent
- **Indigo** `#5e6ad2` — primary CTA, active tab, highlighted chart
- **Indigo Soft** `rgba(94,106,210,0.10)` — focus ring, hovered tab background

### Neutrals
- 700 `#3a4150` · 500 `#5a6273` · 400 `#7a818f` · 200 `#e6e8ec`

## 3. Typography

| Role | Font | Size | Weight | Leading | Tracking |
|------|------|------|--------|---------|----------|
| Hero | Inter Display | 52px | 600 | 1.04 | -0.045em |
| H1 | Inter Display | 36px | 600 | 1.12 | -0.035em |
| H2 | Inter | 24px | 600 | 1.25 | -0.025em |
| Body | Inter | 15px | 400 | 1.55 | -0.005em |
| UI | Inter | 13px | 500 | 1.4 | 0 |
| Mono / Status | JetBrains Mono | 12px | 500 | 1.0 | 0.04em uppercase |

Three weights only: 400 / 500 / 600. Negative tracking is mandatory above 20px.

## 4. Buttons

### Primary (Indigo)
```css
background: #5e6ad2;
color: #ffffff;
padding: 7px 14px;
border-radius: 6px;
box-shadow: rgba(94,106,210,0.18) 0 1px 0 inset, rgba(0,0,0,0.04) 0 1px 1px;
```

### Secondary (Hairline)
- White surface, 1px hairline at 8% ink, ink-700 text
- Same padding as primary — the bar height never breaks

### Ghost
- Transparent, 500-weight, no border. Hover: 4% ink wash.

## 5. Cards

- Background `#ffffff`
- 1px hairline at 6% ink, NO drop shadow
- Radius 8px (10px for featured)
- Internal padding 20px / 28px
- Hover: hairline darkens to 10% ink — that is the only state change

## 6. Charts

Thin precise bars at 6px width with 10px gap. Single bar highlighted in indigo, others in 8% ink. Line charts at 1.25px stroke, 5% fill, dot marker at the live value. Dashed gridlines at 4% ink. Reads like an engineering dashboard, not marketing.

## 7. Tabs

Underline only. Active tab carries a 1.5px indigo bar at the bottom edge; inactive tabs are 500-weight ink-500. No pill tabs, no boxed tabs, ever.

## 8. Spacing

- Base 4px
- Scale: `4, 8, 12, 16, 20, 24, 32, 48, 64`
- Section padding: 64px desktop, 32px mobile

## 9. Do's & don'ts

✅ **Do**
- Use the indigo accent exactly once per screen — primary CTA OR active tab, not both
- Hold every divider to 6% ink — the discipline IS the design
- Use JetBrains Mono only for metrics, status, and inline code
- Keep type tracking negative at every size above 20px

❌ **Don't**
- Add a second accent color — indigo is alone, by design
- Use drop shadows on cards — hairlines only
- Use pill buttons — every button is 6px radius
- Mix Inter weights beyond 400/500/600

---

## Tokens

> Generated from the same source the live preview renders from.
> Treat the values below as the contract — never substitute approximations.

### Colors

| Role      | Value |
|-----------|-------|
| primary   | `#0e1116` |
| secondary | `#5a6273` |
| tertiary  | `#0e1116` |
| neutral   | `#f5f6f8` |
| surface   | `#ffffff` |

### Typography

- **Display:** Inter Display
- **Body:** Inter
- **Mono:** JetBrains Mono

| Role | size / leading / weight / tracking |
|------|------------------------------------|
| Hero | 3.25rem / 1.04 / 600 / -0.045em |
| H1   | 2.25rem / 1.12 / 600 / -0.035em |
| H2   | 1.5rem / 1.25 / 600 / -0.025em |
| Body | 0.9375rem / 1.55 / 400 / -0.005em |

### Radius

- sm: `5px`
- md: `8px`
- lg: `10px`
- pill: `9999px`

### Shadows

- **card:** `rgba(14,17,22,0.06) 0 0 0 1px, rgba(14,17,22,0.03) 0 1px 2px`
- **button:** `rgba(94,106,210,0.18) 0 1px 0 inset`

### Borders

- **card:** `1px solid rgba(14,17,22,0.06)`
- **divider:** `rgba(14,17,22,0.06)`

### Buttons

Four variants, each fully tokenized. The preview renders from these exact values.

#### Primary

| Property | Value |
|----------|-------|
| shape | `rounded` |
| background | `#5e6ad2` |
| color | `#ffffff` |
| border | `none` |
| padding | `7px 14px` |
| fontWeight | `500` |
| fontSize | `0.8125rem` |
| shadow | `rgba(94,106,210,0.18) 0 1px 0 inset, rgba(0,0,0,0.04) 0 1px 1px` |

#### Secondary

| Property | Value |
|----------|-------|
| shape | `rounded` |
| background | `#ffffff` |
| color | `#0e1116` |
| border | `1px solid rgba(14,17,22,0.08)` |
| padding | `7px 14px` |
| fontWeight | `500` |
| fontSize | `0.8125rem` |

#### Outline

| Property | Value |
|----------|-------|
| shape | `rounded` |
| background | `transparent` |
| color | `#0e1116` |
| border | `1px solid rgba(14,17,22,0.10)` |
| padding | `7px 14px` |
| fontWeight | `500` |
| fontSize | `0.8125rem` |

#### Ghost

| Property | Value |
|----------|-------|
| shape | `rounded` |
| background | `transparent` |
| color | `#5a6273` |
| border | `none` |
| padding | `7px 12px` |
| fontWeight | `500` |
| fontSize | `0.8125rem` |

### Charts

| Property | Value |
|----------|-------|
| variant | `thin-bars` |
| strokeWidth | `1.25` |
| fillOpacity | `0.05` |
| gridlines | `true` |
| barGap | `10px` |
| highlight | `single` |
| dotMarker | `true` |

---

## Pro tokens

> Production-fidelity tokens. States, density, motion, elevation,
> content rules and a measured WCAG contract — derived from the
> resting tokens unless explicitly authored.

### States

#### Button

- **hover** — shadow: `0 4px 12px -2px rgba(15,23,42,0.18)`, filter: `brightness(0.97)`
- **focus** — outline: `2px solid rgba(14, 17, 22, 0.5)`, outline-offset: `2px`
- **active** — shadow: `0 1px 2px rgba(15,23,42,0.1)`, transform: `scale(0.98)`
- **disabled** — opacity: `0.4`, filter: `saturate(0.5)`
- **loading** — opacity: `0.7`
- **selected** — bg: `#0e1116`, color: `#ffffff`

#### Input

- **hover** — border: `1px solid rgba(14, 17, 22, 0.5)`
- **focus** — border: `1.5px solid #0e1116`, shadow: `0 0 0 4px rgba(14, 17, 22, 0.15)`
- **disabled** — bg: `rgba(14, 17, 22, 0.04)`, opacity: `0.4`
- **error** — border: `1.5px solid #DC2626`, shadow: `0 0 0 4px rgba(220,38,38,0.15)`

#### Card

- **hover** — shadow: `0 12px 28px -12px rgba(15,23,42,0.18)`, transform: `translateY(-2px)`
- **selected** — bg: `rgba(14, 17, 22, 0.04)`, border: `1.5px solid #0e1116`
- **dragging** — shadow: `0 20px 48px -16px rgba(15,23,42,0.3)`, transform: `scale(1.02) rotate(-0.5deg)`, opacity: `0.9`

#### Tab

- **hover** — bg: `rgba(14, 17, 22, 0.06)`, color: `#0e1116`
- **focus** — outline: `2px solid rgba(14, 17, 22, 0.5)`, outline-offset: `2px`
- **selected** — color: `#0e1116`, border: `0 0 2px 0 solid #0e1116`

### Density

| Mode | padding × | row × | body | radius × | Use for |
|------|-----------|-------|------|----------|---------|
| compact | 0.72 | 0.78 | 0.8125rem | 0.85 | Information-dense — tables, IDEs, dashboards |
| comfortable | 1 | 1 | 0.9375rem | — | Default — most product UI |
| spacious | 1.35 | 1.3 | 1rem | 1.15 | Editorial — marketing, long-form, settings |

### Motion

**Signature — Quiet ease.** 240 ms ease-out for all standard transitions. Reliable, invisible — motion stays out of the way.

```css
transition: all 240ms cubic-bezier(0.4, 0, 0.2, 1);
```

| Token | Value |
|-------|-------|
| duration.instant | `80ms` |
| duration.fast | `160ms` |
| duration.base | `240ms` |
| duration.slow | `380ms` |
| easing.standard | `cubic-bezier(0.4, 0, 0.2, 1)` |
| easing.decelerate | `cubic-bezier(0.0, 0, 0.2, 1)` |
| easing.accelerate | `cubic-bezier(0.4, 0, 1, 1)` |
| easing.spring | `cubic-bezier(0.34, 1.4, 0.64, 1)` |

### Elevation

Five-level scale, system-specific recipe.

| Level | Shadow | Recipe |
|-------|--------|--------|
| level0 | `none` | Flat — hairline border separates. |
| level1 | `0 1px 2px rgba(15,23,42,0.06), 0 1px 3px rgba(15,23,42,0.04)` | List rows, resting cards. |
| level2 | `0 4px 12px -2px rgba(15,23,42,0.1), 0 2px 6px rgba(15,23,42,0.06)` | Hover cards, popover. |
| level3 | `0 12px 32px -8px rgba(15,23,42,0.16), 0 4px 12px rgba(15,23,42,0.08)` | Sheets, side panels. |
| level4 | `0 28px 64px -16px rgba(15,23,42,0.28), 0 8px 24px rgba(15,23,42,0.12)` | Modals — scrim required. |

### Content

- **measure:** `68ch` (max line length for body prose)
- **paragraph spacing:** `1.2em`
- **list indent:** `1.5em`
- **list gap:** `0.5em`
- **link:** color `#0e1116`, underline `hover`
- **blockquote:** border `3px solid rgba(14, 17, 22, 0.6)`, padding `0.5em 0 0.5em 1.25em`
- **code:** background `rgba(14, 17, 22, 0.06)`, color `#0e1116`

### Accessibility (WCAG 2.1)

**Overall:** AA

| Pair | Ratio | Required | Grade | Suggested fix |
|------|-------|----------|-------|---------------|
| Body text on surface | 18.91:1 | AA | AAA | — |
| Body text on canvas | 17.49:1 | AA | AAA | — |
| Muted text on surface | 6.12:1 | AA | AA | — |
| Accent on surface | 18.91:1 | AA-Large | AAA | — |
| Accent on canvas | 17.49:1 | AA-Large | AAA | — |
