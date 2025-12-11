/* ================================================
   IMPORT FIREBASE
================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";
import {
    getFirestore, collection, addDoc, query, where,
    getDocs, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-firestore.js";


/* ================================================
   CONFIG FIREBASE
================================================ */
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


/* ================================================
   ELEMENTI DOM
================================================ */
const loginScreen = document.getElementById("login-screen");
const appDiv = document.getElementById("app");

const loginBtn = document.getElementById("login-btn");

const nome = document.getElementById("nome");
const cognome = document.getElementById("cognome");
const telefono = document.getElementById("telefono");

const welcome = document.getElementById("welcome");

const entrataImporto = document.getElementById("entrata-importo");
const entrataMotivo = document.getElementById("entrata-motivo");
const uscitaImporto = document.getElementById("uscita-importo");
const uscitaMotivo = document.getElementById("uscita-motivo");

const addEntrataBtn = document.getElementById("add-entrata");
const addUscitaBtn = document.getElementById("add-uscita");

const logEntrate = document.getElementById("log-entrate");
const logUscite = document.getElementById("log-uscite");

const saldoTotale = document.getElementById("saldo-totale");

const monthlyBtn = document.getElementById("monthly-report-btn");
const monthlySummary = document.getElementById("monthly-summary");
const monthlyChartCanvas = document.getElementById("monthlyChart");


/* ================================================
   LOGIN
================================================ */
let currentUser = null;

loginBtn.addEventListener("click", () => {
    if (!nome.value || !cognome.value || !telefono.value)
        return alert("Compila tutti i campi!");

    currentUser = {
        nome: nome.value,
        cognome: cognome.value,
        telefono: telefono.value,
        userId: (nome.value + cognome.value + telefono.value).toLowerCase()
    };

    localStorage.setItem("gd_user", JSON.stringify(currentUser));

    welcome.textContent = `Benvenuto ${currentUser.nome} ${currentUser.cognome}`;

    loginScreen.classList.add("hidden");
    appDiv.classList.remove("hidden");

    loadLogs();
});


/* AUTO LOGIN */
const saved = localStorage.getItem("gd_user");
if (saved) {
    currentUser = JSON.parse(saved);
    welcome.textContent = `Benvenuto ${currentUser.nome} ${currentUser.cognome}`;

    loginScreen.classList.add("hidden");
    appDiv.classList.remove("hidden");

    loadLogs();
}


/* ================================================
   SALVATAGGIO ENTRATE
================================================ */
addEntrataBtn.addEventListener("click", async () => {
    await addDoc(collection(db, "entries"), {
        userId: currentUser.userId,
        importo: Number(entrataImporto.value),
        motivo: entrataMotivo.value,
        createdAt: serverTimestamp()
    });

    entrataImporto.value = "";
    entrataMotivo.value = "";
    loadLogs();
});


/* ================================================
   SALVATAGGIO USCITE
================================================ */
addUscitaBtn.addEventListener("click", async () => {
    await addDoc(collection(db, "exits"), {
        userId: currentUser.userId,
        importo: Number(uscitaImporto.value),
        motivo: uscitaMotivo.value,
        createdAt: serverTimestamp()
    });

    uscitaImporto.value = "";
    uscitaMotivo.value = "";
    loadLogs();
});


/* ================================================
   CARICAMENTO LOG
================================================ */
async function loadLogs() {
    logEntrate.innerHTML = "";
    logUscite.innerHTML = "";

    let totEntrate = 0;
    let totUscite = 0;

    const q1 = query(collection(db, "entries"), where("userId", "==", currentUser.userId));
    const q2 = query(collection(db, "exits"), where("userId", "==", currentUser.userId));

    const s1 = await getDocs(q1);
    s1.forEach(doc => {
        const d = doc.data();
        totEntrate += d.importo;
        logEntrate.innerHTML += `<li>€${d.importo} — ${d.motivo}</li>`;
    });

    const s2 = await getDocs(q2);
    s2.forEach(doc => {
        const d = doc.data();
        totUscite += d.importo;
        logUscite.innerHTML += `<li>€${d.importo} — ${d.motivo}</li>`;
    });

    saldoTotale.textContent =
        `Entrate: €${totEntrate.toFixed(2)} — Uscite: €${totUscite.toFixed(2)} — Saldo: €${(totEntrate - totUscite).toFixed(2)}`;
}


/* ================================================
   REPORT MENSILE
================================================ */
async function getMonthlyTotal(collectionName, start, end) {
    const q = query(
        collection(db, collectionName),
        where("userId", "==", currentUser.userId),
        where("createdAt", ">=", Timestamp.fromDate(start)),
        where("createdAt", "<", Timestamp.fromDate(end))
    );

    let total = 0;
    const snap = await getDocs(q);
    snap.forEach(doc => total += doc.data().importo);

    return total;
}

let monthlyChart = null;

async function monthlyReport() {
    const now = new Date();
    const startThis = new Date(now.getFullYear(), now.getMonth(), 1);
    const startNext = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const startPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const thisTotal = await getMonthlyTotal("exits", startThis, startNext);
    const prevTotal = await getMonthlyTotal("exits", startPrev, startThis);

    let diff = thisTotal - prevTotal;
    let pct = (diff / (prevTotal || 1)) * 100;

    if (prevTotal === 0) {
        monthlySummary.textContent =
            `Il mese precedente non hai speso nulla. Questo mese hai speso €${thisTotal.toFixed(2)}.`;
    } else {
        monthlySummary.textContent =
            `Questo mese hai speso ${pct >= 0 ? pct.toFixed(1) + "% in più" : Math.abs(pct).toFixed(1) + "% in meno"} rispetto al mese scorso.`;
    }

    if (monthlyChart) monthlyChart.destroy();

    monthlyChart = new Chart(monthlyChartCanvas, {
        type: "bar",
        data: {
            labels: ["Mese scorso", "Questo mese"],
            datasets: [{
                data: [prevTotal, thisTotal]
            }]
        }
    });
}

monthlyBtn.addEventListener("click", monthlyReport);
