# LEGO-Anything

Project website for **LEGO-Anything: Coding Agents for 3D Scene Reconstruction**.

Website: <https://xirui-li.github.io/lego-anything-website/>

Paper: <https://arxiv.org/abs/2609.36380>

A static paper website built with HTML, CSS, JavaScript, and Three.js. It includes
Overview, the agent workflow, LEGO-Bench, LEGO-Plugin, LEGO-World, Explorer, and Citation.

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
- Paper links point to arXiv:2609.36380. Citation includes the arXiv BibTeX
  (`li2026legoanythingcodingagents3d`) and a copy button.
- Explorer occupies one paper screen with a gray Taj Mahal in the left third.
  Two short descriptions link to Examples and Metric viewer in a dialog. The
  viewer is loaded only when opened; closing it restores the reading position.
- The dialog includes all six appendix examples, each with six model outputs,
  and recorded metrics for Havana rum shop street and Office open-plan.
- Fonts, Three.js, figures, and the paper PDF are included in the repository.

The decorative landmarks are the Eiffel Tower, Sydney Opera House, Leaning Tower
of Pisa, Colosseum ruins, Acropolis ruins, an art-deco skyscraper, Taj Mahal, and Big Ben
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
| `explorer-viewer.html`, `explorer.css`, `explorer.js` | Static dialog content for appendix examples and recorded metrics |
| `assets/` | Paper, images, fonts, data, and renderer |
| `tools/` | Asset export and browser verification |

The legacy HTML entry points redirect to the corresponding sections.
`explorer.html` redirects to the Explorer chapter at `index.html#explorer`.

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
python3 tools/check_explorer.py --url "$SITE_URL"
```

Reports and screenshots are written to `test-results/`, which is excluded from
version control. Checks cover responsive sections, navigation, dialogs, paper
assets, citation copying, WebGL rendering, animation, and static fallbacks.

## Explorer data

Explorer is fully static. Its dialog embeds `explorer-viewer.html` from the same
site. Browsers load bundled images and JSON; rotating sampled
point clouds only changes the display. There is no evaluation API, backend,
model call, upload, or live metric computation.

The viewer retains image enlargement, case/model switching, point-cloud controls,
and recorded-data downloads. Escape closes an enlarged image first, then Explorer.
The original paper page and its decorative landmark remain behind the dialog.

Examples reuse the manuscript's six appendix cases and six model columns.
Both metric cases use GPT-6-astra, run 01. Their evaluator rerenders match the
appendix PNGs exactly. Geometry uses the existing research project's
`LEGO-Bench/metric_explorer/build_real_trial_demo.py` export, with the canonical
no-scale evaluation overlay. The visible-scene F1 is a companion diagnostic;
the headline reconstruction score is the mean of per-object F1 scores.

`assets/explorer/ex01/` and `ex05/` each contain:

- `metrics.json`: recorded scores, sampled point clouds, per-object tolerance
  flags, metric definitions, and source checksums.
- `reference.png` and `render.png`: lossless images at evaluation resolution.
- `error.png`: inverted maximum RGB-channel error (darker means more error).
- `matches.png`: the precomputed RGB tolerance mask (blue means all channels
  differ by at most 30).

The metric reference is resized from the evaluator's original image, rather than
from the appendix thumbnail. `tools/export_explorer.py` verifies the source
checksums, exact appendix render, pixel-hit score, reconstruction score,
object-macro aggregation, and overall score before packaging the assets.

For reproduction, first use the research project's exporter with the matching
trial, task, and verifier overlay. Then create a private JSON build manifest:

```json
{
  "cases": [{
    "id": "ex01",
    "name": "Havana rum shop street",
    "geometry": "build/ex01/geometry.json",
    "evaluation": "evaluation/ex01/reevaluation.json",
    "appearance_report": "evaluation/ex01/rendered-visual-similarity-report.json",
    "reference": "dataset/ex01/environment/reference.png",
    "render": "evaluation/ex01/rendered-visual-similarity/native.png",
    "appendix_render": "paper/figures/appendix_c_examples/ex01_gpt6_astra.png"
  }]
}
```

Paths in this build input resolve from the working directory. Add an equivalent
entry for `ex05`, then package with Pillow:

```bash
python3 tools/export_explorer.py --manifest "$EXPLORER_MANIFEST"
```

The private manifest is not published. Public metadata uses an explicit field
allowlist and includes checksums, task identifiers, and trial identifiers.

## Hosting and credits

The website requires no build step and supports a domain root or a repository
subdirectory. GitHub Pages can serve the `main` branch root; `.nojekyll` is included.

Third-party licenses and source records are retained in `assets/fonts/` and
`assets/vendor/three/`. Paper figures, results, and author information are drawn
from the manuscript.
