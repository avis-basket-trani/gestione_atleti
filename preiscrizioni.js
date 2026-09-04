/* ══════════════════════════════════════════════════════
   PRE-ISCRIZIONI — Avis Basket Trani
   Legge la collezione Firestore "preiscrizioni" (alimentata dal
   modulo pubblico in modulo-preiscrizione/) e la confronta con
   l'elenco atleti già registrati (chiave "avisBasketPagamenti"
   in localStorage, sincronizzata da firebase-sync.js) per
   segnalare i doppioni:
     🆕 Nuovo   → nessun atleta corrispondente in elenco
     🔄 Rinnovo → il minore risulta già tra gli atleti registrati
   ══════════════════════════════════════════════════════ */

let preiscrizioni = [];
let deletingId = null;
const db = firebase.firestore();

/* ─── Helpers ─── */
function normalizeKey(str) {
    return String(str || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function escHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-');
    if (!y || !m || !d) return dateStr;
    return `${d}/${m}/${y}`;
}

function formatTimestamp(ts) {
    if (!ts) return '—';
    try {
        const date = ts.toDate ? ts.toDate() : new Date(ts);
        return date.toLocaleDateString('it-IT') + ' ' + date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    } catch (_) { return '—'; }
}

function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function readMainRecords() {
    try { return JSON.parse(localStorage.getItem('avisBasketPagamenti') || '[]'); }
    catch (_) { return []; }
}

/* Stessa logica di app.js: gruppo derivato dall'anno di nascita */
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

/* ─── Riconoscimento doppioni ─── */
function computeStato(item) {
    const chiave = item.chiave_match || normalizeKey(`${item.minore?.cognome} ${item.minore?.nome}`);
    const mainRecords = readMainRecords();
    const match = mainRecords.find(r => normalizeKey(`${r.cognome} ${r.nome}`) === chiave);
    return match ? { stato: 'rinnovo', match } : { stato: 'nuovo', match: null };
}

/* ─── Render ─── */
function getFiltered() {
    const search = document.getElementById('searchInput').value.trim().toLowerCase();
    const filtro = document.getElementById('filterStato').value;

    return preiscrizioni
        .map(item => ({ item, ...computeStato(item) }))
        .filter(({ item, stato }) => {
            const matchSearch = !search ||
                `${item.minore?.cognome} ${item.minore?.nome}`.toLowerCase().includes(search) ||
                `${item.genitore?.cognome} ${item.genitore?.nome}`.toLowerCase().includes(search);
            const matchStato = !filtro || filtro === stato;
            return matchSearch && matchStato;
        })
        .sort((a, b) => (b.item.created_at?.seconds || 0) - (a.item.created_at?.seconds || 0));
}

function renderTable() {
    const rows  = getFiltered();
    const tbody = document.getElementById('tableBody');
    const empty = document.getElementById('emptyState');

    document.getElementById('recordCount').textContent = `${rows.length} record`;

    if (!rows.length) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    tbody.innerHTML = rows.map(({ item, stato, match }) => {
        const m = item.minore || {};
        const g = item.genitore || {};
        const foto = item.consensi?.foto_video;
        const privacy = item.consensi?.privacy;
        const consensoBadge = (val) => val === 'si'
            ? '<span class="badge badge-si">Sì</span>'
            : val === 'no'
                ? '<span class="badge badge-no">No</span>'
                : '<span class="badge badge-attesa">—</span>';
        const aggiunta = !!item.aggiunta_al_registro;
        const statoBadge = stato === 'rinnovo'
            ? `<span class="badge badge-rinnovo" title="Già in elenco atleti come ${escHtml(match.nomeRagazzo || (match.nome + ' ' + match.cognome))}">🔄 Rinnovo</span>`
            : aggiunta
                ? '<span class="badge badge-si">✅ Aggiunto</span>'
                : '<span class="badge badge-nuovo">🆕 Nuovo</span>';
        const addBtn = (stato === 'nuovo' && !aggiunta)
            ? `<button class="btn-icon btn-add-athlete" onclick="aggiungiComeAtleta('${item.registrationId}')" title="Aggiungi al registro atleti">➕</button>`
            : '';

        return `<tr data-id="${item.registrationId}">
            <td data-label="Minore"><span class="player-name">${escHtml(m.cognome || '—')} ${escHtml(m.nome || '')}</span></td>
            <td data-label="Data nascita">${formatDate(m.data_nascita)}</td>
            <td data-label="Genitore">${escHtml(g.cognome || '—')} ${escHtml(g.nome || '')}</td>
            <td data-label="CF Genitore"><code class="cf-code">${escHtml(g.codice_fiscale || '—')}</code></td>
            <td data-label="Telefono">${g.telefono ? `<a class="tel-link" href="tel:${escHtml(g.telefono)}">${escHtml(g.telefono)}</a>` : '—'}</td>
            <td data-label="Consenso Foto">${consensoBadge(foto)}</td>
            <td data-label="Consenso Privacy">${consensoBadge(privacy)}</td>
            <td data-label="Inviata il">${formatTimestamp(item.created_at)}</td>
            <td data-label="Stato">${statoBadge}</td>
            <td data-label=""><div class="actions">
                ${addBtn}
                <button class="btn-icon btn-del" onclick="askDelete('${item.registrationId}')" title="Elimina">🗑️</button>
            </div></td>
        </tr>`;
    }).join('');
}

/* ─── Sincronizzazione automatica dei rinnovi ───
   Per chi risulta già in anagrafica (🔄 rinnovo), completa i campi anagrafici
   mancanti sul record esistente usando i dati della pre-iscrizione, senza
   bisogno di alcuna azione manuale. Il merge riempie solo i campi vuoti e non
   sovrascrive mai un valore già presente: per questo può essere ripetuto ad
   ogni caricamento della pagina senza un flag "già fatto" — così, se in futuro
   si aggiungono nuovi campi da importare, vengono recuperati automaticamente
   anche per le pre-iscrizioni elaborate in passato. */
function syncRinnovi() {
    const mainRecords = readMainRecords();
    let changed = false;

    for (const item of preiscrizioni) {
        const { stato, match } = computeStato(item);
        if (stato !== 'rinnovo' || !match) continue;

        const idx = mainRecords.findIndex(r => r.id === match.id);
        if (idx === -1) continue;

        const m = item.minore || {};
        const g = item.genitore || {};
        const rec = mainRecords[idx];
        const merged = {
            ...rec,
            dataNascita:                   rec.dataNascita                   || m.data_nascita || '',
            luogoNascita:                  rec.luogoNascita                  || m.luogo_nascita || '',
            provinciaNascita:              rec.provinciaNascita              || m.provincia_nascita || '',
            cf:                            rec.cf                            || m.codice_fiscale || '',
            nazionalita:                   rec.nazionalita                   || m.nazionalita || '',
            via:                           rec.via                           || m.via || '',
            comune:                        rec.comune                        || m.comune || '',
            provinciaResidenza:            rec.provinciaResidenza            || m.provincia || '',
            nomeGenitore:                  rec.nomeGenitore                  || [g.nome, g.cognome].filter(Boolean).join(' '),
            cfGenitore:                    rec.cfGenitore                    || g.codice_fiscale || '',
            telefono:                      rec.telefono                      || g.telefono || '',
            emailGenitore:                 rec.emailGenitore                 || g.email || '',
            consensoFoto:                  rec.consensoFoto                  || item.consensi?.foto_video || '',
            consensoPrivacy:               rec.consensoPrivacy               || item.consensi?.privacy || '',
            dataCompilazionePreiscrizione: rec.dataCompilazionePreiscrizione || item.data_compilazione || '',
        };

        if (JSON.stringify(merged) !== JSON.stringify(rec)) {
            mainRecords[idx] = merged;
            changed = true;
        }
    }

    if (changed) localStorage.setItem('avisBasketPagamenti', JSON.stringify(mainRecords));
}

/* ─── Aggiungi come atleta ─── */
async function aggiungiComeAtleta(id) {
    const item = preiscrizioni.find(p => p.registrationId === id);
    if (!item) return;
    const m = item.minore || {};
    const g = item.genitore || {};
    const anno = m.data_nascita ? m.data_nascita.split('-')[0] : '';

    const records = readMainRecords();
    records.unshift({
        id: uid(),
        nome: m.nome || '',
        cognome: m.cognome || '',
        nomeRagazzo: [m.nome, m.cognome].filter(Boolean).join(' '),
        gruppo: computeGruppo(anno),
        anno,
        dataNascita: m.data_nascita || '',
        luogoNascita: m.luogo_nascita || '',
        provinciaNascita: m.provincia_nascita || '',
        cf: m.codice_fiscale || '',
        nazionalita: m.nazionalita || '',
        via: m.via || '',
        comune: m.comune || '',
        provinciaResidenza: m.provincia || '',
        certScadenza: '',
        nomeGenitore: [g.nome, g.cognome].filter(Boolean).join(' '),
        cfGenitore: g.codice_fiscale || '',
        telefono: g.telefono || '',
        emailGenitore: g.email || '',
        consensoFoto: item.consensi?.foto_video || '',
        consensoPrivacy: item.consensi?.privacy || '',
        dataCompilazionePreiscrizione: item.data_compilazione || '',
        dataPagamento: '',
        frequenza: '',
        periodo: '',
        tipoPagamento: '',
        iscrizione: false,
    });
    localStorage.setItem('avisBasketPagamenti', JSON.stringify(records));

    try {
        await db.collection('preiscrizioni').doc(id).update({
            aggiunta_al_registro: true,
            aggiunta_il: firebase.firestore.FieldValue.serverTimestamp()
        });
        toast('Atleta aggiunto a registro pagamenti e quote mensili ✓', 'success');
    } catch (err) {
        toast('Atleta aggiunto, ma errore aggiornando lo stato della pre-iscrizione', 'error');
        console.error(err);
    }
}

/* ─── Elimina ─── */
function askDelete(id) {
    deletingId = id;
    document.getElementById('confirmOverlay').classList.add('open');
}

function closeConfirm() {
    document.getElementById('confirmOverlay').classList.remove('open');
    deletingId = null;
}

async function confirmDelete() {
    if (!deletingId) return;
    try {
        await db.collection('preiscrizioni').doc(deletingId).delete();
        toast('Pre-iscrizione eliminata', 'error');
    } catch (err) {
        toast('Errore durante l\'eliminazione', 'error');
        console.error(err);
    }
    closeConfirm();
}

/* ─── Toast ─── */
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

/* ─── Eventi ─── */
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeConfirm();
});

document.getElementById('confirmOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('confirmOverlay')) closeConfirm();
});

window.addEventListener('storage', e => {
    if (e.key === 'avisBasketPagamenti') renderTable();
});

/* ─── Init: ascolto live della collezione preiscrizioni ─── */
db.collection('preiscrizioni').onSnapshot(snap => {
    preiscrizioni = snap.docs.map(doc => doc.data());
    syncRinnovi();
    renderTable();
}, err => {
    console.error('[Firebase] errore lettura preiscrizioni:', err);
    toast('Errore di connessione a Firebase', 'error');
});

renderTable();
