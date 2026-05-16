#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, '.next', 'standalone');

console.log('📦 Сборка Windows приложения (Electron)...\n');

try {
  // 1. Проверяем Next.js build
  console.log('1️⃣  Проверяю Next.js build...');
  if (!fs.existsSync(DIST_DIR)) {
    console.log('❌ Не найден .next/standalone директория');
    console.log('💡 Запустите: npm run build');
    process.exit(1);
  }
  console.log('✅ Next.js build готов\n');

  // 2. Копируем .env.local в dist
  console.log('2️⃣  Копирую конфигурацию...');
  const envSource = path.join(ROOT_DIR, '.env.local');
  const envDest = path.join(DIST_DIR, '.env.local');

  if (fs.existsSync(envSource)) {
    fs.copyFileSync(envSource, envDest);
    console.log('✅ .env.local скопирован\n');
  } else {
    console.log('⚠️  .env.local не найден (приложение может не работать)\n');
  }

  // 3. Копируем public directory
  const publicSource = path.join(ROOT_DIR, 'public');
  const publicDest = path.join(DIST_DIR, 'public');

  if (fs.existsSync(publicSource) && !fs.existsSync(publicDest)) {
    execSync(`cp -r "${publicSource}" "${publicDest}"`, { shell: true });
    console.log('✅ Public файлы скопированы\n');
  }

  // 4. Запускаем electron-builder
  console.log('3️⃣  Собираю Electron приложение...');
  console.log('   (это может занять несколько минут)\n');

  execSync('npm run electron-build-exe', { cwd: ROOT_DIR, stdio: 'inherit' });

  console.log('\n✅ Приложение успешно собрано!\n');
  console.log('📁 Файл находится в папке: dist/');
  console.log('   - my.gov tracker-1.0.0.exe (установщик)');
  console.log('   - my.gov tracker-1.0.0 (портативная версия)\n');

} catch (error) {
  console.error('❌ Ошибка при сборке:', error.message);
  process.exit(1);
}
