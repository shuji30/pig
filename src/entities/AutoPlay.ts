import Phaser from 'phaser';
import type { MotionKind } from '../data/motions';

/** 放置中にアバターを動かすために、場から借りる操作 */
export interface AutoPlayHost {
  /** 近くの自由なマスへ歩き出す。歩けたら true */
  wanderOnce(): boolean;
  /** 座れる家具へ向かう。向かえたら true */
  sitSomewhere(): boolean;
  /** 家具でできること（ねる・みる・みずやり など）をひとつやる。始められたら true */
  useSomething(): boolean;
  /** 立ち上がる */
  standUp(): void;
  playEmote(kind: MotionKind): void;
  /** 繰り返し再生中のモーションを止める */
  stopLoopMotion(): void;
  /** 歩行中など、次の行動を出せない状態か */
  isBusy(): boolean;
  isSitting(): boolean;
}

/** 操作をやめてから、自分で動きだすまでの時間(ms) */
const IDLE_DELAY = 10_000;
/** 行動と行動のあいだ(ms) */
const GAP_MIN = 2800;
const GAP_MAX = 6000;

const EMOTES_STANDING: MotionKind[] = ['wave', 'laugh', 'joy', 'love', 'clap', 'dance', 'sleep', 'surprised'];
const EMOTES_SITTING: MotionKind[] = ['wave', 'laugh', 'love', 'clap', 'sleep', 'surprised'];

/**
 * しばらく操作がないと、アバターが自分で歩いたり座ったりエモートしたりする。
 * 何か操作されたらすぐ止まり、待ち時間から数え直す。
 */
export class AutoPlay {
  enabled = true;
  /** 無操作が続いている時間 */
  private idle = 0;
  /** 次の行動までの残り時間 */
  private wait = 0;
  /** 直前に始めたのが繰り返し再生のモーションか */
  private startedLoop = false;

  constructor(private readonly host: AutoPlayHost) {}

  /** プレイヤーが何か操作した */
  notifyInput() {
    this.idle = 0;
    this.wait = 0;
    if (this.startedLoop) {
      // 自分で始めた「ねむる」「おどる」は、操作されたら解除する
      this.startedLoop = false;
      this.host.stopLoopMotion();
    }
  }

  update(deltaMs: number) {
    if (!this.enabled) {
      this.idle = 0;
      return;
    }
    this.idle += deltaMs;
    if (this.idle < IDLE_DELAY) return;
    if (this.host.isBusy()) return;

    this.wait -= deltaMs;
    if (this.wait > 0) return;
    this.wait = Phaser.Math.Between(GAP_MIN, GAP_MAX);
    this.act();
  }

  private act() {
    const roll = Math.random();
    if (this.host.isSitting()) {
      // 座っているときは、しばらく座ったまま過ごす
      if (roll < 0.42) this.emote();
      else if (roll < 0.68) {
        this.host.standUp();
        this.startedLoop = false;
        this.host.wanderOnce();
      }
      return;
    }
    if (roll < 0.46) {
      this.startedLoop = false;
      if (this.host.wanderOnce()) return;
      this.emote();
    } else if (roll < 0.62) {
      this.startedLoop = false;
      if (this.host.sitSomewhere()) return;
      this.emote();
    } else if (roll < 0.76) {
      // 部屋に置いたものを使ってみせる（置いた甲斐が見える時間）
      this.startedLoop = false;
      if (this.host.useSomething()) return;
      this.emote();
    } else if (roll < 0.94) {
      this.emote();
    }
    // 残りは何もしない（ぼーっとする時間）
  }

  private emote() {
    const list = this.host.isSitting() ? EMOTES_SITTING : EMOTES_STANDING;
    const kind = list[Phaser.Math.Between(0, list.length - 1)];
    this.startedLoop = kind === 'sleep' || kind === 'dance';
    this.host.playEmote(kind);
  }
}
