const { app, BrowserWindow, Menu, Tray } = require('electron');
const isDev = require('electron-is-dev');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow;
let nextServer;
let serverReady = false;
let tray = null;
app.isQuitting = false;

function resolveStandaloneServerPath(appDir) {
  const directPath = path.join(appDir, '.next', 'standalone', 'server.js');
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  const worktreesDir = path.join(appDir, '.next', 'standalone', '.worktrees');
  if (fs.existsSync(worktreesDir)) {
    const nestedServer = fs
      .readdirSync(worktreesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(worktreesDir, entry.name, 'server.js'))
      .find((candidate) => fs.existsSync(candidate));

    if (nestedServer) {
      return nestedServer;
    }
  }

  throw new Error('Standalone server.js not found');
}

// Функция для создания системного трея
function createTrayMenu() {
  const iconPath = path.join(__dirname, '../app/favicon.ico');
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        if (!mainWindow) return;
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: 'Check Now',
      click: () => {
        // Send IPC message to renderer to trigger sync
        if (!mainWindow) return;
        mainWindow.webContents.send('sync-check-now');
      },
    },
    {
      label: 'Settings',
      click: () => {
        if (!mainWindow) return;
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
  tray.setToolTip('my.gov tracker');

  // Show/hide window on tray icon double-click
  tray.on('double-click', () => {
    if (!mainWindow) return;
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });

  return tray;
}

// Функция для проверки доступности сервера
function checkServerReady() {
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      const req = http.get('http://localhost:3000', (res) => {
        clearInterval(checkInterval);
        serverReady = true;
        resolve();
      });
      req.on('error', () => {
        // Сервер ещё не готов
      });
      req.end();
    }, 500);

    // Timeout после 30 секунд
    setTimeout(() => {
      clearInterval(checkInterval);
      resolve();
    }, 30000);
  });
}

// Функция для запуска Next.js сервера
function startNextServer() {
  return new Promise((resolve, reject) => {
    const appDir = isDev ? path.join(__dirname, '..') : path.join(__dirname, '..');

    let command;
    let args;
    let env = { ...process.env };

    if (isDev) {
      // Режим разработки - используем npm run dev
      command = 'npm';
      args = ['run', 'dev'];
    } else {
      // Production - запускаем Next.js standalone сервер
      command = 'node';
      args = [resolveStandaloneServerPath(appDir)];
      env.PORT = '3000';
      env.LOCAL_APP_ROOT = appDir;
    }

    console.log(`🚀 Запускаю сервер: ${command} ${args.join(' ')}`);
    console.log(`📂 Папка: ${appDir}\n`);

    nextServer = spawn(command, args, {
      cwd: appDir,
      stdio: isDev ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: env,
    });

    nextServer.on('error', (err) => {
      console.error('❌ Ошибка сервера:', err);
      reject(err);
    });

    if (!isDev && nextServer.stdout) {
      nextServer.stdout.on('data', (data) => {
        console.log(`[Server] ${data}`);
      });
      nextServer.stderr.on('data', (data) => {
        console.error(`[Server Error] ${data}`);
      });
    }

    // Проверяем готовность сервера
    checkServerReady().then(resolve).catch(reject);
  });
}

// Функция для создания окна
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../app/favicon.ico'),
    show: false,
  });

  // Create system tray immediately after window creation
  createTrayMenu();

  // Загружаем приложение
  mainWindow.loadURL('http://localhost:3000');

  // Показываем окно когда оно готово
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Для dev режима открыть DevTools
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Обработка ошибок загрузки
  mainWindow.webContents.on('did-fail-load', () => {
    console.error('❌ Ошибка загрузки страницы');
    // Пытаемся переагрузить через 2 секунды
    setTimeout(() => {
      if (mainWindow) mainWindow.reload();
    }, 2000);
  });

  // Hide window when minimized (instead of closing)
  mainWindow.on('minimize', () => {
    if (mainWindow) mainWindow.hide();
  });

  // Close button minimizes to tray instead of quitting
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      if (mainWindow) mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Меню приложения
function createMenu() {
  const template = [
    {
      label: 'Файл',
      submenu: [
        {
          label: 'Выход',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Вид',
      submenu: [
        {
          label: 'Перезагрузить',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) mainWindow.reload();
          },
        },
        {
          label: 'Полный экран',
          accelerator: 'F11',
          click: () => {
            if (mainWindow) {
              mainWindow.setFullScreen(!mainWindow.isFullScreen());
            }
          },
        },
      ],
    },
    {
      label: 'Справка',
      submenu: [
        {
          label: 'О приложении',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'my.gov tracker',
              message: 'my.gov tracker v1.0',
              detail: 'Трекер заявок my.gov.uz\n\nПолностью автономное Windows приложение',
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Запуск приложения
app.on('ready', async () => {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   my.gov tracker - Windows App v1.0   ║');
  console.log('╚════════════════════════════════════════╝\n');

  try {
    console.log('⏳ Инициализация приложения...');
    await startNextServer();
    console.log('✅ Сервер готов!\n');

    createWindow();
    createMenu();
    console.log('✅ Окно приложения создано');
  } catch (error) {
    console.error('❌ Критическая ошибка:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // На Windows и Linux - выход при закрытии всех окон
  if (process.platform !== 'darwin') {
    app.quit();
  }
  // Остановить сервер
  if (nextServer) {
    nextServer.kill();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('activate', () => {
  // На macOS переоткрыть окно при клике на иконку в dock
  // На Windows показать существующее окно
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    // Создать окно только если оно не существует
    createWindow();
  }
});

// Обработка завершения приложения
process.on('exit', () => {
  if (nextServer) {
    nextServer.kill();
  }
});
