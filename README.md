# LEGO-Anything

Project website for **LEGO-Anything: Coding Agents for 3D Scene Reconstruction**.

Website: <https://xirui-li.github.io/lego-anything-website/>

A static paper website built with HTML, CSS, JavaScript, and Three.js. It includes
Overview, the agent workflow, LEGO-Bench, LEGO-Plugin, LEGO-World, and Citation.

## Website

The desktop layout places the paper content in the right two thirds, with neutral
gray architectural models in the left third. Each section occupies one screen;
LEGO-Bench and LEGO-Plugin each use two consecutive screens. Mobile uses a single
reading column. Motion follows scrolling and respects reduced-motion preferences.

- Benchmark findings open in a three-part dialog with tabs and arrow navigation.
- Plugin results show the six models’ relative gains; visual examples open in a
  separate dialog with Reception and Copy room comparisons.
- Paper figures open at full size. The trajectory figure is a lossless PNG
  exported directly from the manuscript PDF.
- Citation includes the paper’s BibTeX and a copy button.
- Fonts, Three.js, figures, and the paper PDF are included in the repository.

The decorative landmarks are the Eiffel Tower, Sydney Opera House, Leaning Tower
of Pisa, Colosseum ruins, Acropolis ruins, an art-deco skyscraper, and Big Ben
with the Houses of Parliament. These are procedural illustrations, separate from
the paper’s reconstruction results. Static renderings are used when WebGL is
unavailable; mobile does not download the 3D renderer.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Paper content and dialogs |
| `styles.css` | Typography and responsive layout |
| `app.js` | Navigation, findings, examples, and citation |
| `architecture.js` | Scroll-driven 3D rendering |
| `architecture-model.js` | Procedural landmark geometry |
| `assets/` | Paper, images, fonts, data, and renderer |
| `tools/` | Asset export and browser verification |

The four legacy HTML entry points redirect to the corresponding sections.

## Updating paper assets

The manuscript source is `xirui-li/-ArXiv-LEGO-Anything`; the research code is
`xirui-li/lego-anything`. Access follows each repository’s visibility settings.

`assets/provenance.json` records source paths, the manuscript commit, and SHA-256
checksums. `assets/results.json` contains the results parsed from the manuscript.

To update assets, supply the manuscript checkout and compiled PDF to the export
script. It requires Pillow and Poppler; social-preview font conversion also uses
fonttools and brotli.

```bash
python3 tools/sync_paper.py --paper "$PAPER_CHECKOUT" --pdf "$PAPER_PDF"
```

## Verification

The browser checks require Playwright, Chromium, and Pillow. Set `SITE_URL` to the
website deployment to verify:

```bash
python3 tools/check_site.py --url "$SITE_URL"
python3 tools/check_architecture.py --url "$SITE_URL"
```

Reports and screenshots are written to `test-results/`, which is excluded from
version control. Checks cover responsive sections, navigation, dialogs, paper
assets, citation copying, WebGL rendering, animation, and static fallbacks.

## Hosting and credits

The website requires no build step and supports a domain root or a repository
subdirectory. GitHub Pages can serve the `main` branch root; `.nojekyll` is included.

Third-party licenses and source records are retained in `assets/fonts/` and
`assets/vendor/three/`. Paper figures, results, and author information are drawn
from the manuscript.
