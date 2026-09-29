#!/usr/bin/env python3
"""Export web assets and result means/stds from the provided manuscript.

Requires Pillow and Poppler's pdftoppm. No model calls or benchmark reruns.
The source paper is read-only. Use --pdf to include a compiled copy of it.
"""
import argparse
import hashlib
import html
import io
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont, ImageOps

SITE = Path(__file__).resolve().parents[1]
METRICS = ["validity", "reconstruction", "appearance", "overall"]


def checksum(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_results(paper):
    source = paper / "tables/table_LEGO-Bench_agent_and_harness.tex"
    models = []
    for chunk in source.read_text().split("\\\\"):
        names = re.findall(r"\\texttt\{([^}]+)", chunk)
        cells = re.findall(
            r"\\meanstd\{(?:\\textbf\{)?([\d.]+)\}?\}\{([\d.]+)\}", chunk
        )
        if not names or not cells:
            continue
        name = names[-2] if names[-1] == "Codex" else names[-1].split("~")[0]
        values = [{"mean": float(a), "std": float(b)} for a, b in cells]
        if len(values) not in (4, 8):
            raise ValueError(f"Incomplete table row for {name}")
        group = (
            "Coding agents" if name.startswith("GPT") else
            "Task-specific LLM systems" if name in ("VIGA", "SceneConductor") else
            "Scene construction baselines"
        )
        models.append({
            "name": name,
            "group": group,
            "indoor": dict(zip(METRICS, values[:4])),
            "outdoor": dict(zip(METRICS, values[4:])) or None,
        })
    if len(models) != 12 or len({m["name"] for m in models}) != 12:
        raise ValueError("Expected 12 unique methods in the manuscript's main table")
    return models, source


def export_static_table(models):
    """Export the compact summary and the detailed table from the same results."""
    models = [m for m in models if m["group"] == "Coding agents"]
    maxima = {key: max(m["indoor"][key]["mean"] for m in models) for key in METRICS}
    rows = []
    for model in models:
        leading = ' class="leading-row"' if model["name"] == "GPT-6-astra" else ""
        cells = [f'<tr{leading}><th scope="row">{html.escape(model["name"])}'
                 '<span class="harness"> + Codex</span></th>']
        for metric in METRICS:
            value = model["indoor"][metric]
            classes = []
            if metric == "overall":
                classes.append("overall-cell")
            if value["mean"] == maxima[metric]:
                classes.append("best-value")
            cells.append(
                f'<td class="{" ".join(classes)}"><span class="mean">'
                f'{value["mean"]:.1f}</span><span class="std"> ± '
                f'{value["std"]:.1f}</span></td>'
            )
        rows.append("".join(cells) + "</tr>")
    path = SITE / "index.html"
    content, count = re.subn(
        r"<!-- RESULTS:START -->.*?<!-- RESULTS:END -->",
        "<!-- RESULTS:START -->\n" + "\n".join(rows) + "\n<!-- RESULTS:END -->",
        path.read_text(),
        flags=re.DOTALL,
    )
    if count != 1:
        raise ValueError("Static results markers missing or duplicated in index.html")
    summary = []
    best = {split: max(m[split]["overall"]["mean"] for m in models) for split in ("indoor", "outdoor")}
    for model in models:
        cells = [f'<tr><th scope="row">{html.escape(model["name"])}</th>']
        for split in ("indoor", "outdoor"):
            value = model[split]["overall"]
            highlight = ' class="best-value"' if value["mean"] == best[split] else ""
            cells.append(f'<td{highlight}><span class="mean">{value["mean"]:.1f}</span>'
                         f'<span class="std"> ± {value["std"]:.1f}</span></td>')
        summary.append("".join(cells) + "</tr>")
    content, count = re.subn(
        r"<!-- BENCHMARK-SUMMARY:START -->.*?<!-- BENCHMARK-SUMMARY:END -->",
        "<!-- BENCHMARK-SUMMARY:START -->\n" + "\n".join(summary) + "\n<!-- BENCHMARK-SUMMARY:END -->",
        content, flags=re.DOTALL,
    )
    if count != 1:
        raise ValueError("Benchmark summary markers missing or duplicated in index.html")
    path.write_text(content)


def social_preview(assets):
    image = Image.new("RGB", (1200, 630), "#ffffff")
    draw = ImageDraw.Draw(image)

    def font(size, serif=False):
        try:
            from fontTools.ttLib import TTFont
            name = "libre-baskerville-400.woff2" if serif else "inter-400.woff2"
            face = TTFont(assets / "fonts" / name)
            face.flavor = None
            buffer = io.BytesIO()
            face.save(buffer)
            buffer.seek(0)
            return ImageFont.truetype(buffer, size)
        except ImportError:
            name = "DejaVuSerif.ttf" if serif else "DejaVuSans.ttf"
            return ImageFont.truetype(f"/usr/share/fonts/truetype/dejavu/{name}", size)

    draw.text((55, 32), "LEGO-Anything", font=font(55, True), fill="#292c33")
    draw.text((58, 112), "Coding Agents for 3D Scene Reconstruction", font=font(27), fill="#484a2e")
    for x, suffix, label in [(56, "ref", "REFERENCE IMAGE"), (610, "gpt6_astra", "RECONSTRUCTED SCENE")]:
        draw.text((x, 183), label, font=font(13), fill="#837975")
        photo = Image.open(assets / f"appendix_c_examples/ex01_{suffix}.webp")
        photo = ImageOps.fit(photo, (533, 300))
        image.paste(photo, (x, 214))
    draw.text((58, 550), "One image. A coding agent. An editable 3D world.", font=font(24), fill="#484a2e")
    image.save(assets / "social-preview.jpg", quality=91, optimize=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--paper", type=Path, required=True)
    parser.add_argument("--pdf", type=Path)
    args = parser.parse_args()
    paper = args.paper.resolve()
    assets = SITE / "assets"
    assets.mkdir(exist_ok=True)
    commit = subprocess.check_output(
        ["git", "-C", str(paper), "rev-parse", "HEAD"], text=True
    ).strip()
    manifest = {
        "paperRepository": "https://github.com/xirui-li/-ArXiv-LEGO-Anything",
        "paperCommit": commit,
        "assets": {},
    }

    def record(destination, source):
        manifest["assets"][destination.relative_to(SITE).as_posix()] = {
            "source": source.relative_to(paper).as_posix(),
            "sourceSHA256": checksum(source),
            "outputSHA256": checksum(destination),
        }

    for group in ("appendix_c_examples", "plugin_examples"):
        target = assets / group
        target.mkdir(exist_ok=True)
        for source in sorted((paper / "figures" / group).glob("*.png")):
            destination = target / (source.stem + ".webp")
            Image.open(source).convert("RGB").save(destination, quality=91, method=6)
            record(destination, source)
    for name in (
        "image_main_graph", "image_LEGO_plugin", "image_workflow", "image_data_engine",
        "image_trajectory", "image_lego_plugin_model_comparison", "image_reasoning_efforts",
    ):
        source = paper / "figures" / (name + ".pdf")
        destination = assets / (name + (".png" if name == "image_trajectory" else ".webp"))
        with tempfile.TemporaryDirectory() as temp:
            prefix = Path(temp) / name
            if name == "image_trajectory":
                options = ["-cropbox", "-scale-to", "3600"]
            elif name in ("image_workflow", "image_data_engine"):
                options = ["-cropbox", "-scale-to", "2400"]
            else:
                options = ["-scale-to", "2200"]
            subprocess.run(
                ["pdftoppm", *options, "-singlefile", "-png", str(source), str(prefix)],
                check=True, capture_output=True,
            )
            image = Image.open(prefix.with_suffix(".png")).convert("RGB")
            if name == "image_trajectory":
                image.save(destination, optimize=True)
            else:
                image.save(destination, quality=92, method=6)
        record(destination, source)
    source = paper / "figures/image_dataset_scene_overview.jpg"
    image = Image.open(source).convert("RGB")
    image.thumbnail((2200, 1600))
    destination = assets / "benchmark-scenes.webp"
    image.save(destination, quality=88, method=6)
    record(destination, source)
    models, table_source = parse_results(paper)
    data = {"paperCommit": commit, "source": table_source.relative_to(paper).as_posix(), "models": models}
    (assets / "results.json").write_text(json.dumps(data, indent=2) + "\n")
    record(assets / "results.json", table_source)
    export_static_table(models)
    social_preview(assets)
    if args.pdf:
        if not args.pdf.is_file() or args.pdf.read_bytes()[:5] != b"%PDF-":
            raise ValueError("--pdf must refer to a valid, compiled manuscript PDF")
        shutil.copyfile(args.pdf, assets / "paper.pdf")
        manifest["paperPDF"] = {
            "source": "Compiled from the paper repository at paperCommit",
            "sha256": checksum(assets / "paper.pdf"),
        }
    elif (assets / "provenance.json").exists():
        previous = json.loads((assets / "provenance.json").read_text())
        if previous.get("paperPDF"):
            manifest["paperPDF"] = previous["paperPDF"]
            manifest["paperPDF"]["paperCommit"] = previous.get("paperCommit")
    (assets / "provenance.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Exported {len(manifest['assets'])} assets and all 12 result rows from {commit[:12]}.")


if __name__ == "__main__":
    main()
