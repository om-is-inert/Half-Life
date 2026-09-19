/**
 * webadb.ts — WebUSB bridge for Half-Life
 *
 * Uses @yume-chan/adb + @yume-chan/adb-daemon-webusb to connect directly
 * to an Android device through the browser's WebUSB API (Chrome / Edge only).
 *
 * Exposes a clean async API:
 *   connectDevice()           → DeviceSession
 *   runShell(session, cmd)    → string (stdout)
 *   collectDiagnostics(s)     → DiagnosticsPayload (~5 KB)
 *   isWebUsbSupported()       → boolean
 */

import type { DeviceSession, DiagnosticsPayload } from '../types/dashboard';

// ── WebUSB support check ───────────────────────────────────────────────────────
export function isWebUsbSupported(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
}

// ── ADB vendor IDs (all major Android OEMs) ────────────────────────────────────
const ADB_DEVICE_FILTER: USBDeviceFilter[] = [
  { classCode: 0xff, subclassCode: 0x42, protocolCode: 0x01 },
];

// ── Internal types ────────────────────────────────────────────────────────────
type AdbLib      = typeof import('@yume-chan/adb');
type AdbDaemonLib = typeof import('@yume-chan/adb-daemon-webusb');
type AdbCredLib  = typeof import('@yume-chan/adb-credential-web');

interface AdbHandle {
  adb: InstanceType<AdbLib['Adb']>;
  serial: string;
}

let _handle: AdbHandle | null = null;

// ── Lazy-load the heavy ADB libs ───────────────────────────────────────────────
async function loadAdbLibs(): Promise<{
  adbLib: AdbLib;
  daemonLib: AdbDaemonLib;
  credLib: AdbCredLib;
}> {
  const [adbLib, daemonLib, credLib] = await Promise.all([
    import('@yume-chan/adb'),
    import('@yume-chan/adb-daemon-webusb'),
    import('@yume-chan/adb-credential-web'),
  ]);
  return { adbLib, daemonLib, credLib };
}

// ── Connect to device via WebUSB browser picker ───────────────────────────────
export async function connectDevice(): Promise<DeviceSession> {
  if (!isWebUsbSupported()) {
    throw new Error('WebUSB is not supported in this browser. Please use Chrome or Edge.');
  }

  const { adbLib, daemonLib, credLib } = await loadAdbLibs();
  const { Adb, AdbDaemonTransport } = adbLib;
  const { AdbDaemonWebUsbDeviceManager } = daemonLib;
  const { AdbWebCredentialStore } = credLib;


  // Open the browser's native USB device picker
  const manager = AdbDaemonWebUsbDeviceManager.BROWSER_DEFAULT;
  if (!manager) throw new Error('WebUSB DeviceManager unavailable.');

  const device = await manager.requestDevice();
  if (!device) throw new Error('No device selected.');

  // Generate / retrieve RSA key pair for ADB authentication
  const credStore = new AdbWebCredentialStore('half-life-adb-key');
  const connection = await device.connect();

  const transport = await AdbDaemonTransport.authenticate({
    serial: device.serial,
    connection,
    credentialStore: credStore,
  });

  const adb = new Adb(transport);
  _handle = { adb, serial: device.serial };

  // Read device properties for display
  const [model, manufacturer] = await Promise.all([
    runShell(_handle, 'getprop ro.product.model').catch(() => 'Unknown Model'),
    runShell(_handle, 'getprop ro.product.manufacturer').catch(() => 'Unknown'),
  ]);

  return {
    serial: device.serial,
    model: model.trim(),
    manufacturer: manufacturer.trim(),
  };
}

// ── Run a single adb shell command, return stdout ─────────────────────────────
export async function runShell(handle: AdbHandle, command: string): Promise<string> {
  // The @yume-chan/adb subprocess API
  const process = await handle.adb.subprocess.spawnAndWaitLegacy(
    ['shell', command],
  );
  return process.stdout ?? '';
}

// ── Collect targeted diagnostics (total output ~5-10 KB) ─────────────────────
export async function collectDiagnostics(session: DeviceSession): Promise<DiagnosticsPayload> {
  if (!_handle || _handle.serial !== session.serial) {
    throw new Error('Device not connected. Call connectDevice() first.');
  }
  const h = _handle;

  // Run all 4 targeted commands in parallel
  const [battery_raw, batterystats_raw, cpuinfo_raw, thermal_raw] = await Promise.all([
    runShell(h, 'dumpsys battery').catch(() => ''),
    // Only grab the first 300 lines of batterystats to keep it compact
    runShell(h, 'dumpsys batterystats 2>/dev/null | head -n 300').catch(() => ''),
    runShell(h, 'dumpsys cpuinfo 2>/dev/null | head -n 80').catch(() => ''),
    runShell(h, 'dumpsys thermal_service 2>/dev/null | head -n 60').catch(() => ''),
  ]);

  return {
    device_id: session.serial,
    battery_raw,
    batterystats_raw,
    cpuinfo_raw,
    thermal_raw,
    connection_method: 'webusb',
  };
}

// ── Disconnect / cleanup ───────────────────────────────────────────────────────
export function disconnectDevice(): void {
  _handle = null;
}
