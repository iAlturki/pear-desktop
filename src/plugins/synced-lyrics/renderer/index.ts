import { createRenderer } from '@/utils';
import { waitForElement } from '@/utils/wait-for-element';

import { disposeReactiveRoot } from './reactive-root';
import { setConfig, setCurrentTime } from './renderer';
import { fetchLyrics } from './store';
import { selectors, tabStates } from './utils';

import type { SyncedLyricsPluginConfig } from '../types';
import type { SongInfo } from '@/providers/song-info';
import type { RendererContext } from '@/types/contexts';
import type { MusicPlayer } from '@/types/music-player';

export let _ytAPI: MusicPlayer | null = null;
export let netFetch: (
  url: string,
  init?: RequestInit,
) => Promise<[number, string, Record<string, string>]>;

export const renderer = createRenderer<
  {
    observerCallback: MutationCallback;
    observer?: MutationObserver;
    videoDataChange: () => Promise<void>;
    updateTimestampFrame?: number;
  },
  SyncedLyricsPluginConfig
>({
  onConfigChange(newConfig) {
    setConfig(newConfig);
  },

  observerCallback(mutations: MutationRecord[]) {
    for (const mutation of mutations) {
      const header = mutation.target as HTMLElement;

      switch (mutation.attributeName) {
        case 'disabled':
          header.removeAttribute('disabled');
          break;
        case 'aria-selected':
          tabStates[header.ariaSelected ?? 'false']();
          break;
      }
    }
  },

  async onPlayerApiReady(api: MusicPlayer) {
    _ytAPI = api;

    api.addEventListener('videodatachange', this.videoDataChange);

    await this.videoDataChange();
  },
  async videoDataChange() {
    if (this.updateTimestampFrame === undefined) {
      // requestAnimationFrame instead of a fixed setInterval poll: ties the
      // word-highlight clock to the actual screen refresh (~16ms) instead
      // of a 100ms tick, which was adding up to 100ms of extra lag on top
      // of the CSS transition before a word was even told to light up. It
      // also auto-pauses while the window is hidden, unlike setInterval.
      const tick = () => {
        setCurrentTime((_ytAPI?.getCurrentTime() ?? 0) * 1000);
        this.updateTimestampFrame = requestAnimationFrame(tick);
      };
      this.updateTimestampFrame = requestAnimationFrame(tick);
    }

    // prettier-ignore
    this.observer ??= new MutationObserver(this.observerCallback);
    this.observer.disconnect();

    // Force the lyrics tab to be enabled at all times.
    const header = await waitForElement<HTMLElement>(selectors.head);
    {
      header.removeAttribute('disabled');
      tabStates[header.ariaSelected ?? 'false']();
    }

    this.observer.observe(header, { attributes: true });
    header.removeAttribute('disabled');
  },

  async start(ctx: RendererContext<SyncedLyricsPluginConfig>) {
    netFetch = ctx.ipc.invoke.bind(ctx.ipc, 'synced-lyrics:fetch');

    setConfig(await ctx.getConfig());

    ctx.ipc.on('peard:update-song-info', (info: SongInfo) => {
      fetchLyrics(info);
    });
  },

  stop(ctx: RendererContext<SyncedLyricsPluginConfig>) {
    ctx.ipc.removeAllListeners('peard:update-song-info');

    if (_ytAPI) {
      _ytAPI.removeEventListener('videodatachange', this.videoDataChange);
      _ytAPI = null;
    }

    this.observer?.disconnect();

    if (this.updateTimestampFrame !== undefined) {
      cancelAnimationFrame(this.updateTimestampFrame);
      this.updateTimestampFrame = undefined;
    }

    disposeReactiveRoot();
  },
});
