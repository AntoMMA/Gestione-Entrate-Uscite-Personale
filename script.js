// script.js (module)
// 🔥 Usa come module: <script type="module" src="script.js"></script>

/*
  NOTE:
  - Questo file si basa sulle collection "entries" (entrate) e "exits" (uscite)
    e assume che ogni documento abbia: { userId, importo, motivo, createdAt (Timestamp) }.
  - Se i tuoi documenti usano altri nomi, adatta le query di conseguenza.
*/

/* =========== Firebase imports ============ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, query, where, getDocs, serverTimestamp, onSnapshot, Timestamp
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-firestore.js";

/* =========== YOUR FIREBASE CONFIG (kept as in original) ============ */
const firebaseConfig = {
  apiKey: "AIzaSyDA8x2UcwoDBNbEZbsE5nGUNlLHI-aXUHA",
  authDomain: "gestionale-entrate-uscite-wr.firebaseapp.com",
  projectId: "gestionale-entrate-uscite-wr",
  storageBucket: "gestionale-entrate-uscite-wr.firebasestorage.app",
  messagingSenderId: "180959843310",
  appId: "1:180959843310:web:0800ebae9267f61071b4ff",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* =========== DOM refs ============ */
const loginScreen = document.getElementById('login-screen');
const loginBtn = document.getElementById('login-btn');
const nomeInput = document.getElementById('nome');
const cognomeInput = document.getElementById('cognome');
const telefonoInput = document.getElementById('telefono');

const appDiv = document.getElementById('app');
const welcome = document.getElementById('welcome');

const addEntrataBtn = document.getElementById('add-entrata');
const addUscitaBtn = document.getElementById('add-uscita');
const entrataImporto = document.getElementById('entrata-importo');
const entrataMotivo = document.getElementById('entrata-motivo');
const uscitaImporto = document.getElementById('uscita-importo');
const uscitaMotivo = document.getElementById('uscita-motivo');

const logEntrate = document.getElementById('log-entrate');
const logUscite = document.getElementById('log-uscite');
const saldoTotale = document.getElementById('saldo-totale');

const monthlyReportBtn = document.getElementById('monthly-report-btn');
const monthlySummary = document.getElementById('monthly-summary');
const monthlyChartCtx = document.getElementById('monthlyChart').getContext('2d');

let currentUser = null;
let monthlyChart = null;

/* ======= Utilities ======= */
function shortUserId(nome,cognome,telefono){
  // semplice id locale basato su stringa - NON è sicurezza, è solo per identificare i dati client
  return `${nome.toLowerCase()}_${cognome.toLowerCase()}_${telefono.replace(/\D/g,'')}`;
}

/* ======= Login handling ======= */
function showAppForUser(user){
  currentUser = user;
  loginScreen.classList.add('hidden');
  appDiv.classList.remove('hidden');
  welcome.textContent = `Benvenuto ${user.nome} ${user.cognome}`;
  // load initial data
  loadRealtimeLogs(user.userId);
  // generate monthly report immediately
  generateMonthlyReport();
  // schedule auto monthly report
  scheduleMonthlyAutoReport();
}

loginBtn.addEventListener('click', () => {
  const nome = nomeInput.value.trim();
  const cognome = cognomeInput.value.trim();
  const telefono = telefonoInput.value.trim();
  if(!nome || !cognome || !telefono){
    alert('Compila tutti i campi per accedere.');
    return;
  }
  const userId = shortUserId(nome,cognome,telefono);
  const user = { nome, cognome, telefono, userId };
  // store locally
  localStorage.setItem('gd_user', JSON.stringify(user));
  showAppForUser(user);
});

// auto-login se già presente in localStorage
const stored = localStorage.getItem('gd_user');
if(stored){
  try{
    const u = JSON.parse(stored);
    if(u && u.userId) showAppForUser(u);
  }catch(e){}
}

/* ======= Add entry / exit handlers ======= */
addEntrataBtn?.addEventListener('click', async () => {
  if(!currentUser) return alert('Effettua il login');
  const importo = parseFloat(entrataImporto.value);
  const motivo = entrataMotivo.value || 'Entrata generica';
  if(!importo || importo <= 0) return alert('Inserisci importo valido');
  await addDoc(collection(db, 'entries'), {
    userId: currentUser.userId,
    importo,
    motivo,
    createdAt: serverTimestamp()
  });
  entrataImporto.value=''; entrataMotivo.value='';
});

addUscitaBtn?.addEventListener('click', async () => {
  if(!currentUser) return alert('Effettua il login');
  const importo = parseFloat(uscitaImporto.value);
  const motivo = uscitaMotivo.value || 'Uscita generica';
  if(!importo || importo <= 0) return alert('Inserisci importo valido');
  await addDoc(collection(db, 'exits'), {
    userId: currentUser.userId,
    importo,
    motivo,
    createdAt: serverTimestamp()
  });
  uscitaImporto.value=''; uscitaMotivo.value='';
});

/* ======= Realtime logs (simple) ======= */
function loadRealtimeLogs(userId){
  // semplice fetch iniziale; puoi sostituire con onSnapshot se vuoi realtime
  // Entrate
  (async ()=>{
    const qE = query(collection(db,'entries'), where('userId','==', userId));
    const snapE = await getDocs(qE);
    logEntrate.innerHTML = '';
    let totEntrate = 0;
    snapE.forEach(d=>{
      const data = d.data();
      totEntrate += Number(data.importo||0);
      const li = document.createElement('li');
      li.textContent = `€${Number(data.importo).toFixed(2)} — ${data.motivo || ''}`;
      logEntrate.appendChild(li);
    });
    // Uscite
    const qU = query(collection(db,'exits'), where('userId','==', userId));
    const snapU = await getDocs(qU);
    logUscite.innerHTML = '';
    let totUscite = 0;
    snapU.forEach(d=>{
      const data = d.data();
      totUscite += Number(data.importo||0);
      const li = document.createElement('li');
      li.textContent = `€${Number(data.importo).toFixed(2)} — ${data.motivo || ''}`;
      logUscite.appendChild(li);
    });
    saldoTotale.textContent = `Entrate: €${totEntrate.toFixed(2)} — Uscite: €${totUscite.toFixed(2)} — Saldo Netto: €${(totEntrate - totUscite).toFixed(2)}`;
  })();
}

/* ======= Monthly totals helper ======= */
/**
 * ritorna la somma degli "importo" per la collectionName ('exits' o 'entries')
 * per un intervallo [startDate, endDate) per lo userId.
 * startDate e endDate sono oggetti Date JS.
 */
async function getMonthlyTotal(collectionName, userId, startDate, endDate){
  // convert to Firestore Timestamp
  const startTS = Timestamp.fromDate(startDate);
  const endTS = Timestamp.fromDate(endDate);
  const q = query(
    collection(db, collectionName),
    where('userId','==', userId),
    where('createdAt','>=', startTS),
    where('createdAt','<', endTS)
  );
  const snap = await getDocs(q);
  let total = 0;
  snap.forEach(doc => {
    const d = doc.data();
    total += Number(d.importo || 0);
  });
  return total;
}

/* ======= Monthly report generation ======= */
async function generateMonthlyReport(){
  if(!currentUser) return;
  monthlySummary.textContent = 'Calcolo in corso...';

  const now = new Date();
  // calcola primo giorno del mese corrente e del mese precedente
  const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0,0,0,0);
  const startNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0,0,0,0);
  const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0,0,0,0);
  const startThisMonthLabel = startThisMonth.toLocaleString('it-IT', { month:'long', year:'numeric' });

  // somma uscite (spesa) per mese corrente e precedente
  const thisMonthExits = await getMonthlyTotal('exits', currentUser.userId, startThisMonth, startNextMonth);
  const lastMonthExits = await getMonthlyTotal('exits', currentUser.userId, startLastMonth, startThisMonth);

  // percentuale di differenza
  let pctText = '';
  if(lastMonthExits === 0 && thisMonthExits === 0){
    pctText = `Nessuna spesa registrata né questo mese né il precedente (${startThisMonthLabel}).`;
  } else if(lastMonthExits === 0){
    pctText = `Non c'erano spese nel mese precedente. Questo mese hai speso €${thisMonthExits.toFixed(2)}.`;
  } else {
    const diff = thisMonthExits - lastMonthExits;
    const pct = (diff / lastMonthExits) * 100;
    const rounded = Math.abs(pct).toFixed(1);
    if(pct > 0){
      pctText = `Questo mese hai speso il ${rounded}% in più rispetto al mese precedente (da €${lastMonthExits.toFixed(2)} a €${thisMonthExits.toFixed(2)}).`;
    } else if(pct < 0){
      pctText = `Questo mese hai speso il ${rounded}% in meno rispetto al mese precedente (da €${lastMonthExits.toFixed(2)} a €${thisMonthExits.toFixed(2)}).`;
    } else {
      pctText = `Spesa identica a quella del mese precedente: €${thisMonthExits.toFixed(2)}.`;
    }
  }

  // Aggiorna UI
  monthlySummary.textContent = pctText;

  // Update chart
  updateMonthlyChart(lastMonthExits, thisMonthExits, startLastMonth, startThisMonth);
}

/* ======= Chart update ======= */
function updateMonthlyChart(lastTotal, thisTotal, startLastMonth, startThisMonth){
  const labelLast = startLastMonth.toLocaleString('it-IT', { month:'short', year:'numeric' });
  const labelThis = startThisMonth.toLocaleString('it-IT', { month:'short', year:'numeric' });

  const data = {
    labels: [labelLast, labelThis],
    datasets: [{
      label: 'Spesa (uscite) €',
      data: [lastTotal, thisTotal],
      // chart.js will pick defaults; do not force colors (per instructions)
    }]
  };

  if(monthlyChart){
    monthlyChart.data = data;
    monthlyChart.update();
  } else {
    monthlyChart = new Chart(monthlyChartCtx, {
      type: 'bar',
      data,
      options: {
        responsive: true,
        plugins: { legend: { display: false } }
      }
    });
  }
}

/* ======= Automatic monthly scheduling ======= */
function scheduleMonthlyAutoReport(){
  // Calcola ms fino al prossimo primo giorno del mese alle 00:00:10 (piccolo ritardo per sicurezza)
  const now = new Date();
  const nextMonthFirst = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0,0,10,0);
  const msUntilNext = nextMonthFirst.getTime() - now.getTime();
  // Primo timeout, poi ogni 30 giorni circa (use 1 month via calculation)
  setTimeout(()=> {
    // genera report
    generateMonthlyReport();
    // poi ogni mese: calcola ms nel prossimo mese dinamicamente
    const monthlyTick = async function tick(){
      await generateMonthlyReport();
      // programma il prossimo tick: calcola fino al primo del successivo mese
      scheduleMonthlyAutoReport(); // ricorsivo: setTimeout calcolerà il prossimo
    };
    monthlyTick();
  }, msUntilNext);
}

/* ======= Button manual trigger ======= */
monthlyReportBtn?.addEventListener('click', async () => {
  await generateMonthlyReport();
});

/* ======= OPTIONAL: refresh logs quando cambiano i dati (leggero polling) ======= */
setInterval(()=>{
  if(currentUser) loadRealtimeLogs(currentUser.userId);
}, 45000); // ogni 45s aggiorna i log e totali (puoi modificare)

/* ======= End file ======= */
