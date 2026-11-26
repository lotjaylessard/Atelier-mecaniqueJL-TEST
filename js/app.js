// app.js — logique UI (SPA) — charge DB, affiche pages, gère bons/factures
(function(){
  // helpers
  const $ = id => document.getElementById(id);
  function el(tag, attrs={}, html=''){ const e=document.createElement(tag); for(const k in attrs) e.setAttribute(k, attrs[k]); e.innerHTML = html; return e; }

  // render pages content
  function renderDashboard(){
    const root = $('page-dashboard'); root.innerHTML = '';
    const wos = DB.loadWorkOrders();
    const invs = DB.loadInvoices();
    const total = invs.reduce((s,i)=>s + Number(i.total||0),0);
    root.appendChild(el('div', {class:'card'}, `<h2>Tableau de bord</h2>
      <div class="small">Bons de travail: ${wos.length}</div>
      <div class="small">Factures: ${invs.length}</div>
      <div class="small">Total encaissé: ${total.toFixed(2)} $</div>`));
    // recent WOs
    const recent = wos.slice(0,6);
    const recCard = el('div',{class:'card'});
    recCard.innerHTML = `<h3>Récents</h3>`;
    recent.forEach(r=>{
      const node = el('div',{class:'history-item'}, `<strong>${r.client}</strong> — ${r.vehicle||''}<div class="muted">${(new Date(r.id)).toLocaleString()}</div><div>${(r.description||'').slice(0,120)}</div>`);
      node.addEventListener('dblclick', ()=> openWOEdit(r.id));
      recCard.appendChild(node);
    });
    root.appendChild(recCard);
  }

  function renderNewWO(){
    const root = $('page-newwo'); root.innerHTML = '';
    const card = el('div',{class:'card'});
    card.innerHTML = `<h2>Nouveau bon de travail</h2>
      <label>Client</label><input id="wo_client" />
      <label>Plaque / VIN</label><input id="wo_vehicle"/>
      <label>Véhicule (modèle/année)</label><input id="wo_vehicle_info" />
      <label>Description</label><textarea id="wo_description"></textarea>
      <h3>Articles</h3>
      <div style="display:flex;gap:8px">
        <input id="wo_part_name" placeholder="Nom pièce"/><input id="wo_part_qty" placeholder="Qté" type="number" value="1" style="width:80px"/><input id="wo_part_price" placeholder="Prix" type="number" step="0.01" style="width:120px"/><button id="wo_add_part" class="button">Ajouter pièce</button>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <input id="wo_lab_desc" placeholder="Travail (ex: freinage)"/><input id="wo_lab_hours" type="number" placeholder="hrs" style="width:80px"/><input id="wo_lab_rate" type="number" placeholder="taux/h" style="width:120px"/><button id="wo_add_lab" class="button">Ajouter main-d'œuvre</button>
      </div>
      <table id="wo_items_table" class="table"><thead><tr><th>Type</th><th>Description</th><th>Qté/hrs</th><th>Prix/u</th><th>Total</th><th></th></tr></thead><tbody></tbody></table>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
        <div><label>TPS (%)</label><input id="wo_gst" type="number" value="5.00"/><label>TVQ (%)</label><input id="wo_qst" type="number" value="9.975"/></div>
        <div style="text-align:right"><div>Sous-total: <span id="wo_subtotal">0.00</span></div><div>TPS: <span id="wo_gst_amt">0.00</span></div><div>TVQ: <span id="wo_qst_amt">0.00</span></div><h3>Total: <span id="wo_total">0.00</span></h3><div style="margin-top:8px"><button id="wo_save" class="button">Enregistrer</button><button id="wo_to_invoice" class="button" style="margin-left:8px">Vers facture</button></div></div>
      </div>
    `;
    root.appendChild(card);

    // local items state
    let items = [];
    function refreshItems(){
      const tbody = document.querySelector('#wo_items_table tbody'); tbody.innerHTML='';
      let sub=0;
      items.forEach((it,idx)=>{
        const tr = el('tr',{},`<td>${it.type}</td><td>${it.desc}</td><td style="text-align:center">${it.qty}</td><td style="text-align:right">${Number(it.rate).toFixed(2)}</td><td style="text-align:right">${(it.qty*it.rate).toFixed(2)}</td><td><button class="button ghost" data-i="${idx}">Suppr</button></td>`);
        tbody.appendChild(tr);
      });
      tbody.querySelectorAll('button[data-i]').forEach(b=>b.addEventListener('click', e=>{ items.splice(Number(e.currentTarget.dataset.i),1); refreshItems(); applyTax(); }));
      items.forEach(it=> sub += (it.qty*it.rate));
      $('wo_subtotal').innerText = sub.toFixed(2);
      applyTax();
    }
    function applyTax(){
      const sub = Number($('wo_subtotal').innerText)||0;
      const gst = Number($('wo_gst').value)||0;
      const qst = Number($('wo_qst').value)||0;
      const gstAmt = sub * gst/100;
      const qstAmt = (sub + gstAmt) * qst/100;
      $('wo_gst_amt').innerText = gstAmt.toFixed(2);
      $('wo_qst_amt').innerText = qstAmt.toFixed(2);
      $('wo_total').innerText = (sub + gstAmt + qstAmt).toFixed(2);
    }

    // wire add buttons
    root.querySelector('#wo_add_part').addEventListener('click', ()=>{
      const name = root.querySelector('#wo_part_name').value.trim();
      const qty = Number(root.querySelector('#wo_part_qty').value) || 0;
      const price = Number(root.querySelector('#wo_part_price').value) || 0;
      if(!name || qty<=0) return alert('Nom et quantité requis');
      items.push({type:'Pièce', desc:name, qty, rate:price});
      root.querySelector('#wo_part_name').value=''; root.querySelector('#wo_part_price').value=''; root.querySelector('#wo_part_qty').value=1;
      refreshItems();
    });
    root.querySelector('#wo_add_lab').addEventListener('click', ()=>{
      const d = root.querySelector('#wo_lab_desc').value.trim();
      const hrs = Number(root.querySelector('#wo_lab_hours').value)||0;
      const r = Number(root.querySelector('#wo_lab_rate').value)||0;
      if(!d || hrs<=0) return alert('Description et heures requis');
      items.push({type:"Main-d'oeuvre", desc:d, qty:hrs, rate:r});
      root.querySelector('#wo_lab_desc').value=''; root.querySelector('#wo_lab_hours').value=''; root.querySelector('#wo_lab_rate').value='';
      refreshItems();
    });

    // save workorder
    root.querySelector('#wo_save').addEventListener('click', ()=>{
      const client = root.querySelector('#wo_client').value.trim(); if(!client) return alert('Client requis');
      const wo = { id: Date.now(), client, vehicle: root.querySelector('#wo_vehicle').value, vehicleInfo: root.querySelector('#wo_vehicle_info').value, description: root.querySelector('#wo_description').value, items: JSON.parse(JSON.stringify(items)), subtotal: Number($('wo_subtotal').innerText)||0, gst: Number($('wo_gst_amt').innerText)||0, qst: Number($('wo_qst_amt').innerText)||0, total: Number($('wo_total').innerText)||0, status: 'OUVERT' };
      const list = DB.loadWorkOrders(); list.unshift(wo); DB.saveWorkOrders(list);
      alert('Bon enregistré'); navigate('page-history'); loadAll();
    });

    // convert to invoice
    root.querySelector('#wo_to_invoice').addEventListener('click', ()=>{
      if(items.length===0) return alert('Aucun article');
      const inv = { number: DB.nextInvoiceNumber(), date: (new Date()).toLocaleString(), client: root.querySelector('#wo_client').value||'', job: root.querySelector('#wo_description').value||'', items: JSON.parse(JSON.stringify(items)), subtotal: Number($('wo_subtotal').innerText)||0, gst: Number($('wo_gst_amt').innerText)||0, qst: Number($('wo_qst_amt').innerText)||0, total: Number($('wo_total').innerText)||0 };
      const invoices = DB.loadInvoices(); invoices.unshift(inv); DB.saveInvoices(invoices);
      if(confirm('Marquer ce bon comme TERMINÉ ?')){ const wo = { id: Date.now(), client: inv.client, vehicle: root.querySelector('#wo_vehicle').value||'', vehicleInfo: root.querySelector('#wo_vehicle_info').value||'', description: inv.job||'', items: JSON.parse(JSON.stringify(items)), subtotal: inv.subtotal, gst: inv.gst, qst: inv.qst, total: inv.total, status: 'TERMINÉ' }; const w = DB.loadWorkOrders(); w.unshift(wo); DB.saveWorkOrders(w); }
      alert('Facture créée #' + inv.number); loadAll(); navigate('page-invoices');
    });

    // initial
    refreshItems();
  }

  function renderInvoices(){
    const root = $('page-invoices'); root.innerHTML = '';
    const list = DB.loadInvoices();
    const card = el('div',{class:'card'});
    card.innerHTML = `<h2>Factures (${list.length})</h2><input id="inv_q" placeholder="Rechercher client ou #"/> <div id="inv_list"></div>`;
    root.appendChild(card);
    function refresh(){
      const q = root.querySelector('#inv_q').value.trim().toLowerCase();
      const cont = root.querySelector('#inv_list'); cont.innerHTML = '';
      DB.loadInvoices().forEach((inv, idx)=>{
        if(q && !(inv.client.toLowerCase().includes(q) || String(inv.number).includes(q))) return;
        const item = el('div',{class:'history-item'}, `<strong>${inv.client}</strong> — #${inv.number}<div class="muted">${inv.date}</div><div style="margin-top:6px">Total: ${Number(inv.total).toFixed(2)} $</div>`);
        const btns = el('div',{style:'margin-top:6px;display:flex;gap:8px'});
        const v = el('button', {class:'nav-btn'}, 'Voir'); v.addEventListener('click', ()=> PDF.printInvoice(loadSettingsName(), loadSettingsContact(), inv));
        const d = el('button',{class:'nav-btn'}, 'Suppr'); d.addEventListener('click', ()=>{
          if(!confirm('Supprimer facture ?')) return;
          const arr = DB.loadInvoices(); arr.splice(idx,1); DB.saveInvoices(arr); refresh(); loadAll();
        });
        btns.appendChild(v); btns.appendChild(d); item.appendChild(btns);
        cont.appendChild(item);
      });
    }
    root.querySelector('#inv_q').addEventListener('input', refresh);
    refresh();
  }

  function renderHistory(){
    const root = $('page-history'); root.innerHTML = '';
    const list = DB.loadWorkOrders();
    const card = el('div',{class:'card'});
    card.innerHTML = `<h2>Historique des bons</h2><input id="hist_q" placeholder="Rechercher client, plaque, description" /><div id="hist_list"></div>`;
    root.appendChild(card);
    function refresh(){
      const q = root.querySelector('#hist_q').value.trim().toLowerCase();
      const cont = root.querySelector('#hist_list'); cont.innerHTML = '';
      DB.loadWorkOrders().forEach(wo=>{
        if(q && !((wo.client||'').toLowerCase().includes(q) || (wo.vehicle||'').toLowerCase().includes(q) || (wo.description||'').toLowerCase().includes(q))) return;
        const item = el('div',{class:'history-item'}, `<strong>${wo.client}</strong> — ${wo.vehicle||''} <div class="muted">${(new Date(wo.id)).toLocaleString()}</div><div style="margin-top:6px">${(wo.description||'')}</div>`);
        const btns = el('div',{style:'margin-top:6px;display:flex;gap:8px'});
        const v = el('button',{class:'nav-btn'}, 'Voir'); v.addEventListener('click', ()=> openWOEdit(wo.id));
        const dup = el('button',{class:'nav-btn'}, 'Dupliquer'); dup.addEventListener('click', ()=> {
          // duplicate into newwo editor
          navigate('page-newwo'); setTimeout(()=> openWOForDuplicate(wo),200);
        });
        const del = el('button',{class:'nav-btn'}, 'Suppr'); del.addEventListener('click', ()=>{
          if(!confirm('Supprimer ce bon ?')) return;
          const arr = DB.loadWorkOrders().filter(x=> x.id !== wo.id); DB.saveWorkOrders(arr); refresh(); loadAll();
        });
        btns.appendChild(v); btns.appendChild(dup); btns.appendChild(del); item.appendChild(btns);
        cont.appendChild(item);
      });
    }
    root.querySelector('#hist_q').addEventListener('input', refresh);
    refresh();
  }

  // settings page
  function renderSettings(){
    const root = $('page-settings'); root.innerHTML = '';
    const s = DB.loadSettings();
    const card = el('div',{class:'card'});
    card.innerHTML = `<h2>Paramètres</h2>
      <label>Nom de l'entreprise</label><input id="s_company" value="${s.companyName||'Garage-Atelier Mécanique J.L'}"/>
      <label>Contact (adresse / téléphone)</label><textarea id="s_contact">${s.companyContact||''}</textarea>
      <div style="display:flex;gap:8px;margin-top:8px"><div style="flex:1"><label>TPS (%)</label><input id="s_gst" type="number" value="${s.gst||5.00}"/></div><div style="width:160px"><label>TVQ (%)</label><input id="s_qst" type="number" value="${s.qst||9.975}"/></div></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button id="s_save" class="button">Sauvegarder</button><button id="s_export" class="button ghost">Exporter JSON</button></div>
    `;
    root.appendChild(card);
    root.querySelector('#s_save').addEventListener('click', ()=>{
      const cfg = { companyName: root.querySelector('#s_company').value, companyContact: root.querySelector('#s_contact').value, gst: Number(root.querySelector('#s_gst').value)||0, qst: Number(root.querySelector('#s_qst').value)||0 };
      DB.saveSettings(cfg); alert('Paramètres sauvegardés'); loadAll();
    });
    root.querySelector('#s_export').addEventListener('click', ()=>{
      const json = DB.exportAll();
      const blob = new Blob([JSON.stringify(json, null, 2)], { type:'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download='backup_garage.json'; a.click(); URL.revokeObjectURL(url);
    });
  }

  // navigation helpers
  function navigate(pageId){
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    const p = document.getElementById(pageId); if(p) p.classList.add('active');
  }
  function loadSettingsName(){ const s = DB.loadSettings(); return s.companyName || 'Garage-Atelier Mécanique J.L'; }
  function loadSettingsContact(){ const s = DB.loadSettings(); return s.companyContact || ''; }

  // open WO in editor
  function openWOEdit(id){
    const list = DB.loadWorkOrders(); const wo = list.find(w=> w.id === id); if(!wo) return alert('Introuvable');
    navigate('page-newwo'); setTimeout(()=> openWOForDuplicate(wo), 150);
  }
  function openWOForDuplicate(wo){
    // reuse newwo UI fields (we build watchers when newwo renders)
    const root = document.getElementById('page-newwo');
    // fill fields
    root.querySelector('#wo_client').value = wo.client||'';
    root.querySelector('#wo_vehicle').value = wo.vehicle||'';
    root.querySelector('#wo_vehicle_info').value = wo.vehicleInfo||'';
    root.querySelector('#wo_description').value = wo.description||'';
    // remove existing items and insert wo.items
    // to reuse logic in newwo render we trigger renderNewWO again (simple approach)
    renderNewWO();
    // after re-render, inject items
    setTimeout(()=>{
      const items = wo.items || [];
      // add to table by simulating clicks (faster to manipulate DOM)
      items.forEach(it=>{
        const isLab = it.type && it.type.toLowerCase().includes('main');
        if(isLab){
          document.querySelector('#wo_lab_desc').value = it.desc || '';
          document.querySelector('#wo_lab_hours').value = it.qty || 0;
          document.querySelector('#wo_lab_rate').value = it.rate || 0;
          document.querySelector('#wo_add_lab').click();
        } else {
          document.querySelector('#wo_part_name').value = it.desc || '';
          document.querySelector('#wo_part_qty').value = it.qty || 1;
          document.querySelector('#wo_part_price').value = it.rate || 0;
          document.querySelector('#wo_add_part').click();
        }
      });
    },300);
  }

  // wire nav
  document.getElementById('nav-dashboard').addEventListener('click', ()=> { renderDashboard(); navigate('page-dashboard'); });
  document.getElementById('nav-newwo').addEventListener('click', ()=> { renderNewWO(); navigate('page-newwo'); });
  document.getElementById('nav-invoices').addEventListener('click', ()=> { renderInvoices(); navigate('page-invoices'); });
  document.getElementById('nav-history').addEventListener('click', ()=> { renderHistory(); navigate('page-history'); });
  document.getElementById('nav-settings').addEventListener('click', ()=> { renderSettings(); navigate('page-settings'); });

  // load initial
  function loadAll(){ renderDashboard(); renderHistory(); renderInvoices(); renderSettings(); }
  loadAll();

  // attach print / export helpers globally (from earlier modules)
  window.PDF = window.PDF || { printInvoice: (c,ct,inv)=>{ const printArea = document.getElementById('printArea'); printArea.style.display='block'; printArea.innerHTML = (function(){ return `<div style="padding:20px;background:#fff;color:#000"><h2>${c}</h2></div>`})(); window.print(); printArea.style.display='none'; } };
})();
