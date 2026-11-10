// ==UserScript==
// @name         Consume Calidad - Cazador de Chollos
// @namespace    https://github.com/jmarcaestevez-pixel/Cazador-Chollos-Amazon
// @version      1.1.0
// @description  Analiza la ficha abierta, guarda candidatos y permite revisar ofertas manualmente.
// @match        https://www.amazon.es/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @updateURL    https://raw.githubusercontent.com/jmarcaestevez-pixel/Cazador-Chollos-Amazon/main/Cazador_Chollos.user.js
// @downloadURL  https://raw.githubusercontent.com/jmarcaestevez-pixel/Cazador-Chollos-Amazon/main/Cazador_Chollos.user.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self || document.getElementById('cc-cazador')) return;

  const KEY = 'cc_cazador_v1';
  const data = GM_getValue(KEY, {min: 60, items: [], collapsed: false});
  const state = {...data, items: Array.isArray(data.items) ? data.items : []};
  const save = () => GM_setValue(KEY, state);
  GM_registerMenuCommand(state.enabled === false ? 'Encender Cazador de Chollos' : 'Apagar Cazador de Chollos', () => {
    state.enabled = state.enabled === false;
    save();
    location.reload();
  });
  if (state.enabled === false) return;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => Number.isFinite(n) ? n.toLocaleString('es-ES', {style:'currency',currency:'EUR'}) : '—';
  const txt = el => el ? (el.innerText || el.textContent || '').trim() : '';
  const one = (...selectors) => selectors.map(s=>document.querySelector(s)).find(Boolean);
  const price = s => {
    let a = String(s||'').replace(/\s/g,'').replace(/[^\d,.]/g,'');
    if (!a) return NaN;
    if (a.includes(',') && a.includes('.')) a = a.replace(/\./g,'').replace(',','.');
    else if (a.includes(',')) a = a.replace(',','.');
    return Number(a);
  };
  const pct = (oldP,newP) => Number.isFinite(oldP)&&Number.isFinite(newP)&&oldP>newP&&newP>=0 ? Math.round((1-newP/oldP)*100) : 0;

  const style = document.createElement('style');
  style.textContent = `
    #cc-cazador{position:fixed;z-index:2147483646;top:85px;right:18px;width:352px;max-width:95vw;background:#fff;color:#19212b;border:1px solid #b9c8d7;border-radius:12px;box-shadow:0 8px 32px #0004;font:13px Arial,sans-serif}
    #cc-cazador *{box-sizing:border-box} #cc-cazador header{background:#163652;color:#fff;padding:12px;border-radius:11px 11px 0 0;cursor:move;display:flex;justify-content:space-between;align-items:center}
    #cc-cazador button{cursor:pointer;border:1px solid #bed0df;border-radius:6px;padding:7px 9px;background:#eef5fb;color:#17364b;font-weight:600}
    #cc-cazador button:hover{background:#dceefa}#cc-cazador main{padding:12px}#cc-cazador .ccrow{display:flex;gap:7px;align-items:center;margin:8px 0;flex-wrap:wrap}
    #cc-cazador input[type=range]{width:100%;accent-color:#15803d}#cc-cazador .ccmuted{font-size:11px;color:#5c6b76;line-height:1.4}
    #cc-cazador .ccitem{padding:7px 0;border-top:1px solid #ddd;font-size:12px;overflow-wrap:anywhere}#cc-cazador a{color:#0768ae}
    #cc-cazador .ccstatus{padding:8px;background:#f0f6fa;border-radius:7px;line-height:1.5}#cc-cazador .ccgreen{color:#13763d;font-weight:bold}
  `;
  document.head.appendChild(style);
  const box = document.createElement('section'); box.id = 'cc-cazador';
  box.innerHTML = `<header id="cc-handle"><strong>🔎 CAZADOR DE CHOLLOS</strong><span><button id="cc-off" title="Apagar hasta volver a encenderlo">⏻ Apagar</button> <button id="cc-hide" title="Minimizar">−</button></span></header>
    <main id="cc-body">
      <div class="ccrow" style="justify-content:space-between"><strong>Descuento mínimo</strong><strong id="cc-mintext" class="ccgreen"></strong></div>
      <input id="cc-slider" type="range" min="10" max="90" step="1" />
      <div class="ccrow"><button id="cc-check">Analizar esta ficha</button><button id="cc-save">Guardar candidato</button></div>
      <div class="ccstatus" id="cc-result">Abre una ficha de producto y pulsa «Analizar».</div>
      <p class="ccmuted">Compara únicamente precios visibles de la misma ficha. Los precios tachados pueden no representar un precio habitual real. Comprueba siempre la talla, color, estado y oferta antes de comprar.</p>
      <div class="ccrow"><button id="cc-export">Exportar CSV</button><button id="cc-clear">Vaciar lista</button><span id="cc-count"></span></div>
      <div id="cc-items" style="max-height:190px;overflow:auto"></div>
    </main>`;
  document.body.appendChild(box);
  const $ = id => box.querySelector('#'+id);
  $('cc-slider').value = String(state.min);
  const updateMin = () => { $('cc-mintext').textContent = state.min+' %'; $('cc-count').textContent = state.items.length+' guardados'; };
  $('cc-slider').addEventListener('input', e => {state.min=Number(e.target.value); save(); updateMin();});
  updateMin();

  function inspect() {
    const title = txt(one('#productTitle','#title')) || document.title;
    const asin = document.querySelector('input#ASIN')?.value || location.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)?.[1] || '';
    const main = one('#corePriceDisplay_desktop_feature_div','#corePrice_feature_div','#apex_desktop','#ppd') || document;
    const currentEl = main.querySelector('.priceToPay .a-offscreen,.apexPriceToPay .a-offscreen,.a-price:not(.a-text-price) .a-offscreen');
    const refEl = main.querySelector('.basisPrice .a-offscreen,.a-text-price .a-offscreen,.priceBlockStrikePriceString');
    const current = price(txt(currentEl));
    const reference = price(txt(refEl));
    const discount = pct(reference,current);
    const variant = txt(one('#variation_size_name .selection','#variation_color_name .selection','#variation_style_name .selection'));
    const otherOffers = [...document.querySelectorAll('#olp_feature_div,#usedBuyBox,#renewedBuyBox,#buybox-see-all-buying-choices')].map(txt).filter(Boolean).join(' | ').slice(0,350);
    const candidate = {title, asin, variant, current, reference, discount, otherOffers, url:location.href.split('#')[0], date:new Date().toLocaleString('es-ES')};
    box._candidate = candidate;
    const valid = Number.isFinite(current) && Number.isFinite(reference) && reference>current;
    const ok = valid && discount>=state.min;
    $('cc-result').innerHTML = `<strong>${esc(title.slice(0,95))}</strong>${variant?'<br>Variante: '+esc(variant):''}<br>
      Precio visible: <b>${money(current)}</b><br>Referencia visible: <b>${money(reference)}</b><br>
      ${valid?`Descuento calculado: <b class="${ok?'ccgreen':''}">${discount}%</b>`:'Sin referencia comparable visible'}<br>
      ${ok?'✅ Supera tu filtro (pendiente de verificar)':'No se ha confirmado un descuento que supere tu filtro.'}<br>
      ${otherOffers?'<span class="ccmuted">Otras ofertas visibles: '+esc(otherOffers)+'</span>':'<span class="ccmuted">No se ha podido confirmar precio reacondicionado.</span>'}`;
    return candidate;
  }
  function render() {
    $('cc-count').textContent = state.items.length+' guardados';
    $('cc-items').innerHTML = state.items.slice().reverse().slice(0,30).map(item=>`<div class="ccitem"><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title.slice(0,75))}</a><br>${esc(item.variant||'Sin variante')} · ${money(item.current)} · ${item.discount||0}% · ${esc(item.date)}</div>`).join('');
  }
  $('cc-check').addEventListener('click',inspect);
  $('cc-save').addEventListener('click', () => {
    const item = box._candidate || inspect();
    if (!Number.isFinite(item.current)) {alert('No se ha encontrado un precio válido en esta ficha.');return;}
    const key = item.asin+'|'+item.variant+'|'+item.current+'|'+item.url;
    if (state.items.some(i=>i.asin+'|'+i.variant+'|'+i.current+'|'+i.url===key)) return alert('Este candidato ya está guardado.');
    state.items.push(item); save();render();
  });
  $('cc-clear').addEventListener('click',()=>{if(confirm('¿Eliminar todos los candidatos guardados?')){state.items=[];save();render();}});
  $('cc-export').addEventListener('click',()=>{
    const cols=['title','asin','variant','current','reference','discount','otherOffers','url','date'];
    const csv=[cols.join(';'),...state.items.map(i=>cols.map(k=>'"'+String(i[k]??'').replace(/"/g,'""')+'"').join(';'))].join('\r\n');
    const a=document.createElement('a');const u=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
    a.href=u;a.download='cazador_chollos.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
  });
  $('cc-off').addEventListener('click',()=>{state.enabled=false;save();box.remove();style.remove();});
  $('cc-hide').addEventListener('click',()=>{const m=$('cc-body');m.hidden=!m.hidden;$('cc-hide').textContent=m.hidden?'+':'−';});
  let drag=false,dx=0,dy=0;
  $('cc-handle').addEventListener('mousedown',e=>{if(e.target.closest('button'))return;drag=true;dx=e.clientX-box.getBoundingClientRect().left;dy=e.clientY-box.getBoundingClientRect().top;e.preventDefault();});
  document.addEventListener('mousemove',e=>{if(!drag)return;box.style.left=Math.max(0,Math.min(innerWidth-box.offsetWidth,e.clientX-dx))+'px';box.style.top=Math.max(0,Math.min(innerHeight-45,e.clientY-dy))+'px';box.style.right='auto';});
  document.addEventListener('mouseup',()=>drag=false);
  render();
})();
