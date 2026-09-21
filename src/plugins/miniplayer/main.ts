import fs from 'node:fs';
import path from 'node:path';

import { app, BrowserWindow, ipcMain, screen } from 'electron';

import { getSongControls } from '@/providers/song-controls';
import { registerCallback, type SongInfo } from '@/providers/song-info';

import { type MiniplayerPluginConfig } from './index';
import { getMiniplayerHTML } from './ui';

import type { BackendContext } from '@/types/contexts';

let miniplayerWindow: BrowserWindow | null = null;
let currentConfig: MiniplayerPluginConfig;
let hoverDebounceTimer: NodeJS.Timeout | null = null;
let isCurrentlyHovered = false;

const IDLE_WIDTH = 340;
const IDLE_HEIGHT = 44;
const EXPANDED_WIDTH = 340;
const EXPANDED_HEIGHT = 212;
const MARGIN_RIGHT = 20;
const MARGIN_BOTTOM = 14;

const getWorkArea = () => screen.getPrimaryDisplay().workArea;

const getIdleBounds = () => {
  const workArea = getWorkArea();
  return {
    width: IDLE_WIDTH,
    height: IDLE_HEIGHT,
    x: Math.round(workArea.x + workArea.width - IDLE_WIDTH - MARGIN_RIGHT),
    y: Math.round(workArea.y + workArea.height - IDLE_HEIGHT - MARGIN_BOTTOM),
  };
};

const getExpandedBounds = () => {
  const workArea = getWorkArea();
  return {
    width: EXPANDED_WIDTH,
    height: EXPANDED_HEIGHT,
    x: Math.round(workArea.x + workArea.width - EXPANDED_WIDTH - MARGIN_RIGHT),
    y: Math.round(workArea.y + workArea.height - EXPANDED_HEIGHT - MARGIN_BOTTOM),
  };
};

export const showMiniplayer = () => {
  if (!miniplayerWindow || miniplayerWindow.isDestroyed()) return;
  const bounds = isCurrentlyHovered ? getExpandedBounds() : getIdleBounds();
  miniplayerWindow.setBounds(bounds);
  miniplayerWindow.showInactive();
};

export const hideMiniplayer = () => {
  if (!miniplayerWindow || miniplayerWindow.isDestroyed()) return;
  miniplayerWindow.hide();
};

export const toggleMiniplayer = () => {
  if (!miniplayerWindow || miniplayerWindow.isDestroyed()) return;
  if (miniplayerWindow.isVisible()) {
    hideMiniplayer();
  } else {
    showMiniplayer();
  }
};

export const onMainLoad = async ({
  window: mainWindow,
  getConfig,
}: BackendContext<MiniplayerPluginConfig>) => {
  currentConfig = await getConfig();

  const bounds = getIdleBounds();

  miniplayerWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    show: false,
    focusable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      webSecurity: false,
    },
  });

  miniplayerWindow.setAlwaysOnTop(true, 'screen-saver', 1);

  const controls = getSongControls(mainWindow);

  const htmlPath = path.join(app.getPath('temp'), 'ytr-miniplayer.html');
  fs.writeFileSync(htmlPath, getMiniplayerHTML(), 'utf8');
  miniplayerWindow.loadFile(htmlPath);

  const syncVolumeToMiniplayer = async () => {
    if (!miniplayerWindow || miniplayerWindow.isDestroyed()) return;
    try {
      const vol = await mainWindow.webContents.executeJavaScript(
        'Math.round((document.querySelector("video")?.volume ?? 0.5) * 100)',
      );
      if (typeof vol === 'number' && !isNaN(vol)) {
        miniplayerWindow.webContents.send('miniplayer:update-volume', vol);
      }
    } catch {
      // Ignored
    }
  };

  // Re-adjust bounds on screen display metrics changes
  screen.on('display-metrics-changed', () => {
    if (!miniplayerWindow || miniplayerWindow.isDestroyed()) return;
    const targetBounds = isCurrentlyHovered ? getExpandedBounds() : getIdleBounds();
    miniplayerWindow.setBounds(targetBounds);
  });

  // Handle hover expand & collapse
  ipcMain.on('miniplayer:hover', (_, hovered: boolean) => {
    if (!miniplayerWindow || miniplayerWindow.isDestroyed()) return;

    if (hoverDebounceTimer) {
      clearTimeout(hoverDebounceTimer);
      hoverDebounceTimer = null;
    }

    if (hovered) {
      isCurrentlyHovered = true;
      const targetBounds = getExpandedBounds();
      miniplayerWindow.setBounds(targetBounds);
      miniplayerWindow.webContents.send('miniplayer:set-expanded', true);
      syncVolumeToMiniplayer();
    } else {
      isCurrentlyHovered = false;
      hoverDebounceTimer = setTimeout(() => {
        if (isCurrentlyHovered || !miniplayerWindow || miniplayerWindow.isDestroyed()) return;
        const targetBounds = getIdleBounds();
        miniplayerWindow.setBounds(targetBounds);
        miniplayerWindow.webContents.send('miniplayer:set-expanded', false);
      }, 250);
    }
  });

  // Handle control actions
  ipcMain.on('miniplayer:control', (_, action: string) => {
    switch (action) {
      case 'playPause': {
        controls.playPause();
        break;
      }
      case 'next': {
        controls.next();
        break;
      }
      case 'previous': {
        controls.previous();
        break;
      }
      case 'like': {
        controls.like();
        break;
      }
      case 'dislike': {
        controls.dislike();
        break;
      }
    }
  });

  // Handle volume changes
  ipcMain.on('miniplayer:volume', (_, volume: number) => {
    controls.setVolume(volume);
  });

  // Handle mute toggle
  ipcMain.on('miniplayer:mute', () => {
    controls.muteUnmute();
  });

  // Handle seeking
  ipcMain.on('miniplayer:seek', (_, targetSeconds: number) => {
    controls.seekTo(targetSeconds);
  });

  // Handle restore main window
  ipcMain.on('miniplayer:restore', () => {
    if (!mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Handle close miniplayer
  ipcMain.on('miniplayer:close', () => {
    hideMiniplayer();
  });

  const getSafeSongInfo = (info: SongInfo) => ({
    title: info.title,
    artist: info.artist,
    album: info.album,
    imageSrc: info.imageSrc,
    isPaused: info.isPaused,
    songDuration: info.songDuration,
    elapsedSeconds: info.elapsedSeconds,
  });

  // Stream live song updates to miniplayer
  let lastKnownSongInfo: ReturnType<typeof getSafeSongInfo> | null = null;
  registerCallback((songInfo: SongInfo) => {
    lastKnownSongInfo = getSafeSongInfo(songInfo);
    if (miniplayerWindow && !miniplayerWindow.isDestroyed()) {
      miniplayerWindow.webContents.send('miniplayer:update-track', lastKnownSongInfo);

      if (currentConfig.enabled && !miniplayerWindow.isVisible() && !songInfo.isPaused) {
        showMiniplayer();
      }
    }
  });

  miniplayerWindow.webContents.once('did-finish-load', () => {
    if (lastKnownSongInfo && miniplayerWindow && !miniplayerWindow.isDestroyed()) {
      miniplayerWindow.webContents.send('miniplayer:update-track', lastKnownSongInfo);
    }
    syncVolumeToMiniplayer();
    if (currentConfig.enabled) {
      showMiniplayer();
    }
  });

  // Auto show on minimize if enabled
  mainWindow.on('minimize', () => {
    if (currentConfig.enabled) {
      showMiniplayer();
    }
  });

  mainWindow.on('closed', () => {
    if (miniplayerWindow && !miniplayerWindow.isDestroyed()) {
      miniplayerWindow.close();
      miniplayerWindow = null;
    }
  });
};

export const onConfigChange = (newConfig: MiniplayerPluginConfig) => {
  currentConfig = newConfig;
  if (!miniplayerWindow || miniplayerWindow.isDestroyed()) return;

  if (newConfig.enabled) {
    showMiniplayer();
  } else {
    hideMiniplayer();
  }
};
