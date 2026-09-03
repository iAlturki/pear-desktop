import { createEffect, For, Show, createSignal, createMemo } from 'solid-js';
import { type VirtualizerHandle } from 'virtua/solid';

import { type LineLyrics } from '@/plugins/synced-lyrics/types';

import { _ytAPI } from '..';
import { config, currentTime } from '../renderer';
import {
  canonicalize,
  convertChineseCharacter,
  romanize,
  simplifyUnicode,
} from '../utils';

interface SyncedLineProps {
  scroller: VirtualizerHandle;
  index: number;

  line: LineLyrics;
  status: 'upcoming' | 'current' | 'previous';
}

// No lyrics provider (LRCLib, MusixMatch, LyricsGenius, Megalobiz, YTMusic)
// gives per-word timestamps - only one timestamp + duration for the whole
// line - so there's no way to know exactly when each word is sung. This
// estimates each word's start offset within the line proportionally by
// character length (longer words are assumed to take longer to sing),
// which tracks a line's actual pace far better than a fixed per-word delay.
const computeWordStartOffsets = (
  words: string[],
  lineDurationMs: number,
): number[] => {
  const weights = words.map((word) => Math.max(1, word.length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;

  let cumulativeWeight = 0;
  return weights.map((weight) => {
    const offset = (cumulativeWeight / totalWeight) * lineDurationMs;
    cumulativeWeight += weight;
    return offset;
  });
};

const EmptyLine = (props: SyncedLineProps) => {
  const states = createMemo(() => {
    const defaultText = config()?.defaultTextString ?? '';
    return Array.isArray(defaultText) ? defaultText : [defaultText];
  });

  const index = createMemo(() => {
    const progress = currentTime() - props.line.timeInMs;
    const total = props.line.duration;

    const percentage = Math.min(1, progress / total);
    return Math.max(0, Math.floor((states().length - 1) * percentage));
  });

  return (
    <div
      class={`synced-line ${props.status}`}
      onClick={() => {
        _ytAPI?.seekTo((props.line.timeInMs + 10) / 1000);
      }}
    >
      <div class="description ytmusic-description-shelf-renderer" dir="auto">
        <yt-formatted-string
          text={{
            runs: [
              {
                text: config()?.showTimeCodes ? `[${props.line.time}] ` : '',
              },
            ],
          }}
        />

        <div class="text-lyrics">
          <span>
            <span>
              <Show
                fallback={
                  <yt-formatted-string
                    text={{ runs: [{ text: states()[0] }] }}
                  />
                }
                when={states().length > 1}
              >
                <yt-formatted-string
                  text={{
                    runs: [
                      {
                        text: states().at(
                          props.status === 'current' ? index() : -1,
                        )!,
                      },
                    ],
                  }}
                />
              </Show>
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};

export const SyncedLine = (props: SyncedLineProps) => {
  const text = createMemo(() => {
    let line = props.line.text;
    const convertChineseText = config()?.convertChineseCharacter;
    if (convertChineseText && convertChineseText !== 'disabled') {
      line = convertChineseCharacter(line, convertChineseText);
    }
    return line.trim();
  });

  const [romanization, setRomanization] = createSignal('');
  createEffect(() => {
    const input = canonicalize(text());
    if (!config()?.romanization) return;

    romanize(input).then((result) => {
      setRomanization(canonicalize(result));
    });
  });

  // How many words (from the start) should currently be lit up, based on
  // actual elapsed playback time within the line - not a fixed animation
  // timeline, so it stays correct through seeking/pausing and reflects the
  // line's real pace instead of a uniform per-word delay.
  const words = createMemo(() => text().split(' '));
  const wordOffsets = createMemo(() =>
    computeWordStartOffsets(words(), props.line.duration),
  );
  const activeWordCount = createMemo(() => {
    if (props.status === 'previous') return words().length;
    if (props.status !== 'current') return 0;

    const elapsed = currentTime() - props.line.timeInMs;
    const offsets = wordOffsets();
    let count = 0;
    for (const offset of offsets) {
      if (elapsed < offset) break;
      count++;
    }
    return count;
  });

  const romanizationWords = createMemo(() => romanization().split(' '));
  const romanizationOffsets = createMemo(() =>
    computeWordStartOffsets(romanizationWords(), props.line.duration),
  );
  const activeRomanizationWordCount = createMemo(() => {
    if (props.status === 'previous') return romanizationWords().length;
    if (props.status !== 'current') return 0;

    const elapsed = currentTime() - props.line.timeInMs;
    const offsets = romanizationOffsets();
    let count = 0;
    for (const offset of offsets) {
      if (elapsed < offset) break;
      count++;
    }
    return count;
  });

  return (
    <Show fallback={<EmptyLine {...props} />} when={text()}>
      <div
        class={`synced-line ${props.status}`}
        onClick={() => {
          _ytAPI?.seekTo((props.line.timeInMs + 10) / 1000);
        }}
      >
        <div class="description ytmusic-description-shelf-renderer" dir="auto">
          <yt-formatted-string
            text={{
              runs: [
                {
                  text: config()?.showTimeCodes ? `[${props.line.time}] ` : '',
                },
              ],
            }}
          />

          <div
            class="text-lyrics"
            ref={(div: HTMLDivElement) => {
              div.style.setProperty(
                '--lyrics-duration',
                `${props.line.duration / 1000}s`,
                'important',
              );
            }}
            style={{ 'display': 'flex', 'flex-direction': 'column' }}
          >
            <span>
              <For each={words()}>
                {(word, index) => {
                  return (
                    <span
                      classList={{ 'word-active': index() < activeWordCount() }}
                    >
                      <yt-formatted-string
                        text={{
                          runs: [{ text: `${word} ` }],
                        }}
                      />
                    </span>
                  );
                }}
              </For>
            </span>

            <Show
              when={
                config()?.romanization &&
                simplifyUnicode(text()) !== simplifyUnicode(romanization())
              }
            >
              <span class="romaji">
                <For each={romanizationWords()}>
                  {(word, index) => {
                    return (
                      <span
                        classList={{
                          'word-active':
                            index() < activeRomanizationWordCount(),
                        }}
                      >
                        <yt-formatted-string
                          text={{
                            runs: [{ text: `${word} ` }],
                          }}
                        />
                      </span>
                    );
                  }}
                </For>
              </span>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
};
