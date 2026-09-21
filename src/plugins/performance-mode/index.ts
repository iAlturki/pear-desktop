import { t } from '@/i18n';
import type { MusicPlayer } from '@/types/music-player';
import { createPlugin } from '@/utils';

import style from './style.css?inline';

export type PerformanceModePluginConfig = {
  enabled: boolean;
  // Plugins this mode force-disabled while it was on, so they can be
  // restored to exactly the state the user had them in - never
  // force-enabled on exit, only ever restored.
  previouslyEnabled: string[];
};

// Purely visual/decorative plugins and heavy audio DSP / background broadcast
// plugins that tax CPU/GPU/memory without being required for basic audio playback.
// video-toggle is included even though it isn't itself heavy - leaving it running
// would fight this plugin's own audio-only enforcement below whenever the user's
// video-toggle setting disagrees with it.
const SUSPENDED_PLUGINS = [
  'synced-lyrics',
  'visualizer',
  'ambient-mode',
  'album-color-theme',
  'blur-nav-bar',
  'transparent-player',
  'video-toggle',
  'equalizer',
  'picture-in-picture',
  'lumiastream',
  'tuna-obs',
];

export default createPlugin<
  unknown,
  unknown,
  {
    config?: PerformanceModePluginConfig;
    playerApi?: MusicPlayer;
    videoDataChangeListener?: EventListener;
    playerObserver?: MutationObserver;
    applyVideoSuppression(hide: boolean): void;
    suspendOtherPlugins(): Promise<void>;
    resumeOtherPlugins(): void;
  },
  PerformanceModePluginConfig
>({
  name: () => t('plugins.performance-mode.name'),
  description: () => t('plugins.performance-mode.description'),
  restartNeeded: false,
  config: { enabled: false, previouslyEnabled: [] },
  stylesheets: [style],

  renderer: {
    applyVideoSuppression(hide) {
      document.body.classList.toggle('performance-mode-active', hide);

      const video = document.querySelector<HTMLVideoElement>('video');
      if (video) {
        video.disablePictureInPicture = hide;
        video.disableRemotePlayback = hide;
      }

      if (!hide) {
        if (this.videoDataChangeListener) {
          document.removeEventListener(
            'videodatachange',
            this.videoDataChangeListener,
          );
          this.videoDataChangeListener = undefined;
        }

        const player = document.querySelector<HTMLElement>('ytmusic-player');
        if (player) {
          this.playerObserver?.disconnect();
          this.playerObserver = undefined;
          player.setAttribute('playback-mode', 'OMV_PREFERRED');
        }
        try {
          this.playerApi?.setPlaybackQualityRange?.('auto');
          this.playerApi?.setPlaybackQuality?.('auto');
          const moviePlayer =
            document.querySelector<Element & { setPlaybackQualityRange?: (q: string) => void; setPlaybackQuality?: (q: string) => void }>('#movie_player');
          moviePlayer?.setPlaybackQualityRange?.('auto');
          moviePlayer?.setPlaybackQuality?.('auto');
        } catch {
          // Ignore
        }
        return;
      }

      const player = document.querySelector<HTMLElement>('ytmusic-player');
      if (!player) return;

      this.playerObserver?.disconnect();
      this.playerObserver = undefined;

      // Re-assert audio-only ATV mode
      player.setAttribute('playback-mode', 'ATV_PREFERRED');

      // Click the official native song button on the AV toggle if available
      const songBtn = document.querySelector<HTMLElement>(
        'ytmusic-av-toggle tp-yt-paper-button.song-button',
      );
      if (
        songBtn &&
        !songBtn.hasAttribute('disabled') &&
        !songBtn.classList.contains('iron-selected')
      ) {
        songBtn.click();
      }

      try {
        this.playerApi?.setPlaybackQualityRange?.('tiny');
        this.playerApi?.setPlaybackQuality?.('tiny');
        const moviePlayer =
          document.querySelector<Element & { setPlaybackQualityRange?: (q: string) => void; setPlaybackQuality?: (q: string) => void }>('#movie_player');
        moviePlayer?.setPlaybackQualityRange?.('tiny');
        moviePlayer?.setPlaybackQuality?.('tiny');
      } catch {
        // Ignore
      }

      const observer = new MutationObserver(() => {
        if (player.getAttribute('playback-mode') !== 'ATV_PREFERRED') {
          player.setAttribute('playback-mode', 'ATV_PREFERRED');
        }
      });
      observer.observe(player, { attributeFilter: ['playback-mode'] });
      this.playerObserver = observer;

      if (!this.videoDataChangeListener) {
        this.videoDataChangeListener = ((e: CustomEvent<{ name?: string }>) => {
          if (e.detail?.name === 'dataloaded') {
            try {
              this.playerApi?.setPlaybackQualityRange?.('tiny');
              this.playerApi?.setPlaybackQuality?.('tiny');
              const moviePlayer =
                document.querySelector<Element & { setPlaybackQualityRange?: (q: string) => void; setPlaybackQuality?: (q: string) => void }>('#movie_player');
              moviePlayer?.setPlaybackQualityRange?.('tiny');
              moviePlayer?.setPlaybackQuality?.('tiny');
            } catch {
              // Ignore
            }

            const currentSongBtn = document.querySelector<HTMLElement>(
              'ytmusic-av-toggle tp-yt-paper-button.song-button',
            );
            if (
              currentSongBtn &&
              !currentSongBtn.hasAttribute('disabled') &&
              !currentSongBtn.classList.contains('iron-selected')
            ) {
              currentSongBtn.click();
            }

            if (typeof (window as unknown as { gc?: () => void }).gc === 'function') {
              (window as unknown as { gc?: () => void }).gc?.();
            }
          }
        }) as EventListener;
        document.addEventListener(
          'videodatachange',
          this.videoDataChangeListener,
        );
      }

      if (typeof (window as unknown as { gc?: () => void }).gc === 'function') {
        (window as unknown as { gc?: () => void }).gc?.();
      }
    },

    async suspendOtherPlugins() {
      const previouslyEnabled: string[] = [];
      for (const plugin of SUSPENDED_PLUGINS) {
        if (await window.mainConfig.plugins.isEnabled(plugin)) {
          previouslyEnabled.push(plugin);
          window.mainConfig.plugins.disable(plugin);
        }
      }
      window.mainConfig.plugins.setOptions('performance-mode', {
        previouslyEnabled,
      });
    },

    resumeOtherPlugins() {
      const stored =
        window.mainConfig.plugins.getOptions<PerformanceModePluginConfig>(
          'performance-mode',
        );
      for (const plugin of stored?.previouslyEnabled ?? []) {
        window.mainConfig.plugins.enable(plugin);
      }
      window.mainConfig.plugins.setOptions('performance-mode', {
        previouslyEnabled: [],
      });
    },

    // Enabling/disabling a plugin runs start()/stop(), NOT onConfigChange -
    // that hook only fires for an already-running plugin's other settings
    // changing. The suspend/resume cascade has to live here; putting it in
    // onConfigChange (as an earlier version of this file did) meant
    // flipping the menu checkbox persisted enabled:true but never actually
    // ran the code that disables ambient-mode/visualizer/etc, since
    // onConfigChange either never fired for that transition or raced
    // start() and found the plugin not yet in the loaded-plugin map.
    async start({ getConfig }) {
      this.config = await getConfig();
      if (!this.config.enabled) return;

      this.applyVideoSuppression(true);
      // A fresh app launch with performance mode already on from a
      // previous session also runs start() - previouslyEnabled already
      // holds that session's snapshot, and re-suspending now would find
      // everything already disabled and overwrite it with an empty list,
      // losing what to restore later. Only suspend when there's nothing
      // recorded yet.
      if (!this.config.previouslyEnabled?.length) {
        await this.suspendOtherPlugins();
      }
    },
    onPlayerApiReady(api: MusicPlayer) {
      this.playerApi = api;
      if (this.config?.enabled) {
        this.applyVideoSuppression(true);
      }
    },
    onConfigChange(newConfig) {
      this.config = newConfig;
    },
    stop() {
      this.applyVideoSuppression(false);
      this.resumeOtherPlugins();
    },
  },
});
