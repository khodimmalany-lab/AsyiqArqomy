import { ArabicNumberInfo } from '../data/arabicNumbers';

class RetroSoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private speechAvailable: boolean = typeof window !== 'undefined' && 'speechSynthesis' in window;
  private voicesLoaded: boolean = false;
  private onSpeakingChangeCallback: ((speaking: boolean, label?: string) => void) | null = null;
  private speakingTimer: number | null = null;

  constructor() {
    if (this.speechAvailable) {
      window.speechSynthesis.onvoiceschanged = () => {
        this.voicesLoaded = true;
      };
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.isMuted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted && this.speechAvailable) {
      window.speechSynthesis.cancel();
      this.notifySpeaking(false);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public onSpeakingChange(cb: (speaking: boolean, label?: string) => void) {
    this.onSpeakingChangeCallback = cb;
  }

  private notifySpeaking(speaking: boolean, label?: string) {
    if (this.onSpeakingChangeCallback) {
      this.onSpeakingChangeCallback(speaking, label);
    }
  }

  /**
   * Plays a retro chiptune musical scale note + syllable rhythm when collecting a number item
   */
  public playNumberCollectSynth(info: ArabicNumberInfo) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const baseFreq = info.noteFreq;

    // 1. Primary ascending retro square-triangle hybrid chime
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'triangle';
    osc2.type = 'square';

    osc1.frequency.setValueAtTime(baseFreq, now);
    osc1.frequency.exponentialRampToValueAtTime(baseFreq * 1.25, now + 0.12);
    osc1.frequency.setValueAtTime(baseFreq * 1.5, now + 0.13);

    osc2.frequency.setValueAtTime(baseFreq * 0.5, now);
    osc2.frequency.setValueAtTime(baseFreq, now + 0.13);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.44);
    osc2.stop(now + 0.44);

    // 2. Syllable cadence sparkle pulses matching the Arabic word syllables (e.g., Wa-hi-dun = 3 pulses)
    const syllableInterval = 0.13;
    for (let i = 0; i < info.syllableCount; i++) {
      const start = now + 0.16 + i * syllableInterval;
      const sylOsc = ctx.createOscillator();
      const sylGain = ctx.createGain();
      sylOsc.type = 'sine';
      const pitchStep = i === info.syllableCount - 1 ? 1.5 : 1 + i * 0.12;
      sylOsc.frequency.setValueAtTime(baseFreq * pitchStep, start);

      sylGain.gain.setValueAtTime(0.001, start);
      sylGain.gain.linearRampToValueAtTime(0.12, start + 0.015);
      sylGain.gain.exponentialRampToValueAtTime(0.001, start + 0.1);

      sylOsc.connect(sylGain);
      sylGain.connect(ctx.destination);
      sylOsc.start(start);
      sylOsc.stop(start + 0.11);
    }
  }

  /**
   * Speaks the Arabic number and its pronunciation guide clearly via Web Speech API
   */
  public speakArabicNumber(info: ArabicNumberInfo, includeMeaning: boolean = true) {
    if (this.isMuted) return;

    // Always play the melodic retro chime so audio feedback is immediate
    this.playNumberCollectSynth(info);

    if (!this.speechAvailable) return;

    try {
      window.speechSynthesis.cancel();
      if (this.speakingTimer) {
        window.clearTimeout(this.speakingTimer);
      }

      const voices = window.speechSynthesis.getVoices();
      const arabicVoice = voices.find((v) => v.lang.toLowerCase().startsWith('ar'));
      const indonesianVoice =
        voices.find((v) => v.lang.toLowerCase().startsWith('id')) ||
        voices.find((v) => v.lang.toLowerCase().startsWith('ms'));

      const labelText = `${info.arabicNumeral} · ${info.arabicWord} (${info.transliteration})`;
      this.notifySpeaking(true, labelText);

      if (arabicVoice) {
        // Speak authentic Arabic word first
        const utterAr = new SpeechSynthesisUtterance(info.arabicSpeech);
        utterAr.voice = arabicVoice;
        utterAr.lang = arabicVoice.lang;
        utterAr.rate = 0.82;
        utterAr.pitch = 1.05;

        if (includeMeaning) {
          const utterId = new SpeechSynthesisUtterance(
            `${info.indonesianPhoneticSpeech}. ${info.indonesianMeaning}.`
          );
          if (indonesianVoice) {
            utterId.voice = indonesianVoice;
            utterId.lang = indonesianVoice.lang;
          } else {
            utterId.lang = 'id-ID';
          }
          utterId.rate = 0.92;
          utterId.pitch = 1.08;
          utterId.onend = () => this.notifySpeaking(false);
          utterId.onerror = () => this.notifySpeaking(false);

          window.speechSynthesis.speak(utterAr);
          window.speechSynthesis.speak(utterId);
        } else {
          utterAr.onend = () => this.notifySpeaking(false);
          utterAr.onerror = () => this.notifySpeaking(false);
          window.speechSynthesis.speak(utterAr);
        }
      } else {
        // Fallback when OS has no Arabic voice installed: use phonetic Indonesian reading so it still speaks clearly!
        const text = includeMeaning
          ? `${info.indonesianPhoneticSpeech}. Artinya ${info.indonesianMeaning}.`
          : info.indonesianPhoneticSpeech;
        const utter = new SpeechSynthesisUtterance(text);
        if (indonesianVoice) {
          utter.voice = indonesianVoice;
          utter.lang = indonesianVoice.lang;
        } else {
          utter.lang = 'id-ID';
        }
        utter.rate = 0.88;
        utter.pitch = 1.08;
        utter.onend = () => this.notifySpeaking(false);
        utter.onerror = () => this.notifySpeaking(false);
        window.speechSynthesis.speak(utter);
      }

      // Safety timeout to clear speaking indicator if browser speech event doesn't fire
      this.speakingTimer = window.setTimeout(() => {
        this.notifySpeaking(false);
      }, 3200);
    } catch {
      this.notifySpeaking(false);
    }
  }

  public playJetpackBoost() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(360, now + 0.14);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playWrongOrderPrompt(expectedInfo: ArabicNumberInfo) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.setValueAtTime(175, now + 0.1);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.26);

    if (this.speechAvailable && !this.isMuted) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(
          `Cari angka ${expectedInfo.indonesianPhoneticSpeech}, ${expectedInfo.indonesianMeaning} dulu ya!`
        );
        utter.lang = 'id-ID';
        utter.rate = 0.95;
        window.speechSynthesis.speak(utter);
      } catch {
        // ignore
      }
    }
  }

  public playShieldBump() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.22);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  public playHeartPickup() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [392, 523.25, 659.25];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);
      gain.gain.setValueAtTime(0.15, now + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.19);
    });
  }

  public playPortalUnlocked() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      gain.gain.setValueAtTime(0.18, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.32);
    });
  }

  public playVictoryFanfare() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const melody = [
      { f: 523.25, t: 0, d: 0.14 },
      { f: 523.25, t: 0.15, d: 0.14 },
      { f: 523.25, t: 0.3, d: 0.14 },
      { f: 659.25, t: 0.45, d: 0.3 },
      { f: 587.33, t: 0.78, d: 0.25 },
      { f: 659.25, t: 1.05, d: 0.25 },
      { f: 783.99, t: 1.35, d: 0.55 },
    ];
    melody.forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(n.f, now + n.t);
      gain.gain.setValueAtTime(0.14, now + n.t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.d);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + n.t);
      osc.stop(now + n.t + n.d + 0.02);
    });
  }

  public playLaserShoot() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(210, now + 0.09);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playEnemyHit() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.07);

    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  public playEnemyExplode() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Deep retro boom + high shatter chime
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.28);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.32);

    const chime = ctx.createOscillator();
    const chimeGain = ctx.createGain();
    chime.type = 'triangle';
    chime.frequency.setValueAtTime(523.25, now + 0.04);
    chime.frequency.exponentialRampToValueAtTime(783.99, now + 0.18);
    chimeGain.gain.setValueAtTime(0.12, now + 0.04);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    chime.connect(chimeGain);
    chimeGain.connect(ctx.destination);
    chime.start(now + 0.04);
    chime.stop(now + 0.24);
  }

  public playNosComboSound() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = [330, 440, 587.33, 880];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, now + i * 0.04);
      osc.frequency.exponentialRampToValueAtTime(f * 1.4, now + i * 0.04 + 0.14);
      gain.gain.setValueAtTime(0.12, now + i * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.04);
      osc.stop(now + i * 0.04 + 0.18);
    });
  }

  public playEnemyShoot() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.12);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playBossWarning() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      const start = now + i * 0.28;
      osc.frequency.setValueAtTime(220, start);
      osc.frequency.linearRampToValueAtTime(440, start + 0.14);
      osc.frequency.linearRampToValueAtTime(180, start + 0.25);
      gain.gain.setValueAtTime(0.18, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.26);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.27);
    }
  }
}

export const soundEngine = new RetroSoundEngine();


