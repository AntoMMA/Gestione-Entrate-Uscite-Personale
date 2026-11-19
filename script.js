/* =========================================================
   GESTIONALE ENTRATE/USCITE
   Firebase Firestore + Cloudinary (upload unsigned)
   ========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-firestore.js";

/* =========================================================
   CONFIGURAZIONE
   ========================================================= */

// Mantieni qui la configurazione del tuo progetto Firebase.
const firebaseConfig = {
  apiKey: "AIzaSyDA8x2UcwoDBNbEZbsE5nGUNlLHI-aXUHA",
  authDomain: "gestionale-entrate-uscite-wr.firebaseapp.com",
  projectId: "gestionale-entrate-uscite-wr",
  storageBucket: "gestionale-entrate-uscite-wr.firebasestorage.app",
  messagingSenderId: "180959843310",
  appId: "1:180959843310:web:0800ebae9267f61071b4ff"
};

const CLOUDINARY_CLOUD_NAME = "dzgynfn7t";
const CLOUDINARY_UPLOAD_PRESET = "gestionale_personale"; // Preset unsigned
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
const MAX_PROFILE_IMAGE_SIZE = 4 * 1024 * 1024;
const PRESENCE_INTERVAL_MS = 20_000;
const ONLINE_THRESHOLD_MS = 45_000;
const LOG_REFRESH_INTERVAL_MS = 20_000;

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

/* =========================================================
   ELEMENTI DOM
   ========================================================= */
const $ = (selector) => document.querySelector(selector);

const loginScreen = $("#login-screen");
const loginForm = $("#login-form");
const loginBtn = $("#login-btn");
const nomeInput = $("#nome");
const cognomeInput = $("#cognome");
const telefonoInput = $("#telefono");
const avatarPreviewLogin = $("#avatar-preview-login");

const appDiv = $("#app");
const logoutBtn = $("#logout-btn");
const usersList = $("#users-list");

const profileName = $("#profile-name");
const profilePhone = $("#profile-phone");
const avatarDisplay = $("#avatar-display");
const profileFileInput = $("#profile-file");
const removeProfileBtn = $("#remove-profile-btn");
const profileUploadLabel = profileFileInput?.closest("label");

const entrataImporto = $("#entrata-importo");
const entrataMotivo = $("#entrata-motivo");
const uscitaImporto = $("#uscita-importo");
const uscitaMotivo = $("#uscita-motivo");
const addEntrataBtn = $("#add-entrata");
const addUscitaBtn = $("#add-uscita");

const logEntrate = $("#log-entrate");
const logUscite = $("#log-uscite");
const saldoTotale = $("#saldo-totale");

const monthlyBtn = $("#monthly-report-btn");
const autoToggle = $("#auto-report-toggle");
const monthlySummary = $("#monthly-summary");
const monthlyCanvas = $("#monthlyChart");

/* =========================================================
   STATO APPLICAZIONE
   ========================================================= */
let currentUser = null;
let usersUnsub = null;
let monthlyChart = null;
let autoReportEnabled = true;
let presenceIntervalHandle = null;
let logRefreshIntervalHandle = null;
let monthlyTimeoutHandle = null;
let isOpeningApp = false;

/* =========================================================
   UTILITÀ GENERALI
   ========================================================= */
function formatCurrency(value) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
  }).format(Number(value) || 0);
}

function setButtonLoading(button, isLoading, loadingText = "Attendi...") {
  if (!button) return;

  if (isLoading) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent;
    }
    button.disabled = true;
    button.textContent = loadingText;
  } else {
    button.disabled = false;
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }
}

function showError(message, error) {
  console.error(message, error);
  alert(message);
}

function makeUserId(nome, cognome, telefono) {
  const cleanName = String(nome || "").trim().toLowerCase().replace(/\s+/g, "_");
  const cleanSurname = String(cognome || "").trim().toLowerCase().replace(/\s+/g, "_");
  const cleanPhone = String(telefono || "").replace(/\D/g, "");

  // Evita che caratteri riservati creino segmenti inattesi nel percorso Firestore.
  const safeName = cleanName.replace(/[\/?#[\]]/g, "_");
  const safeSurname = cleanSurname.replace(/[\/?#[\]]/g, "_");
  return `${safeName}_${safeSurname}_${cleanPhone}`;
}

function isValidSavedUser(user) {
  return Boolean(
    user &&
    typeof user.nome === "string" && user.nome.trim() &&
    typeof user.cognome === "string" && user.cognome.trim() &&
    typeof user.telefono === "string" && user.telefono.trim() &&
    typeof user.userId === "string" && user.userId.trim()
  );
}

function normalizeTimestamp(timestamp) {
  if (!timestamp) return null;
  if (typeof timestamp.toDate === "function") return timestamp.toDate();
  if (timestamp instanceof Date) return timestamp;

  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isOnline(lastSeen) {
  const date = normalizeTimestamp(lastSeen);
  if (!date) return false;
  const difference = Date.now() - date.getTime();
  return difference >= 0 && difference <= ONLINE_THRESHOLD_MS;
}

function createAvatar(container, photoURL, name, className = "") {
  if (!container) return;
  container.replaceChildren();

  if (photoURL) {
    const image = document.createElement("img");
    image.src = photoURL;
    image.alt = "Immagine profilo";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.onerror = () => {
      container.replaceChildren();
      container.textContent = (name || "?").trim().charAt(0).toUpperCase() || "?";
      if (className) container.classList.add(className);
    };
    container.appendChild(image);
    return;
  }

  container.textContent = (name || "?").trim().charAt(0).toUpperCase() || "?";
  if (className) container.classList.add(className);
}

function setProfileControls(isCurrentUser, hasPhoto) {
  if (profileFileInput) profileFileInput.disabled = !isCurrentUser;
  if (profileUploadLabel) profileUploadLabel.hidden = !isCurrentUser;
  if (removeProfileBtn) {
    removeProfileBtn.hidden = !(isCurrentUser && hasPhoto);
  }
}

/* =========================================================
   PRESENZA UTENTI
   ========================================================= */
async function setPresencePing(userId) {
  if (!userId) return;

  try {
    await setDoc(doc(db, "users", userId), {
      lastSeen: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error("Errore durante l'aggiornamento della presenza:", error);
  }
}

function startPresence(userId) {
  stopPresence();
  setPresencePing(userId);
  presenceIntervalHandle = window.setInterval(() => {
    setPresencePing(userId);
  }, PRESENCE_INTERVAL_MS);
}

function stopPresence() {
  if (presenceIntervalHandle !== null) {
    window.clearInterval(presenceIntervalHandle);
    presenceIntervalHandle = null;
  }
}

/* =========================================================
   LOGIN E APERTURA APPLICAZIONE
   ========================================================= */
loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isOpeningApp) return;

  const nome = nomeInput.value.trim();
  const cognome = cognomeInput.value.trim();
  const telefono = telefonoInput.value.trim();

  if (!nome || !cognome || !telefono) {
    alert("Compila tutti i campi.");
    return;
  }

  const userId = makeUserId(nome, cognome, telefono);
  if (!userId || userId.endsWith("_")) {
    alert("Controlla i dati inseriti e riprova.");
    return;
  }

  const user = { nome, cognome, telefono, userId };
  setButtonLoading(loginBtn, true, "Accesso...");

  try {
    await setDoc(doc(db, "users", userId), {
      ...user,
      lastSeen: serverTimestamp()
    }, { merge: true });

    localStorage.setItem("gd_user", JSON.stringify(user));
    currentUser = user;
    await openApp();
  } catch (error) {
    showError("Non è stato possibile accedere. Controlla la connessione e le regole di accesso a Firebase.", error);
  } finally {
    setButtonLoading(loginBtn, false);
  }
});

async function restoreSavedSession() {
  const saved = localStorage.getItem("gd_user");
  if (!saved) return;

  try {
    const user = JSON.parse(saved);
    if (!isValidSavedUser(user)) {
      localStorage.removeItem("gd_user");
      return;
    }

    currentUser = user;
    await setDoc(doc(db, "users", user.userId), {
      nome: user.nome,
      cognome: user.cognome,
      telefono: user.telefono,
      userId: user.userId,
      lastSeen: serverTimestamp()
    }, { merge: true });

    await openApp();
  } catch (error) {
    console.error("Ripristino sessione non riuscito:", error);
    currentUser = null;
    localStorage.removeItem("gd_user");
  }
}

async function openApp() {
  if (!currentUser || isOpeningApp) return;
  isOpeningApp = true;

  loginScreen.classList.add("hidden");
  loginScreen.setAttribute("aria-hidden", "true");
  appDiv.classList.remove("hidden");
  appDiv.setAttribute("aria-hidden", "false");

  profileName.textContent = `${currentUser.nome} ${currentUser.cognome}`;
  profilePhone.textContent = currentUser.telefono;

  startPresence(currentUser.userId);
  subscribeUsersList();
  startLogRefresh();

  try {
    await Promise.allSettled([
      loadUserProfilePhoto(currentUser.userId),
      loadLogs(),
      generateMonthlyReport()
    ]);
  } finally {
    scheduleMonthlyAuto();
    isOpeningApp = false;
  }
}

/* =========================================================
   LOGOUT E PULIZIA
   ========================================================= */
logoutBtn?.addEventListener("click", logout);

function logout() {
  stopPresence();
  stopLogRefresh();
  stopMonthlyAuto();

  if (typeof usersUnsub === "function") {
    usersUnsub();
    usersUnsub = null;
  }

  localStorage.removeItem("gd_user");
  currentUser = null;

  appDiv.classList.add("hidden");
  appDiv.setAttribute("aria-hidden", "true");
  loginScreen.classList.remove("hidden");
  loginScreen.setAttribute("aria-hidden", "false");

  usersList.replaceChildren();
  logEntrate.replaceChildren();
  logUscite.replaceChildren();
  saldoTotale.textContent = "";
  monthlySummary.textContent = "";
  profileName.textContent = "";
  profilePhone.textContent = "";
  avatarDisplay.replaceChildren();
  avatarPreviewLogin.style.backgroundImage = "none";
  setProfileControls(true, false);

  if (monthlyChart) {
    monthlyChart.destroy();
    monthlyChart = null;
  }
}

/* =========================================================
   ELENCO UTENTI IN TEMPO REALE
   ========================================================= */
function subscribeUsersList() {
  if (typeof usersUnsub === "function") usersUnsub();

  usersUnsub = onSnapshot(collection(db, "users"), (snapshot) => {
    const users = snapshot.docs
      .map((documentSnapshot) => documentSnapshot.data())
      .filter((user) => user && user.userId)
      .sort((a, b) => {
        const nameA = `${a.nome || ""} ${a.cognome || ""}`.trim();
        const nameB = `${b.nome || ""} ${b.cognome || ""}`.trim();
        return nameA.localeCompare(nameB, "it");
      });

    const fragment = document.createDocumentFragment();

    users.forEach((user) => {
      const item = document.createElement("li");
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.setAttribute("aria-label", `Visualizza il profilo di ${user.nome || "utente"} ${user.cognome || ""}`);

      const avatar = document.createElement("div");
      avatar.className = "user-avatar";
      createAvatar(avatar, user.photoURL, user.nome);

      const meta = document.createElement("div");
      meta.className = "user-meta";

      const name = document.createElement("div");
      name.className = "user-name";
      name.textContent = `${user.nome || "—"} ${user.cognome || ""}`.trim();

      const status = document.createElement("div");
      status.className = "user-status";

      const online = isOnline(user.lastSeen);
      const dot = document.createElement("span");
      dot.className = `status-dot ${online ? "status-online" : "status-offline"}`;
      dot.setAttribute("aria-hidden", "true");

      const statusText = document.createElement("span");
      statusText.textContent = online ? "online" : "offline";

      status.append(dot, statusText);
      meta.append(name, status);
      item.append(avatar, meta);

      const openSelectedProfile = () => showProfileInMain(user);
      item.addEventListener("click", openSelectedProfile);
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openSelectedProfile();
        }
      });

      fragment.appendChild(item);
    });

    usersList.replaceChildren(fragment);
  }, (error) => {
    console.error("Errore aggiornamento elenco utenti:", error);
  });
}

/* =========================================================
   VISUALIZZAZIONE PROFILO
   ========================================================= */
function showProfileInMain(userData) {
  if (!userData) return;

  profileName.textContent = `${userData.nome || ""} ${userData.cognome || ""}`.trim();
  profilePhone.textContent = userData.telefono || "";
  createAvatar(avatarDisplay, userData.photoURL, userData.nome);

  const isCurrentUser = Boolean(currentUser && userData.userId === currentUser.userId);
  setProfileControls(isCurrentUser, Boolean(userData.photoURL));
}

async function loadUserProfilePhoto(userId) {
  if (!userId) return;

  try {
    const userSnapshot = await getDoc(doc(db, "users", userId));
    if (!userSnapshot.exists()) return;

    const userData = userSnapshot.data();
    showProfileInMain(userData);

    if (userData.photoURL) {
      avatarPreviewLogin.style.backgroundImage = `url("${String(userData.photoURL).replace(/["\\]/g, "")}")`;
    } else {
      avatarPreviewLogin.style.backgroundImage = "none";
    }
  } catch (error) {
    console.error("Errore caricamento immagine profilo:", error);
  }
}

/* =========================================================
   CARICAMENTO IMMAGINE PROFILO SU CLOUDINARY
   ========================================================= */
profileFileInput?.addEventListener("change", async (event) => {
  if (!currentUser) {
    alert("Effettua prima l'accesso.");
    return;
  }

  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("Seleziona un file immagine valido.");
    event.target.value = "";
    return;
  }

  if (file.size > MAX_PROFILE_IMAGE_SIZE) {
    alert("File troppo grande. La dimensione massima consentita è 4 MB.");
    event.target.value = "";
    return;
  }

  if (profileFileInput.disabled) {
    event.target.value = "";
    return;
  }

  const uploadButton = profileUploadLabel;
  if (uploadButton) uploadButton.style.pointerEvents = "none";

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    formData.append("folder", "gestionale_users");
    formData.append("public_id", currentUser.userId);

    const response = await fetch(CLOUDINARY_URL, {
      method: "POST",
      body: formData
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error?.message || `Errore Cloudinary (${response.status}).`);
    }

    if (!result.secure_url) {
      throw new Error("Cloudinary non ha restituito un URL sicuro per l'immagine.");
    }

    await updateDoc(doc(db, "users", currentUser.userId), {
      photoURL: result.secure_url,
      lastSeen: serverTimestamp()
    });

    await loadUserProfilePhoto(currentUser.userId);
    alert("Immagine profilo aggiornata.");
  } catch (error) {
    showError(`Errore durante il caricamento dell'immagine: ${error.message}`, error);
  } finally {
    if (uploadButton) uploadButton.style.pointerEvents = "";
    event.target.value = "";
  }
});

/* =========================================================
   RIMOZIONE IMMAGINE PROFILO
   ========================================================= */
removeProfileBtn?.addEventListener("click", async () => {
  if (!currentUser) return;

  const confirmed = confirm("Vuoi davvero rimuovere la tua immagine profilo?");
  if (!confirmed) return;

  setButtonLoading(removeProfileBtn, true, "Rimozione...");
  try {
    await updateDoc(doc(db, "users", currentUser.userId), {
      photoURL: null,
      lastSeen: serverTimestamp()
    });

    await loadUserProfilePhoto(currentUser.userId);
    alert("Immagine profilo rimossa dal profilo.");
  } catch (error) {
    showError("Non è stato possibile rimuovere l'immagine profilo.", error);
  } finally {
    setButtonLoading(removeProfileBtn, false);
  }
});

/* =========================================================
   CREAZIONE ENTRATE E USCITE
   ========================================================= */
addEntrataBtn?.addEventListener("click", () => {
  addTransaction("entries", entrataImporto, entrataMotivo, addEntrataBtn, "Entrata");
});

addUscitaBtn?.addEventListener("click", () => {
  addTransaction("exits", uscitaImporto, uscitaMotivo, addUscitaBtn, "Uscita");
});

async function addTransaction(collectionName, amountInput, reasonInput, button, defaultReason) {
  if (!currentUser) {
    alert("Effettua prima l'accesso.");
    return;
  }

  const amount = Number(amountInput.value);
  const reason = reasonInput.value.trim() || defaultReason;

  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Inserisci un importo valido e maggiore di zero.");
    amountInput.focus();
    return;
  }

  if (amount > 99_999_999) {
    alert("L'importo inserito è troppo elevato.");
    return;
  }

  setButtonLoading(button, true, "Salvataggio...");
  try {
    await addDoc(collection(db, collectionName), {
      userId: currentUser.userId,
      importo: amount,
      motivo: reason,
      createdAt: serverTimestamp()
    });

    amountInput.value = "";
    reasonInput.value = "";
    await loadLogs();
    await generateMonthlyReport();
  } catch (error) {
    showError("Non è stato possibile salvare il movimento. Verifica la connessione e le regole Firestore.", error);
  } finally {
    setButtonLoading(button, false);
  }
}

/* =========================================================
   CARICAMENTO LOG E TOTALI
   ========================================================= */
async function loadLogs() {
  if (!currentUser) return;
  const userIdAtStart = currentUser.userId;

  try {
    const entriesQuery = query(
      collection(db, "entries"),
      where("userId", "==", userIdAtStart),
      orderBy("createdAt", "desc")
    );
    const exitsQuery = query(
      collection(db, "exits"),
      where("userId", "==", userIdAtStart),
      orderBy("createdAt", "desc")
    );

    const [entriesSnapshot, exitsSnapshot] = await Promise.all([
      getDocs(entriesQuery),
      getDocs(exitsQuery)
    ]);

    // Evita di mostrare dati di una sessione precedente dopo logout o cambio utente.
    if (!currentUser || currentUser.userId !== userIdAtStart) return;

    let totalEntries = 0;
    let totalExits = 0;
    const entriesFragment = document.createDocumentFragment();
    const exitsFragment = document.createDocumentFragment();

    entriesSnapshot.forEach((documentSnapshot) => {
      const data = documentSnapshot.data();
      const amount = Number(data.importo) || 0;
      totalEntries += amount;
      entriesFragment.appendChild(createLogItem(amount, data.motivo));
    });

    exitsSnapshot.forEach((documentSnapshot) => {
      const data = documentSnapshot.data();
      const amount = Number(data.importo) || 0;
      totalExits += amount;
      exitsFragment.appendChild(createLogItem(amount, data.motivo));
    });

    logEntrate.replaceChildren(entriesFragment);
    logUscite.replaceChildren(exitsFragment);

    saldoTotale.textContent =
      `Entrate: ${formatCurrency(totalEntries)} — ` +
      `Uscite: ${formatCurrency(totalExits)} — ` +
      `Saldo: ${formatCurrency(totalEntries - totalExits)}`;
  } catch (error) {
    console.error("Errore durante il caricamento dei movimenti:", error);
    saldoTotale.textContent = "Impossibile caricare i totali. Controlla la connessione o gli indici Firestore.";
  }
}

function createLogItem(amount, reason) {
  const item = document.createElement("li");
  item.textContent = `${formatCurrency(amount)} — ${reason || ""}`;
  return item;
}

function startLogRefresh() {
  stopLogRefresh();
  logRefreshIntervalHandle = window.setInterval(() => {
    if (currentUser) loadLogs();
  }, LOG_REFRESH_INTERVAL_MS);
}

function stopLogRefresh() {
  if (logRefreshIntervalHandle !== null) {
    window.clearInterval(logRefreshIntervalHandle);
    logRefreshIntervalHandle = null;
  }
}

/* =========================================================
   RESOCONTO MENSILE
   ========================================================= */
async function getTotalForRange(collectionName, userId, startDate, endDate) {
  const rangeQuery = query(
    collection(db, collectionName),
    where("userId", "==", userId),
    where("createdAt", ">=", Timestamp.fromDate(startDate)),
    where("createdAt", "<", Timestamp.fromDate(endDate))
  );

  const snapshot = await getDocs(rangeQuery);
  return snapshot.docs.reduce((total, documentSnapshot) => {
    return total + (Number(documentSnapshot.data().importo) || 0);
  }, 0);
}

async function generateMonthlyReport() {
  if (!currentUser) return;

  const userIdAtStart = currentUser.userId;
  monthlySummary.textContent = "Calcolo in corso...";
  setButtonLoading(monthlyBtn, true, "Calcolo...");

  try {
    const now = new Date();
    const startCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const startPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [currentTotal, previousTotal] = await Promise.all([
      getTotalForRange("exits", userIdAtStart, startCurrentMonth, startNextMonth),
      getTotalForRange("exits", userIdAtStart, startPreviousMonth, startCurrentMonth)
    ]);

    if (!currentUser || currentUser.userId !== userIdAtStart) return;

    monthlySummary.textContent = buildMonthlySummary(previousTotal, currentTotal);
    updateMonthlyChart(
      [
        startPreviousMonth.toLocaleString("it-IT", { month: "short", year: "numeric" }),
        startCurrentMonth.toLocaleString("it-IT", { month: "short", year: "numeric" })
      ],
      [previousTotal, currentTotal]
    );
  } catch (error) {
    console.error("Errore durante la generazione del resoconto:", error);
    monthlySummary.textContent = "Non è stato possibile generare il resoconto. Verifica gli indici e le regole Firestore.";
  } finally {
    setButtonLoading(monthlyBtn, false);
  }
}

function buildMonthlySummary(previousTotal, currentTotal) {
  if (previousTotal === 0 && currentTotal === 0) {
    return "Nessuna spesa né questo mese né il precedente.";
  }

  if (previousTotal === 0) {
    return `Nessuna spesa il mese precedente. Questo mese hai speso ${formatCurrency(currentTotal)}.`;
  }

  const difference = currentTotal - previousTotal;
  const percentage = (difference / previousTotal) * 100;

  if (percentage > 0) {
    return `Hai speso il ${percentage.toFixed(1)}% in più rispetto al mese scorso ` +
      `(da ${formatCurrency(previousTotal)} a ${formatCurrency(currentTotal)}).`;
  }

  if (percentage < 0) {
    return `Hai speso il ${Math.abs(percentage).toFixed(1)}% in meno rispetto al mese scorso ` +
      `(da ${formatCurrency(previousTotal)} a ${formatCurrency(currentTotal)}).`;
  }

  return `Stesso importo del mese scorso: ${formatCurrency(currentTotal)}.`;
}

function updateMonthlyChart(labels, values) {
  if (typeof window.Chart !== "function" || !monthlyCanvas) {
    console.warn("Chart.js non è disponibile: il riepilogo testuale resta comunque utilizzabile.");
    return;
  }

  if (monthlyChart) {
    monthlyChart.destroy();
    monthlyChart = null;
  }

  monthlyChart = new window.Chart(monthlyCanvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Uscite (€)",
        data: values,
        backgroundColor: ["rgba(106, 43, 255, 0.68)", "rgba(43, 156, 255, 0.72)"],
        borderColor: ["rgba(150, 110, 255, 1)", "rgba(90, 185, 255, 1)"],
        borderWidth: 1,
        borderRadius: 7,
        maxBarThickness: 90
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => formatCurrency(context.parsed.y)
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "#b8bec5" },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#b8bec5",
            callback: (value) => formatCurrency(value)
          },
          grid: { color: "rgba(255, 255, 255, 0.08)" }
        }
      }
    }
  });
}

monthlyBtn?.addEventListener("click", generateMonthlyReport);

/* =========================================================
   AGGIORNAMENTO AUTOMATICO MENSILE
   ========================================================= */
autoToggle?.addEventListener("click", () => {
  autoReportEnabled = !autoReportEnabled;
  autoToggle.textContent = `Auto: ${autoReportEnabled ? "ON" : "OFF"}`;
  autoToggle.setAttribute("aria-pressed", String(autoReportEnabled));

  if (autoReportEnabled) {
    scheduleMonthlyAuto();
  } else {
    stopMonthlyAuto();
  }
});

function scheduleMonthlyAuto() {
  stopMonthlyAuto();
  if (!autoReportEnabled || !currentUser) return;

  const now = new Date();
  const nextRun = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 10, 0);
  const delay = Math.max(1_000, nextRun.getTime() - now.getTime());

  monthlyTimeoutHandle = window.setTimeout(async () => {
    monthlyTimeoutHandle = null;
    if (autoReportEnabled && currentUser) {
      await generateMonthlyReport();
      scheduleMonthlyAuto();
    }
  }, delay);
}

function stopMonthlyAuto() {
  if (monthlyTimeoutHandle !== null) {
    window.clearTimeout(monthlyTimeoutHandle);
    monthlyTimeoutHandle = null;
  }
}

/* =========================================================
   AVVIO
   ========================================================= */
restoreSavedSession();

window.addEventListener("beforeunload", () => {
  stopPresence();
  stopLogRefresh();
  stopMonthlyAuto();
  if (typeof usersUnsub === "function") usersUnsub();
});
