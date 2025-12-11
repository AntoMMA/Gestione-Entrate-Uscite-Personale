// script.js (module completo)

/* ============================
   IMPORT FIREBASE (modular)
   ============================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, updateDoc, getDoc, getDocs,
  query, where, orderBy, serverTimestamp, onSnapshot, Timestamp
} from "https://www.gstatic.com/firebasejs/10.5.2/firebase-firestore.js";

// Rimosso: import Firebase Storage
// Rimosso: getStorage, ref as storageRef, uploadBytes, getDownloadURL

/* ============================
   FIREBASE CONFIG — usa la tua config (già presente)
   ============================ */
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
// Rimosso: const storage = getStorage(app);


/* ============================
   CLOUDIDARY CONFIG
   *** VALORI INSERITI DALL'UTENTE ***
   ============================ */
const CLOUDINARY_CLOUD_NAME = "dzgynfn7t"; 
const CLOUDINARY_UPLOAD_PRESET = "gestionale_personale"; 
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;


/* ============================
   DOM REFERENCES
   ============================ */
const loginScreen = document.getElementById('login-screen');
const loginBtn = document.getElementById('login-btn');
const nomeInput = document.getElementById('nome');
const cognomeInput = document.getElementById('cognome');
const telefonoInput = document.getElementById('telefono');

const appDiv = document.getElementById('app');
const logoutBtn = document.getElementById('logout-btn');

const usersList = document.getElementById('users-list');
const avatarPreviewLogin = document.getElementById('avatar-preview-login');

const profileName = document.getElementById('profile-name');
const profilePhone = document.getElementById('profile-phone');
const avatarDisplay = document.getElementById('avatar-display');
const profileFileInput = document.getElementById('profile-file');

const entrataImporto = document.getElementById('entrata-importo');
const entrataMotivo = document.getElementById('entrata-motivo');
const uscitaImporto = document.getElementById('uscita-importo');
const uscitaMotivo = document.getElementById('uscita-motivo');

const addEntrataBtn = document.getElementById('add-entrata');
const addUscitaBtn = document.getElementById('add-uscita');

const logEntrate = document.getElementById('log-entrate');
const logUscite = document.getElementById('log-uscite');

const saldoTotale = document.getElementById('saldo-totale');

const monthlyBtn = document.getElementById('monthly-report-btn');
const autoToggle = document.getElementById('auto-report-toggle');
const monthlySummary = document.getElementById('monthly-summary');
const monthlyCanvas = document.getElementById('monthlyChart').getContext('2d');

/* ============================
   STATE
   ============================ */
let currentUser = null; // { nome, cognome, telefono, userId }
let usersUnsub = null;
let monthlyChart = null;
let autoReportEnabled = true;
let presenceIntervalHandle = null;

/* ============================
   UTIL: crea userId semplice ma consistente
   ============================ */
function makeUserId(nome, cognome, telefono){
  const cleanTel = (telefono || '').toString().replace(/\D/g,'');
  return `${nome.trim().toLowerCase()}_${cognome.trim().toLowerCase()}_${cleanTel}`.replace(/\s+/g,'_');
}

/* ============================
   PRESENCE: aggiorna lastSeen su users/{userId} (a 2s come richiesto)
   ============================ */
async function setPresencePing(userId){
  if(!userId) return;
  // usa setDoc per creare/aggiornare il documento
  const userDocRef = doc(db, 'users', userId);
  try {
    await setDoc(userDocRef, {
      lastSeen: serverTimestamp(),
    }, { merge: true });
  } catch(err){
    console.error('Errore setPresencePing', err);
  }
}

/* avvia ping ogni 2 secondi (mentre app aperta) */
function startPresence(userId){
  // prima call immediata
  setPresencePing(userId);
  if(presenceIntervalHandle) clearInterval(presenceIntervalHandle);
  // IMPOSTATO A 2 SECONDI COME RICHIESTO
  presenceIntervalHandle = setInterval(()=> setPresencePing(userId), 2_000); 
}

/* ferma ping */
function stopPresence(){
  if(presenceIntervalHandle) clearInterval(presenceIntervalHandle);
  presenceIntervalHandle = null;
}

/* ============================
   LOGIN
   ============================ */
loginBtn.addEventListener('click', async () => {
  const nome = nomeInput.value.trim();
  const cognome = cognomeInput.value.trim();
  const telefono = telefonoInput.value.trim();
  if(!nome || !cognome || !telefono){ alert('Compila tutti i campi'); return; }

  const userId = makeUserId(nome,cognome,telefono);
  currentUser = { nome, cognome, telefono, userId };

  // salva locale (usando una chiave generica)
  localStorage.setItem('gd_user', JSON.stringify(currentUser));

  // crea/aggiorna doc utente in firestore con campi base
  const uRef = doc(db, 'users', userId);
  await setDoc(uRef, {
    nome, cognome, telefono,
    userId,
    lastSeen: serverTimestamp(),
  }, { merge: true });

  openApp();
});

/* auto-login se presente */
const saved = localStorage.getItem('gd_user');
if(saved){
  try {
    currentUser = JSON.parse(saved);
    // refresh presence doc to ensure exists
    (async ()=>{
      const uRef = doc(db, 'users', currentUser.userId);
      await setDoc(uRef, {
        nome: currentUser.nome,
        cognome: currentUser.cognome,
        telefono: currentUser.telefono,
        userId: currentUser.userId,
        lastSeen: serverTimestamp()
      }, { merge: true });
      openApp();
    })();
  } catch(e){}
}

/* mostra applicazione */
async function openApp(){
  // hide login
  loginScreen.classList.add('hidden');
  loginScreen.setAttribute('aria-hidden','true');

  // show app
  appDiv.classList.remove('hidden');
  appDiv.setAttribute('aria-hidden','false');

  // set UI profile
  profileName.textContent = `${currentUser.nome} ${currentUser.cognome}`;
  profilePhone.textContent = currentUser.telefono;

  // start presence ping (ora 2 secondi)
  startPresence(currentUser.userId);

  // subscribe to users list (realtime)
  subscribeUsersList();

  // load profile image if present (per persistenza)
  loadUserProfilePhoto(currentUser.userId);

  // load logs and totals
  loadLogs();

  // generate first monthly report
  await generateMonthlyReport();

  // schedule next automatic monthly-run (and keep monthly auto on/off via toggle)
  scheduleMonthlyAuto();
}

/* ============================
   LOGOUT
   ============================ */
logoutBtn.addEventListener('click', async () => {
  // optional: set lastSeen far in past? We'll just stop ping and clear local
  stopPresence();

  // remove local
  localStorage.removeItem('gd_user');
  currentUser = null;

  // unsubscribe users list
  if(usersUnsub) usersUnsub();

  // hide app show login
  appDiv.classList.add('hidden');
  appDiv.setAttribute('aria-hidden','true');
  loginScreen.classList.remove('hidden');
  loginScreen.setAttribute('aria-hidden','false');

  // clear UI small bits
  usersList.innerHTML = '';
  logEntrate.innerHTML = '';
  logUscite.innerHTML = '';
  saldoTotale.textContent = '';
  monthlySummary.textContent = '';
  if(monthlyChart) { monthlyChart.destroy(); monthlyChart = null; }
});

/* ============================
   SUBSCRIBE USERS LIST (realtime)
   ============================ */
function subscribeUsersList(){
  // unsub if exists
  if(usersUnsub) usersUnsub();

  const usersColl = collection(db, 'users');
  // listen to all users ordered by name (client-side we'll compute online)
  // onSnapshot garantisce l'aggiornamento in tempo reale
  usersUnsub = onSnapshot(usersColl, snapshot => {
    usersList.innerHTML = '';
    snapshot.forEach(docSnap => {
      const d = docSnap.data();
      const li = document.createElement('li');

      // avatar
      const aDiv = document.createElement('div');
      aDiv.className = 'user-avatar';
      if(d.photoURL){
        const img = document.createElement('img');
        img.src = d.photoURL;
        img.style.width='100%';
        img.style.height='100%';
        img.style.objectFit = 'cover';
        aDiv.appendChild(img);
      } else {
        // initials
        const initials = document.createElement('div');
        initials.style.width='100%'; initials.style.height='100%';
        initials.style.display='flex'; initials.style.alignItems='center'; initials.style.justifyContent='center';
        initials.style.color='#fff'; initials.style.fontWeight='700';
        const name = `${d.nome || ''}`.trim();
        initials.textContent = name ? name.charAt(0).toUpperCase() : '?';
        aDiv.appendChild(initials);
      }

      // meta
      const meta = document.createElement('div');
      meta.className = 'user-meta';
      const nameEl = document.createElement('div');
      nameEl.className = 'user-name';
      nameEl.textContent = `${d.nome || '—'} ${d.cognome || ''}`;
      const statusEl = document.createElement('div');
      statusEl.className = 'user-status';

      // online: if lastSeen within 60 seconds
      let statusDot = document.createElement('span');
      statusDot.className = 'status-dot ' + (isOnline(d.lastSeen) ? 'status-online' : 'status-offline');

      // text
      const statusText = document.createElement('span');
      statusText.textContent = isOnline(d.lastSeen) ? 'online' : 'offline';

      statusEl.appendChild(statusDot);
      statusEl.appendChild(statusText);

      meta.appendChild(nameEl);
      meta.appendChild(statusEl);

      // allow click to view profile: if clicked show profile details in main profile (but only owner can change photo)
      li.appendChild(aDiv);
      li.appendChild(meta);
      li.style.cursor = 'pointer';
      li.addEventListener('click', () => {
        // show clicked user's profile in the profile area (read-only except if it's currentUser)
        showProfileInMain(d);
      });

      usersList.appendChild(li);
    });
  }, err => {
    console.error('users onSnapshot error', err);
  });
}

/* helper online detection */
function isOnline(ts){
  if(!ts) return false;
  // ts may be Firestore Timestamp or JS Date — normalize
  let last;
  if(ts.toDate) last = ts.toDate();
  else last = new Date(ts);
  const diff = Date.now() - last.getTime();
  return diff <= 60_000; // online if within 60s (Nonostante l'aggiornamento ogni 2s, una finestra di 60s è un buffer sicuro)
}

/* show profile in main-profile area */
function showProfileInMain(userDocData){
  // update profile area
  profileName.textContent = `${userDocData.nome || ''} ${userDocData.cognome || ''}`;
  profilePhone.textContent = userDocData.telefono || '';

  // avatar
  if(userDocData.photoURL){
    avatarDisplay.innerHTML = `<img src="${userDocData.photoURL}" alt="avatar">`;
  } else {
    avatarDisplay.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:32px;">${(userDocData.nome||'')[0]||'?'}</div>`;
  }

  // Se l'utente visualizzato NON è l'utente corrente, disabilita l'input file
  const isCurrentUserProfile = currentUser && userDocData.userId === currentUser.userId;
  const uploadButtonLabel = profileFileInput.closest('label');

  if(!isCurrentUserProfile){
    profileFileInput.disabled = true;
    if(uploadButtonLabel) uploadButtonLabel.style.display = 'none'; // Nascondi il pulsante
  } else {
    profileFileInput.disabled = false;
    if(uploadButtonLabel) uploadButtonLabel.style.display = 'inline-block'; // Mostra il pulsante
  }
}

/* ============================
   LOAD USER PROFILE PHOTO (for current user)
   L'immagine viene caricata da Firestore ad ogni login, garantendo la persistenza.
   ============================ */
async function loadUserProfilePhoto(userId){
  try {
    const uRef = doc(db, 'users', userId);
    const uSnap = await getDoc(uRef);
    if(uSnap.exists()){
      const d = uSnap.data();
      if(d.photoURL){
        // Cloudinary URL (o il vecchio Firebase Storage URL)
        avatarDisplay.innerHTML = `<img src="${d.photoURL}" alt="avatar">`; 
        avatarPreviewLogin.style.backgroundImage = `url(${d.photoURL})`;
        avatarPreviewLogin.style.backgroundSize = 'cover';
      } else {
        avatarDisplay.innerHTML = '';
        avatarPreviewLogin.style.backgroundImage = 'none';
      }
    }
  } catch(err){
    console.error('loadUserProfilePhoto', err);
  }
}

/* ============================
   UPLOAD PROFILE IMAGE (USANDO CLOUDINARY)
   ============================ */
profileFileInput?.addEventListener('change', async (ev) => {
  if(!currentUser || profileFileInput.disabled) return alert('Operazione non permessa.');
  const f = ev.target.files[0];
  if(!f) return;
  
  if(f.size > 4 * 1024 * 1024) { alert('File troppo grande (max 4MB)'); return; }

  // Non serve controllare i placeholder, sono stati inseriti i valori
  
  try {
    // 1. Prepara i dati per Cloudinary
    const formData = new FormData();
    formData.append('file', f);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    // Specifica la cartella e il Public ID (usiamo l'userId per sovrascrivere l'immagine precedente)
    formData.append('folder', 'gestionale_users');
    formData.append('public_id', currentUser.userId); 

    // 2. Upload su Cloudinary
    const response = await fetch(CLOUDINARY_URL, {
      method: 'POST',
      body: formData
    });
    
    if(!response.ok){
      const errData = await response.json();
      console.error('Cloudinary Upload Error:', errData);
      throw new Error(`Upload fallito: ${errData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const url = data.secure_url;

    // 3. Update firestore user doc
    // Questo salva l'URL in modo permanente sul profilo Firestore
    const uRef = doc(db, 'users', currentUser.userId);
    await updateDoc(uRef, { photoURL: url, lastSeen: serverTimestamp() });

    // 4. Update UI
    avatarDisplay.innerHTML = `<img src="${url}" alt="avatar">`;
    avatarPreviewLogin.style.backgroundImage = `url(${url})`;
    avatarPreviewLogin.style.backgroundSize = 'cover';
    alert('Immagine profilo aggiornata!');
  } catch(err){
    console.error('upload error', err);
    alert(`Errore durante l'upload. Controlla la console. Dettaglio: ${err.message}`);
  } finally {
    // Reset input file per permettere un nuovo upload dello stesso file
    ev.target.value = '';
  }
});

/* ============================
   ENTRATE / USCITE CRUD (basic)
   ============================ */
addEntrataBtn.addEventListener('click', async () => {
  if(!currentUser) return alert('Effettua login');
  const importo = parseFloat(entrataImporto.value || 0);
  const motivo = entrataMotivo.value || 'Entrata';
  if(!importo || importo <= 0) return alert('Inserisci importo valido');
  await addSimpleDoc('entries', {
    userId: currentUser.userId,
    importo,
    motivo,
    createdAt: serverTimestamp()
  });
  entrataImporto.value=''; entrataMotivo.value='';
  await loadLogs();
});

addUscitaBtn.addEventListener('click', async () => {
  if(!currentUser) return alert('Effettua login');
  const importo = parseFloat(uscitaImporto.value || 0);
  const motivo = uscitaMotivo.value || 'Uscita';
  if(!importo || importo <= 0) return alert('Inserisci importo valido');
  await addSimpleDoc('exits', {
    userId: currentUser.userId,
    importo,
    motivo,
    createdAt: serverTimestamp()
  });
  uscitaImporto.value=''; uscitaMotivo.value='';
  await loadLogs();
});

/* helper add doc simple */
async function addSimpleDoc(collectionName, data){
  try {
    // create a doc id based on timestamp
    const id = `${collectionName}_${Date.now()}_${Math.floor(Math.random()*10000)}`;
    const dRef = doc(db, collectionName, id);
    await setDoc(dRef, data);
  } catch(err){
    console.error('addSimpleDoc error', err);
    throw err;
  }
}

/* ============================
   LOAD LOGS + TOTALS (Richiede Indici Firestore)
   ============================ */
async function loadLogs(){
  if(!currentUser) return;

  logEntrate.innerHTML = '';
  logUscite.innerHTML = '';

  // entries
  try {
    // Query per entrate: richiede indice composito (userId ASC, createdAt DESC)
    const qE = query(collection(db, 'entries'), where('userId','==',currentUser.userId), orderBy('createdAt','desc'));
    const snapE = await getDocs(qE);
    let totE = 0;
    snapE.forEach(s => {
      const d = s.data();
      totE += Number(d.importo || 0);
      const li = document.createElement('li');
      li.textContent = `€${Number(d.importo).toFixed(2)} — ${d.motivo || ''}`;
      logEntrate.appendChild(li);
    });

    // Query per uscite: richiede indice composito (userId ASC, createdAt DESC)
    const qU = query(collection(db, 'exits'), where('userId','==',currentUser.userId), orderBy('createdAt','desc'));
    const snapU = await getDocs(qU);
    let totU = 0;
    snapU.forEach(s => {
      const d = s.data();
      totU += Number(d.importo || 0);
      const li = document.createElement('li');
      li.textContent = `€${Number(d.importo).toFixed(2)} — ${d.motivo || ''}`;
      logUscite.appendChild(li);
    });

    saldoTotale.textContent = `Entrate: €${totE.toFixed(2)} — Uscite: €${totU.toFixed(2)} — Saldo: €${(totE - totU).toFixed(2)}`;
  } catch(err){
    console.error('loadLogs', err);
    if(err.code === 'failed-precondition' && err.message.includes('requires an index')){
        saldoTotale.textContent = 'ERRORE: La query richiede un indice in Firebase. Controlla la console per il link.';
    }
  }
}

/* ============================
   MONTHLY REPORT: total for collection between dates
   ============================ */
async function getTotalForRange(collectionName, userId, startDate, endDate){
  const q = query(
    collection(db, collectionName),
    where('userId','==', userId),
    where('createdAt','>=', Timestamp.fromDate(startDate)),
    where('createdAt','<', Timestamp.fromDate(endDate))
  );
  // Anche qui, potrebbe servire un indice composito: userId (ASC), createdAt (ASC)
  const snap = await getDocs(q);
  let total = 0;
  snap.forEach(d => total += Number(d.data().importo || 0));
  return total;
}

/* generate monthly report and update chart */
async function generateMonthlyReport(){
  if(!currentUser) return;
  monthlySummary.textContent = 'Calcolo in corso...';

  const now = new Date();
  const startThis = new Date(now.getFullYear(), now.getMonth(), 1, 0,0,0,0);
  const startNext = new Date(now.getFullYear(), now.getMonth()+1, 1, 0,0,0,0);
  const startPrev = new Date(now.getFullYear(), now.getMonth()-1, 1, 0,0,0,0);

  const thisTotal = await getTotalForRange('exits', currentUser.userId, startThis, startNext);
  const prevTotal = await getTotalForRange('exits', currentUser.userId, startPrev, startThis);

  let pctText = '';
  if(prevTotal === 0 && thisTotal === 0){
    pctText = `Nessuna spesa né questo mese né il precedente.`;
  } else if(prevTotal === 0){
    pctText = `Nessuna spesa il mese precedente. Questo mese hai speso €${thisTotal.toFixed(2)}.`;
  } else {
    const diff = thisTotal - prevTotal;
    const pct = (diff / prevTotal) * 100;
    if(pct > 0) pctText = `Hai speso il ${pct.toFixed(1)}% in più rispetto al mese scorso (da €${prevTotal.toFixed(2)} a €${thisTotal.toFixed(2)}).`;
    else if(pct < 0) pctText = `Hai speso il ${Math.abs(pct).toFixed(1)}% in meno rispetto al mese scorso (da €${prevTotal.toFixed(2)} a €${thisTotal.toFixed(2)}).`;
    else pctText = `Stesso importo del mese scorso: €${thisTotal.toFixed(2)}.`;
  }

  monthlySummary.textContent = pctText;

  // Chart update
  const labels = [
    startPrev.toLocaleString('it-IT', { month:'short', year:'numeric' }),
    startThis.toLocaleString('it-IT', { month:'short', year:'numeric' })
  ];
  const data = [prevTotal, thisTotal];

  if(monthlyChart) monthlyChart.destroy();
  // eslint-disable-next-line no-undef
  monthlyChart = new Chart(monthlyCanvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Uscite €',
        data,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } }
    }
  });
}

/* manual trigger */
monthlyBtn.addEventListener('click', generateMonthlyReport);

/* toggle auto report */
autoToggle.addEventListener('click', () => {
  autoReportEnabled = !autoReportEnabled;
  autoToggle.textContent = `Auto: ${autoReportEnabled ? 'ON' : 'OFF'}`;
});

/* schedule automatic monthly run: compute time until next 1st at 00:00:10 then setTimeout; re-schedule each time */
function scheduleMonthlyAuto(){
  if(!autoReportEnabled || !currentUser) return;
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth()+1, 1, 0,0,10,0);
  const ms = next.getTime() - now.getTime();
  setTimeout(async () => {
    if(autoReportEnabled && currentUser) await generateMonthlyReport();
    // reschedule recursively
    scheduleMonthlyAuto();
  }, ms);
}

/* ============================
   UTILITY: show profile area for current user on init
   ============================ */
function showProfileInMainInitial(){
  if(!currentUser) return;
  // fetch user doc
  (async ()=>{
    try {
      const uRef = doc(db, 'users', currentUser.userId);
      const snap = await getDoc(uRef);
      if(snap.exists()){
        // Mostra il profilo, assicurandoti che l'upload button sia visibile
        const data = snap.data();
        showProfileInMain(data);
        const uploadButtonLabel = profileFileInput.closest('label');
        if(uploadButtonLabel) uploadButtonLabel.style.display = 'inline-block';
      } else {
        // fallback UI
        profileName.textContent = `${currentUser.nome} ${currentUser.cognome}`;
        profilePhone.textContent = currentUser.telefono;
        avatarDisplay.innerHTML = '';
      }
    } catch(err){ console.error('showProfileInMainInitial', err); }
  })();
}

/* export showProfileInMain to be used by users list click (defined earlier) */
window.showProfileInMain = showProfileInMain;

/* ============================
   small: initial UI update after login to show current user's profile
   ============================ */
async function initialAfterLogin(){
  if(currentUser){
    await loadUserProfilePhoto(currentUser.userId);
    showProfileInMainInitial();
  }
}

/* slight delay once app opens to load profile */
setTimeout(()=> {
  if(currentUser) initialAfterLogin();
}, 600);

/* ============================
   Keep logs refreshed every 45s
   ============================ */
setInterval(()=> {
  if(currentUser) loadLogs();
}, 45_000);

/* ============================
   END OF FILE
   ============================ */
