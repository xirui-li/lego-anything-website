#!/usr/bin/env python3
"""Package existing metric-viewer exports; never runs a model or a renderer.

The input manifest is private build input and is not copied to the website.
See README.md for its schema. All published metadata is explicitly allowlisted.
"""
import argparse
import hashlib
import json
import math
from collections import Counter
from pathlib import Path

from PIL import Image, ImageChops, ImageOps


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def near(actual, expected, label):
    if not math.isclose(actual, expected, abs_tol=1e-12):
        raise ValueError(f"{label} disagrees with the recorded evaluation")


def metric(source):
    return {key: source[key] for key in ("precision", "recall", "fscore")}


def export_case(case, output):
    source_paths = {key: Path(case[key]) for key in
                    ("geometry", "evaluation", "appearance_report", "reference", "render", "appendix_render")}
    raw = json.loads(source_paths["geometry"].read_text())
    evaluation = json.loads(source_paths["evaluation"].read_text())
    appearance = json.loads(source_paths["appearance_report"].read_text())
    rewards = evaluation["rewards"]
    if raw["provenance"]["model"] != "openai.gpt-6-astra":
        raise ValueError("These appendix metric cases require the GPT-6-astra trial")
    if raw["alignment"].get("scale_applied") is not False:
        raise ValueError("Only no-scale geometry can be published in this viewer")
    if raw["provenance"]["task_id"] != appearance["task_id"]:
        raise ValueError("Geometry and appearance must describe the same task")
    reconstruction = raw["metrics"]["per_object_macro_depth_relative_5_percent"]
    near(reconstruction["fscore"], rewards["reconstruction_reward"], "Reconstruction")
    near(appearance["score"], rewards["rendered_visual_similarity"], "Appearance")
    near(rewards["overall_score"],
         rewards["artifact_valid"] * (reconstruction["fscore"] + appearance["score"]) / 2,
         "Overall")

    destination = output / case["id"]
    destination.mkdir(parents=True, exist_ok=True)
    render = Image.open(source_paths["render"]).convert("RGB")
    appendix_render = Image.open(source_paths["appendix_render"]).convert("RGB")
    if render.size != appendix_render.size or render.tobytes() != appendix_render.tobytes():
        raise ValueError("The selected evaluator render is not the appendix result")
    reference = Image.open(source_paths["reference"]).convert("RGB")
    if sha256(source_paths["reference"]) != appearance["reference"]["sha256"]:
        raise ValueError("Reference checksum disagrees with the evaluator")
    if sha256(source_paths["render"]) != appearance["candidate"]["sha256"]:
        raise ValueError("Render checksum disagrees with the evaluator")
    reference = reference.resize(render.size, Image.Resampling.LANCZOS)
    difference = ImageChops.difference(reference, render)
    red, green, blue = difference.split()
    error = ImageChops.lighter(red, ImageChops.lighter(green, blue))
    threshold = appearance["pixel_tolerance_8bit"]
    hit_count = sum(error.histogram()[:threshold + 1])
    pixel_count = render.width * render.height
    near(hit_count / pixel_count, appearance["score"], "Pixel hit rate")
    hit_mask = error.point(lambda value: 255 if value <= threshold else 0)
    mask = ImageOps.colorize(hit_mask, black="#eef0f2", white="#526f91")
    for name, image in (("reference", reference), ("render", render),
                        ("error", ImageOps.invert(error)), ("matches", mask)):
        image.save(destination / f"{name}.png", optimize=True)

    visual = raw["visualization"]
    objects, counts = [], Counter()
    for source in visual["objects"]:
        counts[source["category"]] += 1
        label = source["category"].replace("_", " ").capitalize()
        obj = {
            "id": source["object_id"],
            "label": f"{label} {counts[source['category']]}",
            "metrics": metric(source["depth_relative_thresholds"]["5_percent"]),
            "prediction": source["prediction_points"],
            "target": source["target_points"],
            "prediction_matches": source["prediction_pass_5_percent"],
            "target_matches": source["target_recalled_5_percent"],
            "prediction_point_count": source["prediction_point_count"],
            "target_point_count": source["target_point_count"],
        }
        for side in ("prediction", "target"):
            if len(obj[side]) != len(obj[f"{side}_matches"]):
                raise ValueError("Point and match arrays must have the same length")
        objects.append(obj)
    near(sum(obj["metrics"]["fscore"] for obj in objects) / len(objects),
         reconstruction["fscore"], "Object-macro F1")
    payload = {
        "schema": "lego_anything_static_metrics_v1",
        "id": case["id"], "name": case["name"],
        "task_id": raw["provenance"]["task_id"],
        "trial_id": raw["provenance"]["trial_id"],
        "model": "GPT-6-astra", "run": "run_01",
        "scores": {
            "validity": rewards["artifact_valid"],
            "reconstruction": reconstruction["fscore"],
            "appearance": appearance["score"],
            "overall": rewards["overall_score"],
        },
        "protocol": {
            "geometry": "object_macro_depth_relative_no_scale_fscore_v1",
            "distance_fraction": 0.05,
            "alignment": "fixed_reference_camera_no_scale_v1",
            "appearance": appearance["protocol_version"],
            "rgb_tolerance": threshold,
            "point_sampling": "display_only",
            "scene_metrics": "companion_diagnostic_not_object_macro",
        },
        "geometry": {
            "macro_metrics": metric(reconstruction),
            "scene": {
                "prediction": visual["aligned_prediction_points"],
                "target": visual["target_scene_points"],
                "metrics": metric(raw["metrics"]["visible_scene_depth_relative_5_percent"]),
            },
            "objects": objects,
        },
        "appearance": {
            **{name: f"{name}.png" for name in ("reference", "render", "error", "matches")},
            "width": render.width, "height": render.height,
            "hit_pixels": hit_count, "total_pixels": pixel_count,
        },
        "provenance": {
            "geometry_exporter": "LEGO-Bench/metric_explorer/build_real_trial_demo.py",
            "evaluation_fingerprint": evaluation["evaluation_fingerprint"],
            "source_sha256": {key: sha256(path) for key, path in source_paths.items()},
            "published_image_sha256": {name: sha256(destination / f"{name}.png")
                                       for name in ("reference", "render", "error", "matches")},
        },
    }
    serialized = json.dumps(payload, separators=(",", ":"), allow_nan=False) + "\n"
    (destination / "metrics.json").write_text(serialized)
    print(f"{case['id']}: R {100 * reconstruction['fscore']:.2f}, "
          f"A {100 * appearance['score']:.2f}, {len(objects)} objects; validated")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path,
                        default=Path(__file__).resolve().parents[1] / "assets/explorer")
    args = parser.parse_args()
    for case in json.loads(args.manifest.read_text())["cases"]:
        export_case(case, args.output)


if __name__ == "__main__":
    main()
