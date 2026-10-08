// =====================================================================
// MASCOTAS DEL CURSOR
// Si el mouse queda quieto ESPERA_MS, viene un perro o un gato (se turnan,
// el primero al azar). El perro empuja el cursor con la cabeza y el gato
// se para en dos patas y le pega un zarpazo.
// No aparece en celulares/tablets ni si la persona pidió "reducir movimiento".
// =====================================================================
(function () {
const ESPERA_MS = 15000; // 15 segundos con el mouse quieto

const tieneMouse = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!tieneMouse || reducir) return;

const L=(cls,x,w,top,bot)=>`<g class="pata ${cls}" style="transform-origin:${x+w/2}px ${top+4}px"><path class="t" d="M${x} ${top} L${x} ${bot-6} Q${x} ${bot} ${x+w/2} ${bot} Q${x+w} ${bot} ${x+w} ${bot-6} L${x+w} ${top}"/></g>`;

const PERRO=`<svg viewBox="0 0 140 110"><g class="todo">
<g class="colaP"><path class="t" d="M38 54 Q22 58 14 48 L21 48 L13 40 L22 42 L20 32 Q30 42 40 48"/></g>
${L('pb',52,13,62,101)}${L('pd',88,13,62,101)}
<path class="t" d="M34 58 Q34 44 54 44 L80 44 Q86 32 100 32 L112 50 Q106 62 101 66 Q100 80 86 80 L50 80 Q34 80 34 66 Z"/>
${L('pa',42,13,62,101)}${L('pc',78,13,62,101)}
<path class="collar" d="M86 46 Q98 58 116 56 L117 63 Q98 66 84 54 Z"/>
<path class="t" d="M84 38 Q84 14 106 13 Q123 13 128 29 L133 32 Q139 39 132 44 Q125 49 119 50 Q114 57 103 56 Q88 55 84 38 Z"/>
<ellipse class="o" cx="133" cy="36" rx="4.5" ry="4"/><circle class="o" cx="113" cy="28" r="2.8"/><circle class="w" cx="114" cy="27" r="0.9"/><path class="n" d="M113 43 Q119 47 124 42"/>
<g class="oreja"><path class="t" d="M94 20 Q76 15 72 30 L79 30 L74 37 L82 36 L80 44 Q90 50 99 42 Q103 29 94 20 Z"/></g></g></svg>`;

const GATO=`<svg viewBox="0 0 140 110"><g class="todo">
<g class="piernas">${L('pb',56,12,70,101)}${L('pa',47,12,70,101)}</g>
<g class="cuerpoG">
<g class="colaG"><path class="n" style="stroke-width:9" d="M46 66 Q30 66 28 52 Q27 44 34 42"/><path style="stroke:#FFFDF8;stroke-width:3;fill:none;stroke-linecap:round" d="M46 66 Q30 66 28 52 Q27 44 34 42"/></g>
<g class="otraG">${L('pd',84,12,68,99)}</g>
<path class="t" d="M44 68 Q44 56 60 56 L82 56 Q96 56 96 68 Q96 82 82 82 L58 82 Q44 82 44 72 Z"/>
<g class="golpeG">${L('pc',76,12,68,99)}<circle class="tip" cx="82" cy="97" r="1" fill="none"/></g>
<path class="t" d="M84 18 L82 -4 L100 8 Z M110 8 L128 -2 L124 20 Z"/><path class="rosa" d="M87 11 L86 2 L94 8 Z M114 8 L122 4 L120 14 Z"/>
<circle class="t" cx="104" cy="32" r="27"/>
<circle class="o" cx="112" cy="30" r="6.5"/><circle class="w" cx="114.5" cy="27.5" r="2.2"/><circle class="w" cx="110" cy="33" r="1"/>
<ellipse cx="114" cy="42" rx="5" ry="3" fill="#F4A6A0" opacity=".7"/>
<path class="rosa" d="M124 37 L128 37 L126 40 Z"/><path class="n" style="stroke-width:2.6" d="M126 40 Q124 44 120 42 M126 40 Q127 44 130 43"/>
<path class="n" style="stroke-width:2.2" d="M128 34 L142 31 M128 39 L142 41"/></g></g></svg>`;

const CFG={perro:{w:120,h:94,esc:120/140,punta:[137,36]},gato:{w:120,h:94,bajar:18}};

const z = document.createElement("div");
z.id = "mascotas";
z.setAttribute("aria-hidden", "true");
z.innerHTML = '<svg id="cur" viewBox="0 0 18 24"><path d="M2 2 L2 19 L6.5 15 L9.5 22 L12.5 20.7 L9.6 14 L15.5 14 Z" fill="#fff" stroke="#1E1E1E" stroke-width="1.5" stroke-linejoin="round"/></svg>';
document.body.appendChild(z);
const cur = z.querySelector("#cur");
const raiz = document.documentElement;

let falso={x:0,y:0},b=null,tipo=null,lado=1,timer=null,estado='nada',ts=[],tipOff=null,conMouse=false;
let proximo=Math.random()<.5?'perro':'gato';
const T=(f,ms)=>ts.push(setTimeout(f,ms));
function limpiar(){ts.forEach(clearTimeout);ts=[];}
function dibCur(cls){cur.setAttribute('class','');if(cls){void cur.getBoundingClientRect();cur.classList.add(cls);}cur.style.left=falso.x+'px';cur.style.top=falso.y+'px';}
function voltear(){b.querySelector('svg').classList.toggle('mirror',lado<0);}
function medir(){b.classList.add('sintrans','parado','golpe');const t=b.querySelector('.tip').getBoundingClientRect(),r=b.getBoundingClientRect();
  const o={dx:t.left+t.width/2-r.left,dy:t.top+t.height/2-r.top};b.classList.remove('parado','golpe');void b.offsetWidth;b.classList.remove('sintrans');return o;}
function pos(){
  if(tipo==='perro'){const c=CFG.perro;const px=c.punta[0]*c.esc,py=c.punta[1]*c.esc;return [lado>0?falso.x-px:falso.x-(c.w-px),falso.y-py+4];}
  return [falso.x-tipOff.dx+2*lado,falso.y-tipOff.dy+CFG.gato.bajar];}
function mover(){const [x,y]=pos();b.style.left=x+'px';b.style.top=y+'px';}
function bordes(){falso.x=Math.max(50,Math.min(z.clientWidth-50,falso.x));falso.y=Math.max(90,Math.min(z.clientHeight-90,falso.y));
  const [x]=pos();if(x<-20||x>z.clientWidth-CFG[tipo].w+20){lado*=-1;voltear();if(tipo==='gato')tipOff=medir();}}

function venir(){
  // no molestar si el carrito está abierto
  if(document.body.classList.contains('sin-scroll')){armar();return;}
  tipo=proximo;proximo=tipo==='perro'?'gato':'perro';lado=falso.x>z.clientWidth/2?1:-1;const c=CFG[tipo];
  b=document.createElement('div');b.className='bicho '+tipo;b.style.width=c.w+'px';b.style.height=c.h+'px';b.innerHTML=tipo==='perro'?PERRO:GATO;voltear();
  b.style.left=(lado>0?-c.w-30:z.clientWidth+30)+'px';b.style.top='0px';z.appendChild(b);
  if(tipo==='gato')tipOff=medir();
  falso.y=Math.max(90,Math.min(z.clientHeight-90,falso.y));
  const [,y]=pos();b.style.top=y+'px';b.classList.add('camina');estado='viene';
  dibCur();raiz.classList.add('mascota-activa');
  requestAnimationFrame(()=>requestAnimationFrame(mover));
  T(()=>{if(!b)return;b.classList.remove('camina');estado='juega';tipo==='perro'?jugarPerro():jugarGato();},950);}

function jugarPerro(){b.classList.add('respira');const paso=()=>{if(!b||estado!=='juega')return;
  b.classList.remove('empuja');void b.offsetWidth;b.classList.add('empuja');
  T(()=>{falso.x+=15*lado;falso.y-=3;dibCur();},440);
  T(()=>{if(!b)return;b.classList.remove('empuja');bordes();b.classList.add('camina','rapido');mover();T(()=>b&&b.classList.remove('rapido','camina'),340);},800);
  T(paso,1500+Math.random()*700);};T(paso,400);}

function jugarGato(){const ronda=()=>{if(!b||estado!=='juega')return;
  b.classList.add('parado');const golpes=1+Math.floor(Math.random()*2);let t=500;
  for(let i=0;i<golpes;i++){
    T(()=>b&&b.classList.add('alza'),t);
    T(()=>{if(!b)return;b.classList.remove('alza');b.classList.add('golpe');},t+330);
    T(()=>{falso.x+=(12+Math.random()*14)*lado;falso.y+=22+Math.random()*16;bordes();dibCur('cae');},t+390);
    T(()=>b&&b.classList.remove('golpe'),t+560);
    t+=760;}
  T(()=>b&&b.classList.remove('parado'),t+100);
  T(()=>{if(!b)return;b.classList.add('camina');mover();},t+550);
  T(()=>{if(!b)return;b.classList.remove('camina');ronda();},t+1500+Math.random()*500);};T(ronda,300);}

// La persona volvió a usar la página: se le devuelve el cursor y la mascota se va
function irse(){
  raiz.classList.remove('mascota-activa');
  if(!b)return;limpiar();const x=b;estado='nada';x.className='bicho camina '+tipo;voltear();
  x.style.left=(lado>0?-170:z.clientWidth+40)+'px';b=null;setTimeout(()=>x.remove(),950);}

function armar(){clearTimeout(timer);if(conMouse)timer=setTimeout(()=>{if(!b)venir();},ESPERA_MS);}
function actividad(){if(b)irse();armar();}

document.addEventListener('mousemove',e=>{falso.x=e.clientX;falso.y=e.clientY;conMouse=true;actividad();},{passive:true});
['mousedown','keydown','wheel','scroll','touchstart'].forEach(ev=>document.addEventListener(ev,actividad,{passive:true}));
document.addEventListener('mouseleave',()=>{conMouse=false;clearTimeout(timer);});
})();
