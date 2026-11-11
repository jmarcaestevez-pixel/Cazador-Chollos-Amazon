// ==UserScript==
// @name         Consume Calidad - Cazador de Chollos
// @namespace    https://github.com/jmarcaestevez-pixel/Cazador-Chollos-Amazon
// @version      1.3.0
// @description  Caza por sesiones: resultados, productos relacionados y descuentos visibles. Revisión antes de comprar.
// @match        https://www.amazon.es/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==
(function () {
  'use strict';
  if (window.top !== window.self || document.getElementById('cc-cazador')) return;
  const KEY='cc_cazador_v1';
  const prev=GM_getValue(KEY,{});
  const state={min:60,items:[],enabled:true,running:false,queue:[],seen:[],duration:15,deadline:0,visited:0,maxVisited:60,...prev};
  if(!Array.isArray(state.items))state.items=[];
  if(!Array.isArray(state.queue))state.queue=[];
  if(!Array.isArray(state.seen))state.seen=[];
  const save=()=>GM_setValue(KEY,state);
  const $id=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const text=el=>String(el?.textContent||'').trim();
  const euro=n=>Number.isFinite(n)?n.toLocaleString('es-ES',{style:'currency',currency:'EUR'}):'—';
  const parse=s=>{const m=String(s||'').match(/\d[\d.,\s]*\d|\d/);if(!m)return NaN;let a=m[0].replace(/\s/g,'');if(a.includes(',')&&a.includes('.'))a=a.replace(/\./g,'').replace(',','.');else if(a.includes(','))a=a.replace(',','.');return Number(a);};
  const productKey=url=>{try {const u=new URL(url,location.href);if(u.hostname!=='www.amazon.es'&&u.hostname!=='amazon.es')return null;const m=u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);return m?m[1].toUpperCase():null;}catch{return null;}};
  const cleanUrl=asin=>'https://www.amazon.es/dp/'+asin;
  const isProduct=()=>Boolean(productKey(location.href));
  const stop=why=>{state.running=false;save();setStatus(why||'Caza detenida');updateButtons();};
  GM_registerMenuCommand(state.enabled===false?'Encender Cazador de Chollos':'Apagar Cazador de Chollos',()=>{state.enabled=state.enabled===false;if(!state.enabled)state.running=false;save();location.reload();});
  if(state.enabled===false)return;
  const style=document.createElement('style');style.textContent=`
  #cc-cazador{position:fixed;z-index:2147483646;top:85px;right:18px;width:370px;max-width:96vw;background:#fff;color:#172430;border:1px solid #c1d0dc;border-radius:11px;box-shadow:0 7px 30px #0005;font:13px Arial,sans-serif}
  #cc-cazador *{box-sizing:border-box}#cc-cazador header{background:#173750;color:#fff;padding:11px;border-radius:10px 10px 0 0;display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:move}
  #cc-cazador button,#cc-cazador select{border:1px solid #c1d0dc;border-radius:6px;background:#edf4f8;color:#14344a;padding:7px 8px;cursor:pointer;font-size:12px}
  #cc-cazador button:hover{background:#dcebf4}#cc-cazador #cc-start{background:#168444;color:#fff;border-color:#168444}#cc-cazador #cc-stop{background:#fff1f1;color:#a01818;border-color:#edbcbc}
  #cc-cazador main{padding:11px}#cc-cazador .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:8px 0}
  #cc-cazador input[type=range]{width:100%;accent-color:#168444}#cc-cazador #cc-status{background:#eff5f8;border-radius:6px;padding:9px;line-height:1.5}
  #cc-cazador .muted{font-size:11px;line-height:1.4;color:#61707c}#cc-cazador .item{border-top:1px solid #e1e8ec;padding:7px 0;font-size:12px;overflow-wrap:anywhere}
  #cc-cazador a{color:#086aa2}#cc-cazador .green{color:#168444;font-weight:bold}`;
  document.head.appendChild(style);
  const box=document.createElement('section');box.id='cc-cazador';box.innerHTML=`<header id="cc-drag"><strong>🔎 CAZADOR DE CHOLLOS · V1.3.0</strong><span><button id="cc-off">⏻ Apagar</button> <button id="cc-collapse">−</button></span></header><main id="cc-body">
  <div class="row" style="justify-content:space-between"><strong>Descuento mínimo</strong><strong id="cc-min-label" class="green"></strong></div><input id="cc-min" type="range" min="10" max="90" step="1">
  <div class="row"><label>Duración <select id="cc-duration"><option value="5">5 min</option><option value="15">15 min</option><option value="30">30 min</option><option value="60">60 min</option></select></label><span id="cc-counts" class="muted"></span></div>
  <div class="row"><button id="cc-start">▶ Iniciar caza</button><button id="cc-stop">■ Detener</button><button id="cc-manual">Analizar ficha</button></div>
  <div id="cc-status">Inicia desde una página de resultados o una ficha de producto.</div>
  <p class="muted">Busca enlaces de productos en resultados y recomendaciones visibles de las fichas. No puede verificar todas las variantes ni todos los reacondicionados. Los hallazgos son candidatos, no precios garantizados. La navegación se detiene ante un bloqueo.</p>
  <div class="row"><button id="cc-export">Exportar CSV</button><button id="cc-clear">Vaciar hallazgos</button></div><div id="cc-items" style="max-height:180px;overflow:auto"></div></main>`;
  document.body.appendChild(box);
  const el=id=>box.querySelector('#'+id);
  const setStatus=s=>{const node=el('cc-status');if(node)node.textContent=s;};
  const updateButtons=()=>{el('cc-start').disabled=state.running;el('cc-stop').disabled=!state.running;el('cc-min-label').textContent=state.min+' %';el('cc-counts').textContent=`${state.visited} visitados · ${state.queue.length} pendientes · ${state.items.length} hallazgos`;};
  function render(){updateButtons();el('cc-items').innerHTML=state.items.slice(-25).reverse().map(x=>`<div class="item"><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title.slice(0,85))}</a><br>${euro(x.current)} · ${x.discount}% · ${esc(x.variant||'Variante sin verificar')} · ${esc(x.date)}</div>`).join('');}
  function gatherLinks(){let count=0;const anchors=document.querySelectorAll('a[href*="/dp/"],a[href*="/gp/product/"]');for(const a of anchors){const asin=productKey(a.href);if(!asin||state.seen.includes(asin)||state.queue.includes(asin))continue;state.queue.push(asin);count++;if(state.queue.length>=150)break;}save();return count;}
  function check(){
    if(!isProduct())return false;
    const title=text(document.querySelector('#productTitle'))||document.title;
    const currentNode=document.querySelector('#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen,#corePrice_feature_div .priceToPay .a-offscreen,#apex_desktop .priceToPay .a-offscreen,#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen,#apex_desktop .a-price:not(.a-text-price) .a-offscreen');
    const refNode=document.querySelector('#corePriceDisplay_desktop_feature_div .basisPrice .a-offscreen,#corePrice_feature_div .basisPrice .a-offscreen,#apex_desktop .a-text-price .a-offscreen,#corePriceDisplay_desktop_feature_div .a-text-price .a-offscreen');
    const current=parse(text(currentNode)),reference=parse(text(refNode));
    const discount=Number.isFinite(current)&&Number.isFinite(reference)&&reference>current?Math.round((1-current/reference)*100):0;
    const variant=[text(document.querySelector('#variation_size_name .selection')),text(document.querySelector('#variation_color_name .selection'))].filter(Boolean).join(' / ');
    const asin=productKey(location.href),eligible=discount>=state.min;
    if(eligible){const item={title,asin,variant,current,reference,discount,url:cleanUrl(asin),date:new Date().toLocaleString('es-ES')};const key=asin+'|'+variant+'|'+current;if(!state.items.some(x=>x.asin+'|'+x.variant+'|'+x.current===key)){state.items.push(item);save();}}
    setStatus(`${title.slice(0,75)} | Nuevo ${euro(current)} | Referencia visible ${euro(reference)} | Descuento ${discount}%${eligible?' | CANDIDATO GUARDADO':''}. Revisa oferta y variante antes de comprar.`);
    render();return true;
  }
  const blocked=()=>/captcha|validatecaptcha|robot check/i.test(document.title+' '+location.pathname)||Boolean(document.querySelector('form[action*="validateCaptcha"]'));
  function next(){if(!state.running)return;if(blocked())return stop('Amazon ha mostrado una comprobación o bloqueo. Sesión detenida.');if(Date.now()>=state.deadline)return stop('Finalizó el tiempo elegido.');if(state.visited>=state.maxVisited)return stop('Alcanzado el límite de 60 fichas por sesión.');let asin;while(state.queue.length){const candidate=state.queue.shift();if(!state.seen.includes(candidate)){asin=candidate;break;}}if(!asin)return stop('No quedan enlaces de productos pendientes. Abre otra página de resultados y comienza otra caza.');state.seen.push(asin);state.visited++;save();location.assign(cleanUrl(asin));}
  let timer;
  function runPage(){if(!state.running)return;if(blocked())return stop('Página de verificación detectada: búsqueda detenida.');if(Date.now()>=state.deadline)return stop('Finalizó el tiempo elegido.');if(isProduct())check();const found=gatherLinks();render();setStatus(`Página revisada · ${found} enlaces nuevos encontrados · ${state.queue.length} pendientes · ${state.items.length} candidatos guardados. Siguiente producto en unos segundos.`);timer=setTimeout(next,5500);}
  el('cc-start').onclick=()=>{state.running=true;state.deadline=Date.now()+Number(el('cc-duration').value)*60000;state.visited=0;state.seen=[];state.queue=[];state.duration=Number(el('cc-duration').value);save();runPage();};
  el('cc-stop').onclick=()=>{clearTimeout(timer);stop('Caza detenida por el usuario.');};
  el('cc-manual').onclick=()=>{if(!check())setStatus('Abre una ficha de producto para analizar su precio visible.');};
  el('cc-off').onclick=()=>{clearTimeout(timer);state.enabled=false;state.running=false;save();box.remove();style.remove();};
  el('cc-collapse').onclick=()=>{el('cc-body').hidden=!el('cc-body').hidden;el('cc-collapse').textContent=el('cc-body').hidden?'+':'−';};
  el('cc-min').value=state.min;el('cc-min').oninput=e=>{state.min=Number(e.target.value);save();updateButtons();};
  el('cc-duration').value=String(state.duration||15);
  el('cc-clear').onclick=()=>{if(confirm('¿Borrar todos los hallazgos guardados?')){state.items=[];save();render();}};
  el('cc-export').onclick=()=>{const cols=['title','asin','variant','current','reference','discount','url','date'];const csv=[cols.join(';'),...state.items.map(x=>cols.map(k=>'"'+String(x[k]??'').replace(/"/g,'""')+'"').join(';'))].join('\r\n');const u=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='cazador_chollos.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
  let drag=false,dx=0,dy=0;el('cc-drag').onmousedown=e=>{if(e.target.closest('button'))return;drag=true;dx=e.clientX-box.getBoundingClientRect().left;dy=e.clientY-box.getBoundingClientRect().top;e.preventDefault();};document.addEventListener('mousemove',e=>{if(!drag)return;box.style.left=Math.max(0,Math.min(innerWidth-box.offsetWidth,e.clientX-dx))+'px';box.style.top=Math.max(0,Math.min(innerHeight-45,e.clientY-dy))+'px';box.style.right='auto';});document.addEventListener('mouseup',()=>drag=false);
  render();if(state.running){if(Date.now()>=state.deadline)stop('Finalizó el tiempo elegido.');else runPage();}
})();
