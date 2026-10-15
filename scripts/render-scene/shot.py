import asyncio, base64, json, sys
from playwright.async_api import async_playwright
async def main():
    states = json.loads(sys.argv[1]); w=int(sys.argv[2]); h=int(sys.argv[3])
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-gl=angle'])
        pg = await b.new_page(viewport={'width':w,'height':h})
        pg.on('console', lambda m: print('console:', m.text[:200]))
        pg.on('pageerror', lambda e: print('pageerror:', str(e)[:400]))
        await pg.goto(f'http://127.0.0.1:8777/porch.html?w={w}&h={h}')
        await pg.wait_for_function('window.ready===true', timeout=120000)
        for name, st in states.items():
            r = await pg.evaluate('(s)=>window.shot(s,1)', st)
            open(f'/home/claude/render/out_{name}.jpg','wb').write(base64.b64decode(r['url'].split(',')[1]))
            print(name, json.dumps(r['box']))
        await b.close()
asyncio.run(main())
