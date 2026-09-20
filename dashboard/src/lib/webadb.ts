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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeoutMs))
  ]);
}

function mapWebUsbError(e: unknown): Error {
  if (e instanceof Error) {
    if (e.message.includes('No device selected')) {
      return new Error('Device selection was cancelled.');
    }
    if (e.message.includes('Access denied')) {
      return new Error('Access denied by OS. Ensure no other ADB server (like Android Studio) is running.');
    }
    if (e.message.includes('Unable to claim interface')) {
      return new Error('Unable to claim USB interface. Disconnect other ADB tools and try again.');
    }
    return e;
  }
  return new Error(String(e));
}

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

interface AdbHandle {
  adb: InstanceType<AdbLib['Adb']>;
  serial: string;
}

let _handle: AdbHandle | null = null;

// ── Lazy-load the heavy ADB libs ───────────────────────────────────────────────
async function loadAdbLibs() {
  const [adbLib, daemonLib, credLibModule] = await Promise.all([
    import('@yume-chan/adb'),
    import('@yume-chan/adb-daemon-webusb'),
    import('@yume-chan/adb-credential-web'),
  ]);
  const AdbWebCredentialStore = credLibModule.default;
  return { adbLib, daemonLib, AdbWebCredentialStore };
}

// ── Connect to device via WebUSB browser picker ───────────────────────────────
export async function connectDevice(): Promise<DeviceSession> {
  if (!isWebUsbSupported()) {
    throw new Error('WebUSB is not supported in this browser. Please use Chrome or Edge.');
  }

  const { adbLib, daemonLib, AdbWebCredentialStore } = await loadAdbLibs();
  const { Adb, AdbDaemonTransport } = adbLib;
  const { AdbDaemonWebUsbDeviceManager } = daemonLib;


  // Open the browser's native USB device picker
  const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
  if (!manager) throw new Error('WebUSB DeviceManager unavailable.');

  let device;
  try {
    device = await manager.requestDevice();
  } catch (e) {
    throw mapWebUsbError(e);
  }
  if (!device) throw new Error('Device selection was cancelled.');

  const credStore = new AdbWebCredentialStore('half-life-adb-key');
  let connection;
  try {
    connection = await device.connect();
  } catch (e) {
    throw mapWebUsbError(e);
  }

  let transport;
  try {
    transport = await withTimeout(
      AdbDaemonTransport.authenticate({
        serial: device.serial,
        connection,
        credentialStore: credStore,
      }),
      15000,
      'Authorization timeout. Please tap "Allow" on your phone promptly.'
    );
  } catch (e: any) {
    if (e.message.includes('timeout')) {
      // Attempt to release the interface if we gave up
      await device.raw.close().catch(() => {});
    }
    throw mapWebUsbError(e);
  }

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

export async function runShell(handle: AdbHandle, command: string, limitBytes = 1024 * 1024, timeoutMs = 10000): Promise<string> {
  let process: any;
  try {
    process = await handle.adb.subprocess.noneProtocol.spawn(['shell', command]);
  } catch (e) {
    return `[SPAWN ERROR: ${e instanceof Error ? e.message : String(e)}]`;
  }

  return new Promise((resolve) => {
    let output = '';
    let bytesRead = 0;
    const reader = process.output.getReader();
    const decoder = new TextDecoder();
    
    let isDone = false;
    
    const timeout = setTimeout(() => {
      if (isDone) return;
      isDone = true;
      process.kill();
      resolve(output + '\n[INCOMPLETE: TIME LIMIT REACHED]');
    }, timeoutMs);

    async function pump() {
      try {
        while (!isDone) {
          const { done, value } = await reader.read();
          if (done) break;
          
          bytesRead += value.byteLength;
          output += decoder.decode(value, { stream: true });
          
          if (bytesRead >= limitBytes) {
            isDone = true;
            process.kill();
            output += decoder.decode();
            resolve(output + '\n[INCOMPLETE: SIZE LIMIT REACHED]');
            return;
          }
        }
      } catch (e) {
         output += `\n[READ ERROR: ${e instanceof Error ? e.message : String(e)}]`;
      } finally {
        if (!isDone) {
          isDone = true;
          clearTimeout(timeout);
          output += decoder.decode();
          resolve(output);
        }
      }
    }
    
    pump();
  });
}

// ── Collect targeted diagnostics (total output ~5-10 KB) ─────────────────────
export async function collectDiagnostics(session: DeviceSession): Promise<DiagnosticsPayload> {
  if (!_handle || _handle.serial !== session.serial) {
    throw new Error('Device not connected. Call connectDevice() first.');
  }
  const h = _handle;

  // Service discovery for thermal
  const servicesList = await runShell(h, 'dumpsys -l', 512 * 1024, 5000);
  let thermalServiceName = 'thermal_service'; // default
  if (servicesList.includes('thermalservice\n') || servicesList.includes('thermalservice\r')) {
    thermalServiceName = 'thermalservice';
  } else if (servicesList.includes('thermal\n') || servicesList.includes('thermal\r')) {
    thermalServiceName = 'thermal';
  }

  // Run all targeted commands in parallel
  const [battery_raw, batterystats_raw, cpuinfo_raw, thermal_raw] = await Promise.all([
    runShell(h, 'dumpsys battery'),
    runShell(h, 'dumpsys batterystats', 1024 * 1024, 15000),
    runShell(h, 'dumpsys cpuinfo', 1024 * 1024, 10000),
    runShell(h, `dumpsys ${thermalServiceName}`),
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
  if (_handle) {
    _handle.adb.close().catch(() => {});
    _handle = null;
  }
}
