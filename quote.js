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
      accontoVersato:         0,
      accontoTotale:          0,
      _accontoUltimaData:     null,
      metaQuotaInfo:          null,
      _metaQuotaUltimaData:   null,
    });
  }

  const applyPagamento = (entry, r) => {
    if (!r.frequenza || !r.dataPagamento) return;
    entry.hasPayments = true;

    // Pagamento marcato come "Acconto": si somma a quelli già versati per lo
    // stesso atleta, mostrando sotto il nome quanto manca rispetto alla
    // quota intera della frequenza scelta nell'ultimo acconto registrato.
    if (r.tipoImporto === 'acconto') {
      const versato = r.importoPersonalizzato ?? FREQ_IMPORTO[r.frequenza] ?? 0;
      entry.accontoVersato = parseFloat((entry.accontoVersato + versato).toFixed(2));
      if (!entry._accontoUltimaData || r.dataPagamento > entry._accontoUltimaData) {
        entry._accontoUltimaData = r.dataPagamento;
        entry.accontoTotale = FREQ_IMPORTO[r.frequenza] || 0;
      }
    }

    // Pagamento marcato come "Metà quota": non si accumula (ogni pagamento
    // resta a sé), si mostra solo l'ultimo registrato sotto il nome.
    if (r.tipoImporto === 'meta') {
      if (!entry._metaQuotaUltimaData || r.dataPagamento > entry._metaQuotaUltimaData) {
        entry._metaQuotaUltimaData = r.dataPagamento;
        entry.metaQuotaInfo = {
          importo: r.importoPersonalizzato ?? FREQ_IMPORTO[r.frequenza] ?? 0,
          totale:  FREQ_IMPORTO[r.frequenza] || 0,
        };
      }
    }

    // L'iscrizione è un pagamento a sé stante: ha la sua colonna dedicata e
    // non entra mai nella distribuzione delle 9 mensilità né nell'"ultimo
    // pagamento" mostrato nelle colonne Frequenza/Periodo/Tipo/Data.
    if (r.frequenza === 'Iscrizione') {
      entry.iscrizionePagata = true;
      const isGratuito = r.tipoPagamento === 'Gratuito';
      const importo = isGratuito ? 0 : (r.importoPersonalizzato ?? FREQ_IMPORTO.Iscrizione ?? 0);
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
    const dist = calcDistribuzione(r.frequenza, r.dataPagamento, meseIdx, isGratuito, r.importoPersonalizzato);
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

/* "importoOverride" sostituisce l'importo fisso della frequenza (usato per
   i pagamenti con importo personalizzato): la ripartizione sui mesi resta
   identica, cambia solo la cifra totale da ripartire. */
function calcDistribuzione(frequenza, dateStr, meseIdxOverride, isGratuito, importoOverride) {
  const mesi = blankMesi();
  if (isGratuito) return mesi;
  const si  = meseIdxOverride !== undefined ? meseIdxOverride : getMeseIdx(dateStr);
  const tot = (importoOverride !== undefined && importoOverride !== null && importoOverride !== '')
    ? parseFloat(importoOverride) : null;
  switch (frequenza) {
    case 'Lezione':    mesi[MESI_KEYS[si]] = tot ?? 5;  break;
    case 'Metà mese': mesi[MESI_KEYS[si]] = tot ?? 20; break;
    case 'Mensile':   mesi[MESI_KEYS[si]] = tot ?? 35; break;
    case 'Trimestrale': {
      const t = tot ?? 95;
      for (let i = 0; i < 3; i++) {
        if (si + i < MESI_KEYS.length) {
          const val = i < 2
            ? parseFloat((t / 3).toFixed(2))
            : parseFloat((t - 2 * parseFloat((t / 3).toFixed(2))).toFixed(2));
          mesi[MESI_KEYS[si + i]] = val;
        }
      }
      break;
    }
    case 'Stagionale': {
      const t    = tot ?? 270;
      const base = parseFloat((t / MESI_KEYS.length).toFixed(2));
      const last = parseFloat((t - base * (MESI_KEYS.length - 1)).toFixed(2));
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

  tbody.innerHTML = athletes.map(({ id, nomeRagazzo, cognome, nome, gruppo, iscrizionePagata, iscrizioneTotale, mesi, totale, hasPayments, ultimoPagamento, accontoVersato, accontoTotale, metaQuotaInfo }) => {
    const etichetta = (cognome || nome) ? `${cognome} ${nome}`.trim() : nomeRagazzo;
    const accontoSuperato = accontoVersato > accontoTotale;
    const accontoHtml = accontoVersato > 0
      ? `<span class="acconto-note${accontoSuperato ? ' warning' : ''}">Ha versato €${accontoVersato.toFixed(2).replace('.', ',')} di acconto su €${accontoTotale.toFixed(2).replace('.', ',')} totale${accontoSuperato ? ' — supera la quota piena' : ''}</span>`
      : '';
    const metaSuperato = !!metaQuotaInfo && metaQuotaInfo.importo > metaQuotaInfo.totale;
    const metaHtml = metaQuotaInfo
      ? `<span class="acconto-note${metaSuperato ? ' warning' : ''}">Metà quota: €${metaQuotaInfo.importo.toFixed(2).replace('.', ',')} su €${metaQuotaInfo.totale.toFixed(2).replace('.', ',')} totale${metaSuperato ? ' — supera la quota piena' : ''}</span>`
      : '';
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
        ${accontoHtml}
        ${metaHtml}
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
  document.getElementById('importoPersonalizzatoWrap').style.display = 'none';
  document.getElementById('personalizzaImportoBtnWrap').style.display = '';
  document.getElementById('f_importoPersonalizzato').value = '';
  document.getElementById('f_tipoImporto').value = 'meta';
  document.getElementById('importoInfo').style.display = 'none';
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

/* ─── IMPORTO PERSONALIZZATO (popup Aggiungi Pagamento) ───
   Permette di sovrascrivere l'importo fisso della frequenza scelta: la
   cifra inserita viene comunque ripartita sui mesi secondo la stessa
   logica (calcDistribuzione), la categoria resta quella della tendina.
   "Acconto" in più accumula, sotto il nome dell'atleta, quanto versato
   rispetto alla quota intera; "Metà quota" è solo un importo diverso,
   senza alcun riepilogo aggiuntivo. */
function _importoPersonalizzatoAttivo() {
  const wrap = document.getElementById('importoPersonalizzatoWrap');
  return wrap && wrap.style.display !== 'none';
}

/* Somma degli acconti già registrati per lo stesso atleta e la stessa
   frequenza, usata per avvisare se il nuovo acconto supera la quota piena. */
function _accontoGiaVersato(athleteId, frequenza) {
  if (!athleteId) return 0;
  return loadMain()
    .filter(r => r.athleteId === athleteId && r.frequenza === frequenza && r.tipoImporto === 'acconto')
    .reduce((s, r) => s + (r.importoPersonalizzato ?? FREQ_IMPORTO[frequenza] ?? 0), 0);
}

/* Mostra, sotto i campi importo/tipo, se si tratta di un acconto o di una
   metà quota e se la cifra (già versato incluso, per l'acconto) supera la
   quota piena della frequenza scelta. */
function _aggiornaImportoInfo() {
  const info = document.getElementById('importoInfo');
  if (!_importoPersonalizzatoAttivo()) { info.style.display = 'none'; return; }

  const frequenza   = document.getElementById('f_frequenza').value;
  const tipoImporto = document.getElementById('f_tipoImporto').value;
  const importoRaw  = document.getElementById('f_importoPersonalizzato').value;
  if (importoRaw === '' || !frequenza) { info.style.display = 'none'; return; }

  const nuovoImporto = parseFloat(importoRaw) || 0;
  const totaleRif    = FREQ_IMPORTO[frequenza] || 0;
  const athleteId    = document.getElementById('f_nomeRagazzo').value;
  const label        = tipoImporto === 'acconto' ? 'Acconto' : 'Metà quota';
  const proiettato   = tipoImporto === 'acconto' ? _accontoGiaVersato(athleteId, frequenza) + nuovoImporto : nuovoImporto;
  const superato     = totaleRif > 0 && proiettato > totaleRif;

  info.className   = 'importo-info' + (superato ? ' warning' : '');
  info.textContent = `${label}: €${proiettato.toFixed(2).replace('.', ',')} su €${totaleRif.toFixed(2).replace('.', ',')} totale`
    + (superato ? ' — supera la quota piena' : '');
  info.style.display = '';
}

function toggleImportoPersonalizzatoPagamento() {
  const wrap  = document.getElementById('importoPersonalizzatoWrap');
  const input = document.getElementById('f_importoPersonalizzato');
  const show  = wrap.style.display === 'none';
  wrap.style.display = show ? '' : 'none';
  if (show) {
    const frequenza = document.getElementById('f_frequenza').value;
    if (!input.value && FREQ_IMPORTO[frequenza] !== undefined) input.value = FREQ_IMPORTO[frequenza].toFixed(2);
    input.focus();
  } else {
    input.value = '';
    document.getElementById('f_tipoImporto').value = 'meta';
  }
  updatePreview();
}

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

  // L'importo personalizzato/acconto non si applica all'Iscrizione.
  const importoBtnWrap = document.getElementById('personalizzaImportoBtnWrap');
  if (frequenza === 'Iscrizione') {
    importoBtnWrap.style.display = 'none';
    document.getElementById('importoPersonalizzatoWrap').style.display = 'none';
    document.getElementById('f_importoPersonalizzato').value = '';
    document.getElementById('f_tipoImporto').value = 'meta';
  } else {
    importoBtnWrap.style.display = '';
  }

  _aggiornaImportoInfo();

  if (!frequenza) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';

  let meseIdxOverride;
  if (needsMese) {
    meseIdxOverride = parseInt(document.getElementById('f_meseRiferimento').value);
  }

  const isGratuito    = tipo === 'Gratuito';
  const importoCustom = _importoPersonalizzatoAttivo() ? document.getElementById('f_importoPersonalizzato').value : undefined;
  const dist    = calcDistribuzione(frequenza, dateStr, meseIdxOverride, isGratuito, importoCustom);
  const importo = isGratuito ? 0 : (importoCustom !== undefined && importoCustom !== '' ? parseFloat(importoCustom) : FREQ_IMPORTO[frequenza]);

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

  const usaImportoCustom = _importoPersonalizzatoAttivo() && document.getElementById('f_importoPersonalizzato').value !== '';
  const importoPersonalizzato = usaImportoCustom ? parseFloat(document.getElementById('f_importoPersonalizzato').value) || 0 : undefined;
  const tipoImporto = usaImportoCustom ? document.getElementById('f_tipoImporto').value : undefined; // 'meta' | 'acconto'

  const record = {
    id:               uid(),
    athleteId,
    dataPagamento:    dateStr,
    frequenza,
    meseRiferimento,
    periodo,
    tipoPagamento:    tipo,
  };
  if (importoPersonalizzato !== undefined) record.importoPersonalizzato = importoPersonalizzato;
  if (tipoImporto) record.tipoImporto = tipoImporto; // 'meta' | 'acconto'
  main.unshift(record);

  saveMain(main);

  closeModal();
  renderTable();
  toast(`Pagamento di ${athlete.nomeRagazzo} salvato ✓`, 'success');

  if (tipo === 'Contanti') {
    if (frequenza === 'Iscrizione') openWhatsAppIscrizione(athlete, dateStr, tipo, importoPersonalizzato);
    else openWhatsApp(athlete, frequenza, dateStr, tipo, periodo, importoPersonalizzato);
  }
}

function openWhatsApp(athlete, frequenza, dateStr, tipo, periodo, importoCustom) {
  if (!athlete.telefono) { toast('Nessun numero di telefono registrato per questo atleta', 'error'); return; }
  let phone = athlete.telefono.replace(/\D/g, '');
  if (phone.startsWith('0')) phone = phone.slice(1);
  if (!phone.startsWith('39')) phone = '39' + phone;
  const isGratuito = tipo === 'Gratuito';
  const importo  = isGratuito ? 0 : (importoCustom ?? FREQ_IMPORTO[frequenza]);
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
function openWhatsAppIscrizione(athlete, dateStr, tipo, importoCustom) {
  if (!athlete.telefono) { toast('Nessun numero di telefono registrato per questo atleta', 'error'); return; }
  let phone = athlete.telefono.replace(/\D/g, '');
  if (phone.startsWith('0')) phone = phone.slice(1);
  if (!phone.startsWith('39')) phone = '39' + phone;
  const dataFmt  = dateStr ? new Date(dateStr + 'T00:00:00').toLocaleDateString('it-IT') : '—';
  const genitore = athlete.nomeGenitore || 'Genitore';
  const importo  = importoCustom ?? ISCRIZIONE_QUOTA;
  const msg =
    `Gentile ${genitore},\n\n` +
    `abbiamo registrato il pagamento della quota di iscrizione per *${athlete.nomeRagazzo}*:\n\n` +
    `📅 Data: ${dataFmt}\n` +
    `🎫 Iscrizione — €${importo}\n` +
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

/* Etichetta "Acconto"/"Metà quota" da affiancare alla frequenza in ricevuta
   (es. "Stagionale - Acconto"), quando il pagamento aveva un importo
   personalizzato di questo tipo. */
function _tipoImportoLabel(tipoImporto) {
  if (tipoImporto === 'acconto') return 'Acconto';
  if (tipoImporto === 'meta')    return 'Metà quota';
  return '';
}

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

    importo = parseFloat(batch.reduce((s, p) => s + (p.importoPersonalizzato ?? FREQ_IMPORTO[p.frequenza] ?? 0), 0).toFixed(2));

    const freqSet = [...new Set(batch.map(p => p.frequenza))];
    const tipoImportoSet = [...new Set(batch.map(p => p.tipoImporto).filter(Boolean))];
    const suffixBatch = tipoImportoSet.length === 1 ? ` - ${_tipoImportoLabel(tipoImportoSet[0])}` : '';
    frequenzaLabel = freqSet.join(', ') + suffixBatch;

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
    importo        = isGratuito ? 0 : (ultimo.importoPersonalizzato ?? FREQ_IMPORTO[ultimo.frequenza] ?? 0);
    frequenzaLabel = ultimo.frequenza + (ultimo.tipoImporto ? ` - ${_tipoImportoLabel(ultimo.tipoImporto)}` : '');
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

/* Firma scansionata, incollata in calce ad ogni ricevuta al posto della
   riga "Firma: ___". */
const FIRMA_IMG_B64 = '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';

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
    ['Codice Fiscale / Indirizzo', `${athlete.cf || ''}  —  ${indirizzoFmt}`],
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

  let finalY = doc.lastAutoTable.finalY + 10;
  const pageHeight = doc.internal.pageSize.getHeight();
  if (finalY + 15 > pageHeight) { finalY = 20; doc.addPage(); } // solo come ultima rete, evita che la firma venga tagliata
  doc.setFontSize(10);
  doc.text('Firma:', 14, finalY);
  doc.addImage(FIRMA_IMG_B64, 'PNG', 14, finalY + 3, 48, 7.3);

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

  const ultima = loadUltimaRicevuta();
  document.getElementById('fin_reminder').textContent = ultima
    ? `Ultima ricevuta creata: n. ${ultima.numero} del ${new Date(ultima.data + 'T00:00:00').toLocaleDateString('it-IT')}`
    : 'Nessuna ricevuta creata finora';

  document.getElementById('overlayFinalizza').classList.add('open');
  setTimeout(() => document.getElementById('fin_numero').focus(), 100);
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
    const importo = isGratuito ? 0 : (p.importoPersonalizzato ?? FREQ_IMPORTO[p.frequenza]);
    const importoTag = p.tipoImporto === 'acconto' ? ' (Acconto)' : p.tipoImporto === 'meta' ? ' (Metà quota)' : '';
    const importoLabel = isGratuito ? ' — Gratuito' : (importo ? ` — €${importo}${importoTag}` : '');

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
