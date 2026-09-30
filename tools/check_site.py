#!/usr/bin/env python3
"""Check the scrolling layout, real assets, and paper interactions."""
import argparse
import json
from pathlib import Path
from urllib.parse import urljoin, urlparse

from playwright.sync_api import sync_playwright

SITE = Path(__file__).resolve().parents[1]
SCREENS = ['paper-cover', 'overview', 'workflow', 'benchmark', 'benchmark-results', 'plugin', 'plugin-method', 'world', 'explorer', 'citation']
NAV_SECTIONS = ['overview', 'workflow', 'benchmark', 'plugin', 'world', 'explorer', 'citation']
PARENT_SECTIONS = {'benchmark-results': 'benchmark', 'plugin-method': 'plugin'}
VIEWPORTS = [(1440, 900), (1440, 1100), (1280, 800), (1280, 720),
             (1024, 768), (1920, 1080), (390, 844), (320, 740), (375, 667)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', required=True, help='Base URL of the website to verify')
    parser.add_argument('--chromium')
    parser.add_argument('--output', type=Path, default=SITE / 'test-results')
    args = parser.parse_args()
    args.url = args.url.rstrip('/') + '/'
    args.output.mkdir(parents=True, exist_ok=True)
    report = {'checks': [], 'layouts': [], 'consoleErrors': [], 'failedLocalRequests': []}

    def check(condition, message):
        if not condition:
            raise AssertionError(message)
        report['checks'].append(message)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=args.chromium,
                                   args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 1440, 'height': 900},
                                      reduced_motion='reduce',
                                      permissions=['clipboard-read', 'clipboard-write'])
        page = context.new_page()
        page.on('pageerror', lambda e: report['consoleErrors'].append(str(e)))
        page.on('response', lambda r: report['failedLocalRequests'].append(r.url)
                if r.status >= 400 and r.url.startswith(args.url) else None)
        page.goto(args.url, wait_until='networkidle')
        page.evaluate('document.fonts.ready')
        page.locator('img[loading=lazy]').evaluate_all("imgs=>imgs.forEach(i=>i.loading='eager')")
        page.wait_for_function("""() => [...document.querySelectorAll('main img')]
          .every(i => i.complete && i.naturalWidth > 0)""")

        def settle():
            page.evaluate('() => new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')

        def scroll_to(screen):
            page.locator('#' + screen).evaluate('e=>e.scrollIntoView()')
            settle()

        check(page.locator('main > .screen').evaluate_all('els=>els.map(e=>e.id)') == SCREENS,
              'One document, with benchmark and plugin each split across two consecutive screens')
        check(page.locator('h1').count() == 1 and page.locator('main h2').count() == len(SCREENS) - 1,
              'One paper title and nine screen headings')
        check(page.locator('[data-section-link]').evaluate_all('els=>els.map(e=>e.hash)')
              == ['#' + s for s in NAV_SECTIONS], 'Navigation uses one in-page anchor per chapter')
        check('Explore results' not in page.locator('body').inner_text(), 'No Explore results action')
        check(page.locator('.resource-links > *').all_text_contents() == ['Paper ↗', 'Code · Coming soon', 'BibTeX ↓'],
              'Cover has only the requested three resource actions')
        check(page.locator('.paper-header img').count() == 0, 'No figure on the cover')
        check(page.locator('body').evaluate('e=>getComputedStyle(e).backgroundColor')
              == 'rgb(255, 255, 255)', 'White background')
        style = page.locator('h1').evaluate("e=>({font:getComputedStyle(e).fontFamily,size:getComputedStyle(e).fontSize})")
        check('Libre Baskerville' in style['font'] and style['size'] == '40px',
              'Reference title typography preserved')
        ids = page.locator('[id]').evaluate_all('els=>els.map(e=>e.id)')
        check(len(ids) == len(set(ids)), 'Unique IDs after combining the pages')

        for width, height in VIEWPORTS:
            page.set_viewport_size({'width': width, 'height': height})
            settle()
            scroll_to('paper-cover')
            layout = page.evaluate("""() => {
              const nav=document.querySelector('.site-header').offsetHeight;
              return {width:innerWidth,height:innerHeight,nav,total:document.documentElement.scrollHeight,
                overflow:document.documentElement.scrollWidth>innerWidth,
                sections:[...document.querySelectorAll('.screen')].map(s=>{
                  const box=s.getBoundingClientRect(), content=s.querySelector('.screen-content').getBoundingClientRect();
                  const escaped=[...s.querySelectorAll('*')].filter(e=>{
                    if(e.classList.contains('sr-only') || !e.getClientRects().length) return false;
                    const r=e.getBoundingClientRect();
                    return r.top<box.top-.5 || r.bottom>box.bottom+.5 || r.left<box.left-.5 || r.right>box.right+.5;
                  }).map(e=>e.id||e.className);
                  return {id:s.id,height:box.height,contentHeight:content.height,escaped,
                    center:content.x+content.width/2,words:s.innerText.split(/\\s+/).length};
                })};
            }""")
            report['layouts'].append(layout)
            expected = height - layout['nav']
            check(not layout['overflow'], f'{width}×{height}: no horizontal page overflow')
            for screen in layout['sections']:
                if width <= 640 and screen['id'] == 'benchmark':
                    check(expected - 1 <= screen['height'] <= expected * 1.25 and not screen['escaped'],
                          f"{width}×{height}: detailed benchmark stays readable without clipping")
                else:
                    check(abs(screen['height'] - expected) < 1 and not screen['escaped'],
                          f"{width}×{height}: {screen['id']} fits one screen without clipping")
                if width > 900:
                    check(abs(screen['center'] - width * 2 / 3) < 1,
                          f"{width}×{height}: {screen['id']} centered in the right two-thirds")
                if screen['id'] != 'paper-cover':
                    check(screen['words'] < (160 if screen['id'].startswith('benchmark') else 100), f"{width}×{height}: {screen['id']} has concise content")
            check(abs(layout['total'] - (layout['nav'] + sum(s['height'] for s in layout['sections']))) < 1,
                  f'{width}×{height}: ten sections including citation, with no extra footer')
            hero = page.locator('.hero-content').bounding_box()
            check(abs(hero['y'] + hero['height']/2 - (height + layout['nav'])/2) < 1,
                  f'{width}×{height}: cover vertically centered')
            if (width, height) in [(1440, 900), (390, 844), (320, 740)]:
                for screen in SCREENS:
                    scroll_to(screen)
                    page.screenshot(path=str(args.output/f'{screen}-{width}.png'))

        page.set_viewport_size({'width': 1440, 'height': 900})
        settle()
        for screen in SCREENS[1:]:
            if screen in PARENT_SECTIONS:
                scroll_to(screen)
            else:
                page.locator(f'[data-section-link][href="#{screen}"]').click()
            settle()
            check(urlparse(page.url).path == urlparse(args.url).path,
                  f'{screen}: navigation stays in the same document')
            check(page.locator(f'#{screen}').bounding_box()['y'] == 76,
                  f'{screen}: anchor aligns below the fixed navigation')
            nav_section = PARENT_SECTIONS.get(screen, screen)
            check(page.locator(f'[href="#{nav_section}"][data-section-link]').get_attribute('aria-current')
                  == 'location', f'{screen}: active navigation follows the current screen')
        scroll_to('paper-cover')
        page.mouse.wheel(0, 824)
        page.wait_for_function("document.querySelector('#overview').getBoundingClientRect().top < 100")
        settle()
        check(page.locator('[href="#overview"][data-section-link]').get_attribute('aria-current') == 'location',
              'Mouse wheel scroll reaches the next screen and updates navigation')

        # The cover's BibTeX link reaches the final full-screen citation.
        scroll_to('paper-cover')
        page.locator('.resource-links [href="#citation"]').click()
        settle()
        check(abs(page.locator('#citation').bounding_box()['y'] - 76) < 1,
              'BibTeX scrolls to the dedicated citation screen')
        page.locator('#copy-citation').click()
        page.wait_for_function("document.querySelector('#copy-status').textContent.includes('copied')")
        copied = page.evaluate('navigator.clipboard.readText()')
        check(copied == page.locator('#bibtex').inner_text()
              and '@misc{li2026legoanythingcodingagents3d,' in copied and 'Mingwen Dong' in copied
              and 'eprint = {2609.36380}' in copied and 'archivePrefix = {arXiv}' in copied
              and 'primaryClass = {cs.CV}' in copied and 'url = {https://arxiv.org/abs/2609.36380}' in copied,
              'Citation copies the correct paper and authors')
        check(page.locator('[href="#citation"][data-section-link]').get_attribute('aria-current') == 'location',
              'Citation navigation highlights its screen')
        check(page.locator('dialog[open]').count() == 0,
              'Citation stays in the scrolling document')
        scroll_to('overview')
        page.locator('#overview [data-zoom]').click()
        check(page.locator('#figure-dialog').is_visible(), 'Framework figure enlarges')
        page.keyboard.press('Escape')
        page.locator('[href="#workflow"][data-section-link]').click()
        settle()
        check(page.locator('[href="#workflow"][data-section-link]').get_attribute('aria-current') == 'location',
              'LEGO-Anything navigation reaches the separate agent workflow screen')
        before = page.evaluate('scrollY')
        page.locator('#workflow [data-zoom]').click()
        check(page.locator('#figure-dialog').is_visible()
              and page.locator('#dialog-image').get_attribute('src') == 'assets/image_workflow.webp',
              'Agent workflow opens the manuscript figure at full resolution')
        page.keyboard.press('Escape')
        check(page.evaluate('scrollY') == before
              and page.locator('#workflow [data-zoom]').evaluate('e=>document.activeElement===e'),
              'Closing the workflow figure restores reading position and keyboard focus')

        scroll_to('benchmark')
        check(page.locator('#benchmark h3').all_text_contents() == ['Dataset', 'Evaluation']
              and page.locator('#benchmark [data-open-dialog="findings-dialog"]').count() == 0,
              'First benchmark screen contains Dataset and Evaluation only')
        page.locator('#benchmark [data-zoom]').click()
        check(page.locator('#figure-dialog').is_visible()
              and page.locator('#dialog-image').get_attribute('src') == 'assets/image_data_engine.webp'
              and 'Fab assets are mined' in page.locator('#dialog-caption').inner_text(),
              'Construction pipeline enlarges with the manuscript caption')
        page.keyboard.press('Escape')
        scroll_to('benchmark-results')
        expected_data = json.loads((SITE/'assets/results.json').read_text())
        for model in expected_data['models']:
            if model['group'] != 'Coding agents':
                continue
            row = page.locator('.benchmark-overview-table tbody tr').filter(
                has=page.locator('th', has_text=model['name']))
            check(row.locator('.mean').all_text_contents() ==
                  [f'{model[split]["overall"]["mean"]:.1f}' for split in ('indoor', 'outdoor')]
                  and [s.strip() for s in row.locator('.std').all_text_contents()] ==
                  [f'± {model[split]["overall"]["std"]:.1f}' for split in ('indoor', 'outdoor')],
                  f'Summary: {model["name"]} indoor/outdoor scores and uncertainty match the paper')
        before = page.evaluate('scrollY')
        findings_button = page.locator('[data-open-dialog="findings-dialog"]')
        check(' '.join(findings_button.inner_text().split()) == 'See full findings ↗', 'Benchmark opens See full findings')
        findings_button.click()
        check(page.locator('#findings-dialog').get_attribute('data-finding') == '1'
              and page.locator('#finding-prev').get_attribute('aria-disabled') == 'true',
              'Findings dialog opens on page one with the previous boundary disabled')
        check(page.locator('#results-body tr').count() == 6, 'Detailed results open with six coding agents')
        page.locator('#baseline-toggle').click()
        for split in ('indoor', 'outdoor'):
            page.locator(f'[data-split="{split}"]').click()
            for model in expected_data['models']:
                row = page.locator('#results-body tr:not(.group-row)').filter(
                    has=page.locator('th', has_text=model['name']))
                if model[split]:
                    expected = [f'{model[split][key]["mean"]:.1f}' for key in
                                ('validity', 'reconstruction', 'appearance', 'overall')]
                    check(row.locator('.mean').all_text_contents() == expected,
                          f'{split}: {model["name"]} matches the paper')
                else:
                    check(row.locator('td').all_text_contents() == ['—']*4,
                          f'{split}: {model["name"]} marked unsupported')
        dialog_height = page.locator('#findings-dialog').bounding_box()['height']
        page.locator('#finding-next').click()
        check(page.locator('#finding-2').is_visible() and page.locator('.finding-panel:visible').count() == 1
              and page.locator('.complexity-table tbody tr').count() == 3,
              'Right arrow switches to Findings 2 and its complexity evidence')
        check(page.locator('.complexity-table tbody .mean').all_text_contents() ==
              ['23.3', '30.4', '18.4', '25.3', '19.7', '27.9', '14.2', '22.8', '18.8', '27.4', '12.7', '22.4'],
              'Complexity table matches the manuscript')
        check(page.locator('.findings-viewport').evaluate('e=>e.scrollTop') == 0,
              'Switching findings resets the panel reading position')
        page.keyboard.press('ArrowRight')
        page.locator('#finding-3 img').evaluate('i=>i.decode()')
        check(page.locator('#finding-3').is_visible()
              and page.locator('#finding-next').get_attribute('aria-disabled') == 'true',
              'Right keyboard arrow reaches Findings 3 and its last-page boundary')
        check(page.locator('#findings-dialog').bounding_box()['height'] == dialog_height,
              'Dialog stays the same size when findings change')
        page.locator('#finding-next').click(force=True)
        check(page.locator('#finding-3').is_visible(), 'Next at the last finding does not wrap')
        page.locator('#finding-3 [data-zoom]').click()
        check(page.locator('#figure-dialog').is_visible()
              and page.locator('#dialog-image').get_attribute('src') == 'assets/image_reasoning_efforts.webp',
              'Reasoning chart opens at full resolution above the findings dialog')
        page.keyboard.press('Escape')
        check(page.locator('#findings-dialog').is_visible() and page.locator('#finding-3').is_visible()
              and page.locator('body').evaluate('e=>e.classList.contains("dialog-open")'),
              'Closing the enlarged chart returns to Findings 3 and keeps the page locked')
        page.locator('#finding-tab-3').focus()
        page.keyboard.press('ArrowLeft')
        check(page.locator('#finding-tab-2').get_attribute('aria-selected') == 'true'
              and page.locator('#finding-tab-2').evaluate('e=>e===document.activeElement'),
              'Finding tabs support left-arrow keyboard navigation and focus')
        page.keyboard.press('Home')
        check(page.locator('#finding-1').is_visible(), 'Home on the tabs returns to Findings 1')
        page.keyboard.press('End')
        check(page.locator('#finding-3').is_visible(), 'End on the tabs reaches Findings 3')
        page.keyboard.press('Escape')
        check(page.evaluate('scrollY') == before and findings_button.evaluate('e=>e===document.activeElement'),
              'Closing findings preserves benchmark reading position and restores focus')
        findings_button.click()
        check(page.locator('#finding-1').is_visible(), 'Reopening findings starts from Findings 1')
        page.keyboard.press('Escape')
        scroll_to('plugin')
        check(page.locator('#plugin h3').all_text_contents() == ['Trajectory analysis']
              and page.locator('#plugin [data-plugin]').count() == 0,
              'First plugin screen is dedicated to trajectory analysis')
        page.locator('#plugin [data-zoom]').click()
        check(page.locator('#figure-dialog').is_visible()
              and page.locator('#dialog-image').get_attribute('src') == 'assets/image_trajectory.png'
              and 'protection against regressive edits' in page.locator('#dialog-caption').inner_text(),
              'Trajectory graph enlarges with the manuscript caption')
        page.keyboard.press('Escape')
        scroll_to('plugin-method')
        check(page.locator('[href="#plugin"][data-section-link]').get_attribute('aria-current') == 'location',
              'Plugin navigation stays active on its second screen')
        check(page.locator('#plugin-method .plugin-gains dd').all_text_contents()
              == ['+62.7%', '+55.8%', '+55.3%', '+27.5%', '+12.1%', '+2.1%']
              and page.locator('#plugin-method .plugin-comparison').count() == 0,
              'Plugin screen presents the paper’s numerical gains with examples in a dialog')
        before = page.evaluate('scrollY')
        examples_button = page.locator('[data-open-dialog="plugin-examples-dialog"]')
        examples_button.click()
        check(page.locator('#plugin-examples-dialog').is_visible(),
              'View examples opens the plugin comparison dialog')
        page.locator('[data-plugin="copy-room"]').click()
        check(page.locator('#plugin-output-score').inner_text() == '27.8', 'Plugin switches example and score')
        page.locator('#plugin-output').click()
        check('copy_room_l3_plugin.webp' in page.locator('#dialog-image').get_attribute('src'),
              'Plugin zoom shows the currently selected image')
        page.keyboard.press('Escape')
        check(page.locator('#plugin-examples-dialog').is_visible()
              and page.locator('[data-plugin="copy-room"]').get_attribute('aria-pressed') == 'true',
              'Closing an enlarged example returns to the selected scene in the dialog')
        page.keyboard.press('Escape')
        check(page.evaluate('scrollY') == before and examples_button.evaluate('e=>e===document.activeElement'),
              'Closing plugin examples preserves page position and returns focus')

        page.set_viewport_size({'width': 390, 'height': 844})
        settle()
        scroll_to('paper-cover')
        page.locator('.menu-toggle').click()
        check(page.locator('#nav-links').is_visible(), 'Mobile navigation opens')
        page.locator('[href="#benchmark"][data-section-link]').click()
        settle()
        check(page.locator('.menu-toggle').get_attribute('aria-expanded') == 'false'
              and page.locator('#benchmark').bounding_box()['y'] == 63,
              'Mobile navigation scrolls within the document and closes the menu')
        scroll_to('benchmark-results')
        check(page.locator('[href="#benchmark"][data-section-link]').get_attribute('aria-current') == 'location',
              'Benchmark navigation stays active on its second mobile screen')
        page.locator('[data-open-dialog="findings-dialog"]').click()
        check(page.locator('#findings-dialog').bounding_box()['height'] <= 804,
              'Findings fit inside the mobile viewport')
        page.locator('.findings-viewport').evaluate('e=>e.scrollTop=e.scrollHeight')
        controls = page.locator('.findings-controls').bounding_box()
        check(controls['y'] >= 0 and controls['y'] + controls['height'] <= 844,
              'Left/right controls remain visible while mobile findings scroll')
        page.locator('#finding-next').click()
        check(page.locator('#finding-2').is_visible(), 'Mobile next button switches findings')
        page.locator('#finding-prev').click()
        check(page.locator('#finding-1').is_visible(), 'Mobile previous button switches back')
        page.keyboard.press('Escape')

        # Check all referenced local resources and supplemental figure targets.
        refs = page.locator('[href], img[src], script[src], [data-zoom]').evaluate_all(
            "els=>els.map(e=>e.getAttribute('href')||e.getAttribute('src')||e.dataset.zoom)")
        for ref in sorted(set(refs)):
            resolved = urljoin(args.url, ref)
            if ref.startswith('#') or urlparse(resolved).netloc != urlparse(args.url).netloc:
                continue
            response = context.request.get(resolved)
            check(response.ok, f'Local resource loads: {ref}')
            if ref.endswith('paper.pdf'):
                check(response.body().startswith(b'%PDF-'), 'Paper download is a valid PDF')
        for old, target in [('overview.html', 'overview'), ('lego-bench.html', 'benchmark'),
                            ('lego-plugin.html', 'plugin'), ('lego-world.html', 'world')]:
            page.goto(urljoin(args.url, old), wait_until='networkidle')
            page.wait_for_url(urljoin(args.url, 'index.html#' + target))
            check(True, f'{old}: old link redirects into the scrolling website')
        check(not report['consoleErrors'], 'No JavaScript errors')
        check(not report['failedLocalRequests'], 'No failed local resource requests')
        browser.close()
    (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    print(f"PASS: {len(report['checks'])} checks. Screenshots: {args.output}")


if __name__ == '__main__':
    main()
