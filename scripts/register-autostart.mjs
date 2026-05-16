import { app } from 'electron';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function registerAutoStart() {
  try {
    // Windows registry key for startup applications
    const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
    const appName = 'my.gov tracker';

    // Get the app's executable path
    const exePath = process.argv[1] || path.join(app.getPath('exe'));

    // PowerShell command to add registry entry
    const psCommand = `
      $regPath = '${regKey}'
      $appName = '${appName}'
      $exePath = '${exePath}'

      if (-not (Test-Path $regPath)) {
        New-Item -Path $regPath -Force | Out-Null
      }

      New-ItemProperty -Path $regPath -Name $appName -Value $exePath -PropertyType String -Force | Out-Null
    `;

    // Run PowerShell command to register
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommand.replace(/"/g, '\\"')}"`, {
      stdio: 'inherit',
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

    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommand.replace(/"/g, '\\"')}"`, {
      stdio: 'inherit',
    });

    console.log('Auto-start unregistered successfully');
    return true;
  } catch (error) {
    console.error('Failed to unregister auto-start:', error.message);
    return false;
  }
}
