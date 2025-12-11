// ==========================
// IMPORTAZIONI FIREBASE V9
// ==========================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
    getFirestore, doc, setDoc, updateDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ==========================
// CONFIGURAZIONE FIREBASE
// (SOSTITUISCI CON I TUOI VALORI)
// ==========================
const firebaseConfig = {
    apiKey: "INSERISCI_API_KEY",
    authDomain: "INSERISCI_authDomain",
    projectId: "INSERISCI_projectId",
    storageBucket: "INSERISCI_storageBucket",
    messagingSenderId: "INSERISCI_messagingSenderId",
    appId: "INSERISCI_appId"
};

// ==========================
// INIZIALIZZAZIONE APP
// ==========================
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==========================
// RIFERIMENTI DOM
// ==========================
const btnEntrata = document.getElementById("btnEntrata");
const btnUscita = document.getElementById("btnUscita");
const listaServizio = document.getElementById("listaServizio");

// Per test: un utente fittizio (sostituibile con login)
const userId = "utente_demo";

// ==========================
// FUNZIONE ENTRATA
// ==========================
async function registraEntrata() {
    await setDoc(doc(db, "presenze", userId), {
        inServizio: true,
        oraEntrata: new Date().toISOString(),
        oraUscita: null
    }, { merge: true });
}

// ==========================
// FUNZIONE USCITA
// ==========================
async function registraUscita() {
    await updateDoc(doc(db, "presenze", userId), {
        inServizio: false,
        oraUscita: new Date().toISOString()
    });
}

// ==========================
// LISTENER REALTIME
// ==========================
onSnapshot(doc(db, "presenze", userId), (snap) => {
    listaServizio.innerHTML = "";

    if (snap.exists() && snap.data().inServizio) {
        const li = document.createElement("li");
        li.textContent = `${userId} in servizio dal: ${new Date(snap.data().oraEntrata).toLocaleTimeString()}`;
        listaServizio.appendChild(li);
    }
});

// ==========================
// EVENT HANDLERS
// ==========================
btnEntrata.addEventListener("click", registraEntrata);
btnUscita.addEventListener("click", registraUscita);
