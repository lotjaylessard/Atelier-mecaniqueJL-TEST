// db.js — gestion du stockage local
const DB = (function(){
  const KEYS = {
    WORK: 'ar_workorders_v2',
    INV: 'ar_invoices_v2',
    SETTINGS: 'ar_settings_v2',
    COUNTER: 'ar_invoice_counter_v2'
  };

  function load(key, def){ return JSON.parse(localStorage.getItem(key) || JSON.stringify(def)); }
  function save(key, data){ localStorage.setItem(key, JSON.stringify(data)); }

  return {
    loadWorkOrders(){ return load(KEYS.WORK, []); },
    saveWorkOrders(list){ save(KEYS.WORK, list); },
    loadInvoices(){ return load(KEYS.INV, []); },
    saveInvoices(list){ save(KEYS.INV, list); },
    loadSettings(){ return load(KEYS.SETTINGS, {}); },
    saveSettings(o){ save(KEYS.SETTINGS, o); },
    nextInvoiceNumber(){
      let n = Number(localStorage.getItem(KEYS.COUNTER) || 0) + 1;
      localStorage.setItem(KEYS.COUNTER, n);
      return String(n).padStart(5,'0');
    },
    exportAll(){ return { settings: this.loadSettings(), workorders: this.loadWorkOrders(), invoices: this.loadInvoices() }; },
    importAll(json){ if(json.settings) this.saveSettings(json.settings); if(json.workorders) this.saveWorkOrders(json.workorders); if(json.invoices) this.saveInvoices(json.invoices); }
  };
})();
