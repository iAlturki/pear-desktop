import prompt from 'custom-electron-prompt';

import { t } from '@/i18n';
import { VolumeFader } from '@/plugins/crossfade/fader';
import promptOptions from '@/providers/prompt-options';
import { createPlugin } from '@/utils';

import type { MusicPlayer } from '@/types/music-player';
import type { BrowserWindow } from 'electron';

export type FadePlaybackPluginConfig = {
  enabled: boolean;
  /**
   * Duration in milliseconds of the fade-in applied when playback starts or resumes.
   *
   * @default 800ms
   */
  fadeInDuration: number;
  /**
   * Duration in milliseconds of the fade-out applied before pausing or skipping tracks.
   *
   * @default 800ms
   */
  fadeOutDuration: number;
  /**
   * Whether to fade out before pausing.
   *
   * @default true
   */
  fadeOnPause: boolean;
  /**
   * Whether to fade out before skipping to the next/previous track.
   *
   * @default true
   */
  fadeOnSkip: boolean;
};

export default createPlugin<
  unknown,
  unknown,
  {
    config?: FadePlaybackPluginConfig;
    api?: MusicPlayer | null;
    video?: HTMLVideoElement | null;
    fader?: VolumeFader;
    userVolume: number;
    isFading: boolean;
    originalPauseVideo?: () => void;
    playListener?: () => void;
    volumeChangeListener?: () => void;
    skipClickListener?: (event: MouseEvent) => void;
  },
  FadePlaybackPluginConfig
>({
  name: () => t('plugins.fade-playback.name'),
  description: () => t('plugins.fade-playback.description'),
  restartNeeded: false,
  config: {
    enabled: false,
    fadeInDuration: 800,
    fadeOutDuration: 800,
    fadeOnPause: true,
    fadeOnSkip: true,
  },
  menu: async ({ window, getConfig, setConfig }) => {
    const config = await getConfig();

    const promptFadeValues = async (
      win: BrowserWindow,
      options: FadePlaybackPluginConfig,
    ): Promise<
      | Pick<FadePlaybackPluginConfig, 'fadeInDuration' | 'fadeOutDuration'>
      | undefined
    > => {
      const res = await prompt(
        {
          title: t('plugins.fade-playback.prompt.options.title'),
          type: 'multiInput',
          multiInputOptions: [
            {
              label: t(
                'plugins.fade-playback.prompt.options.multi-input.fade-in-duration',
              ),
              value: options.fadeInDuration,
              inputAttrs: {
                type: 'number',
                required: true,
                min: '0',
                step: '50',
              },
            },
            {
              label: t(
                'plugins.fade-playback.prompt.options.multi-input.fade-out-duration',
              ),
              value: options.fadeOutDuration,
              inputAttrs: {
                type: 'number',
                required: true,
                min: '0',
                step: '50',
              },
            },
          ],
          resizable: true,
          height: 280,
          ...promptOptions(),
        },
        win,
      ).catch(console.error);

      if (!res) {
        return undefined;
      }

      return {
        fadeInDuration: Number(res[0]),
        fadeOutDuration: Number(res[1]),
      };
    };

    return [
      {
        label: t('plugins.fade-playback.menu.fade-on-pause'),
        type: 'checkbox',
        checked: config.fadeOnPause,
        async click() {
          const nowConfig = await getConfig();
          setConfig({ fadeOnPause: !nowConfig.fadeOnPause });
        },
      },
      {
        label: t('plugins.fade-playback.menu.fade-on-skip'),
        type: 'checkbox',
        checked: config.fadeOnSkip,
        async click() {
          const nowConfig = await getConfig();
          setConfig({ fadeOnSkip: !nowConfig.fadeOnSkip });
        },
      },
      {
        label: t('plugins.fade-playback.menu.advanced'),
        async click() {
          const newOptions = await promptFadeValues(window, await getConfig());
          if (newOptions) {
            setConfig(newOptions);
          }
        },
      },
    ];
  },

  renderer: {
    userVolume: 1,
    isFading: false,
    async start({ getConfig }) {
      this.config = await getConfig();
    },
    onConfigChange(newConfig) {
      this.config = newConfig;
    },
    onPlayerApiReady(api) {
      this.api = api;

      const video = document.querySelector('video');
      if (!video) {
        return;
      }
      this.video = video;
      this.userVolume = video.volume;
      this.fader = new VolumeFader(video, { fadeScaling: 'linear' });

      // Track the volume the user actually wants, ignoring the dips we cause ourselves.
      this.volumeChangeListener = () => {
        if (!this.isFading) {
          this.userVolume = video.volume;
        }
      };
      video.addEventListener('volumechange', this.volumeChangeListener);

      // Fade in whenever playback (re)starts, whether that's a manual resume
      // or autoplay of the next track after a skip.
      this.playListener = () => {
        if (!this.config?.enabled) {
          return;
        }

        this.isFading = true;
        video.volume = 0;
        this.fader!.setFadeDuration(
          Math.max(1, this.config.fadeInDuration || 0),
        );
        this.fader!.fadeTo(this.userVolume, () => {
          this.isFading = false;
        });
      };
      video.addEventListener('play', this.playListener);

      // Fading out on pause requires delaying the actual pause until the
      // fade completes, since a paused element no longer produces audio.
      this.originalPauseVideo = api.pauseVideo.bind(api);
      api.pauseVideo = () => {
        if (
          !this.config?.enabled ||
          !this.config.fadeOnPause ||
          video.paused ||
          this.isFading
        ) {
          // If a fade (e.g. a pending skip) is already in flight, don't
          // stomp on it and lose its callback - just pause immediately.
          this.originalPauseVideo!();
          return;
        }

        this.isFading = true;
        this.fader!.setFadeDuration(
          Math.max(1, this.config.fadeOutDuration || 0),
        );
        this.fader!.fadeOut(() => {
          this.isFading = false;
          this.originalPauseVideo!();
        });
      };

      // Same idea for skipping tracks via the player bar's next/previous
      // buttons (also used by the media keys / global shortcuts / other plugins).
      this.skipClickListener = (event: MouseEvent) => {
        const button = (event.target as HTMLElement | null)?.closest(
          '.next-button, .previous-button',
        );
        if (!button || !this.config?.enabled || !this.config.fadeOnSkip) {
          return;
        }

        if (this.isFading) {
          // Ignore extra clicks while a fade is already in flight.
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }

        if (video.paused) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        this.isFading = true;
        this.fader!.setFadeDuration(
          Math.max(1, this.config.fadeOutDuration || 0),
        );
        this.fader!.fadeOut(() => {
          this.isFading = false;
          document.removeEventListener('click', this.skipClickListener!, true);
          (button as HTMLElement).click();
          document.addEventListener('click', this.skipClickListener!, true);
        });
      };
      document.addEventListener('click', this.skipClickListener, true);
    },
    stop() {
      if (this.video) {
        if (this.playListener) {
          this.video.removeEventListener('play', this.playListener);
        }
        if (this.volumeChangeListener) {
          this.video.removeEventListener(
            'volumechange',
            this.volumeChangeListener,
          );
        }
        this.video.volume = this.userVolume;
      }
      if (this.skipClickListener) {
        document.removeEventListener('click', this.skipClickListener, true);
      }
      if (this.api && this.originalPauseVideo) {
        this.api.pauseVideo = this.originalPauseVideo;
      }
      this.fader?.stop();
      // fader.stop() abandons any in-flight fade without invoking its
      // callback, so this flag must be reset here or it can get stuck.
      this.isFading = false;
    },
  },
});
