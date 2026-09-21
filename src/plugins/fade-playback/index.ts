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
    originalVideoPause?: () => void;
    originalVideoPlay?: () => Promise<void>;
    playListener?: () => void;
    seekingListener?: () => void;
    skipClickListener?: (event: MouseEvent) => void;
    playPauseClickListener?: (event: MouseEvent) => void;
    spaceKeyDownListener?: (event: KeyboardEvent) => void;
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

        const fadeOutDuration = Math.max(500, this.config.fadeOutDuration || 800);
        const fadeOutSeconds = fadeOutDuration / 1000;
        const remaining = this.video.duration - this.video.currentTime;

        if (remaining > 0 && remaining <= fadeOutSeconds) {
          this.stopEndPoll();
          this.endFadeTriggered = true;
          this.isFading = true;
          (this.video as unknown as { __isFading?: boolean }).__isFading = true;
          (window as unknown as { __isAudioFading?: boolean }).__isAudioFading = true;
          this.volumeBeforeFadeOut =
            this.video.volume > 0.01
              ? this.video.volume
              : (this.api?.getVolume() ?? 100) / 100;

          const actualDuration = Math.max(
            Math.min(fadeOutDuration, remaining * 1000),
            100,
          );
          this.fader!.setFadeDuration(actualDuration);
          this.fader!.fadeOut(() => {
            this.isFading = false;
            if (this.video) {
              (this.video as unknown as { __isFading?: boolean }).__isFading =
                false;
              (window as unknown as { __isAudioFading?: boolean }).__isAudioFading =
                false;
              this.video.volume = 0;
            }
            this.weTriggeredFadeOut = true;
          });
        }
      }, 20);
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

      // 1. Intercept video.pause for seamless fade out from any caller (Spacebar, UI, Media Keys)
      const origVideoPause = video.pause.bind(video);
      this.originalVideoPause = origVideoPause;
      let isInternalPause = false;

      video.pause = () => {
        if (
          isInternalPause ||
          !this.config?.enabled ||
          !this.config.fadeOnPause ||
          video.paused ||
          this.isFading
        ) {
          origVideoPause();
          return;
        }

        this.isFading = true;
        (video as unknown as { __isFading?: boolean }).__isFading = true;
        (window as unknown as { __isAudioFading?: boolean }).__isAudioFading = true;
        this.volumeBeforeFadeOut =
          video.volume > 0.01
            ? video.volume
            : (this.api?.getVolume() ?? 100) / 100;

        const duration = Math.max(400, this.config.fadeOutDuration || 800);
        this.fader!.setFadeDuration(duration);
        this.fader!.fadeOut(() => {
          isInternalPause = true;
          origVideoPause();
          isInternalPause = false;
          this.isFading = false;
          (video as unknown as { __isFading?: boolean }).__isFading = false;
          (window as unknown as { __isAudioFading?: boolean }).__isAudioFading =
            false;
          this.weTriggeredFadeOut = true;
          video.volume = 0;
        });
      };

      // 2. Intercept video.play so audio starts silent before the fade-in ramps up
      const origVideoPlay = video.play.bind(video);
      this.originalVideoPlay = origVideoPlay;
      video.play = async () => {
        if (this.config?.enabled) {
          video.volume = 0;
        }
        return origVideoPlay();
      };

      // 3. Play event: Always smoothly fade in on playback start or resume
      this.playListener = () => {
        this.endFadeTriggered = false;
        this.stopEndPoll();

        if (!this.config?.enabled) {
          return;
        }

        this.fader?.stop();
        video.volume = 0;

        const targetVolume = getTargetVolume();
        const duration = Math.max(400, this.config.fadeInDuration || 800);

        this.isFading = true;
        (video as unknown as { __isFading?: boolean }).__isFading = true;
        (window as unknown as { __isAudioFading?: boolean }).__isAudioFading = true;

        this.fader!.setFadeDuration(duration);
        this.fader!.fadeTo(targetVolume, () => {
          this.isFading = false;
          (video as unknown as { __isFading?: boolean }).__isFading = false;
          (window as unknown as { __isAudioFading?: boolean }).__isAudioFading =
            false;
        });
      };
      video.addEventListener('play', this.playListener);

      // 4. Capture click on play/pause button to trigger fade out before pausing
      this.playPauseClickListener = (event: MouseEvent) => {
        if (
          !this.config?.enabled ||
          !this.config.fadeOnPause ||
          video.paused ||
          this.isFading
        ) {
          return;
        }
        const path = event.composedPath();
        const isPlayPause = path.some(
          (el) =>
            el instanceof HTMLElement &&
            (el.id === 'play-pause-button' ||
              el.matches?.(
                '#play-pause-button, .play-pause-button, [aria-label*="Pause"]',
              ) ||
              Boolean(el.closest?.('#play-pause-button, .play-pause-button'))),
        );
        if (isPlayPause) {
          event.preventDefault();
          event.stopImmediatePropagation();
          video.pause();
        }
      };
      document.addEventListener('click', this.playPauseClickListener, true);

      // 5. Intercept spacebar to smoothly fade out when pausing
      this.spaceKeyDownListener = (event: KeyboardEvent) => {
        if (
          !this.config?.enabled ||
          !this.config.fadeOnPause ||
          video.paused ||
          this.isFading
        ) {
          return;
        }
        if (event.code === 'Space' || event.key === ' ' || event.key === 'k') {
          const activeEl = document.activeElement;
          const isInput =
            activeEl instanceof HTMLInputElement ||
            activeEl instanceof HTMLTextAreaElement ||
            activeEl?.getAttribute('contenteditable') === 'true';
          if (!isInput) {
            event.preventDefault();
            event.stopImmediatePropagation();
            video.pause();
          }
        }
      };
      window.addEventListener('keydown', this.spaceKeyDownListener, true);

      // 6. Handle track transition (both autoskip & manual track change)
      this.videoDataChangeListener = ((e: CustomEvent<{ name?: string }>) => {
        const detail = e.detail;
        if (detail?.name === 'dataloaded') {
          this.stopEndPoll();
          this.endFadeTriggered = false;

          if (this.config?.enabled && this.config.fadeOnSkip) {
            video.volume = 0;
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

      // 7. API hooks for external callers
      this.originalPlayVideo = api.playVideo.bind(api);
      api.playVideo = () => {
        if (this.config?.enabled) {
          video.volume = 0;
        }
        this.originalPlayVideo!();
      };

      this.originalPauseVideo = api.pauseVideo.bind(api);
      api.pauseVideo = () => {
        video.pause();
      };

      this.originalNextVideo = api.nextVideo.bind(api);
      api.nextVideo = () => {
        if (
          !this.config?.enabled ||
          !this.config.fadeOnSkip ||
          video.paused ||
          this.isFading
        ) {
          this.originalNextVideo!();
          return;
        }

        this.isFading = true;
        (video as unknown as { __isFading?: boolean }).__isFading = true;
        (window as unknown as { __isAudioFading?: boolean }).__isAudioFading = true;
        this.volumeBeforeFadeOut =
          video.volume > 0.01
            ? video.volume
            : (api.getVolume() || 100) / 100;
        const duration = Math.max(
          300,
          Math.min(this.config.fadeOutDuration || 800, 600),
        );
        this.fader!.setFadeDuration(duration);
        this.fader!.fadeOut(() => {
          this.isFading = false;
          (video as unknown as { __isFading?: boolean }).__isFading = false;
          (window as unknown as { __isAudioFading?: boolean }).__isAudioFading =
            false;
          this.weTriggeredFadeOut = true;
          video.volume = 0;
          this.originalNextVideo!();
        });
      };

      this.originalPreviousVideo = api.previousVideo.bind(api);
      api.previousVideo = () => {
        if (
          !this.config?.enabled ||
          !this.config.fadeOnSkip ||
          video.paused ||
          this.isFading
        ) {
          this.originalPreviousVideo!();
          return;
        }

        this.isFading = true;
        (video as unknown as { __isFading?: boolean }).__isFading = true;
        (window as unknown as { __isAudioFading?: boolean }).__isAudioFading = true;
        this.volumeBeforeFadeOut =
          video.volume > 0.01
            ? video.volume
            : (api.getVolume() || 100) / 100;
        const duration = Math.max(
          300,
          Math.min(this.config.fadeOutDuration || 800, 600),
        );
        this.fader!.setFadeDuration(duration);
        this.fader!.fadeOut(() => {
          this.isFading = false;
          (video as unknown as { __isFading?: boolean }).__isFading = false;
          (window as unknown as { __isAudioFading?: boolean }).__isAudioFading =
            false;
          this.weTriggeredFadeOut = true;
          video.volume = 0;
          this.originalPreviousVideo!();
        });
      };

      // 8. Skipping tracks via player bar buttons
      this.skipClickListener = (event: MouseEvent) => {
        const button = event
          .composedPath()
          .find(
            (el): el is HTMLElement =>
              el instanceof HTMLElement &&
              (el.matches?.(
                '.next-button, .previous-button, #next-button, #previous-button, [aria-label*="Next"], [aria-label*="Previous"]',
              ) ||
                Boolean(
                  el.closest?.(
                    '.next-button, .previous-button, #next-button, #previous-button',
                  ),
                )),
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
        (window as unknown as { __isAudioFading?: boolean }).__isAudioFading = true;
        this.volumeBeforeFadeOut =
          video.volume > 0.01
            ? video.volume
            : (api.getVolume() || 100) / 100;
        const duration = Math.max(
          300,
          Math.min(this.config.fadeOutDuration || 800, 600),
        );
        this.fader!.setFadeDuration(duration);
        this.fader!.fadeOut(() => {
          this.isFading = false;
          (video as unknown as { __isFading?: boolean }).__isFading = false;
          (window as unknown as { __isAudioFading?: boolean }).__isAudioFading =
            false;
          this.weTriggeredFadeOut = true;
          video.volume = 0;
          document.removeEventListener('click', this.skipClickListener!, true);
          button.click();
          document.addEventListener('click', this.skipClickListener!, true);
        });
      };
      document.addEventListener('click', this.skipClickListener, true);

      // 9. Timeupdate monitor for smooth autoskip fading near track end
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

        const fadeOutDuration = Math.max(500, this.config.fadeOutDuration || 800);
        const fadeOutSeconds = fadeOutDuration / 1000;
        const remaining = video.duration - video.currentTime;
        if (remaining > 0 && remaining <= Math.max(fadeOutSeconds * 2.5, 2.5)) {
          this.startEndPoll();
        }
      };
      video.addEventListener('timeupdate', this.timeUpdateListener);
    },
    stop() {
      this.stopEndPoll();
      if (this.video) {
        (this.video as unknown as { __isFading?: boolean }).__isFading = false;
        (window as unknown as { __isAudioFading?: boolean }).__isAudioFading = false;
        if (this.originalVideoPause) {
          this.video.pause = this.originalVideoPause;
        }
        if (this.originalVideoPlay) {
          this.video.play = this.originalVideoPlay;
        }
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
      if (this.playPauseClickListener) {
        document.removeEventListener('click', this.playPauseClickListener, true);
      }
      if (this.spaceKeyDownListener) {
        window.removeEventListener('keydown', this.spaceKeyDownListener, true);
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
