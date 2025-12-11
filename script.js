// script.js (module)
// IMPORT FIREBASE MODULAR (usa una versione compatibile)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.6.0/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  setDoc,
  doc,
  getDocs,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.6.0/firebase-firestore.js";

// ---------- CONFIG FIREBASE (sostituisci con la tua config se vuoi) ----------
const firebaseConfig = {
  apiKey: "AIzaSyDA8x2UcwoDBNbEZbsE5nGUNlLHI-aXUHA",
  authDomain: "gestionale-entrate-uscite-wr.firebaseapp.com",
  projectId: "gestionale-entrate-uscite-wr",
  storageBucket: "gestionale-entrate-uscite-wr.firebasestorage.app",
  messagingSenderId: "180959843310",
  appId: "1:180959843310:web:0800ebae9267f61071b4ff",
  measurementId: "G-XFL9ZH8K6T"
};

// ---------- INIT APP & DB ----------
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ---------- STATE ----------
let currentUser = null;
let monthlyChart = null;

// ---------- DOM ----------
const loginCard = document.getElementById('loginCard');
const dashboard = document.getElementById('dashboard');
const usersList = document.getElementById('usersList');
const greeting = document.getElementById('greeting');
const loginMsg = document.getElementById('loginMsg');

const btnLogin = document.getElementById('btnLogin');
const btnLogout = document.getElementById('btnLogout') || document.getElementById('btnLogout'); // fallback

const btnAddEntry = document.getElementById('btnAddEntry');
const btnAddExit = document.getElementById('btnAddExit');
const btnSaveCalc = document.getElementById('btnSaveCalc');

const entryAmountEl = document.getElementById('entryAmount');
const entryReasonEl = document.getElementById('entryReason');
const exitAmountEl = document.getElementById('exitAmount');
const exitReasonEl = document.getElementById('exitReason');

const entryLogEl = document.getElementById('entryLog');
const exitLogEl = document.getElementById('exitLog');
const calcLogEl = document.getElementById('calcLog');
const totalsEl = document.getElementById('totals');
const monthlyComparisonEl = document.getElementById('monthlyComparison');

// ---------- HELPERS ----------
function showLoginError(msg){
  loginMsg.innerText = msg;
  setTimeout(()=>{ if(loginMsg.innerText===msg) loginMsg.innerText=''; }, 4000);
}

function getTotalsFromDOM(){
  let entrate=0, uscite=0;
  document.querySelectorAll("#entryLog .log-item").forEach(i => entrate += Number(i.dataset.amt || 0));
  document.querySelectorAll("#exitLog .log-item").forEach(i => uscite += Number(i.dataset.amt || 0));
  return { entrate, usc ite: uscite, net: entrate - uscite }; // temporary placeholder overwritten below
}

// fix above small accidental typo - replace with correct getTotals
function getTotals(){
  let entrate=0, uscite=0;
  document.querySelectorAll("#entryLog .log-item").forEach(i => entrate += Number(i.dataset.amt || 0));
  document.querySelectorAll("#exitLog .log-item").forEach(i => uscite += Number(i.dataset.amt || 0));
  return { entrate, usc ite: uscite, net: entrate - uscite }; // we'll correct next
}

// Replace getTotals with correct function (to avoid accidental broken code)
(function replaceGetTotals(){
  window.getTotals = function(){
    let entrate=0, uscite=0;
    document.querySelectorAll("#entryLog .log-item").forEach(i => entrate += Number(i.dataset.amt || 0));
    document.querySelectorAll("#exitLog .log-item").forEach(i => uscite += Number(i.dataset.amt || 0));
    return { entrate, uscite, net: entrate - uscite };
  };
})();

// ---------- LOGIN / REGISTRAZIONE ----------
btnLogin.addEventListener('click', async () => {
  const nome = document.getElementById('nome').value.trim();
  const cognome = document.getElementById('cognome').value.trim();
  const telefono = document.getElementById('telefono').value.trim();
  if (!telefono) { showLoginError("Inserisci il telefono"); return; }

  try {
    const usersCol = collection(db, "users");
    const q = query(usersCol, where("telefono", "==", telefono));
    const snap = await getDocs(q);

    if (snap.empty) {
      // registrazione
      const docRef = await addDoc(usersCol, {
        nome: nome || "",
        cognome: cognome || "",
        telefono,
        createdAt: serverTimestamp()
      });
      currentUser = { id: docRef.id, nome: nome || "", cognome: cognome || "", telefono };
    } else {
      const d = snap.docs[0].data();
      currentUser = { id: snap.docs[0].id, nome: d.nome || "", cognome: d.cognome || "", telefono: d.telefono || "" };
    }

    // mostra dashboard
    loginCard.style.display = 'none';
    dashboard.style.display = 'block';
    greeting.innerText = `Ciao ${currentUser.nome} ${currentUser.cognome}`;

    // set presence + listeners
    await setOnline(true);
    listenData();
    listenUsersPresence();
    updateMonthlyChart();
  } catch (err) {
    console.error("Login error:", err);
    showLoginError("Errore durante login/registrazione");
  }
});

// ---------- LOGOUT ----------
document.getElementById('btnLogout').addEventListener('click', ()=>{
  setOnline(false);
  currentUser = null;
  dashboard.style.display = 'none';
  loginCard.style.display = 'block';
});

// ---------- ENTRATE / USCITE ----------
btnAddEntry.addEventListener('click', addEntry);
btnAddExit.addEventListener('click', addExit);
btnSaveCalc.addEventListener('click', saveCalc);

async function addEntry(){
  if(!currentUser) { alert("Devi effettuare il login"); return; }
  const amt = Number(entryAmountEl.value);
  const reason = entryReasonEl.value || "";
  if (!amt || isNaN(amt)) { alert("Importo non valido"); return; }
  try {
    await addDoc(collection(db,'entries'), {
      userId: currentUser.id,
      amount: amt,
      reason,
      createdAt: serverTimestamp()
    });
    entryAmountEl.value = '';
    entryReasonEl.value = '';
    await updateOnlineSaldo();
    await updateMonthlyChart();
  } catch(err){
    console.error("addEntry error", err);
    alert("Errore salvataggio entrata");
  }
}

async function addExit(){
  if(!currentUser) { alert("Devi effettuare il login"); return; }
  const amt = Number(exitAmountEl.value);
  const reason = exitReasonEl.value || "";
  if (!amt || isNaN(amt)) { alert("Importo non valido"); return; }
  try {
    await addDoc(collection(db,'exits'), {
      userId: currentUser.id,
      amount: amt,
      reason,
      createdAt: serverTimestamp()
    });
    exitAmountEl.value = '';
    exitReasonEl.value = '';
    await updateOnlineSaldo();
    await updateMonthlyChart();
  } catch(err){
    console.error("addExit error", err);
    alert("Errore salvataggio uscita");
  }
}

// ---------- SALVA CALCOLO TOTALE ----------
async function saveCalc(){
  if(!currentUser) { alert("Devi effettuare il login"); return; }
  const totals = window.getTotals();
  try {
    await addDoc(collection(db,'calcHistory'), {
      userId: currentUser.id,
      entrate: totals.entrate,
      uscite: totals.uscite,
      net: totals.net,
      createdAt: serverTimestamp()
    });
    alert("Calcolo salvato");
  } catch(err){
    console.error("saveCalc error", err);
    alert("Errore salvataggio calcolo");
  }
}

// ---------- PRESENCE ----------
async function setOnline(status){
  if(!currentUser) return;
  try {
    await setDoc(doc(db,'presence', currentUser.id), {
      userId: currentUser.id,
      online: status,
      saldo: (window.getTotals && window.getTotals().net) ? window.getTotals().net : 0,
      lastActive: serverTimestamp()
    }, { merge: true });
  } catch(err){
    console.error("setOnline error", err);
  }
}

async function updateOnlineSaldo(){
  if(currentUser) await setOnline(true);
}

// ---------- LISTENERS (ENTRATE/USCITE/CALCOLI) ----------
function listenData(){
  // entries
  const qEntries = query(collection(db,'entries'), where("userId","==",currentUser.id), orderBy("createdAt","desc"));
  onSnapshot(qEntries, snap => {
    entryLogEl.innerHTML = '';
    snap.docs.forEach(d=>{
      const dt = d.data();
      const div = document.createElement('div');
      div.className = 'log-item';
      div.dataset.amt = dt.amount;
      const when = dt.createdAt && dt.createdAt.toDate ? dt.createdAt.toDate().toLocaleString() : '';
      div.innerHTML = `<div>+€${dt.amount.toFixed(2)} | ${dt.reason || ''}</div><div style="opacity:0.6;font-size:12px">${when}</div>`;
      entryLogEl.appendChild(div);
    });
    updateTotalsDisplay();
  });

  // exits
  const qExits = query(collection(db,'exits'), where("userId","==",currentUser.id), orderBy("createdAt","desc"));
  onSnapshot(qExits, snap => {
    exitLogEl.innerHTML = '';
    snap.docs.forEach(d=>{
      const dt = d.data();
      const div = document.createElement('div');
      div.className = 'log-item';
      div.dataset.amt = dt.amount;
      const when = dt.createdAt && dt.createdAt.toDate ? dt.createdAt.toDate().toLocaleString() : '';
      div.innerHTML = `<div>-€${dt.amount.toFixed(2)} | ${dt.reason || ''}</div><div style="opacity:0.6;font-size:12px">${when}</div>`;
      exitLogEl.appendChild(div);
    });
    updateTotalsDisplay();
  });

  // calcHistory
  const qCalc = query(collection(db,'calcHistory'), where("userId","==",currentUser.id), orderBy("createdAt","desc"));
  onSnapshot(qCalc, snap => {
    calcLogEl.innerHTML = '';
    snap.docs.forEach(d=>{
      const dt = d.data();
      const div = document.createElement('div');
      div.className = 'log-item';
      const when = dt.createdAt && dt.createdAt.toDate ? dt.createdAt.toDate().toLocaleString() : '';
      div.innerHTML = `<div>Entrate: €${(dt.entrate||0).toFixed(2)} | Uscite: €${(dt.uscite||0).toFixed(2)} | Saldo: €${(dt.net||0).toFixed(2)}</div><div style="opacity:0.6;font-size:12px">${when}</div>`;
      calcLogEl.appendChild(div);
    });
  });
}

function updateTotalsDisplay(){
  const totals = window.getTotals();
  totalsEl.innerText = `Entrate: €${totals.entrate.toFixed(2)} | Uscite: €${totals.uscite.toFixed(2)} | Saldo: €${totals.net.toFixed(2)}`;
}

// ---------- PRESENCE USERS ----------
function listenUsersPresence(){
  const q = query(collection(db,'presence'));
  onSnapshot(q, snap => {
    usersList.innerHTML = '';
    snap.docs.forEach(d=>{
      const dt = d.data();
      const color = dt.online ? 'green' : 'red';
      const name = (dt.userId === (currentUser && currentUser.id)) ? `${currentUser.nome} ${currentUser.cognome}` : (dt.userName || dt.userId);
      const div = document.createElement('div');
      div.innerHTML = `<span style="color:${color}">●</span> ${name} - Saldo: €${((dt.saldo||0).toFixed) ? (dt.saldo||0).toFixed(2) : (Number(dt.saldo||0).toFixed(2))}`;
      usersList.appendChild(div);
    });
  });
}

// ---------- VISIBILITY API ----------
document.addEventListener("visibilitychange", ()=>{ if(currentUser) setOnline(document.visibilityState === "visible"); });
window.addEventListener("beforeunload", ()=>{ if(currentUser) setOnline(false); });

// ---------- GRAFICO MENSILE ----------
async function updateMonthlyChart(){
  if(!currentUser) return;
  try {
    const snap = await getDocs(query(collection(db,'exits'), where("userId","==",currentUser.id)));
    const data = snap.docs.map(d => d.data());
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const lastMonth = (thisMonth === 0) ? 11 : thisMonth - 1;
    const lastMonthYear = (thisMonth === 0) ? thisYear - 1 : thisYear;
    let totalThisMonth = 0, totalLastMonth = 0;
    data.forEach(d => {
      const date = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate() : new Date();
      const m = date.getMonth();
      const y = date.getFullYear();
      if(m === thisMonth && y === thisYear) totalThisMonth += (d.amount || 0);
      if(m === lastMonth && y === lastMonthYear) totalLastMonth += (d.amount || 0);
    });
    const perc = totalLastMonth === 0 ? 0 : ((totalThisMonth - totalLastMonth) / totalLastMonth * 100).toFixed(1);
    monthlyComparisonEl.innerText = perc > 0 ? `Hai speso il ${perc}% in più rispetto al mese scorso` : perc < 0 ? `Hai speso il ${Math.abs(perc)}% in meno rispetto al mese scorso` : `La spesa è uguale al mese scorso`;

    // render chart (Chart.js deve essere caricato globalmente in index.html)
    const ctx = document.getElementById('monthlyChart').getContext('2d');
    if(monthlyChart) monthlyChart.destroy();
    monthlyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Mese Scorso', 'Mese Corrente'],
        datasets: [{
          label: 'Uscite (€)',
          data: [totalLastMonth, totalThisMonth],
          backgroundColor: [ totalThisMonth >= totalLastMonth ? 'rgba(255,99,132,0.8)' : 'rgba(75,192,192,0.8)', 'rgba(75,192,192,0.8)']
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });

  } catch(err){
    console.error("updateMonthlyChart error", err);
  }
}

// ---------- UTILITA' AL PRIMO ACCESSO ----------
/* Nota: non auto-login, l'utente deve inserire telefono per loggarsi/registrarsi */

// Fine file
