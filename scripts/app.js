// =======================================================================
// Globale Zustandsvariablen für die gesamte Anwendung
// Diese MÜSSEN hier deklariert werden (let), um Konflikte mit anderen Bluetooth-Skripten zu vermeiden
// =======================================================================
let model, webcam, resultDisplay, maxPredictions; 
let lastSentLabel = null; // Für die Micro:bit-Kommunikation (Sendefrequenz-Kontrolle)
let isBluetoothConnected = false;
const DEFAULT_MODEL_URL = "https://teachablemachine.withgoogle.com/models/7NtSo3_fL/";
let currentModelUrl = DEFAULT_MODEL_URL;
let currentFacingMode = "user"; // 'user' = Selfie-Kamera, 'environment' = Rückkamera
let isCameraSwitchInProgress = false;

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
        const hasMessage = Boolean(message);
        statusDiv.textContent = hasMessage ? message : "";
        statusDiv.classList.toggle('is-visible', hasMessage);
    }
}

function setBluetoothConnected(connected) {
    isBluetoothConnected = connected;
    const button = document.getElementById('bluetooth-button');
    if (!button) return;
    button.classList.toggle('is-connected', Boolean(connected));
}

function updateCameraToggleButton() {
    const button = document.getElementById('camera-toggle');
    if (!button) return;
    const isFrontCamera = currentFacingMode !== 'environment';
    const label = isFrontCamera ? "Auf Rückkamera wechseln" : "Auf Selfiekamera wechseln";
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    button.classList.toggle('is-back-camera', !isFrontCamera);
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
    currentFacingMode = "user";
    updateCameraToggleButton();

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
    
    // Richte die Webcam mit der aktuellen Kamera-Vorgabe ein
    try {
        await setupWebcam();
    } catch (error) {
        console.error("Fehler beim Zugriff auf die Kamera.", error);
        alert("Kamera konnte nicht gestartet werden. Bitte erlaube den Kamerazugriff im Browser.");
        return;
    }

    resultDisplay = document.getElementById("prediction-display");
    if (resultDisplay) {
        resultDisplay.classList.remove('hidden');
        resultDisplay.textContent = "…";
    }
    
    // Startet die Klassifizierungsschleife
    window.requestAnimationFrame(loop); 
}

async function setupWebcam() {
    const useFrontCamera = currentFacingMode !== 'environment';
    const flip = useFrontCamera; // Spiegelung nur für die Selfie-Kamera aktiv

    if (webcam) {
        webcam.stop();
    }

    const nextWebcam = new tmImage.Webcam(320, 320, flip);
    try {
        await nextWebcam.setup({ facingMode: currentFacingMode });
        await nextWebcam.play();
    } catch (error) {
        nextWebcam.stop();
        throw error;
    }

    const webcamContainer = document.getElementById("webcam-container");
    if (webcamContainer) {
        webcamContainer.innerHTML = '';
        webcamContainer.appendChild(nextWebcam.canvas);
    }

    webcam = nextWebcam;
}

async function toggleCamera() {
    if (isCameraSwitchInProgress || appState !== APP_STATES.MAIN) {
        return;
    }

    const previousMode = currentFacingMode;
    currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
    updateCameraToggleButton();

    isCameraSwitchInProgress = true;
    try {
        await setupWebcam();
    } catch (error) {
        console.error("Kamerawechsel fehlgeschlagen.", error);
        alert("Kamerawechsel nicht möglich. Bitte erlaube den Zugriff auf die ausgewählte Kamera.");
        currentFacingMode = previousMode;
        updateCameraToggleButton();
        // Versuch, zur vorherigen Kamera zurückzukehren.
        try {
            await setupWebcam();
        } catch (retryError) {
            console.error("Rückwechsel zur vorherigen Kamera fehlgeschlagen.", retryError);
        }
    } finally {
        isCameraSwitchInProgress = false;
    }
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

updateCameraToggleButton();
