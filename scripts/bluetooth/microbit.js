let microbitDevice;
let microbitServer;
let uartService;
let uartCharacteristic;

// Nordic UART (micro:bit)
const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_TX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Browser → micro:bit

async function connectMicrobit() {
  try {
    microbitDevice = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'BBC micro:bit' }],
      optionalServices: [UART_SERVICE_UUID]
    });
    microbitServer = await microbitDevice.gatt.connect();
    uartService = await microbitServer.getPrimaryService(UART_SERVICE_UUID);
    uartCharacteristic = await uartService.getCharacteristic(UART_TX_CHARACTERISTIC_UUID);
    console.log('✅ Micro:bit verbunden');
    alert('Micro:bit erfolgreich verbunden!');
    if (typeof setBluetoothConnected === 'function') {
      setBluetoothConnected(true);
    }
    microbitDevice.addEventListener('gattserverdisconnected', () => {
      uartCharacteristic = null;
      uartService = null;
      microbitServer = null;
      microbitDevice = null;
      if (typeof setBluetoothConnected === 'function') {
        setBluetoothConnected(false);
      }
      alert('Micro:bit Verbindung getrennt.');
    });
  } catch (error) {
    console.error('❌ Fehler beim Verbinden:', error);
    alert('Verbindung fehlgeschlagen!');
    if (typeof setBluetoothConnected === 'function') {
      setBluetoothConnected(false);
    }
  }
}

// immer writeWithoutResponse verwenden
async function sendToMicrobit(text) {
  if (!uartCharacteristic) return;
  try {
    const data = new TextEncoder().encode(String(text) + '\n'); // \n-terminiert
    await uartCharacteristic.writeValueWithoutResponse(data);
  } catch (e) {
    console.error('Senden fehlgeschlagen:', e);
  }
}
