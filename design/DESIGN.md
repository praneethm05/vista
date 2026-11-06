# LOCKED design system: Akasa hackathon

**Fonts:** Big Shoulders (display) · Inter (body/UI/prices) · Geist Mono (data)
Verified on 6 Nov: builds with Next.js 16 + Tailwind 4, renders correctly (₹ shows in Inter).

## Setup in a Next.js app (2 minutes)
1. Copy `fonts.ts` → `app/fonts.ts`, `globals.css` → `app/globals.css`.
2. In `app/layout.tsx`:
   ```tsx
   import './globals.css';
   import { fontVars } from './fonts';
   export default function RootLayout({ children }: { children: React.ReactNode }) {
     return <html lang="en" className={fontVars}><body>{children}</body></html>;
   }
   ```
3. Optional: copy `FlightCard.example.tsx` as a reference component.

## Setup in Vite + React instead
Add to `index.html` `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders:opsz,wght@10..72,100..900&family=Inter:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
```
Then in `globals.css` replace the three `var(--font-…)` font lines with `"Big Shoulders"`, `"Inter"`, `"Geist Mono"`.

## Rules (give these to the AI agent)
- **Big Shoulders** → `h1`/`h2`, route codes (`BLR → BOM`), big numbers. Never body text. `h1` uppercase.
- **Inter** → all body text, buttons, form labels, **every price** (Big Shoulders has no ₹), and the `→` inside display text if it looks off.
- **Geist Mono** (`.data`) → PNR, flight numbers, times, seat numbers, IDs: tabular figures so columns align.
- **Colour:** `brand` (#4b1f73) for primary actions · `accent` (#ff6a2b) for ONE highlight only (selected seat, live timer) · `muted` text · `line` borders · `success` / `danger` for status. No gradients, no extra colours.
- **Sizes:** `text-display` 48 · `text-title` 30 · `text-subtitle` 20 · body 15 · `text-small` 13 · `text-tiny` 12. No other sizes.
- **Spacing:** multiples of 4px (Tailwind default). Cards `p-5`, page `p-8`, gaps `gap-4`.
- **Cards:** `rounded-card border border-line bg-surface shadow-card`. Controls: `rounded-control`.
- **Every list/screen needs:** loading state, empty state ("No flights on this date"), error state with a retry.
- **Copy:** real airline wording (IATA codes, `QP 1402`, PNRs like `X7K9QL`, ₹ with `en-IN` formatting). No lorem ipsum, no emoji in UI.
- **Don't:** use the Akasa logo or brand assets · add glassmorphism/gradients/random icons · mix in other fonts.

## Tailwind utilities you get from the tokens
`font-display` `font-sans` `font-mono` · `text-ink` `text-muted` `bg-brand` `bg-accent` `bg-surface` `bg-canvas` `border-line` `text-success` `text-danger` · `text-display` `text-title` `text-subtitle` `text-small` `text-tiny` · `rounded-card` `rounded-control` · `shadow-card` · `.data` `.price`
