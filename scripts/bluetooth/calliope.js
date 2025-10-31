let calliopeDevice;
let calliopeServer;
let calliopeUartService;
let calliopeUartCharacteristic;

// Calliope mini (Rev2) nutzt wie der micro:bit den Nordic UART Service
const CALLIOPE_UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const CALLIOPE_UART_TX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

async function connectCalliope() {
  try {
    calliopeDevice = await navigator.bluetooth.requestDevice({
      filters: [
        { namePrefix: 'Calliope mini' },
        { namePrefix: 'CALLIOPE mini' },
        { namePrefix: 'CALLIOPE MINI' }
      ],
      optionalServices: [CALLIOPE_UART_SERVICE_UUID]
    });

    calliopeServer = await calliopeDevice.gatt.connect();
    calliopeUartService = await calliopeServer.getPrimaryService(CALLIOPE_UART_SERVICE_UUID);
    calliopeUartCharacteristic = await calliopeUartService.getCharacteristic(CALLIOPE_UART_TX_CHARACTERISTIC_UUID);

    console.log('✅ Calliope mini verbunden');
    alert('Calliope mini erfolgreich verbunden!');
    if (typeof setBluetoothConnected === 'function') {
      setBluetoothConnected(true);
    }

    calliopeDevice.addEventListener('gattserverdisconnected', () => {
      console.warn('⚠️ Calliope mini Verbindung getrennt.');
      alert('Calliope mini Verbindung getrennt.');
      calliopeUartCharacteristic = null;
      calliopeServer = null;
      calliopeDevice = null;
      if (typeof setBluetoothConnected === 'function') {
        setBluetoothConnected(false);
      }
    });
  } catch (error) {
    console.error('❌ Fehler beim Verbinden mit dem Calliope mini:', error);
    alert('Calliope mini konnte nicht verbunden werden.');
    if (typeof setBluetoothConnected === 'function') {
      setBluetoothConnected(false);
    }
  }
}

async function sendToCalliope(text) {
  if (!calliopeUartCharacteristic) {
    console.warn('Calliope mini ist nicht verbunden – Nachricht wurde nicht gesendet.');
    return;
  }

  try {
    const data = new TextEncoder().encode(String(text) + '\n');
    await calliopeUartCharacteristic.writeValueWithoutResponse(data);
  } catch (error) {
    console.error('Senden zum Calliope mini fehlgeschlagen:', error);
  }
}
