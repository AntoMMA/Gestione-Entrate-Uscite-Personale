/* =========================
   REGOLE GENERALI
========================= */
* { box-sizing: border-box; }
body {
    margin: 0;
    background: #0d0d0d;
    color: white;
    font-family: Arial, sans-serif;
}

/* Nasconde la app finché non si fa login */
.hidden {
    display: none !important;
}


/* =========================
   LOGIN A PAGINA INTERA
========================= */
#login-screen {
    position: fixed;
    inset: 0;
    background: #0b0b0b;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
}

#login-container {
    width: 330px;
    padding: 25px;
    background: #0f0f0f;
    border-radius: 14px;
    text-align: center;
    position: relative;
}

/* =========================
   CONTORNO RGB STILE CORSAIR
   (EFFETTO BREATHING / COLOR SHIFT)
========================= */
.rgb-border {
    border: 4px solid;
    border-radius: 14px;
    animation: rgbGlow 4s infinite linear;
}

@keyframes rgbGlow {
    0%   { border-color: rgb(255, 0, 0); }
    20%  { border-color: rgb(255, 128, 0); }
    40%  { border-color: rgb(255, 255, 0); }
    60%  { border-color: rgb(0, 255, 0); }
    80%  { border-color: rgb(0, 128, 255); }
    100% { border-color: rgb(255, 0, 255); }
}

/* =========================
   INPUT E BUTTON LOGIN
========================= */
#login-container input,
#login-container button {
    width: 100%;
    padding: 12px;
    margin: 10px 0;
    border: none;
    border-radius: 8px;
    font-size: 16px;
}

#login-container button {
    background: #1e90ff;
    color: white;
    cursor: pointer;
}


/* =========================
        APP LAYOUT
========================= */
#app {
    display: flex;
    min-height: 100vh;
}

#sidebar {
    width: 25%;
    background: #111;
    padding: 20px;
    border-right: 1px solid #222;
}

#main-content {
    width: 75%;
    padding: 25px;
}

.box {
    padding: 15px;
    border-radius: 10px;
    margin-bottom: 20px;
    background: #181818;
}

.entrata { border-left: 6px solid #4CAF50; }
.uscita  { border-left: 6px solid #E53935; }

#monthlyChart {
    margin-top: 25px;
    background: #111;
    border-radius: 10px;
    padding: 10px;
}
