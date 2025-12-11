// ---------------------------
// 🔥 Firebase Config
// ---------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";
import {
    getFirestore, collection, doc, setDoc, getDocs,
    query, where, addDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-firestore.js";

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

// ---------------------------
// Login / Registrazione
// ---------------------------
const loginBtn = document.getElementById("login-btn");
loginBtn.addEventListener("click", async () => {
    const nome = document.getElementById("nome").value.trim();
    const cognome = document.getElementById("cognome").value.trim();
    const telefono = document.getElementById("telefono").value.trim();

    if (!nome || !cognome || !telefono) {
        alert("Compila tutti i campi");
        return;
    }

    const usersRef = collection(db, "users");
    const q = query(usersRef, where("telefono", "==", telefono));
    const snap = await getDocs(q);

    let userId = "";

    if (snap.empty) {
        const userDoc = await addDoc(usersRef, {
            nome,
            cognome,
            telefono,
            saldo: 0,
            lastLogin: serverTimestamp()
        });
        userId = userDoc.id;
    } else {
        userId = snap.docs[0].id;
    }

    localStorage.setItem("userId", userId);

    document.getElementById("login-container").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");

    startApp(userId);
});

// ---------------------------
// Funzione principale
// ---------------------------
async function startApp(userId) {
    const userDoc = (await getDocs(query(collection(db, "users"), where("__name__", "==", userId)))).docs[0];
    const user = userDoc.data();

    document.getElementById("welcome").innerText =
        `Ciao ${user.nome} ${user.cognome}`;

    // ---------------------------
    // Stato Online
    // ---------------------------
    const presenceRef = doc(db, "presence", userId);
    await setDoc(presenceRef, { online: true }, { merge: true });

    window.addEventListener("beforeunload", async () => {
        await setDoc(presenceRef, { online: false }, { merge: true });
    });

    // ---------------------------
    // Aggiungi Entrata
    // ---------------------------
    document.getElementById("add-entrata").addEventListener("click", async () => {
        const importo = Number(document.getElementById("entrata-importo").value);
        const motivo = document.getElementById("entrata-motivo").value;

        if (!importo || !motivo) return;

        await addDoc(collection(db, "entries"), {
            userId,
            importo,
            motivo,
            createdAt: serverTimestamp()
        });
    });

    // ---------------------------
    // Aggiungi Uscita
    // ---------------------------
    document.getElementById("add-uscita").addEventListener("click", async () => {
        const importo = Number(document.getElementById("uscita-importo").value);
        const motivo = document.getElementById("uscita-motivo").value;

        if (!importo || !motivo) return;

        await addDoc(collection(db, "exits"), {
            userId,
            importo,
            motivo,
            createdAt: serverTimestamp()
        });
    });

    // ---------------------------
    // Log Entrate/Uscite in tempo reale
    // ---------------------------
    onSnapshot(query(collection(db, "entries"), where("userId", "==", userId)), snap => {
        const list = document.getElementById("log-entrate");
        list.innerHTML = "";
        snap.forEach(d => list.innerHTML += `<li>+€${d.data().importo} — ${d.data().motivo}</li>`);
    });

    onSnapshot(query(collection(db, "exits"), where("userId", "==", userId)), snap => {
        const list = document.getElementById("log-uscite");
        list.innerHTML = "";
        snap.forEach(d => list.innerHTML += `<li>-€${d.data().importo} — ${d.data().motivo}</li>`);
    });

    // ---------------------------
    // Lista Utenti + Stato Online
    // ---------------------------
    onSnapshot(collection(db, "presence"), snap => {
        const list = document.getElementById("users-list");
        list.innerHTML = "";

        snap.forEach(async presenceDoc => {
            const uid = presenceDoc.id;
            const presence = presenceDoc.data();

            const userSnap = await getDocs(
                query(collection(db, "users"), where("__name__", "==", uid))
            );

            if (userSnap.empty) return;
            const u = userSnap.docs[0].data();

            list.innerHTML += `
                <li>
                    <span class="${presence.online ? "green" : "red"}"></span>
                    ${u.nome} ${u.cognome}
                </li>
            `;
        });
    });

    // ---------------------------
    // Grafico Mensile (Chart.js globale)
    // ---------------------------
    const ctx = document.getElementById("monthlyChart");

    new Chart(ctx, {
        type: "bar",
        data: {
            labels: ["Mese Scorso", "Questo Mese"],
            datasets: [{
                label: "Differenza Spesa",
                data: [50, 70]
            }]
        }
    });
}
