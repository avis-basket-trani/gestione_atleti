/* ─── ACCESSO PROTETTO DA PASSWORD ───
   Protezione lato client per uso interno dello staff: evita che chi trova
   il link entri per sbaglio nel gestionale. Non è una vera autenticazione
   (chi ispeziona il sorgente vede la password), ma è sufficiente per lo
   scopo: tenere fuori i visitatori occasionali. Il modulo pubblico di
   pre-iscrizione (modulo-preiscrizione/) NON include questo script, perché
   deve restare liberamente compilabile dai genitori. */
const AUTH_PASSWORD = 'avis2026';
const AUTH_TOKEN     = 'avis-basket-auth-ok-v1'; // cambiare per forzare un nuovo accesso su tutti i dispositivi

function checkAuthPassword(e) {
  e.preventDefault();
  const input = document.getElementById('authPassword');
  const error = document.getElementById('authError');
  const card  = document.getElementById('authCard');

  if (input.value === AUTH_PASSWORD) {
    localStorage.setItem('avisBasketAuth', AUTH_TOKEN);
    document.documentElement.classList.remove('locked');
    error.style.display = 'none';
    input.value = '';
  } else {
    error.style.display = 'block';
    input.value = '';
    input.focus();
    card.classList.remove('shake');
    void card.offsetWidth; // riavvia l'animazione anche su tentativi consecutivi
    card.classList.add('shake');
  }
  return false;
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.documentElement.classList.contains('locked')) {
    const input = document.getElementById('authPassword');
    if (input) input.focus();
  }
});
