"""Package the saved platform, checkpoint and gem rules for offline play."""
import json


def build_scene(scene):
    layout = json.dumps(scene.model_dump(), separators=(",", ":"), allow_nan=False).replace("<", "\\u003c")
    return ("""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>IndaVerse island prototype</title>
<style>body{margin:auto;padding:1rem;max-width:58rem;background:#101c2d;color:#eef6ff;font:1rem system-ui}
canvas{background:#1b4b69;width:100%;height:auto;touch-action:none}button{padding:.7rem;margin:.2rem}
canvas:focus{outline:3px solid #ffc955}</style></head><body>
<h1>IndaVerse island prototype</h1><p id="help">Move with arrows or WASD, jump with Space, pause with Escape. Blue marks the checkpoint and green marks the exit.</p>
<button id="start">Start / resume</button><button id="restart">Restart</button><p role="status" id="status">Ready</p>
<canvas id="scene" width="900" height="540" tabindex="0" aria-label="Island prototype" aria-describedby="help"></canvas>
<div aria-label="Touch controls"><button data-key="ArrowLeft">Left</button><button data-key="ArrowUp">Forward</button>
<button data-key="ArrowDown">Back</button><button data-key="ArrowRight">Right</button><button data-key="Space">Jump</button></div>
<script type="application/json" id="layout">""" + layout + """</script>
<script>
"use strict";
const level=JSON.parse(document.querySelector("#layout").textContent);
const canvas=document.querySelector("#scene"), ctx=canvas.getContext("2d"), status=document.querySelector("#status");
const keys=new Set(), goal=level.required_gems??level.collectibles.length, platforms=[...level.platforms].sort((a,b)=>a.top-b.top);
const bounds=platforms.reduce((b,p)=>[Math.min(b[0],p.x-p.w/2),Math.max(b[1],p.x+p.w/2),Math.min(b[2],p.z-p.d/2-p.top*.45),Math.max(b[3],p.z+p.d/2)],[Infinity,-Infinity,Infinity,-Infinity]);
const scale=Math.min(810/(bounds[1]-bounds[0]),450/(bounds[3]-bounds[2]+2));
const px=x=>450+(x-(bounds[0]+bounds[1])/2)*scale, pz=(z,y=0)=>270+(z-(bounds[2]+bounds[3])/2-y*.45)*scale;
let player, gems, checkpoint, vy, grounded, running, won;
function announce(prefix){status.textContent=prefix+" · Gems "+gems.size+" / "+goal+(checkpoint?" · Checkpoint reached":"");}
function restart(){player={...level.spawn};gems=new Set();checkpoint=false;vy=0;grounded=true;running=false;won=false;keys.clear();announce("Ready");}
function start(){if(!won){running=true;canvas.focus();announce("Playing");}}
document.querySelector("#start").onclick=start;document.querySelector("#restart").onclick=restart;
function stop(){keys.clear();if(running){running=false;announce("Paused");}}
function press(key){if(key==="Escape"){stop();return;}if(!running)return;
  if(key==="Space"&&!keys.has(key)&&grounded){vy=7.5;grounded=false;}keys.add(key);}
const actions=new Set(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","KeyW","KeyA","KeyS","KeyD","Space","Escape"]);
canvas.onkeydown=e=>{if(actions.has(e.code)){e.preventDefault();press(e.code);}};
window.addEventListener("keyup",e=>keys.delete(e.code));window.addEventListener("blur",stop);
document.querySelectorAll("[data-key]").forEach(b=>{
  b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);press(b.dataset.key);};
  b.onlostpointercapture=()=>keys.delete(b.dataset.key);
  b.onkeydown=e=>{if(e.code==="Space"||e.code==="Enter"){e.preventDefault();press(b.dataset.key);}};
  b.onkeyup=()=>keys.delete(b.dataset.key);b.onblur=()=>keys.delete(b.dataset.key);
});
function near(a,b,r){return Math.hypot(a.x-b.x,a.z-b.z)<r;}
function step(dt){
  const has=(a,b)=>Number(keys.has(a)||keys.has(b));
  let dx=has("ArrowRight","KeyD")-has("ArrowLeft","KeyA"),dz=has("ArrowDown","KeyS")-has("ArrowUp","KeyW");
  const length=Math.hypot(dx,dz)||1;dx*=dt*5/length;dz*=dt*5/length;
  function blocked(x,z){return platforms.some(p=>player.y+.08<p.top&&player.y+1>p.top-.6&&Math.abs(x-p.x)<p.w/2+.25&&Math.abs(z-p.z)<p.d/2+.25);}
  if(!blocked(player.x+dx,player.z))player.x+=dx;
  if(!blocked(player.x,player.z+dz))player.z+=dz;
  const previous=player.y;vy-=18*dt;player.y+=vy*dt;grounded=false;
  const above=p=>Math.abs(player.x-p.x)<=p.w/2+.15&&Math.abs(player.z-p.z)<=p.d/2+.15;
  const surface=platforms.findLast(p=>above(p)&&previous>=p.top-.001&&player.y<=p.top);
  if(surface){player.y=surface.top;vy=0;grounded=true;}
  const ceiling=platforms.find(p=>above(p)&&previous+1<=p.top-.6&&player.y+1>=p.top-.6);
  if(ceiling){player.y=ceiling.top-1.6;vy=0;}
  const mark=level.checkpoint;
  if(mark&&!checkpoint&&grounded&&Math.abs(mark.y-player.y)<.08&&near(mark,player,.62)){checkpoint=true;announce("Playing");}
  if(player.y< -5){player={...(checkpoint?mark:level.spawn)};vy=0;grounded=true;announce("Respawned");}
  for(const gem of level.collectibles)if(!gems.has(gem.id)&&near(player,gem,.8)&&Math.abs(player.y+.55-gem.y)<.8){gems.add(gem.id);announce("Playing");}
  if(gems.size>=goal&&near(player,level.exit,.72)&&Math.abs(player.y-level.exit.y)<.8){won=true;running=false;announce("Completed!");}
}
function dot(p,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(px(p.x),pz(p.z,p.y),Math.max(4,r*scale),0,Math.PI*2);ctx.fill();}
function draw(){
  ctx.clearRect(0,0,900,540);
  for(const p of platforms){ctx.fillStyle=p.top?"#b48050":"#aa8159";ctx.fillRect(px(p.x-p.w/2),pz(p.z-p.d/2,p.top),p.w*scale,p.d*scale);ctx.strokeStyle="#553b29";ctx.strokeRect(px(p.x-p.w/2),pz(p.z-p.d/2,p.top),p.w*scale,p.d*scale);}
  dot(level.exit,.48,"#81ea9c");if(level.checkpoint)dot(level.checkpoint,.47,checkpoint?"#a1fcfa":"#81afff");
  for(const gem of level.collectibles)if(!gems.has(gem.id))dot(gem,.25,"#ffd85c");
  dot({...player,y:player.y+.65},.34,"#fff");
}
let previous=0;function loop(now){if(running)step(Math.min(.025,(now-previous)/1000));previous=now;draw();requestAnimationFrame(loop);}
restart();requestAnimationFrame(loop);
</script></body></html>""").encode()
