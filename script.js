// =======================================================================
// Globale Zustandsvariablen für die gesamte Anwendung
// Diese MÜSSEN hier deklariert werden (let), um Konflikte mit connection.js zu vermeiden
// =======================================================================
let model, webcam, resultDisplay, maxPredictions; 
let lastSentLabel = null; // Für die Micro:bit-Kommunikation (Sendefrequenz-Kontrolle)
const DEFAULT_MODEL_URL = "https://teachablemachine.withgoogle.com/models/7NtSo3_fL/";
let currentModelUrl = DEFAULT_MODEL_URL;

const APP_STATES = {
    LANDING: 0,
    DIALOG: 1,
    MAIN: 2
};

let appState = APP_STATES.LANDING;


// =======================================================================
// LOGIK FÜR LANDING PAGE / ZUSTANDSWECHSEL
// =======================================================================

// Funktion wird beim Klick auf den Landing Page Container aufgerufen
function checkLogoClick(event) {
    if (appState === APP_STATES.LANDING) {
        const logo = document.getElementById('makerspace-logo');
        
        // Überprüft, ob das geklickte Element das Logo selbst ist
        if (event.target === logo) {
            openModelUrlDialog();
        }
    }
}

function openModelUrlDialog() {
    appState = APP_STATES.DIALOG;
    const dialog = document.getElementById('model-url-dialog');
    const input = document.getElementById('dialog-url-input');
    const error = document.getElementById('dialog-error');
    const presetValue = currentModelUrl || '';

    error.classList.add('hidden');
    dialog.classList.remove('hidden');
    input.value = presetValue;

    // Fokus nach einem Frame setzen (bessere Browser-Kompatibilität)
    setTimeout(() => {
        input.focus();
        input.select();
    }, 0);
}

function cancelModelUrlDialog() {
    appState = APP_STATES.LANDING;
    document.getElementById('model-url-dialog').classList.add('hidden');
}

function confirmModelUrl() {
    const dialogInput = document.getElementById('dialog-url-input');
    const dialogError = document.getElementById('dialog-error');
    const urlValue = dialogInput.value.trim();

    if (!urlValue || !urlValue.startsWith("http")) {
        dialogError.textContent = "Bitte gib einen gültigen Link ein, der mit 'http' beginnt.";
        dialogError.classList.remove('hidden');
        dialogInput.focus();
        return;
    }

    dialogError.classList.add('hidden');
    document.getElementById('model-url-dialog').classList.add('hidden');

    currentModelUrl = urlValue;

    transitionToMainApp();
    startClassification();
}

const dialogInputElement = document.getElementById('dialog-url-input');
if (dialogInputElement) {
    dialogInputElement.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            confirmModelUrl();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelModelUrlDialog();
        }
    });
}

function handleBluetoothClick() {
    console.log('Bluetooth-Icon wurde geklickt.');
    const popover = document.getElementById('bluetooth-popover');
    if (popover) {
        popover.classList.remove('hidden');
    }
}

function closeBluetoothPopover() {
    const popover = document.getElementById('bluetooth-popover');
    if (popover) {
        popover.classList.add('hidden');
    }
}

function handlePopoverBackdrop(event) {
    if (event.target.id === 'bluetooth-popover') {
        closeBluetoothPopover();
    }
}

function selectMicrobit() {
    closeBluetoothPopover();
    if (typeof connectMicrobit === 'function') {
        connectMicrobit();
    }
}

function selectCalliope() {
    closeBluetoothPopover();
    if (typeof connectCalliope === 'function') {
        connectCalliope();
    }
}

function updateStatus(message) {
    const statusDiv = document.getElementById("status-message");
    if (statusDiv) {
        statusDiv.textContent = message || "";
    }
}
// Führt den Übergang von der Landing Page zur Hauptanwendung durch
function transitionToMainApp() {
    // 1. App-Zustand umschalten
    appState = APP_STATES.MAIN; 

    // 2. Landing Page verstecken (fügt die CSS-Klasse 'hidden' hinzu)
    document.getElementById('landing-page').classList.add('hidden');

    // 3. Hauptanwendung anzeigen (entfernt die CSS-Klasse 'hidden')
    document.getElementById('main-app').classList.remove('hidden');

    console.log('🔄 Wechsel zur Hauptanwendung: KI und Bluetooth bereit.');
}


// =======================================================================
// LOGIK FÜR KI-MODELL UND WEBCAM-START
// =======================================================================

// Wird nach bestätigter Modell-URL (oder bei einem Neustart) aufgerufen
async function startClassification() {
    const userURL = currentModelUrl;
    
    if (!userURL || !userURL.startsWith("http")) {
        updateStatus("Fehler: Bitte gib einen gültigen Link ein, der mit 'http' beginnt.");
        return;
    }

    updateStatus("");

    // Lösche alte Webcam und Labels, falls vorhanden (wichtig bei Neustart)
    if (webcam) {
        webcam.stop();
        document.getElementById("webcam-container").innerHTML = '';
        webcam = null;
    }

    resultDisplay = document.getElementById("prediction-display");
    if (resultDisplay) {
        resultDisplay.textContent = "…";
    }

    model = null;
    maxPredictions = 0;
    lastSentLabel = null;

    await init(userURL);
    if (!model) {
        updateStatus("Ladefehler!");
        if (resultDisplay) {
            resultDisplay.textContent = "—";
        }
        return;
    }
}

// Lädt das Modell und richtet die Webcam ein
async function init(modelBaseURL) {
    const modelURL = modelBaseURL + "model.json";
    const metadataURL = modelBaseURL + "metadata.json";

    // Lade das Modell und die Metadaten
    try {
        model = await tmImage.load(modelURL, metadataURL);
        maxPredictions = model.getTotalClasses();
    } catch (error) {
        console.error("Fehler beim Laden des Modells. Ist der Link korrekt freigegeben?", error);
        alert("Fehler beim Laden des Modells. Prüfen Sie den Link und die Browser-Konsole.");
        updateStatus("Ladefehler!");
        return;
    }
    
    // Richte die Webcam ein
    const flip = true; 
    webcam = new tmImage.Webcam(320, 320, flip); 
    await webcam.setup(); // Fordert Zugriff auf die Kamera an
    await webcam.play();
    
    // Fügt die Elemente zur Seite hinzu
    const webcamContainer = document.getElementById("webcam-container");
    webcamContainer.innerHTML = '';
    webcamContainer.appendChild(webcam.canvas);

    resultDisplay = document.getElementById("prediction-display");
    if (resultDisplay) {
        resultDisplay.classList.remove('hidden');
        resultDisplay.textContent = "…";
    }
    
    // Startet die Klassifizierungsschleife
    window.requestAnimationFrame(loop); 
}


// =======================================================================
// LOGIK FÜR KLASSIFIZIERUNG UND MICRO:BIT-SENDEN
// =======================================================================

// Die Hauptschleife für die kontinuierliche Klassifizierung
async function loop() {
    if (webcam && model) {
        webcam.update(); 
        await predict(); 
    }
    window.requestAnimationFrame(loop); 
}

// Führt die Klassifizierung durch und sendet das Ergebnis an das Micro:bit
async function predict() {
    if (!model) return; 
    
    const prediction = await model.predict(webcam.canvas);

    // Finde das wahrscheinlichste Label
    let highestProbability = -1;
    let currentLabel = null;

    for (let i = 0; i < maxPredictions; i++) {
        const p = prediction[i];

        if (p.probability > highestProbability) {
            highestProbability = p.probability;
            currentLabel = p.className;
        }
    }
    
    if (resultDisplay) {
        resultDisplay.textContent = currentLabel || "—";
    }
    
    // Senden nur bei Label-Wechsel
    // sendToMicrobit ist in der connection.js definiert!
    // sendToCalliope ist in der calliopeConnection.js definiert!
    if (currentLabel !== lastSentLabel && currentLabel !== null) {
        // Prüfen, ob die Funktionen zum Senden existieren, bevor sie aufgerufen werden
        if (typeof sendToMicrobit === 'function') {
            sendToMicrobit(currentLabel);
            console.log(`Neues Label an Micro:bit gesendet: ${currentLabel}`);
        }
        if (typeof sendToCalliope === 'function') {
            sendToCalliope(currentLabel);
            console.log(`Neues Label an Calliope mini gesendet: ${currentLabel}`);
        }
        lastSentLabel = currentLabel;
    }
}
