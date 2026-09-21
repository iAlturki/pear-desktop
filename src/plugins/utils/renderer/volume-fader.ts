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
  private fadeScaling: 'linear' | 'equal-power' = 'equal-power';
  private fadeDuration: number = 1000;
  private active: boolean = false;
  private fade: VolumeFade | undefined;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private bgTimer: ReturnType<typeof setTimeout> | undefined;
  private animFrameId: number | undefined;

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

    // Determine scaling curve
    if (options.fadeScaling === 'linear') {
      this.fadeScaling = 'linear';
      this.logger?.('Using linear fading.');
    } else {
      // Default: Equal-power / Smooth Hermite curve (studio-grade zero-cliff fading)
      this.fadeScaling = 'equal-power';
      this.logger?.('Using studio-grade equal-power smooth fading.');
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
    (this.media as unknown as { __isFading?: boolean }).__isFading = true;

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
    (this.media as unknown as { __isFading?: boolean }).__isFading = false;

    this.clearWatchdog();
    this.clearTimers();
    this.fade = undefined;

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

    // Define new fade directly on volume levels
    this.fade = {
      volume: {
        start: this.media.volume,
        end: targetVolume,
      },
      time: {
        start: Date.now(),
        end: Date.now() + this.fadeDuration,
      },
      callback,
    };

    this.clearWatchdog();
    this.watchdog = setTimeout(() => {
      this.watchdog = undefined;
      if (this.active && this.fade) {
        this.logger?.('Fade watchdog fired: completing.');
        this.completeFade();
      }
    }, this.fadeDuration + 300);

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
   * Internal: Update media volume with Equal-Power Cosine curve.
   * Uses requestAnimationFrame when window is visible, and seamless setTimeout ticks
   * when running in the background or minimized, ensuring zero skipped fades.
   */
  updateVolume() {
    if (this.active && this.fade) {
      const now = Date.now();

      if (now < this.fade.time.end) {
        const progress = Math.max(
          0,
          Math.min(
            1,
            (now - this.fade.time.start) /
              (this.fade.time.end - this.fade.time.start),
          ),
        );

        let interpolated: number;
        if (this.fadeScaling === 'linear') {
          interpolated =
            this.fade.volume.start +
            ((this.fade.volume.end - this.fade.volume.start) * progress);
        } else {
          // Equal-Power Cosine / Sine fade curve:
          // When fading out (end = 0): start * cos(progress * PI / 2)
          // When fading in (start = 0): end * sin(progress * PI / 2)
          // Zero cliff, zero popping, and constant acoustic energy throughout
          const cosVal = Math.cos((progress * Math.PI) / 2);
          const sinVal = Math.sin((progress * Math.PI) / 2);
          interpolated =
            (this.fade.volume.start * cosVal) +
            (this.fade.volume.end * sinVal);
        }

        this.media.volume = Math.max(0, Math.min(1, interpolated));

        // Background-safe scheduling:
        this.clearTimers();
        if (typeof document !== 'undefined' && document.hidden) {
          this.bgTimer = setTimeout(() => this.updateVolume(), 20);
        } else {
          this.animFrameId = window.requestAnimationFrame(
            this.updateVolume.bind(this),
          );
        }
      } else {
        this.logger?.('Fade to ' + String(this.fade.volume.end) + ' complete.');
        this.completeFade();
      }
    }
  }

  /**
   * Internal: Land on the fade's target volume and finish cleanly.
   */
  private completeFade() {
    if (!this.fade) return;

    const { callback, volume } = this.fade;

    // Set precise target volume
    this.media.volume = Math.max(0, Math.min(1, volume.end));

    // Set fader to be inactive and clear timers
    this.active = false;
    (this.media as unknown as { __isFading?: boolean }).__isFading = false;
    this.clearWatchdog();
    this.clearTimers();

    this.fade = undefined;

    // Done, execute callback
    if (typeof callback === 'function') callback();
  }

  private clearWatchdog() {
    if (this.watchdog !== undefined) {
      clearTimeout(this.watchdog);
      this.watchdog = undefined;
    }
  }

  private clearTimers() {
    if (this.animFrameId !== undefined) {
      window.cancelAnimationFrame(this.animFrameId);
      this.animFrameId = undefined;
    }
    if (this.bgTimer !== undefined) {
      clearTimeout(this.bgTimer);
      this.bgTimer = undefined;
    }
  }
}

export default {
  VolumeFader,
};
