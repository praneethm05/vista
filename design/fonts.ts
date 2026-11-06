// app/fonts.ts: LOCKED type system for the Akasa hackathon.
// Big Shoulders (display: headings, routes, flight codes) · Inter (body, UI, prices: has ₹) · Geist Mono (PNR, times, codes)
import { Big_Shoulders, Inter, Geist_Mono } from 'next/font/google';

export const display = Big_Shoulders({
  subsets: ['latin'],
  weight: 'variable',
  axes: ['opsz'],          // optical size axis: large sizes get the "Display" cut
  variable: '--font-display',
  display: 'swap',
});

export const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const mono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const fontVars = `${display.variable} ${sans.variable} ${mono.variable}`;
