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
    originalPauseVideo?: () => void;
    playListener?: () => void;
    skipClickListener?: (event: MouseEvent) => void;
    timeUpdateListener?: () => void;
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
      this.fader = new VolumeFader(video, { fadeScaling: 'linear' });

      // Fade in whenever playback (re)starts after a fade-out *we* caused
      // (pause, skip, or the track naturally ending) - never on a 'play'
      // we didn't precede, e.g. the very first playback after app launch.
      // Untouched otherwise, so it can never race ahead of the app
      // restoring the user's actual saved volume.
      this.playListener = () => {
        this.endFadeTriggered = false;

        if (!this.config?.enabled || !this.weTriggeredFadeOut) {
          return;
        }
        this.weTriggeredFadeOut = false;

        this.isFading = true;
        const targetVolume = this.volumeBeforeFadeOut;
        video.volume = 0;
        this.fader!.setFadeDuration(
          Math.max(1, this.config.fadeInDuration || 0),
        );
        this.fader!.fadeTo(targetVolume, () => {
          this.isFading = false;
        });
      };
      video.addEventListener('play', this.playListener);

      // Fading out on pause requires delaying the actual pause until the
      // fade completes, since a paused element no longer produces audio.
      // Intercept api.pauseVideo() - the same entry point this app's own
      // IPC/media-key/shortcut paths use (see renderer.ts) - rather than
      // the <video> element's own pause() method. video.pause() is also
      // called internally by the player for reasons that have nothing to
      // do with the user pausing (seeking, buffering, track transitions),
      // and delaying those breaks its own state machine - it was causing
      // glitchy seeks and tracks starting stuck in a paused state.
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
        this.volumeBeforeFadeOut = video.volume;
        this.fader!.setFadeDuration(
          Math.max(1, this.config.fadeOutDuration || 0),
        );
        this.fader!.fadeOut(() => {
          this.isFading = false;
          this.weTriggeredFadeOut = true;
          this.originalPauseVideo!();
        });
      };

      // Same idea for skipping tracks via the player bar's next/previous
      // buttons (also used by the media keys / global shortcuts / other
      // plugins). These buttons live inside a web component's shadow DOM,
      // so a document-level listener sees event.target retargeted to the
      // shadow host - composedPath() is needed to find the real target.
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
        this.volumeBeforeFadeOut = video.volume;
        this.fader!.setFadeDuration(
          Math.max(1, this.config.fadeOutDuration || 0),
        );
        this.fader!.fadeOut(() => {
          this.isFading = false;
          this.weTriggeredFadeOut = true;
          document.removeEventListener('click', this.skipClickListener!, true);
          button.click();
          document.addEventListener('click', this.skipClickListener!, true);
        });
      };
      document.addEventListener('click', this.skipClickListener, true);

      // Fade out proactively as the track nears its natural end too, so an
      // automatic advance to the next track (no button click involved)
      // fades instead of cutting off abruptly.
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
        if (remaining > 0 && remaining <= fadeOutSeconds) {
          this.endFadeTriggered = true;
          this.isFading = true;
          this.volumeBeforeFadeOut = video.volume;
          this.fader!.setFadeDuration(
            Math.max(1, this.config.fadeOutDuration || 0),
          );
          this.fader!.fadeOut(() => {
            this.isFading = false;
            this.weTriggeredFadeOut = true;
          });
        }
      };
      video.addEventListener('timeupdate', this.timeUpdateListener);
    },
    stop() {
      if (this.video) {
        if (this.playListener) {
          this.video.removeEventListener('play', this.playListener);
        }
        if (this.timeUpdateListener) {
          this.video.removeEventListener('timeupdate', this.timeUpdateListener);
        }
        // If a fade was cut off mid-flight, jump back to the volume it
        // started from instead of leaving it stuck at a partial level.
        if (this.isFading) {
          this.video.volume = this.volumeBeforeFadeOut;
        }
      }
      if (this.api && this.originalPauseVideo) {
        this.api.pauseVideo = this.originalPauseVideo;
      }
      if (this.skipClickListener) {
        document.removeEventListener('click', this.skipClickListener, true);
      }
      this.fader?.stop();
      // fader.stop() abandons any in-flight fade without invoking its
      // callback, so this flag must be reset here or it can get stuck.
      this.isFading = false;
    },
  },
});
