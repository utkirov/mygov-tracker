import { execSync } from 'child_process';
import { Buffer } from 'buffer';

export function registerAutoStart() {
  try {
    // Windows registry key for startup applications
    const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
    const appName = 'my.gov tracker';

    // Use process.execPath which returns the actual Electron executable path
    const exePath = process.execPath;

    // PowerShell command to add registry entry
    const psCommand = `
      $regPath = '${regKey}'
      $appName = '${appName}'
      $exePath = '${exePath.replace(/'/g, "''")}'

      if (-not (Test-Path $regPath)) {
        New-Item -Path $regPath -Force | Out-Null
      }

      New-ItemProperty -Path $regPath -Name $appName -Value $exePath -PropertyType String -Force | Out-Null
    `;

    // Encode command in base64 for safe execution via -EncodedCommand parameter
    const encodedCommand = Buffer.from(psCommand, 'utf-16le').toString('base64');

    // Run PowerShell command to register
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedCommand}`, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    console.log('Auto-start registered successfully');
    return true;
  } catch (error) {
    console.error('Failed to register auto-start:', error.message);
    return false;
  }
}

export function unregisterAutoStart() {
  try {
    const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
    const appName = 'my.gov tracker';

    const psCommand = `
      $regPath = '${regKey}'
      $appName = '${appName}'

      Remove-ItemProperty -Path $regPath -Name $appName -ErrorAction SilentlyContinue
    `;

    // Encode command in base64 for safe execution via -EncodedCommand parameter
    const encodedCommand = Buffer.from(psCommand, 'utf-16le').toString('base64');

    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedCommand}`, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    console.log('Auto-start unregistered successfully');
    return true;
  } catch (error) {
    console.error('Failed to unregister auto-start:', error.message);
    return false;
  }
}
