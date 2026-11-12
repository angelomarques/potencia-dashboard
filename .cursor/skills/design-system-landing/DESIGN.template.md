# <Business or system name> — Design Document

Copy this file to a page-local `DESIGN.md` (for example `src/app/<slug>/DESIGN.md` or the repo root for a system-wide marketing skin). Fill every section **before** writing TSX or CSS. Follow `.cursor/skills/design-system-landing/SKILL.md`.

Replace angle-bracket placeholders. Delete the instructional italic lines.

## 1. Visual Thesis
*<One sentence: material + light + printed/physical format. Not “modern, elegant, unique”.*

>

## 2. Palette Tokens (4–6 named hex)
- `--<prefix>-<material>`: `#______` *(canvas / role — name the physical source)*
- `--<prefix>-<material>`: `#______` *(…)*
- `--<prefix>-<material>`: `#______` *(…)*
- `--<prefix>-<material>`: `#______` *(…)*
- `--<prefix>-<material>`: `#______` *(optional)*
- `--<prefix>-<material>`: `#______` *(optional)*

Sample from **this** venue’s materials. Do not default to cream+terracotta or near-black+neon.

## 3. Typography Roles & Pairing
- **Display:** `<Google Font>` (weights). *Role: …*
- **Body:** `<Google Font>` (weights, incl. italic if needed). *Role: …*
- **Accent (optional, one job only):** `<Google Font>`. *Role: …*
- **Strict:** no Inter / Roboto / Arial / Space Grotesk as signature; no Lucide decoration; no all-caps mono eyebrows on every heading. Load fonts in the route `layout.tsx` via `next/font/google`.

## 4. Layout Silhouette & ASCII Wireframes

### Layout architecture
1. *Named band — what it contains and why it is shaped this way.*
2. …
3. …

Invent a **new** silhouette. Do not clone the catalogue (dark tavern poster, left rail + photo strip, brutal 50/50, romantic vertical story, industrial scoreboard).

### Desktop wireframe (≥ 1024px)
```
+-----------------------------------------------------------------------+
|                                                                       |
+-----------------------------------------------------------------------+
```

### Mobile wireframe (< 768px)
```
+------------------------------------------+
|                                          |
+------------------------------------------+
```

## 5. Signature Element
**Name:**
*One device unique to this page (interactive, structural, or both). Describe construction, color, and where it appears. Not a generic badge row.*

## 6. Photo Treatment
- **Files (6–9):** list filenames under `public/images/<slug>/`
- **Grading / crop / overlap / grain:**
- **Captions:** atmospheric or craft-generic — never “nosso salão”, staff names, or proprietary dishes unless the photo is verified as that place.
- **Credits:** every file in `IMAGE_CREDITS.md` (photographer, URL, usage).

## 7. Explicit Refusals
- …
- *(Include: no SaaS cards, no centered two-button hero, no invented facts, no emoji UI, no one-italic-word headlines, no Lucide decoration, no filler slogans.)*

## 8. Silhouette vs other pages / what this is NOT
*If the app has other landings or prior systems: contrast this silhouette against each. If this is the first: state what it is NOT (not a bento SaaS kit, not a token-swap of catalogue archetype N, not cream-terracotta artisan default, …).*
