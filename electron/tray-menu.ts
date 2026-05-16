import { app, Tray, Menu, BrowserWindow } from 'electron';
import path from 'path';

export function createTray(mainWindow: BrowserWindow): Tray {
  const tray = new Tray(
    path.join(__dirname, '../public/favicon.ico')
  );

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: 'Check Now',
      click: () => {
        // Send IPC message to renderer to trigger sync
        mainWindow.webContents.send('sync-check-now');
      },
    },
    {
      label: 'Settings',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
        // Navigate to settings if needed
        mainWindow.webContents.send('navigate-to-settings');
      },
    },
    {
      type: 'separator',
    },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Show/hide window on tray icon double-click
  tray.on('double-click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });

  return tray;
}
