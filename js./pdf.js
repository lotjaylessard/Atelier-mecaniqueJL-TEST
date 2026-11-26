// pdf.js — construction du HTML imprimable pour facture / bon
const PDF = (function(){
  function buildInvoiceHTML(company, contact, inv){
    const itemsHtml = (inv.items||[]).map(it=>`<tr><td>${it.type}</td><td>${it.desc||''}</td><td style="text-align:center">${it.qty}</td><td style="text-align:right">${Number(it.rate||0).toFixed(2)}</td><td style="text-align:right">${(it.qty*it.rate||0).toFixed(2)}</td></tr>`).join('');
    return `
      <div style="padding:20px;font-family:Arial;color:#000;background:#fff;width:800px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><h2 style="margin:0">${company}</h2><div style="white-space:pre-wrap">${contact||''}</div></div>
          <div style="text-align:right">
            <div><strong>Facture #</strong> ${inv.number}</div>
            <div><strong>Date:</strong> ${inv.date}</div>
          </div>
        </div>
        <hr/>
        <div style="margin-top:10px"><strong>Client:</strong> ${inv.client}</div>
        <div style="margin-top:10px"><strong>Job:</strong> ${inv.job||''}</div>
        <table style="width:100%;margin-top:12px;border-collapse:collapse">
          <thead><tr style="background:#f3f3f3"><th>Type</th><th>Description</th><th>Qté</th><th style="text-align:right">Prix/u</th><th style="text-align:right">Total</th></tr></thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <div style="text-align:right;margin-top:12px">
          <div>Sous-total: ${Number(inv.subtotal||0).toFixed(2)} $</div>
          <div>TPS: ${Number(inv.gst||0).toFixed(2)} $</div>
          <div>TVQ: ${Number(inv.qst||0).toFixed(2)} $</div>
          <h3>Total: ${Number(inv.total||0).toFixed(2)} $</h3>
        </div>
        <hr/>
        <div style="font-size:12px;color:#333">Merci — Garage-Atelier Mécanique J.L</div>
      </div>
    `;
  }

  function printInvoice(company, contact, inv){
    const printArea = document.getElementById('printArea');
    printArea.style.display = 'block';
    printArea.innerHTML = buildInvoiceHTML(company, contact, inv);
    window.print();
    printArea.style.display = 'none';
  }

  return { printInvoice, buildInvoiceHTML };
})();
