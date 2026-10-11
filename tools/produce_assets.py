"""One-time asset authoring. Not used by the install or build scripts."""
import json, math, subprocess, pathlib, colorsys
ROOT=pathlib.Path('public/assets'); TMP=pathlib.Path('/tmp/facet'); TMP.mkdir(exist_ok=True)
def run(tool,*args):
 subprocess.run([tool,*map(str,args)],check=True,stdout=subprocess.DEVNULL)
def emit(ops,out,w=64,h=64,sheet=False):
 p=TMP/'pixels.json';p.write_text(json.dumps(ops));out=ROOT/out;out.parent.mkdir(parents=True,exist_ok=True)
 run('draw-sheet' if sheet else 'draw','render','--actions',p,'--out',out,'--width',w,'--height',h,'--no-layers')
def line(a,b,c):return dict(op='line',x0=round(a[0]),y0=round(a[1]),x1=round(b[0]),y1=round(b[1]),color=c)
def poly(points,c):
 ops=[]
 for y in range(math.ceil(min(p[1] for p in points)),math.floor(max(p[1] for p in points))+1):
  xs=[]
  for a,b in zip(points,points[1:]+points[:1]):
   if min(a[1],b[1])<=y<max(a[1],b[1]):xs.append(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]))
  if len(xs)>1:ops.append(line((math.ceil(min(xs)),y),(math.floor(max(xs)),y),c))
 return ops
def color(h,l,s=.7):
 return '#'+''.join(f'{round(x*255):02x}' for x in colorsys.hls_to_rgb(h,l,s))
names=['ruby','amber','citrine','jade','beryl','sapphire','amethyst','prism'];hues=[.96,.075,.14,.39,.49,.62,.76,0]
shapes=[[(32,4),(53,18),(53,43),(32,60),(11,43),(11,18)],[(18,8),(46,8),(58,27),(49,50),(32,59),(15,50),(6,27)],[(32,3),(59,32),(32,61),(5,32)],[(18,7),(46,7),(54,16),(54,48),(46,57),(18,57),(10,48),(10,16)],[(32,4),(51,14),(60,32),(51,50),(32,60),(13,50),(4,32),(13,14)],[(20,9),(44,9),(58,24),(50,49),(32,59),(14,49),(6,24)],[(32,4),(57,47),(44,57),(20,57),(7,47)],[(32,3),(57,18),(57,46),(32,61),(7,46),(7,18)]]
def gem(k,strain=0,turn=0):
 pts=shapes[k];cx,cy=32,31;ops=[]
 if turn:pts=[(32+(x-32)*(.7+.3*abs(math.cos(turn))),y) for x,y in pts]
 for i,(a,b) in enumerate(zip(pts,pts[1:]+pts[:1])):
  hu=hues[k] if k<7 else i/len(pts)+turn*.12
  ops+=poly([a,b,(cx,cy)],color(hu,.32+.055*(i%5)))
 inner=[(cx+(x-cx)*.53,cy+(y-cy)*.53) for x,y in pts]
 for i,(a,b) in enumerate(zip(inner,inner[1:]+inner[:1])):ops+=poly([a,b,(cx-5,cy-6)],color(hues[k] if k<7 else i/len(pts),.59+.055*(i%4)))
 for a,b in zip(pts,pts[1:]+pts[:1]):ops.append(line(a,b,color(hues[k],.78,.45) if k<7 else '#dcebf2'))
 for a,b in zip(pts,inner):ops.append(line(a,b,color(hues[k],.82,.45)))
 ops += [line((18,18),(25,18),'#ffffff'),line((18,19),(18,24),'#ffffff')]
 cracks=[[(33,10),(28,25),(37,31),(30,44)],[(28,25),(16,30),(11,42)],[(37,31),(47,38),(49,49)],[(30,44),(35,55)]]
 for path in cracks[:strain+int(strain==3)] if strain else []:
  for a,b in zip(path,path[1:]):
   ops.append(line((a[0]+1,a[1]),(b[0]+1,b[1]),'#081018'));ops.append(line(a,b,'#fff4d2' if strain==3 else '#b5e1df'))
 if strain==3:
  ops += [line((26,8),(29,6),'#fff7df'),line((53,30),(57,33),'#fff7df')]
 return ops
for k,name in enumerate(names):
 for s in range(4):emit(gem(k,s),pathlib.Path('gems')/f'{name}-{s}.png')
 if k<7:
  for f in range(6):
   ops=[]
   if f==0:ops=gem(k,3)
   else:
    for i in range(7):
     a=i*math.tau/7;d=5+f*5;x=32+math.cos(a)*d;y=32+math.sin(a)*d
     ops+=poly([(x-5,y-4),(x+6,y-2),(x+1,y+6)],color(hues[k],.55+i*.03))
   emit(ops,pathlib.Path('gems/break')/name/f'{f}.png',sheet=True)
for f in range(8):
 emit(gem(7,turn=f*math.pi/8),pathlib.Path('gems/prism-turn')/f'{f}.png',sheet=True)
 for strain in range(1,4):emit(gem(7,strain,turn=f*math.pi/8),pathlib.Path('gems/prism-turn')/f'{f}-{strain}.png',sheet=True)
for cut in ['brilliant','star']:
 ops=[]
 if cut=='brilliant':
  for r in [25,27]:
   pts=[(32+math.cos(i*math.tau/8)*r,32+math.sin(i*math.tau/8)*r) for i in range(8)]
   for a,b in zip(pts,pts[1:]+pts[:1]):ops.append(line(a,b,'#ffe2a0'))
 else:
  pts=[(32+math.cos(i*math.pi/4)*(28 if i%2==0 else 9),32+math.sin(i*math.pi/4)*(28 if i%2==0 else 9)) for i in range(8)]
  for a,b in zip(pts,pts[1:]+pts[:1]):ops.append(line(a,b,'#ffffff'))
 emit(ops,pathlib.Path('gems')/f'{cut}.png')
ops=[]
for inset,c in [(0,'#090f1a'),(2,'#58636b'),(4,'#b3a181'),(6,'#202e39'),(12,'#0c1924')]:
 ops+=poly([(inset,inset),(608-inset,inset),(608-inset,608-inset),(inset,608-inset)],c)
for row in range(8):
 for col in range(8):
  x=16+col*72;y=16+row*72
  ops+=poly([(x,y),(x+70,y),(x+70,y+70),(x,y+70)],'#14232e' if (row+col)%2 else '#172833')
  ops.append(line((x+4,y+1),(x+66,y+1),'#243744'))
for x,y in [(7,7),(600,7),(7,600),(600,600)]:ops+=poly([(x,y-3),(x+3,y),(x,y+3),(x-3,y)],'#e4c992')
emit(ops,pathlib.Path('gems/frame.png'),608,608)
# Authored audio voices with plucked envelopes and metallic partials.
for name,freq,dur in [('select',900,85),('swap',560,140),('refuse',130,180),('land',85,230),('flaw',1700,110),('cut',1200,380),('levelup',660,700),('gameover',330,900)]+[(f'chain-{i}',330*2**((i-1)/8),320) for i in range(1,9)]:
 cfg=TMP/f'{name}.json';cfg.write_text(json.dumps(dict(sample_rate=22050,channels='mono',max_duration_ms=dur+350,seed=42,actions=str(TMP/'audio-log.json'),preview=str(TMP/'audio.png'),wav=str(ROOT/'audio'/f'{name}.wav'))))
 run('sfx-synth','--config',cfg,'init')
 for v,ratio,gain in [('body',1,-16),('chime',2.76,-25)]:
  run('sfx-synth','--config',cfg,'add-voice','--name',v,'--wave','sine' if v=='chime' else 'triangle','--freq',freq*ratio,'--gain',gain,'--dur',dur)
  run('sfx-synth','--config',cfg,'set-envelope','--voice',v,'--env','pluck')
 if name in ['levelup','gameover','swap']:
  run('sfx-synth','--config',cfg,'set-pitch','--voice','body','--slide-to',freq*(2 if name!='gameover' else .3),'--over',dur)
 run('sfx-synth','--config',cfg,'render')
cfg=TMP/'shatter.json';cfg.write_text(json.dumps(dict(sample_rate=22050,channels='mono',max_duration_ms=700,seed=42,sample_pack='combat-core',actions=str(TMP/'shatter-log.json'),preview=str(TMP/'shatter.png'),wav=str(ROOT/'audio/shatter.wav'))))
run('sfx-sample','--config',cfg,'init')
for name,t,gain in [('debris_glass',0,-13),('snap_transient',0,-21)]:run('sfx-sample','--config',cfg,'add-sample','--name',name,'--t',t,'--gain',gain)
run('sfx-sample','--config',cfg,'render')
for name,bpm,instrument in [('title',100,'music_box'),('play',72,'vibraphone')]:
 cfg=TMP/f'music-{name}.json';cfg.write_text(json.dumps(dict(sample_rate=22050,channels='stereo',max_duration_ms=int(32*60000/bpm),seed=42,instrument_bank='gm-lite',actions=str(TMP/'music-log.json'),preview=str(TMP/'music.png'),wav=str(ROOT/'audio'/f'{name}.wav'),mid=str(ROOT/'audio'/f'{name}.mid'))))
 run('music','--config',cfg,'init');run('music','--config',cfg,'set-tempo','--bpm',bpm)
 for track,inst in [('hook',instrument),('low','marimba')]:run('music','--config',cfg,'define-track','--name',track,'--instrument',inst)
 melody=[76,79,83,79,74,78,81,78,72,76,79,83,74,78,81,86]
 for i in range(32):
  run('music','--config',cfg,'add-note','--track','hook','--pitch',melody[i%16],'--t',i,'--dur',.65,'--velocity',57 if name=='title' else 35)
  if i%2==0:run('music','--config',cfg,'add-note','--track','low','--pitch',[52,50,48,50][i//8],'--t',i,'--dur',1.5,'--velocity',38)
 run('music','--config',cfg,'render')
# Live particle systems.
for name,burst,speed,size in [('clear',14,65,2),('flawed',30,110,3),('cut',24,75,2),('aura',0,12,1.2)]:
 out=ROOT/'fx'/name;out.mkdir(exist_ok=True)
 cfg=TMP/f'fx-{name}.json';cfg.write_text(json.dumps(dict(width=128,height=128,duration_ms=1000,fps=30,seed=42,actions=str(TMP/'fx-log.json'),preview=str(TMP/'fx.png'),system=str(out/'system.json'))))
 run('particle-2d','--config',cfg,'init')
 run('particle-2d','--config',cfg,'add-emitter','--name','spark','--shape','disc','--x',0,'--y',0,'--radius',24 if name=='aura' else 4, *(['--rate',10] if name=='aura' else ['--burst',burst]),'--lifetime',600,'--speed',speed,'--cone-angle',180)
 run('particle-2d','--config',cfg,'set-particle','--emitter','spark','--size-from',size,'--size-to',0,'--opacity-from',.9,'--opacity-to',0,'--color-gradient','#fff1bc@0,#68cad9@0.6,#3b5475@1')
 if name=='aura':run('particle-2d','--config',cfg,'set-timeline','--loop','true')
 run('particle-2d','--config',cfg,'render','--frame',8)
