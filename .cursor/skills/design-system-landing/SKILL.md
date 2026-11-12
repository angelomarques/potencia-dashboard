---
name: design-system-landing
description: Use when creating a new visual design system OR a marketing / local-business landing page in a Potencia app. Enforces DESIGN.md-first art direction, first- and second-order anti-slop bans, photography/truth rules, and silhouette tests. Do not use for operational/admin SaaS UI, or for minting an app (use new-potencia-stack).
---

# design-system-landing

Art direction, visual architecture, typography, photography, and truthful copy for **new design systems** and **marketing / local-business landing pages** in Potencia apps.

Do **not** add a demo landing to the `potencia-stack` template itself. Use this skill in a scaffolded app (or a product repo) when the brief asks for a landing or a visual system.

Copy `DESIGN.template.md` in this folder to `DESIGN.md` (page- or system-local) and fill every section **before** TSX/CSS.

## When to use
- New **visual design system** (tokens, type, silhouette, signature element) for a Potencia marketing surface
- New **marketing or local-business landing page**
- Redesign of an existing landing that still looks like an AI template

Skip this skill for app chrome, dashboards, auth, and settings. Those stay quiet and utilitarian (forms still follow `.cursor/rules/forms.mdc`).

## Steps
1. **`DESIGN.md` first** — copy `DESIGN.template.md`; fill all eight sections. No page code until the spec is complete. See [DESIGN.md checklist](#designmd-checklist).
2. **Photos** — 6–9 niche Unsplash/Pexels images under `public/images/<slug>/`; log every file in `IMAGE_CREDITS.md`.
3. **Build** — isolated App Router route, local fonts, scoped CSS, semantic HTML, WCAG AA. See [Stack](#stack).
4. **Silhouette test** — full-page shots of this page **and** every other landing in the app; blur or step back 3m. Shared outline = fail; invent a new silhouette (do not token-swap).
5. **Stranger test** — would a discerning designer clock this as an AI template? If yes, rebuild the offending section.
6. **Chanel rule** — strip one decorative flourish that is trying too hard.
7. **Prove** — `pnpm typecheck`; 360px → wide desktop; `prefers-reduced-motion`; scroll-verify sticky/lazy (full-page screenshots lie). Run `verify-potencia-stack` (`pnpm doctor` / `pnpm typecheck`) when this repo has those scripts.

## Stack
- **pnpm only.** Next.js App Router under `src/app/`.
- Route: `src/app/<slug>/page.tsx` plus a dedicated `layout.tsx` that loads **niche** Google fonts via `next/font/google` (do not reuse the root Figtree/Inter stack as the landing signature).
- Style with a CSS module (`<slug>.module.css`) or CSS variables scoped to a page wrapper. Do not dump landing tokens into `src/app/globals.css`.
- Images: `next/image`, explicit `sizes`, `priority` on the LCP hero, descriptive `alt` (Portuguese for BR local businesses unless the brief says otherwise).
- **No Lucide for decoration** on the landing. Tiny inline SVGs only for functional WhatsApp / phone / map-pin. (`lucide-react` may remain in app chrome / shadcn elsewhere.)
- Interactive forms on the page still use **react-hook-form + zod + shadcn `Form*`**.
- UI copy: Portuguese for BR local businesses unless the brief says otherwise.

## Absolute bans — first-order
- Purple/blue SaaS gradients (`indigo-600` → `purple-500` on white).
- Glassmorphism (`backdrop-blur-md bg-white/10 border-white/20`) as decoration.
- Floating blur blobs (`blur-3xl opacity-30 rounded-full`).
- Gradient text (`bg-clip-text text-transparent bg-gradient-to-r`).
- Emoji as bullets, tags, or button icons.
- Fake device frames / fabricated dashboards.
- Fake testimonials, invented review counts, unverified stars.
- Generic filler (PT or EN): “ambiente acolhedor e atendimento diferenciado”, “experiência gastronômica/sensorial única”, “qualidade, tradição e excelência”, “desbloqueie seu potencial”, “soluções completas e inovadoras”.
- 3 identical cards: icon-in-circle + bold title + two-sentence blurb.
- Uniform `rounded-2xl shadow-xl border-slate-100` kit.
- Centered hero + primary CTA + ghost secondary CTA.
- Inter / Roboto / Arial / system sans as the **display signature**.

## Absolute bans — second-order (“tasteful escape”)
- Cream + terracotta default (`#FAF8F5` + `#C86446`) for every café/artisan/dining brief.
- Near-black + one neon lime/cyan/orange for every “modern” / fitness brief.
- All-caps tracked mono eyebrows on every section.
- Exactly one italic emotive word in a roman headline.
- Decorative `01 / 02 / 03` on blocks that are not a real sequence.
- Thin Lucide (or Lucide-alike) icon in a rounded square.
- Default editorial pool: Instrument Serif, Fraunces, DM Sans, Syne.
- Even `py-16` / `py-20` / `py-24` on every section.
- Bento grid by default.
- Universal recipe: Hero → 3 cards → Story → CTA banner → Footer.
- **Token-swap clones**: same silhouette and wireframe, different CSS variables/fonts.

## Photography
Photography is the reality anchor. Local businesses are light, material, and craft.

1. Curate **6–9** high-res Unsplash/Pexels shots for **this** niche (not a generic “restaurant” pack).
2. Mix: hero atmosphere, mid-page space, in-use craft (hands, tools, process), material crops (grain, steel, foam, leaf, iron).
3. Never a lone packshot on studio white. Objects stay in context and real light.
4. Photos are **illustrative**. Never caption stock as the real room, staff, or proprietary dish (`nosso salão`, `nosso chef`, `nossa equipe`). Captions describe craft or mood.
5. Credit every file in `IMAGE_CREDITS.md` (photographer, source URL, usage).
6. Files live at `public/images/<slug>/` and are referenced as `/images/<slug>/...`.

## Truth
- Invent nothing: no menus, prices, hours, founding year, staff names, awards, certifications, or services missing from the verified brief.
- Unverified details → soft CTAs (“Consulte opções e reservas pelo WhatsApp”, “Horários e valores pelo WhatsApp”). Do not invent Instagram if the handle is unconfirmed.
- Google ratings: exact string, BR formatting (`4,6 no Google · 3.226 avaliações`). A review count is never “alunos” / “clientes” / “frequentadores”.
- **Demo landings only** — footer must include `Landing demonstrativa — Potencia` and `Fotos ilustrativas: Unsplash (créditos em IMAGE_CREDITS.md)`. Real client sites: still no invented facts; omit the demo line; do not put `© <negócio>` as if this repo owns the business.
- Keep typography/direction credits in `DESIGN.md`, never in public UI.

## Geometry, spacing, color
- **Radius:** a ladder with ≥2 scales, **or** all-zero brutalism. Never blanket `rounded-2xl` / `rounded-3xl`.
- **Rhythm:** uneven density. Compress related rows; pause only where the content needs air. Mix dense columns with edge-to-edge image.
- **Palette:** sample the **materials** of this business (oak, crema, razor steel, kraft, chalk), not a Tailwind swatch or a trendy kit. 4–6 named hex tokens with roles.

## Silhouette catalogue (reference only)
These five archetypes exist so new work **does not** collapse onto one wireframe. **Invent a new silhouette** for every new landing or system. Never clone, never token-swap.

| Archetype | Shape (do not copy) | Type pairing (do not reuse as default) | Signature (do not reuse) |
| --- | --- | --- | --- |
| Full-bleed dark tavern / newspaper poster | Edge-to-edge night photography, wine multiply, tilted photo stack, 2–3 editorial columns, classifieds box | Gloock + Newsreader | Rotated circular wax-seal CTA |
| Quiet left rail + horizontal photo strip | ~260px sticky rail; whitespace; scroll-snap mixed crops; receipt CTA | Young Serif + Work Sans | One continuous hand-drawn SVG wave |
| Brutal 50/50 high-contrast split | Full-height sticky grayscale panel \| bone paper + 6–8px rules; **zero radius** | Unbounded + Archivo | 45° stripe band + massive phone block |
| Romantic narrow vertical story | ~34rem reading column; blooms bleed to the viewport; `shape-outside: circle()` | Bodoni Moda + Jost (+ script for one tag only) | Clipped gift-tag CTA |
| Dense industrial scoreboard / photo wall | Zero wasted space; condensed numerals; gapless matrix; hazard bands | Big Shoulders Display + Chivo | Scoreboard band + dividing plates |

If the app already has landings, the new page must fail a blur test against **those** pages, not merely against this table.

## DESIGN.md checklist
Fill every section (see `DESIGN.template.md`). Match this order:

1. **Visual thesis** — one sentence; material + light + format (not “modern and elegant”).
2. **Palette tokens** — 4–6 named hex + material roles.
3. **Typography roles & pairing** — display + body (+ optional accent); niche fonts; Inter banned as signature.
4. **Layout silhouette + ASCII wireframes** — desktop **and** mobile.
5. **ONE signature element** — a device unique to this page (not a badge kit).
6. **Photo treatment** — crop, grade, overlap, grain; list the 6–9 files.
7. **Explicit refusals** — what this page will not do.
8. **Silhouette vs others** — vs other pages / prior systems in this app, **or** a sharp “what this is NOT” if it is the first landing.

## Review lessons
Check every draft for these v2 regressions:

- Invented operational claims (“sem filas”, “sem contrato”, “grãos selecionados”, “uma das referências mais procuradas”). Not in the brief → delete or rewrite as neutral craft prose.
- Authority words beside ratings/phones: “oficial”, “verificada(s)”, “público registrado”.
- Mislabelled ratings (review count ≠ “alunos”).
- `© 2026 <negócio>. Todos os direitos reservados` on a demo.
- Design meta in the footer.
- Eyebrow relapse (`01 // ATENDIMENTO`, `IV. NO ATELIÊ`). Headings stand alone; small labels only for data cells / signage.
- Stock captions stated as fact about the venue.
- Sticky/lazy verified only with a full-page screenshot.

## Prove
Before calling the page done:

- [ ] `DESIGN.md` has all eight sections and was written before TSX
- [ ] 6–9 images in `public/images/<slug>/` + complete `IMAGE_CREDITS.md`
- [ ] No first- or second-order ban appears in the UI
- [ ] Silhouette is new (blur test vs siblings / catalogue)
- [ ] Copy is only verified facts + soft CTAs; ratings formatted correctly
- [ ] Demo footer present **iff** this is a demonstration landing
- [ ] `pnpm typecheck` clean; contrast AA; reduced-motion respected
- [ ] Real viewport scroll checks (sticky, lazy images) at 360px and desktop

If `verify-potencia-stack` is in the repo, also run `pnpm doctor` / `pnpm typecheck` there. Do **not** add a second landing skill; this folder is the source of truth.

## Research
- [superdesign.dev: How to Fix Generic AI Landing Pages](https://superdesign.dev/blog/fix-generic-ai-landing-page)
- [925studios.co: The AI Slop Web Design Guide](https://925studios.co/blog/ai-slop-web-design-guide)
- [uxgen.ai: Why Every Claude Code Landing Page Looks the Same](https://uxgen.ai/blog/why-every-claude-code-landing-page-looks-the-same)
- [elma.sh: AI Landing Page Design & The Generic Look](https://elma.sh/blog/ai-landing-page-design-generic-look)
- [Anthropic Frontend Design Skill Guidelines](https://github.com/anthropics/anthropic-quickstarts)
- [github.com/funboy322/avoid-ai-design](https://github.com/funboy322/avoid-ai-design)
