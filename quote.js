/* ─── COSTANTI ─── */
const MESI_KEYS  = ['settembre','ottobre','novembre','dicembre','gennaio','febbraio','marzo','aprile','maggio','giugno'];
const MESI_SHORT = ['Set','Ott','Nov','Dic','Gen','Feb','Mar','Apr','Mag','Giu'];
const MESI_JS    = [8, 9, 10, 11, 0, 1, 2, 3, 4, 5];
const MESI_NOMI  = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];

/* Trimestrale non è più selezionabile per nuovi pagamenti, ma resta qui
   per calcolare correttamente i pagamenti storici già salvati con questa frequenza. */
const FREQ_IMPORTO   = { Lezione: 5, 'Metà mese': 20, Mensile: 35, Trimestrale: 95, Stagionale: 270, Iscrizione: 30 };
const ISCRIZIONE_QUOTA = FREQ_IMPORTO.Iscrizione;
const TIPO_CLASS = { Contanti: 'contanti', Bonifico: 'bonifico', Gratuito: 'gratuito' };

let sortKey = 'cognome';
let sortAsc = true;

/* ─── STORAGE – unico database ─── */
function loadMain()  { return JSON.parse(localStorage.getItem('avisBasketPagamenti') || '[]'); }
function saveMain(d) { localStorage.setItem('avisBasketPagamenti', JSON.stringify(d)); }

/* Promemoria dell'ultima ricevuta creata (numero/data), per non rischiare
   di duplicare un numero già usato. Un solo valore globale, condiviso tra
   ricevute quote e iscrizione, dato che in pratica si usa un'unica
   numerazione progressiva. */
function loadUltimaRicevuta() {
  try { return JSON.parse(localStorage.getItem('avisBasketUltimaRicevuta') || 'null'); }
  catch { return null; }
}
function saveUltimaRicevuta(numero, dataStr) {
  localStorage.setItem('avisBasketUltimaRicevuta', JSON.stringify({ numero, data: dataStr }));
}

function blankMesi() {
  const m = {};
  MESI_KEYS.forEach(k => m[k] = 0);
  return m;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─── COSTRUISCE DATI ATLETI DAL REGISTRO ───
   Gli atleti sono identificati per id univoco (non più per nome+cognome):
   due atleti omonimi restano due righe distinte, ognuna con i propri
   pagamenti e la propria iscrizione, senza mischiarsi.
   Ogni pagamento aggiunto da questa pagina è un record a sé stante con
   "athleteId" che punta all'id dell'atleta in anagrafica — così un secondo
   pagamento si aggiunge invece di sovrascrivere il primo. I record storici
   che portano ancora il pagamento incorporato nella stessa riga
   dell'anagrafica (senza athleteId) restano supportati. */
function buildAthleteData() {
  const main     = loadMain();
  const athletes = new Map(); // id -> entry

  for (const r of main) {
    if (!r.nomeRagazzo || r.athleteId) continue; // solo record-identità atleta
    athletes.set(r.id, {
      id:                     r.id,
      nomeRagazzo:            r.nomeRagazzo,
      cognome:                r.cognome || '',
      nome:                   r.nome || '',
      anno:                   r.anno || '',
      gruppo:                 r.gruppo || '',
      nomeGenitore:           r.nomeGenitore || '',
      telefono:               r.telefono || '',
      hasPayments:            false,
      mesi:                   blankMesi(),
      ultimoPagamento:        null,
      iscrizionePagata:       false,
      iscrizioneTotale:       0,
      ultimoPagamentoIscrizione: null,
    });
  }

  const applyPagamento = (entry, r) => {
    if (!r.frequenza || !r.dataPagamento) return;
    entry.hasPayments = true;

    // L'iscrizione è un pagamento a sé stante: ha la sua colonna dedicata e
    // non entra mai nella distribuzione delle 9 mensilità né nell'"ultimo
    // pagamento" mostrato nelle colonne Frequenza/Periodo/Tipo/Data.
    if (r.frequenza === 'Iscrizione') {
      entry.iscrizionePagata = true;
      const isGratuito = r.tipoPagamento === 'Gratuito';
      const importo = isGratuito ? 0 : (FREQ_IMPORTO.Iscrizione || 0);
      entry.iscrizioneTotale = parseFloat((entry.iscrizioneTotale + importo).toFixed(2));
      if (!entry.ultimoPagamentoIscrizione || r.dataPagamento > entry.ultimoPagamentoIscrizione.dataPagamento) {
        entry.ultimoPagamentoIscrizione = {
          frequenza:     r.frequenza,
          periodo:       r.periodo || '',
          tipoPagamento: r.tipoPagamento || '',
          dataPagamento: r.dataPagamento,
        };
      }
      return;
    }

    const meseIdx = (r.meseRiferimento !== null && r.meseRiferimento !== undefined)
      ? r.meseRiferimento : undefined;
    const isGratuito = r.tipoPagamento === 'Gratuito';
    const dist = calcDistribuzione(r.frequenza, r.dataPagamento, meseIdx, isGratuito);
    MESI_KEYS.forEach(k => {
      entry.mesi[k] = parseFloat(((entry.mesi[k] || 0) + (dist[k] || 0)).toFixed(2));
    });
    if (!entry.ultimoPagamento || r.dataPagamento > entry.ultimoPagamento.dataPagamento) {
      entry.ultimoPagamento = {
        frequenza:     r.frequenza,
        periodo:       r.periodo || '',
        tipoPagamento: r.tipoPagamento || '',
        dataPagamento: r.dataPagamento,
      };
    }
  };

  for (const r of main) {
    if (r.athleteId && athletes.has(r.athleteId)) {
      applyPagamento(athletes.get(r.athleteId), r);       // pagamento dedicato
    } else if (r.nomeRagazzo && athletes.has(r.id)) {
      applyPagamento(athletes.get(r.id), r);              // record storico combinato
    }
  }

  return athletes;
}

/* ─── DISTRIBUZIONE MENSILE ─── */
function getMeseIdx(dateStr) {
  if (!dateStr) return 0;
  const month = new Date(dateStr + 'T00:00:00').getMonth();
  const idx   = MESI_JS.indexOf(month);
  return idx >= 0 ? idx : 0;
}

function calcDistribuzione(frequenza, dateStr, meseIdxOverride, isGratuito) {
  const mesi = blankMesi();
  if (isGratuito) return mesi;
  const si = meseIdxOverride !== undefined ? meseIdxOverride : getMeseIdx(dateStr);
  switch (frequenza) {
    case 'Lezione':    mesi[MESI_KEYS[si]] = 5;  break;
    case 'Metà mese': mesi[MESI_KEYS[si]] = 20; break;
    case 'Mensile':   mesi[MESI_KEYS[si]] = 35; break;
    case 'Trimestrale':
      for (let i = 0; i < 3; i++) {
        if (si + i < MESI_KEYS.length) {
          const val = i < 2
            ? parseFloat((95 / 3).toFixed(2))
            : parseFloat((95 - 2 * parseFloat((95 / 3).toFixed(2))).toFixed(2));
          mesi[MESI_KEYS[si + i]] = val;
        }
      }
      break;
    case 'Stagionale': {
      const base = parseFloat((270 / MESI_KEYS.length).toFixed(2));
      const last = parseFloat((270 - base * (MESI_KEYS.length - 1)).toFixed(2));
      MESI_KEYS.forEach((m, i) => { mesi[m] = i < MESI_KEYS.length - 1 ? base : last; });
      break;
    }
  }
  return mesi;
}

/* ─── PERIODO ─── */
function getPeriodo(frequenza, dateStr, meseIdxOverride) {
  if (!dateStr && meseIdxOverride === undefined) return '';
  const si     = meseIdxOverride !== undefined ? meseIdxOverride : getMeseIdx(dateStr);
  const meseJS = MESI_JS[si];
  const y      = dateStr ? new Date(dateStr + 'T00:00:00').getFullYear() : new Date().getFullYear();
  const nome   = MESI_NOMI[meseJS];
  const cap    = s => s.charAt(0).toUpperCase() + s.slice(1);
  switch (frequenza) {
    case 'Lezione':
    case 'Metà mese':
    case 'Mensile':      return `${cap(nome)} ${y}`;
    case 'Trimestrale': {
      const ei = Math.min(si + 2, MESI_KEYS.length - 1);
      return `${cap(nome)} – ${cap(MESI_NOMI[MESI_JS[ei]])} ${y}`;
    }
    case 'Stagionale': {
      const sy = meseJS >= 8 ? y : y - 1;
      return `Stagionale ${sy}-${String(sy + 1).slice(2)}`;
    }
    case 'Iscrizione': {
      const sy = meseJS >= 8 ? y : y - 1;
      return `Stagione ${sy}-${String(sy + 1).slice(2)}`;
    }
    default: return '';
  }
}

/* ─── FORMATTAZIONE ─── */
function fmt(n) {
  if (!n || n === 0) return `<span class="cell-empty">—</span>`;
  return `<span class="cell-amount">€${n.toFixed(2).replace('.', ',')}</span>`;
}
function fmtPlain(n) {
  return n > 0 ? `€${n.toFixed(2).replace('.', ',')}` : '—';
}

/* ─── MIGRAZIONE: da interruttore "iscrizione" a pagamento vero e proprio ───
   Prima l'iscrizione era un semplice flag booleano sull'atleta, attivabile
   con un click. Ora è un pagamento a sé stante (frequenza "Iscrizione"),
   con la sua data, il suo tipo e una ricevuta dedicata. Per non perdere gli
   incassi già segnati come pagati con il vecchio sistema, ogni atleta con
   il flag true e nessun pagamento di iscrizione già registrato ne riceve
   automaticamente uno equivalente (data odierna e tipo "Contanti" come
   valori di default, dato che il vecchio flag non salvava né l'una né
   l'altro: se non corretti, si possono comunque modificare dal pulsante
   di modifica pagamenti). Idempotente: una volta migrato, il flag viene
   rimosso e non viene più ricreato nulla ai run successivi. */
function migrateIscrizioneFlags() {
  const main = loadMain();
  let changed = false;

  for (const r of main) {
    if (!r.nomeRagazzo || r.athleteId) continue; // solo record-identità atleta
    if (!r.iscrizione) continue;

    const giaPresente = main.some(p => p.athleteId === r.id && p.frequenza === 'Iscrizione');
    if (!giaPresente) {
      const dataPagamento = r.dataPagamento || new Date().toISOString().slice(0, 10);
      main.push({
        id:               uid(),
        athleteId:        r.id,
        dataPagamento,
        frequenza:        'Iscrizione',
        meseRiferimento:  null,
        periodo:          getPeriodo('Iscrizione', dataPagamento),
        tipoPagamento:    r.tipoPagamento || 'Contanti',
      });
    }
    delete r.iscrizione;
    changed = true;
  }

  if (changed) saveMain(main);
}

/* ─── SORT ─── */
function sortBy(key) {
  if (sortKey === key) sortAsc = !sortAsc; else { sortKey = key; sortAsc = true; }
  document.querySelectorAll('thead th').forEach(th => th.classList.remove('sorted'));
  const map = { cognome: 0, gruppo: 1, iscrizione: 6, totale: 16 };
  if (map[key] !== undefined) {
    const ths = document.querySelectorAll('thead th');
    if (ths[map[key]]) ths[map[key]].classList.add('sorted');
  }
  renderTable();
}

/* ─── RENDER TABLE ─── */
function renderTable() {
  const search     = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
  const gruppoF    = document.getElementById('filterGruppo')?.value || '';
  const tipoF      = document.getElementById('filterTipo')?.value || '';
  const athleteMap = buildAthleteData();

  let athletes = [...athleteMap.values()];
  if (search)  athletes = athletes.filter(a => a.nomeRagazzo.toLowerCase().includes(search));
  if (gruppoF) athletes = athletes.filter(a => a.gruppo === gruppoF);
  if (tipoF)   athletes = athletes.filter(a => (a.ultimoPagamento?.tipoPagamento || '') === tipoF);

  athletes = athletes.map(a => {
    const meseSum = MESI_KEYS.reduce((s, k) => s + (a.mesi[k] || 0), 0);
    const totale  = (a.iscrizioneTotale || 0) + meseSum;
    return { ...a, meseSum, totale };
  });

  athletes.sort((a, b) => {
    let va, vb, cognomeSort = false;
    if      (sortKey === 'cognome')    { va = a.cognome || a.nomeRagazzo; vb = b.cognome || b.nomeRagazzo; cognomeSort = true; }
    else if (sortKey === 'totale')     { va = a.totale;      vb = b.totale; }
    else if (sortKey === 'iscrizione') { va = a.iscrizionePagata ? 1 : 0; vb = b.iscrizionePagata ? 1 : 0; }
    else if (sortKey === 'gruppo')     { va = a.gruppo || ''; vb = b.gruppo || ''; }
    else                               { va = a.cognome || a.nomeRagazzo; vb = b.cognome || b.nomeRagazzo; cognomeSort = true; }
    if (typeof va === 'string') {
      const c = va.localeCompare(vb, 'it');
      if (c !== 0 || !cognomeSort) return sortAsc ? c : -c;
      const c2 = (a.nome || '').localeCompare(b.nome || '', 'it'); // stesso cognome: ordina per nome
      return sortAsc ? c2 : -c2;
    }
    return sortAsc ? va - vb : vb - va;
  });

  document.getElementById('recordCount').textContent = `${athletes.length} atleti`;

  const tbody = document.getElementById('tableBody');
  const tfoot = document.getElementById('tableFoot');
  const empty = document.getElementById('emptyState');

  if (!athletes.length) {
    tbody.innerHTML = '';
    tfoot.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  const colTotals   = blankMesi();
  let totIscrizioni = 0, totGrand = 0;

  tbody.innerHTML = athletes.map(({ id, nomeRagazzo, cognome, nome, gruppo, iscrizionePagata, iscrizioneTotale, mesi, totale, hasPayments, ultimoPagamento }) => {
    const etichetta = (cognome || nome) ? `${cognome} ${nome}`.trim() : nomeRagazzo;
    totIscrizioni += (iscrizioneTotale || 0);
    MESI_KEYS.forEach(k => colTotals[k] += (mesi[k] || 0));
    totGrand += totale;
    const gruppoHtml = gruppo
      ? `<span class="badge badge-gruppo-${gruppo.toLowerCase().replace(/\s+/g, '-')}">${escHtml(gruppo)}</span>`
      : '<span class="cell-empty">—</span>';
    const freqHtml = ultimoPagamento ? escHtml(ultimoPagamento.frequenza) : '<span class="cell-empty">—</span>';
    const periodoHtml = ultimoPagamento?.periodo ? escHtml(ultimoPagamento.periodo) : '<span class="cell-empty">—</span>';
    const tc = ultimoPagamento?.tipoPagamento ? TIPO_CLASS[ultimoPagamento.tipoPagamento] || '' : '';
    const tipoHtml = ultimoPagamento?.tipoPagamento
      ? `<span class="badge badge-${tc}">${escHtml(ultimoPagamento.tipoPagamento)}</span>`
      : '<span class="cell-empty">—</span>';
    const dataHtml = ultimoPagamento?.dataPagamento
      ? new Date(ultimoPagamento.dataPagamento + 'T00:00:00').toLocaleDateString('it-IT')
      : '<span class="cell-empty">—</span>';
    return `<tr>
      <td class="col-name" data-label="Atleta">
        <span class="player-name">${escHtml(etichetta)}</span>
        ${hasPayments ? `<button class="btn-edit-athlete" onclick="openAthleteModal('${escHtml(id)}')" title="Modifica pagamenti">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-edit-athlete" onclick="apriFinalizzaRicevuta('${escHtml(id)}','quote')" title="Genera ricevuta quote (PDF)">🧾</button>` : ''}
        ${iscrizionePagata ? `<button class="btn-edit-athlete" onclick="apriFinalizzaRicevuta('${escHtml(id)}','iscrizione')" title="Genera ricevuta iscrizione (PDF)">🎫</button>` : ''}
      </td>
      <td data-label="Gruppo">${gruppoHtml}</td>
      <td data-label="Frequenza">${freqHtml}</td>
      <td data-label="Periodo">${periodoHtml}</td>
      <td data-label="Tipo">${tipoHtml}</td>
      <td data-label="Data Pagamento">${dataHtml}</td>
      <td data-label="Iscrizione">
        <span class="badge ${iscrizionePagata ? 'badge-si' : 'badge-no'}">${iscrizionePagata ? '✓ Pagata' : '✗ Non pagata'}</span>
      </td>
      ${MESI_KEYS.map((k, i) => `<td class="cell-mese" data-label="${MESI_SHORT[i]}">${fmt(mesi[k] || 0)}</td>`).join('')}
      <td class="cell-totale" data-label="Totale">${totale > 0 ? `<strong>${fmtPlain(totale)}</strong>` : '<span class="cell-empty">—</span>'}</td>
    </tr>`;
  }).join('');

  tfoot.innerHTML = `<tr class="footer-row">
    <td><strong>Totali</strong></td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td data-label="Iscrizione"><strong>${totIscrizioni > 0 ? fmtPlain(totIscrizioni) : '—'}</strong></td>
    ${MESI_KEYS.map((k, i) => `<td class="cell-mese" data-label="${MESI_SHORT[i]}"><strong>${colTotals[k] > 0 ? fmtPlain(colTotals[k]) : '—'}</strong></td>`).join('')}
    <td class="cell-totale" data-label="Totale"><strong>${fmtPlain(totGrand)}</strong></td>
  </tr>`;
}

/* ─── MODAL AGGIUNGI PAGAMENTO ─── */
let _athleteSearchList = [];
let _athleteSearchSelectedLabel = '';

function openModal() {
  const main = loadMain();
  _athleteSearchList = [];
  for (const r of main) {
    if (!r.nomeRagazzo || r.athleteId) continue; // solo record-identità
    _athleteSearchList.push({ id: r.id, nomeRagazzo: r.nomeRagazzo, cognome: r.cognome || '', nome: r.nome || '', anno: r.anno || '', nomeGenitore: r.nomeGenitore || '' });
  }
  _athleteSearchList.sort((a, b) => (a.cognome || a.nomeRagazzo).localeCompare(b.cognome || b.nomeRagazzo, 'it') || a.nomeRagazzo.localeCompare(b.nomeRagazzo, 'it'));

  document.getElementById('payForm').reset();
  document.getElementById('f_atletaSearch').value = '';
  document.getElementById('f_nomeRagazzo').value = '';
  _athleteSearchSelectedLabel = '';
  document.getElementById('athleteSearchResults').style.display = 'none';
  document.getElementById('f_dataPagamento').value = new Date().toISOString().slice(0, 10);
  document.getElementById('previewWrap').style.display  = 'none';
  document.getElementById('meseRifWrap').style.display  = 'none';
  // default mese riferimento = mese scolastico corrente
  const todayM    = new Date().getMonth();
  const schoolIdx = MESI_JS.indexOf(todayM);
  document.getElementById('f_meseRiferimento').value = schoolIdx >= 0 ? schoolIdx : 0;
  document.getElementById('overlay').classList.add('open');
  setTimeout(() => document.getElementById('f_atletaSearch').focus(), 100);
}

function closeModal() {
  document.getElementById('overlay').classList.remove('open');
  document.getElementById('athleteSearchResults').style.display = 'none';
}

/* ─── RICERCA ATLETA (senza tendina) ───
   Si digitano le prime lettere del cognome (o nome) e appare l'elenco dei
   corrispondenti, come nella ricerca già usata nelle altre pagine. Se il
   testo digitato non corrisponde più alla selezione fatta, la selezione
   viene annullata per evitare di salvare un atleta diverso da quello scritto. */
function filterAthleteSearch() {
  const input   = document.getElementById('f_atletaSearch');
  const results = document.getElementById('athleteSearchResults');
  const q       = input.value.trim().toLowerCase();

  if (input.value !== _athleteSearchSelectedLabel) {
    document.getElementById('f_nomeRagazzo').value = '';
  }

  if (!q) { results.innerHTML = ''; results.style.display = 'none'; return; }

  const matches = _athleteSearchList.filter(a =>
    a.cognome.toLowerCase().includes(q) ||
    a.nome.toLowerCase().includes(q) ||
    a.nomeRagazzo.toLowerCase().includes(q)
  ).slice(0, 30);

  if (!matches.length) {
    results.innerHTML = '<div class="athlete-search-empty">Nessun atleta trovato</div>';
    results.style.display = 'block';
    return;
  }

  results.innerHTML = matches.map(a => {
    const etichetta = (a.cognome || a.nome) ? `${a.cognome} ${a.nome}`.trim() : a.nomeRagazzo;
    const dettagli  = [a.anno ? `${a.anno}` : '', a.nomeGenitore || ''].filter(Boolean).join(' – ');
    return `<div class="athlete-search-item" onclick="selectAthleteSearch('${escHtml(a.id)}')">
      <span>${escHtml(etichetta)}</span>
      ${dettagli ? `<small>${escHtml(dettagli)}</small>` : ''}
    </div>`;
  }).join('');
  results.style.display = 'block';
}

function selectAthleteSearch(id) {
  const a = _athleteSearchList.find(x => x.id === id);
  if (!a) return;
  const etichetta = (a.cognome || a.nome) ? `${a.cognome} ${a.nome}`.trim() : a.nomeRagazzo;
  document.getElementById('f_nomeRagazzo').value   = id;
  document.getElementById('f_atletaSearch').value  = etichetta;
  _athleteSearchSelectedLabel = etichetta;
  document.getElementById('athleteSearchResults').style.display = 'none';
  updatePreview();
}

document.addEventListener('click', e => {
  const wrap = document.querySelector('.athlete-search-wrap');
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById('athleteSearchResults').style.display = 'none';
  }
});

/* ─── PREVIEW ─── */
function updatePreview() {
  const frequenza = document.getElementById('f_frequenza').value;
  const dateStr   = document.getElementById('f_dataPagamento').value;
  const tipo      = document.getElementById('f_tipoPagamento').value;
  const wrap      = document.getElementById('previewWrap');
  const preview   = document.getElementById('mesiPreview');
  const meseWrap  = document.getElementById('meseRifWrap');

  const needsMese = ['Mensile', 'Metà mese'].includes(frequenza);
  meseWrap.style.display = needsMese ? '' : 'none';

  if (!frequenza) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';

  let meseIdxOverride;
  if (needsMese) {
    meseIdxOverride = parseInt(document.getElementById('f_meseRiferimento').value);
  }

  const isGratuito = tipo === 'Gratuito';
  const dist    = calcDistribuzione(frequenza, dateStr, meseIdxOverride, isGratuito);
  const importo = isGratuito ? 0 : FREQ_IMPORTO[frequenza];

  preview.innerHTML = MESI_KEYS.map((k, i) => {
    const val = dist[k];
    return `<span class="preview-mese ${val > 0 ? 'active' : ''}">
      <span class="preview-label">${MESI_SHORT[i]}</span>
      <span class="preview-val">${val > 0 ? '€' + val.toFixed(2).replace('.', ',') : '—'}</span>
    </span>`;
  }).join('') + `<div class="preview-total">Totale: <strong>€${importo.toFixed(2).replace('.', ',')}</strong></div>`;
}

/* ─── SALVA PAGAMENTO (unico database) ───
   Ogni salvataggio crea un NUOVO record di pagamento agganciato all'atleta
   tramite "athleteId": così un secondo pagamento si somma al primo invece
   di sovrascriverlo, ed atleti omonimi non si mischiano mai. */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function savePayment(e) {
  e && e.preventDefault();
  const athleteId = document.getElementById('f_nomeRagazzo').value;
  const frequenza = document.getElementById('f_frequenza').value;
  const dateStr   = document.getElementById('f_dataPagamento').value;
  const tipo      = document.getElementById('f_tipoPagamento').value;

  if (!athleteId) { toast('Seleziona un atleta dall\'elenco di ricerca', 'error'); return; }
  if (!frequenza) { toast('Seleziona la frequenza', 'error'); return; }

  const main        = loadMain();
  const athleteIdx  = main.findIndex(r => r.id === athleteId);
  if (athleteIdx === -1) { toast('Atleta non trovato', 'error'); return; }
  const athlete = main[athleteIdx];

  const needsMese       = ['Mensile', 'Metà mese'].includes(frequenza);
  const meseRiferimento = needsMese
    ? parseInt(document.getElementById('f_meseRiferimento').value)
    : null;
  const meseIdx = meseRiferimento !== null ? meseRiferimento : undefined;
  const periodo = getPeriodo(frequenza, dateStr, meseIdx);

  main.unshift({
    id:               uid(),
    athleteId,
    dataPagamento:    dateStr,
    frequenza,
    meseRiferimento,
    periodo,
    tipoPagamento:    tipo,
  });

  saveMain(main);

  closeModal();
  renderTable();
  toast(`Pagamento di ${athlete.nomeRagazzo} salvato ✓`, 'success');

  if (tipo === 'Contanti') {
    if (frequenza === 'Iscrizione') openWhatsAppIscrizione(athlete, dateStr, tipo);
    else openWhatsApp(athlete, frequenza, dateStr, tipo, periodo);
  }
}

function openWhatsApp(athlete, frequenza, dateStr, tipo, periodo) {
  if (!athlete.telefono) { toast('Nessun numero di telefono registrato per questo atleta', 'error'); return; }
  let phone = athlete.telefono.replace(/\D/g, '');
  if (phone.startsWith('0')) phone = phone.slice(1);
  if (!phone.startsWith('39')) phone = '39' + phone;
  const isGratuito = tipo === 'Gratuito';
  const importo  = isGratuito ? 0 : FREQ_IMPORTO[frequenza];
  const dataFmt  = dateStr ? new Date(dateStr + 'T00:00:00').toLocaleDateString('it-IT') : '—';
  const genitore = athlete.nomeGenitore || 'Genitore';
  const msg =
    `Gentile ${genitore},\n\n` +
    `abbiamo registrato il pagamento per *${athlete.nomeRagazzo}*:\n\n` +
    `📅 Data: ${dataFmt}\n` +
    `🔄 Frequenza: ${frequenza}${importo ? ' — €' + importo : (isGratuito ? ' — Gratuito' : '')}\n` +
    `📆 Periodo: ${periodo || '—'}\n` +
    `💳 Tipo: ${tipo || '—'}\n\n` +
    `Grazie per la fiducia! 🏀`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

/* Messaggio dedicato per il pagamento dell'iscrizione: separato da quello
   delle quote, non essendo più un'aggiunta ad un altro pagamento ma un
   pagamento a sé stante (frequenza "Iscrizione"). */
function openWhatsAppIscrizione(athlete, dateStr, tipo) {
  if (!athlete.telefono) { toast('Nessun numero di telefono registrato per questo atleta', 'error'); return; }
  let phone = athlete.telefono.replace(/\D/g, '');
  if (phone.startsWith('0')) phone = phone.slice(1);
  if (!phone.startsWith('39')) phone = '39' + phone;
  const dataFmt  = dateStr ? new Date(dateStr + 'T00:00:00').toLocaleDateString('it-IT') : '—';
  const genitore = athlete.nomeGenitore || 'Genitore';
  const msg =
    `Gentile ${genitore},\n\n` +
    `abbiamo registrato il pagamento della quota di iscrizione per *${athlete.nomeRagazzo}*:\n\n` +
    `📅 Data: ${dataFmt}\n` +
    `🎫 Iscrizione — €${ISCRIZIONE_QUOTA}\n` +
    `💳 Tipo: ${tipo || '—'}\n\n` +
    `Grazie per la fiducia! 🏀`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

/* ─── RICEVUTA DI PAGAMENTO (PDF) ───
   Un solo passo: si clicca l'icona della ricevuta (🧾/🎫), si apre un popup
   che chiede numero e data — mostrando anche un promemoria dell'ultima
   ricevuta creata, per non rischiare di ripetere un numero già usato — e
   alla conferma viene generato direttamente il PDF, con la stessa
   struttura a sezioni usata in precedenza per l'Excel. Solo a questo
   punto, per i pagamenti in contanti, il "lotto" incluso viene marcato
   come già ricevuto: la ricevuta successiva ripartirà da quanto pagato
   dopo, senza mai sommare due volte lo stesso importo. I pagamenti in
   Bonifico (o Gratuito) includono invece sempre e solo l'ultimo importo
   inserito. */
function _paymentMeseInfo(p) {
  const meseIdx = (p.meseRiferimento !== null && p.meseRiferimento !== undefined) ? p.meseRiferimento : getMeseIdx(p.dataPagamento);
  const meseJS  = MESI_JS[meseIdx];
  const anno    = p.dataPagamento ? new Date(p.dataPagamento + 'T00:00:00').getFullYear() : new Date().getFullYear();
  return { meseIdx, meseJS, anno };
}
function _cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

/* Le annate 2012-2014 giocano nel corso Basket, non più Minibasket: la
   ricevuta deve riportare la dicitura corretta a seconda dell'atleta. */
function _nomeCorso(anno) {
  const annoNum = parseInt(anno, 10);
  return [2012, 2013, 2014].includes(annoNum) ? 'Corso di Basket' : 'Corso di Minibasket';
}

/* Calcola SOLO i dati della ricevuta (quali pagamenti, importo, etichette),
   senza generare alcun file né modificare lo stato dei pagamenti. */
function _calcolaDatiRicevuta(id, matchFreq) {
  const main    = loadMain();
  const athlete = main.find(r => r.id === id);
  if (!athlete) return { errore: 'Atleta non trovato' };

  const pagamenti = main.filter(r => r.frequenza && matchFreq(r.frequenza) && r.dataPagamento && (r.athleteId === id || r.id === id));
  if (!pagamenti.length) return { errore: 'Nessun pagamento registrato per questo atleta' };
  const ultimo = pagamenti.reduce((a, b) => (a.dataPagamento > b.dataPagamento ? a : b));

  let batch, importo, frequenzaLabel, periodoLabel, tipoLabel;

  if (ultimo.tipoPagamento === 'Contanti') {
    batch = pagamenti
      .filter(p => p.tipoPagamento === 'Contanti' && !p.ricevutaEmessa)
      .sort((a, b) => a.dataPagamento.localeCompare(b.dataPagamento));
    if (!batch.length) return { errore: 'Nessun nuovo pagamento in contanti da inserire: è già tutto in una ricevuta precedente' };

    importo = parseFloat(batch.reduce((s, p) => s + (FREQ_IMPORTO[p.frequenza] || 0), 0).toFixed(2));

    const freqSet = [...new Set(batch.map(p => p.frequenza))];
    frequenzaLabel = freqSet.join(', ');

    const iniInfo = _paymentMeseInfo(batch[0]);
    const finInfo = _paymentMeseInfo(batch[batch.length - 1]);
    const nomeIni = _cap(MESI_NOMI[iniInfo.meseJS]);
    const nomeFin = _cap(MESI_NOMI[finInfo.meseJS]);
    periodoLabel = (iniInfo.meseIdx === finInfo.meseIdx && iniInfo.anno === finInfo.anno)
      ? `${nomeIni} ${iniInfo.anno}`
      : `${nomeIni} ${iniInfo.anno} – ${nomeFin} ${finInfo.anno}`;

    tipoLabel = 'Contanti';
  } else {
    batch = [ultimo];
    const isGratuito = ultimo.tipoPagamento === 'Gratuito';
    importo        = isGratuito ? 0 : (FREQ_IMPORTO[ultimo.frequenza] || 0);
    frequenzaLabel = ultimo.frequenza;
    periodoLabel   = ultimo.periodo || '';
    tipoLabel      = ultimo.tipoPagamento || '';
  }

  const dettaglioBatch = (tipoLabel === 'Contanti' && batch.length > 1)
    ? batch.map(p => p.periodo || '').filter(Boolean).join(' + ')
    : '';

  return { athlete, batch, importo, frequenzaLabel, periodoLabel, tipoLabel, dettaglioBatch };
}

function _nomeFileRicevuta(dati, filenameTag, ext) {
  const { athlete, periodoLabel } = dati;
  const periodoSlug = (periodoLabel || '').replace(/[^\w-]+/g, '_');
  const nomeSlug = `${athlete.cognome || ''}_${athlete.nome || ''}`.replace(/[^\w-]+/g, '_');
  return `ricevuta_${filenameTag}${nomeSlug}_${periodoSlug}.${ext}`;
}

/* Genera il PDF della ricevuta con jsPDF + autoTable: intestazione del
   club, sezioni DATI ATLETA / DATI GENITORE / DETTAGLIO PAGAMENTO, con gli
   stessi colori del resto del programma (nero + giallo per le sezioni) —
   la stessa struttura usata in precedenza per il file Excel. */
function _generaEScaricaPdf(dati, { descrizione, numeroRicevuta, dataRicevuta, filename }) {
  const { athlete, importo, frequenzaLabel, periodoLabel, tipoLabel, dettaglioBatch } = dati;
  const nascitaFmt      = athlete.dataNascita ? new Date(athlete.dataNascita + 'T00:00:00').toLocaleDateString('it-IT') : '';
  const luogoNascitaFmt = [athlete.luogoNascita, athlete.provinciaNascita ? `(${athlete.provinciaNascita})` : ''].filter(Boolean).join(' ');
  const indirizzoFmt    = [athlete.via, athlete.comune, athlete.provinciaResidenza ? `(${athlete.provinciaResidenza})` : ''].filter(Boolean).join(', ');
  const importoFmt      = `€ ${importo.toFixed(2).replace('.', ',')}`;
  const dataRicevutaFmt = dataRicevuta ? new Date(dataRicevuta + 'T00:00:00').toLocaleDateString('it-IT') : '';

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFont(undefined, 'bold');
  doc.setFontSize(15);
  doc.text('A.S.D. AVIS BASKET TRANI', 14, 18);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text('Via Parini, 4', 14, 25);
  doc.text('C.F.: 92071360728', 14, 30);
  doc.setFontSize(9);
  doc.setFont(undefined, 'italic');
  doc.text('Ricevuta di Pagamento — Centro Minibasket (cod. FIP 054580)', 14, 36);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);

  const sezioni = new Set(['DATI ATLETA', 'DATI GENITORE / PAGANTE', 'DETTAGLIO PAGAMENTO']);
  const righe = [
    ['N. Ricevuta', numeroRicevuta || ''],
    ['Data', dataRicevutaFmt],
    ['Descrizione', descrizione || ''],
    ['DATI ATLETA', ''],
    ['Cognome', athlete.cognome || ''],
    ['Nome', athlete.nome || ''],
    ['Data di nascita', nascitaFmt],
    ['Luogo di nascita', luogoNascitaFmt],
    ['Codice Fiscale', athlete.cf || ''],
    ['Indirizzo di residenza', indirizzoFmt],
    ['DATI GENITORE / PAGANTE', ''],
    ['Nome e Cognome', athlete.nomeGenitore || ''],
    ['Codice Fiscale', athlete.cfGenitore || ''],
    ['Telefono', athlete.telefono || ''],
    ['DETTAGLIO PAGAMENTO', ''],
    ['Tipo di Pagamento', tipoLabel || ''],
    ['Frequenza', frequenzaLabel || ''],
    ['Periodo di riferimento', periodoLabel || ''],
  ];
  if (dettaglioBatch) righe.push(['Mensilità incluse', dettaglioBatch]);
  righe.push(['Importo', importoFmt]);

  doc.autoTable({
    startY: 42,
    body: righe,
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 4, lineColor: [203, 213, 225], lineWidth: 0.1 },
    columnStyles: { 0: { fontStyle: 'bold', fillColor: [241, 245, 249], cellWidth: 65 }, 1: { cellWidth: 'auto' } },
    didParseCell: (data) => {
      if (sezioni.has(data.row.raw[0])) {
        data.cell.styles.fillColor   = [15, 15, 15];
        data.cell.styles.textColor   = [234, 179, 8];
        data.cell.styles.fontStyle   = 'bold';
      }
    },
  });

  const finalY = doc.lastAutoTable.finalY + 20;
  doc.setFontSize(10);
  doc.text('Firma: _______________________________', 14, finalY);

  doc.save(filename);
}

/* ─── GENERA RICEVUTA (🧾/🎫): numero + data → PDF ───
   Solo alla conferma del popup i pagamenti in contanti del lotto vengono
   marcati come "in ricevuta". */
let _finId   = null;
let _finTipo = null; // 'quote' | 'iscrizione'

function apriFinalizzaRicevuta(id, tipo) {
  _finId = id;
  _finTipo = tipo;
  document.getElementById('fin_numero').value = '';
  document.getElementById('fin_data').value = new Date().toISOString().slice(0, 10);
  document.getElementById('fin_importo').style.display = 'none';
  document.getElementById('fin_importo').value = '';

  const ultima = loadUltimaRicevuta();
  document.getElementById('fin_reminder').textContent = ultima
    ? `Ultima ricevuta creata: n. ${ultima.numero} del ${new Date(ultima.data + 'T00:00:00').toLocaleDateString('it-IT')}`
    : 'Nessuna ricevuta creata finora';

  document.getElementById('overlayFinalizza').classList.add('open');
  setTimeout(() => document.getElementById('fin_numero').focus(), 100);
}

/* Mostra il campo per sovrascrivere l'importo stampato in ricevuta (non
   tocca i pagamenti registrati, solo cosa viene scritto sul PDF). Se non
   viene cliccato, o il campo resta vuoto, l'importo resta quello calcolato
   automaticamente come prima. */
function toggleImportoPersonalizzato() {
  const input = document.getElementById('fin_importo');
  const show  = input.style.display === 'none';
  input.style.display = show ? '' : 'none';
  if (show && !input.value) {
    const matchFreq = _finTipo === 'iscrizione' ? (f => f === 'Iscrizione') : (f => f !== 'Iscrizione');
    const dati = _calcolaDatiRicevuta(_finId, matchFreq);
    if (!dati.errore) input.value = dati.importo.toFixed(2);
    input.focus();
  }
}

function closeFinalizzaModal() {
  document.getElementById('overlayFinalizza').classList.remove('open');
  _finId = null;
  _finTipo = null;
}

function confermaFinalizzaRicevuta(e) {
  e && e.preventDefault();
  const numero  = document.getElementById('fin_numero').value.trim();
  const dataStr = document.getElementById('fin_data').value;
  if (!numero)  { toast('Inserisci il numero della ricevuta', 'error'); return; }
  if (!dataStr) { toast('Inserisci la data della ricevuta', 'error'); return; }
  if (!_finId || !_finTipo) { toast('Errore interno: nessun atleta selezionato', 'error'); return; }

  const isIscrizione = _finTipo === 'iscrizione';
  const matchFreq     = isIscrizione ? (f => f === 'Iscrizione') : (f => f !== 'Iscrizione');
  const filenameTag    = isIscrizione ? 'iscrizione_' : '';

  const dati = _calcolaDatiRicevuta(_finId, matchFreq);
  if (dati.errore) { toast(dati.errore, 'error'); return; }

  const importoInput = document.getElementById('fin_importo');
  if (importoInput.style.display !== 'none' && importoInput.value !== '') {
    dati.importo = parseFloat(importoInput.value) || 0; // importo personalizzato, solo per il PDF
  }

  // Le annate 2012-2014 giocano nel corso Basket (non Minibasket): la
  // dicitura in ricevuta deve rifletterlo.
  const corso = _nomeCorso(dati.athlete.anno);
  const descrizione = isIscrizione ? `Quota di Iscrizione — ${corso}` : corso;

  try {
    const nomePdf = _nomeFileRicevuta(dati, filenameTag, 'pdf');
    _generaEScaricaPdf(dati, { descrizione, numeroRicevuta: numero, dataRicevuta: dataStr, filename: nomePdf });

    // Finalizzazione vera e propria: solo ora il lotto in contanti viene
    // marcato come ricevuto.
    if (dati.tipoLabel === 'Contanti') {
      const main = loadMain();
      const idsBatch = new Set(dati.batch.map(p => p.id));
      main.forEach(r => { if (idsBatch.has(r.id)) r.ricevutaEmessa = true; });
      saveMain(main);
    }

    saveUltimaRicevuta(numero, dataStr);

    closeFinalizzaModal();
    toast(`Ricevuta n. ${numero} di ${dati.athlete.nomeRagazzo} generata ✓`, 'success');
  } catch (err) {
    console.error(err);
    toast('Errore nella generazione del PDF', 'error');
  }
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
  const athleteMap = buildAthleteData();
  const athletes   = [...athleteMap.values()]
    .sort((a, b) => (a.cognome || a.nomeRagazzo).localeCompare(b.cognome || b.nomeRagazzo, 'it'));

  if (!athletes.length) { toast('Nessun dato da esportare', 'error'); return; }

  const header = ['Atleta', 'Gruppo', 'Frequenza', 'Periodo', 'Tipo', 'Data Pagamento', 'Iscrizione', ...MESI_SHORT, 'Totale'];
  const rows   = athletes.map(a => {
    const meseSum = MESI_KEYS.reduce((s, k) => s + (a.mesi[k] || 0), 0);
    const totale  = (a.iscrizioneTotale || 0) + meseSum;
    const up = a.ultimoPagamento;
    return [
      a.nomeRagazzo,
      a.gruppo || '',
      up?.frequenza || '',
      up?.periodo || '',
      up?.tipoPagamento || '',
      up?.dataPagamento || '',
      a.iscrizionePagata ? 'Pagata' : 'Non pagata',
      ...MESI_KEYS.map(k => a.mesi[k] > 0 ? a.mesi[k].toFixed(2).replace('.', ',') : '0'),
      totale.toFixed(2).replace('.', ',')
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';');
  });

  const csv = '﻿' + [header.join(';'), ...rows].join('\n');
  const el  = document.createElement('a');
  el.href     = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  el.download = `avis-basket-trani-quote-${new Date().toISOString().slice(0, 10)}.csv`;
  el.click();
  toast(`CSV esportato (${athletes.length} atleti) ✓`, 'success');
}

/* ─── MODAL PAGAMENTI ATLETA ─── */
let _mpId      = null;
let _epId      = null;
let _confirmId = null;

function openAthleteModal(id) {
  _mpId      = id;
  _epId      = null;
  _confirmId = null;
  const main    = loadMain();
  const athlete = main.find(r => r.id === id);
  document.getElementById('mpNome').textContent = athlete ? athlete.nomeRagazzo : '—';
  _refreshMpCount();
  renderAthletePayments();
  document.getElementById('overlayPagamenti').classList.add('open');
}

function closeAthleteModal() {
  document.getElementById('overlayPagamenti').classList.remove('open');
  _mpId = _epId = _confirmId = null;
}

function _pagamentiDiAtleta() {
  return loadMain().filter(r => r.frequenza && r.dataPagamento && (r.athleteId === _mpId || r.id === _mpId));
}

function _refreshMpCount() {
  const cnt = _pagamentiDiAtleta().length;
  document.getElementById('mpCount').textContent = cnt + (cnt === 1 ? ' pagamento' : ' pagamenti');
}

function renderAthletePayments() {
  const payments = _pagamentiDiAtleta();
  const body     = document.getElementById('mpBody');

  if (!payments.length) {
    body.innerHTML = '<p class="mp-empty">Nessun pagamento registrato.</p>';
    return;
  }

  body.innerHTML = payments.map(p => {
    const dataFmt = p.dataPagamento
      ? new Date(p.dataPagamento + 'T00:00:00').toLocaleDateString('it-IT')
      : '—';
    const isGratuito = p.tipoPagamento === 'Gratuito';
    const importo = isGratuito ? 0 : FREQ_IMPORTO[p.frequenza];
    const importoLabel = isGratuito ? ' — Gratuito' : (importo ? ` — €${importo}` : '');

    if (_epId === p.id) {
      return `<div class="mp-item mp-editing">
        <div class="form-grid">
          <div class="form-group">
            <label>Frequenza</label>
            <select id="ep_freq">
              <option value="Lezione"      ${p.frequenza==='Lezione'     ?'selected':''}>Lezione — €5</option>
              <option value="Metà mese"   ${p.frequenza==='Metà mese'  ?'selected':''}>Metà mese — €20</option>
              <option value="Mensile"      ${p.frequenza==='Mensile'     ?'selected':''}>Mensile — €35</option>
              ${p.frequenza === 'Trimestrale' ? `<option value="Trimestrale" selected>Trimestrale — €95</option>` : ''}
              <option value="Stagionale"  ${p.frequenza==='Stagionale' ?'selected':''}>Stagionale — €270</option>
              <option value="Iscrizione"  ${p.frequenza==='Iscrizione' ?'selected':''}>Iscrizione — €30</option>
            </select>
          </div>
          <div class="form-group">
            <label>Data Pagamento</label>
            <input type="date" id="ep_data" value="${p.dataPagamento || ''}">
          </div>
          <div class="form-group full">
            <label>Tipo di Pagamento</label>
            <select id="ep_tipo">
              <option value=""         ${!p.tipoPagamento          ?'selected':''}>—</option>
              <option value="Contanti" ${p.tipoPagamento==='Contanti'?'selected':''}>Contanti</option>
              <option value="Bonifico" ${p.tipoPagamento==='Bonifico'?'selected':''}>Bonifico</option>
              <option value="Gratuito" ${p.tipoPagamento==='Gratuito'?'selected':''}>Gratuito — €0</option>
            </select>
          </div>
        </div>
        <div class="mp-edit-btns">
          <button class="btn-cancel" onclick="cancelEditPayment()">Annulla</button>
          <button class="btn-save"   onclick="saveEditPayment('${p.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            Salva
          </button>
        </div>
      </div>`;
    }

    if (_confirmId === p.id) {
      return `<div class="mp-item mp-confirm">
        <div class="mp-info">
          <span class="mp-freq">${escHtml(p.frequenza)}${importoLabel}</span>
          <span class="mp-detail">${dataFmt} · ${escHtml(p.periodo || '—')}</span>
        </div>
        <div class="mp-confirm-msg">
          <span>Eliminare questo pagamento?</span>
          <div class="mp-confirm-btns">
            <button class="btn-cancel"      onclick="cancelDeletePayment()">Annulla</button>
            <button class="btn-del-confirm" onclick="confirmDeletePayment('${p.id}')">Elimina</button>
          </div>
        </div>
      </div>`;
    }

    return `<div class="mp-item">
      <div class="mp-info">
        <span class="mp-freq">${escHtml(p.frequenza)}${importoLabel}</span>
        <span class="mp-detail">${dataFmt} · ${escHtml(p.periodo || '—')} · ${escHtml(p.tipoPagamento || '—')}</span>
      </div>
      <div class="mp-btns">
        <button class="btn-icon btn-edit" onclick="startEditPayment('${p.id}')"    title="Modifica">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon btn-del"  onclick="askDeletePayment('${p.id}')"   title="Elimina">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

function startEditPayment(id) {
  _epId = id; _confirmId = null;
  renderAthletePayments();
}

function cancelEditPayment() {
  _epId = null;
  renderAthletePayments();
}

function saveEditPayment(id) {
  const freq = document.getElementById('ep_freq').value;
  const data = document.getElementById('ep_data').value;
  const tipo = document.getElementById('ep_tipo').value;
  const main = loadMain();
  const idx  = main.findIndex(r => r.id === id);
  if (idx === -1) return;
  main[idx].frequenza     = freq;
  main[idx].dataPagamento = data;
  main[idx].tipoPagamento = tipo;
  main[idx].periodo       = getPeriodo(freq, data, main[idx].meseRiferimento ?? undefined);
  saveMain(main);
  _epId = null;
  _refreshMpCount();
  renderAthletePayments();
  renderTable();
  toast('Pagamento aggiornato ✓', 'success');
}

function askDeletePayment(id) {
  _confirmId = id; _epId = null;
  renderAthletePayments();
}

function cancelDeletePayment() {
  _confirmId = null;
  renderAthletePayments();
}

function confirmDeletePayment(id) {
  const main = loadMain();
  const idx  = main.findIndex(r => r.id === id);
  if (idx !== -1) {
    if (main[idx].athleteId) {
      // record di pagamento dedicato: esiste solo per rappresentare questo
      // pagamento, quindi va rimosso del tutto
      main.splice(idx, 1);
    } else {
      // record storico combinato con l'anagrafica: mantieni l'atleta,
      // svuota solo i campi del pagamento
      main[idx].dataPagamento   = '';
      main[idx].frequenza       = '';
      main[idx].meseRiferimento = null;
      main[idx].periodo         = '';
      main[idx].tipoPagamento   = '';
    }
  }
  saveMain(main);
  _confirmId = null;
  _refreshMpCount();
  renderAthletePayments();
  renderTable();
  toast('Pagamento eliminato', 'success');
}

/* ─── EVENTI ─── */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.getElementById('overlayFinalizza').classList.contains('open')) closeFinalizzaModal();
  else if (document.getElementById('overlayPagamenti').classList.contains('open')) closeAthleteModal();
  else closeModal();
});
document.getElementById('overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('overlay')) closeModal();
});
document.getElementById('overlayPagamenti').addEventListener('click', e => {
  if (e.target === document.getElementById('overlayPagamenti')) closeAthleteModal();
});
document.getElementById('overlayFinalizza').addEventListener('click', e => {
  if (e.target === document.getElementById('overlayFinalizza')) closeFinalizzaModal();
});

/* ─── INIT ─── */
migrateIscrizioneFlags();
renderTable();
