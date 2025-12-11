import { initializeApp } from "https://www.gstatic.com/firebasejs/10.6.0/firebase-app.js";
import {
  getFirestore, collection, query, where, getDocs, addDoc,
  orderBy, onSnapshot, serverTimestamp, doc, setDoc
} from "https://www.gstatic.com/firebasejs/10.6.0/firebase-firestore.js";

import { Chart } from "https://cdn.jsdelivr.net/npm/chart.js";


// 🔥 FIREBASE CONFIG — METTI LA TUA QUI
const firebaseConfig = {
  apiKey: "AIzaSyDA8x2UcwoDBNbEZbsE5nGUNlLHI-aXUHA",
  authDomain: "gestionale-entrate-uscite-wr.firebaseapp.com",
  projectId: "gestionale-entrate-uscite-wr",
  storageBucket: "gestionale-entrate-uscite-wr.firebasestorage.app",
  messagingSenderId: "180959843310",
  appId: "1:180959843310:web:0800ebae9267f61071b4ff",
  measurementId: "G-XFL9ZH8K6T"
};


const app = initializeApp(firebaseConfig);
const db = getFirestore(app);


let currentUser = null;
let monthlyChart = null;

// LOGIN
document.getElementById("btnLogin").onclick = async () => {

  const nome = nomeInput.value.trim();
  const cognome = cognomeInput.value.trim();
  const telefono = telefonoInput.value.trim();

  if (!nome || !cognome || !telefono) {
    loginMsg.innerText = "Compila tutti i campi";
    return;
  }

  const usersCol = collection(db, "users");
  const q = query(
    usersCol,
    where("nome", "==", nome),
    where("cognome", "==", cognome),
    where("telefono", "==", telefono)
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    const newUser = await addDoc(usersCol, {
      nome, cognome, telefono,
      createdAt: serverTimestamp()
    });

    currentUser = {
      id: newUser.id,
      nome, cognome, telefono
    };
  } else {
    const d = snap.docs[0].data();
    currentUser = {
      id: snap.docs[0].id,
      nome: d.nome,
      cognome: d.cognome,
      telefono: d.telefono
    };
  }

  loginCard.style.display = "none";
  dashboard.style.display = "block";

  greeting.innerText = `Ciao ${currentUser.nome} ${currentUser.cognome}`;

  setOnline(true);

  listenUserData();
  listenUsersPresence();
  updateMonthlyChart();
};

// LOGOUT
window.logout = () => {
  setOnline(false);
  currentUser = null;
  dashboard.style.display = "none";
  loginCard.style.display = "block";
};

// ENTRATA
window.addEntry = async () => {
  const amount = Number(entryAmount.value);
  const reason = entryReason.value;

  if (!amount) return alert("Importo non valido");

  await addDoc(collection(db, "entries"), {
    userId: currentUser.id,
    amount,
    reason,
    createdAt: serverTimestamp()
  });

  entryAmount.value = "";
  entryReason.value = "";
  updateOnlineSaldo();
  updateMonthlyChart();
};

// USCITA
window.addExit = async () => {
  const amount = Number(exitAmount.value);
  const reason = exitReason.value;

  if (!amount) return alert("Importo non valido");

  await addDoc(collection(db, "exits"), {
    userId: currentUser.id,
    amount,
    reason,
    createdAt: serverTimestamp()
  });

  exitAmount.value = "";
  exitReason.value = "";
  updateOnlineSaldo();
  updateMonthlyChart();
};

// SALVA TOTALE
window.saveCalc = async () => {
  const totals = getTotals();
  await addDoc(collection(db, "calcHistory"), {
    userId: currentUser.id,
    ...totals,
    createdAt: serverTimestamp()
  });
  alert("Calcolo salvato!");
};

// CALCOLA TOTALI
function getTotals() {
  const e = document.querySelectorAll("#entryLog .log-item");
  const x = document.querySelectorAll("#exitLog .log-item");

  let entrate = 0;
  let uscite = 0;

  e.forEach(item => entrate += Number(item.dataset.amt));
  x.forEach(item => uscite += Number(item.dataset.amt));

  return {
    entrate,
    uscite,
    net: entrate - uscite
  };
}

// AGGIORNA TOTALI
function updateTotals() {
  const t = getTotals();

  totals.innerText =
    `Entrate: €${t.entrate.toFixed(2)} | Uscite: €${t.uscite.toFixed(2)} | Saldo: €${t.net.toFixed(2)}`;

  updateOnlineSaldo();
}

// PRESENZA ONLINE
async function setOnline(status) {
  if (!currentUser) return;

  const ref = doc(db, "presence", currentUser.id);

  await setDoc(ref, {
    userId: currentUser.id,
    nome: currentUser.nome,
    cognome: currentUser.cognome,
    online: status,
    saldo: getTotals().net,
    lastActive: serverTimestamp()
  }, { merge: true });
}

// solo saldo
async function updateOnlineSaldo() {
  if (!currentUser) return;
  const ref = doc(db, "presence", currentUser.id);
  await setDoc(ref, { saldo: getTotals().net }, { merge: true });
}

// LISTENER ENTRATE/USCITE/CALCOLI
function listenUserData() {

  // ENTRATE
  const entriesQ = query(
    collection(db, "entries"),
    where("userId", "==", currentUser.id),
    orderBy("createdAt", "desc")
  );

  onSnapshot(entriesQ, snap => {
    entryLog.innerHTML = "";
    snap.forEach(doc => {
      const d = doc.data();
      const div = document.createElement("div");
      div.className = "log-item";
      div.dataset.amt = d.amount;
      div.innerHTML = `+€${d.amount} | ${d.reason}`;
      entryLog.appendChild(div);
    });
    updateTotals();
  });

  // USCITE
  const exitsQ = query(
    collection(db, "exits"),
    where("userId", "==", currentUser.id),
    orderBy("createdAt", "desc")
  );

  onSnapshot(exitsQ, snap => {
    exitLog.innerHTML = "";
    snap.forEach(doc => {
      const d = doc.data();
      const div = document.createElement("div");
      div.className = "log-item";
      div.dataset.amt = d.amount;
      div.innerHTML = `-€${d.amount} | ${d.reason}`;
      exitLog.appendChild(div);
    });
    updateTotals();
  });

  // STORICO CALCOLI
  const calcQ = query(
    collection(db, "calcHistory"),
    where("userId", "==", currentUser.id),
    orderBy("createdAt", "desc")
  );

  onSnapshot(calcQ, snap => {
    calcLog.innerHTML = "";
    snap.forEach(doc => {
      const d = doc.data();
      const div = document.createElement("div");
      div.className = "log-item";
      div.innerHTML =
        `Entrate: €${d.entrate} | Uscite: €${d.uscite} | Saldo: €${d.net}`;
      calcLog.appendChild(div);
    });
  });
}

// LISTA UTENTI ONLINE
function listenUsersPresence() {
  const q = collection(db, "presence");

  onSnapshot(q, snap => {
    usersList.innerHTML = "";

    snap.forEach(doc => {
      const u = doc.data();
      const color = u.online ? "green" : "red";

      const div = document.createElement("div");
      div.innerHTML =
        `<span style="color:${color}">●</span> ${u.nome} ${u.cognome} — €${u.saldo?.toFixed(2) || 0}`;
      usersList.appendChild(div);
    });
  });
}

// VISIBILITY
document.addEventListener("visibilitychange", () => {
  if (currentUser) setOnline(document.visibilityState === "visible");
});

window.addEventListener("beforeunload", () => setOnline(false));


// GRAFICO MENSILE
async function updateMonthlyChart() {
  if (!currentUser) return;

  const snap = await getDocs(
    query(collection(db, "exits"), where("userId", "==", currentUser.id))
  );

  const now = new Date();
  const m = now.getMonth();
  const y = now.getFullYear();

  const lastM = m === 0 ? 11 : m - 1;
  const lastY = m === 0 ? y - 1 : y;

  let thisTotal = 0;
  let lastTotal = 0;

  snap.forEach(doc => {
    const d = doc.data();
    const date = d.createdAt?.toDate() || new Date();

    if (date.getMonth() === m && date.getFullYear() === y)
      thisTotal += d.amount;

    if (date.getMonth() === lastM && date.getFullYear() === lastY)
      lastTotal += d.amount;
  });

  const perc = lastTotal === 0 ? 0 :
    ((thisTotal - lastTotal) / lastTotal * 100).toFixed(1);

  monthlyComparison.innerText =
    perc > 0 ? `Hai speso il ${perc}% in più`
    : perc < 0 ? `Hai speso il ${Math.abs(perc)}% in meno`
    : `Spesa identica al mese scorso`;

  // CHART
  const ctx = document.getElementById("monthlyChart").getContext("2d");

  if (monthlyChart) monthlyChart.destroy();

  monthlyChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Mese Scorso", "Mese Corrente"],
      datasets: [{
        label: "Uscite (€)",
        data: [lastTotal, thisTotal],
        backgroundColor: ["#ff5c5c", "#3ddc84"]
      }]
    },
    options: { responsive: true }
  });
}
