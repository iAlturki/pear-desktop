import { t } from '@/i18n';
import { createPlugin } from '@/utils';

export type AdSkipPluginConfig = {
  enabled: boolean;
  /**
   * Mute audio for the duration of an ad that has no skip button (or
   * before its skip button becomes available).
   *
   * @default true
   */
  muteDuringAds: boolean;
};

// These aren't guaranteed to be stable across YouTube Music versions (there's
// no documented API for this), so the detection below also falls back to a
// generic text/aria-label match for "skip" and "ad-showing"-style classes.
const SKIP_BUTTON_SELECTORS = [
  '.ytp-ad-skip-button-modern',
  '.ytp-ad-skip-button',
  '.ytp-skip-ad-button',
  'button.videoAdUiSkipButton',
  '[class*="skip-button" i]',
  '[id*="skip-button" i]',
].join(', ');

const AD_SHOWING_SELECTOR = [
  '.ad-showing',
  '.ad-interrupting',
  '.video-ads',
  '.ytp-ad-player-overlay',
].join(', ');

const isVisible = (el: Element): el is HTMLElement =>
  el instanceof HTMLElement &&
  el.offsetParent !== null &&
  !el.hasAttribute('disabled');

const findSkipButton = (root: ParentNode): HTMLElement | undefined => {
  for (const el of root.querySelectorAll<HTMLElement>(SKIP_BUTTON_SELECTORS)) {
    if (isVisible(el)) return el;
  }

  // Fallback: any visible button-like element whose text/aria-label
  // mentions "skip" (covers markup changes the selectors above don't).
  for (const el of root.querySelectorAll<HTMLElement>(
    'button, [role="button"]',
  )) {
    if (!isVisible(el)) continue;
    const label = `${el.textContent ?? ''} ${el.getAttribute('aria-label') ?? ''}`;
    if (/skip/i.test(label)) return el;
  }

  return undefined;
};

const isAdShowing = (playerRoot: Element, video: HTMLVideoElement) =>
  playerRoot.matches(AD_SHOWING_SELECTOR) ||
  playerRoot.querySelector(AD_SHOWING_SELECTOR) !== null ||
  video.classList.contains('ad-showing');

export default createPlugin<
  unknown,
  unknown,
  {
    config?: AdSkipPluginConfig;
    observer?: MutationObserver;
    pollInterval?: NodeJS.Timeout;
    wasMutedByPlugin: boolean;
    userWasMuted: boolean;
  },
  AdSkipPluginConfig
>({
  name: () => t('plugins.ad-skip.name'),
  description: () => t('plugins.ad-skip.description'),
  restartNeeded: false,
  config: {
    enabled: true,
    muteDuringAds: true,
  },
  menu: async ({ getConfig, setConfig }) => {
    const config = await getConfig();

    return [
      {
        label: t('plugins.ad-skip.menu.mute-during-ads'),
        type: 'checkbox',
        checked: config.muteDuringAds,
        click(item) {
          setConfig({ muteDuringAds: item.checked });
        },
      },
    ];
  },
  renderer: {
    wasMutedByPlugin: false,
    userWasMuted: false,
    async start({ getConfig }) {
      this.config = await getConfig();
    },
    onConfigChange(newConfig) {
      this.config = newConfig;
    },
    onPlayerApiReady() {
      const player =
        document.querySelector<HTMLElement>('ytmusic-player') ??
        document.querySelector<HTMLElement>('#player');
      const video = document.querySelector<HTMLVideoElement>('video');
      if (!player || !video) return;

      const check = () => {
        if (!this.config?.enabled) return;

        const skipButton = findSkipButton(player);
        if (skipButton) {
          console.log('[AdSkip] Clicking skip button', skipButton);
          skipButton.click();
        }

        const adShowing = isAdShowing(player, video);
        if (adShowing && this.config.muteDuringAds) {
          if (!this.wasMutedByPlugin) {
            this.userWasMuted = video.muted;
            if (!video.muted) {
              console.log('[AdSkip] Muting for unskippable ad');
              video.muted = true;
            }
            this.wasMutedByPlugin = true;
          }
        } else if (this.wasMutedByPlugin) {
          if (!this.userWasMuted) {
            console.log('[AdSkip] Ad over, restoring volume');
            video.muted = false;
          }
          this.wasMutedByPlugin = false;
        }
      };

      this.observer = new MutationObserver(check);
      this.observer.observe(player, {
        attributes: true,
        attributeFilter: ['class'],
        childList: true,
        subtree: true,
      });

      // Mutations alone can miss an already-present skip button (e.g. it
      // becomes clickable a few seconds after appearing), so also poll.
      this.pollInterval = setInterval(check, 500);

      check();
    },
    stop() {
      this.observer?.disconnect();
      this.observer = undefined;
      if (this.pollInterval) {
        clearInterval(this.pollInterval);
        this.pollInterval = undefined;
      }

      if (this.wasMutedByPlugin && !this.userWasMuted) {
        const video = document.querySelector<HTMLVideoElement>('video');
        if (video) video.muted = false;
      }
      this.wasMutedByPlugin = false;
    },
  },
});
