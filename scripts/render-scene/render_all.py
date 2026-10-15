import asyncio, base64, json, os, subprocess, sys
from playwright.async_api import async_playwright
OUT='/home/claude/render/build'; os.makedirs(OUT+'/video', exist_ok=True); os.makedirs(OUT+'/scene', exist_ok=True)
FPS=24
async def launch(p, w, h):
    b = await p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-gl=angle'])
    pg = await b.new_page(viewport={'width':w,'height':h})
    pg.on('pageerror', lambda e: print('pageerror:', str(e)[:300]))
    await pg.goto(f'http://127.0.0.1:8777/porch.html?w={w}&h={h}')
    await pg.wait_for_function('window.ready===true', timeout=120000)
    return b, pg
async def save(pg, st, path, seed=1):
    r = await pg.evaluate('([s,k])=>window.shot(s,k)', [st, seed])
    open(path,'wb').write(base64.b64decode(r['url'].split(',')[1])); return r['box']
async def main():
    async with async_playwright() as p:
        # test video frames (1280x720)
        b, pg = await launch(p, 1280, 720)
        segs=[]  # (name, duration or frames)
        def still(name, st, dur): 
            return ('still', name, st, dur)
        plan=[('still','rest0',{'parcel':'rest'},8.0),
              ('anim','to_moved','to-moved',.9),('still','moved',{'parcel':'moved'},7.1),
              ('anim','from_moved','from-moved',.9),('still','rest1',{'parcel':'rest'},7.1),
              ('anim','to_out','to-out',.9),('still','absent',{'parcel':'absent'},4.1),
              ('anim','from_out','from-out',.9),('still','rest2',{'parcel':'rest'},5.1)]
        lines=[]
        for kind, name, st, dur in plan:
            if kind=='still':
                path=f'{OUT}/video/{name}.jpg'; await save(pg, st, path); lines.append(f"file '{path}'\nduration {dur}")
            else:
                n=int(round(dur*FPS))
                for i in range(n):
                    t=(i+.5)/n; path=f'{OUT}/video/{name}_{i:03d}.jpg'; await save(pg, {'parcel':st,'t':t}, path); lines.append(f"file '{path}'\nduration {1/FPS:.6f}")
        lines.append(lines[-1].split('\n')[0])
        open(f'{OUT}/video/concat.txt','w').write('\n'.join(lines))
        await b.close()
asyncio.run(main())
