/* ─── DATA ─── */
let records = JSON.parse(localStorage.getItem('avisBasketPagamenti') || '[]');
let editingId = null;
let deletingId = null;
let sortKey = 'cognome';
let sortAsc = true;

function save() {
  localStorage.setItem('avisBasketPagamenti', JSON.stringify(records));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ─── GRUPPO AUTOMATICO IN BASE ALL'ANNO ─── */
function computeGruppo(anno) {
  const y = parseInt(anno, 10);
  if (!y) return '';
  if (y >= 2020) return 'Pulcini';
  if (y >= 2018) return 'Scoiattoli';
  if (y >= 2016) return 'Aquilotti';
  if (y === 2015) return 'Esordienti';
  if (y === 2014) return 'U13';
  if (y === 2013) return 'U14';
  if (y === 2012) return 'U15';
  if (y < 2012)   return 'U15';
  return '';
}

/* ─── PRE-ISCRIZIONI: chi non ha ancora una pre-iscrizione per la stagione ───
   Ascolta la collezione Firestore "preiscrizioni" (stessa usata da
   preiscrizioni.html) solo per capire, atleta per atleta, se esiste una
   domanda corrispondente. Se manca, la riga viene evidenziata in rosso;
   appena arriva un match torna nera. Il collegamento a Firebase viene
   avviato da firebase-sync.js una volta che l'SDK è pronto. */
let preiscrizioniPerMatch = [];

function normalizeKey(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasPreiscrizione(r) {
  const chiave = normalizeKey(`${r.cognome} ${r.nome}`);
  return preiscrizioniPerMatch.some(p => {
    const pChiave = p.chiave_match || normalizeKey(`${p.minore?.cognome} ${p.minore?.nome}`);
    return pChiave === chiave;
  });
}

function watchPreiscrizioni() {
  firebase.firestore().collection('preiscrizioni').onSnapshot(snap => {
    preiscrizioniPerMatch = snap.docs.map(doc => doc.data());
    renderTable();
  }, err => console.error('[Firebase] errore lettura preiscrizioni per anagrafica:', err));
}

/* Un atleta è "nuovo iscritto" quando è stato aggiunto in anagrafica dal
   pulsante ➕ della pagina Pre-Iscrizioni su una domanda segnata come
   🆕 Nuovo (flag "aggiunta_al_registro" sulla pre-iscrizione corrispondente).
   Tutti gli altri (dati storici, aggiunti a mano, o rinnovi sincronizzati
   automaticamente da una pre-iscrizione già in elenco) sono considerati
   rinnovi/atleti già in anagrafica. */
function isNuovoIscritto(r) {
  const chiave = normalizeKey(`${r.cognome} ${r.nome}`);
  return preiscrizioniPerMatch.some(p => {
    if (!p.aggiunta_al_registro) return false;
    const pChiave = p.chiave_match || normalizeKey(`${p.minore?.cognome} ${p.minore?.nome}`);
    return pChiave === chiave;
  });
}

/* ─── CERTIFICATO MEDICO ─── */
const CERT_PREAVVISO_GIORNI = 60;

function certInfo(certScadenza) {
  if (!certScadenza) return { stato: 'assente', giorni: null, label: 'Nessun certificato' };
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  const scad = new Date(certScadenza + 'T00:00:00');
  const giorni = Math.round((scad - oggi) / 86400000);
  const dataFmt = scad.toLocaleDateString('it-IT');
  if (giorni < 0)  return { stato: 'scaduto',  giorni, label: `Scaduto il ${dataFmt}` };
  if (giorni <= CERT_PREAVVISO_GIORNI) return { stato: 'scadenza', giorni, label: `Scade il ${dataFmt} (${giorni}g)` };
  return { stato: 'ok', giorni, label: `Valido fino al ${dataFmt}` };
}

/* ─── TABLE ─── */
function getFiltered() {
  const search = document.getElementById('searchInput').value.trim().toLowerCase();
  const gruppo = document.getElementById('filterGruppo').value;
  const anno   = document.getElementById('filterAnno').value;

  return records.filter(r => {
    if (r.athleteId) return false; // record di pagamento (Quote Mensili), non un atleta
    const matchSearch = !search ||
      (r.cognome || '').toLowerCase().includes(search) ||
      (r.nome || '').toLowerCase().includes(search) ||
      (r.cf || '').toLowerCase().includes(search) ||
      (r.comune || '').toLowerCase().includes(search) ||
      (r.luogoNascita || '').toLowerCase().includes(search);
    // "🆕 Solo nuovi iscritti" e "🔄 Solo rinnovi" sono due voci speciali
    // dentro lo stesso menù del gruppo: non filtrano per categoria, ma per
    // tipo di iscrizione (vedi isNuovoIscritto).
    const matchGruppo = gruppo === '__NUOVI__' ? isNuovoIscritto(r)
      : gruppo === '__RINNOVI__' ? !isNuovoIscritto(r)
      : (!gruppo || r.gruppo === gruppo);
    const matchAnno = !anno || String(r.anno) === anno;
    return matchSearch && matchGruppo && matchAnno;
  }).sort((a, b) => {
    let va, vb;
    if (sortKey === 'certScadenza') {
      va = a.certScadenza || '9999-99-99';
      vb = b.certScadenza || '9999-99-99';
    } else {
      va = a[sortKey] || ''; vb = b[sortKey] || '';
      if (sortKey === 'anno') { va = +va; vb = +vb; }
    }
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ?  1 : -1;
    return 0;
  });
}

function populateFilterAnno() {
  const sel = document.getElementById('filterAnno');
  const current = sel.value;
  const anni = [...new Set(records.map(r => r.anno).filter(Boolean))]
    .sort((a, b) => b - a);
  sel.innerHTML = '<option value="">Tutti gli anni</option>' +
    anni.map(a => `<option value="${a}" ${String(a) === current ? 'selected' : ''}>${a}</option>`).join('');
}

const gruppoClass = g => g ? g.toLowerCase() : '';

function indirizzoFmt(r) {
  const parts = [r.via, r.comune, r.provinciaResidenza ? `(${r.provinciaResidenza})` : ''].filter(Boolean);
  return parts.length ? parts.join(', ') : '—';
}

function normalRow(r) {
  const gc = gruppoClass(r.gruppo);
  const luogoNascitaFmt = r.luogoNascita
    ? `${escHtml(r.luogoNascita)}${r.provinciaNascita ? ` (${escHtml(r.provinciaNascita)})` : ''}`
    : '—';
  const cert = certInfo(r.certScadenza);
  const certBadgeCls = { assente: 'badge-cert-assente', scaduto: 'badge-cert-scaduto', scadenza: 'badge-cert-scadenza', ok: 'badge-cert-ok' }[cert.stato];
  const rowClass = hasPreiscrizione(r) ? '' : ' class="row-no-preiscrizione"';

  return `<tr data-id="${r.id}"${rowClass}>
    <td data-label="Cognome"><span class="player-name">${escHtml(r.cognome || '—')}</span></td>
    <td data-label="Nome">${escHtml(r.nome || '—')}</td>
    <td data-label="Gruppo">${gc ? `<span class="badge badge-gruppo-${gc}">${escHtml(r.gruppo)}</span>` : '—'}</td>
    <td data-label="Anno">${escHtml(String(r.anno || '—'))}</td>
    <td data-label="Luogo Nascita">${luogoNascitaFmt}</td>
    <td data-label="Indirizzo">${escHtml(indirizzoFmt(r))}</td>
    <td data-label="Codice Fiscale">${r.cf ? `<code class="cf-code">${escHtml(r.cf)}</code>` : '—'}</td>
    <td data-label="Certificato Medico"><span class="badge ${certBadgeCls}">${escHtml(cert.label)}</span></td>
    <td data-label=""><div class="actions">
      <button class="btn-icon btn-edit" onclick="startEdit('${r.id}')" title="Modifica">✏️</button>
      <button class="btn-icon btn-del"  onclick="askDelete('${r.id}')" title="Elimina">🗑️</button>
    </div></td>
  </tr>`;
}

function renderTable() {
  populateFilterAnno();
  const data  = getFiltered();
  const tbody = document.getElementById('tableBody');
  const empty = document.getElementById('emptyState');

  document.getElementById('recordCount').textContent = `${data.length} record`;

  if (!data.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = data.map(normalRow).join('');
}

function sortBy(key) {
  if (sortKey === key) sortAsc = !sortAsc; else { sortKey = key; sortAsc = true; }
  document.querySelectorAll('thead th').forEach(th => th.classList.remove('sorted'));
  const colIdx = { cognome: 0, nome: 1, gruppo: 2, anno: 3, certScadenza: 7 };
  const ths = document.querySelectorAll('thead th');
  if (colIdx[key] !== undefined && ths[colIdx[key]]) ths[colIdx[key]].classList.add('sorted');
  renderTable();
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ─── MODAL NUOVO/MODIFICA ATLETA ─── */
function suggestGruppo() {
  const anno = document.getElementById('f_anno').value;
  const gruppo = computeGruppo(anno);
  if (gruppo) document.getElementById('f_gruppo').value = gruppo;
}

function switchModalTab(tab) {
  document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.modal-tab-panel').forEach(p => p.classList.toggle('active', p.dataset.tab === tab));
}

function consensoBadgeHtml(val) {
  if (val === 'si') return '<span class="badge badge-si">Sì</span>';
  if (val === 'no') return '<span class="badge badge-no">No</span>';
  return '<span class="badge badge-attesa">Non pervenuto</span>';
}

function fillForm(r) {
  document.getElementById('f_cognome').value        = r.cognome || '';
  document.getElementById('f_nome').value           = r.nome || '';
  document.getElementById('f_anno').value           = r.anno || '';
  document.getElementById('f_gruppo').value         = r.gruppo || '';
  document.getElementById('f_dataNascita').value    = r.dataNascita || '';
  document.getElementById('f_luogoNascita').value   = r.luogoNascita || '';
  document.getElementById('f_provNascita').value    = r.provinciaNascita || '';
  document.getElementById('f_cf').value             = r.cf || '';
  document.getElementById('f_nazionalita').value    = r.nazionalita || '';
  document.getElementById('f_via').value            = r.via || '';
  document.getElementById('f_comune').value         = r.comune || '';
  document.getElementById('f_provResidenza').value  = r.provinciaResidenza || '';
  document.getElementById('f_certScadenza').value   = r.certScadenza || '';
  document.getElementById('f_nomeGenitore').value   = r.nomeGenitore || '';
  document.getElementById('f_cfGenitore').value     = r.cfGenitore || '';
  document.getElementById('f_telefono').value       = r.telefono || '';
  document.getElementById('f_emailGenitore').value  = r.emailGenitore || '';
  document.getElementById('f_consensoFotoDisplay').innerHTML    = consensoBadgeHtml(r.consensoFoto);
  document.getElementById('f_consensoPrivacyDisplay').innerHTML = consensoBadgeHtml(r.consensoPrivacy);
  document.getElementById('f_dataCompilazioneDisplay').textContent = r.dataCompilazionePreiscrizione
    ? new Date(r.dataCompilazionePreiscrizione + 'T00:00:00').toLocaleDateString('it-IT')
    : '—';
}

function openModal() {
  editingId = null;
  document.getElementById('payForm').reset();
  document.getElementById('modalTitle').textContent    = 'Nuovo Atleta';
  document.getElementById('modalSubtitle').textContent = "Compila i dati anagrafici dell'atleta";
  document.getElementById('btnSaveLabel').textContent  = 'Salva Atleta';
  document.getElementById('f_consensoFotoDisplay').innerHTML    = consensoBadgeHtml(null);
  document.getElementById('f_consensoPrivacyDisplay').innerHTML = consensoBadgeHtml(null);
  document.getElementById('f_dataCompilazioneDisplay').textContent = '—';
  switchModalTab('atleta');
  document.getElementById('overlay').classList.add('open');
  setTimeout(() => document.getElementById('f_cognome').focus(), 100);
}

function startEdit(id) {
  const r = records.find(r => r.id === id);
  if (!r) return;
  editingId = id;
  fillForm(r);
  document.getElementById('modalTitle').textContent    = 'Modifica Atleta';
  document.getElementById('modalSubtitle').textContent = `${r.nomeRagazzo || ''}`.trim() || 'Dati anagrafici atleta';
  document.getElementById('btnSaveLabel').textContent  = 'Salva Modifiche';
  switchModalTab('atleta');
  document.getElementById('overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('overlay').classList.remove('open');
}

function saveRecord(e) {
  e && e.preventDefault();
  const get = id => document.getElementById(id).value.trim();

  const nome    = get('f_nome');
  const cognome = get('f_cognome');

  const datiAnagrafici = {
    nome,
    cognome,
    nomeRagazzo:        [nome, cognome].filter(Boolean).join(' '),
    anno:               get('f_anno'),
    gruppo:             get('f_gruppo'),
    dataNascita:        get('f_dataNascita'),
    luogoNascita:       get('f_luogoNascita'),
    provinciaNascita:   get('f_provNascita').toUpperCase(),
    cf:                 get('f_cf').toUpperCase(),
    nazionalita:        get('f_nazionalita'),
    via:                get('f_via'),
    comune:             get('f_comune'),
    provinciaResidenza: get('f_provResidenza').toUpperCase(),
    certScadenza:       get('f_certScadenza'),
    nomeGenitore:       get('f_nomeGenitore'),
    cfGenitore:         get('f_cfGenitore').toUpperCase(),
    telefono:           get('f_telefono'),
    emailGenitore:      get('f_emailGenitore').toLowerCase(),
  };

  if (editingId) {
    const idx = records.findIndex(r => r.id === editingId);
    if (idx !== -1) records[idx] = { ...records[idx], ...datiAnagrafici };
  } else {
    records.unshift({
      id: uid(),
      dataPagamento: '', frequenza: '', periodo: '', tipoPagamento: '',
      ...datiAnagrafici,
    });
  }

  save();
  renderTable();
  closeModal();
  toast(editingId ? 'Atleta aggiornato ✓' : 'Atleta salvato ✓', 'success');
}

/* ─── CERTIFICATI MEDICI IN SCADENZA → WHATSAPP ─── */
function elencoCertificatiScadenza() {
  return records
    .map(r => ({ r, cert: certInfo(r.certScadenza) }))
    .filter(({ cert }) => cert.stato === 'scaduto' || cert.stato === 'scadenza')
    .sort((a, b) => (a.r.certScadenza || '').localeCompare(b.r.certScadenza || ''));
}

function notificaCertificatiScadenza() {
  const elenco = elencoCertificatiScadenza();
  if (!elenco.length) { toast('Nessun certificato medico in scadenza ✓', 'success'); return; }

  const righe = elenco.map(({ r, cert }) =>
    `• ${r.cognome || ''} ${r.nome || ''}${r.gruppo ? ` (${r.gruppo})` : ''} — ${cert.label}`
  ).join('\n');

  const msg =
    `🏀 *Avis Basket Trani*\n\n` +
    `⚠️ Certificati medici in scadenza/scaduti (entro ${CERT_PREAVVISO_GIORNI} giorni):\n\n` +
    `${righe}\n\n` +
    `Contattare le famiglie per il rinnovo.`;

  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  toast(`${elenco.length} certificat${elenco.length === 1 ? 'o' : 'i'} in scadenza — messaggio pronto su WhatsApp`, 'error');
}

function checkCertificatiAllAvvio() {
  const n = elencoCertificatiScadenza().length;
  if (n > 0) {
    toast(`⚠️ ${n} certificat${n === 1 ? 'o' : 'i'} medic${n === 1 ? 'o' : 'i'} in scadenza — clicca "Certificati in scadenza"`, 'error');
  }
}

/* ─── DELETE ─── */
function askDelete(id) {
  deletingId = id;
  document.getElementById('confirmOverlay').classList.add('open');
}

function closeConfirm() {
  document.getElementById('confirmOverlay').classList.remove('open');
  deletingId = null;
}

function confirmDelete() {
  // Rimuove l'atleta E ogni pagamento di Quote Mensili agganciato a lui
  // (record con athleteId === deletingId), per non lasciare residui orfani.
  records = records.filter(r => r.id !== deletingId && r.athleteId !== deletingId);
  save();
  renderTable();
  closeConfirm();
  toast('Atleta e relativi pagamenti eliminati', 'error');
}

/* ─── TOAST ─── */
function toast(msg, type = 'success') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span> ${msg}`;
  c.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(20px)';
    t.style.transition = '.3s';
    setTimeout(() => t.remove(), 300);
  }, 2800);
}

/* ─── EXPORT CSV ─── */
function exportCSV() {
  const data = getFiltered();
  if (!data.length) { toast('Nessun dato da esportare', 'error'); return; }
  const header = ['Cognome', 'Nome', 'Gruppo', 'Anno', 'Data Nascita', 'Luogo Nascita', 'Provincia Nascita', 'Codice Fiscale', 'Nazionalità', 'Indirizzo', 'Comune', 'Provincia Residenza', 'Certificato Medico Scadenza'];
  const rows = data.map(r => [
    r.cognome || '', r.nome || '', r.gruppo || '', r.anno,
    r.dataNascita || '', r.luogoNascita || '', r.provinciaNascita || '',
    r.cf || '', r.nazionalita || '', r.via || '', r.comune || '', r.provinciaResidenza || '',
    r.certScadenza || ''
  ].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(';'));
  const csv = '﻿' + [header.join(';'), ...rows].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `avis-basket-trani-anagrafica-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  toast(`CSV esportato (${data.length} record) ✓`, 'success');
}

/* ─── EVENTS ─── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeConfirm();
  }
});

document.getElementById('overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('overlay')) closeModal();
});

['f_cf', 'f_provNascita', 'f_provResidenza', 'f_cfGenitore'].forEach(id => {
  document.getElementById(id).addEventListener('input', function () {
    this.value = this.value.toUpperCase();
  });
});

/* ─── SEED DATA (solo se localStorage è vuoto) ─── */
function seedData() {
  if (records.length > 0) return;
  records = [
  {id:"seed000",nomeRagazzo:"Aurora Accardo",anno:"2020",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed001",nomeRagazzo:"Fabio Acquaviva",anno:"2020",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed002",nomeRagazzo:"Simone Acquaviva",anno:"2019",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed003",nomeRagazzo:"Youssef Alauoi Harouni",anno:"2013",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed004",nomeRagazzo:"Alba Alloggio",anno:"2021",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed005",nomeRagazzo:"Mauro Amato",anno:"2020",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed006",nomeRagazzo:"Mauro Amoruso",anno:"2017",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed007",nomeRagazzo:"Andrea Annacondia",anno:"2017",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed008",nomeRagazzo:"Gabriele Arpone",anno:"2017",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed009",nomeRagazzo:"Cristian Arpone",anno:"2019",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed010",nomeRagazzo:"Nicola Baldassarre",anno:"2017",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed011",nomeRagazzo:"Andrea Basso",anno:"2019",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed012",nomeRagazzo:"Thomas Basta",anno:"2019",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed013",nomeRagazzo:"Francesco Borgia",anno:"2013",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed014",nomeRagazzo:"Domenico Botta",anno:"2020",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed015",nomeRagazzo:"Nicole Caio",anno:"2017",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed016",nomeRagazzo:"Gianpaolo Calefato",anno:"2019",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed017",nomeRagazzo:"Matteo Capogrosso",anno:"2022",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed018",nomeRagazzo:"Giulia Caputo",anno:"2013",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed019",nomeRagazzo:"Mia Caputo",anno:"2016",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed020",nomeRagazzo:"Leonardo Carella",anno:"2013",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed021",nomeRagazzo:"Domenico Casieri",anno:"2018",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed022",nomeRagazzo:"Umberto Casieri",anno:"2018",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed023",nomeRagazzo:"Gabriele Catino",anno:"2021",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed024",nomeRagazzo:"Leonardo Cellamare",anno:"2021",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed025",nomeRagazzo:"Luca Cifaratti",anno:"2018",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed026",nomeRagazzo:"Marco Conca",anno:"2021",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed027",nomeRagazzo:"Andrea Coratella",anno:"2020",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed028",nomeRagazzo:"Marco Teruo Cupelloni",anno:"2014",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed029",nomeRagazzo:"Daniele Curatella",anno:"2014",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed030",nomeRagazzo:"Francesco Curci",anno:"2013",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed031",nomeRagazzo:"Francesco Saul Curci",anno:"2018",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed032",nomeRagazzo:"Gabriele D'addato",anno:"2019",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed033",nomeRagazzo:"Leonardo Dagnello",anno:"2021",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed034",nomeRagazzo:"Antonio Daleno",anno:"2020",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed035",nomeRagazzo:"Francesco De Francesco",anno:"2015",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed036",nomeRagazzo:"Adriano De Palma",anno:"2021",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed037",nomeRagazzo:"Francesco De Rosa",anno:"2019",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed038",nomeRagazzo:"Mattia Maria De Simone",anno:"2020",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed039",nomeRagazzo:"Giorgio Del Rosso",anno:"2016",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed040",nomeRagazzo:"Daniele Di Cugno",anno:"2018",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed041",nomeRagazzo:"Daniele Di Cugno",anno:"2018",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed042",nomeRagazzo:"Francesco Di Feo",anno:"2017",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed043",nomeRagazzo:"Sergio Nunzio Di Giulio",anno:"2012",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed044",nomeRagazzo:"Michele Di Leo",anno:"2019",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed045",nomeRagazzo:"Federico Di Terlizzi",anno:"2019",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed046",nomeRagazzo:"Francesco Fabiano",anno:"2018",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed047",nomeRagazzo:"Leonardo Fabiano",anno:"2012",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed048",nomeRagazzo:"Francesco Ferrante",anno:"2014",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed049",nomeRagazzo:"Francesco Fiore",anno:"2014",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed050",nomeRagazzo:"Giovanni Francavilla",anno:"2013",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed051",nomeRagazzo:"Federico Fusco",anno:"2016",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed052",nomeRagazzo:"Emanuele Giordano",anno:"2019",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed053",nomeRagazzo:"Gabriele Gissi",anno:"2020",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed054",nomeRagazzo:"Andrea Laforgia",anno:"2019",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed055",nomeRagazzo:"Andrea Lanotte",anno:"2018",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed056",nomeRagazzo:"Diego Laudo",anno:"2012",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed057",nomeRagazzo:"Sara Laudo",anno:"2017",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed058",nomeRagazzo:"Andrea Leone",anno:"2021",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed059",nomeRagazzo:"Nisan Leone",anno:"2021",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed060",nomeRagazzo:"Gabriele Lettini",anno:"2017",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed061",nomeRagazzo:"Lorenzo Lettini",anno:"2021",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed062",nomeRagazzo:"Aurora Lettini",anno:"2019",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed063",nomeRagazzo:"Nicolò Lettini",anno:"2019",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed064",nomeRagazzo:"Alessandro Loddo",anno:"2014",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed065",nomeRagazzo:"Denise Loprieno",anno:"2013",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed066",nomeRagazzo:"Daniele Lorusso",anno:"2018",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed067",nomeRagazzo:"Giorgio Lorusso",anno:"2020",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed068",nomeRagazzo:"Giuseppe Lorusso",anno:"2012",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed069",nomeRagazzo:"Nicola Lorusso",anno:"2018",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed070",nomeRagazzo:"Simone Lorusso",anno:"2020",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed071",nomeRagazzo:"Jacopo Marzocca",anno:"2020",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed072",nomeRagazzo:"Liam Marzocca",anno:"2022",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed073",nomeRagazzo:"Paolo Mastroianni",anno:"2015",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed074",nomeRagazzo:"Michele Muciaccia",anno:"2012",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed075",nomeRagazzo:"Mattia Notarpietro",anno:"2019",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed076",nomeRagazzo:"Lorenzo Nugnes",anno:"2015",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed077",nomeRagazzo:"Elio Palmieri",anno:"2012",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed078",nomeRagazzo:"Elisabetta Pantaleo",anno:"2014",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed079",nomeRagazzo:"Gabriele Pappalettera",anno:"2014",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed080",nomeRagazzo:"Tommaso Parisi",anno:"2016",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed081",nomeRagazzo:"Alessandro Pascalone",anno:"2012",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed082",nomeRagazzo:"Dario Pellegrino",anno:"2021",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed083",nomeRagazzo:"Domenico Pellegrino",anno:"2017",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed084",nomeRagazzo:"Samuele Perfetto",anno:"2018",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed085",nomeRagazzo:"Nicholas Piumella",anno:"2017",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed086",nomeRagazzo:"Nicola Quercia",anno:"2015",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed087",nomeRagazzo:"Giosuè Ragno",anno:"2017",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed088",nomeRagazzo:"Chiara Rinaldi",anno:"2017",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed089",nomeRagazzo:"Claudia Rinaldi",anno:"2018",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed090",nomeRagazzo:"Vito Romanelli",anno:"2012",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed091",nomeRagazzo:"Flavio Saraci",anno:"2013",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed092",nomeRagazzo:"Paride Savoiardo",anno:"2020",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed093",nomeRagazzo:"Fransisco Scoccimarro Ennis",anno:"2017",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed094",nomeRagazzo:"Michele Senzio-Savino",anno:"2014",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed095",nomeRagazzo:"Giulia Serino",anno:"2019",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed096",nomeRagazzo:"Andrea Sgroni",anno:"2021",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed097",nomeRagazzo:"Jordan Stringari",anno:"2017",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed098",nomeRagazzo:"Antonio Tondolo",anno:"2018",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed099",nomeRagazzo:"Giovanna Tondolo",anno:"2018",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed100",nomeRagazzo:"Michele Triglione",anno:"2021",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed101",nomeRagazzo:"Giorgio Vaccanio",anno:"2017",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed102",nomeRagazzo:"Angelica Valenziano",anno:"2014",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed103",nomeRagazzo:"Luigi Vania",anno:"2020",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed104",nomeRagazzo:"Alessandro Ventura",anno:"2012",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed105",nomeRagazzo:"Jacopo Vesce",anno:"2013",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed106",nomeRagazzo:"Gabriele Vitofrancesco",anno:"2013",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed107",nomeRagazzo:"Leonardo Zingaro",anno:"2019",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""},
  {id:"seed108",nomeRagazzo:"Diana Zitoli",anno:"2015",nomeGenitore:"",cfGenitore:"",dataPagamento:"",frequenza:"",periodo:"",tipoPagamento:""}
  ];
  save();
}

/* ─── MIGRAZIONE DATI ESISTENTI ─── */
function migrateRecords() {
  let changed = false;
  records = records.map(r => {
    if ((!r.nome || !r.cognome) && r.nomeRagazzo) {
      const parts  = (r.nomeRagazzo || '').trim().split(/\s+/);
      if (!r.nome)    { r.nome    = parts.shift() || ''; changed = true; }
      else              parts.shift();
      if (!r.cognome) { r.cognome = parts.join(' ');     changed = true; }
    }
    if (!('gruppo' in r)) { r.gruppo = ''; changed = true; }
    if (!('cf' in r)) { r.cf = ''; changed = true; }
    return r;
  });
  if (changed) save();
}

/* ─── GRUPPO: riempie solo chi non ne ha ancora uno ───
   Non sovrascrive mai un gruppo già impostato (anche a mano):
   l'anno propone solo un default per gli atleti senza gruppo. */
function recomputeGruppi() {
  let changed = false;
  records = records.map(r => {
    if (!r.gruppo) {
      const gruppoCalcolato = computeGruppo(r.anno);
      if (gruppoCalcolato) { r.gruppo = gruppoCalcolato; changed = true; }
    }
    return r;
  });
  if (changed) save();
}

/* ─── INIT ─── */
seedData();
migrateRecords();
recomputeGruppi();
renderTable();
checkCertificatiAllAvvio();
