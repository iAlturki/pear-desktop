/**
 * VolumeFader
 * Sophisticated Media Volume Fading
 *
 * Requires browser support for:
 * - HTMLMediaElement
 * - requestAnimationFrame()
 * - ES6
 *
 * Does not depend on any third-party library.
 *
 * License: MIT
 *
 * Nick Schwarzenberg
 * v0.2.0, 07/2016
 */

// Internal utility: check if value is a valid volume level and throw if not
const validateVolumeLevel = (value: number) => {
  // Number between 0 and 1?
  if (!Number.isNaN(value) && value >= 0 && value <= 1) {
    // Yup, that's fine
  } else {
    // Abort and throw an exception
    throw new TypeError('Number between 0 and 1 expected as volume!');
  }
};

type VolumeLogger = <Params extends unknown[]>(
  message: string,
  ...args: Params
) => void;
interface VolumeFaderOptions {
  /**
   * logging `function(stuff, …)` for execution information (default: no logging)
   */
  logger?: VolumeLogger;
  /**
   * either 'linear', 'logarithmic' or a positive number in dB (default: logarithmic)
   */
  fadeScaling?: string | number;
  /**
   * media volume 0…1 to apply during setup (volume not touched by default)
   */
  initialVolume?: number;
  /**
   * time in milliseconds to complete a fade (default: 1000 ms)
   */
  fadeDuration?: number;
}

interface VolumeFade {
  volume: {
    start: number;
    end: number;
  };
  time: {
    start: number;
    end: number;
  };
  callback?: () => void;
}

// Main class
export class VolumeFader {
  private readonly media: HTMLMediaElement;
  private readonly logger: VolumeLogger | null;
  private scale: {
    internalToVolume: (level: number) => number;
    volumeToInternal: (level: number) => number;
  };
  private fadeDuration: number = 1000;
  private active: boolean = false;
  private fade: VolumeFade | undefined;
  // Safety net for the rAF starvation bug. requestAnimationFrame does NOT fire
  // while the window is minimised or occluded, so a fade started (or still
  // running) at that moment would never reach its final tick — the one that
  // assigns the target volume and fires the callback. The media element then
  // keeps playing at whatever volume the last tick left, which for a fade-in
  // is the hard `volume = 0` its caller set just before. Result: the track
  // plays, the timeline advances, and there is no audio.
  // setTimeout is throttled in background windows but, unlike rAF, it still
  // fires — so it can always finish what rAF abandoned.
  private watchdog: ReturnType<typeof setTimeout> | undefined;

  /**
   * VolumeFader Constructor
   *
   * @param media {HTMLMediaElement} - audio or video element to be controlled
   * @param options {Object} - an object with optional settings
   * @throws {TypeError} if options.initialVolume or options.fadeDuration are invalid
   *
   */
  constructor(media: HTMLMediaElement, options: VolumeFaderOptions) {
    // Passed media element of correct type?
    if (media instanceof HTMLMediaElement) {
      // Save reference to media element
      this.media = media;
    } else {
      // Abort and throw an exception
      throw new TypeError('Media element expected!');
    }

    // Make sure options is an object
    options = options || {};

    // Log function passed?
    if (typeof options.logger === 'function') {
      // Set log function to the one specified
      this.logger = options.logger;
    } else {
      // Set log function explicitly to false
      this.logger = null;
    }

    // Linear volume fading?
    if (options.fadeScaling === 'linear') {
      // Pass levels unchanged
      this.scale = {
        internalToVolume: (level: number) => level,
        volumeToInternal: (level: number) => level,
      };

      // Log setting
      this.logger?.('Using linear fading.');
    }
    // No linear, but logarithmic fading…
    else {
      let dynamicRange: number;

      // Default dynamic range?
      if (
        options.fadeScaling === undefined ||
        options.fadeScaling === 'logarithmic'
      ) {
        // Set default of 60 dB
        dynamicRange = 3;
      }
      // Custom dynamic range?
      else if (
        typeof options.fadeScaling === 'number' &&
        !Number.isNaN(options.fadeScaling) &&
        options.fadeScaling > 0
      ) {
        // Turn amplitude dB into a multiple of 10 power dB
        dynamicRange = options.fadeScaling / 2 / 10;
      }
      // Unsupported value
      else {
        // Abort and throw exception
        throw new TypeError(
          "Expected 'linear', 'logarithmic' or a positive number as fade scaling preference!",
        );
      }

      // Use exponential/logarithmic scaler for expansion/compression
      this.scale = {
        internalToVolume: (level: number) =>
          this.exponentialScaler(level, dynamicRange),
        volumeToInternal: (level: number) =>
          this.logarithmicScaler(level, dynamicRange),
      };

      // Log setting if not default
      if (options.fadeScaling)
        this.logger?.(
          'Using logarithmic fading with ' +
            String(10 * dynamicRange) +
            ' dB dynamic range.',
        );
    }

    // Set initial volume?
    if (options.initialVolume !== undefined) {
      // Validate volume level and throw if invalid
      validateVolumeLevel(options.initialVolume);

      // Set initial volume
      this.media.volume = options.initialVolume;

      // Log setting
      this.logger?.('Set initial volume to ' + String(this.media.volume) + '.');
    }

    // Fade duration given?
    if (options.fadeDuration === undefined) {
      // Set default fade duration (1000 ms)
      this.fadeDuration = 1000;
    } else {
      // Try to set given fade duration (will log if successful and throw if not)
      this.setFadeDuration(options.fadeDuration);
    }

    // Indicate that fader is not active yet
    this.active = false;

    // Initialization done
    this.logger?.('Initialized for', this.media);
  }

  /**
   * Re(start) the update cycle.
   * (this.active must be truthy for volume updates to take effect)
   *
   * @return {Object} VolumeFader instance for chaining
   */
  start() {
    // Set fader to be active
    this.active = true;

    // Start by running the update method
    this.updateVolume();

    // Return instance for chaining
    return this;
  }

  /**
   * Stop the update cycle.
   * (interrupting any fade)
   *
   * @return {Object} VolumeFader instance for chaining
   */
  stop() {
    // Set fader to be inactive
    this.active = false;

    // Drop the safety net too. stop() means "interrupt this fade", so the
    // watchdog must not fire later and jump the volume to a target the caller
    // has already abandoned.
    this.clearWatchdog();

    // Return instance for chaining
    return this;
  }

  /**
   * Set fade duration.
   * (used for future calls to fadeTo)
   *
   * @param {Number} fadeDuration - fading length in milliseconds
   * @throws {TypeError} if fadeDuration is not a number greater than zero
   * @return {Object} VolumeFader instance for chaining
   */
  setFadeDuration(fadeDuration: number) {
    // If duration is a valid number > 0…
    if (!Number.isNaN(fadeDuration) && fadeDuration > 0) {
      // Set fade duration
      this.fadeDuration = fadeDuration;

      // Log setting
      this.logger?.('Set fade duration to ' + String(fadeDuration) + ' ms.');
    } else {
      // Abort and throw an exception
      throw new TypeError('Positive number expected as fade duration!');
    }

    // Return instance for chaining
    return this;
  }

  /**
   * Define a new fade and start fading.
   *
   * @param {Number} targetVolume - level to fade to in the range 0…1
   * @param {Function} callback - (optional) function to be called when fade is complete
   * @throws {TypeError} if targetVolume is not in the range 0…1
   * @return {Object} VolumeFader instance for chaining
   */
  fadeTo(targetVolume: number, callback?: () => void) {
    // Validate volume and throw if invalid
    validateVolumeLevel(targetVolume);

    // Define new fade
    this.fade = {
      // Volume start and end point on internal fading scale
      volume: {
        start: this.scale.volumeToInternal(this.media.volume),
        end: this.scale.volumeToInternal(targetVolume),
      },
      // Time start and end point
      time: {
        start: Date.now(),
        end: Date.now() + this.fadeDuration,
      },
      // Optional callback function
      callback,
    };

    // Arm the safety net before starting, so it covers even the case where the
    // window is already hidden and rAF never delivers a single tick. The slack
    // keeps it from racing a healthy fade's own final tick; a background
    // setTimeout may fire late, which is fine - late is still finite, and the
    // failure it replaces was permanent.
    this.clearWatchdog();
    this.watchdog = setTimeout(() => {
      this.watchdog = undefined;
      if (this.active && this.fade) {
        this.logger?.('Fade watchdog fired: rAF stalled, completing.');
        this.completeFade();
      }
    }, this.fadeDuration + 250);

    // Start fading
    this.start();

    // Log new fade
    this.logger?.('New fade started:', this.fade);

    // Return instance for chaining
    return this;
  }

  // Convenience shorthand methods for common fades
  fadeIn(callback: () => void) {
    this.fadeTo(1, callback);
  }

  fadeOut(callback: () => void) {
    this.fadeTo(0, callback);
  }

  /**
   * Internal: Update media volume.
   * (calls itself through requestAnimationFrame)
   */
  updateVolume() {
    // Fader active and fade available to process?
    if (this.active && this.fade) {
      // Get current time
      const now = Date.now();

      // Nothing is animating in a window nobody can see, and rAF will not call
      // us again while it is hidden. Land on the target now rather than leave
      // the element stranded at an intermediate volume - silence is a far worse
      // outcome than a skipped ramp.
      if (typeof document !== 'undefined' && document.hidden) {
        this.logger?.('Document hidden mid-fade; completing immediately.');
        this.completeFade();
        return;
      }

      // Time left for fading?
      if (now < this.fade.time.end) {
        // Compute current fade progress
        const progress =
          (now - this.fade.time.start) /
          (this.fade.time.end - this.fade.time.start);

        // Compute current level on internal scale
        const volumeDelta =
          progress * (this.fade.volume.end - this.fade.volume.start);
        const level = volumeDelta + this.fade.volume.start;

        // Map fade level to volume level and apply it to media element
        this.media.volume = this.scale.internalToVolume(level);

        // Schedule next update
        window.requestAnimationFrame(this.updateVolume.bind(this));
      } else {
        // Log end of fade
        this.logger?.('Fade to ' + String(this.fade.volume.end) + ' complete.');

        this.completeFade();
      }
    }
  }

  /**
   * Internal: Land on the fade's target volume and finish.
   *
   * Extracted so that the three paths which must all end the same way share one
   * implementation: the normal final tick, the document-hidden shortcut, and
   * the watchdog that fires when requestAnimationFrame stopped calling us.
   * Every one of them must assign the target volume AND run the callback -
   * skipping either is what leaves playback silent or a caller's `isFading`
   * flag stuck true forever.
   */
  private completeFade() {
    if (!this.fade) return;

    const { callback, volume } = this.fade;

    // Jump to target volume
    this.media.volume = this.scale.internalToVolume(volume.end);

    // Set fader to be inactive and clear the safety net
    this.active = false;
    this.clearWatchdog();

    // Clear fade BEFORE the callback: callers routinely start a new fade from
    // inside it, and clearing afterwards would silently discard that new fade.
    this.fade = undefined;

    // Done, call back (if callable)
    if (typeof callback === 'function') callback();
  }

  private clearWatchdog() {
    if (this.watchdog !== undefined) {
      clearTimeout(this.watchdog);
      this.watchdog = undefined;
    }
  }

  /**
   * Internal: Exponential scaler with dynamic range limit.
   *
   * @param {Number} input - logarithmic input level to be expanded (float, 0…1)
   * @param {Number} dynamicRange - expanded output range, in multiples of 10 dB (float, 0…∞)
   * @return {Number} - expanded level (float, 0…1)
   */
  exponentialScaler(input: number, dynamicRange: number) {
    // Special case: make zero (or any falsy input) return zero
    if (input === 0) {
      // Since the dynamic range is limited,
      // allow a zero to produce a plain zero instead of a small faction
      // (audio would not be recognized as silent otherwise)
      return 0;
    }

    // Scale 0…1 to minus something × 10 dB
    input = (input - 1) * dynamicRange;

    // Compute power of 10
    return 10 ** input;
  }

  /**
   * Internal: Logarithmic scaler with dynamic range limit.
   *
   * @param {Number} input - exponential input level to be compressed (float, 0…1)
   * @param {Number} dynamicRange - coerced input range, in multiples of 10 dB (float, 0…∞)
   * @return {Number} - compressed level (float, 0…1)
   */
  logarithmicScaler(input: number, dynamicRange: number) {
    // Special case: make zero (or any falsy input) return zero
    if (input === 0) {
      // Logarithm of zero would be -∞, which would map to zero anyway
      return 0;
    }

    // Compute base-10 logarithm
    input = Math.log10(input);

    // Scale minus something × 10 dB to 0…1 (clipping at 0)
    const scaledInput = input / dynamicRange;
    return Math.max(1 + scaledInput, 0);
  }
}

export default {
  VolumeFader,
};
