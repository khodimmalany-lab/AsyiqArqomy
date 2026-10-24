import React, { useEffect, useRef } from 'react';
import {
  ALL_ARABIC_VALUES,
  ARABIC_NUMBERS,
  ArabicNumberInfo,
  SPACE_SECTORS,
  SpaceSector,
  toArabicDigits,
} from '../data/arabicNumbers';
import { soundEngine } from '../audio/soundEngine';

export type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'SECTOR_VICTORY' | 'GAME_OVER';

export interface HudSnapshot {
  collectedCount: number;
  targetCount: number;
  shields: number;
  maxShields: number;
  score: number;
  destroyedCount: number;
  autoFire: boolean;
  lastCollectedNumber: ArabicNumberInfo | null;
  nextExpectedNumber: ArabicNumberInfo | null;
  portalActive: boolean;
  dashCooldownRatio: number;
  nosActive: boolean;
  comboStreak: number;
  bossActive: boolean;
  bossHp: number;
  bossMaxHp: number;
  bossName: string;
  isEndless: boolean;
  endlessWave: number;
  lastAdditionEquation: string;
  lastAdditionLatin: string;
}

interface SpaceCanvasProps {
  gameState: GameState;
  sectorIndex: number;
  resetTrigger: number;
  onHudUpdate: (hud: HudSnapshot) => void;
  onSectorComplete: (finalScore: number, collectedNumbers: ArabicNumberInfo[]) => void;
  onGameOver: (finalScore: number) => void;
  onTogglePause: () => void;
}

interface Star {
  x: number;
  y: number;
  z: number;
  size: number;
  twinklePhase: number;
  color: string;
}

interface CollectibleOrb {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  assignedNumber: number;
  crystalValue: number;
  collected: boolean;
  bobPhase: number;
  wrongBounceTimer: number;
  cageHp: number;
  maxCageHp: number;
  hitFlash: number;
}

interface HazardEntity {
  id: number;
  type: 'ASTEROID' | 'DRONE' | 'CHASER';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  hitFlash: number;
  angle: number;
  spinSpeed: number;
  state: 'PATROL' | 'WINDUP' | 'DASH' | 'RESPAWNING';
  stateTimer: number;
  shootCooldown: number;
  targetX: number;
  targetY: number;
}

interface BossEntity {
  active: boolean;
  defeated: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  hitFlash: number;
  phaseAngle: number;
  attackTimer: number;
  attackPattern: number;
  name: string;
}

interface LaserBolt {
  active: boolean;
  isEnemy: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  life: number;
  maxLife: number;
  color: string;
}

interface ShockwaveRing {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
}

interface HeartPickup {
  id: number;
  x: number;
  y: number;
  bobPhase: number;
  active: boolean;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

interface FloatingText {
  x: number;
  y: number;
  vy: number;
  arabicNumeral: string;
  arabicWord: string;
  transliteration: string;
  meaning: string;
  color: string;
  life: number;
  maxLife: number;
}

const WORLD_WIDTH = 2200;
const WORLD_HEIGHT = 1400;

export const SpaceCanvas: React.FC<SpaceCanvasProps> = ({
  gameState,
  sectorIndex,
  resetTrigger,
  onHudUpdate,
  onSectorComplete,
  onGameOver,
  onTogglePause,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const gameStateRef = useRef<GameState>(gameState);
  const sectorIndexRef = useRef<number>(sectorIndex);
  const onHudUpdateRef = useRef(onHudUpdate);
  const onSectorCompleteRef = useRef(onSectorComplete);
  const onGameOverRef = useRef(onGameOver);
  const onTogglePauseRef = useRef(onTogglePause);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    sectorIndexRef.current = sectorIndex;
  }, [sectorIndex]);

  useEffect(() => {
    onHudUpdateRef.current = onHudUpdate;
    onSectorCompleteRef.current = onSectorComplete;
    onGameOverRef.current = onGameOver;
    onTogglePauseRef.current = onTogglePause;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleResize = () => {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    // Input state
    const heldKeys = new Set<string>();
    const justPressedKeys = new Set<string>();
    let dashBufferTimer = 0;
    let manualFireHeld = false;
    let manualFireBurstTimer = 0;
    let autoFireEnabled = true;

    // Virtual corner joystick vector (-1..1) driven by mobile D-Pad / Joystick
    const virtualJoy = { x: 0, y: 0 };

    const pointer = {
      active: false,
      screenX: 0,
      screenY: 0,
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      if (!heldKeys.has(code)) {
        justPressedKeys.add(code);
      }
      heldKeys.add(code);

      if (code === 'Space' || code === 'KeyK') {
        dashBufferTimer = 0.18;
      }
      if (code === 'KeyF') {
        autoFireEnabled = !autoFireEnabled;
        syncHud();
      }
      if (code === 'Escape' && (gameStateRef.current === 'PLAYING' || gameStateRef.current === 'PAUSED')) {
        e.preventDefault();
        onTogglePauseRef.current();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      heldKeys.delete(e.code);
    };

    const onBlur = () => {
      heldKeys.clear();
      justPressedKeys.clear();
      pointer.active = false;
      manualFireHeld = false;
      virtualJoy.x = 0;
      virtualJoy.y = 0;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (gameStateRef.current !== 'PLAYING') return;
      pointer.active = true;
      pointer.screenX = e.clientX;
      pointer.screenY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointer.active) return;
      pointer.screenX = e.clientX;
      pointer.screenY = e.clientY;
    };

    const onPointerUp = () => {
      pointer.active = false;
    };

    const onTriggerMagnetDash = () => {
      dashBufferTimer = 0.2;
      manualFireBurstTimer = 1.2;
    };

    const onToggleAutoFire = () => {
      autoFireEnabled = !autoFireEnabled;
      syncHud();
    };

    const onTriggerFireBurst = () => {
      manualFireBurstTimer = 0.65;
    };

    const onHoldFireChange = (e: Event) => {
      const custom = e as CustomEvent<{ held: boolean }>;
      if (custom.detail) {
        manualFireHeld = Boolean(custom.detail.held);
      }
    };

    const onVirtualJoystick = (e: Event) => {
      const custom = e as CustomEvent<{ x: number; y: number }>;
      if (custom.detail) {
        virtualJoy.x = custom.detail.x;
        virtualJoy.y = custom.detail.y;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('trigger-magnet-dash', onTriggerMagnetDash);
    window.addEventListener('toggle-auto-fire', onToggleAutoFire);
    window.addEventListener('trigger-fire-burst', onTriggerFireBurst);
    window.addEventListener('hold-fire-change', onHoldFireChange);
    window.addEventListener('virtual-joystick', onVirtualJoystick);
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // Pooled 3D Voxel Particles (240 max)
    const particlePool: Particle[] = Array.from({ length: 240 }, () => ({
      active: false,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      size: 5,
      color: '#38BDF8',
      alpha: 1,
      life: 0,
      maxLife: 0.5,
    }));

    const spawnParticles = (
      x: number,
      y: number,
      color: string,
      count: number,
      speedMin: number = 60,
      speedMax: number = 280,
      size: number = 5
    ) => {
      let spawned = 0;
      for (let i = 0; i < particlePool.length && spawned < count; i++) {
        const p = particlePool[i];
        if (!p.active) {
          const angle = Math.random() * Math.PI * 2;
          const speed = speedMin + Math.random() * (speedMax - speedMin);
          p.active = true;
          p.x = x;
          p.y = y;
          p.z = 4 + Math.random() * 14;
          p.vx = Math.cos(angle) * speed;
          p.vy = Math.sin(angle) * speed;
          p.vz = 40 + Math.random() * 90;
          p.size = size + Math.floor(Math.random() * 4);
          p.color = color;
          p.alpha = 1;
          p.life = 0;
          p.maxLife = 0.35 + Math.random() * 0.35;
          spawned++;
        }
      }
    };

    // Pooled Projectiles (Player Twin/Spread Lasers + Enemy Plasma Shots: 120 max)
    const laserPool: LaserBolt[] = Array.from({ length: 120 }, () => ({
      active: false,
      isEnemy: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      angle: 0,
      radius: 7,
      life: 0,
      maxLife: 0.85,
      color: '#38BDF8',
    }));

    const spawnLaserBolt = (
      x: number,
      y: number,
      angle: number,
      color: string = '#38BDF8',
      isEnemy: boolean = false,
      speed: number = 840,
      maxLife: number = 0.78
    ) => {
      for (let i = 0; i < laserPool.length; i++) {
        const b = laserPool[i];
        if (!b.active) {
          b.active = true;
          b.isEnemy = isEnemy;
          b.x = x;
          b.y = y;
          b.vx = Math.cos(angle) * speed;
          b.vy = Math.sin(angle) * speed;
          b.angle = angle;
          b.radius = isEnemy ? 10 : 7;
          b.life = 0;
          b.maxLife = maxLife;
          b.color = color;
          break;
        }
      }
    };

    // Pooled 3D Shockwave Rings (24 max)
    const shockwaves: ShockwaveRing[] = Array.from({ length: 24 }, () => ({
      active: false,
      x: 0,
      y: 0,
      radius: 8,
      maxRadius: 90,
      color: '#38BDF8',
      alpha: 1,
    }));

    const spawnShockwave = (x: number, y: number, maxRadius: number, color: string) => {
      for (let i = 0; i < shockwaves.length; i++) {
        const sw = shockwaves[i];
        if (!sw.active) {
          sw.active = true;
          sw.x = x;
          sw.y = y;
          sw.radius = 10;
          sw.maxRadius = maxRadius;
          sw.color = color;
          sw.alpha = 1;
          break;
        }
      }
    };

    // Multi-layer 3D Z-Depth Starfield
    const stars: Star[] = Array.from({ length: 240 }, (_, i) => {
      const z = i % 3 === 0 ? 0.28 : i % 3 === 1 ? 0.62 : 1.05;
      const palette = ['#F8FAFC', '#bae6fd', '#fde68a', '#ddd6fe', '#99f6e4'];
      return {
        x: Math.random() * WORLD_WIDTH,
        y: Math.random() * WORLD_HEIGHT,
        z,
        size: z > 0.8 ? 4 : z > 0.5 ? 3 : 2,
        twinklePhase: Math.random() * Math.PI * 2,
        color: palette[i % palette.length],
      };
    });

    // 2.5D Player Starfighter State
    const player = {
      x: WORLD_WIDTH * 0.5,
      y: WORLD_HEIGHT * 0.55,
      vx: 0,
      vy: 0,
      aimAngle: -Math.PI * 0.5,
      bankAngle: 0,
      radius: 26,
      scaleX: 1,
      scaleY: 1,
      shields: 4,
      maxShields: 4,
      invulnTimer: 0,
      hitFlashTimer: 0,
      dashTimer: 0,
      nosComboTimer: 0, // Active NOS + 5-way Spread Laser Overdrive!
      dashCooldown: 0,
      tractorPulseTimer: 0,
      jetpackFlamePhase: 0,
      fireCooldown: 0,
      muzzleFlashTimer: 0,
    };

    // Boss Monster State ("RAJA MONSTER KOSMIK: AL-WAHSY")
    const boss: BossEntity = {
      active: false,
      defeated: false,
      x: WORLD_WIDTH * 0.5,
      y: 320,
      vx: 95,
      vy: 45,
      radius: 68,
      hp: 100,
      maxHp: 100,
      hitFlash: 0,
      phaseAngle: 0,
      attackTimer: 1.8,
      attackPattern: 0,
      name: 'RAJA MONSTER KOSMIK: AL-WAHSY',
    };

    const camera = {
      x: WORLD_WIDTH * 0.5,
      y: WORLD_HEIGHT * 0.5,
      shakeMagnitude: 0,
      shakeX: 0,
      shakeY: 0,
      titlePanAngle: 0,
    };

    const warpPortal = {
      x: WORLD_WIDTH * 0.5,
      y: 250,
      radius: 64,
      active: false,
      spinAngle: 0,
    };

    let orbs: CollectibleOrb[] = [];
    let hazards: HazardEntity[] = [];
    let heartPickups: HeartPickup[] = [];
    let floatingTexts: FloatingText[] = [];
    let collectedCount = 0;
    let destroyedCount = 0;
    let endlessWave = 1;
    let score = 0;
    let comboStreak = 0;
    let lastCollectedNumber: ArabicNumberInfo | null = null;
    let lastAdditionEquation = '٠ + ١ = ١';
    let lastAdditionLatin = '0 + 1 = 1';
    let collectedHistory: ArabicNumberInfo[] = [];
    let hitstopTimer = 0;
    let currentSector: SpaceSector = SPACE_SECTORS[0];
    let lockedTarget: { x: number; y: number; radius: number; label: string; color: string } | null = null;
    let nextOrbId = 100;

    const getSequenceNumberAt = (index: number): number => {
      if (currentSector.isEndlessFinal) {
        return ALL_ARABIC_VALUES[index % ALL_ARABIC_VALUES.length];
      }
      if (!currentSector.orderedMode) {
        // In Addition Challenge mode (Sectors 1 & 2), index is the current crystal sum
        const nextSum = Math.min(currentSector.targetCount, index + 1);
        return nextSum;
      }
      const seq = currentSector.numberSequence;
      if (!seq || seq.length === 0) return index + 1;
      const clampedIdx = Math.max(0, Math.min(seq.length - 1, index));
      return seq[clampedIdx];
    };

    const syncHud = () => {
      const nextNumVal = getSequenceNumberAt(collectedCount);
      onHudUpdateRef.current({
        collectedCount,
        targetCount: currentSector.targetCount,
        shields: player.shields,
        maxShields: player.maxShields,
        score,
        destroyedCount,
        autoFire: autoFireEnabled,
        lastCollectedNumber,
        nextExpectedNumber: ARABIC_NUMBERS[nextNumVal] || ARABIC_NUMBERS[1],
        portalActive: warpPortal.active,
        dashCooldownRatio: Math.min(1, Math.max(0, player.dashCooldown / 2.2)),
        nosActive: player.nosComboTimer > 0,
        comboStreak,
        bossActive: boss.active,
        bossHp: Math.max(0, boss.hp),
        bossMaxHp: boss.maxHp,
        bossName: boss.name,
        isEndless: Boolean(currentSector.isEndlessFinal),
        endlessWave,
        lastAdditionEquation,
        lastAdditionLatin,
      });
    };

    const spawnBossMonster = (waveMultiplier: number = 1) => {
      boss.active = true;
      boss.defeated = false;
      boss.x = WORLD_WIDTH * 0.5;
      boss.y = Math.max(240, player.y - 420);
      boss.vx = 115;
      boss.vy = 55;
      boss.maxHp = Math.round(90 * waveMultiplier);
      boss.hp = boss.maxHp;
      boss.hitFlash = 0;
      boss.attackTimer = 1.5;
      boss.attackPattern = 0;
      boss.name = currentSector.isEndlessFinal
        ? `BOS GELOMBANG ${toArabicDigits(endlessWave)}: AL-WAHSY`
        : 'RAJA MONSTER KOSMIK: AL-WAHSY';

      soundEngine.playBossWarning();
      spawnShockwave(boss.x, boss.y, 180, '#F43F5E');
      spawnParticles(boss.x, boss.y, '#F43F5E', 45, 90, 340, 7);

      floatingTexts.push({
        x: player.x,
        y: player.y - 60,
        vy: -25,
        arabicNumeral: '⚠️ BOS MUNCUL!',
        arabicWord: 'الوَحْشُ الكَوْنِي',
        transliteration: 'Kalahkan Monster untuk Buka Gerbang Final!',
        meaning: 'Gunakan NOS Kombo 🚀',
        color: '#F43F5E',
        life: 0,
        maxLife: 3.0,
      });
      syncHud();
    };

    const initSectorWorld = (secIdx: number) => {
      currentSector = SPACE_SECTORS[secIdx] || SPACE_SECTORS[0];
      player.x = WORLD_WIDTH * 0.5;
      player.y = WORLD_HEIGHT * 0.65;
      player.vx = 0;
      player.vy = 0;
      player.aimAngle = -Math.PI * 0.5;
      player.bankAngle = 0;
      player.scaleX = 1;
      player.scaleY = 1;
      player.shields = 4;
      player.maxShields = 4;
      player.invulnTimer = 1.2;
      player.hitFlashTimer = 0;
      player.dashTimer = 0;
      player.nosComboTimer = 0;
      player.dashCooldown = 0;
      player.fireCooldown = 0;
      player.muzzleFlashTimer = 0;

      boss.active = false;
      boss.defeated = false;

      warpPortal.x = WORLD_WIDTH * 0.5;
      warpPortal.y = 230;
      warpPortal.active = false;

      collectedCount = 0;
      destroyedCount = 0;
      endlessWave = 1;
      score = 0;
      comboStreak = 0;
      lastCollectedNumber = null;
      lastAdditionEquation =
        currentSector.id === 5
          ? '٠ + ١٠ = ١٠'
          : currentSector.id === 4
          ? '١٠ + ١ = ١١'
          : `٠ + ... = ${toArabicDigits(currentSector.targetCount)}`;
      lastAdditionLatin =
        currentSector.id === 5
          ? '0 + 10 = 10'
          : currentSector.id === 4
          ? '10 + 1 = 11'
          : `Target Penjumlahan: ${currentSector.targetCount} Kristal`;
      collectedHistory = [];
      floatingTexts = [];
      hitstopTimer = 0;

      for (let i = 0; i < laserPool.length; i++) laserPool[i].active = false;
      for (let i = 0; i < shockwaves.length; i++) shockwaves[i].active = false;

      // Spawn Collectible Orbs (With Star Crystal Addition Clusters in Sectors 1 & 2)
      orbs = [];
      if (!currentSector.orderedMode && !currentSector.isEndlessFinal) {
        // Addition Challenge Mode: Spawn +1 single crystals and +2 bonus crystal clusters!
        const crystalValues =
          currentSector.id === 1
            ? [1, 1, 1, 1, 1, 2, 2] // Target = 5 crystals (can combine e.g. 1+2+2=5 or 1+1+1+2=5 or five 1s)
            : [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 3]; // Target = 10 crystals
        const count = crystalValues.length;
        for (let idx = 0; idx < count; idx++) {
          const cVal = crystalValues[idx];
          const angle = (idx / count) * Math.PI * 2 - Math.PI * 0.5;
          const ringRx = 490 + (idx % 2) * 230;
          const ringRy = 300 + (idx % 3) * 115;
          const cx = WORLD_WIDTH * 0.5 + Math.cos(angle) * ringRx;
          const cy = WORLD_HEIGHT * 0.52 + Math.sin(angle) * ringRy;
          const hasCrystalCage = cVal >= 2 || idx % 3 === 1;

          orbs.push({
            id: idx + 1,
            x: Math.max(160, Math.min(WORLD_WIDTH - 160, cx)),
            y: Math.max(180, Math.min(WORLD_HEIGHT - 160, cy)),
            vx: (Math.random() - 0.5) * 28,
            vy: (Math.random() - 0.5) * 28,
            radius: cVal >= 2 ? 36 : 32,
            assignedNumber: cVal,
            crystalValue: cVal,
            collected: false,
            bobPhase: idx * 0.9,
            wrongBounceTimer: 0,
            cageHp: hasCrystalCage ? 2 : 0,
            maxCageHp: hasCrystalCage ? 2 : 0,
            hitFlash: 0,
          });
        }
      } else {
        const seq = currentSector.numberSequence;
        const count = seq.length;
        for (let idx = 0; idx < count; idx++) {
          const assignedVal = seq[idx];
          const angle = (idx / count) * Math.PI * 2 - Math.PI * 0.5;
          const ringRx = 520 + (idx % 2) * 220;
          const ringRy = 320 + (idx % 3) * 110;
          const cx = WORLD_WIDTH * 0.5 + Math.cos(angle) * ringRx;
          const cy = WORLD_HEIGHT * 0.52 + Math.sin(angle) * ringRy;
          const hasCrystalCage = idx > 0 && idx % 2 === 1;

          orbs.push({
            id: idx + 1,
            x: Math.max(160, Math.min(WORLD_WIDTH - 160, cx)),
            y: Math.max(180, Math.min(WORLD_HEIGHT - 160, cy)),
            vx: (Math.random() - 0.5) * 28,
            vy: (Math.random() - 0.5) * 28,
            radius: 32,
            assignedNumber: assignedVal,
            crystalValue: currentSector.id === 5 ? 10 : 1,
            collected: false,
            bobPhase: idx * 0.9,
            wrongBounceTimer: 0,
            cageHp: hasCrystalCage ? 2 : 0,
            maxCageHp: hasCrystalCage ? 2 : 0,
            hitFlash: 0,
          });
        }
      }

      // Spawn Asteroids, Shooting UFO Drones, and Chaser Interceptors scaled by sector difficulty
      hazards = [];
      const aggr = currentSector.enemyAggression;
      const totalAsteroids = currentSector.asteroidCount + 2;
      for (let i = 0; i < totalAsteroids; i++) {
        const angle = (i / totalAsteroids) * Math.PI * 2 + 0.4;
        const dist = 390 + (i % 3) * 210;
        const maxHp = 2 + Math.floor(aggr * 0.5);
        hazards.push({
          id: 100 + i,
          type: 'ASTEROID',
          x: WORLD_WIDTH * 0.5 + Math.cos(angle) * dist,
          y: WORLD_HEIGHT * 0.5 + Math.sin(angle) * (dist * 0.65),
          vx: (Math.random() - 0.5) * (70 + aggr * 12),
          vy: (Math.random() - 0.5) * (70 + aggr * 12),
          radius: 30 + (i % 2) * 8,
          hp: maxHp,
          maxHp,
          hitFlash: 0,
          angle: Math.random() * Math.PI * 2,
          spinSpeed: (Math.random() > 0.5 ? 1 : -1) * (0.7 + Math.random() * 0.8),
          state: 'PATROL',
          stateTimer: 0,
          shootCooldown: 99,
          targetX: 0,
          targetY: 0,
        });
      }

      const totalDrones = currentSector.droneCount + 1;
      for (let i = 0; i < totalDrones; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const maxHp = 3 + Math.floor(aggr * 0.6);
        hazards.push({
          id: 200 + i,
          type: 'DRONE',
          x: WORLD_WIDTH * 0.5 + side * (520 + i * 110),
          y: 320 + i * 220,
          vx: side * -(60 + aggr * 10),
          vy: 45 + aggr * 6,
          radius: 26,
          hp: maxHp,
          maxHp,
          hitFlash: 0,
          angle: 0,
          spinSpeed: 0,
          state: 'PATROL',
          stateTimer: 2.2 + i * 0.8,
          shootCooldown: 1.8 + i * 0.6,
          targetX: WORLD_WIDTH * 0.5,
          targetY: WORLD_HEIGHT * 0.5,
        });
      }

      const totalChasers = currentSector.chaserCount;
      for (let i = 0; i < totalChasers; i++) {
        const angle = (i / Math.max(1, totalChasers)) * Math.PI * 2;
        const maxHp = 2 + Math.floor(aggr * 0.5);
        hazards.push({
          id: 300 + i,
          type: 'CHASER',
          x: WORLD_WIDTH * 0.5 + Math.cos(angle) * 680,
          y: WORLD_HEIGHT * 0.5 + Math.sin(angle) * 440,
          vx: 0,
          vy: 0,
          radius: 22,
          hp: maxHp,
          maxHp,
          hitFlash: 0,
          angle: 0,
          spinSpeed: 0,
          state: 'PATROL',
          stateTimer: 0,
          shootCooldown: 2.4 + i * 0.7,
          targetX: 0,
          targetY: 0,
        });
      }

      heartPickups = [
        { id: 1, x: 340, y: WORLD_HEIGHT - 260, bobPhase: 0, active: true },
        { id: 2, x: WORLD_WIDTH - 340, y: 320, bobPhase: 2.1, active: true },
        { id: 3, x: WORLD_WIDTH * 0.5, y: WORLD_HEIGHT - 220, bobPhase: 1.1, active: true },
      ];

      syncHud();
    };

    initSectorWorld(sectorIndexRef.current);

    let lastTime = performance.now();
    let animFrameId = 0;

    // ==========================================================================
    // SEMI-3D (2.5D) RENDERING HELPERS
    // ==========================================================================

    const draw3DPerspectiveFloor = (camLeft: number, camTop: number, viewW: number, viewH: number) => {
      ctx.save();
      const gridStep = 180;
      const startX = Math.floor(camLeft / gridStep) * gridStep;
      const startY = Math.floor(camTop / gridStep) * gridStep;

      ctx.strokeStyle = currentSector.isEndlessFinal
        ? 'rgba(244, 63, 94, 0.11)'
        : 'rgba(56, 189, 248, 0.08)';
      ctx.lineWidth = 1.5;

      const camCenterX = camLeft + viewW * 0.5;
      const camCenterY = camTop + viewH * 0.5;

      for (let gx = startX - gridStep; gx <= camLeft + viewW + gridStep; gx += gridStep) {
        const offsetTop = (gx - camCenterX) * -0.06;
        const offsetBot = (gx - camCenterX) * 0.08;
        ctx.beginPath();
        ctx.moveTo(gx + offsetTop, camTop);
        ctx.lineTo(gx + offsetBot, camTop + viewH);
        ctx.stroke();
      }

      for (let gy = startY - gridStep; gy <= camTop + viewH + gridStep; gy += gridStep) {
        const offsetLeft = (gy - camCenterY) * -0.06;
        const offsetRight = (gy - camCenterY) * 0.08;
        ctx.beginPath();
        ctx.moveTo(camLeft, gy + offsetLeft);
        ctx.lineTo(camLeft + viewW, gy + offsetRight);
        ctx.stroke();
      }
      ctx.restore();
    };

    const draw3DPlanet = (
      cx: number,
      cy: number,
      radius: number,
      mainColor: string,
      ringColor?: string,
      isCrescent?: boolean
    ) => {
      ctx.save();
      ctx.translate(Math.floor(cx), Math.floor(cy));

      ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
      ctx.beginPath();
      ctx.arc(16, 22, radius * 1.02, 0, Math.PI * 2);
      ctx.fill();

      const haloGrad = ctx.createRadialGradient(0, 0, radius * 0.7, 0, 0, radius * 1.45);
      haloGrad.addColorStop(0, mainColor + '44');
      haloGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.45, 0, Math.PI * 2);
      ctx.fill();

      if (isCrescent) {
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = currentSector.bgTint;
        ctx.beginPath();
        ctx.arc(radius * 0.38, -radius * 0.18, radius * 0.82, 0, Math.PI * 2);
        ctx.fill();
      } else {
        if (ringColor) {
          ctx.strokeStyle = ringColor + '88';
          ctx.lineWidth = 10;
          ctx.beginPath();
          ctx.ellipse(0, 4, radius * 1.75, radius * 0.42, -0.24, Math.PI, Math.PI * 2);
          ctx.stroke();
        }

        const sphereGrad = ctx.createRadialGradient(
          -radius * 0.35,
          -radius * 0.35,
          radius * 0.1,
          0,
          0,
          radius
        );
        sphereGrad.addColorStop(0, '#FFFFFF');
        sphereGrad.addColorStop(0.25, mainColor);
        sphereGrad.addColorStop(0.85, '#0F172A');
        sphereGrad.addColorStop(1, '#020617');

        ctx.fillStyle = sphereGrad;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();

        if (ringColor) {
          ctx.strokeStyle = ringColor;
          ctx.lineWidth = 10;
          ctx.beginPath();
          ctx.ellipse(0, 4, radius * 1.75, radius * 0.42, -0.24, 0, Math.PI);
          ctx.stroke();
        }
      }

      ctx.restore();
    };

    // Draw 2.5D Boss Monster ("RAJA MONSTER KOSMIK: AL-WAHSY")
    const draw25DBossMonster = (now: number) => {
      if (!boss.active) return;
      ctx.save();
      ctx.translate(Math.floor(boss.x), Math.floor(boss.y));

      const isFlash = boss.hitFlash > 0;

      // 3D Floor Shadow
      ctx.fillStyle = 'rgba(2, 6, 23, 0.65)';
      ctx.beginPath();
      ctx.ellipse(18, 36, boss.radius * 1.15, boss.radius * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();

      // 6 Animated 3D Mechanical Tentacles / Claws
      for (let t = 0; t < 6; t++) {
        const baseAngle = (t / 6) * Math.PI * 2 + boss.phaseAngle * 0.6;
        ctx.save();
        ctx.rotate(baseAngle);
        for (let seg = 1; seg <= 3; seg++) {
          const swing = Math.sin(now * 0.006 + t + seg * 0.7) * 10;
          const dist = boss.radius * 0.65 + seg * 18;
          ctx.fillStyle = isFlash ? '#FFFFFF' : seg === 3 ? '#F43F5E' : '#4C1D95';
          ctx.strokeStyle = '#F43F5E';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(dist, swing, 14 - seg * 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }

      // Lower 3D Armored Carapace
      ctx.fillStyle = isFlash ? '#FFFFFF' : '#3B0764';
      ctx.strokeStyle = '#F43F5E';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 6, boss.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Upper 3D Lit Carapace Dome
      const domeGrad = ctx.createRadialGradient(-20, -20, 8, 0, 0, boss.radius * 0.88);
      domeGrad.addColorStop(0, isFlash ? '#FFFFFF' : '#E11D48');
      domeGrad.addColorStop(0.6, isFlash ? '#FFFFFF' : '#881337');
      domeGrad.addColorStop(1, '#1E1B4B');
      ctx.fillStyle = domeGrad;
      ctx.beginPath();
      ctx.arc(0, -4, boss.radius * 0.88, 0, Math.PI * 2);
      ctx.fill();

      // 3 Fierce Glowing Cyber-Monster Eyes
      ctx.fillStyle = '#FACC15';
      ctx.beginPath();
      ctx.ellipse(-22, -10, 10, 6, 0.25, 0, Math.PI * 2);
      ctx.ellipse(22, -10, 10, 6, -0.25, 0, Math.PI * 2);
      ctx.ellipse(0, -24, 12, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#020617';
      ctx.beginPath();
      ctx.arc(-22, -10, 3.5, 0, Math.PI * 2);
      ctx.arc(22, -10, 3.5, 0, Math.PI * 2);
      ctx.arc(0, -24, 4, 0, Math.PI * 2);
      ctx.fill();

      // Angry Jaw / Plasma Core Mouth
      ctx.fillStyle = '#090D16';
      ctx.strokeStyle = '#FBBF24';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 18, 22, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Nameplate & HP above Boss in World Space
      ctx.fillStyle = '#FDA4AF';
      ctx.font = '800 14px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(boss.name, 0, -boss.radius - 26);

      const barW = 120;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.fillRect(-barW * 0.5, -boss.radius - 18, barW, 10);
      ctx.fillStyle = '#F43F5E';
      ctx.fillRect(
        -barW * 0.5 + 2,
        -boss.radius - 16,
        (barW - 4) * Math.max(0, boss.hp / boss.maxHp),
        6
      );

      ctx.restore();
    };

    const draw25DStarfighter = (now: number) => {
      ctx.save();
      ctx.translate(Math.floor(player.x), Math.floor(player.y));

      if (player.invulnTimer > 0 && Math.floor(player.invulnTimer * 14) % 2 === 0) {
        ctx.globalAlpha = 0.5;
      }

      // 1. 3D Projected Shadow
      ctx.save();
      ctx.translate(16, 26);
      ctx.rotate(player.aimAngle + Math.PI * 0.5);
      ctx.scale(0.85, 0.85);
      ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.lineTo(28, 20);
      ctx.lineTo(0, 12);
      ctx.lineTo(-28, 20);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 2. NOS Overdrive / Magnet Aura
      if (player.nosComboTimer > 0 || player.tractorPulseTimer > 0) {
        const pulseR = player.radius * 3.6 + Math.sin(now * 0.025) * 10;
        ctx.strokeStyle =
          player.nosComboTimer > 0 ? 'rgba(250, 204, 21, 0.7)' : 'rgba(56, 189, 248, 0.5)';
        ctx.lineWidth = 3.5;
        ctx.setLineDash([10, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, pulseR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 3. 3D Energy Shield Bubble
      const shieldColor =
        player.nosComboTimer > 0
          ? 'rgba(250, 204, 21, 0.75)'
          : player.shields >= 3
          ? 'rgba(56, 189, 248, 0.45)'
          : player.shields === 2
          ? 'rgba(251, 191, 36, 0.55)'
          : 'rgba(248, 113, 113, 0.65)';
      ctx.strokeStyle = shieldColor;
      ctx.lineWidth = player.nosComboTimer > 0 ? 3.5 : 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, player.radius + 8, 0, Math.PI * 2);
      ctx.stroke();

      ctx.rotate(player.aimAngle + Math.PI * 0.5);
      const bankSquash = Math.cos(player.bankAngle);
      const bankShift = Math.sin(player.bankAngle) * 7;
      ctx.scale(player.scaleX, player.scaleY);

      const isHitFlash = player.hitFlashTimer > 0;

      // 4. Twin 3D Plasma / NOS Afterburners
      const speed = Math.hypot(player.vx, player.vy);
      const isNos = player.nosComboTimer > 0;
      const flameLen =
        (isNos ? 38 : speed > 25 ? 17 : 9) + Math.sin(player.jetpackFlamePhase) * (isNos ? 8 : 4);
      ctx.fillStyle = isNos ? '#38BDF8' : '#F59E0B';
      ctx.beginPath();
      ctx.moveTo(-13, 16);
      ctx.lineTo(-6, 16);
      ctx.lineTo(-9.5, 16 + flameLen);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(6, 16);
      ctx.lineTo(13, 16);
      ctx.lineTo(9.5, 16 + flameLen);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(-10.5, 16, 3, flameLen * 0.6);
      ctx.fillRect(7.5, 16, 3, flameLen * 0.6);

      // 5. 2.5D Stacked Hull Layers
      const wingSpan = 28 * Math.max(0.62, Math.abs(bankSquash));

      ctx.fillStyle = isHitFlash ? '#FFFFFF' : '#1E293B';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -28);
      ctx.lineTo(wingSpan, 18);
      ctx.lineTo(12, 22);
      ctx.lineTo(-12, 22);
      ctx.lineTo(-wingSpan, 18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isHitFlash ? '#FFFFFF' : isNos ? '#FACC15' : '#38BDF8';
      ctx.fillRect(-wingSpan * 0.68 - 2, -12, 4, 22);
      ctx.fillRect(wingSpan * 0.68 - 2, -12, 4, 22);

      if (player.muzzleFlashTimer > 0) {
        ctx.fillStyle = '#FEF08A';
        ctx.beginPath();
        ctx.arc(-wingSpan * 0.68, -15, 6, 0, Math.PI * 2);
        ctx.arc(wingSpan * 0.68, -15, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      ctx.translate(bankShift * 0.4, -3);
      ctx.fillStyle = isHitFlash ? '#FFFFFF' : '#F8FAFC';
      ctx.strokeStyle = isNos ? '#FACC15' : '#38BDF8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.lineTo(wingSpan * 0.92, 14);
      ctx.lineTo(9, 18);
      ctx.lineTo(-9, 18);
      ctx.lineTo(-wingSpan * 0.92, 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isHitFlash ? '#FFFFFF' : '#FACC15';
      ctx.beginPath();
      ctx.moveTo(-wingSpan * 0.72, 10);
      ctx.lineTo(-wingSpan * 0.35, -2);
      ctx.lineTo(-wingSpan * 0.35, 12);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(wingSpan * 0.72, 10);
      ctx.lineTo(wingSpan * 0.35, -2);
      ctx.lineTo(wingSpan * 0.35, 12);
      ctx.closePath();
      ctx.fill();

      ctx.translate(bankShift * 0.35, -2);
      ctx.fillStyle = isHitFlash ? '#FFFFFF' : '#0284C7';
      ctx.beginPath();
      ctx.ellipse(0, -2, 8, 13, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = isHitFlash ? '#FFFFFF' : '#38BDF8';
      ctx.beginPath();
      ctx.ellipse(-1.5, -4, 4.5, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.ellipse(-2.5, -7, 2, 3.5, -0.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      ctx.restore();
    };

    // Main 60fps simulation & render loop
    const tick = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      const state = gameStateRef.current;

      // Update 3D Voxel Particles
      for (let i = 0; i < particlePool.length; i++) {
        const p = particlePool[i];
        if (!p.active) continue;
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z = Math.max(0, p.z + p.vz * dt);
        p.vz -= 220 * dt;
        p.vx *= 0.96;
        p.vy *= 0.96;
        p.alpha = 1 - p.life / p.maxLife;
      }

      // Update 3D Shockwave Rings
      for (let i = 0; i < shockwaves.length; i++) {
        const sw = shockwaves[i];
        if (!sw.active) continue;
        sw.radius += (sw.maxRadius - sw.radius) * Math.min(1, dt * 11) + 45 * dt;
        sw.alpha = Math.max(0, 1 - sw.radius / sw.maxRadius);
        if (sw.radius >= sw.maxRadius) {
          sw.active = false;
        }
      }

      // Update Floating Holograms
      for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        ft.life += dt;
        ft.y += ft.vy * dt;
        if (ft.life >= ft.maxLife) {
          floatingTexts.splice(i, 1);
        }
      }

      if (state === 'TITLE_MENU') {
        camera.titlePanAngle += dt * 0.28;
        camera.x = WORLD_WIDTH * 0.5 + Math.cos(camera.titlePanAngle) * 320;
        camera.y = WORLD_HEIGHT * 0.48 + Math.sin(camera.titlePanAngle * 0.8) * 160;
        player.x = camera.x + Math.cos(camera.titlePanAngle * 2) * 90;
        player.y = camera.y + Math.sin(camera.titlePanAngle * 2) * 55;
        player.aimAngle = camera.titlePanAngle * 2 + Math.PI * 0.5;
        player.bankAngle = Math.sin(camera.titlePanAngle * 3) * 0.35;
        player.vx = 70;
        player.jetpackFlamePhase += dt * 20;
      } else if (state === 'PLAYING') {
        if (hitstopTimer > 0) {
          hitstopTimer -= dt;
        } else {
          // 1. Handle Input: Keyboard + Virtual Corner Joystick + Canvas Touch
          let moveX = virtualJoy.x;
          let moveY = virtualJoy.y;

          if (heldKeys.has('KeyW') || heldKeys.has('ArrowUp')) moveY -= 1;
          if (heldKeys.has('KeyS') || heldKeys.has('ArrowDown')) moveY += 1;
          if (heldKeys.has('KeyA') || heldKeys.has('ArrowLeft')) moveX -= 1;
          if (heldKeys.has('KeyD') || heldKeys.has('ArrowRight')) moveX += 1;

          if (pointer.active && Math.hypot(moveX, moveY) < 0.1) {
            const pScale = canvas.width < 640 ? 0.78 : 1;
            const worldTargetX = camera.x + (pointer.screenX - canvas.width * 0.5) / pScale;
            const worldTargetY = camera.y + (pointer.screenY - canvas.height * 0.5) / pScale;
            const dx = worldTargetX - player.x;
            const dy = worldTargetY - player.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 18) {
              moveX = dx / dist;
              moveY = dy / dist;
            }
          }

          const moveLen = Math.hypot(moveX, moveY);
          if (moveLen > 1) {
            moveX /= moveLen;
            moveY /= moveLen;
          }

          if (justPressedKeys.has('KeyR') && lastCollectedNumber) {
            soundEngine.speakArabicNumber(lastCollectedNumber, true);
          }

          // NOS + KOMBO LASER BARRAGE (`Space` / `KeyK` / Button)
          if (dashBufferTimer > 0) dashBufferTimer -= dt;
          if (player.dashCooldown > 0) player.dashCooldown = Math.max(0, player.dashCooldown - dt);
          if (manualFireBurstTimer > 0) manualFireBurstTimer = Math.max(0, manualFireBurstTimer - dt);

          if (dashBufferTimer > 0 && player.dashCooldown <= 0) {
            dashBufferTimer = 0;
            player.dashTimer = 0.45;
            player.nosComboTimer = 1.65; // 1.65s of NOS speed + 5-way Spread Laser Barrage!
            player.tractorPulseTimer = 1.65;
            player.dashCooldown = 2.2;
            player.scaleX = 1.32;
            player.scaleY = 0.75;
            const boostDirX = moveLen > 0.1 ? moveX : Math.cos(player.aimAngle);
            const boostDirY = moveLen > 0.1 ? moveY : Math.sin(player.aimAngle);
            player.vx = boostDirX * 640;
            player.vy = boostDirY * 640;
            soundEngine.playNosComboSound();
            spawnShockwave(player.x, player.y, 110, '#FACC15');
            spawnParticles(player.x, player.y, '#FACC15', 22, 90, 280, 5);
            syncHud();
          }

          if (player.dashTimer > 0) player.dashTimer -= dt;
          if (player.nosComboTimer > 0) {
            player.nosComboTimer = Math.max(0, player.nosComboTimer - dt);
            if (player.nosComboTimer === 0) syncHud();
          }
          if (player.tractorPulseTimer > 0) player.tractorPulseTimer -= dt;

          const isNos = player.nosComboTimer > 0;
          const accel = isNos ? 1550 : 1060;
          const maxSpeed = isNos ? 580 : 350;
          player.vx += moveX * accel * dt;
          player.vy += moveY * accel * dt;

          const drag = moveLen > 0.05 ? 0.92 : 0.86;
          player.vx *= Math.pow(drag, dt * 60);
          player.vy *= Math.pow(drag, dt * 60);

          const curSpeed = Math.hypot(player.vx, player.vy);
          if (curSpeed > maxSpeed) {
            player.vx = (player.vx / curSpeed) * maxSpeed;
            player.vy = (player.vy / curSpeed) * maxSpeed;
          }

          player.x += player.vx * dt;
          player.y += player.vy * dt;

          const pad = 70;
          if (player.x < pad) {
            player.x = pad;
            player.vx = Math.abs(player.vx) * 0.5;
          } else if (player.x > WORLD_WIDTH - pad) {
            player.x = WORLD_WIDTH - pad;
            player.vx = -Math.abs(player.vx) * 0.5;
          }
          if (player.y < pad) {
            player.y = pad;
            player.vy = Math.abs(player.vy) * 0.5;
          } else if (player.y > WORLD_HEIGHT - pad) {
            player.y = WORLD_HEIGHT - pad;
            player.vy = -Math.abs(player.vy) * 0.5;
          }

          player.scaleX += (1 - player.scaleX) * Math.min(1, dt * 12);
          player.scaleY += (1 - player.scaleY) * Math.min(1, dt * 12);
          player.jetpackFlamePhase += dt * 24;
          if (player.invulnTimer > 0) player.invulnTimer -= dt;
          if (player.hitFlashTimer > 0) player.hitFlashTimer -= dt;
          if (player.muzzleFlashTimer > 0) player.muzzleFlashTimer -= dt;

          // 2. Smart Target Lock-On (Prioritizes Boss, then Enemies, then Crystal Cages)
          lockedTarget = null;
          let bestLockDist = 520;

          if (boss.active) {
            const dBoss = Math.hypot(boss.x - player.x, boss.y - player.y);
            if (dBoss < 680) {
              bestLockDist = dBoss;
              lockedTarget = {
                x: boss.x,
                y: boss.y,
                radius: boss.radius + 10,
                label: 'BOS MONSTER',
                color: '#F43F5E',
              };
            }
          }

          for (let i = 0; i < hazards.length; i++) {
            const hz = hazards[i];
            if (hz.state === 'RESPAWNING') continue;
            const d = Math.hypot(hz.x - player.x, hz.y - player.y);
            if (d < bestLockDist) {
              bestLockDist = d;
              lockedTarget = {
                x: hz.x,
                y: hz.y,
                radius: hz.radius + 8,
                label: hz.type === 'DRONE' ? 'UFO' : hz.type === 'CHASER' ? 'PEMBURU' : 'METEOR',
                color: hz.type === 'ASTEROID' ? '#F59E0B' : '#F43F5E',
              };
            }
          }

          for (let i = 0; i < orbs.length; i++) {
            const orb = orbs[i];
            if (orb.collected || orb.cageHp <= 0) continue;
            const d = Math.hypot(orb.x - player.x, orb.y - player.y);
            if (d < bestLockDist) {
              bestLockDist = d;
              lockedTarget = {
                x: orb.x,
                y: orb.y,
                radius: orb.radius + 12,
                label: 'KRISTAL',
                color: '#38BDF8',
              };
            }
          }

          let desiredAim = player.aimAngle;
          if (lockedTarget) {
            desiredAim = Math.atan2(lockedTarget.y - player.y, lockedTarget.x - player.x);
          } else if (moveLen > 0.1) {
            desiredAim = Math.atan2(moveY, moveX);
          } else if (curSpeed > 25) {
            desiredAim = Math.atan2(player.vy, player.vx);
          }

          let angleDiff = desiredAim - player.aimAngle;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          player.aimAngle += angleDiff * Math.min(1, dt * 14);

          const targetBank = Math.max(-0.55, Math.min(0.55, angleDiff * 1.2 + moveX * 0.32));
          player.bankAngle += (targetBank - player.bankAngle) * Math.min(1, dt * 10);

          // 3. Player Shooting: Twin Plasma Blaster OR 5-Way NOS Kombo Spread Barrage!
          if (player.fireCooldown > 0) {
            player.fireCooldown -= dt;
          }
          const wantsToShoot =
            heldKeys.has('KeyJ') ||
            heldKeys.has('Enter') ||
            manualFireHeld ||
            manualFireBurstTimer > 0 ||
            isNos ||
            (autoFireEnabled && lockedTarget !== null);

          if (wantsToShoot && player.fireCooldown <= 0) {
            player.fireCooldown = isNos ? 0.11 : 0.16;
            player.muzzleFlashTimer = 0.06;

            const noseX = player.x + Math.cos(player.aimAngle) * 20;
            const noseY = player.y + Math.sin(player.aimAngle) * 20;

            if (isNos) {
              // 5-Way NOS Kombo Spread Shot!
              const spreadAngles = [-0.34, -0.17, 0, 0.17, 0.34];
              for (let s = 0; s < spreadAngles.length; s++) {
                spawnLaserBolt(
                  noseX,
                  noseY,
                  player.aimAngle + spreadAngles[s],
                  s % 2 === 0 ? '#FACC15' : '#38BDF8',
                  false,
                  920,
                  0.82
                );
              }
            } else {
              const perpX = -Math.sin(player.aimAngle) * 14;
              const perpY = Math.cos(player.aimAngle) * 14;
              spawnLaserBolt(noseX + perpX, noseY + perpY, player.aimAngle, '#38BDF8', false);
              spawnLaserBolt(noseX - perpX, noseY - perpY, player.aimAngle, '#38BDF8', false);
            }
            soundEngine.playLaserShoot();
          }

          // 4. Update All Projectiles (Player Lasers & Enemy Plasma Shots)
          for (let i = 0; i < laserPool.length; i++) {
            const b = laserPool[i];
            if (!b.active) continue;
            b.life += dt;
            if (b.life >= b.maxLife) {
              b.active = false;
              continue;
            }
            b.x += b.vx * dt;
            b.y += b.vy * dt;

            if (b.x < 40 || b.x > WORLD_WIDTH - 40 || b.y < 40 || b.y > WORLD_HEIGHT - 40) {
              b.active = false;
              continue;
            }

            if (b.isEnemy) {
              // Check Enemy Plasma hit against Player
              const dPlayer = Math.hypot(b.x - player.x, b.y - player.y);
              if (dPlayer < player.radius + b.radius) {
                b.active = false;
                if (player.invulnTimer <= 0 && player.nosComboTimer <= 0) {
                  player.shields -= 1;
                  player.invulnTimer = 1.8;
                  player.hitFlashTimer = 0.22;
                  comboStreak = 0;
                  hitstopTimer = 0.045;
                  camera.shakeMagnitude = 12;
                  soundEngine.playShieldBump();
                  spawnShockwave(player.x, player.y, 70, '#F87171');
                  spawnParticles(player.x, player.y, '#F87171', 18, 70, 240, 5);
                  if (player.shields <= 2) {
                    const inactiveHeart = heartPickups.find((h) => !h.active);
                    if (inactiveHeart) inactiveHeart.active = true;
                  }
                  syncHud();
                  if (player.shields <= 0) {
                    onGameOverRef.current(score);
                  }
                } else {
                  // Deflected by NOS Shield!
                  spawnParticles(b.x, b.y, '#FACC15', 8, 50, 160, 4);
                }
              }
              continue;
            }

            // Player Laser can also shoot down Enemy Plasma Bolts!
            for (let k = 0; k < laserPool.length; k++) {
              const eb = laserPool[k];
              if (!eb.active || !eb.isEnemy) continue;
              if (Math.hypot(b.x - eb.x, b.y - eb.y) < b.radius + eb.radius + 6) {
                b.active = false;
                eb.active = false;
                score += 25;
                spawnParticles(eb.x, eb.y, '#F472B6', 8, 50, 150, 4);
                break;
              }
            }
            if (!b.active) continue;

            // Player Laser vs Boss Monster
            if (boss.active) {
              const dBoss = Math.hypot(b.x - boss.x, b.y - boss.y);
              if (dBoss < boss.radius + 10) {
                b.active = false;
                boss.hp -= 1;
                boss.hitFlash = 0.08;
                score += 30;
                spawnParticles(b.x, b.y, '#F43F5E', 7, 60, 190, 4);

                // Drop shield heart at 50% boss HP if needed
                if (boss.hp === Math.floor(boss.maxHp * 0.5)) {
                  const inactiveHeart = heartPickups.find((h) => !h.active);
                  if (inactiveHeart) {
                    inactiveHeart.x = boss.x + (Math.random() - 0.5) * 160;
                    inactiveHeart.y = boss.y + 80;
                    inactiveHeart.active = true;
                  }
                }

                if (boss.hp <= 0) {
                  // BOSS DEFEATED!
                  boss.active = false;
                  boss.defeated = true;
                  destroyedCount += 5;
                  score += 5000;
                  camera.shakeMagnitude = 24;
                  hitstopTimer = 0.08;
                  soundEngine.playEnemyExplode();
                  soundEngine.playPortalUnlocked();
                  spawnShockwave(boss.x, boss.y, 240, '#FACC15');
                  spawnShockwave(boss.x, boss.y, 160, '#F43F5E');
                  spawnParticles(boss.x, boss.y, '#FACC15', 75, 90, 420, 7);

                  if (!currentSector.isEndlessFinal) {
                    warpPortal.active = true;
                    floatingTexts.push({
                      x: boss.x,
                      y: boss.y - 20,
                      vy: -30,
                      arabicNumeral: '🏆 BOS KALAH!',
                      arabicWord: 'النَّصْرُ العَظِيم',
                      transliteration: 'Gerbang Sektor Final Terbuka!',
                      meaning: '+5000 Skor!',
                      color: '#34D399',
                      life: 0,
                      maxLife: 3.2,
                    });
                  } else {
                    endlessWave += 1;
                    floatingTexts.push({
                      x: boss.x,
                      y: boss.y - 20,
                      vy: -30,
                      arabicNumeral: `GELOMBANG ${toArabicDigits(endlessWave)}`,
                      arabicWord: 'مُمْتَازٌ',
                      transliteration: 'Bos Gelombang Hancur! +5000 Skor!',
                      meaning: 'Lanjutkan Rekor!',
                      color: '#FACC15',
                      life: 0,
                      maxLife: 2.8,
                    });
                  }
                } else {
                  soundEngine.playEnemyHit();
                }
                syncHud();
                continue;
              }
            }

            // Player Laser vs Crystal-Caged Orbs
            for (let j = 0; j < orbs.length; j++) {
              const orb = orbs[j];
              if (orb.collected || orb.cageHp <= 0) continue;
              const d = Math.hypot(b.x - orb.x, b.y - orb.y);
              if (d < orb.radius + 14) {
                b.active = false;
                orb.cageHp -= 1;
                orb.hitFlash = 0.15;
                spawnParticles(b.x, b.y, '#38BDF8', 10, 60, 200, 4);
                if (orb.cageHp <= 0) {
                  soundEngine.playEnemyExplode();
                  spawnShockwave(orb.x, orb.y, 75, '#38BDF8');
                  spawnParticles(orb.x, orb.y, '#BAE6FD', 24, 80, 260, 5);
                  score += 50;
                  syncHud();
                } else {
                  soundEngine.playEnemyHit();
                }
                break;
              }
            }
            if (!b.active) continue;

            // Player Laser vs Asteroids, UFO Drones & Chasers
            for (let j = 0; j < hazards.length; j++) {
              const hz = hazards[j];
              if (hz.state === 'RESPAWNING') continue;
              const d = Math.hypot(b.x - hz.x, b.y - hz.y);
              if (d < hz.radius + 8) {
                b.active = false;
                hz.hp -= 1;
                hz.hitFlash = 0.14;
                hz.x += Math.cos(b.angle) * 6;
                hz.y += Math.sin(b.angle) * 6;
                spawnParticles(b.x, b.y, '#FBBF24', 8, 60, 190, 4);

                if (hz.hp <= 0) {
                  hz.state = 'RESPAWNING';
                  hz.stateTimer = currentSector.isEndlessFinal ? 2.6 : 4.8;
                  destroyedCount += 1;
                  const pts = hz.type === 'DRONE' ? 250 : hz.type === 'CHASER' ? 300 : 150;
                  score += pts;
                  camera.shakeMagnitude = 9;
                  soundEngine.playEnemyExplode();
                  spawnShockwave(
                    hz.x,
                    hz.y,
                    hz.type === 'ASTEROID' ? 80 : 95,
                    hz.type === 'ASTEROID' ? '#F59E0B' : '#F43F5E'
                  );
                  spawnParticles(
                    hz.x,
                    hz.y,
                    hz.type === 'ASTEROID' ? '#FBBF24' : '#FB7185',
                    30,
                    80,
                    310,
                    6
                  );

                  // In Endless Final Sector, destroyed enemies drop new Arabic Number Star Orbs & trigger waves!
                  if (currentSector.isEndlessFinal) {
                    const activeOrbsCount = orbs.filter((o) => !o.collected).length;
                    if (activeOrbsCount < 12) {
                      const randomVal =
                        ALL_ARABIC_VALUES[Math.floor(Math.random() * ALL_ARABIC_VALUES.length)];
                      orbs.push({
                        id: ++nextOrbId,
                        x: Math.max(140, Math.min(WORLD_WIDTH - 140, hz.x)),
                        y: Math.max(140, Math.min(WORLD_HEIGHT - 140, hz.y)),
                        vx: (Math.random() - 0.5) * 35,
                        vy: (Math.random() - 0.5) * 35,
                        radius: 30,
                        assignedNumber: randomVal,
                        crystalValue: 1,
                        collected: false,
                        bobPhase: Math.random() * 3,
                        wrongBounceTimer: 0,
                        cageHp: 0,
                        maxCageHp: 0,
                        hitFlash: 0,
                      });
                    }

                    if (destroyedCount % 12 === 0) {
                      endlessWave += 1;
                      if (endlessWave % 3 === 0 && !boss.active) {
                        spawnBossMonster(1 + endlessWave * 0.25);
                      }
                    }
                  }

                  syncHud();
                } else {
                  soundEngine.playEnemyHit();
                }
                break;
              }
            }
          }

          // 5. Update Boss Monster AI & Attacks
          if (boss.active) {
            boss.phaseAngle += dt * 2.2;
            if (boss.hitFlash > 0) boss.hitFlash = Math.max(0, boss.hitFlash - dt);

            // Boss figure-8 patrol & pursuit
            const targetBossX =
              WORLD_WIDTH * 0.5 + Math.cos(boss.phaseAngle * 0.55) * 520;
            const targetBossY =
              Math.max(220, Math.min(WORLD_HEIGHT - 300, player.y - 260 + Math.sin(boss.phaseAngle) * 140));
            boss.x += (targetBossX - boss.x) * dt * 1.4;
            boss.y += (targetBossY - boss.y) * dt * 1.4;

            boss.attackTimer -= dt;
            if (boss.attackTimer <= 0) {
              boss.attackPattern = (boss.attackPattern + 1) % 3;
              boss.attackTimer = 2.1;
              soundEngine.playEnemyShoot();

              const angleToPlayer = Math.atan2(player.y - boss.y, player.x - boss.x);
              if (boss.attackPattern === 0) {
                // Pattern 0: Aimed 3-way Plasma Volley
                const spreads = [-0.28, 0, 0.28];
                spreads.forEach((sp) => {
                  spawnLaserBolt(
                    boss.x,
                    boss.y,
                    angleToPlayer + sp,
                    '#F43F5E',
                    true,
                    360,
                    3.2
                  );
                });
              } else if (boss.attackPattern === 1) {
                // Pattern 1: 8-Way Radial Plasma Ring Nova
                for (let r = 0; r < 8; r++) {
                  const ra = (r / 8) * Math.PI * 2 + boss.phaseAngle;
                  spawnLaserBolt(boss.x, boss.y, ra, '#A855F7', true, 290, 3.5);
                }
              } else {
                // Pattern 2: Spawn a Chaser Drone reinforcement + aimed shot
                spawnLaserBolt(boss.x, boss.y, angleToPlayer, '#FACC15', true, 410, 3.0);
              }
            }

            // Boss body collision with player
            const dBossPlayer = Math.hypot(player.x - boss.x, player.y - boss.y);
            if (dBossPlayer < player.radius + boss.radius - 6 && player.invulnTimer <= 0) {
              player.shields -= 1;
              player.invulnTimer = 2.0;
              player.hitFlashTimer = 0.25;
              camera.shakeMagnitude = 16;
              const nx = (player.x - boss.x) / Math.max(1, dBossPlayer);
              const ny = (player.y - boss.y) / Math.max(1, dBossPlayer);
              player.vx = nx * 420;
              player.vy = ny * 420;
              soundEngine.playShieldBump();
              syncHud();
              if (player.shields <= 0) {
                onGameOverRef.current(score);
              }
            }
          }

          // 6. Update Collectible Orbs & Check Collection
          const nextOrderNum = getSequenceNumberAt(collectedCount);
          for (let i = 0; i < orbs.length; i++) {
            const orb = orbs[i];
            if (orb.collected) continue;

            orb.bobPhase += dt * 3.2;
            if (orb.wrongBounceTimer > 0) orb.wrongBounceTimer = Math.max(0, orb.wrongBounceTimer - dt);
            if (orb.hitFlash > 0) orb.hitFlash = Math.max(0, orb.hitFlash - dt);

            orb.x += orb.vx * dt;
            orb.y += orb.vy * dt;
            if (orb.x < 120 || orb.x > WORLD_WIDTH - 120) orb.vx *= -1;
            if (orb.y < 140 || orb.y > WORLD_HEIGHT - 140) orb.vy *= -1;

            const dx = player.x - orb.x;
            const dy = player.y - orb.y;
            const dist = Math.hypot(dx, dy);

            const remainingToTarget = Math.max(0, currentSector.targetCount - collectedCount);
            const isValidTarget = currentSector.isEndlessFinal
              ? true
              : currentSector.orderedMode
              ? orb.assignedNumber === nextOrderNum
              : orb.crystalValue <= remainingToTarget;

            const magnetRange = player.tractorPulseTimer > 0 ? 310 : 130;
            if (isValidTarget && orb.cageHp <= 0 && dist < magnetRange && dist > 1) {
              const pullStrength = player.tractorPulseTimer > 0 ? 520 : 210;
              orb.x += (dx / dist) * pullStrength * dt;
              orb.y += (dy / dist) * pullStrength * dt;
            }

            if (dist < player.radius + orb.radius + 6) {
              if (orb.cageHp > 0) {
                orb.cageHp = 0;
                soundEngine.playEnemyExplode();
                spawnShockwave(orb.x, orb.y, 75, '#38BDF8');
                spawnParticles(orb.x, orb.y, '#BAE6FD', 20, 70, 240, 5);
              }

              // Check if in Addition Mode (Sectors 1 & 2) this crystal would exceed the exact target sum
              if (
                !currentSector.orderedMode &&
                !currentSector.isEndlessFinal &&
                collectedCount < currentSector.targetCount &&
                orb.crystalValue > remainingToTarget
              ) {
                const hasSmallerCrystal = orbs.some(
                  (o) => !o.collected && o.id !== orb.id && o.crystalValue <= remainingToTarget
                );
                if (!hasSmallerCrystal) {
                  // Automatically adapt crystal value so player is never soft-locked
                  orb.crystalValue = remainingToTarget;
                  orb.assignedNumber = remainingToTarget;
                } else if (orb.wrongBounceTimer <= 0) {
                  orb.wrongBounceTimer = 1.1;
                  const neededInfo = ARABIC_NUMBERS[remainingToTarget] || ARABIC_NUMBERS[1];
                  soundEngine.playWrongOrderPrompt(neededInfo);
                  player.vx = (dx / Math.max(1, dist)) * 220;
                  player.vy = (dy / Math.max(1, dist)) * 220;
                  floatingTexts.push({
                    x: orb.x,
                    y: orb.y - 30,
                    vy: -35,
                    arabicNumeral: `${toArabicDigits(collectedCount)} + ${toArabicDigits(orb.crystalValue)} = ${toArabicDigits(collectedCount + orb.crystalValue)}`,
                    arabicWord: `Kelebihan!`,
                    transliteration: `Cari Kristal +${neededInfo.arabicNumeral} (${neededInfo.transliteration})`,
                    meaning: `Supaya pas ${toArabicDigits(currentSector.targetCount)}`,
                    color: '#FBBF24',
                    life: 0,
                    maxLife: 1.8,
                  });
                  continue;
                } else {
                  continue;
                }
              }

              if (currentSector.orderedMode && orb.assignedNumber !== nextOrderNum) {
                if (orb.wrongBounceTimer <= 0) {
                  orb.wrongBounceTimer = 1.1;
                  const expectedInfo = ARABIC_NUMBERS[nextOrderNum] || ARABIC_NUMBERS[1];
                  soundEngine.playWrongOrderPrompt(expectedInfo);
                  player.vx = (dx / Math.max(1, dist)) * 220;
                  player.vy = (dy / Math.max(1, dist)) * 220;
                  floatingTexts.push({
                    x: orb.x,
                    y: orb.y - 30,
                    vy: -35,
                    arabicNumeral: `Cari ${expectedInfo.arabicNumeral}`,
                    arabicWord: expectedInfo.arabicWord,
                    transliteration: `Ambil ${expectedInfo.transliteration} dulu!`,
                    meaning: expectedInfo.indonesianMeaning,
                    color: '#FBBF24',
                    life: 0,
                    maxLife: 1.5,
                  });
                }
              } else {
                const prevCount = collectedCount;
                const addedCrystals =
                  currentSector.orderedMode || currentSector.isEndlessFinal
                    ? 1
                    : Math.max(1, orb.crystalValue);

                orb.collected = true;
                collectedCount = currentSector.isEndlessFinal
                  ? collectedCount + 1
                  : Math.min(currentSector.targetCount, collectedCount + addedCrystals);
                comboStreak += 1;

                // Determine the Arabic Number representing the new counter total!
                const countedNumVal =
                  currentSector.orderedMode || currentSector.isEndlessFinal
                    ? orb.assignedNumber
                    : collectedCount;
                const numInfo = ARABIC_NUMBERS[countedNumVal] || ARABIC_NUMBERS[1];

                // Build live Arabic & Latin Addition Equation
                if (!currentSector.orderedMode && !currentSector.isEndlessFinal) {
                  lastAdditionEquation = `${toArabicDigits(prevCount)} + ${toArabicDigits(addedCrystals)} = ${toArabicDigits(collectedCount)}`;
                  lastAdditionLatin = `${prevCount} + ${addedCrystals} = ${collectedCount}`;
                } else if (currentSector.id === 3) {
                  lastAdditionEquation = `${toArabicDigits(countedNumVal - 1)} + ١ = ${toArabicDigits(countedNumVal)}`;
                  lastAdditionLatin = `${countedNumVal - 1} + 1 = ${countedNumVal}`;
                } else if (currentSector.id === 4) {
                  lastAdditionEquation = `١٠ + ${toArabicDigits(countedNumVal - 10)} = ${toArabicDigits(countedNumVal)}`;
                  lastAdditionLatin = `10 + ${countedNumVal - 10} = ${countedNumVal}`;
                } else if (currentSector.id === 5) {
                  lastAdditionEquation = `${toArabicDigits(countedNumVal - 10)} + ١٠ = ${toArabicDigits(countedNumVal)}`;
                  lastAdditionLatin = `${countedNumVal - 10} + 10 = ${countedNumVal}`;
                } else {
                  lastAdditionEquation = `${toArabicDigits(prevCount)} + ١ = ${toArabicDigits(collectedCount)}`;
                  lastAdditionLatin = `${prevCount} + 1 = ${collectedCount}`;
                }

                // Collecting stars reduces NOS cooldown!
                player.dashCooldown = Math.max(0, player.dashCooldown - 0.5);

                lastCollectedNumber = numInfo;
                collectedHistory.push(numInfo);
                score += 100 * comboStreak * addedCrystals;

                player.scaleX = 1.28;
                player.scaleY = 1.28;
                spawnShockwave(orb.x, orb.y, 95, numInfo.color);
                spawnParticles(orb.x, orb.y, numInfo.color, 30, 70, 290, 5);

                floatingTexts.push({
                  x: orb.x,
                  y: orb.y - 24,
                  vy: -42,
                  arabicNumeral: `${lastAdditionEquation}`,
                  arabicWord: numInfo.arabicWord,
                  transliteration: `${numInfo.transliteration} (${lastAdditionLatin})`,
                  meaning: `${numInfo.indonesianMeaning} (${numInfo.value})`,
                  color: numInfo.color,
                  life: 0,
                  maxLife: 2.4,
                });

                // Speak the Arabic number for the new counter sum!
                soundEngine.speakArabicNumber(numInfo, true);

                // Check Sector Completion or Boss Trigger when counter reaches targetCount!
                if (
                  !currentSector.isEndlessFinal &&
                  collectedCount >= currentSector.targetCount &&
                  !warpPortal.active
                ) {
                  // Remove any leftover extra crystals once target sum is reached
                  orbs.forEach((o) => {
                    if (!o.collected) {
                      o.collected = true;
                      spawnParticles(o.x, o.y, '#34D399', 12, 50, 180, 4);
                    }
                  });

                  if (currentSector.hasBossAtEnd && !boss.defeated && !boss.active) {
                    // Trigger End-of-Sector-5 Boss Monster Battle!
                    spawnBossMonster(1);
                  } else if (!boss.active) {
                    warpPortal.active = true;
                    window.setTimeout(() => {
                      soundEngine.playPortalUnlocked();
                    }, 650);
                    spawnShockwave(warpPortal.x, warpPortal.y, 140, '#34D399');
                    spawnParticles(warpPortal.x, warpPortal.y, '#34D399', 40, 90, 320, 6);
                  }
                }

                syncHud();
              }
            }
          }

          // 7. Update Heart Shield Pickups
          for (let i = 0; i < heartPickups.length; i++) {
            const hp = heartPickups[i];
            if (!hp.active) continue;
            hp.bobPhase += dt * 3;
            const dist = Math.hypot(player.x - hp.x, player.y - hp.y);
            if (dist < player.radius + 22 && player.shields < player.maxShields) {
              hp.active = false;
              player.shields = Math.min(player.maxShields, player.shields + 1);
              soundEngine.playHeartPickup();
              spawnParticles(hp.x, hp.y, '#34D399', 18, 60, 180, 4);
              syncHud();
            }
          }

          // 8. Update Hazards (Asteroids, Shooting UFOs, and Chaser Interceptors)
          const aggr = currentSector.enemyAggression;
          for (let i = 0; i < hazards.length; i++) {
            const hz = hazards[i];
            if (hz.hitFlash > 0) hz.hitFlash = Math.max(0, hz.hitFlash - dt);

            if (hz.state === 'RESPAWNING') {
              hz.stateTimer -= dt;
              if (hz.stateTimer <= 0) {
                hz.state = 'PATROL';
                hz.hp = hz.maxHp + (currentSector.isEndlessFinal ? Math.floor(endlessWave * 0.4) : 0);
                hz.stateTimer = 2.2;
                hz.shootCooldown = 1.6;
                const sideAngle = Math.random() * Math.PI * 2;
                hz.x = Math.max(140, Math.min(WORLD_WIDTH - 140, player.x + Math.cos(sideAngle) * 650));
                hz.y = Math.max(140, Math.min(WORLD_HEIGHT - 140, player.y + Math.sin(sideAngle) * 520));
              }
              continue;
            }

            if (hz.type === 'ASTEROID') {
              hz.x += hz.vx * dt;
              hz.y += hz.vy * dt;
              hz.angle += hz.spinSpeed * dt;
              if (hz.x < 90 || hz.x > WORLD_WIDTH - 90) hz.vx *= -1;
              if (hz.y < 90 || hz.y > WORLD_HEIGHT - 90) hz.vy *= -1;
            } else if (hz.type === 'CHASER') {
              // Fast Alien Interceptor that actively pursues player!
              const toPlayerAngle = Math.atan2(player.y - hz.y, player.x - hz.x);
              hz.angle = toPlayerAngle;
              const chaseSpeed = 135 + aggr * 16;
              hz.vx += (Math.cos(toPlayerAngle) * chaseSpeed - hz.vx) * dt * 3;
              hz.vy += (Math.sin(toPlayerAngle) * chaseSpeed - hz.vy) * dt * 3;
              hz.x += hz.vx * dt;
              hz.y += hz.vy * dt;

              // Chasers in higher sectors also fire plasma shots!
              if (aggr >= 3) {
                hz.shootCooldown -= dt;
                const distToP = Math.hypot(player.x - hz.x, player.y - hz.y);
                if (hz.shootCooldown <= 0 && distToP < 480) {
                  hz.shootCooldown = Math.max(1.5, 3.4 - aggr * 0.3);
                  spawnLaserBolt(hz.x, hz.y, toPlayerAngle, '#F43F5E', true, 310 + aggr * 15, 2.5);
                  soundEngine.playEnemyShoot();
                }
              }
            } else {
              // UFO DRONE: Patrols, shoots plasma bolts at player, and dashes!
              hz.stateTimer -= dt;
              hz.shootCooldown -= dt;
              const distToPlayer = Math.hypot(player.x - hz.x, player.y - hz.y);

              if (hz.shootCooldown <= 0 && distToPlayer < 560) {
                hz.shootCooldown = Math.max(1.3, 3.2 - aggr * 0.32);
                const aimA = Math.atan2(player.y - hz.y, player.x - hz.x);
                const bulletSpeed = 270 + aggr * 22;
                spawnLaserBolt(hz.x, hz.y, aimA, '#FB7185', true, bulletSpeed, 2.8);
                if (aggr >= 4) {
                  // Spread shot in Sectors 4, 5, 6!
                  spawnLaserBolt(hz.x, hz.y, aimA - 0.22, '#FB7185', true, bulletSpeed, 2.8);
                  spawnLaserBolt(hz.x, hz.y, aimA + 0.22, '#FB7185', true, bulletSpeed, 2.8);
                }
                soundEngine.playEnemyShoot();
              }

              if (hz.state === 'PATROL') {
                hz.x += hz.vx * dt;
                hz.y += hz.vy * dt;
                if (hz.x < 140 || hz.x > WORLD_WIDTH - 140) hz.vx *= -1;
                if (hz.y < 140 || hz.y > WORLD_HEIGHT - 140) hz.vy *= -1;

                if (hz.stateTimer <= 0 && distToPlayer < 520) {
                  hz.state = 'WINDUP';
                  hz.stateTimer = 1.05;
                  hz.targetX = player.x;
                  hz.targetY = player.y;
                  hz.vx = 0;
                  hz.vy = 0;
                }
              } else if (hz.state === 'WINDUP') {
                if (hz.stateTimer > 0.4) {
                  hz.targetX = player.x;
                  hz.targetY = player.y;
                }
                if (hz.stateTimer <= 0) {
                  hz.state = 'DASH';
                  hz.stateTimer = 0.65;
                  const dx = hz.targetX - hz.x;
                  const dy = hz.targetY - hz.y;
                  const len = Math.max(1, Math.hypot(dx, dy));
                  const dashSpd = 320 + aggr * 18;
                  hz.vx = (dx / len) * dashSpd;
                  hz.vy = (dy / len) * dashSpd;
                }
              } else if (hz.state === 'DASH') {
                hz.x += hz.vx * dt;
                hz.y += hz.vy * dt;
                if (hz.stateTimer <= 0) {
                  hz.state = 'PATROL';
                  hz.stateTimer = 2.8;
                  hz.vx = (Math.random() > 0.5 ? 1 : -1) * (65 + aggr * 8);
                  hz.vy = (Math.random() > 0.5 ? 1 : -1) * (45 + aggr * 6);
                }
              }
            }

            const dx = player.x - hz.x;
            const dy = player.y - hz.y;
            const dist = Math.hypot(dx, dy);
            if (dist < player.radius + hz.radius - 4) {
              if (player.nosComboTimer > 0) {
                // Ramming enemy during NOS Overdrive destroys the enemy!
                hz.hp = 0;
                hz.state = 'RESPAWNING';
                hz.stateTimer = 4.0;
                destroyedCount += 1;
                score += 200;
                soundEngine.playEnemyExplode();
                spawnShockwave(hz.x, hz.y, 90, '#FACC15');
                spawnParticles(hz.x, hz.y, '#FACC15', 25, 80, 280, 6);
                syncHud();
              } else if (player.invulnTimer <= 0) {
                player.shields -= 1;
                player.invulnTimer = 2.0;
                player.hitFlashTimer = 0.22;
                comboStreak = 0;
                hitstopTimer = 0.055;
                camera.shakeMagnitude = 14;
                player.scaleX = 0.72;
                player.scaleY = 1.32;

                const nx = dx / Math.max(1, dist);
                const ny = dy / Math.max(1, dist);
                player.vx = nx * 340;
                player.vy = ny * 340;

                soundEngine.playShieldBump();
                spawnShockwave(player.x, player.y, 75, '#F87171');
                spawnParticles(player.x, player.y, '#F87171', 22, 80, 260, 5);

                if (player.shields <= 2) {
                  const inactiveHeart = heartPickups.find((h) => !h.active);
                  if (inactiveHeart) inactiveHeart.active = true;
                }

                syncHud();

                if (player.shields <= 0) {
                  onGameOverRef.current(score);
                }
              }
            }
          }

          // 9. Update Warp Portal
          if (warpPortal.active) {
            warpPortal.spinAngle += dt * 2.4;
            const distToPortal = Math.hypot(player.x - warpPortal.x, player.y - warpPortal.y);
            if (distToPortal < player.radius + warpPortal.radius * 0.75) {
              soundEngine.playVictoryFanfare();
              onSectorCompleteRef.current(score + 500, collectedHistory);
            }
          }

          // 10. Smooth Camera Follow + Shake
          camera.x += (player.x - camera.x) * Math.min(1, dt * 7.5);
          camera.y += (player.y - camera.y) * Math.min(1, dt * 7.5);

          const viewScale = canvas.width < 640 ? 0.78 : 1;
          const halfW = (canvas.width * 0.5) / viewScale;
          const halfH = (canvas.height * 0.5) / viewScale;
          if (WORLD_WIDTH > halfW * 2) {
            camera.x = Math.max(halfW, Math.min(WORLD_WIDTH - halfW, camera.x));
          } else {
            camera.x = WORLD_WIDTH * 0.5;
          }
          if (WORLD_HEIGHT > halfH * 2) {
            camera.y = Math.max(halfH, Math.min(WORLD_HEIGHT - halfH, camera.y));
          } else {
            camera.y = WORLD_HEIGHT * 0.5;
          }

          if (camera.shakeMagnitude > 0.2) {
            camera.shakeX = (Math.random() - 0.5) * 2 * camera.shakeMagnitude;
            camera.shakeY = (Math.random() - 0.5) * 2 * camera.shakeMagnitude;
            camera.shakeMagnitude *= Math.pow(0.78, dt * 60);
          } else {
            camera.shakeMagnitude = 0;
            camera.shakeX = 0;
            camera.shakeY = 0;
          }
        }
      }

      justPressedKeys.clear();

      // ========================================================================
      // RENDER PASS (SEMI-3D / 2.5D PERSPECTIVE)
      // ========================================================================
      ctx.fillStyle = currentSector.bgTint;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const isMobileCanvas = canvas.width < 640;
      const viewScale = isMobileCanvas ? 0.78 : 1;
      const viewW = canvas.width / viewScale;
      const viewH = canvas.height / viewScale;

      const camLeft = camera.x - viewW * 0.5 + camera.shakeX;
      const camTop = camera.y - viewH * 0.5 + camera.shakeY;

      // 1. Render Multi-Layer 3D Z-Depth Starfield
      for (let i = 0; i < stars.length; i++) {
        const st = stars[i];
        const px = ((st.x - camLeft * st.z) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH;
        const py = ((st.y - camTop * st.z) % WORLD_HEIGHT + WORLD_HEIGHT) % WORLD_HEIGHT;
        if (px >= -10 && px <= canvas.width + 10 && py >= -10 && py <= canvas.height + 10) {
          const twinkle = 0.55 + 0.45 * Math.sin(now * 0.003 + st.twinklePhase);
          ctx.fillStyle = st.color;
          ctx.globalAlpha = twinkle;
          if (player.nosComboTimer > 0 && st.z > 0.6) {
            ctx.fillRect(Math.floor(px), Math.floor(py), st.size * 4, st.size);
          } else {
            ctx.fillRect(Math.floor(px), Math.floor(py), st.size, st.size);
          }
        }
      }
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.scale(viewScale, viewScale);
      ctx.translate(-Math.floor(camLeft), -Math.floor(camTop));

      // 2. Render 3D Perspective Cyber-Grid Floor
      draw3DPerspectiveFloor(camLeft, camTop, viewW, viewH);

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
      ctx.lineWidth = 3;
      ctx.strokeRect(60, 60, WORLD_WIDTH - 120, WORLD_HEIGHT - 120);

      // 3. Render 3D Volumetric Planets
      draw3DPlanet(
        420,
        360,
        82,
        currentSector.planetColor,
        currentSector.planetRingColor,
        currentSector.id === 1
      );
      draw3DPlanet(WORLD_WIDTH - 390, WORLD_HEIGHT - 340, 58, '#38BDF8', '#BAE6FD', false);

      // 4. Render 3D Vortex Warp Gate Portal (if not Endless mode)
      if (!currentSector.isEndlessFinal) {
        ctx.save();
        ctx.translate(Math.floor(warpPortal.x), Math.floor(warpPortal.y));
        for (let ringIdx = 3; ringIdx >= 1; ringIdx--) {
          const r = warpPortal.radius * (ringIdx / 3);
          ctx.strokeStyle = warpPortal.active
            ? ringIdx === 1
              ? '#A7F3D0'
              : '#34D399'
            : '#475569';
          ctx.lineWidth = warpPortal.active ? 4 : 2.5;
          ctx.setLineDash([12, 8]);
          ctx.beginPath();
          ctx.arc(
            0,
            (3 - ringIdx) * -4,
            r,
            warpPortal.spinAngle * ringIdx,
            warpPortal.spinAngle * ringIdx + Math.PI * 2
          );
          ctx.stroke();
        }
        ctx.setLineDash([]);

        ctx.fillStyle = warpPortal.active ? '#ECFDF5' : '#94A3B8';
        ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        const neededForGate = Math.max(0, currentSector.targetCount - collectedCount);
        ctx.fillText(
          warpPortal.active
            ? 'GERBANG TERBUKA! MASUK SEKARANG!'
            : boss.active
            ? 'KALAHKAN BOS MONSTER UNTUK MEMBUKA GERBANG!'
            : `GERBANG BINTANG: ${toArabicDigits(collectedCount)} / ${toArabicDigits(currentSector.targetCount)} KRISTAL (Kurang +${toArabicDigits(neededForGate)})`,
          0,
          -warpPortal.radius - 16
        );
        ctx.restore();
      }

      // 5. Render Heart Shield Pickups
      for (let i = 0; i < heartPickups.length; i++) {
        const hp = heartPickups[i];
        if (!hp.active) continue;
        const hy = hp.y + Math.sin(hp.bobPhase) * 6;
        ctx.save();
        ctx.translate(Math.floor(hp.x), Math.floor(hy));
        ctx.fillStyle = 'rgba(2, 6, 23, 0.5)';
        ctx.beginPath();
        ctx.arc(8, 14, 18, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(52, 211, 153, 0.25)';
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#34D399';
        ctx.fillRect(-8, -3, 16, 6);
        ctx.fillRect(-3, -8, 6, 16);
        ctx.restore();
      }

      // 6. Render 3D Collectible Star Orbs (With Addition Crystal Count & Preview)
      const nextExpectedNum = getSequenceNumberAt(collectedCount);
      const isAdditionMode = !currentSector.orderedMode && !currentSector.isEndlessFinal;
      for (let i = 0; i < orbs.length; i++) {
        const orb = orbs[i];
        if (orb.collected) continue;

        const sumPreviewVal = Math.min(currentSector.targetCount, collectedCount + orb.crystalValue);
        const displayNumVal = isAdditionMode
          ? sumPreviewVal
          : currentSector.orderedMode || currentSector.isEndlessFinal
          ? orb.assignedNumber
          : nextExpectedNum;
        const info = ARABIC_NUMBERS[displayNumVal] || ARABIC_NUMBERS[1];
        const isNextInOrder = isAdditionMode
          ? collectedCount + orb.crystalValue <= currentSector.targetCount
          : !currentSector.orderedMode || orb.assignedNumber === nextExpectedNum;

        const bobY = orb.y + Math.sin(orb.bobPhase) * 7;
        ctx.save();
        ctx.translate(Math.floor(orb.x), Math.floor(bobY));

        ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
        ctx.beginPath();
        ctx.ellipse(12, 24, orb.radius * 0.85, orb.radius * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        if ((currentSector.orderedMode || isAdditionMode) && isNextInOrder) {
          const beaconR = orb.radius + 15 + Math.sin(now * 0.008) * 5;
          ctx.strokeStyle = orb.crystalValue >= 2 ? '#34D399' : '#FACC15';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.arc(0, 0, beaconR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        const orbGrad = ctx.createRadialGradient(-10, -10, 4, 0, 0, orb.radius);
        orbGrad.addColorStop(0, '#334155');
        orbGrad.addColorStop(1, '#090D16');
        ctx.fillStyle = orbGrad;
        ctx.strokeStyle = orb.wrongBounceTimer > 0 ? '#F87171' : info.color;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(0, 0, orb.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = info.color + '88';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(
          0,
          0,
          orb.radius + 9,
          (orb.radius + 9) * 0.38,
          Math.sin(orb.bobPhase * 0.5) * 0.4,
          0,
          Math.PI * 2
        );
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (isAdditionMode) {
          // Show "+١" / "+٢" / "+٣" crystal value and star icons inside the orb
          ctx.font = '800 23px "Outfit", "Plus Jakarta Sans", sans-serif';
          ctx.fillText(`+${toArabicDigits(orb.crystalValue)}`, 0, -5);
          ctx.fillStyle = '#FACC15';
          ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
          ctx.fillText('★'.repeat(Math.min(3, orb.crystalValue)), 0, 14);
        } else {
          const numLen = info.arabicNumeral.length;
          ctx.font =
            numLen >= 3
              ? '800 21px "Outfit", "Plus Jakarta Sans", sans-serif'
              : numLen === 2
              ? '800 25px "Outfit", "Plus Jakarta Sans", sans-serif'
              : '800 28px "Outfit", "Plus Jakarta Sans", sans-serif';
          ctx.fillText(info.arabicNumeral, 0, -1);
        }

        if (orb.cageHp > 0) {
          ctx.strokeStyle = orb.hitFlash > 0 ? '#FFFFFF' : '#38BDF8';
          ctx.fillStyle = orb.hitFlash > 0 ? 'rgba(255,255,255,0.35)' : 'rgba(56, 189, 248, 0.18)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          for (let side = 0; side < 6; side++) {
            const a = (side / 6) * Math.PI * 2 + now * 0.0015;
            const rx = Math.cos(a) * (orb.radius + 10);
            const ry = Math.sin(a) * (orb.radius + 10);
            if (side === 0) ctx.moveTo(rx, ry);
            else ctx.lineTo(rx, ry);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

        ctx.fillStyle = info.color;
        ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
        if (isAdditionMode) {
          ctx.fillText(
            `Jadi ${info.arabicNumeral} (${info.transliteration})`,
            0,
            orb.radius + 17
          );
        } else {
          ctx.fillText(info.transliteration, 0, orb.radius + 17);
        }

        ctx.restore();
      }

      // 7. Render 2.5D Volumetric Asteroids, UFO Drones & Chaser Interceptors
      for (let i = 0; i < hazards.length; i++) {
        const hz = hazards[i];
        if (hz.state === 'RESPAWNING') continue;

        ctx.save();
        ctx.translate(Math.floor(hz.x), Math.floor(hz.y));

        ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
        ctx.beginPath();
        ctx.ellipse(14, 24, hz.radius * 0.9, hz.radius * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();

        const isFlash = hz.hitFlash > 0;

        if (hz.type === 'ASTEROID') {
          ctx.save();
          ctx.rotate(hz.angle);
          const r = hz.radius;

          ctx.fillStyle = isFlash ? '#FFFFFF' : '#1E293B';
          ctx.strokeStyle = isFlash ? '#FFFFFF' : '#64748B';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(-r * 0.8, -r * 0.5 + 5);
          ctx.lineTo(0, -r + 5);
          ctx.lineTo(r * 0.85, -r * 0.4 + 5);
          ctx.lineTo(r, r * 0.3 + 5);
          ctx.lineTo(r * 0.4, r * 0.95 + 5);
          ctx.lineTo(-r * 0.5, r * 0.85 + 5);
          ctx.lineTo(-r, r * 0.2 + 5);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = isFlash ? '#FFFFFF' : '#475569';
          ctx.strokeStyle = isFlash ? '#FFFFFF' : '#94A3B8';
          ctx.beginPath();
          ctx.moveTo(-r * 0.75, -r * 0.5 - 3);
          ctx.lineTo(0, -r - 3);
          ctx.lineTo(r * 0.8, -r * 0.4 - 3);
          ctx.lineTo(r * 0.9, r * 0.25 - 3);
          ctx.lineTo(r * 0.35, r * 0.85 - 3);
          ctx.lineTo(-r * 0.45, r * 0.75 - 3);
          ctx.lineTo(-r * 0.9, r * 0.15 - 3);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#F59E0B';
          ctx.fillRect(-r * 0.3, -r * 0.2, 8, 8);
          ctx.fillRect(r * 0.15, r * 0.15, 6, 6);
          ctx.restore();
        } else if (hz.type === 'CHASER') {
          // 2.5D Alien Crimson Interceptor
          ctx.save();
          ctx.rotate(hz.angle + Math.PI * 0.5);
          ctx.fillStyle = isFlash ? '#FFFFFF' : '#881337';
          ctx.strokeStyle = '#F43F5E';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, -24);
          ctx.lineTo(20, 18);
          ctx.lineTo(0, 10);
          ctx.lineTo(-20, 18);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#FACC15';
          ctx.beginPath();
          ctx.arc(0, -4, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          // 2.5D Alien UFO Cruiser
          if (hz.state === 'WINDUP') {
            ctx.save();
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.75)';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(hz.targetX - hz.x, hz.targetY - hz.y);
            ctx.stroke();
            ctx.setLineDash([]);

            const warnRadius = hz.radius + 10 + Math.sin(now * 0.025) * 6;
            ctx.strokeStyle = '#F59E0B';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 0, warnRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          ctx.fillStyle = isFlash ? '#FFFFFF' : '#312E81';
          ctx.beginPath();
          ctx.ellipse(0, 4, 28, 12, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = isFlash ? '#FFFFFF' : hz.state === 'DASH' ? '#EF4444' : '#6366F1';
          ctx.strokeStyle = '#A5B4FC';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(0, 0, 26, 10, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = isFlash ? '#FFFFFF' : '#38BDF8';
          ctx.beginPath();
          ctx.ellipse(0, -6, 13, 8, 0, 0, Math.PI * 2);
          ctx.fill();

          const lightOffset = Math.floor(now * 0.01) % 3;
          for (let l = -1; l <= 1; l++) {
            ctx.fillStyle = l + 1 === lightOffset ? '#FACC15' : '#E0E7FF';
            ctx.beginPath();
            ctx.arc(l * 13, 2, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        if (hz.hp < hz.maxHp) {
          const barW = 38;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.fillRect(-barW * 0.5, -hz.radius - 16, barW, 6);
          ctx.fillStyle = hz.type === 'ASTEROID' ? '#F59E0B' : '#F43F5E';
          ctx.fillRect(-barW * 0.5 + 1, -hz.radius - 15, (barW - 2) * (hz.hp / hz.maxHp), 4);
        }

        ctx.restore();
      }

      // 8. Render 2.5D Boss Monster if Active
      draw25DBossMonster(now);

      // 9. Render 3D Lock-On Target Reticle
      if (lockedTarget && state === 'PLAYING') {
        ctx.save();
        ctx.translate(Math.floor(lockedTarget.x), Math.floor(lockedTarget.y));
        const pulse = Math.sin(now * 0.015) * 4;
        const r = lockedTarget.radius + pulse;
        ctx.strokeStyle = lockedTarget.color;
        ctx.lineWidth = 2.5;

        const corner = 10;
        ctx.beginPath();
        ctx.moveTo(-r, -r + corner);
        ctx.lineTo(-r, -r);
        ctx.lineTo(-r + corner, -r);
        ctx.moveTo(r - corner, -r);
        ctx.lineTo(r, -r);
        ctx.lineTo(r, -r + corner);
        ctx.moveTo(r, r - corner);
        ctx.lineTo(r, r);
        ctx.lineTo(r - corner, r);
        ctx.moveTo(-r + corner, r);
        ctx.lineTo(-r, r);
        ctx.lineTo(-r, r - corner);
        ctx.stroke();

        ctx.restore();
      }

      // 10. Render Player Lasers & Enemy Plasma Orbs
      for (let i = 0; i < laserPool.length; i++) {
        const b = laserPool[i];
        if (!b.active) continue;
        ctx.save();
        ctx.translate(Math.floor(b.x), Math.floor(b.y));

        if (b.isEnemy) {
          // 3D Enemy Plasma Sphere
          ctx.fillStyle = 'rgba(2, 6, 23, 0.45)';
          ctx.beginPath();
          ctx.arc(6, 12, b.radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = b.color;
          ctx.beginPath();
          ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(-2, -2, b.radius * 0.45, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.rotate(b.angle);
          ctx.fillStyle = 'rgba(2, 6, 23, 0.4)';
          ctx.fillRect(-10, 14, 20, 4);

          ctx.fillStyle = b.color;
          ctx.fillRect(-13, -3.5, 26, 7);

          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(-9, -1.5, 18, 3);
        }
        ctx.restore();
      }

      // 11. Render 2.5D Player Starfighter
      draw25DStarfighter(now);

      // 12. Render 3D Shockwave Rings
      for (let i = 0; i < shockwaves.length; i++) {
        const sw = shockwaves[i];
        if (!sw.active) continue;
        ctx.save();
        ctx.globalAlpha = sw.alpha;
        ctx.strokeStyle = sw.color;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.ellipse(sw.x, sw.y, sw.radius, sw.radius * 0.78, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 13. Render 3D Voxel Debris Particles
      for (let i = 0; i < particlePool.length; i++) {
        const p = particlePool[i];
        if (!p.active) continue;
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = 'rgba(2, 6, 23, 0.45)';
        ctx.fillRect(
          Math.floor(p.x - p.size * 0.5 + 4),
          Math.floor(p.y - p.size * 0.5 + 8),
          p.size,
          p.size
        );
        ctx.fillStyle = p.color;
        ctx.fillRect(
          Math.floor(p.x - p.size * 0.5),
          Math.floor(p.y - p.z - p.size * 0.5),
          p.size,
          p.size
        );
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      // 14. Render Floating Arabic Pronunciation Holograms
      for (let i = 0; i < floatingTexts.length; i++) {
        const ft = floatingTexts[i];
        const alpha = Math.min(1, (1 - ft.life / ft.maxLife) * 1.4);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(Math.floor(ft.x), Math.floor(ft.y));

        ctx.fillStyle = 'rgba(7, 11, 25, 0.92)';
        ctx.strokeStyle = ft.color;
        ctx.lineWidth = 2;
        ctx.fillRect(-102, -38, 204, 62);
        ctx.strokeRect(-102, -38, 204, 62);

        ctx.textAlign = 'center';
        ctx.fillStyle = ft.color;
        ctx.font = '800 19px "Outfit", "Plus Jakarta Sans", sans-serif';
        ctx.fillText(`${ft.arabicNumeral} · ${ft.arabicWord}`, 0, -14);

        ctx.fillStyle = '#F8FAFC';
        ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(`${ft.transliteration} — ${ft.meaning}`, 0, 10);

        ctx.restore();
      }

      ctx.restore();

      // 15. Off-screen Directional Waypoint Indicator
      if (state === 'PLAYING') {
        let targetX: number | null = null;
        let targetY: number | null = null;
        let indicatorColor = '#38BDF8';
        let indicatorLabel = '';

        if (boss.active) {
          targetX = boss.x;
          targetY = boss.y;
          indicatorColor = '#F43F5E';
          indicatorLabel = 'BOS';
        } else if (warpPortal.active) {
          targetX = warpPortal.x;
          targetY = warpPortal.y;
          indicatorColor = '#34D399';
          indicatorLabel = 'PORTAL';
        } else {
          const expectedWayNum = getSequenceNumberAt(collectedCount);
          let minDist = Infinity;
          for (let i = 0; i < orbs.length; i++) {
            const o = orbs[i];
            if (o.collected) continue;
            if (currentSector.orderedMode && o.assignedNumber !== expectedWayNum) continue;
            const d = Math.hypot(o.x - player.x, o.y - player.y);
            if (d < minDist) {
              minDist = d;
              targetX = o.x;
              targetY = o.y;
              const numVal =
                currentSector.orderedMode || currentSector.isEndlessFinal
                  ? o.assignedNumber
                  : expectedWayNum;
              const info = ARABIC_NUMBERS[numVal] || ARABIC_NUMBERS[1];
              indicatorColor = info.color;
              indicatorLabel = info.arabicNumeral;
            }
          }
        }

        if (targetX !== null && targetY !== null) {
          const screenX = (targetX - camLeft) * viewScale;
          const screenY = (targetY - camTop) * viewScale;
          const sideMargin = isMobileCanvas ? 36 : 64;
          const topMargin = isMobileCanvas ? 74 : 84;
          const bottomMargin = isMobileCanvas ? 155 : 130;

          if (
            screenX < sideMargin ||
            screenX > canvas.width - sideMargin ||
            screenY < topMargin ||
            screenY > canvas.height - bottomMargin
          ) {
            const angle = Math.atan2(targetY - player.y, targetX - player.x);
            const indX = Math.max(sideMargin, Math.min(canvas.width - sideMargin, screenX));
            const indY = Math.max(topMargin, Math.min(canvas.height - bottomMargin, screenY));

            ctx.save();
            ctx.translate(Math.floor(indX), Math.floor(indY));
            ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
            ctx.strokeStyle = indicatorColor;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 0, isMobileCanvas ? 17 : 20, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#FFFFFF';
            ctx.font = isMobileCanvas
              ? '800 12px "Outfit", sans-serif'
              : '800 14px "Outfit", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(indicatorLabel, 0, 0);

            ctx.rotate(angle);
            ctx.fillStyle = indicatorColor;
            const tipDist = isMobileCanvas ? 24 : 28;
            ctx.beginPath();
            ctx.moveTo(tipDist, 0);
            ctx.lineTo(tipDist - 7, -5);
            ctx.lineTo(tipDist - 7, 5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        }
      }

      animFrameId = requestAnimationFrame(tick);
    };

    animFrameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('trigger-magnet-dash', onTriggerMagnetDash);
      window.removeEventListener('toggle-auto-fire', onToggleAutoFire);
      window.removeEventListener('trigger-fire-burst', onTriggerFireBurst);
      window.removeEventListener('hold-fire-change', onHoldFireChange);
      window.removeEventListener('virtual-joystick', onVirtualJoystick);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [sectorIndex, resetTrigger]);

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full pixel-canvas cursor-crosshair touch-none"
    />
  );
};
