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
    onPlayerApiReady() {
      // start() runs before the player element necessarily exists - once
      // it does, re-assert suppression so the persistent observer above
      // actually gets attached (a no-op if start() already managed to).
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
