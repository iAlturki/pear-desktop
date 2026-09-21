import prompt from 'custom-electron-prompt';

import { t } from '@/i18n';
import { VolumeFader } from '@/plugins/utils/renderer/volume-fader';
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
    // The volume to fade back to, captured synchronously the instant a
    // fade-out begins (never tracked via a 'volumechange' listener - that
    // races against the fade's own final volume=0 assignment, whose event
    // fires asynchronously after isFading has already reset to false,
    // corrupting the remembered value to 0).
    volumeBeforeFadeOut: number;
    isFading: boolean;
    weTriggeredFadeOut: boolean;
    endFadeTriggered: boolean;
    endPollTimer?: ReturnType<typeof setInterval> | null;
    originalPauseVideo?: () => void;
    originalPlayVideo?: () => void;
    originalNextVideo?: () => void;
    originalPreviousVideo?: () => void;
    playListener?: () => void;
    seekingListener?: () => void;
    skipClickListener?: (event: MouseEvent) => void;
    timeUpdateListener?: () => void;
    videoDataChangeListener?: EventListener;
    startEndPoll: () => void;
    stopEndPoll: () => void;
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
    volumeBeforeFadeOut: 1,
    isFading: false,
    weTriggeredFadeOut: false,
    endFadeTriggered: false,
    endPollTimer: null,

    startEndPoll() {
      if (this.endPollTimer) return;
      this.endPollTimer = setInterval(() => {
        if (
          !this.config?.enabled ||
          !this.config.fadeOnSkip ||
          this.isFading ||
          this.endFadeTriggered ||
          !this.video ||
          this.video.paused ||
          this.video.seeking ||
          !Number.isFinite(this.video.duration)
        ) {
          return;
        }

        const fadeOutSeconds =
          Math.max(1, this.config.fadeOutDuration || 0) / 1000;
        const remaining = this.video.duration - this.video.currentTime;

        if (remaining > 0 && remaining <= fadeOutSeconds) {
          this.stopEndPoll();
          this.endFadeTriggered = true;
          this.isFading = true;
          (this.video as unknown as { __isFading?: boolean }).__isFading = true;
          this.volumeBeforeFadeOut =
            this.video.volume > 0.01
              ? this.video.volume
              : (this.api?.getVolume() ?? 100) / 100;

          const actualDuration = Math.max(
            Math.min(this.config.fadeOutDuration, remaining * 1000),
            50,
          );
          this.fader!.setFadeDuration(actualDuration);
          this.fader!.fadeOut(() => {
            this.isFading = false;
            if (this.video) {
              (this.video as unknown as { __isFading?: boolean }).__isFading =
                false;
              this.video.volume = 0;
            }
            this.weTriggeredFadeOut = true;
          });
        }
      }, 25);
    },

    stopEndPoll() {
      if (this.endPollTimer) {
        clearInterval(this.endPollTimer);
        this.endPollTimer = null;
      }
    },

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
      this.fader = new VolumeFader(video, { fadeScaling: 'equal-power' });

      const getTargetVolume = () => {
        if (this.volumeBeforeFadeOut > 0.01) {
          return this.volumeBeforeFadeOut;
        }
        const current = this.api?.getVolume();
        if (typeof current === 'number' && current > 0) {
          return current / 100;
        }
        return 1;
      };

      // Handle track transition (both autoskip & manual track change)
      this.videoDataChangeListener = ((e: CustomEvent<{ name?: string }>) => {
        const detail = e.detail;
        if (detail?.name === 'dataloaded') {
          this.stopEndPoll();
          this.endFadeTriggered = false;

          if (
            this.config?.enabled &&
            this.config.fadeOnSkip &&
            (this.weTriggeredFadeOut || this.isFading)
          ) {
            this.weTriggeredFadeOut = false;
            this.fader?.stop();
            video.volume = 0;

            const targetVolume = getTargetVolume();

            this.isFading = true;
            (video as unknown as { __isFading?: boolean }).__isFading = true;
            this.fader!.setFadeDuration(
              Math.max(1, this.config.fadeInDuration || 0),
            );
            this.fader!.fadeTo(targetVolume, () => {
              this.isFading = false;
              (video as unknown as { __isFading?: boolean }).__isFading = false;
            });
          }
        }
      }) as EventListener;
      document.addEventListener(
        'videodatachange',
        this.videoDataChangeListener,
      );

      this.seekingListener = () => {
        this.stopEndPoll();
        this.endFadeTriggered = false;
      };
      video.addEventListener('seeking', this.seekingListener);

      // Fade in whenever playback (re)starts after a fade-out *we* caused
      this.playListener = () => {
        this.endFadeTriggered = false;
        this.stopEndPoll();

        if (!this.config?.enabled) {
          return;
        }

        if (this.weTriggeredFadeOut || this.isFading) {
          this.weTriggeredFadeOut = false;
          this.fader?.stop();
          video.volume = 0;

          const targetVolume = getTargetVolume();

          this.isFading = true;
          (video as unknown as { __isFading?: boolean }).__isFading = true;
          this.fader!.setFadeDuration(
            Math.max(1, this.config.fadeInDuration || 0),
          );
          this.fader!.fadeTo(targetVolume, () => {
            this.isFading = false;
            (video as unknown as { __isFading?: boolean }).__isFading = false;
          });
        }
      };
      video.addEventListener('play', this.playListener);

      // Zero volume before resuming so there is never an audible pop before the fade-in starts
      this.originalPlayVideo = api.playVideo.bind(api);
      api.playVideo = () => {
        if (this.config?.enabled && (this.weTriggeredFadeOut || this.isFading)) {
          video.volume = 0;
        }
        this.originalPlayVideo!();
      };

      // Fading out on pause
      this.originalPauseVideo = api.pauseVideo.bind(api);
      api.pauseVideo = () => {
        if (
          !this.config?.enabled ||
          !this.config.fadeOnPause ||
          video.paused ||
          this.isFading
        ) {
          this.originalPauseVideo!();
          return;
        }

        this.isFading = true;
        (video as unknown as { __isFading?: boolean }).__isFading = true;
        this.volumeBeforeFadeOut =
          video.volume > 0.01
            ? video.volume
            : (api.getVolume() || 100) / 100;
        this.fader!.setFadeDuration(
          Math.max(1, this.config.fadeOutDuration || 0),
        );
        this.fader!.fadeOut(() => {
          this.isFading = false;
          (video as unknown as { __isFading?: boolean }).__isFading = false;
          this.weTriggeredFadeOut = true;
          video.volume = 0;
          this.originalPauseVideo!();
        });
      };

      // Smooth next track transition
      this.originalNextVideo = api.nextVideo.bind(api);
      api.nextVideo = () => {
        if (
          !this.config?.enabled ||
          !this.config.fadeOnSkip ||
          video.paused ||
          this.isFading ||
          this.weTriggeredFadeOut
        ) {
          this.originalNextVideo!();
          return;
        }

        this.isFading = true;
        (video as unknown as { __isFading?: boolean }).__isFading = true;
        this.volumeBeforeFadeOut =
          video.volume > 0.01
            ? video.volume
            : (api.getVolume() || 100) / 100;
        this.fader!.setFadeDuration(
          Math.max(1, this.config.fadeOutDuration || 0),
        );
        this.fader!.fadeOut(() => {
          this.isFading = false;
          (video as unknown as { __isFading?: boolean }).__isFading = false;
          this.weTriggeredFadeOut = true;
          video.volume = 0;
          this.originalNextVideo!();
        });
      };

      // Smooth previous track transition
      this.originalPreviousVideo = api.previousVideo.bind(api);
      api.previousVideo = () => {
        if (
          !this.config?.enabled ||
          !this.config.fadeOnSkip ||
          video.paused ||
          this.isFading ||
          this.weTriggeredFadeOut
        ) {
          this.originalPreviousVideo!();
          return;
        }

        this.isFading = true;
        (video as unknown as { __isFading?: boolean }).__isFading = true;
        this.volumeBeforeFadeOut =
          video.volume > 0.01
            ? video.volume
            : (api.getVolume() || 100) / 100;
        this.fader!.setFadeDuration(
          Math.max(1, this.config.fadeOutDuration || 0),
        );
        this.fader!.fadeOut(() => {
          this.isFading = false;
          (video as unknown as { __isFading?: boolean }).__isFading = false;
          this.weTriggeredFadeOut = true;
          video.volume = 0;
          this.originalPreviousVideo!();
        });
      };

      // Skipping tracks via the player bar's next/previous buttons
      this.skipClickListener = (event: MouseEvent) => {
        const button = event
          .composedPath()
          .find(
            (el): el is HTMLElement =>
              el instanceof HTMLElement &&
              el.matches('.next-button, .previous-button'),
          );
        if (!button || !this.config?.enabled || !this.config.fadeOnSkip) {
          return;
        }

        if (this.isFading || this.weTriggeredFadeOut) {
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
        (video as unknown as { __isFading?: boolean }).__isFading = true;
        this.volumeBeforeFadeOut =
          video.volume > 0.01
            ? video.volume
            : (api.getVolume() || 100) / 100;
        this.fader!.setFadeDuration(
          Math.max(1, this.config.fadeOutDuration || 0),
        );
        this.fader!.fadeOut(() => {
          this.isFading = false;
          (video as unknown as { __isFading?: boolean }).__isFading = false;
          this.weTriggeredFadeOut = true;
          video.volume = 0;
          document.removeEventListener('click', this.skipClickListener!, true);
          button.click();
          document.addEventListener('click', this.skipClickListener!, true);
        });
      };
      document.addEventListener('click', this.skipClickListener, true);

      // Timeupdate monitor: kicks off high-resolution polling when nearing track end
      this.timeUpdateListener = () => {
        if (
          !this.config?.enabled ||
          !this.config.fadeOnSkip ||
          this.isFading ||
          this.endFadeTriggered ||
          video.seeking ||
          !Number.isFinite(video.duration)
        ) {
          return;
        }

        const fadeOutSeconds =
          Math.max(1, this.config.fadeOutDuration || 0) / 1000;
        const remaining = video.duration - video.currentTime;
        if (remaining > 0 && remaining <= Math.max(fadeOutSeconds * 3, 2.0)) {
          this.startEndPoll();
        }
      };
      video.addEventListener('timeupdate', this.timeUpdateListener);
    },
    stop() {
      this.stopEndPoll();
      if (this.video) {
        (this.video as unknown as { __isFading?: boolean }).__isFading = false;
        if (this.playListener) {
          this.video.removeEventListener('play', this.playListener);
        }
        if (this.seekingListener) {
          this.video.removeEventListener('seeking', this.seekingListener);
        }
        if (this.timeUpdateListener) {
          this.video.removeEventListener('timeupdate', this.timeUpdateListener);
        }
        if (this.isFading) {
          this.video.volume = this.volumeBeforeFadeOut;
        }
      }
      if (this.videoDataChangeListener) {
        document.removeEventListener(
          'videodatachange',
          this.videoDataChangeListener,
        );
      }
      if (this.api) {
        if (this.originalPauseVideo) {
          this.api.pauseVideo = this.originalPauseVideo;
        }
        if (this.originalPlayVideo) {
          this.api.playVideo = this.originalPlayVideo;
        }
        if (this.originalNextVideo) {
          this.api.nextVideo = this.originalNextVideo;
        }
        if (this.originalPreviousVideo) {
          this.api.previousVideo = this.originalPreviousVideo;
        }
      }
      if (this.skipClickListener) {
        document.removeEventListener('click', this.skipClickListener, true);
      }
      this.fader?.stop();
      this.isFading = false;
    },
  },
});
