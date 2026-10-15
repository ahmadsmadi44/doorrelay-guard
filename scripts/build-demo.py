"""Assemble actual in-app review exports and narrated explanatory cards with FFmpeg.

Inputs live in artifacts/ and are intentionally excluded from the source release.
Requires Python Pillow, FFmpeg, and the local captures documented in DEMO-SCRIPT.md.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import subprocess, json

root = Path(__file__).resolve().parent.parent
work = root / 'artifacts' / 'demo'
work.mkdir(parents=True, exist_ok=True)
font_dir = Path('C:/Windows/Fonts')
def font(size, bold=False):
    return ImageFont.truetype(str(font_dir / ('segoeuib.ttf' if bold else 'segoeui.ttf')), size)
def card(name, eyebrow, title, lines, footer='DoorRelay Guard · Ring track · Amazon Developer Hackathon 2026'):
    im = Image.new('RGB', (1280,720), '#f4f6ef'); d = ImageDraw.Draw(im)
    d.rounded_rectangle((60,60,116,116), radius=15, fill='#245a47')
    d.text((77,68), 'D', font=font(34, True), fill='white')
    d.text((140,76), eyebrow, font=font(21,True), fill='#527366')
    d.text((60,170), title, font=font(54,True), fill='#183b31')
    y=280
    for line in lines:
        d.text((64,y), line, font=font(27), fill='#314b40'); y+=63
    d.line((60,635,1220,635), fill='#cdd9ca', width=2)
    d.text((60,660), footer, font=font(17), fill='#627469')
    p=work/(name+'.png'); im.save(p); return p

card('intro','FROM DELIVERY TO COLLECTION','DoorRelay Guard',[
    'Observe a parcel through Ring Playground.',
    'Give a shared household a clear pickup handoff.',
    'Use a paired speaker for one measured warning.',
    'A working laptop + phone prototype.'])
card('warning','APPLICATION AUDIO · REPLAY','A voice at the doorway.',[
    '“Please leave the package in the delivery area.”',
    'This is the bundled warning audio, replayed here.',
    'The preceding recording shows browser acknowledgment.',
    'Output comes from the paired browser, not the Ring doorbell.'])
card('architecture','HOW IT WORKS','Pixels → policy → playback',[
    'Ring API + WHEP → browser frame analysis',
    'Express state machine → pickup and incident decisions',
    'Paired audio → started / completed acknowledgments',
    '57 automated tests · local evidence · token in memory'])
card('limits','WHAT THIS DEMO ESTABLISHES','Working prototype. Clear limits.',[
    'Actual Ring playback and stable parcel observation.',
    'Generated video: movement → warning → return.',
    'Authorized collection without an extra warning.',
    'Foreground only. Physical-removal accuracy unvalidated.'])

segments = [
    ('intro',work/'intro.png',work/'intro.wav',13),
    ('ring',root/'artifacts/ring-review.webm',work/'ring.wav',20),
    ('flow',root/'artifacts/flow-review.webm',work/'flow.wav',31),
    ('warning',work/'warning.png',root/'public/audio/warning.mp3',5),
    ('pickup',root/'artifacts/pickup-review.webm',work/'pickup.wav',25),
    ('architecture',work/'architecture.png',work/'architecture.wav',23),
    ('limits',work/'limits.png',work/'limits.wav',18),
]
for name, visual, audio, duration in segments:
    cmd=['ffmpeg','-hide_banner','-loglevel','error','-y']
    if visual.suffix=='.png': cmd+=['-loop','1']
    cmd+=['-i',str(visual),'-i',str(audio),'-t',str(duration),'-map','0:v:0','-map','1:a:0',
          '-vf','fps=24,scale=1280:720,setsar=1','-af','apad',
          '-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p',
          '-c:a','aac','-ar','48000','-ac','2','-b:a','128k',str(work/(name+'.mp4'))]
    subprocess.run(cmd,check=True)
(work/'concat.txt').write_text(''.join(f"file '{name}.mp4'\n" for name,*_ in segments))
output=root/'artifacts/DoorRelay-Guard-Demo.mp4'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(work/'concat.txt'),'-c','copy','-movflags','+faststart',str(output)],check=True)
metadata=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration,size:stream=codec_name,width,height','-of','json',str(output)]))
assert float(metadata['format']['duration'])<180
(work/'video-validation.json').write_text(json.dumps(metadata,indent=2))
print(json.dumps(metadata,indent=2))
