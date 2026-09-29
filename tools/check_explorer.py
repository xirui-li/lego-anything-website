#!/usr/bin/env python3
"""Verify static Explorer data and interactions, including backend-free loading."""
import argparse
import json
import math
from io import BytesIO
from pathlib import Path
from urllib.parse import urljoin, urlparse

from PIL import Image, ImageChops, ImageOps
from playwright.sync_api import sync_playwright

SITE = Path(__file__).resolve().parents[1]
CASES = ["ex01", "ex02", "ex03", "ex04", "ex05", "ex06"]
MODELS = ["gpt56_luna", "gpt56_terra", "gpt56_sol", "gpt6_luna", "gpt6_sol", "gpt6_astra"]
EXPECTED = {
    "ex01": (0.5580444539645074, 0.2773030598958333, 2),
    "ex05": (0.5730743681556181, 0.5440673828125, 18),
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--chromium")
    parser.add_argument("--output", type=Path, default=SITE / "test-results/explorer")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    base = args.url.rstrip("/") + "/"
    url = urljoin(base, "explorer-viewer.html")
    report = {"checks": [], "errors": [], "unexpected_requests": []}

    def check(condition, label):
        if not condition:
            raise AssertionError(label)
        report["checks"].append(label)

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=args.chromium, args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")

        def static_only(route):
            request = route.request
            path = urlparse(request.url).path
            if not request.url.startswith(base) or "/api/" in path or request.method != "GET":
                report["unexpected_requests"].append(request.url)
                route.abort()
            else:
                route.continue_()

        context.route("**/*", static_only)
        page = context.new_page()
        page.on("pageerror", lambda error: report["errors"].append(str(error)))
        page.goto(url, wait_until="networkidle")
        page.evaluate("document.fonts.ready")
        check(page.locator("[data-case]").count() == 6, "All six appendix cases")
        check(page.locator("[data-model]").count() == 6, "All six model columns")
        check(page.locator(".site-header").count() == 0, "Viewer has no duplicate site navigation")
        for case in CASES:
            page.locator(f"[data-case={case}]").click()
            for model in MODELS:
                page.locator(f"[data-model={model}]").click()
                page.wait_for_function("""() => ['example-reference','example-render'].every(id => {
                  const image=document.getElementById(id);return image.complete && image.naturalWidth>0;
                })""")
                check(page.locator("#example-render").get_attribute("src").endswith(f"{case}_{model}.webp"),
                      f"{case} / {model} image loads")
            check(page.locator("#inspect-metrics").is_visible() == (case in EXPECTED),
                  f"{case}: metric availability is explicit")
        page.locator(f"[data-case=ex01]").click()
        page.screenshot(path=str(args.output / "examples-desktop.png"), full_page=True)
        page.locator("#example-render").click()
        check(page.locator("#image-dialog").evaluate("e=>e.open"), "Example opens in lightbox")
        page.keyboard.press("Escape")
        check(not page.locator("#image-dialog").evaluate("e=>e.open"), "Escape closes lightbox")
        page.locator("#examples-tab").focus()
        page.keyboard.press("ArrowRight")
        page.wait_for_selector("#metric-content:visible")
        check(page.locator("#metrics-tab").get_attribute("aria-selected") == "true", "Keyboard tab navigation")
        check(page.locator("[data-case]").count() == 2, "Metric viewer contains two recorded cases")

        for case, (r, a, object_count) in EXPECTED.items():
            page.locator(f"[data-case={case}]").click()
            page.wait_for_function("(r)=>document.querySelector('#score-reconstruction').textContent===r",
                                   arg=f"{r*100:.1f}%")
            response = context.request.get(urljoin(base, f"assets/explorer/{case}/metrics.json"))
            check(response.ok, f"{case}: static JSON served")
            text = response.text()
            data = response.json()
            check(all(token not in text for token in ("/home/", "localhost", "127.0.0.1", "file://", "/api/")),
                  f"{case}: no machine paths or backend URLs")
            check(data["model"] == "GPT-6-astra" and data["run"] == "run_01",
                  f"{case}: correct model and run")
            check(math.isclose(data["scores"]["reconstruction"], r, abs_tol=1e-12)
                  and math.isclose(data["scores"]["appearance"], a, abs_tol=1e-12),
                  f"{case}: scores match canonical recorded evaluation")
            check(math.isclose(data["scores"]["overall"], (r+a)/2, abs_tol=1e-12),
                  f"{case}: overall score aggregation")
            objects = data["geometry"]["objects"]
            check(len(objects) == object_count, f"{case}: expected object count")
            check(math.isclose(sum(obj["metrics"]["fscore"] for obj in objects)/len(objects), r, abs_tol=1e-12),
                  f"{case}: object macro aggregation")
            for obj in objects:
                check(all(len(obj[side]) == len(obj[f"{side}_matches"]) for side in ("prediction", "target")),
                      f"{case}: {obj['label']} point/flag correspondence")
            check(page.locator("#object-select option").count() == object_count + 1,
                  f"{case}: object selector populated")
            page.wait_for_function("document.querySelector('#point-viewer').dataset.visiblePoints==='5200'")
            canvas = page.locator("#point-viewer")
            initial = canvas.get_attribute("data-view")
            canvas.focus()
            canvas.press("ArrowRight")
            page.wait_for_function("(v)=>document.querySelector('#point-viewer').dataset.view!==v", arg=initial)
            check(canvas.get_attribute("data-view") != initial, f"{case}: keyboard rotates geometry")
            page.locator("#reset-view").click()
            page.wait_for_function("(v)=>document.querySelector('#point-viewer').dataset.view===v", arg=initial)
            canvas.scroll_into_view_if_needed()
            box = canvas.bounding_box()
            page.mouse.move(box["x"] + box["width"]/2, box["y"] + box["height"]/2)
            page.mouse.down()
            page.mouse.move(box["x"] + box["width"]/2 + 60, box["y"] + box["height"]/2 + 20, steps=8)
            page.mouse.up()
            check(canvas.get_attribute("data-view") != initial, f"{case}: pointer rotates geometry")
            page.locator("#show-target").uncheck()
            page.wait_for_function("document.querySelector('#point-viewer').dataset.visiblePoints==='2600'")
            check(canvas.get_attribute("data-visible-points") == "2600", f"{case}: point layer toggles")
            page.locator("#show-target").check()
            page.locator("#object-select").select_option(objects[0]["id"])
            check(page.locator("#object-scores dd").nth(2).inner_text() == f"{objects[0]['metrics']['fscore']*100:.1f}%",
                  f"{case}: selected object score")
            page.locator("#show-matches").check()
            check(page.locator("#match-legend").is_visible(), f"{case}: precomputed matches legend")
            page.locator("#appearance-tab").click()
            for kind in ("render", "error", "matches"):
                page.locator(f"[data-appearance={kind}]").click()
                page.wait_for_function("""() => {
                  const i=document.getElementById('metric-appearance');return i.complete&&i.naturalWidth===512;
                }""")
                check(page.locator("#metric-appearance").get_attribute("src").endswith(f"/{case}/{kind}.png"),
                      f"{case}: {kind} visualization loads")
            def image(name):
                result = context.request.get(urljoin(base, f"assets/explorer/{case}/{name}.png"))
                check(result.ok, f"{case}: {name}.png is available")
                return Image.open(BytesIO(result.body())).convert("RGB")
            reference, render = image("reference"), image("render")
            channels = ImageChops.difference(reference, render).split()
            difference = ImageChops.lighter(channels[0], ImageChops.lighter(channels[1], channels[2]))
            count = sum(difference.histogram()[:31])
            check(count == data["appearance"]["hit_pixels"], f"{case}: lossless pixels reproduce appearance score")
            check(not ImageChops.difference(image("error"), ImageOps.invert(difference).convert("RGB")).getbbox(),
                  f"{case}: error image is precomputed correctly")
            mask = ImageOps.colorize(difference.point(lambda x: 255 if x <= 30 else 0),
                                     black="#eef0f2", white="#526f91")
            check(not ImageChops.difference(image("matches"), mask).getbbox(),
                  f"{case}: tolerance image is precomputed correctly")
            page.locator("#geometry-tab").click()
            page.locator("#object-select").select_option("all")
            page.evaluate("window.scrollTo(0,0)")
            page.screenshot(path=str(args.output / f"{case}-geometry-desktop.png"), full_page=True)

        # Rapid switching must never apply a stale scene's data to the current case.
        page.evaluate("""() => {
          document.querySelector('[data-case=ex01]').click();
          document.querySelector('[data-case=ex05]').click();
        }""")
        page.wait_for_function("document.querySelector('#score-reconstruction').textContent==='57.3%'")
        check(page.locator("#download-metrics").get_attribute("href").endswith("/ex05/metrics.json"),
              "Rapid case switching keeps scores and downloads consistent")

        # Exercise a real failed static fetch, then recover without reloading the page.
        failure = context.new_page()
        failure.route("**/ex01/metrics.json", lambda route: route.fulfill(status=503, body="Unavailable"))
        failure.goto(url + "#metrics/ex01/geometry")
        failure.wait_for_selector("#metric-retry:visible")
        check(failure.locator("#metric-content").is_hidden(), "Failed fetch does not expose stale scores")
        failure.unroute("**/ex01/metrics.json")
        failure.locator("#metric-retry").click()
        failure.wait_for_selector("#metric-content:visible")
        check(failure.locator("#score-reconstruction").inner_text() == "55.8%", "Retry loads static data")
        failure.close()

        for width, height in [(1440, 900), (1024, 768), (901, 900), (820, 1000), (390, 844), (320, 740)]:
            responsive = context.new_page()
            responsive.set_viewport_size({"width": width, "height": height})
            responsive.goto(url + "#metrics/ex05/appearance", wait_until="networkidle")
            responsive.wait_for_selector("#metric-content:visible")
            responsive.evaluate("document.fonts.ready")
            check(not responsive.evaluate("document.documentElement.scrollWidth>innerWidth"),
                  f"{width}px: no horizontal page overflow")
            check(responsive.locator("#score-appearance").inner_text() == "54.4%",
                  f"{width}px: deep link restores correct case and panel")
            responsive.screenshot(path=str(args.output / f"appearance-{width}.png"), full_page=True)
            responsive.locator("#geometry-tab").click()
            responsive.locator("#zoom-in").click()
            responsive.wait_for_function("document.querySelector('#point-viewer').dataset.view.endsWith('1.200')")
            check(responsive.locator("#point-viewer").get_attribute("data-view").endswith("1.200"),
                  f"{width}px: touch-friendly zoom control")
            check(not responsive.evaluate("document.documentElement.scrollWidth>innerWidth"),
                  f"{width}px: geometry controls fit")
            responsive.close()

        # Main-site entries open the same static viewer in a native dialog.
        for width, height in [(1440, 900), (390, 844), (320, 740)]:
            landing = context.new_page()
            landing.on("pageerror", lambda error: report["errors"].append(str(error)))
            landing.set_viewport_size({"width": width, "height": height})
            landing.goto(base + "#explorer", wait_until="networkidle")
            landing.locator("#explorer").evaluate("e=>e.scrollIntoView()")
            check(not landing.locator("#explorer-frame").get_attribute("src"),
                  f"{width}px: viewer is not loaded before opening")
            check(landing.locator('[href="#explorer"][data-section-link]').count() == 1,
                  f"{width}px: Explorer is an in-page paper chapter")
            start_scroll = landing.evaluate("scrollY")
            landing.screenshot(path=str(args.output / f"landing-{width}.png"))
            landing.locator("[data-explorer-view=examples]").click()
            viewer = landing.frame_locator("#explorer-frame")
            viewer.locator("[data-case=ex06]").wait_for()
            check(landing.locator("#explorer-dialog").evaluate("e=>e.open"),
                  f"{width}px: Examples opens inside a dialog")
            check(landing.url == base + "#explorer", f"{width}px: opening viewer stays on the paper page")
            bounds = landing.locator("#explorer-dialog").bounding_box()
            check(bounds["width"] < width and bounds["height"] < height,
                  f"{width}px: dialog stays within the viewport")
            viewer.locator("#example-render").click()
            viewer.locator("#image-dialog[open]").wait_for()
            landing.keyboard.press("Escape")
            viewer.locator("#image-dialog[open]").wait_for(state="hidden")
            check(landing.locator("#explorer-dialog").evaluate("e=>e.open"),
                  f"{width}px: Escape closes image first and keeps Explorer open")
            viewer.locator("#examples-tab").focus()
            landing.keyboard.press("Escape")
            landing.wait_for_function("!document.querySelector('#explorer-dialog').open")
            check(abs(landing.evaluate("scrollY") - start_scroll) < 1,
                  f"{width}px: closing returns to the same reading position")
            check(landing.locator("[data-explorer-view=examples]").evaluate("e=>e===document.activeElement"),
                  f"{width}px: closing restores keyboard focus")
            landing.locator("[data-explorer-view=metrics]").click()
            viewer.locator("#metric-content:visible").wait_for()
            check(viewer.locator("#metrics-tab").get_attribute("aria-selected") == "true",
                  f"{width}px: metric entry opens the requested view")
            check(viewer.locator("[data-case]").count() == 2,
                  f"{width}px: two static metric cases available inside dialog")
            viewer.locator(".skip-link").focus()
            viewer.locator(".skip-link").press("Enter")
            check(viewer.locator("#metrics-tab").get_attribute("aria-selected") == "true",
                  f"{width}px: skip link preserves the selected view")
            check(not viewer.locator("html").evaluate("e=>e.scrollWidth>innerWidth"),
                  f"{width}px: embedded content has no horizontal page overflow")
            landing.screenshot(path=str(args.output / f"dialog-metrics-{width}.png"))
            landing.locator("#explorer-dialog .dialog-close").click()
            landing.locator("[data-explorer-view=examples]").click()
            viewer.locator("#examples-panel:visible").wait_for()
            check(viewer.locator("html").evaluate("()=>scrollY===0"),
                  f"{width}px: reopening resets the viewer scroll position")
            landing.locator("#explorer-dialog .dialog-close").click()
            landing.close()

        legacy = context.new_page()
        legacy.goto(urljoin(base, "explorer.html"), wait_until="networkidle")
        check(legacy.url.endswith("index.html#explorer"), "Old Explorer link returns to the integrated chapter")
        legacy.close()
        check(not report["errors"], "No JavaScript errors")
        check(not report["unexpected_requests"], "All browser requests are static GETs within the website")
        browser.close()
    (args.output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"{len(report['checks'])} Explorer checks passed")


if __name__ == "__main__":
    main()
