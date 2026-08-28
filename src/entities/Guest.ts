import Phaser from 'phaser';
import { GUEST_BYE, GUEST_HELLO } from '../data/guests';
import { getStamp } from '../data/stamps';
import type { AvatarLook } from '../types';
import { Avatar } from './Avatar';
import {
  advanceGuest,
  LOOK_GAP_MAX,
  LOOK_GAP_MIN,
  pickGuestAction,
  type GuestPhase,
  type GuestState,
} from './guestPlan';

type Tile = { gx: number; gy: number };

/** おきゃくさんが出すスタンプ。部屋をほめるものだけを選ぶ */
const GUEST_STAMPS = ['love', 'great', 'shiny', 'fun', 'thanks'];

/** 場から借りる操作。部屋の中身を知っているのは場のほう */
export interface GuestHost {
  pathTo(from: Tile, to: Tile): Tile[] | null;
  /** 家具のとなりで立てるマス（見に行く先）。無ければ空 */
  lookSpots(): Tile[];
  /** 出入りするマス（部屋のふち） */
  doorTile(): Tile;
  /** 座れる家具へ座らせる。座れたら true */
  trySit(guest: Guest): boolean;
  /** 帰りきったときに呼ばれる */
  onLeave(guest: Guest): void;
}

/**
 * たまに来る おきゃくさん。
 *
 * 見た目も歩き方も `Avatar` をそのまま使う（ロードマップの読み通り、
 * 複数インスタンス化するだけで済んだ）。違うのは「段取りがあること」だけで、
 * それは entities/guestPlan.ts に純粋関数として置いてある。
 */
export class Guest {
  readonly avatar: Avatar;
  private state: GuestState = { phase: 'arriving', elapsed: 0 };
  private wait = 1200;
  private arrived = false;
  private leftRoom = false;
  private saidBye = false;

  constructor(
    scene: Phaser.Scene,
    look: AvatarLook,
    door: Tile,
    private readonly host: GuestHost,
  ) {
    this.avatar = new Avatar(scene, look, door.gx, door.gy);
    this.avatar.say(GUEST_HELLO[Phaser.Math.Between(0, GUEST_HELLO.length - 1)]);
    this.walkSomewhere();
  }

  get phase(): GuestPhase {
    return this.state.phase;
  }

  get name(): string {
    return this.avatar.getLook().name;
  }

  setDepthResolver(fn: (box: { gx0: number; gx1: number; gy0: number; gy1: number }) => number) {
    this.avatar.setDepthResolver(fn);
  }

  refreshDepth() {
    this.avatar.refreshDepth();
  }

  destroy() {
    this.avatar.destroy();
  }

  update(deltaMs: number) {
    this.avatar.update(deltaMs);
    const before = this.state.phase;
    this.state = advanceGuest(this.state, deltaMs, this.arrived, this.leftRoom);

    if (this.state.phase !== before && this.state.phase === 'leaving') this.startLeaving();
    if (this.state.phase === 'gone') {
      this.host.onLeave(this);
      return;
    }
    if (this.state.phase !== 'looking' || this.avatar.isWalking) return;

    this.wait -= deltaMs;
    if (this.wait > 0) return;
    this.wait = Phaser.Math.Between(LOOK_GAP_MIN, LOOK_GAP_MAX);
    this.act();
  }

  private act() {
    const action = pickGuestAction(Math.random(), true);
    switch (action) {
      case 'look':
        this.walkSomewhere();
        break;
      case 'stamp':
        this.avatar.showStamp(getStamp(GUEST_STAMPS[Phaser.Math.Between(0, GUEST_STAMPS.length - 1)]));
        break;
      case 'sit':
        if (!this.host.trySit(this)) this.walkSomewhere();
        break;
      default:
        break;
    }
  }

  /** 家具のそばへ歩く。行けるところが無ければその場にいる */
  private walkSomewhere() {
    const spots = this.host.lookSpots();
    if (spots.length === 0) {
      this.arrived = true;
      return;
    }
    const to = spots[Phaser.Math.Between(0, spots.length - 1)];
    const path = this.host.pathTo(this.avatar.tile, to);
    if (!path) {
      this.arrived = true;
      return;
    }
    if (this.avatar.sittingOn) this.avatar.standUp();
    this.avatar.walk(path, () => {
      this.arrived = true;
    });
  }

  /** 帰りじたく。ひとこと言ってから出口へ歩く */
  private startLeaving() {
    if (this.saidBye) return;
    this.saidBye = true;
    if (this.avatar.sittingOn) this.avatar.standUp();
    this.avatar.say(GUEST_BYE[Phaser.Math.Between(0, GUEST_BYE.length - 1)]);
    const door = this.host.doorTile();
    const path = this.host.pathTo(this.avatar.tile, door);
    if (!path) {
      // 出口へ行けなくても、居座らせない
      this.leftRoom = true;
      return;
    }
    this.avatar.walk(path, () => {
      this.leftRoom = true;
    });
  }
}
