#!/usr/bin/env python3
"""Check the desktop WebGL scene, scroll coupling, and graceful fallbacks."""
import argparse
from io import BytesIO
import json
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

SITE = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', required=True, help='Base URL of the website to verify')
    parser.add_argument('--chromium')
    parser.add_argument('--output', type=Path, default=SITE/'test-results/architecture')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    checks, errors = [], []

    def check(condition, label):
        if not condition:
            raise AssertionError(label)
        checks.append(label)

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=args.chromium,
                                   args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 1440, 'height': 900})
        page = context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
        page.add_init_script("""window.architectureDrawCalls = 0;
          for (const name of ['drawElements', 'drawElementsInstanced', 'drawArrays', 'drawArraysInstanced']) {
            const original = WebGL2RenderingContext.prototype[name];
            WebGL2RenderingContext.prototype[name] = function(...args) {
              window.architectureDrawCalls++; return original.apply(this, args);
            };
          }""")
        page.goto(args.url, wait_until='networkidle')
        host = page.locator('#architecture-scene')
        page.wait_for_function("document.querySelector('#architecture-scene').dataset.renderer==='webgl'")
        page.wait_for_timeout(800)
        check(host.locator('canvas').count() == 1, 'One WebGL canvas renders the architectural model')
        box = host.bounding_box()
        check(box['x'] == 0 and abs(box['width'] - 480) < 1 and box['y'] == 76,
              'Scene occupies the fixed left third, below the navigation')
        check(host.get_attribute('aria-hidden') == 'true'
              and host.evaluate('e=>getComputedStyle(e).pointerEvents') == 'none',
              'Decorative scene leaves scrolling and reading focus to the page')
        check(page.evaluate('architectureDrawCalls') > 0, 'GPU draw calls confirm actual 3D rendering')
        check(host.get_attribute('data-model') == 'eiffel', 'Cover displays the Eiffel Tower')
        page.screenshot(path=str(args.output/'cover.png'))
        initial = float(host.get_attribute('data-angle'))
        angles = [initial]
        models = {'overview': 'opera', 'workflow': 'pisa', 'benchmark': 'colosseum',
                  'benchmark-results': 'colosseum', 'plugin': 'acropolis',
                  'plugin-method': 'acropolis', 'world': 'skyscraper', 'citation': 'westminster'}
        for chapter_index, (section, model) in enumerate(models.items(), start=1):
            if section in ('benchmark-results', 'plugin-method'):
                page.locator('#'+section).evaluate('e=>e.scrollIntoView()')
            else:
                page.locator(f'[data-section-link][href="#{section}"]').click()
            page.wait_for_function("s=>Math.abs(document.querySelector('#'+s).getBoundingClientRect().top-76)<1", arg=section)
            page.wait_for_function("""index => {
              const e=document.querySelector('#architecture-scene');
              const target=-.2 + index*Math.PI*.4;
              return Math.abs(parseFloat(e.dataset.angle)-target)<.001;
            }""", arg=chapter_index)
            page.wait_for_timeout(500)
            angle = float(host.get_attribute('data-angle'))
            check(angle > angles[-1] + 1, f'{section}: scrolling rotates the model forward')
            check(host.get_attribute('data-model') == model, f'{section}: displays the correct chapter landmark')
            image = Image.open(BytesIO(host.screenshot())).convert('RGB')
            channels = image.tobytes()
            pixels = list(zip(channels[0::3], channels[1::3], channels[2::3]))
            check(max(max(pixel) - min(pixel) for pixel in pixels) <= 3,
                  f'{section}: rendered landmark is neutral gray with no green tint')
            check(sum(min(pixel) < 230 for pixel in pixels) > 1500,
                  f'{section}: landmark is visible in the rendered image')
            angles.append(angle)
            page.screenshot(path=str(args.output/f'{section}.png'))
        check(abs(angles[-1] - initial - 3.2 * 3.14159265) < .003,
              'Full document scroll corresponds to 576 degrees of rotation')
        page.wait_for_timeout(600)
        draws = page.evaluate('architectureDrawCalls')
        page.wait_for_timeout(350)
        check(page.evaluate('architectureDrawCalls') == draws, 'Rendering stops when the rotation settles')
        page.locator('[data-section-link][href="#overview"]').click()
        page.wait_for_function("parseFloat(document.querySelector('#architecture-scene').dataset.angle)<1.06")
        check(True, 'Scrolling upward reverses the rotation')
        page.goto(args.url.rstrip('/')+'/#plugin', wait_until='networkidle')
        page.wait_for_function("document.querySelector('#architecture-scene').dataset.renderer==='webgl'")
        page.wait_for_function("""() => {
          const angle=parseFloat(document.querySelector('#architecture-scene').dataset.angle);
          return Math.abs(document.querySelector('#plugin').getBoundingClientRect().top-76)<1
            && Math.abs(angle-6.0832)<.001;
        }""")
        check(abs(float(host.get_attribute('data-angle')) - 6.0832) < .01,
              'Opening a chapter directly starts at its corresponding orientation')
        page.emulate_media(reduced_motion='reduce')
        page.wait_for_timeout(150)
        check(abs(float(host.get_attribute('data-angle')) - initial) < .001,
              'Reduced-motion preference displays a fixed orientation')
        page.locator('#world').evaluate('e=>e.scrollIntoView()')
        page.wait_for_timeout(150)
        check(abs(float(host.get_attribute('data-angle')) - initial) < .001,
              'Reduced-motion orientation stays fixed while scrolling')
        page.wait_for_function("document.querySelector('#architecture-scene').dataset.model==='skyscraper'")
        check(True, 'Reduced motion still changes the building with the chapter')

        page.emulate_media(reduced_motion='no-preference')
        page.evaluate("document.documentElement.style.scrollSnapType='none'; scrollTo({top:1236,behavior:'instant'})")
        page.wait_for_function("""() => {
          const e=document.querySelector('#architecture-scene');
          return Math.abs(parseFloat(e.dataset.position)-1.5)<.001
            && parseFloat(e.dataset.blend)>.45 && parseFloat(e.dataset.blend)<.55;
        }""")
        page.screenshot(path=str(args.output/'transition.png'))
        check(True, 'Adjacent landmarks crossfade while their rotation continues')
        for start, end, position, model in [
            ('benchmark', 'benchmark-results', 3.5, 'colosseum'),
            ('plugin', 'plugin-method', 5.5, 'acropolis'),
        ]:
            page.evaluate("""([start,end]) => {
              const a=document.querySelector('#'+start).offsetTop;
              const b=document.querySelector('#'+end).offsetTop;
              scrollTo({top:(a+b)/2-76,behavior:'instant'});
            }""", [start, end])
            page.wait_for_function("""([position,model]) => {
              const e=document.querySelector('#architecture-scene');
              return Math.abs(parseFloat(e.dataset.position)-position)<.001 && e.dataset.model===model;
            }""", arg=[position, model])
            check(float(host.get_attribute('data-blend')) == 0,
                  f'{start}: both screens share a continuously rotating landmark without a model crossfade')
        page.emulate_media(reduced_motion='reduce')
        page.locator('#overview').evaluate('e=>e.scrollIntoView()')
        page.wait_for_function("document.querySelector('#architecture-scene').dataset.model==='opera'")

        # Simulate real context loss to verify the static fallback and recovery.
        page.evaluate("""() => { const canvas=document.querySelector('.architecture-canvas');
          window.loseContext=canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
          window.loseContext.loseContext(); }""")
        page.wait_for_function("document.querySelector('#architecture-scene').dataset.renderer==='poster'")
        page.wait_for_timeout(100)
        check(host.locator('img').evaluate('e=>e.complete && e.naturalWidth>0')
              and not host.evaluate("e=>e.classList.contains('is-ready')"),
              'A generated static rendering replaces a lost WebGL context')
        check(host.locator('img').get_attribute('src').endswith('architecture-opera.webp'),
              'Context loss preserves the current chapter landmark in its fallback')
        page.evaluate('window.loseContext.restoreContext()')
        page.wait_for_function("document.querySelector('#architecture-scene').dataset.renderer==='webgl'")
        check(True, 'WebGL scene resumes after context restoration')

        mobile = browser.new_context(viewport={'width': 390, 'height': 844})
        mobile_page = mobile.new_page()
        requested = []
        mobile_page.on('request', lambda r: requested.append(r.url))
        mobile_page.goto(args.url, wait_until='networkidle')
        check(not mobile_page.locator('#architecture-scene').is_visible(), 'Mobile keeps its full-width paper layout')
        check(not any('/vendor/three/' in url or 'architecture-model.js' in url for url in requested),
              'Mobile does not download Three.js or the model module')
        mobile_page.set_viewport_size({'width': 1280, 'height': 800})
        mobile_page.wait_for_function("document.querySelector('#architecture-scene').dataset.renderer==='webgl'")
        check(True, 'Growing a mobile viewport initializes the desktop scene')
        mobile_page.set_viewport_size({'width': 390, 'height': 844})
        mobile_page.wait_for_timeout(100)
        check(not mobile_page.locator('#architecture-scene').is_visible(), 'Returning to mobile hides and pauses the scene')
        mobile.close()

        fallback = browser.new_context(viewport={'width': 1440, 'height': 900})
        fallback.add_init_script("""const original=HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext=function(kind,...args){
            return kind==='webgl2'||kind==='webgl' ? null : original.call(this,kind,...args);
          };""")
        fallback_page = fallback.new_page()
        fallback_page.goto(args.url, wait_until='networkidle')
        fallback_page.wait_for_function("document.querySelector('#architecture-scene').dataset.renderer==='poster'")
        check(fallback_page.locator('.architecture-poster').evaluate('e=>e.complete && e.naturalWidth>0'),
              'Browsers without WebGL receive a valid static architectural rendering')
        fallback_page.emulate_media(reduced_motion='reduce')
        fallback_page.locator('#overview').evaluate('e=>e.scrollIntoView()')
        fallback_page.wait_for_function("document.querySelector('.architecture-poster').src.endsWith('architecture-opera.webp')")
        check(True, 'Static fallback also changes landmarks as the reader scrolls')
        fallback_page.locator('#paper-cover').evaluate('e=>e.scrollIntoView()')
        fallback_page.locator('.resource-links [href="#citation"]').click()
        fallback_page.wait_for_function("document.querySelector('.architecture-poster').src.endsWith('architecture-westminster.webp')")
        check(abs(fallback_page.locator('#citation').bounding_box()['y'] - 76) < 1
              and fallback_page.locator('.architecture-poster').evaluate('e=>e.complete && e.naturalWidth>0'),
              'Citation remains accessible with the Westminster fallback when WebGL is unavailable')
        fallback_page.screenshot(path=str(args.output/'fallback.png'))
        fallback.close()
        check(not errors, 'No unhandled JavaScript errors')
        browser.close()
    (args.output/'report.json').write_text(json.dumps({'checks': checks, 'angles': angles, 'errors': errors}, indent=2)+'\n')
    print(f'PASS: {len(checks)} architecture checks. Screenshots: {args.output}')


if __name__ == '__main__':
    main()
