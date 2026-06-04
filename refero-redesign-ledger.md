# Refero Redesign Ledger (Home + Inside Pages)

**Task:** Redesign iverif.io home (PortalHome) and inside pages (DocLayout + rendered docs) using refero-design methodology. Enforce non-3-column layouts. Keep Astro framework.

**Discovery Brief (synthesized):**
Designing web home + doc pages for regulatory AI compliance brand wiki (EU-native, precision intelligence for energy subsidy operators).
Goal: present brand story, knowledge map, rich NotebookLM/visual artifacts, and full docs with confidence and clarity.
Tone: precise, technical, restrained, trustworthy (dark Swiss base retained for regulatory gravity).
Main risk: looking generic AI-slop or fragmented 3-col docs.
Constraints: Astro (static, content collections, islands/GSAP client, components), real assets only, no new deps, mobile-first, reduced-motion.
Research needed: refero craft for layout/composition (anti-slop), typography (neutral technical), motion (purposeful), anti-AI patterns.

**Styles/References Used (from bundled refero refs, no live MCP):**
- anti-ai-slop.md: NO default cards (use sections, columns, dividers, media blocks). Avoid indigo, calm-editorial autopilot, emoji, left-accent stripes as decoration. Light not forced (dark ok for this technical brand).
- craft-details.md: focus-visible, spacing, no layout shift, purposeful details.
- example-workflow.md: research → synthesize → reference lock → implement.
- typography.md: denser/neutral for work tools (IBM Plex Sans/Mono fits perfectly for regulatory).
- motion.md: feedback/continuity/hierarchy only (retained GSAP scroll reveals for section hierarchy).
- Layout/composition: max 2 columns, asymmetric/vertical rhythm, media blocks (image+text), dividers for separation. No 3-equal grids, no generic hero+features-grid+...

**Reference Lock:**
Primary: technical data-infra / enterprise analytics precision (restrained sans, thin borders, evidence-led media, compact sections).
Preserve: dark regulatory canvas (#0F0F0F etc from Swiss), Signal Green accent, IBM Plex, GSAP islands, Astro content/docs structure, real /notebooklm + /visuals assets, rich artifact pages.
Borrow: anti-card discipline (media-blocks + border dividers), 2-col max (or 1), inline TOC, section rhythm over panels.
Reject: 3-col shells (left-nav + main + right-TOC), swiss-panel as default decoration, generic feature grids (3+), card-heavy galleries unless interactive.
Token commitments: 2-col max (768px+), flex-col knowledge, media-block + border-bottom, inline .doc-inline-toc, purposeful GSAP only.
Media: real screenshots/assets framed as evidence.

**Implementation Notes:**
- Capped all .swiss-grid-* and .visual-grid/.feature-grid to 1→2 col.
- DocLayout: doc-shell--single (full content), TOC moved to inline "On this page" list in header (eliminates 3rd column).
- PortalHome: hero asymmetric (2), features as media-blocks + dividers, visuals as media-blocks + dividers, dual as 2-col with stacked knowledge (no sub 2-grid), closing as bordered section. Removed GlassCard dep.
- GSAP updated to target new .media-block.
- Visual gallery (inside): kept auto-fill but constrained minmax for ~2-3 fluid.
- TS: added schema lastUpdated, null guards/casts in client scripts, removed spurious keys, @ts-ignore for lang attrs.
- Anti-slop applied: default to sections/dividers/media over cards (retained only where interactive/functional).
- Build + HTTP 200 verified on home + inside (product/overview, visual-assets, notebooklm-artifacts).
- Still-true from prior: Astro framework, real assets, GSAP, rich pages preserved, mobile/responsive, no path leaks.

**Next (if needed):** Further craft polish (focus states, micro copy), full visual QA screenshots, commit to main, Vercel deploy.

**Status:** Home + inside pages now use refero-aligned non-3-col layouts.
