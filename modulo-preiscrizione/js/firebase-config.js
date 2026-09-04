/* ══════════════════════════════════════════════════════
   CONFIGURAZIONE FIREBASE — Modulo Pre-Iscrizione Minibasket
   Avis Basket Trani

   Usa LO STESSO progetto Firebase del gestionale principale
   (cartella BASKET/, progetto "tabella-basket"), ma scrive in
   una collezione separata ("preiscrizioni") così da non
   interferire con il documento "avisBasket/pagamenti" usato
   dal registro pagamenti/quote.

   Questo permette alla pagina BASKET/preiscrizioni.html di
   leggere le domande arrivate da questo modulo, confrontarle
   con l'elenco atleti già registrati e segnalare i doppioni
   (🔄 chi si sta re-iscrivendo) rispetto alle iscrizioni
   davvero nuove (🆕).
   ══════════════════════════════════════════════════════
   Se in futuro si vuole isolare il modulo su un progetto
   Firebase diverso, basta sostituire i valori sotto con quelli
   del nuovo progetto (Console Firebase → Impostazioni progetto
   → App web) e replicare la regola Firestore indicata qui sotto.

   Regola Firestore da avere in "tabella-basket" (Firestore →
   Regole), che aggiunge il permesso sulla nuova collezione
   accanto a quella già esistente "avisBasket":

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
const db = firebase.firestore();

db.enablePersistence().catch(() => {});
