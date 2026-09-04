let consensoFoto = null;    // 'si' | 'no' | null
let consensoPrivacy = null; // 'si' | 'no' | null
let currentStep = 1;

// ---- Inizializzazione ----
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('dataCompilazione').value = new Date().toISOString().split('T')[0];
    updateProgress();
});

// ---- Navigazione step ----
function goToStep(n) {
    document.getElementById(`step${currentStep}`).classList.remove('active');
    currentStep = n;
    document.getElementById(`step${currentStep}`).classList.add('active');
    updateProgress();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateProgress() {
    const lineWidths = ['0%', '50%', '100%'];
    [1, 2, 3].forEach(i => {
        const dot = document.getElementById(`dot${i}`);
        dot.classList.remove('active', 'completed');
        if (i < currentStep) dot.classList.add('completed');
        else if (i === currentStep) dot.classList.add('active');
    });
    document.getElementById('progressLine').style.width = lineWidths[currentStep - 1];
}

// ---- Selezione consenso (foto/video oppure privacy) ----
function selectConsent(tipo, val) {
    if (tipo === 'foto') {
        consensoFoto = val;
        document.getElementById('consensoFotoSi').classList.toggle('selected', val === 'si');
        document.getElementById('consensoFotoNo').classList.toggle('selected', val === 'no');
    } else if (tipo === 'privacy') {
        consensoPrivacy = val;
        document.getElementById('consensoPrivacySi').classList.toggle('selected', val === 'si');
        document.getElementById('consensoPrivacyNo').classList.toggle('selected', val === 'no');
    }
}

// ---- Helpers ----
function v(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

// ---- Validazione campi obbligatori per step ----
const REQUIRED_FIELDS_BY_STEP = {
    1: ['mCognome', 'mNome', 'mLuogoNascita', 'mProvNascita', 'mDataNascita', 'mCF', 'mNazionalita', 'mVia', 'mComune', 'mProvResidenza'],
    2: ['gCognome', 'gNome', 'gCF', 'gTel', 'gEmail'],
};

function validateStep(n) {
    const ids = REQUIRED_FIELDS_BY_STEP[n];
    if (!ids) return true;
    for (const id of ids) {
        const el = document.getElementById(id);
        if (!el.checkValidity() || !el.value.trim()) {
            el.reportValidity();
            el.focus();
            return false;
        }
    }
    return true;
}

function generateId() {
    const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `MB-${new Date().getFullYear()}-${rand}`;
}

// Chiave normalizzata (cognome+nome del minore) usata dalla pagina
// BASKET/preiscrizioni.html per riconoscere chi è già tra gli atleti
// registrati (rinnovo) rispetto a chi si iscrive per la prima volta.
function normalizeKey(str) {
    return String(str || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// ---- Invio form ----
async function submitForm() {
    if (!validateStep(1) || !validateStep(2)) return;

    const dataCompilazioneEl = document.getElementById('dataCompilazione');
    if (!dataCompilazioneEl.checkValidity() || !dataCompilazioneEl.value.trim()) {
        dataCompilazioneEl.reportValidity();
        dataCompilazioneEl.focus();
        return;
    }
    if (!consensoFoto || !consensoPrivacy) {
        alert('Devi rispondere a entrambe le richieste di consenso (Presto/Nego il consenso) prima di inviare la domanda.');
        return;
    }

    const btnSubmit = document.getElementById('submitBtn');
    btnSubmit.disabled = true;
    document.getElementById('loadingOverlay').classList.add('visible');

    const registrationId = generateId();
    const mCognome = v('mCognome');
    const mNome = v('mNome');

    const data = {
        registrationId,
        chiave_match: normalizeKey(`${mCognome} ${mNome}`),
        stagione_sportiva: v('stagioneSportiva'),
        centro_minibasket: v('centroMinibasket'),
        genitore: {
            cognome:        v('gCognome'),
            nome:           v('gNome'),
            codice_fiscale: v('gCF').toUpperCase(),
            telefono:       v('gTel'),
            email:          v('gEmail').toLowerCase()
        },
        minore: {
            cognome:            mCognome,
            nome:               mNome,
            luogo_nascita:      v('mLuogoNascita'),
            provincia_nascita:  v('mProvNascita').toUpperCase(),
            data_nascita:       v('mDataNascita'),
            codice_fiscale:     v('mCF').toUpperCase(),
            nazionalita:        v('mNazionalita'),
            via:                v('mVia'),
            comune:             v('mComune'),
            provincia:          v('mProvResidenza').toUpperCase()
        },
        consensi: {
            foto_video: consensoFoto,
            privacy:    consensoPrivacy
        },
        data_compilazione: v('dataCompilazione'),
        stato:      'in_attesa',
        note_admin: '',
        created_at: firebase.firestore.Timestamp.now()
    };

    try {
        await db.collection('preiscrizioni').doc(registrationId).set(data);

        document.getElementById('loadingOverlay').classList.remove('visible');
        document.getElementById('popupName').textContent = `${data.minore.nome} ${data.minore.cognome}`.trim();
        document.getElementById('popupOverlay').classList.add('visible');

    } catch (err) {
        document.getElementById('loadingOverlay').classList.remove('visible');
        btnSubmit.disabled = false;
        alert(`Errore durante l'invio: ${err.message}\n\nVerifica la connessione e riprova.`);
        console.error(err);
    }
}

// ---- Popup conferma ----
function closePopup() {
    document.getElementById('popupOverlay').classList.remove('visible');
    document.getElementById('preiscrizioneForm').reset();
    consensoFoto = null;
    consensoPrivacy = null;
    document.querySelectorAll('.consent-btn.selected').forEach(el => el.classList.remove('selected'));
    document.getElementById('dataCompilazione').value = new Date().toISOString().split('T')[0];
    document.getElementById('centroMinibasket').value = 'A.S.D. AVIS BASKET TRANI — cod. FIP 054580';
    document.getElementById('stagioneSportiva').value = '2026 – 2027';
    document.getElementById('submitBtn').disabled = false;
    document.getElementById(`step${currentStep}`).classList.remove('active');
    currentStep = 1;
    document.getElementById('step1').classList.add('active');
    updateProgress();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
