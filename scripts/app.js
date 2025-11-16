// =======================================================================
// Globale Zustandsvariablen für die gesamte Anwendung
// Diese MÜSSEN hier deklariert werden (let), um Konflikte mit anderen Bluetooth-Skripten zu vermeiden
// =======================================================================
let model, webcam, resultDisplay, maxPredictions; 
let lastSentLabel = null; // Für die Micro:bit-Kommunikation (Sendefrequenz-Kontrolle)
let isBluetoothConnected = false;

const MODEL_TYPES = {
    IMAGE: "image",
    AUDIO: "audio"
};

const DEFAULT_MODEL_URLS = {
    [MODEL_TYPES.IMAGE]: "https://teachablemachine.withgoogle.com/models/7NtSo3_fL/",
    [MODEL_TYPES.AUDIO]: "https://teachablemachine.withgoogle.com/models/WiTNHg8HJ/"
};

let modelUrlByType = { ...DEFAULT_MODEL_URLS };
let currentModelType = null;
let currentModelUrl = DEFAULT_MODEL_URLS[MODEL_TYPES.IMAGE];
let audioRecognizer = null;
let audioLabels = [];
let audioWave = null;
const AUDIO_WAVE_SILENCE_THRESHOLD = 0.15;
const AUDIO_WAVE_IDLE_AMPLITUDE = 0.4;
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
            openModelTypeDialog();
        }
    }
}

function openModelTypeDialog() {
    appState = APP_STATES.DIALOG;
    const typeDialog = document.getElementById('model-type-dialog');
    const urlDialog = document.getElementById('model-url-dialog');
    if (urlDialog) {
        urlDialog.classList.add('hidden');
    }
    if (typeDialog) {
        typeDialog.classList.remove('hidden');
    }
}

function cancelModelTypeDialog() {
    appState = APP_STATES.LANDING;
    const typeDialog = document.getElementById('model-type-dialog');
    if (typeDialog) {
        typeDialog.classList.add('hidden');
    }
    currentModelType = null;
}

function chooseModelType(type) {
    const availableTypes = Object.values(MODEL_TYPES);
    if (!availableTypes.includes(type)) {
        console.warn(`Unbekannter Modelltyp: ${type}`);
        return;
    }
    currentModelType = type;
    currentModelUrl = modelUrlByType[currentModelType] || '';
    const typeDialog = document.getElementById('model-type-dialog');
    if (typeDialog) {
        typeDialog.classList.add('hidden');
    }
    openModelUrlDialog();
}

function openModelUrlDialog() {
    if (!currentModelType) {
        openModelTypeDialog();
        return;
    }

    appState = APP_STATES.DIALOG;
    const dialog = document.getElementById('model-url-dialog');
    const input = document.getElementById('dialog-url-input');
    const error = document.getElementById('dialog-error');
    const presetValue = modelUrlByType[currentModelType] || '';

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
    const dialog = document.getElementById('model-url-dialog');
    if (dialog) {
        dialog.classList.add('hidden');
    }
    const typeDialog = document.getElementById('model-type-dialog');
    if (typeDialog) {
        typeDialog.classList.add('hidden');
    }
    currentModelType = null;
}

function confirmModelUrl() {
    const dialogInput = document.getElementById('dialog-url-input');
    const dialogError = document.getElementById('dialog-error');
    const urlValue = dialogInput.value.trim();

    if (!currentModelType) {
        dialogError.textContent = "Bitte wähle zuerst, ob du ein Bild- oder Audiomodell verwenden möchtest.";
        dialogError.classList.remove('hidden');
        openModelTypeDialog();
        return;
    }

    if (!urlValue || !urlValue.startsWith("http")) {
        dialogError.textContent = "Bitte gib einen gültigen Link ein, der mit 'http' beginnt.";
        dialogError.classList.remove('hidden');
        dialogInput.focus();
        return;
    }

    dialogError.classList.add('hidden');
    const dialog = document.getElementById('model-url-dialog');
    if (dialog) {
        dialog.classList.add('hidden');
    }
    const typeDialog = document.getElementById('model-type-dialog');
    if (typeDialog) {
        typeDialog.classList.add('hidden');
    }

    modelUrlByType[currentModelType] = urlValue;
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

function selectArduino() {
    closeBluetoothPopover();
    if (typeof connectArduino === 'function') {
        connectArduino();
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

function updateUiForModelType() {
    const usesCamera = !currentModelType || currentModelType === MODEL_TYPES.IMAGE;
    const webcamContainer = document.getElementById('webcam-container');
    const audioPlaceholder = document.getElementById('audio-placeholder');
    const cameraToggle = document.getElementById('camera-toggle');

    if (webcamContainer) {
        webcamContainer.classList.toggle('hidden', !usesCamera);
    }
    if (audioPlaceholder) {
        audioPlaceholder.classList.toggle('hidden', usesCamera);
        if (!usesCamera && !audioWave) {
            initAudioWave();
            updateAudioWave(0);
        }
    }
    if (cameraToggle) {
        cameraToggle.classList.toggle('hidden', !usesCamera);
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

    updateUiForModelType();
    console.log('🔄 Wechsel zur Hauptanwendung: KI und Bluetooth bereit.');
}


// =======================================================================
// LOGIK FÜR KI-MODELL UND WEBCAM-START
// =======================================================================

// Wird nach bestätigter Modell-URL (oder bei einem Neustart) aufgerufen
async function startClassification() {
    if (!currentModelType) {
        updateStatus("Bitte wähle zuerst einen Modelltyp.");
        return;
    }

    const userURL = currentModelUrl;
    
    if (!userURL || !userURL.startsWith("http")) {
        updateStatus("Fehler: Bitte gib einen gültigen Link ein, der mit 'http' beginnt.");
        return;
    }

    updateStatus("");

    stopImageClassifier();
    await stopAudioClassifier();
    currentFacingMode = "user";
    updateCameraToggleButton();
    updateUiForModelType();

    resultDisplay = document.getElementById("prediction-display");
    if (resultDisplay) {
        resultDisplay.textContent = "…";
        resultDisplay.classList.remove('hidden');
    }

    model = null;
    maxPredictions = 0;
    lastSentLabel = null;

    let startedSuccessfully = false;
    if (currentModelType === MODEL_TYPES.IMAGE) {
        startedSuccessfully = await initImageModel(userURL);
    } else if (currentModelType === MODEL_TYPES.AUDIO) {
        startedSuccessfully = await startAudioClassification(userURL);
    }

    if (!startedSuccessfully) {
        if (resultDisplay) {
            resultDisplay.textContent = "—";
        }
        updateStatus("Ladefehler!");
    }
}

function stopImageClassifier() {
    if (webcam) {
        webcam.stop();
        const container = document.getElementById("webcam-container");
        if (container) {
            container.innerHTML = '';
        }
        webcam = null;
    }
}

async function stopAudioClassifier() {
    if (audioRecognizer && typeof audioRecognizer.stopListening === 'function') {
        try {
            await audioRecognizer.stopListening();
        } catch (error) {
            console.warn("Audio Listener konnte nicht beendet werden.", error);
        }
    }
    audioRecognizer = null;
    audioLabels = [];
    updateAudioWave(0);
    updateUiForModelType();
}

// Lädt das Modell und richtet die Webcam ein
async function initImageModel(modelBaseURL) {
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
        return false;
    }
    
    // Richte die Webcam mit der aktuellen Kamera-Vorgabe ein
    try {
        await setupWebcam();
    } catch (error) {
        console.error("Fehler beim Zugriff auf die Kamera.", error);
        alert("Kamera konnte nicht gestartet werden. Bitte erlaube den Kamerazugriff im Browser.");
        return false;
    }

    resultDisplay = document.getElementById("prediction-display");
    if (resultDisplay) {
        resultDisplay.classList.remove('hidden');
        resultDisplay.textContent = "…";
    }
    
    // Startet die Klassifizierungsschleife
    window.requestAnimationFrame(loop); 
    return true;
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
    if (currentModelType !== MODEL_TYPES.IMAGE) {
        return;
    }
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
    if (webcam && model && currentModelType === MODEL_TYPES.IMAGE) {
        webcam.update(); 
        await predict(); 
    }
    window.requestAnimationFrame(loop); 
}

async function startAudioClassification(modelBaseURL) {
    try {
        audioRecognizer = await createAudioRecognizer(modelBaseURL);
    } catch (error) {
        console.error("Fehler beim Laden des Audiomodells.", error);
        alert("Audio-Modell konnte nicht geladen werden. Prüfe den Link und die Browser-Konsole.");
        return false;
    }

    audioLabels = audioRecognizer.wordLabels() || [];
    updateUiForModelType();
    updateAudioWave(0);

    const listenConfig = {
        includeSpectrogram: true,
        probabilityThreshold: 0.75,
        invokeCallbackOnNoiseAndUnknown: true,
        overlapFactor: 0.5
    };

    const handleResult = (result) => {
        if (!result) {
            return;
        }
        const scores = result.scores || [];

        let highestProbability = -1;
        let currentLabel = null;
        for (let i = 0; i < scores.length; i++) {
            const score = scores[i];
            if (score > highestProbability) {
                highestProbability = score;
                currentLabel = audioLabels[i] || null;
            }
        }

        updateAudioWave(highestProbability > 0 ? highestProbability : 0);

        if (resultDisplay) {
            resultDisplay.textContent = currentLabel || "—";
        }
        broadcastLabel(currentLabel);
    };

    try {
        const listenPromise = audioRecognizer.listen(handleResult, listenConfig);
        if (listenPromise && typeof listenPromise.catch === 'function') {
            listenPromise.catch(async (error) => {
                handleAudioListenError(error);
                await stopAudioClassifier();
            });
        }
    } catch (error) {
        handleAudioListenError(error);
        await stopAudioClassifier();
        return false;
    }

    return true;
}

async function createAudioRecognizer(modelBaseURL) {
    if (typeof speechCommands === "undefined") {
        throw new Error("speechCommands Bibliothek wurde nicht geladen.");
    }

    const checkpointURL = modelBaseURL + "model.json";
    const metadataURL = modelBaseURL + "metadata.json";

    const recognizer = speechCommands.create(
        "BROWSER_FFT",
        undefined,
        checkpointURL,
        metadataURL
    );

    await recognizer.ensureModelLoaded();
    return recognizer;
}

function initAudioWave() {
    if (typeof SiriWave === "undefined") {
        console.warn("SiriWave Bibliothek wurde nicht geladen.");
        audioWave = null;
        return;
    }

    const container = document.getElementById('audio-wave-container');
    if (!container) {
        audioWave = null;
        return;
    }

    if (audioWave && typeof audioWave.dispose === 'function') {
        audioWave.dispose();
    }

    try {
        audioWave = new SiriWave({
            container,
            width: container.clientWidth || 320,
            height: 120,
            style: 'ios9',
            autostart: true,
            speed: 0.12,
            amplitude: 0
        });
    } catch (error) {
        console.error("SiriWave konnte nicht initialisiert werden.", error);
        audioWave = null;
    }
}

function updateAudioWave(level = 0) {
    if (!audioWave || typeof audioWave.setAmplitude !== 'function') {
        return;
    }
    const clamped = Math.min(Math.max(level, 0), 1);
    let amplitude = AUDIO_WAVE_IDLE_AMPLITUDE;
    if (clamped >= AUDIO_WAVE_SILENCE_THRESHOLD) {
        const range = 1 - AUDIO_WAVE_SILENCE_THRESHOLD;
        const normalized = range > 0 ? (clamped - AUDIO_WAVE_SILENCE_THRESHOLD) / range : 0;
        amplitude = AUDIO_WAVE_IDLE_AMPLITUDE + normalized * 3.2;
    }
    audioWave.setAmplitude(amplitude);
}

function handleAudioListenError(error) {
    console.error("Fehler beim Starten des Mikrofons.", error);
    updateStatus("Mikrofonfehler – bitte Zugriff erlauben?");
    alert("Mikrofon konnte nicht gestartet werden. Bitte erlaube den Zugriff in deinem Browser.");
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
    
    broadcastLabel(currentLabel);
}

function broadcastLabel(currentLabel) {
    if (currentLabel === null || currentLabel === lastSentLabel) {
        return;
    }

    if (typeof sendToMicrobit === 'function') {
        sendToMicrobit(currentLabel);
        console.log(`Neues Label an Micro:bit gesendet: ${currentLabel}`);
    }
    if (typeof sendToCalliope === 'function') {
        sendToCalliope(currentLabel);
        console.log(`Neues Label an Calliope mini gesendet: ${currentLabel}`);
    }
    if (typeof sendToArduino === 'function') {
        sendToArduino(currentLabel);
        console.log(`Neues Label an Arduino UNO R4 gesendet: ${currentLabel}`);
    }
    lastSentLabel = currentLabel;
}

initAudioWave();
updateAudioWave(0);
updateCameraToggleButton();
