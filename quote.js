/* ─── COSTANTI ─── */
const MESI_KEYS  = ['settembre','ottobre','novembre','dicembre','gennaio','febbraio','marzo','aprile','maggio'];
const MESI_SHORT = ['Set','Ott','Nov','Dic','Gen','Feb','Mar','Apr','Mag'];
const MESI_JS    = [8, 9, 10, 11, 0, 1, 2, 3, 4];
const MESI_NOMI  = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];

/* Trimestrale non è più selezionabile per nuovi pagamenti, ma resta qui
   per calcolare correttamente i pagamenti storici già salvati con questa frequenza. */
const FREQ_IMPORTO   = { Lezione: 5, 'Metà mese': 20, Mensile: 35, Trimestrale: 95, Stagionale: 270 };
const ISCRIZIONE_QUOTA = 30;
const TIPO_CLASS = { Contanti: 'contanti', Bonifico: 'bonifico', Gratuito: 'gratuito' };

let sortKey = 'cognome';
let sortAsc = true;

/* ─── STORAGE – unico database ─── */
function loadMain()  { return JSON.parse(localStorage.getItem('avisBasketPagamenti') || '[]'); }
function saveMain(d) { localStorage.setItem('avisBasketPagamenti', JSON.stringify(d)); }

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
      id:              r.id,
      nomeRagazzo:     r.nomeRagazzo,
      cognome:         r.cognome || '',
      anno:            r.anno || '',
      gruppo:          r.gruppo || '',
      iscrizione:      !!r.iscrizione,
      nomeGenitore:    r.nomeGenitore || '',
      telefono:        r.telefono || '',
      hasPayments:     false,
      mesi:            blankMesi(),
      ultimoPagamento: null,
    });
  }

  const applyPagamento = (entry, r) => {
    if (!r.frequenza || !r.dataPagamento) return;
    entry.hasPayments = true;
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

/* ─── TOGGLE ISCRIZIONE (per id univoco) ─── */
function toggleIscrizione(id) {
  const main = loadMain();
  const idx  = main.findIndex(r => r.id === id);
  if (idx === -1) return;
  main[idx].iscrizione = !main[idx].iscrizione;
  saveMain(main);
  renderTable();
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
    const totale  = (a.iscrizione ? ISCRIZIONE_QUOTA : 0) + meseSum;
    return { ...a, meseSum, totale };
  });

  athletes.sort((a, b) => {
    let va, vb;
    if      (sortKey === 'cognome')    { va = a.cognome || a.nomeRagazzo; vb = b.cognome || b.nomeRagazzo; }
    else if (sortKey === 'totale')     { va = a.totale;      vb = b.totale; }
    else if (sortKey === 'iscrizione') { va = a.iscrizione ? 1 : 0; vb = b.iscrizione ? 1 : 0; }
    else if (sortKey === 'gruppo')     { va = a.gruppo || ''; vb = b.gruppo || ''; }
    else                               { va = a.cognome || a.nomeRagazzo; vb = b.cognome || b.nomeRagazzo; }
    if (typeof va === 'string') {
      const c = va.localeCompare(vb, 'it');
      return sortAsc ? c : -c;
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

  tbody.innerHTML = athletes.map(({ id, nomeRagazzo, gruppo, iscrizione, mesi, totale, hasPayments, ultimoPagamento }) => {
    const iscAmt = iscrizione ? ISCRIZIONE_QUOTA : 0;
    totIscrizioni += iscAmt;
    MESI_KEYS.forEach(k => colTotals[k] += (mesi[k] || 0));
    totGrand += totale;
    const gruppoHtml = gruppo
      ? `<span class="badge badge-gruppo-${gruppo.toLowerCase()}">${escHtml(gruppo)}</span>`
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
        <span class="player-name">${escHtml(nomeRagazzo)}</span>
        ${hasPayments ? `<button class="btn-edit-athlete" onclick="openAthleteModal('${escHtml(id)}')" title="Modifica pagamenti">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-edit-athlete" onclick="generaRicevuta('${escHtml(id)}')" title="Genera ricevuta di pagamento (Excel)">🧾</button>` : ''}
      </td>
      <td data-label="Gruppo">${gruppoHtml}</td>
      <td data-label="Frequenza">${freqHtml}</td>
      <td data-label="Periodo">${periodoHtml}</td>
      <td data-label="Tipo">${tipoHtml}</td>
      <td data-label="Data Pagamento">${dataHtml}</td>
      <td data-label="Iscrizione">
        <button class="toggle-iscrizione ${iscrizione ? 'is-paid' : 'is-unpaid'}"
                onclick="toggleIscrizione('${escHtml(id)}')"
                title="Clicca per cambiare">
          ${iscrizione ? '✓ Pagata' : '✗ Non pagata'}
        </button>
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
function openModal() {
  const main = loadMain();
  const athletes = [];
  for (const r of main) {
    if (!r.nomeRagazzo || r.athleteId) continue; // solo record-identità
    athletes.push({ id: r.id, nomeRagazzo: r.nomeRagazzo, cognome: r.cognome || '', nome: r.nome || '', anno: r.anno || '', nomeGenitore: r.nomeGenitore || '' });
  }
  athletes.sort((a, b) => (a.cognome || a.nomeRagazzo).localeCompare(b.cognome || b.nomeRagazzo, 'it') || a.nomeRagazzo.localeCompare(b.nomeRagazzo, 'it'));

  const sel = document.getElementById('f_nomeRagazzo');
  sel.innerHTML = '<option value="">Seleziona atleta…</option>' +
    athletes.map(a => {
      const etichetta = (a.cognome || a.nome) ? `${a.cognome} ${a.nome}`.trim() : a.nomeRagazzo;
      const dettagli = [a.anno ? `${a.anno}` : '', a.nomeGenitore || ''].filter(Boolean).join(' – ');
      return `<option value="${escHtml(a.id)}">${escHtml(etichetta)}${dettagli ? ' (' + escHtml(dettagli) + ')' : ''}</option>`;
    }).join('');

  document.getElementById('payForm').reset();
  document.getElementById('f_dataPagamento').value = new Date().toISOString().slice(0, 10);
  document.getElementById('previewWrap').style.display  = 'none';
  document.getElementById('meseRifWrap').style.display  = 'none';
  // default mese riferimento = mese scolastico corrente
  const todayM    = new Date().getMonth();
  const schoolIdx = MESI_JS.indexOf(todayM);
  document.getElementById('f_meseRiferimento').value = schoolIdx >= 0 ? schoolIdx : 0;
  document.getElementById('overlay').classList.add('open');
  setTimeout(() => document.getElementById('f_nomeRagazzo').focus(), 100);
}

function closeModal() {
  document.getElementById('overlay').classList.remove('open');
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
  const iscrizioneChecked = document.getElementById('f_iscrizione').checked;

  if (!athleteId) { toast('Seleziona un atleta', 'error'); return; }
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

  if (iscrizioneChecked) athlete.iscrizione = true; // athlete è un riferimento diretto: valido anche dopo unshift

  saveMain(main);

  closeModal();
  renderTable();
  toast(`Pagamento di ${athlete.nomeRagazzo} salvato ✓`, 'success');

  if (tipo === 'Contanti') openWhatsApp(athlete, frequenza, dateStr, tipo, periodo);
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

/* ─── RICEVUTA DI PAGAMENTO (Excel) ───
   Genera un file .xls con i dati dell'atleta e SOLO l'ultimo pagamento
   registrato al momento del click: se in settembre si genera una ricevuta
   e poi si registra un nuovo pagamento a ottobre, la ricevuta generata a
   ottobre conterrà solo il pagamento di ottobre (ogni click legge lo stato
   più recente, non accumula i pagamenti precedenti). Ogni file scaricato è
   indipendente e nominato con il periodo, quindi non sovrascrive i
   precedenti già salvati sul computer. Data e numero ricevuta sono lasciati
   vuoti per la compilazione manuale.  */
function generaRicevuta(id) {
  const main    = loadMain();
  const athlete = main.find(r => r.id === id);
  if (!athlete) { toast('Atleta non trovato', 'error'); return; }

  const pagamenti = main.filter(r => r.frequenza && r.dataPagamento && (r.athleteId === id || r.id === id));
  if (!pagamenti.length) { toast('Nessun pagamento registrato per questo atleta', 'error'); return; }
  const ultimo = pagamenti.reduce((a, b) => (a.dataPagamento > b.dataPagamento ? a : b));

  const isGratuito = ultimo.tipoPagamento === 'Gratuito';
  const importo    = isGratuito ? 0 : (FREQ_IMPORTO[ultimo.frequenza] || 0);
  const importoFmt = `€ ${importo.toFixed(2).replace('.', ',')}`;
  const nascitaFmt  = athlete.dataNascita ? new Date(athlete.dataNascita + 'T00:00:00').toLocaleDateString('it-IT') : '';
  const luogoNascitaFmt = [athlete.luogoNascita, athlete.provinciaNascita ? `(${athlete.provinciaNascita})` : ''].filter(Boolean).join(' ');
  const indirizzoFmt = [athlete.via, athlete.comune, athlete.provinciaResidenza ? `(${athlete.provinciaResidenza})` : ''].filter(Boolean).join(', ');

  const riga = (label, value) =>
    `<tr><td style="font-weight:bold;background:#F1F5F9;padding:6px 10px;border:1px solid #CBD5E1;white-space:nowrap">${escHtml(label)}</td>` +
    `<td style="padding:6px 10px;border:1px solid #CBD5E1">${escHtml(value || '')}</td></tr>`;
  const sezione = (titolo) =>
    `<tr><td colspan="2" style="font-weight:bold;background:#0F0F0F;color:#EAB308;padding:7px 10px;border:1px solid #CBD5E1">${escHtml(titolo)}</td></tr>`;

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8"></head>
<body>
<table style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:13px;width:520px">
  <tr><td colspan="2" style="font-size:17px;font-weight:bold;padding:12px 10px;border:1px solid #CBD5E1">A.S.D. AVIS BASKET TRANI</td></tr>
  <tr><td colspan="2" style="padding:4px 10px;border:1px solid #CBD5E1;color:#64748B">Ricevuta di Pagamento — Centro Minibasket (cod. FIP 054580)</td></tr>
  ${riga('N. Ricevuta', '')}
  ${riga('Data', '')}
  ${sezione('DATI ATLETA')}
  ${riga('Cognome', athlete.cognome)}
  ${riga('Nome', athlete.nome)}
  ${riga('Data di nascita', nascitaFmt)}
  ${riga('Luogo di nascita', luogoNascitaFmt)}
  ${riga('Codice Fiscale', athlete.cf)}
  ${riga('Indirizzo di residenza', indirizzoFmt)}
  ${riga('Gruppo', athlete.gruppo)}
  ${riga('Anno', athlete.anno)}
  ${sezione('DATI GENITORE / PAGANTE')}
  ${riga('Nome e Cognome', athlete.nomeGenitore)}
  ${riga('Codice Fiscale', athlete.cfGenitore)}
  ${riga('Telefono', athlete.telefono)}
  ${sezione('DETTAGLIO PAGAMENTO')}
  ${riga('Tipo di Pagamento', ultimo.tipoPagamento)}
  ${riga('Frequenza', ultimo.frequenza)}
  ${riga('Periodo di riferimento', ultimo.periodo)}
  ${riga('Importo', importoFmt)}
  <tr><td colspan="2" style="padding:28px 10px 6px;border:1px solid #CBD5E1">&nbsp;</td></tr>
  <tr><td colspan="2" style="padding:6px 10px;border:1px solid #CBD5E1">Firma: _______________________________</td></tr>
</table>
</body></html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const periodoSlug = (ultimo.periodo || ultimo.dataPagamento || '').replace(/[^\w-]+/g, '_');
  const nomeSlug = `${athlete.cognome || ''}_${athlete.nome || ''}`.replace(/[^\w-]+/g, '_');
  a.download = `ricevuta_${nomeSlug}_${periodoSlug}.xls`;
  a.click();
  toast(`Ricevuta di ${athlete.nomeRagazzo} generata ✓`, 'success');
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
    const totale  = (a.iscrizione ? ISCRIZIONE_QUOTA : 0) + meseSum;
    const up = a.ultimoPagamento;
    return [
      a.nomeRagazzo,
      a.gruppo || '',
      up?.frequenza || '',
      up?.periodo || '',
      up?.tipoPagamento || '',
      up?.dataPagamento || '',
      a.iscrizione ? 'Pagata' : 'Non pagata',
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
  if (document.getElementById('overlayPagamenti').classList.contains('open')) closeAthleteModal();
  else closeModal();
});
document.getElementById('overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('overlay')) closeModal();
});
document.getElementById('overlayPagamenti').addEventListener('click', e => {
  if (e.target === document.getElementById('overlayPagamenti')) closeAthleteModal();
});

/* ─── INIT ─── */
renderTable();
