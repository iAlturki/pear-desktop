import { t } from '@/i18n';
import { createPlugin } from '@/utils';

import style from './style.css?inline';

export type PerformanceModePluginConfig = {
  enabled: boolean;
  // Plugins this mode force-disabled while it was on, so they can be
  // restored to exactly the state the user had them in - never
  // force-enabled on exit, only ever restored.
  previouslyEnabled: string[];
};

// Purely visual/decorative plugins that meaningfully tax CPU/GPU without
// being required for audio playback. video-toggle is included even though
// it isn't itself heavy - leaving it running would fight this plugin's own
// audio-only enforcement below whenever the user's video-toggle setting
// disagrees with it.
const SUSPENDED_PLUGINS = [
  'synced-lyrics',
  'visualizer',
  'ambient-mode',
  'album-color-theme',
  'blur-nav-bar',
  'transparent-player',
  'video-toggle',
];

export default createPlugin<
  unknown,
  unknown,
  {
    config?: PerformanceModePluginConfig;
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

      const player = document.querySelector<HTMLElement>('ytmusic-player');
      if (!player) return;

      this.playerObserver?.disconnect();
      this.playerObserver = undefined;

      if (!hide) {
        player.setAttribute('playback-mode', 'OMV_PREFERRED');
        return;
      }

      // YouTube Music's own code resets playback-mode back to
      // OMV_PREFERRED shortly after each track loads, so a one-time set
      // only survives until the current track ends. A persistent observer
      // re-asserts audio-only mode on every track instead, which is what
      // actually stops the video stream from being fetched at all - not
      // just hiding it once it's already downloading.
      player.setAttribute('playback-mode', 'ATV_PREFERRED');
      const observer = new MutationObserver(() => {
        if (player.getAttribute('playback-mode') !== 'ATV_PREFERRED') {
          player.setAttribute('playback-mode', 'ATV_PREFERRED');
        }
      });
      observer.observe(player, { attributeFilter: ['playback-mode'] });
      this.playerObserver = observer;
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

    async start({ getConfig }) {
      this.config = await getConfig();
    },
    onPlayerApiReady() {
      if (this.config?.enabled) {
        this.applyVideoSuppression(true);
      }
    },
    async onConfigChange(newConfig) {
      const wasEnabled = this.config?.enabled ?? false;
      this.config = newConfig;
      if (newConfig.enabled === wasEnabled) return;

      this.applyVideoSuppression(newConfig.enabled);
      if (newConfig.enabled) {
        await this.suspendOtherPlugins();
      } else {
        this.resumeOtherPlugins();
      }
    },
    stop() {
      this.playerObserver?.disconnect();
      this.playerObserver = undefined;
      document.body.classList.remove('performance-mode-active');
    },
  },
});
