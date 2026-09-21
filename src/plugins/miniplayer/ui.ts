export const getMiniplayerHTML = (): string => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ytr-music Miniplayer</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      user-select: none;
      -webkit-user-select: none;
    }

    body {
      background: transparent;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #ffffff;
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }

    .card {
      width: 100%;
      height: 100%;
      background: rgba(15, 16, 22, 0.92);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 14px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
    }

    /* Idle / Collapsed Layout (44px) */
    .compact-view {
      display: flex;
      align-items: center;
      height: 44px;
      min-height: 44px;
      padding: 0 10px;
      gap: 10px;
      cursor: pointer;
    }

    .compact-art {
      width: 30px;
      height: 30px;
      border-radius: 6px;
      object-fit: cover;
      background: #222;
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    }

    .compact-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      line-height: 1.25;
    }

    .compact-title {
      font-size: 12px;
      font-weight: 600;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .compact-artist {
      font-size: 10.5px;
      color: rgba(255, 255, 255, 0.65);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .compact-controls {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }

    .mini-btn {
      background: transparent;
      border: none;
      outline: none;
      color: rgba(255, 255, 255, 0.85);
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .mini-btn:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.15);
      transform: scale(1.08);
    }

    .mini-btn:active {
      transform: scale(0.95);
    }

    .mini-btn svg {
      width: 14px;
      height: 14px;
      fill: currentColor;
    }

    .play-btn-circle {
      background: #ff3d00;
      color: #fff;
    }

    .play-btn-circle:hover {
      background: #ff5722;
      color: #fff;
      box-shadow: 0 0 12px rgba(255, 61, 0, 0.5);
    }

    .progress-bar-thin {
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 2px;
      background: rgba(255, 255, 255, 0.12);
    }

    .progress-fill-thin {
      height: 100%;
      width: 0%;
      background: #ff3d00;
      transition: width 0.25s linear;
    }

    /* Expanded View (Revealed when height >= 180px) */
    .expanded-view {
      display: none;
      flex-direction: column;
      padding: 10px 14px 12px;
      height: 100%;
      justify-content: space-between;
    }

    .expanded .compact-view {
      display: none;
    }

    .expanded .expanded-view {
      display: flex;
    }

    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .brand-tag {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: rgba(255, 255, 255, 0.5);
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .brand-tag span {
      color: #ff3d00;
    }

    .header-actions {
      display: flex;
      gap: 4px;
    }

    .icon-btn-small {
      background: transparent;
      border: none;
      color: rgba(255, 255, 255, 0.6);
      width: 22px;
      height: 22px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .icon-btn-small:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.15);
    }

    .icon-btn-small svg {
      width: 12px;
      height: 12px;
      fill: currentColor;
    }

    .main-info-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .large-art {
      width: 62px;
      height: 62px;
      border-radius: 8px;
      object-fit: cover;
      background: #222;
      flex-shrink: 0;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
    }

    .details-col {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .details-title {
      font-size: 13.5px;
      font-weight: 600;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .details-artist {
      font-size: 11.5px;
      color: rgba(255, 255, 255, 0.7);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .details-album {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.4);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Seek Section */
    .seek-container {
      margin-top: 6px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .seek-track {
      position: relative;
      height: 5px;
      background: rgba(255, 255, 255, 0.15);
      border-radius: 3px;
      cursor: pointer;
      overflow: hidden;
    }

    .seek-fill {
      height: 100%;
      width: 0%;
      background: #ff3d00;
      border-radius: 3px;
    }

    .time-row {
      display: flex;
      justify-content: space-between;
      font-size: 9.5px;
      color: rgba(255, 255, 255, 0.5);
      font-variant-numeric: tabular-nums;
    }

    /* Transport Row */
    .controls-row {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 16px;
      margin-top: 4px;
    }

    .ctrl-btn {
      background: transparent;
      border: none;
      outline: none;
      color: rgba(255, 255, 255, 0.8);
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .ctrl-btn:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.12);
      transform: scale(1.1);
    }

    .ctrl-btn:active {
      transform: scale(0.95);
    }

    .ctrl-btn svg {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }

    .ctrl-btn.play-main {
      width: 38px;
      height: 38px;
      background: #ff3d00;
      color: #fff;
      box-shadow: 0 4px 14px rgba(255, 61, 0, 0.4);
    }

    .ctrl-btn.play-main:hover {
      background: #ff5722;
      box-shadow: 0 4px 18px rgba(255, 61, 0, 0.6);
      transform: scale(1.08);
    }

    .ctrl-btn.play-main svg {
      width: 18px;
      height: 18px;
    }
  </style>
</head>
<body>
  <div class="card" id="card">
    <!-- Collapsed View (Idle 44px) -->
    <div class="compact-view" id="compact-view">
      <img class="compact-art" id="compact-art" src="" alt="" style="display:none;" />
      <div class="compact-info">
        <div class="compact-title" id="compact-title">ytr-music (iALTURKi)</div>
        <div class="compact-artist" id="compact-artist">Hover to expand</div>
      </div>
      <div class="compact-controls">
        <button class="mini-btn play-btn-circle" id="compact-play-btn" title="Play/Pause">
          <svg viewBox="0 0 24 24" id="compact-play-icon"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <button class="mini-btn" id="compact-next-btn" title="Next">
          <svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
        </button>
      </div>
      <div class="progress-bar-thin">
        <div class="progress-fill-thin" id="progress-fill-thin"></div>
      </div>
    </div>

    <!-- Expanded View (Hover 180px) -->
    <div class="expanded-view" id="expanded-view">
      <div class="header-row">
        <div class="brand-tag"><span>ytr-music</span> • iALTURKi Edition</div>
        <div class="header-actions">
          <button class="icon-btn-small" id="restore-btn" title="Open Main Window">
            <svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
          </button>
          <button class="icon-btn-small" id="close-btn" title="Close Miniplayer">
            <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
      </div>

      <div class="main-info-row">
        <img class="large-art" id="large-art" src="" alt="" style="display:none;" />
        <div class="details-col">
          <div class="details-title" id="details-title">Not Playing</div>
          <div class="details-artist" id="details-artist">Start music in ytr-music</div>
          <div class="details-album" id="details-album"></div>
        </div>
      </div>

      <div class="seek-container">
        <div class="seek-track" id="seek-track">
          <div class="seek-fill" id="seek-fill"></div>
        </div>
        <div class="time-row">
          <span id="elapsed-time">0:00</span>
          <span id="duration-time">0:00</span>
        </div>
      </div>

      <div class="controls-row">
        <button class="ctrl-btn" id="prev-btn" title="Previous Track">
          <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
        </button>
        <button class="ctrl-btn play-main" id="main-play-btn" title="Play/Pause">
          <svg viewBox="0 0 24 24" id="main-play-icon"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <button class="ctrl-btn" id="next-btn" title="Next Track">
          <svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
        </button>
      </div>
    </div>
  </div>

  <script>
    const { ipcRenderer } = require('electron');

    const card = document.getElementById('card');
    const compactArt = document.getElementById('compact-art');
    const compactTitle = document.getElementById('compact-title');
    const compactArtist = document.getElementById('compact-artist');
    const progressFillThin = document.getElementById('progress-fill-thin');

    const largeArt = document.getElementById('large-art');
    const detailsTitle = document.getElementById('details-title');
    const detailsArtist = document.getElementById('details-artist');
    const detailsAlbum = document.getElementById('details-album');
    const seekTrack = document.getElementById('seek-track');
    const seekFill = document.getElementById('seek-fill');
    const elapsedTime = document.getElementById('elapsed-time');
    const durationTime = document.getElementById('duration-time');

    const compactPlayBtn = document.getElementById('compact-play-btn');
    const compactNextBtn = document.getElementById('compact-next-btn');
    const mainPlayBtn = document.getElementById('main-play-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const restoreBtn = document.getElementById('restore-btn');
    const closeBtn = document.getElementById('close-btn');

    const playSvg = '<path d="M8 5v14l11-7z"/>';
    const pauseSvg = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';

    let currentDuration = 0;
    let currentElapsed = 0;
    let isPausedState = true;

    function formatTime(seconds) {
      if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function setPlayState(isPaused) {
      isPausedState = isPaused;
      const icon = isPaused ? playSvg : pauseSvg;
      document.getElementById('compact-play-icon').innerHTML = icon;
      document.getElementById('main-play-icon').innerHTML = icon;
    }

    function updateProgress(elapsed, duration) {
      currentElapsed = elapsed;
      if (duration && duration > 0) currentDuration = duration;
      const pct = currentDuration > 0 ? Math.min(100, Math.max(0, (currentElapsed / currentDuration) * 100)) : 0;
      progressFillThin.style.width = pct + '%';
      seekFill.style.width = pct + '%';
      elapsedTime.textContent = formatTime(currentElapsed);
      durationTime.textContent = formatTime(currentDuration);
    }

    // Hover listeners to expand/collapse window
    document.addEventListener('mouseenter', () => {
      ipcRenderer.send('miniplayer:hover', true);
    });

    document.addEventListener('mouseleave', () => {
      ipcRenderer.send('miniplayer:hover', false);
    });

    // Handle expand/collapse UI state from main
    ipcRenderer.on('miniplayer:set-expanded', (_, expanded) => {
      if (expanded) {
        card.classList.add('expanded');
      } else {
        card.classList.remove('expanded');
      }
    });

    // Handle track updates
    ipcRenderer.on('miniplayer:update-track', (_, songInfo) => {
      if (!songInfo) return;
      
      const title = songInfo.title || 'Unknown Title';
      const artist = songInfo.artist || 'Unknown Artist';
      const album = songInfo.album || '';
      const imageSrc = songInfo.imageSrc || '';

      compactTitle.textContent = title;
      compactArtist.textContent = artist;
      detailsTitle.textContent = title;
      detailsArtist.textContent = artist;
      detailsAlbum.textContent = album;

      if (imageSrc) {
        compactArt.src = imageSrc;
        compactArt.style.display = 'block';
        largeArt.src = imageSrc;
        largeArt.style.display = 'block';
      } else {
        compactArt.style.display = 'none';
        largeArt.style.display = 'none';
      }

      setPlayState(Boolean(songInfo.isPaused));
      updateProgress(songInfo.elapsedSeconds || 0, songInfo.songDuration || currentDuration);
    });

    // Periodic time increment when playing
    setInterval(() => {
      if (!isPausedState && currentDuration > 0 && currentElapsed < currentDuration) {
        currentElapsed += 1;
        updateProgress(currentElapsed, currentDuration);
      }
    }, 1000);

    // Controls
    const togglePlay = (e) => {
      e.stopPropagation();
      ipcRenderer.send('miniplayer:control', 'playPause');
    };

    const nextTrack = (e) => {
      e.stopPropagation();
      ipcRenderer.send('miniplayer:control', 'next');
    };

    const prevTrack = (e) => {
      e.stopPropagation();
      ipcRenderer.send('miniplayer:control', 'previous');
    };

    compactPlayBtn.addEventListener('click', togglePlay);
    mainPlayBtn.addEventListener('click', togglePlay);
    compactNextBtn.addEventListener('click', nextTrack);
    nextBtn.addEventListener('click', nextTrack);
    prevBtn.addEventListener('click', prevTrack);

    restoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      ipcRenderer.send('miniplayer:restore');
    });

    const compactView = document.getElementById('compact-view');
    compactView.addEventListener('dblclick', (e) => {
      if (!e.target.closest('button')) {
        ipcRenderer.send('miniplayer:restore');
      }
    });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      ipcRenderer.send('miniplayer:close');
    });

    // Seeking
    seekTrack.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!currentDuration) return;
      const rect = seekTrack.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, clickX / rect.width));
      const targetSeconds = pct * currentDuration;
      ipcRenderer.send('miniplayer:seek', targetSeconds);
      updateProgress(targetSeconds, currentDuration);
    });
  </script>
</body>
</html>`;
};
