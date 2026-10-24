import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ARABIC_NUMBERS,
  ArabicNumberInfo,
  BELASAN_NUMBER_LIST,
  NumberCategory,
  PULUHAN_NUMBER_LIST,
  SATUAN_NUMBER_LIST,
  SPACE_SECTORS,
  toArabicDigits,
} from './data/arabicNumbers';
import { soundEngine } from './audio/soundEngine';
import { GameState, HudSnapshot, SpaceCanvas } from './components/SpaceCanvas';

const STORAGE_UNLOCKED_KEY = 'asyiq_arqomiya_strict_progression_v1';
const STORAGE_HIGHSCORE_KEY = 'asyiq_arqomiya_strict_highscore_v1';

export default function App() {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [sectorIndex, setSectorIndex] = useState<number>(0);
  const [unlockedSectorCount, setUnlockedSectorCount] = useState<number>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_UNLOCKED_KEY);
      const parsed = saved ? parseInt(saved, 10) : 1;
      return Number.isFinite(parsed) && parsed >= 1 ? Math.min(SPACE_SECTORS.length, parsed) : 1;
    } catch {
      return 1;
    }
  });
  const [highScore, setHighScore] = useState<number>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_HIGHSCORE_KEY);
      const parsed = saved ? parseInt(saved, 10) : 0;
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    } catch {
      return 0;
    }
  });

  const [resetTrigger, setResetTrigger] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showNumberGuideModal, setShowNumberGuideModal] = useState<boolean>(false);
  const [guideTab, setGuideTab] = useState<NumberCategory>('SATUAN');
  const [activeSpeakingLabel, setActiveSpeakingLabel] = useState<string | null>(null);
  const [selectedGuideNumber, setSelectedGuideNumber] = useState<ArabicNumberInfo>(ARABIC_NUMBERS[1]);
  const [sectorHistory, setSectorHistory] = useState<ArabicNumberInfo[]>([]);
  const [lockedNotice, setLockedNotice] = useState<string | null>(null);

  // Virtual Joystick state for bottom-left corner movement pad
  const joystickPadRef = useRef<HTMLDivElement | null>(null);
  const [joyKnob, setJoyKnob] = useState<{ x: number; y: number; active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  });
  const [isHoldingFire, setIsHoldingFire] = useState<boolean>(false);

  const currentSector = SPACE_SECTORS[sectorIndex] || SPACE_SECTORS[0];

  const [hud, setHud] = useState<HudSnapshot>({
    collectedCount: 0,
    targetCount: currentSector.targetCount,
    shields: 3,
    maxShields: 3,
    score: 0,
    destroyedCount: 0,
    autoFire: true,
    lastCollectedNumber: null,
    nextExpectedNumber: ARABIC_NUMBERS[currentSector.numberSequence[0] || 1],
    portalActive: false,
    dashCooldownRatio: 0,
    nosActive: false,
    comboStreak: 0,
    bossActive: false,
    bossHp: 0,
    bossMaxHp: 65,
    bossName: 'RAJA MONSTER KOSMIK: AL-WAHSY',
    isEndless: Boolean(currentSector.isEndlessFinal),
    endlessWave: 1,
    lastAdditionEquation: `٠ + ... = ${toArabicDigits(currentSector.targetCount)}`,
    lastAdditionLatin: `Target: ${currentSector.targetCount} Kristal`,
  });

  useEffect(() => {
    soundEngine.onSpeakingChange((speaking, label) => {
      setActiveSpeakingLabel(speaking && label ? label : null);
    });
  }, []);

  // Update high score whenever hud.score increases
  useEffect(() => {
    if (hud.score > highScore) {
      setHighScore(hud.score);
      try {
        window.localStorage.setItem(STORAGE_HIGHSCORE_KEY, String(hud.score));
      } catch {
        // Ignore storage errors
      }
    }
  }, [hud.score, highScore]);

  const saveUnlockedCount = useCallback((count: number) => {
    const clamped = Math.max(1, Math.min(SPACE_SECTORS.length, count));
    setUnlockedSectorCount(clamped);
    try {
      window.localStorage.setItem(STORAGE_UNLOCKED_KEY, String(clamped));
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleResetPlayerProgress = useCallback(() => {
    setHighScore(0);
    setUnlockedSectorCount(1);
    setSectorIndex(0);
    setLockedNotice(null);
    setHud((prev) => ({ ...prev, score: 0 }));
    try {
      window.localStorage.setItem(STORAGE_HIGHSCORE_KEY, '0');
      window.localStorage.setItem(STORAGE_UNLOCKED_KEY, '1');
    } catch {
      // Ignore storage errors
    }
  }, []);

  const dispatchJoystick = useCallback((nx: number, ny: number) => {
    window.dispatchEvent(
      new CustomEvent('virtual-joystick', {
        detail: { x: nx, y: ny },
      })
    );
  }, []);

  const handleJoystickPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = joystickPadRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const maxRadius = rect.width * 0.38;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      const clampedDist = Math.min(dist, maxRadius);
      const angle = Math.atan2(dy, dx);
      const kx = Math.cos(angle) * clampedDist;
      const ky = Math.sin(angle) * clampedDist;
      const nx = maxRadius > 0 ? kx / maxRadius : 0;
      const ny = maxRadius > 0 ? ky / maxRadius : 0;
      setJoyKnob({ x: kx, y: ky, active: true });
      dispatchJoystick(nx, ny);
    },
    [dispatchJoystick]
  );

  const resetJoystick = useCallback(() => {
    setJoyKnob({ x: 0, y: 0, active: false });
    dispatchJoystick(0, 0);
  }, [dispatchJoystick]);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  const handleStartGame = useCallback(
    (targetSectorIdx?: number) => {
      const idx = typeof targetSectorIdx === 'number' ? targetSectorIdx : sectorIndex;
      if (idx >= unlockedSectorCount) {
        setLockedNotice(
          `Selesaikan Sektor ${toArabicDigits(idx)} terlebih dahulu untuk membuka Sektor ${toArabicDigits(idx + 1)}!`
        );
        return;
      }
      setLockedNotice(null);
      const targetSec = SPACE_SECTORS[idx] || SPACE_SECTORS[0];
      setSectorIndex(idx);
      setShowNumberGuideModal(false);
      setResetTrigger((prev) => prev + 1);
      setGameState('PLAYING');
      const firstVal = targetSec.numberSequence[0] || 1;
      const firstInfo = ARABIC_NUMBERS[firstVal] || ARABIC_NUMBERS[1];
      soundEngine.speakArabicNumber(firstInfo, true);
    },
    [sectorIndex, unlockedSectorCount]
  );

  const handleRestartSector = useCallback(() => {
    resetJoystick();
    setResetTrigger((prev) => prev + 1);
    setGameState('PLAYING');
  }, [resetJoystick]);

  const handleNextSector = useCallback(() => {
    const nextIdx = Math.min(SPACE_SECTORS.length - 1, sectorIndex + 1);
    if (nextIdx + 1 > unlockedSectorCount) {
      saveUnlockedCount(nextIdx + 1);
    }
    resetJoystick();
    setSectorIndex(nextIdx);
    setResetTrigger((prev) => prev + 1);
    setGameState('PLAYING');
    const nextSec = SPACE_SECTORS[nextIdx] || SPACE_SECTORS[0];
    const firstInfo = ARABIC_NUMBERS[nextSec.numberSequence[0] || 1] || ARABIC_NUMBERS[1];
    soundEngine.speakArabicNumber(firstInfo, true);
  }, [sectorIndex, unlockedSectorCount, saveUnlockedCount, resetJoystick]);

  const handleTogglePause = useCallback(() => {
    resetJoystick();
    setGameState((prev) => {
      if (prev === 'PLAYING') return 'PAUSED';
      if (prev === 'PAUSED') return 'PLAYING';
      return prev;
    });
  }, [resetJoystick]);

  const handleSectorComplete = useCallback(
    (finalScore: number, collectedNumbers: ArabicNumberInfo[]) => {
      resetJoystick();
      setHud((prev) => ({ ...prev, score: finalScore }));
      setSectorHistory(collectedNumbers);
      // Unlock next sector upon completion
      const nextUnlock = Math.min(SPACE_SECTORS.length, sectorIndex + 2);
      if (nextUnlock > unlockedSectorCount) {
        saveUnlockedCount(nextUnlock);
      }
      setGameState('SECTOR_VICTORY');
    },
    [sectorIndex, unlockedSectorCount, saveUnlockedCount, resetJoystick]
  );

  const handleGameOver = useCallback(
    (finalScore: number) => {
      resetJoystick();
      setHud((prev) => ({ ...prev, score: finalScore }));
      setGameState('GAME_OVER');
    },
    [resetJoystick]
  );

  const handleTriggerNosCombo = useCallback(() => {
    window.dispatchEvent(new CustomEvent('trigger-magnet-dash'));
  }, []);

  const handleFirePressStart = useCallback(() => {
    setIsHoldingFire(true);
    window.dispatchEvent(new CustomEvent('trigger-fire-burst'));
    window.dispatchEvent(new CustomEvent('hold-fire-change', { detail: { held: true } }));
  }, []);

  const handleFirePressEnd = useCallback(() => {
    setIsHoldingFire(false);
    window.dispatchEvent(new CustomEvent('hold-fire-change', { detail: { held: false } }));
  }, []);

  const handleOpenGuideForSector = useCallback(() => {
    if (sectorIndex === 3) {
      setGuideTab('BELASAN');
      setSelectedGuideNumber(ARABIC_NUMBERS[11]);
    } else if (sectorIndex === 4) {
      setGuideTab('PULUHAN');
      setSelectedGuideNumber(ARABIC_NUMBERS[20]);
    } else {
      setGuideTab('SATUAN');
      setSelectedGuideNumber(ARABIC_NUMBERS[1]);
    }
    setShowNumberGuideModal(true);
  }, [sectorIndex]);

  // Keyboard shortcut on Title Screen (Enter / Space to start)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (gameState === 'TITLE_MENU' && !showNumberGuideModal) {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleStartGame(sectorIndex);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameState, showNumberGuideModal, handleStartGame, sectorIndex]);

  const activeCardNumber =
    hud.lastCollectedNumber ||
    hud.nextExpectedNumber ||
    ARABIC_NUMBERS[currentSector.numberSequence[0] || 1];

  const currentGuideList =
    guideTab === 'BELASAN'
      ? BELASAN_NUMBER_LIST
      : guideTab === 'PULUHAN'
      ? PULUHAN_NUMBER_LIST
      : SATUAN_NUMBER_LIST;

  const firstSeqArabic = toArabicDigits(currentSector.numberSequence[0] || 1);
  const lastSeqArabic = toArabicDigits(
    currentSector.numberSequence[currentSector.numberSequence.length - 1] || 10
  );

  return (
    <div className="relative w-screen h-dvh overflow-hidden bg-[#070B19] select-none">
      {/* Isolated 60fps 2.5D Retro Space Shooter & Counting Canvas */}
      <SpaceCanvas
        gameState={gameState}
        sectorIndex={sectorIndex}
        resetTrigger={resetTrigger}
        onHudUpdate={setHud}
        onSectorComplete={handleSectorComplete}
        onGameOver={handleGameOver}
        onTogglePause={handleTogglePause}
      />

      {/* ====================================================================
          1. TITLE SCREEN OVERLAY (Responsive Mobile & Desktop Game Shell)
         ==================================================================== */}
      {gameState === 'TITLE_MENU' && (
        <div className="absolute inset-0 overflow-y-auto bg-gradient-to-b from-[#070B19]/90 via-[#070B19]/55 to-[#070B19]/94">
          <div className="min-h-dvh flex flex-col justify-between p-3 sm:p-6 md:p-8">
            {/* Top Perimeter Bar */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-300 font-medium truncate">
                <span className="font-bold text-amber-300">Asyiq Arqomiya</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular text-emerald-300 font-semibold">
                  Rekor Skor: {highScore}
                </span>
                {(highScore > 0 || unlockedSectorCount > 1) && (
                  <button
                    type="button"
                    onClick={handleResetPlayerProgress}
                    title="Reset skor & progres ke 0 untuk pemain baru di perangkat ini"
                    className="ml-1 px-2 py-0.5 text-[10px] sm:text-xs font-semibold text-slate-300 bg-slate-800/90 hover:bg-rose-900/80 hover:text-white border border-slate-600 rounded-md transition-colors cursor-pointer shrink-0"
                  >
                    🔄 Reset 0
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    handleOpenGuideForSector();
                    soundEngine.speakArabicNumber(selectedGuideNumber, true);
                  }}
                  className="min-h-[42px] px-2.5 sm:px-4 py-1.5 text-xs sm:text-sm font-semibold text-amber-300 bg-[#111A36] border-2 border-amber-400/70 rounded-lg hover:bg-[#1A2750] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  📖 Rumus ١–١٠٠
                </button>

                <button
                  type="button"
                  onClick={handleToggleMute}
                  className="min-h-[42px] px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-200 bg-[#111A36] border-2 border-slate-600 rounded-lg hover:border-sky-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isMuted ? '🔇 Mati' : '🔊 Aktif'}
                </button>
              </div>
            </div>

            {/* Center Hero Lockup with Bespoke Inline SVG Title "ASYIQ ARQOMIYA" */}
            <div className="my-auto mx-auto max-w-3xl w-full flex flex-col items-center text-center py-1.5">
              <svg
                viewBox="0 0 680 136"
                className="w-full max-w-[310px] sm:max-w-[540px] h-auto mb-1 sm:mb-2"
                role="img"
                aria-label="Asyiq Arqomiya: Petualangan Angka Arab 1 sampai 100"
              >
                <defs>
                  <linearGradient id="retroGold" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#FEF08A" />
                    <stop offset="55%" stopColor="#FACC15" />
                    <stop offset="100%" stopColor="#EA580C" />
                  </linearGradient>
                  <linearGradient id="retroCyan" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#38BDF8" />
                    <stop offset="50%" stopColor="#818CF8" />
                    <stop offset="100%" stopColor="#34D399" />
                  </linearGradient>
                </defs>

                <g transform="translate(340, 24)">
                  <path
                    d="M-18,-16 A20,20 0 1,0 16,12 A15,15 0 1,1 -18,-16 Z"
                    fill="url(#retroGold)"
                  />
                  <rect x="10" y="-14" width="6" height="6" fill="#38BDF8" />
                  <rect x="-36" y="0" width="5" height="5" fill="#34D399" />
                  <rect x="28" y="4" width="5" height="5" fill="#F472B6" />
                </g>

                <text
                  x="340"
                  y="80"
                  textAnchor="middle"
                  fill="url(#retroGold)"
                  fontFamily="Outfit, sans-serif"
                  fontWeight="800"
                  fontSize="48"
                  letterSpacing="3"
                >
                  ASYIQ ARQOMIYA
                </text>

                <text
                  x="340"
                  y="114"
                  textAnchor="middle"
                  fill="url(#retroCyan)"
                  fontFamily="Plus Jakarta Sans, sans-serif"
                  fontWeight="700"
                  fontSize="19"
                  letterSpacing="1.2"
                >
                  TEMBAK 2.5D · KOMBO NOS · RAJA MONSTER &amp; ANGKA ARAB ١–١٠٠
                </text>
              </svg>

              <p className="text-xs sm:text-sm text-slate-200 max-w-xl mb-3 leading-relaxed px-1">
                Kendalikan pesawat tempur <span className="font-semibold text-sky-300">Nujum-X</span>!
                Selesaikan tiap sektor untuk membuka kunci berikutnya, kalahkan{' '}
                <span className="text-rose-300 font-semibold">Raja Monster di Sektor ٥</span>, dan
                masuk ke <span className="text-amber-300 font-semibold">Gerbang Sektor Final Tanpa Akhir</span>!
              </p>

              {/* 6-Sector Progression Selector with Strict Lock System */}
              <div className="w-full max-w-2xl bg-[#0B1229]/95 border-2 border-slate-700/90 rounded-xl p-2.5 sm:p-4 mb-3.5 sm:mb-5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-semibold text-sky-300">
                    Progres Misi Sektor ({unlockedSectorCount}/{SPACE_SECTORS.length} Terbuka):
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Menangkan sektor untuk membuka kunci berikutnya
                  </span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2 mb-2.5">
                  {SPACE_SECTORS.map((sec, idx) => {
                    const isUnlocked = idx < unlockedSectorCount;
                    const isSelected = idx === sectorIndex;
                    return (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => {
                          if (!isUnlocked) {
                            setLockedNotice(
                              `🔒 Sektor ${toArabicDigits(sec.id)} masih terkunci! Selesaikan Sektor ${toArabicDigits(idx)} terlebih dahulu.`
                            );
                            return;
                          }
                          setLockedNotice(null);
                          setSectorIndex(idx);
                        }}
                        className={`min-h-[54px] px-2 py-1.5 rounded-lg border-2 text-left transition-transform relative ${
                          isSelected
                            ? 'bg-[#172554] border-amber-400 text-white scale-[1.02] cursor-pointer'
                            : isUnlocked
                            ? 'bg-[#0F172A] border-slate-600 text-slate-200 hover:border-sky-400 cursor-pointer'
                            : 'bg-[#060913] border-slate-800/80 text-slate-600 opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`text-[11px] sm:text-xs font-bold whitespace-nowrap ${
                              isUnlocked ? 'text-amber-300' : 'text-slate-500'
                            }`}
                          >
                            {sec.isEndlessFinal ? '♾️ Final' : `Sektor ${toArabicDigits(sec.id)}`}
                          </span>
                          <span className="text-xs">
                            {!isUnlocked ? '🔒' : sec.hasBossAtEnd ? '👾' : sec.isEndlessFinal ? '🔥' : '⭐'}
                          </span>
                        </div>
                        <div
                          className={`text-[10px] sm:text-[11px] font-semibold truncate mt-0.5 ${
                            isUnlocked ? 'text-sky-200' : 'text-slate-600'
                          }`}
                        >
                          {isUnlocked ? sec.shortLabel : 'Terkunci'}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {lockedNotice && (
                  <div className="text-xs font-semibold text-rose-300 bg-rose-950/60 border border-rose-500/50 rounded-lg px-2.5 py-1.5 mb-2">
                    {lockedNotice}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pt-2 border-t border-slate-800 text-left">
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-bold text-white truncate">
                      {currentSector.name} ·{' '}
                      <span className="text-amber-300">{currentSector.arabicTitle}</span>
                    </div>
                    <div className="text-[11px] sm:text-xs text-slate-300 line-clamp-2">
                      {currentSector.description}
                    </div>
                  </div>
                  <div className="text-[11px] sm:text-xs font-mono-tabular font-semibold text-emerald-300 shrink-0">
                    {currentSector.isEndlessFinal
                      ? 'Mode Tanpa Akhir · Skor Tertinggi!'
                      : currentSector.hasBossAtEnd
                      ? `Misi: ${firstSeqArabic}→${lastSeqArabic} + Lawan Monster!`
                      : `Misi: ${firstSeqArabic} → ${lastSeqArabic} (${currentSector.targetCount} Bintang)`}
                  </div>
                </div>
              </div>

              {/* Primary CTAs */}
              <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 sm:gap-4">
                <button
                  type="button"
                  onClick={() => handleStartGame(sectorIndex)}
                  className="min-h-[48px] px-6 sm:px-8 py-3 text-sm sm:text-base md:text-lg font-display font-extrabold text-slate-950 bg-amber-400 hover:bg-amber-300 border-2 border-amber-200 rounded-xl shadow-lg transition-transform active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  🚀 Mulai Misi ({currentSector.shortLabel})
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleOpenGuideForSector();
                    soundEngine.speakArabicNumber(selectedGuideNumber, true);
                  }}
                  className="min-h-[46px] px-5 py-2.5 text-xs sm:text-sm md:text-base font-bold text-sky-200 bg-[#111C38] hover:bg-[#19284F] border-2 border-sky-400/60 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Rumus &amp; Latihan Suara ١–١٠٠
                </button>
              </div>
            </div>

            {/* Single Flat Control-Hint Line */}
            <div className="text-center text-[11px] sm:text-xs font-mono-tabular text-slate-300 tracking-wide pt-1">
              Pojok Kiri: Analog Arah · Pojok Kanan: 🔥 Tembak &amp; 🚀 NOS Kombo Peluru
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          2. ACTIVE PLAY HUD (Corner Movement Pad + Corner Fire/NOS + Audio Strip)
         ==================================================================== */}
      {gameState === 'PLAYING' && (
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-2 sm:p-3.5 md:p-5">
          {/* TOP PERIMETER BAR + BOSS HEALTH BAR */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              {/* Top-Left: Shields + Star Counter / Endless Wave + Score */}
              <div className="bg-[#0B1229]/95 border-2 border-slate-700 rounded-xl px-2.5 py-1.5 sm:px-3.5 sm:py-2 flex items-center gap-2 sm:gap-3 pointer-events-auto min-h-[42px]">
                <div
                  className="flex items-center gap-1"
                  aria-label={`Perisai: ${hud.shields} dari ${hud.maxShields}`}
                >
                  {Array.from({ length: hud.maxShields }).map((_, idx) => {
                    const active = idx < hud.shields;
                    return (
                      <svg
                        key={idx}
                        viewBox="0 0 24 24"
                        className="w-4 h-4 sm:w-5 sm:h-5 shrink-0"
                        fill={active ? '#38BDF8' : '#1E293B'}
                        stroke={active ? '#BAE6FD' : '#475569'}
                        strokeWidth="2"
                      >
                        <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z" />
                      </svg>
                    );
                  })}
                </div>

                <span className="text-slate-700" aria-hidden="true">|</span>

                {/* Collected Progress + Live Addition Equation or Endless Wave Readout */}
                {hud.isEndless ? (
                  <div className="flex items-center gap-1.5 font-mono-tabular">
                    <span className="text-xs sm:text-sm font-extrabold text-amber-300 whitespace-nowrap">
                      ♾️ Gelombang {hud.endlessWave}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 sm:gap-2 font-mono-tabular">
                    <div className="flex items-center gap-1">
                      <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" fill="#FACC15">
                        <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" />
                      </svg>
                      <span className="text-sm sm:text-base font-bold text-amber-300 whitespace-nowrap">
                        {toArabicDigits(hud.collectedCount)}/{toArabicDigits(hud.targetCount)}
                      </span>
                    </div>

                    <span className="px-1.5 py-0.5 rounded-md bg-sky-950/90 border border-sky-400/50 text-[11px] sm:text-xs font-extrabold text-sky-200 whitespace-nowrap">
                      ➕ {hud.lastAdditionEquation}
                    </span>
                  </div>
                )}

                <span className="text-slate-700" aria-hidden="true">|</span>

                {/* Destroyed & Score Readout */}
                <div className="flex items-center gap-1 font-mono-tabular text-xs sm:text-sm">
                  <span className="text-rose-400">💥</span>
                  <span className="font-bold text-rose-300">{hud.destroyedCount}</span>
                </div>

                <span className="text-slate-700" aria-hidden="true">|</span>

                <div className="flex items-center gap-1 font-mono-tabular text-xs sm:text-sm">
                  <span className="font-bold text-emerald-300">{hud.score}</span>
                </div>
              </div>

              {/* Top-Right: Compact Utility Buttons */}
              <div className="flex items-center gap-1.5 pointer-events-auto shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setGameState('PAUSED');
                    handleOpenGuideForSector();
                  }}
                  className="min-h-[42px] px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-amber-300 bg-[#0B1229]/95 border-2 border-amber-400/60 rounded-lg hover:bg-[#162246] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  📖 <span className="hidden sm:inline">Rumus</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleMute}
                  aria-label={isMuted ? 'Aktifkan Suara' : 'Matikan Suara'}
                  className="min-h-[42px] min-w-[42px] px-2.5 py-1.5 text-xs font-semibold text-slate-200 bg-[#0B1229]/95 border-2 border-slate-700 rounded-lg hover:border-sky-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isMuted ? '🔇' : '🔊'}
                </button>

                <button
                  type="button"
                  onClick={handleTogglePause}
                  className="min-h-[42px] px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-200 bg-[#0B1229]/95 border-2 border-slate-700 rounded-lg hover:border-sky-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  ⏸️
                </button>
              </div>
            </div>

            {/* BOSS HEALTH BAR BANNER (When Boss Monster Spawns at End of Sector 5 or Endless Wave) */}
            {hud.bossActive && (
              <div className="mx-auto w-full max-w-xl bg-[#1A0B1E]/95 border-2 border-rose-500 rounded-xl px-3 py-1.5 pointer-events-auto">
                <div className="flex items-center justify-between text-xs font-extrabold text-rose-200 mb-1">
                  <span className="truncate">👾 {hud.bossName}</span>
                  <span className="font-mono-tabular text-amber-300">
                    HP: {hud.bossHp}/{hud.bossMaxHp}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-rose-400/50">
                  <div
                    className="h-full bg-gradient-to-r from-rose-500 via-amber-400 to-rose-600 transition-all duration-150"
                    style={{
                      width: `${Math.max(0, Math.min(100, (hud.bossHp / Math.max(1, hud.bossMaxHp)) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ====================================================================
              BOTTOM ERGONOMIC CONTROLS + COMPACT ARABIC LEARNING STRIP
              - Left Corner: Virtual Analog / D-Pad Controller
              - Center/Top of Bottom: Compact Arabic Cara Baca Strip
              - Right Corner: Fire Laser + NOS Combo Barrage + Voice Button
             ==================================================================== */}
          <div className="flex flex-col gap-2 w-full">
            {/* Compact Arabic Learning & Audio Banner */}
            <div className="mx-auto w-full max-w-xl bg-[#0B1229]/92 border-2 border-sky-400/70 rounded-xl px-2.5 py-1.5 sm:px-3.5 sm:py-2 flex items-center justify-between gap-2 pointer-events-auto">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <div
                  className="w-10 h-10 sm:w-12 sm:h-12 px-1 rounded-xl flex items-center justify-center text-lg sm:text-2xl font-display font-extrabold text-slate-950 shrink-0 border-2 border-white"
                  style={{ backgroundColor: activeCardNumber.color }}
                >
                  {activeCardNumber.arabicNumeral}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold text-sky-300 truncate">
                    <span className="truncate">
                      {hud.portalActive
                        ? `✅ Target ${toArabicDigits(hud.targetCount)} Kristal Tercapai! Masuk Gerbang Bintang!`
                        : hud.bossActive
                        ? '👾 Hancurkan Monster untuk Buka Gerbang!'
                        : hud.isEndless
                        ? `Penjumlahan: ${hud.lastAdditionEquation} (${hud.lastAdditionLatin})`
                        : hud.lastCollectedNumber
                        ? `Penjumlahan: ${hud.lastAdditionEquation} (${hud.lastAdditionLatin}) · Kurang +${toArabicDigits(Math.max(0, hud.targetCount - hud.collectedCount))} ke Gerbang`
                        : `Tantangan: Kumpulkan ${toArabicDigits(hud.targetCount)} (${hud.targetCount}) Kristal Bintang untuk Buka Gerbang!`}
                    </span>
                    {activeSpeakingLabel && <span className="text-amber-300 shrink-0">· 🔊</span>}
                  </div>

                  <div className="flex items-baseline gap-1.5 truncate">
                    <span className="text-sm sm:text-lg font-bold text-white shrink-0">
                      {activeCardNumber.arabicWord}
                    </span>
                    <span className="text-xs sm:text-sm font-bold text-amber-300 truncate">
                      &ldquo;{activeCardNumber.syllables}&rdquo;
                    </span>
                    <span className="text-[11px] sm:text-xs font-semibold text-emerald-300 shrink-0">
                      = {activeCardNumber.indonesianMeaning} ({activeCardNumber.value})
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => soundEngine.speakArabicNumber(activeCardNumber, true)}
                className="min-h-[42px] px-2.5 sm:px-3 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-transform active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
              >
                🔊 Baca
              </button>
            </div>

            {/* Bottom Corner Thumb Controls Row: [Left Corner Movement Pad] <---> [Right Corner Fire & NOS Combo] */}
            <div className="flex items-end justify-between w-full px-0.5 sm:px-2">
              {/* POJOK KIRI: Virtual Analog & D-Pad Movement Control */}
              <div className="pointer-events-auto flex flex-col items-center">
                <div
                  ref={joystickPadRef}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    handleJoystickPointer(e.clientX, e.clientY);
                  }}
                  onPointerMove={(e) => {
                    if (!joyKnob.active) return;
                    e.stopPropagation();
                    handleJoystickPointer(e.clientX, e.clientY);
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    resetJoystick();
                  }}
                  onPointerCancel={(e) => {
                    e.stopPropagation();
                    resetJoystick();
                  }}
                  style={{ touchAction: 'none' }}
                  className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-[#0B1229]/90 border-2 border-sky-400/75 shadow-lg flex items-center justify-center cursor-pointer"
                  aria-label="Kontrol Arah Gerakan Pesawat"
                >
                  {/* Directional Cross Arrows */}
                  <span className="absolute top-1.5 text-xs font-bold text-sky-300/80 pointer-events-none">
                    ▲
                  </span>
                  <span className="absolute bottom-1.5 text-xs font-bold text-sky-300/80 pointer-events-none">
                    ▼
                  </span>
                  <span className="absolute left-2 text-xs font-bold text-sky-300/80 pointer-events-none">
                    ◀
                  </span>
                  <span className="absolute right-2 text-xs font-bold text-sky-300/80 pointer-events-none">
                    ▶
                  </span>

                  {/* Inner Ring Guide */}
                  <div className="w-16 h-16 rounded-full border border-sky-400/30 pointer-events-none" />

                  {/* Movable Analog Thumb Stick */}
                  <div
                    className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full border-2 flex items-center justify-center pointer-events-none transition-transform duration-75 ${
                      joyKnob.active
                        ? 'bg-sky-400 border-white text-slate-950 shadow-md'
                        : 'bg-[#172554] border-sky-300 text-sky-200'
                    }`}
                    style={{
                      transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)`,
                    }}
                  >
                    <span className="text-xs font-extrabold">🚀</span>
                  </div>
                </div>
              </div>

              {/* POJOK KANAN: Tombol Tembak + Tombol NOS Kombo Peluru */}
              <div className="pointer-events-auto flex items-end gap-2 sm:gap-3">
                {/* Tombol NOS + Kombo Peluru 5 Arah */}
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    handleTriggerNosCombo();
                  }}
                  disabled={hud.dashCooldownRatio > 0 && !hud.nosActive}
                  style={{ touchAction: 'none' }}
                  className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full border-2 flex flex-col items-center justify-center text-center shadow-lg transition-transform active:scale-95 cursor-pointer ${
                    hud.nosActive
                      ? 'bg-amber-400 border-white text-slate-950 scale-105'
                      : hud.dashCooldownRatio > 0
                      ? 'bg-[#0F172A]/90 border-slate-700 text-slate-500'
                      : 'bg-gradient-to-b from-amber-400 to-orange-500 border-amber-200 text-slate-950 hover:from-amber-300 hover:to-orange-400'
                  }`}
                >
                  <span className="text-lg sm:text-xl leading-none">🚀⚡</span>
                  <span className="text-[10px] sm:text-xs font-extrabold tracking-tight mt-0.5">
                    {hud.nosActive
                      ? 'NOS AKTIF!'
                      : hud.dashCooldownRatio > 0
                      ? `${Math.ceil(hud.dashCooldownRatio * 5)}d`
                      : 'NOS KOMBO'}
                  </span>
                </button>

                {/* Tombol Utama TEMBAK LASER (Tekan / Tahan) */}
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    handleFirePressStart();
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    handleFirePressEnd();
                  }}
                  onPointerCancel={(e) => {
                    e.stopPropagation();
                    handleFirePressEnd();
                  }}
                  style={{ touchAction: 'none' }}
                  className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full border-3 flex flex-col items-center justify-center text-center shadow-xl transition-transform active:scale-95 cursor-pointer ${
                    isHoldingFire
                      ? 'bg-rose-500 border-white text-white scale-95'
                      : 'bg-gradient-to-b from-rose-500 to-red-700 border-rose-200 text-white hover:from-rose-400 hover:to-red-600'
                  }`}
                >
                  <span className="text-2xl sm:text-3xl leading-none">🔥</span>
                  <span className="text-xs sm:text-sm font-display font-extrabold tracking-wide mt-1">
                    TEMBAK
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          3. PAUSE MODAL
         ==================================================================== */}
      {gameState === 'PAUSED' && !showNumberGuideModal && (
        <div className="absolute inset-0 bg-[#070B19]/88 flex items-center justify-center p-4 sm:p-6 z-20 overflow-y-auto">
          <div className="max-w-md w-full bg-[#0F172A] border-2 border-sky-400 rounded-2xl p-5 sm:p-6 text-center">
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white mb-1.5">
              Permainan Dijeda
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mb-5">
              {currentSector.name} ·{' '}
              {hud.isEndless
                ? `Gelombang ${hud.endlessWave} · Skor ${hud.score}`
                : `Target ${toArabicDigits(hud.collectedCount)} dari ${toArabicDigits(hud.targetCount)} Bintang`}
            </p>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setGameState('PLAYING')}
                className="min-h-[46px] w-full py-2.5 text-sm font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
              >
                Lanjutkan Petualangan
              </button>

              <button
                type="button"
                onClick={() => setShowNumberGuideModal(true)}
                className="min-h-[46px] w-full py-2.5 text-sm font-bold text-sky-200 bg-[#172554] hover:bg-[#1E3A8A] border border-sky-400/50 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
              >
                Buka Rumus &amp; Kamus Angka ١–١٠٠
              </button>

              <button
                type="button"
                onClick={handleRestartSector}
                className="min-h-[46px] w-full py-2.5 text-sm font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
              >
                Ulangi Sektor Ini
              </button>

              <button
                type="button"
                onClick={() => setGameState('TITLE_MENU')}
                className="min-h-[44px] w-full py-2 text-sm font-semibold text-slate-400 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
              >
                Kembali ke Menu Utama
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          4. SECTOR VICTORY / ROUND SUMMARY MODAL
         ==================================================================== */}
      {gameState === 'SECTOR_VICTORY' && (
        <div className="absolute inset-0 bg-[#070B19]/92 flex items-center justify-center p-3.5 sm:p-6 z-20 overflow-y-auto">
          <div className="max-w-2xl w-full max-h-[92dvh] overflow-y-auto bg-[#0F172A] border-2 border-emerald-400 rounded-2xl p-4 sm:p-7 text-center">
            <div className="text-xs font-bold text-emerald-300 mb-1">
              {currentSector.hasBossAtEnd
                ? 'RAJA MONSTER KALAH! GERBANG SEKTOR FINAL TERBUKA! · مُمْتَازٌ'
                : 'MISI SEKTOR BERHASIL! SEKTOR BERIKUTNYA TERBUKA! · مُمْتَازٌ'}
            </div>
            <h2 className="text-xl sm:text-3xl font-display font-extrabold text-white mb-1.5">
              Selamat! Kamu Menguasai {currentSector.shortLabel}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mb-4">
              Skor Akhir:{' '}
              <span className="font-mono-tabular font-bold text-amber-300">{hud.score}</span> · Ketuk
              angka di bawah untuk mendengarkan ulang pelafalannya:
            </p>

            {/* Interactive Review Grid of Collected Numbers */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5 text-left">
              {(sectorHistory.length > 0
                ? sectorHistory
                : currentSector.numberSequence.map((n) => ARABIC_NUMBERS[n] || ARABIC_NUMBERS[1])
              ).map((item, idx) => (
                <button
                  key={`${item.value}-${idx}`}
                  type="button"
                  onClick={() => soundEngine.speakArabicNumber(item, true)}
                  className="p-2.5 sm:p-3 rounded-xl bg-[#16203B] border-2 border-slate-700 hover:border-amber-400 transition-colors flex flex-col items-center text-center cursor-pointer"
                >
                  <span
                    className="text-2xl font-display font-extrabold"
                    style={{ color: item.color }}
                  >
                    {item.arabicNumeral}
                  </span>
                  <span className="text-sm sm:text-base font-bold text-white mt-0.5">
                    {item.arabicWord}
                  </span>
                  <span className="text-xs font-semibold text-amber-300 mt-0.5">
                    {item.transliteration}
                  </span>
                  <span className="text-[11px] text-slate-300">
                    {item.indonesianMeaning} ({item.value}) · 🔊
                  </span>
                </button>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={handleNextSector}
                className="min-h-[48px] px-6 py-2.5 text-sm sm:text-base font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {sectorIndex === 4
                  ? '🔥 Masuk Gerbang Sektor Final Tanpa Akhir!'
                  : '🚀 Lanjut ke Sektor Berikutnya'}
              </button>

              <button
                type="button"
                onClick={handleRestartSector}
                className="min-h-[44px] px-5 py-2.5 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Main Lagi Sektor Ini
              </button>

              <button
                type="button"
                onClick={() => setGameState('TITLE_MENU')}
                className="min-h-[44px] px-5 py-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Menu Utama
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          5. GAME OVER MODAL
         ==================================================================== */}
      {gameState === 'GAME_OVER' && (
        <div className="absolute inset-0 bg-[#070B19]/92 flex items-center justify-center p-4 sm:p-6 z-20">
          <div className="max-w-md w-full bg-[#0F172A] border-2 border-rose-400 rounded-2xl p-5 sm:p-6 text-center">
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white mb-2">
              {hud.isEndless ? 'Sektor Final Selesai! Rekor Baru!' : 'Perisai Bintang Habis!'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mb-5">
              {hud.isEndless ? (
                <>
                  Luar biasa Kapten Nujum! Kamu bertahan hingga{' '}
                  <span className="font-bold text-amber-300">Gelombang {hud.endlessWave}</span>,
                  menghancurkan <span className="font-bold text-rose-300">{hud.destroyedCount}</span>{' '}
                  musuh dengan total skor{' '}
                  <span className="font-mono-tabular font-bold text-emerald-300">{hud.score}</span>{' '}
                  (Rekor Tertinggi: {highScore})!
                </>
              ) : (
                <>
                  Jangan menyerah Kapten Nujum! Kamu sudah mengumpulkan{' '}
                  <span className="font-bold text-amber-300">
                    {toArabicDigits(hud.collectedCount)} ({hud.collectedCount})
                  </span>{' '}
                  bintang dengan skor{' '}
                  <span className="font-mono-tabular font-bold text-emerald-300">{hud.score}</span>.
                </>
              )}
            </p>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleRestartSector}
                className="min-h-[46px] w-full py-2.5 text-sm font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
              >
                {hud.isEndless ? '🔥 Main Lagi Arena Tanpa Akhir!' : 'Coba Lagi Sektor Ini'}
              </button>

              <button
                type="button"
                onClick={() => setGameState('TITLE_MENU')}
                className="min-h-[46px] w-full py-2.5 text-sm font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
              >
                Kembali ke Menu Utama
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          6. INTERACTIVE RUMUS & KAMUS ANGKA ARAB MODAL (Satuan 1-10, Belasan 11-20, Puluhan 10-100)
         ==================================================================== */}
      {showNumberGuideModal && (
        <div className="absolute inset-0 bg-[#070B19]/94 flex items-center justify-center p-3 sm:p-6 z-30 overflow-y-auto">
          <div className="max-w-4xl w-full max-h-[92dvh] overflow-y-auto bg-[#0F172A] border-2 border-amber-400 rounded-2xl p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="min-w-0">
                <h2 className="text-base sm:text-2xl font-display font-extrabold text-white truncate">
                  Rumus &amp; Suara Angka Arab (١ – ١٠٠)
                </h2>
                <p className="text-[11px] sm:text-sm text-slate-300">
                  Pilih kategori rumus dan ketuk angka untuk mendengar pelafalan Bahasa Arab.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowNumberGuideModal(false)}
                className="min-h-[42px] px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                Tutup
              </button>
            </div>

            {/* 3 Interactive Category Filter Tabs: Satuan, Belasan, Puluhan */}
            <div className="grid grid-cols-3 gap-2 my-3.5">
              <button
                type="button"
                onClick={() => {
                  setGuideTab('SATUAN');
                  setSelectedGuideNumber(ARABIC_NUMBERS[1]);
                  soundEngine.speakArabicNumber(ARABIC_NUMBERS[1], true);
                }}
                className={`min-h-[44px] px-2.5 py-2 rounded-xl border-2 text-xs sm:text-sm font-bold transition-colors whitespace-nowrap truncate cursor-pointer ${
                  guideTab === 'SATUAN'
                    ? 'bg-sky-500 text-slate-950 border-white'
                    : 'bg-[#111A36] text-sky-200 border-slate-700 hover:border-sky-400'
                }`}
              >
                ١–١٠ Satuan
              </button>

              <button
                type="button"
                onClick={() => {
                  setGuideTab('BELASAN');
                  setSelectedGuideNumber(ARABIC_NUMBERS[11]);
                  soundEngine.speakArabicNumber(ARABIC_NUMBERS[11], true);
                }}
                className={`min-h-[44px] px-2.5 py-2 rounded-xl border-2 text-xs sm:text-sm font-bold transition-colors whitespace-nowrap truncate cursor-pointer ${
                  guideTab === 'BELASAN'
                    ? 'bg-violet-400 text-slate-950 border-white'
                    : 'bg-[#111A36] text-violet-200 border-slate-700 hover:border-violet-400'
                }`}
              >
                ١١–٢٠ Belasan
              </button>

              <button
                type="button"
                onClick={() => {
                  setGuideTab('PULUHAN');
                  setSelectedGuideNumber(ARABIC_NUMBERS[20]);
                  soundEngine.speakArabicNumber(ARABIC_NUMBERS[20], true);
                }}
                className={`min-h-[44px] px-2.5 py-2 rounded-xl border-2 text-xs sm:text-sm font-bold transition-colors whitespace-nowrap truncate cursor-pointer ${
                  guideTab === 'PULUHAN'
                    ? 'bg-emerald-400 text-slate-950 border-white'
                    : 'bg-[#111A36] text-emerald-200 border-slate-700 hover:border-emerald-400'
                }`}
              >
                ١٠–١٠٠ Puluhan
              </button>
            </div>

            {/* Dynamic Formula Explanation Box */}
            <div className="p-3 sm:p-4 rounded-xl bg-[#0B1229] border border-slate-700 mb-3.5 text-left">
              {guideTab === 'SATUAN' && (
                <div>
                  <div className="text-xs sm:text-sm font-bold text-sky-300">
                    Rumus Dasar Satuan (١ – ١٠):
                  </div>
                  <p className="text-xs text-slate-200 mt-0.5 leading-relaxed">
                    Angka Arab ditulis dari <span className="font-bold text-amber-300">kiri ke kanan</span>{' '}
                    (sama seperti angka Latin). Angka ١٠ dibentuk dari tiang{' '}
                    <span className="font-bold text-white">١ (1)</span> di kiri dan titik{' '}
                    <span className="font-bold text-white">٠ (0)</span> di kanan ={' '}
                    <span className="font-bold text-amber-300">١٠ (‘Asyaratun)</span>.
                  </p>
                </div>
              )}

              {guideTab === 'BELASAN' && (
                <div>
                  <div className="text-xs sm:text-sm font-bold text-violet-300">
                    Rumus Cepat Belasan (١١ – ١٩): [Angka Satuan] + عَشَرَ (‘Asyara = Belas)
                  </div>
                  <p className="text-xs text-slate-200 mt-0.5 leading-relaxed">
                    Untuk angka ١٣–١٩, cukup sebutkan angka satuannya (٣–٩) lalu tambahkan{' '}
                    <span className="font-bold text-amber-300">عَشَرَ (‘Asyara)</span>! Contoh:{' '}
                    <span className="font-bold text-white">خَمْسَةَ (5) + عَشَرَ (Belas) = ١٥ (Khamsata ‘Asyara)</span>.
                    Khusus ١١ memakai <span className="text-sky-300 font-semibold">Aḥada ‘Asyara</span> dan
                    ١٢ memakai <span className="text-emerald-300 font-semibold">Itsnā ‘Asyara</span>.
                  </p>
                </div>
              )}

              {guideTab === 'PULUHAN' && (
                <div>
                  <div className="text-xs sm:text-sm font-bold text-emerald-300">
                    Rumus Cepat Puluhan (٢٠ – ٩٠): [Kata Dasar ٣–٩] + Akhiran ـُونَ (-ūna = Puluh)
                  </div>
                  <p className="text-xs text-slate-200 mt-0.5 leading-relaxed">
                    Hilangkan akhiran <em>-atun</em> pada angka satuan lalu ganti dengan{' '}
                    <span className="font-bold text-amber-300">ـُونَ (-ūna)</span>! Contoh:{' '}
                    <span className="font-bold text-white">ثَلَاثَةٌ (Tsalātsatun = 3) → ٣٠ ثَلَاثُونَ (Tsalātsūna = 30)</span>,{' '}
                    <span className="font-bold text-white">خَمْسَةٌ (5) → ٥٠ خَمْسُونَ (Khamsūna = 50)</span>, dan{' '}
                    <span className="font-bold text-amber-300">١٠٠ = مِائَةٌ (Mi’atun = Seratus)</span>!
                  </p>
                </div>
              )}
            </div>

            {/* Featured Number Spotlight */}
            <div className="mb-3.5 sm:mb-5 p-3.5 sm:p-4 rounded-xl bg-[#162246] border-2 border-sky-400/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3.5 sm:gap-5 min-w-0">
                <div
                  className="w-16 h-14 sm:w-20 sm:h-20 px-1 rounded-2xl flex items-center justify-center text-2xl sm:text-4xl font-display font-extrabold text-slate-950 border-2 border-white shrink-0"
                  style={{ backgroundColor: selectedGuideNumber.color }}
                >
                  {selectedGuideNumber.arabicNumeral}
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-xl sm:text-3xl font-bold text-white">
                      {selectedGuideNumber.arabicWord}
                    </span>
                    <span className="text-base sm:text-xl font-bold text-amber-300">
                      {selectedGuideNumber.transliteration}
                    </span>
                    <span className="text-xs sm:text-sm font-semibold text-emerald-300">
                      = {selectedGuideNumber.indonesianMeaning} ({selectedGuideNumber.value})
                    </span>
                  </div>

                  <div className="text-xs sm:text-sm text-sky-200 mt-0.5">
                    Cara Baca:{' '}
                    <span className="font-bold text-white">{selectedGuideNumber.syllables}</span>
                  </div>

                  {selectedGuideNumber.formulaNote && (
                    <div className="text-xs font-semibold text-amber-200 mt-0.5">
                      {selectedGuideNumber.formulaNote}
                    </div>
                  )}

                  <div className="text-[11px] sm:text-xs text-slate-300 mt-0.5">
                    Tips: {selectedGuideNumber.mnemonic}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => soundEngine.speakArabicNumber(selectedGuideNumber, true)}
                className="min-h-[44px] w-full sm:w-auto px-4 py-2.5 text-xs sm:text-sm font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-transform active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
              >
                🔊 Putar Suara &ldquo;{selectedGuideNumber.transliteration}&rdquo;
              </button>
            </div>

            {/* Grid of Numbers in Active Category */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
              {currentGuideList.map((item) => {
                const isSelected = selectedGuideNumber.value === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => {
                      setSelectedGuideNumber(item);
                      soundEngine.speakArabicNumber(item, true);
                    }}
                    className={`p-2.5 sm:p-3.5 rounded-xl border-2 text-left transition-transform cursor-pointer ${
                      isSelected
                        ? 'bg-[#1E293B] border-amber-400 scale-[1.01]'
                        : 'bg-[#0B1229] border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span
                        className="text-2xl sm:text-3xl font-display font-extrabold"
                        style={{ color: item.color }}
                      >
                        {item.arabicNumeral}
                      </span>
                      <span className="text-[11px] font-mono-tabular text-slate-400">
                        Angka {item.value}
                      </span>
                    </div>
                    <div className="text-base sm:text-lg font-bold text-white">{item.arabicWord}</div>
                    <div className="text-xs font-bold text-amber-300 mt-0.5">{item.syllables}</div>
                    <div className="text-[11px] text-slate-300 mt-0.5">
                      {item.indonesianMeaning} · 🔊
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
