/* ══════════════════════════════════════════════════════
   CONFIGURAZIONE FIREBASE – Avis Basket Trani
   ══════════════════════════════════════════════════════
   Il progetto è già configurato e attivo (vedi firebaseConfig
   sotto). Le istruzioni seguenti servono solo come riferimento
   per ricreare da zero il progetto Firebase in caso di necessità:

   1. Vai su https://console.firebase.google.com
   2. Clicca "Crea un progetto" → nome es. "avis-basket-trani"
   3. Una volta creato, clicca l'icona </> (Aggiungi app Web)
   4. Registra l'app → copia la config e incollala qui sotto
   5. Nel menu sinistra → Build → Firestore Database
      → Crea database → Modalità produzione → Regione europe-west3
   6. Vai in Firestore → Regole → sostituisci tutto con:

      rules_version = '2';
      service cloud.firestore {
        match /databases/{database}/documents {
          match /avisBasket/{doc} {
            allow read, write: if true;
          }
          match /preiscrizioni/{doc} {
            allow read, write: if true;
          }
        }
      }

      → Pubblica
   7. Incolla la nuova config qui sotto al posto di quella attuale

   NOTA: la collezione "preiscrizioni" è alimentata dal modulo
   pubblico in modulo-preiscrizione/ (stesso progetto Firebase)
   ed è letta dalla pagina preiscrizioni.html, che confronta
   ogni domanda con l'elenco atleti per segnalare i doppioni
   (🔄 rinnovo) rispetto alle iscrizioni davvero nuove (🆕).
   ══════════════════════════════════════════════════════ */

const firebaseConfig = {
    apiKey: "AIzaSyCpm5mzrTTLCt9zz_hT9PaSfc_2vpxDLoE",
    authDomain: "tabella-basket.firebaseapp.com",
    projectId: "tabella-basket",
    storageBucket: "tabella-basket.firebasestorage.app",
    messagingSenderId: "691304471939",
    appId: "1:691304471939:web:af6cbb719ca7dbc551eab6"
};

firebase.initializeApp(firebaseConfig);
