import path from 'node:path';

import { app, BrowserWindow, ipcMain } from 'electron';
import is from 'electron-is';

import * as config from '@/config';

export const restart = () => restartInternal();

export const setupAppControls = () => {
  ipcMain.on('peard:restart', restart);
  ipcMain.handle('peard:get-downloads-folder', () => app.getPath('downloads'));
  ipcMain.on('peard:reload', () =>
    BrowserWindow.getFocusedWindow()?.webContents.loadURL(config.get('url')),
  );
  ipcMain.handle('peard:get-path', (_, ...args: string[]) =>
    path.join(...args),
  );
};

function restartInternal() {
  if (is.dev()) {
    // A full process relaunch kills the Vite dev server the renderer
    // depends on under `pnpm dev`, leaving the relaunched process with
    // nothing to load (it falls back to Electron's blank template page).
    // Reload the window(s) instead - most restart-required changes take
    // effect from a fresh page load, and this avoids that dead end.
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.reload();
    }
    return;
  }

  app.relaunch({ execPath: process.env.PORTABLE_EXECUTABLE_FILE });
  // ExecPath will be undefined if not running portable app, resulting in default behavior
  app.quit();
}

function sendToFrontInternal(channel: string, ...args: unknown[]) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args);
  }
}

export const sendToFront =
  process.type === 'browser'
    ? sendToFrontInternal
    : () => {
        console.error('sendToFront called from renderer');
      };
