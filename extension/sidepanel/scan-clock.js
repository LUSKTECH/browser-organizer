// The live scan heartbeat: a once-a-second elapsed clock appended to the current
// phase label, and the port that streams {progress} updates from the service
// worker during a run. Kept separate so the plan view just calls start/stop.
import { setStatus } from './dom.js';
import { progressLabel, formatElapsed } from './viewmodel.js';

let scanTimer = null;
let scanStartTs = 0;
let lastScanLabel = '';

function tickScan() { setStatus(`${lastScanLabel} · ${formatElapsed(Date.now() - scanStartTs)}`); }

export function startScanClock(label) {
  scanStartTs = Date.now();
  lastScanLabel = label;
  tickScan();
  clearInterval(scanTimer);
  scanTimer = setInterval(tickScan, 1000);
}

export function stopScanClock() { clearInterval(scanTimer); scanTimer = null; }

let scanPort = null;
export function ensureScanPort() {
  if (scanPort) return scanPort;
  scanPort = chrome.runtime.connect({ name: 'scan' });
  scanPort.onMessage.addListener((msg) => {
    if (msg.progress) {
      const { phase, done, total } = msg.progress;
      lastScanLabel = progressLabel(phase, done, total);
      tickScan();
    }
  });
  scanPort.onDisconnect.addListener(() => { scanPort = null; });
  return scanPort;
}
