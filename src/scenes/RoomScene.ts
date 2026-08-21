import Phaser from 'phaser';
import { FLOOR_STYLES, ROOM_THEMES, TILE_H, TILE_W, WALL_H } from '../config';
import { gridToScreen, rotatedSize, screenToTile } from '../core/iso';
import { findPath, findPathAdjacent } from '../core/pathfinding';
import { screenToWallSlot, type WallSlot } from '../core/wall';
import { getDef } from '../data/furniture';
import type { MotionKind } from '../data/motions';
import { AutoPlay } from '../entities/AutoPlay';
import { Avatar } from '../entities/Avatar';
import { FurnitureLayer } from '../entities/FurnitureLayer';
import { WallLayer } from '../entities/WallLayer';
import { getFurnitureTexture } from '../render/furnitureTexture';
import { getWallTexture } from '../render/wallTexture';
import { RoomView } from '../render/room';
import { saveRoomPng } from '../render/snapshot';
import { buy, claimDailyBonus, claimMissions, expandRoom, missionViews, nextRoomStep, sell } from '../state/economy';
import { metricsSummary, track } from '../state/metrics';
import {
  centerSpawn,
  clearSave,
  currentRoom,
  DEFAULT_ROOM_NAME,
  HOME_ROOM,
  load,
  makeMoonRoom,
  MOON_ROOM,
  newUid,
  saveDebounced,
  tileKey,
} from '../state/save';
import {
  encodeShared,
  leaveShare,
  placedFromShared,
  ROOM_NAME_MAX,
  ROOM_NOTE_MAX,
  sharedFromRoom,
  shareUrlFor,
  wallFromShared,
  type SharedRoom,
} from '../state/share';
import type { AvatarLook, PlacedFurniture, PlacedWall, Recolor, RoomData, Rotation, SaveData } from '../types';
import { Ui } from '../ui/ui';

type Mode = 'idle' | 'place' | 'move' | 'wall-place' | 'wall-move' | 'paint';

/** 訪問中だけ使う、その場かぎりの部屋 id */
const VISIT_ROOM = 'visit';
type Tile = { gx: number; gy: number };

const HW = TILE_W / 2;
const HH = TILE_H / 2;
const DRAG_THRESHOLD = 10;

export class RoomScene extends Phaser.Scene {
  private save!: SaveData;
  private room!: RoomView;
  private furniture!: FurnitureLayer;
  private walls!: WallLayer;
  private avatar!: Avatar;
  private ui!: Ui;
  private auto!: AutoPlay;

  private hoverG!: Phaser.GameObjects.Graphics;
  private selG!: Phaser.GameObjects.Graphics;
  private ghost: Phaser.GameObjects.Image | null = null;
  private ghostG!: Phaser.GameObjects.Graphics;

  private mode: Mode = 'idle';
  private placeDefId: string | null = null;
  private placeRot: Rotation = 0;
  private moveUid: string | null = null;
  private selectedUid: string | null = null;
  /** 壁のほうで選ばれているもの。床の選択とは排他 */
  private selectedWallUid: string | null = null;

  private userZoomed = false;
  /** 2本指の間隔と中点。ピンチ中だけ値が入る */
  private pinch: { dist: number; mx: number; my: number } | null = null;
  private pinching = false;
  private pointerDownAt: { x: number; y: number } | null = null;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };

  /** 訪問モード（共有 URL で開かれた）かどうか */
  private visiting = false;
  /** 訪問中に押された ❤️ の数。端末のなかだけの記録 */
  private likes = 0;
  /** 床を塗るときの柄。部屋の基本の柄を選ぶと「もとに戻す」になる */
  private brush = 1;

  /**
   * @param shared 共有 URL から読めた部屋。null なら自分の部屋を開く
   * @param shareBroken 共有 URL は付いていたが読めなかった
   */
  constructor(
    private readonly shared: SharedRoom | null = null,
    private readonly shareBroken = false,
  ) {
    super('room');
  }

  create() {
    const own = load();
    this.visiting = this.shared !== null;
    // 訪問中は見ている部屋だけを持つ別のセーブを組み立てる。自分のセーブは一切書かない
    this.save = this.shared
      ? {
          ...own,
          rooms: {
            [VISIT_ROOM]: {
              name: this.shared.roomName,
              note: this.shared.roomNote,
              floor: this.shared.floor,
              wall: this.shared.wall,
              size: this.shared.size,
              floorPatch: { ...this.shared.floorPatch },
              items: placedFromShared(this.shared, newUid),
              wallItems: wallFromShared(this.shared, newUid),
              spawn: centerSpawn(this.shared.size),
            },
          },
          currentRoom: VISIT_ROOM,
          avatar: { look: { ...own.avatar.look } },
        }
      : own;
    track(this.visiting ? 'shareOpen' : 'session');

    this.cameras.main.setBackgroundColor('#2b2430');
    this.room = new RoomView(this);
    this.room.redraw(this.cur.floor, this.cur.wall, this.size, this.cur.floorPatch);

    this.furniture = new FurnitureLayer(this, this.size);
    this.furniture.setItems(this.cur.items);
    this.walls = new WallLayer(this, this.size);
    this.walls.setItems(this.cur.wallItems);

    this.hoverG = this.add.graphics().setDepth(-1700);
    this.selG = this.add.graphics().setDepth(-1690);
    this.ghostG = this.add.graphics().setDepth(9_000_000);

    this.avatar = new Avatar(this, this.save.avatar.look, this.cur.spawn.gx, this.cur.spawn.gy);
    this.avatar.setDepthResolver((box) => this.furniture.depthAt(box));

    this.ui = new Ui(this, {
      onPickFurniture: (defId) => {
        if (getDef(defId).category === 'wall') this.enterWallPlaceMode(defId);
        else this.enterPlaceMode(defId);
      },
      onFloorChange: (i) => {
        this.cur.floor = i;
        this.room.redraw(this.cur.floor, this.cur.wall, this.size, this.cur.floorPatch);
        this.save.daily.restyled += 1;
        this.noteEdit();
        this.syncMissions();
        this.persist();
      },
      onWallChange: (i) => {
        this.cur.wall = i;
        this.room.redraw(this.cur.floor, this.cur.wall, this.size, this.cur.floorPatch);
        this.save.daily.restyled += 1;
        this.noteEdit();
        this.syncMissions();
        this.persist();
      },
      onLookChange: (look) => this.applyLook(look),
      onChat: (text) => this.avatar.say(text),
      onReset: () => {
        clearSave();
        window.location.reload();
      },
      onPlaceAction: (act) => {
        if (act === 'rotate') this.rotatePlacing();
        else this.cancelPlacing();
      },
      onSelAction: (act) => this.selAction(act),
      onRecolor: (recolor) => this.applyRecolor(recolor),
      onEmote: (kind) => {
        this.avatar.playMotion(kind);
        this.save.daily.emoted += 1;
        this.syncMissions();
        this.persist();
      },
      onBuy: (defId) => {
        if (this.visiting) return;
        const def = getDef(defId);
        if (!buy(this.save, def)) {
          this.ui.toast('コインが足りないよ');
          return;
        }
        this.ui.toast(`${def.name}を かいました`);
        track('buy');
        this.afterEconomyChange();
      },
      onSell: (defId) => {
        const def = getDef(defId);
        const got = sell(this.save, def);
        if (got === 0) return;
        this.ui.toast(`${def.name}を うりました（🪙+${got}）`);
        this.afterEconomyChange();
      },
      onClaimMissions: () => {
        const { amount, count } = claimMissions(this.save, this.missionCtx());
        if (count === 0) return;
        this.ui.toast(`やること ${count}こ たっせい！ 🪙+${amount}`);
        this.afterEconomyChange();
      },
      onToggleAuto: () => {
        this.save.autoPlay = !this.save.autoPlay;
        this.auto.enabled = this.save.autoPlay;
        this.ui.setAutoPlay(this.save.autoPlay);
        this.persist();
      },
      onZoom: (factor) => this.zoomBy(factor),
      onCenter: () => this.centerOnAvatar(),
      onRoomTextChange: (name, note) => {
        if (this.visiting) return;
        this.cur.name = name.slice(0, ROOM_NAME_MAX).trim() || DEFAULT_ROOM_NAME;
        this.cur.note = note.slice(0, ROOM_NOTE_MAX);
        this.persist();
      },
      requestShareUrl: async () => shareUrlFor(await encodeShared(sharedFromRoom(this.cur, this.save.avatar.look))),
      onShareCopied: () => {
        track('share');
        this.refreshMetricsLine();
      },
      onSaveShot: () => void this.saveShot(),
      onLike: () => this.like(),
      onImportRoom: () => this.importVisitedRoom(),
      onExpandRoom: () => this.expand(),
      onThemeChange: (i) => {
        const theme = ROOM_THEMES[i];
        if (!theme || this.visiting) return;
        this.cur.floor = theme.floor;
        this.cur.wall = theme.wall;
        this.room.redraw(this.cur.floor, this.cur.wall, this.size, this.cur.floorPatch);
        this.ui.setStyles(this.cur.floor, this.cur.wall);
        this.save.daily.restyled += 1;
        this.noteEdit();
        this.syncMissions();
        this.persist();
        this.ui.toast(`テーマを ${theme.name} にしたよ`);
      },
      onBrushChange: (i) => {
        this.brush = i;
        if (this.mode === 'paint') this.ui.setPainting(true, FLOOR_STYLES[this.brush]?.name ?? 'ゆか');
      },
      onTogglePaint: () => this.togglePaint(),
      onGoHome: () => this.travelTo(HOME_ROOM),
      onPaintAction: (act) => {
        if (act === 'clear') this.clearFloorPatch();
        else this.togglePaint(false);
      },
      onLeaveVisit: () => leaveShare(),
      onPanelOpen: (name) => {
        this.deselect();
        if (this.mode === 'paint') this.togglePaint(false);
        else if (this.mode !== 'idle') this.cancelPlacing();
        // きせかえ・きもち はアバターが見えないと選べないので、上のほうへ寄せる
        if (name === 'wardrobe' || name === 'emote') this.focusAvatar();
        if (name === 'missions') this.syncMissions();
      },
    });
    this.auto = new AutoPlay({
      wanderOnce: () => this.wanderOnce(),
      sitSomewhere: () => this.sitSomewhere(),
      standUp: () => this.avatar.standUp(),
      playEmote: (kind) => this.avatar.playMotion(kind),
      stopLoopMotion: () => {
        if (this.avatar.loopingMotion) this.avatar.stopMotion();
      },
      isBusy: () => this.avatar.isWalking || this.mode !== 'idle',
      isSitting: () => this.avatar.sittingOn !== null,
    });
    this.auto.enabled = this.save.autoPlay;
    this.ui.setAutoPlay(this.save.autoPlay);
    this.ui.setLook(this.save.avatar.look);
    this.ui.setStyles(this.cur.floor, this.cur.wall);
    // 基本の柄と違う柄を初期のブラシにしておく（塗ってすぐ見て分かるように）
    this.brush = this.cur.floor === 1 ? 0 : 1;
    this.ui.setBrush(this.brush);
    this.syncRoomSize();
    this.ui.setInventory(this.save.inventory);
    this.ui.setCoins(this.save.coins);
    this.syncMissions();
    this.setHint();

    // その日はじめての訪問ならログインボーナス（人の部屋では配らない）
    const bonus = this.visiting ? { amount: 0, streak: 0 } : claimDailyBonus(this.save);
    if (bonus.amount > 0) {
      this.ui.setCoins(this.save.coins);
      this.time.delayedCall(700, () =>
        this.ui.toast(`ログインボーナス 🪙+${bonus.amount}（${bonus.streak}日れんぞく）`),
      );
      this.persist();
    }

    this.ui.setRoomText(this.cur.name, this.cur.note);
    this.ui.setAtHome(this.visiting || this.save.currentRoom === HOME_ROOM);
    this.avatar.setFloaty(!this.visiting && this.save.currentRoom === MOON_ROOM);
    this.refreshMetricsLine();
    if (this.shared) {
      this.ui.setVisiting({
        roomName: this.shared.roomName,
        roomNote: this.shared.roomNote,
        ownerName: this.shared.look.name,
      });
      this.time.delayedCall(500, () => this.ui.toast(`${this.shared?.roomName} にきました`));
    } else {
      this.ui.setVisiting(null);
      if (this.shareBroken) {
        this.time.delayedCall(500, () => this.ui.toast('この URL の部屋は読めませんでした'));
      }
    }

    this.ensureAvatarStandable();
    this.setupCamera();
    this.setupInput();
  }

  /** いま映している部屋 */
  private get cur(): RoomData {
    return currentRoom(this.save);
  }

  /** いまの部屋の一辺のマス数 */
  private get size(): number {
    return this.cur.size;
  }

  // ---------------- 部屋をひろげる ----------------

  /** 「ひろさ」の表示をいまの状態に合わせる */
  private syncRoomSize() {
    this.ui.setRoomSize(this.size, nextRoomStep(this.size), this.save.coins);
  }

  private expand() {
    if (this.visiting) return;
    const step = nextRoomStep(this.size);
    if (!step) return;
    if (!expandRoom(this.save, this.cur)) {
      this.ui.toast('コインが足りないよ');
      return;
    }
    // 広さが変わったので、床・占有マス・カメラを作り直す
    this.furniture.setSize(this.size);
    this.furniture.setItems(this.cur.items);
    this.walls.setSize(this.size);
    this.walls.setItems(this.cur.wallItems);
    this.room.redraw(this.cur.floor, this.cur.wall, this.size, this.cur.floorPatch);
    this.avatar.refreshDepth();
    this.userZoomed = false;
    this.applyFitZoom();
    this.centerOnRoom();
    this.noteEdit();
    this.ui.toast(`おへやが ${step.size}×${step.size} になったよ！`);
    this.syncRoomSize();
    this.afterEconomyChange();
  }

  /** 部屋のまんなかを映す */
  private centerOnRoom() {
    const center = gridToScreen(this.size / 2, this.size / 2);
    this.cameras.main.pan(center.x, center.y - WALL_H / 3, 400, 'Sine.easeInOut');
  }

  // ---------------- みせる（共有・画像・いいね） ----------------

  /** 端末のなかで数えている記録を「あそびかた」に出す */
  private refreshMetricsLine() {
    const m = metricsSummary();
    this.ui.setMetricsLine(
      `記録（この端末だけ）：あそんだ日 ${m.playDays}日 / 部屋をいじった日 ${m.editDays}日 / ` +
        `みせた ${m.totals.share}回 / ひとの部屋にいった ${m.totals.shareOpen}回`,
    );
  }

  /** 部屋を編集した、と数える。北極星指標のもと */
  private noteEdit() {
    if (this.visiting) return;
    track('edit');
  }

  private async saveShot() {
    this.ui.closePanels();
    this.ui.toast('しゃしんを とっています…');
    // パネルを閉じた直後のフレームを撮りたいので1回待つ
    await new Promise<void>((r) => this.time.delayedCall(120, r));
    const ok = await saveRoomPng(this.game, {
      roomName: this.cur.name,
      ownerName: this.visiting ? (this.shared?.look.name ?? 'だれか') : this.save.avatar.look.name,
      likes: this.likes,
    });
    if (ok) {
      track('png');
      this.refreshMetricsLine();
      this.ui.toast('画像をほぞんしました');
    } else {
      this.ui.toast('画像をつくれませんでした');
    }
  }

  /**
   * 訪問中の ❤️。サーバーが無いのでオーナーには届かないが、
   * ハートが飛んでスクリーンショットに数が残る。
   */
  private like() {
    this.likes += 1;
    this.ui.setLikes(this.likes);
    track('like');
    this.popHearts(3);
    this.avatar.playMotion('love');
  }

  /** アバターのまわりからハートを飛ばす */
  private popHearts(n: number) {
    for (let i = 0; i < n; i++) {
      const t = this.add
        .text(
          this.avatar.container.x + Phaser.Math.Between(-18, 18),
          this.avatar.container.y - Phaser.Math.Between(10, 30),
          '❤️',
          { fontSize: `${Phaser.Math.Between(16, 24)}px` },
        )
        .setOrigin(0.5)
        .setDepth(9_500_000);
      this.tweens.add({
        targets: t,
        y: t.y - Phaser.Math.Between(60, 100),
        x: t.x + Phaser.Math.Between(-24, 24),
        alpha: 0,
        duration: Phaser.Math.Between(900, 1400),
        delay: i * 120,
        ease: 'Sine.easeOut',
        onComplete: () => t.destroy(),
      });
    }
  }

  /** 見ている部屋を自分の部屋として保存する（共有 URL のバックアップ復元も同じ道） */
  private importVisitedRoom() {
    if (!this.shared) return;
    const own = load();
    own.rooms[HOME_ROOM] = {
      name: this.shared.roomName,
      note: this.shared.roomNote,
      floor: this.shared.floor,
      wall: this.shared.wall,
      size: this.shared.size,
      floorPatch: { ...this.shared.floorPatch },
      items: placedFromShared(this.shared, newUid),
      wallItems: wallFromShared(this.shared, newUid),
      spawn: centerSpawn(this.shared.size),
    };
    own.currentRoom = HOME_ROOM;
    // 置いてあるぶんは持ちものから引かない。取りこみでコインを稼げてしまうため、
    // しまったときに増える方向だけを許す
    saveDebounced(own);
    track('import');
    this.ui.toast('とりこみました。じぶんの部屋にいきます');
    window.setTimeout(() => leaveShare(), 900);
  }

  private lastLoopEmote: MotionKind | null = null;

  override update(_time: number, delta: number) {
    this.avatar.update(delta);
    this.auto.update(delta);
    // 繰り返し再生の開始・終了に合わせてボタンとヒントを切り替える
    const loop = this.avatar.loopingMotion;
    if (loop !== this.lastLoopEmote) {
      this.lastLoopEmote = loop;
      this.ui.setActiveEmote(loop);
      if (loop) this.ui.setHint('もう一度おすと やめるよ');
      else this.setHint();
    }
  }

  // ---------------- カメラ ----------------

  private setupCamera() {
    const cam = this.cameras.main;
    this.applyFitZoom();

    // 部屋が画面に収まらない（スマホなど）ときはアバターを中心にする
    if (this.roomFitsWidth()) {
      const center = gridToScreen(this.size / 2, this.size / 2);
      cam.centerOn(center.x, center.y - WALL_H / 3);
    } else {
      cam.centerOn(this.avatar.container.x, this.avatar.container.y - 40);
    }

    this.scale.on('resize', () => {
      if (!this.userZoomed) this.applyFitZoom();
    });

    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.zoomAt(dy > 0 ? 0.9 : 1.1, p.x, p.y);
    });
  }

  private roomWidthPx(): number {
    return this.size * 2 * HW;
  }

  private roomFitsWidth(): boolean {
    return this.roomWidthPx() * this.cameras.main.zoom <= this.scale.width - 16;
  }

  private applyFitZoom() {
    const roomH = this.size * 2 * HH + WALL_H;
    const fit = Math.min(this.scale.width / (this.roomWidthPx() + 80), this.scale.height / (roomH + 140));
    this.cameras.main.setZoom(Phaser.Math.Clamp(fit, 0.8, 1.5));
  }

  zoomBy(factor: number) {
    this.userZoomed = true;
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * factor, 0.45, 2.4));
  }

  /**
   * 画面上の一点を固定したまま拡大縮小する（指やカーソルの下がずれない）。
   * Phaser のカメラは「画面中央のワールド座標 = scroll + 画面サイズ/2」で、
   * 中央からのずれだけが zoom で割られる。つまり
   *   world = scroll + W/2 + (screen - W/2) / zoom
   * なので、その点を固定するには zoom 変更ぶんだけ scroll を戻せばよい。
   */
  private zoomAt(factor: number, screenX: number, screenY: number) {
    const cam = this.cameras.main;
    const z0 = cam.zoom;
    this.zoomBy(factor);
    const z1 = cam.zoom;
    if (z1 === z0) return;
    const k = 1 / z0 - 1 / z1;
    cam.scrollX += (screenX - cam.width / 2) * k;
    cam.scrollY += (screenY - cam.height / 2) * k;
  }

  /** 押されている指（マウスは含まない） */
  private downPointers(): Phaser.Input.Pointer[] {
    const list = [this.input.pointer1, this.input.pointer2, this.input.pointer3];
    return list.filter((p): p is Phaser.Input.Pointer => !!p && p.isDown);
  }

  /** アバターを画面中央に映す */
  centerOnAvatar() {
    this.cameras.main.pan(this.avatar.container.x, this.avatar.container.y - 40, 300, 'Sine.easeInOut');
  }

  /** アバターを画面上部に映すようカメラを寄せる */
  private focusAvatar() {
    const cam = this.cameras.main;
    const offsetY = (this.scale.height * 0.22) / cam.zoom;
    cam.pan(this.avatar.container.x, this.avatar.container.y - 24 + offsetY, 320, 'Sine.easeInOut');
  }

  // ---------------- 入力 ----------------

  private setupInput() {
    // アバターの自動行動を止めるため、画面のどこを触っても「操作あり」と数える
    const wake = () => this.auto.notifyInput();
    window.addEventListener('pointerdown', wake, { capture: true });
    window.addEventListener('keydown', wake, { capture: true });
    window.addEventListener('wheel', wake, { capture: true, passive: true });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('pointerdown', wake, { capture: true });
      window.removeEventListener('keydown', wake, { capture: true });
      window.removeEventListener('wheel', wake, { capture: true });
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.pointerDownAt = { x: p.x, y: p.y };
      this.lastPointer = { x: p.x, y: p.y };
      this.dragging = false;
      const downs = this.downPointers();
      if (downs.length >= 2) {
        this.beginPinch(downs);
        return;
      }
      // 指1本から始まったので、ピンチ状態は解除しておく。
      // touchcancel などで離した指を取りこぼしても、次の操作で復帰できる
      this.pinching = false;
      this.pinch = null;
      // タッチでは pointermove が来ないことがあるので、押した位置でゴーストを更新する
      if (this.mode === 'paint') this.paintTile(screenToTile(p.worldX, p.worldY));
      else if (this.mode === 'wall-place' || this.mode === 'wall-move') this.updateWallGhost(p.worldX, p.worldY);
      else if (this.mode !== 'idle') this.updateGhost(screenToTile(p.worldX, p.worldY));
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const downs = this.downPointers();
      if (downs.length >= 2) {
        this.updatePinch(downs);
        return;
      }
      // 塗るモードでは、指を動かしている間ずっと塗る（カメラは動かさない）
      if (this.mode === 'paint') {
        if (p.isDown) this.paintTile(screenToTile(p.worldX, p.worldY));
        this.drawHover(screenToTile(p.worldX, p.worldY));
        this.lastPointer = { x: p.x, y: p.y };
        return;
      }
      if (p.isDown && this.pointerDownAt) {
        const moved = Phaser.Math.Distance.Between(this.pointerDownAt.x, this.pointerDownAt.y, p.x, p.y);
        if (moved > DRAG_THRESHOLD) this.dragging = true;
        if (this.dragging && this.mode === 'idle') {
          const cam = this.cameras.main;
          cam.scrollX -= (p.x - this.lastPointer.x) / cam.zoom;
          cam.scrollY -= (p.y - this.lastPointer.y) / cam.zoom;
        }
      }
      this.lastPointer = { x: p.x, y: p.y };
      if (this.mode === 'wall-place' || this.mode === 'wall-move') {
        this.updateWallGhost(p.worldX, p.worldY);
        return;
      }
      const tile = screenToTile(p.worldX, p.worldY);
      if (this.mode === 'idle') this.drawHover(tile);
      else this.updateGhost(tile);
    });

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      // ピンチで動かした指を離しただけのときは、クリックとして扱わない
      if (this.pinching) {
        this.pointerDownAt = null;
        this.dragging = false;
        if (this.downPointers().length === 0) {
          this.pinching = false;
          this.pinch = null;
        }
        return;
      }
      const wasDrag = this.dragging;
      this.pointerDownAt = null;
      this.dragging = false;
      if (wasDrag) return;
      this.handleClick(p.worldX, p.worldY);
    });

    this.input.on('pointerupoutside', () => {
      this.pointerDownAt = null;
      this.dragging = false;
      if (this.downPointers().length === 0) {
        this.pinching = false;
        this.pinch = null;
      }
    });

    const kb = this.input.keyboard;
    kb?.on('keydown-R', () => {
      if (this.ui.isTyping) return;
      // 壁に掛けるものは向きが場所で決まるので回さない
      if (this.mode === 'wall-place' || this.mode === 'wall-move') return;
      if (this.mode !== 'idle') this.rotatePlacing();
      else if (this.selectedUid) this.rotateSelected();
    });
    kb?.on('keydown-ESC', () => {
      if (this.ui.isTyping) return;
      if (this.mode === 'paint') this.togglePaint(false);
      else if (this.mode !== 'idle') this.cancelPlacing();
      else this.deselect();
    });
  }

  private beginPinch(downs: Phaser.Input.Pointer[]) {
    const [a, b] = downs;
    this.pinching = true;
    this.dragging = true; // 単指ドラッグやクリックと混ざらないようにする
    this.pinch = {
      dist: Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y),
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
    };
  }

  /** 2本指の間隔で拡大縮小し、中点の移動でスクロールする */
  private updatePinch(downs: Phaser.Input.Pointer[]) {
    const [a, b] = downs;
    const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const prev = this.pinch;
    if (!prev) {
      this.beginPinch(downs);
      return;
    }
    const cam = this.cameras.main;
    cam.scrollX -= (mx - prev.mx) / cam.zoom;
    cam.scrollY -= (my - prev.my) / cam.zoom;
    if (prev.dist > 4 && dist > 4) this.zoomAt(dist / prev.dist, mx, my);
    this.pinch = { dist, mx, my };
    this.pinching = true;
    this.dragging = true;
  }

  private handleClick(worldX: number, worldY: number) {
    const tile = screenToTile(worldX, worldY);

    if (this.mode === 'paint') return; // pointerdown/move で塗っているので何もしない
    if (this.mode === 'wall-place' || this.mode === 'wall-move') {
      this.commitWallPlacement(worldX, worldY);
      return;
    }
    if (this.mode !== 'idle') {
      this.commitPlacement(tile);
      return;
    }

    const inRoom = tile.gx >= 0 && tile.gy >= 0 && tile.gx < this.size && tile.gy < this.size;
    const hit = this.furniture.pickAt(worldX, worldY);
    if (hit) {
      // ラグの上は歩ける。選択もしておくと、そのまま移動やしまうができる
      if (getDef(hit.defId).walkable) {
        this.select(hit.uid);
        if (inRoom) this.walkTo(tile);
        return;
      }
      this.onFurnitureClick(hit);
      return;
    }

    // 床に何も無ければ壁を見る（壁は床より奥なので、床の家具に負けてよい）
    const wallHit = this.walls.pickAt(worldX, worldY);
    if (wallHit) {
      this.selectWall(wallHit.uid);
      return;
    }

    this.deselect();
    if (inRoom) this.walkTo(tile);
  }

  // ---------------- 歩く・座る ----------------

  private blockedFn = (gx: number, gy: number) => this.furniture.isBlocked(gx, gy);

  private walkTo(tile: Tile, onArrive?: () => void) {
    if (this.avatar.sittingOn) this.avatar.standUp();
    const path = findPath(this.avatar.tile, tile, this.size, this.size, this.blockedFn);
    if (!path) {
      this.ui.toast('そこには行けないみたい…');
      return;
    }
    this.avatar.walk(path, () => {
      this.persist();
      onArrive?.();
    });
  }

  private onFurnitureClick(item: PlacedFurniture) {
    const def = getDef(item.defId);
    this.select(item.uid);

    // ロケットなど、押すと別の部屋へ行けるもの
    if (def.travel !== undefined && !this.visiting) {
      this.travelTo(this.travelTargetOf(def.travel));
      return;
    }

    if (def.seatHeight === undefined) return;

    if (this.avatar.sittingOn === item.uid) {
      this.avatar.standUp();
      return;
    }
    if (!this.goSit(item)) this.ui.toast('近づけないみたい…');
  }

  /** 家具のそばまで歩いて座る。向かえたら true */
  private goSit(item: PlacedFurniture): boolean {
    const def = getDef(item.defId);
    if (def.seatHeight === undefined) return false;
    const found = findPathAdjacent(
      this.avatar.tile,
      this.furniture.neighborTiles(item),
      this.size,
      this.size,
      this.blockedFn,
    );
    if (!found) return false;
    if (this.avatar.sittingOn) this.avatar.standUp();
    this.avatar.walk(found.path, () => {
      const still = this.furniture.get(item.uid);
      if (!still) return;
      const spot = this.furniture.seatSpot(still);
      const facing = this.furniture.seatFacing(still);
      this.avatar.sit(still.uid, spot, (def.seatHeight ?? 16) + 6, facing.back, facing.flip, spot.depth);
      this.save.daily.sat += 1;
      this.syncMissions();
      this.persist();
    });
    return true;
  }

  // ---------------- 放置中の自動行動 ----------------

  /** 近くの自由なマスへ歩き出す */
  private wanderOnce(): boolean {
    const from = this.avatar.tile;
    for (let i = 0; i < 14; i++) {
      const gx = Phaser.Math.Clamp(from.gx + Phaser.Math.Between(-4, 4), 0, this.size - 1);
      const gy = Phaser.Math.Clamp(from.gy + Phaser.Math.Between(-4, 4), 0, this.size - 1);
      if (gx === from.gx && gy === from.gy) continue;
      if (this.furniture.isBlocked(gx, gy)) continue;
      const path = findPath(from, { gx, gy }, this.size, this.size, this.blockedFn);
      if (path && path.length > 0) {
        if (this.avatar.sittingOn) this.avatar.standUp();
        this.avatar.walk(path);
        return true;
      }
    }
    return false;
  }

  /** 座れる家具をひとつ選んで向かう */
  private sitSomewhere(): boolean {
    const seats = this.furniture.all.filter(
      (i) => getDef(i.defId).seatHeight !== undefined && i.uid !== this.avatar.sittingOn,
    );
    if (seats.length === 0) return false;
    const pick = seats[Phaser.Math.Between(0, seats.length - 1)];
    return this.goSit(pick);
  }

  // ---------------- 選択 ----------------

  private select(uid: string) {
    if (this.visiting) return; // 訪問中は人の部屋をいじれない
    this.deselectWall();
    this.selectedUid = uid;
    this.furniture.setHighlight(uid);
    const item = this.furniture.get(uid);
    this.ui.showSelBar(item ? getDef(item.defId).name : null);
    this.drawSelection(item ?? null);
  }

  private deselect() {
    this.selectedUid = null;
    this.furniture.setHighlight(null);
    this.deselectWall();
    this.ui.showSelBar(null);
    this.ui.closeRecolor();
    this.selG.clear();
  }

  // ---------------- 壁のもの ----------------

  private selectWall(uid: string) {
    if (this.visiting) return;
    // 床の選択と混ざらないように、先に片づける
    this.selectedUid = null;
    this.furniture.setHighlight(null);
    this.selectedWallUid = uid;
    this.walls.setHighlight(uid);
    const item = this.walls.get(uid);
    this.ui.showSelBar(item ? getDef(item.defId).name : null, { wall: true });
    this.drawWallSelection(item ?? null);
  }

  private deselectWall() {
    if (this.selectedWallUid === null) return;
    this.selectedWallUid = null;
    this.walls.setHighlight(null);
    this.selG.clear();
  }

  /** 選択中の壁のものを枠で示す */
  private drawWallSelection(item: PlacedWall | null) {
    const g = this.selG;
    g.clear();
    if (!item) return;
    const pts = this.walls.slotOutline(getDef(item.defId), item);
    g.fillStyle(0xffd166, 0.18);
    g.fillPoints(pts, true);
    g.lineStyle(2, 0xffc93c, 0.95);
    g.strokePoints(pts, true);
  }

  private enterWallPlaceMode(defId: string) {
    if ((this.save.inventory[defId] ?? 0) <= 0) return;
    this.deselect();
    this.mode = 'wall-place';
    this.placeDefId = defId;
    this.moveUid = null;
    this.ui.setPicked(defId);
    this.ui.showPlaceBar(getDef(defId).name, { wall: true });
    this.ui.closePanels();
    this.hoverG.clear();
    this.setHint();
    this.buildWallGhost(defId, 'right');
  }

  private enterWallMoveMode(uid: string) {
    const item = this.walls.get(uid);
    if (!item) return;
    this.deselect();
    this.mode = 'wall-move';
    this.moveUid = uid;
    this.placeDefId = item.defId;
    this.walls.setVisible(uid, false);
    this.ui.showPlaceBar(`${getDef(item.defId).name}を移動`, { wall: true });
    this.hoverG.clear();
    this.setHint();
    this.buildWallGhost(item.defId, item.side);
  }

  private wallGhostSide: 'right' | 'left' = 'right';

  private buildWallGhost(defId: string, side: 'right' | 'left') {
    const def = getDef(defId);
    const tex = getWallTexture(this, def, side);
    this.wallGhostSide = side;
    this.ghost?.destroy();
    this.ghost = this.add
      .image(0, 0, tex.key)
      .setOrigin(tex.originX, tex.originY)
      .setAlpha(0.7)
      .setDepth(9_000_001);
  }

  private wallSlot: WallSlot | null = null;
  private wallOk = false;

  /** 壁のゴーストを、いま指しているスロットへ合わせる */
  private updateWallGhost(worldX: number, worldY: number) {
    if (!this.placeDefId) return;
    const def = getDef(this.placeDefId);
    const origin = gridToScreen(0, 0);
    const raw = screenToWallSlot(worldX - origin.x, worldY - origin.y, this.size);
    const g = this.ghostG;
    g.clear();
    g.setDepth(-1955);
    if (!raw) {
      this.wallSlot = null;
      this.wallOk = false;
      this.ghost?.setVisible(false);
      return;
    }
    const slot = this.walls.fit(def, raw);
    this.wallSlot = slot;
    this.wallOk = this.walls.canPlace(def, slot, this.moveUid ?? undefined);

    if (slot.side !== this.wallGhostSide) this.buildWallGhost(def.id, slot.side);
    const anchor = this.walls.slotAnchor(slot.side, slot.col, slot.level);
    this.ghost
      ?.setVisible(true)
      .setPosition(anchor.x, anchor.y - def.height / 2)
      .setTint(this.wallOk ? 0xffffff : 0xff8888)
      .setDepth(9_000_001);

    const pts = this.walls.slotOutline(def, slot);
    const color = this.wallOk ? 0x6fe08a : 0xff6b6b;
    g.fillStyle(color, 0.28);
    g.fillPoints(pts, true);
    g.lineStyle(2, color, 0.9);
    g.strokePoints(pts, true);
  }

  private commitWallPlacement(worldX: number, worldY: number) {
    if (!this.placeDefId) return;
    this.updateWallGhost(worldX, worldY);
    const slot = this.wallSlot;
    if (!slot || !this.wallOk) {
      this.ui.toast('ここには掛けられないよ');
      return;
    }
    if (this.mode === 'wall-move' && this.moveUid) {
      const uid = this.moveUid;
      this.walls.update(uid, slot);
      this.walls.setVisible(uid, true);
      this.noteEdit();
      this.cancelPlacing();
      this.selectWall(uid);
      this.persist();
      return;
    }
    const defId = this.placeDefId;
    this.walls.add({ uid: newUid(), defId, side: slot.side, col: slot.col, level: slot.level });
    this.save.inventory[defId] = Math.max(0, (this.save.inventory[defId] ?? 0) - 1);
    this.save.daily.placed += 1;
    this.noteEdit();
    this.ui.setInventory(this.save.inventory);
    this.syncMissions();
    this.persist();
    if ((this.save.inventory[defId] ?? 0) <= 0) this.cancelPlacing();
  }

  private storeWallItem(uid: string) {
    const removed = this.walls.remove(uid);
    if (!removed) return;
    this.save.inventory[removed.defId] = (this.save.inventory[removed.defId] ?? 0) + 1;
    this.save.daily.stored += 1;
    this.noteEdit();
    this.ui.setInventory(this.save.inventory);
    this.syncMissions();
    this.ui.toast(`${getDef(removed.defId).name}をしまったよ`);
    this.deselect();
    this.persist();
  }

  /** 選択中の家具の占有範囲を床に示す */
  private drawSelection(item: PlacedFurniture | null) {
    const g = this.selG;
    g.clear();
    if (!item) return;
    const f = this.furniture.footprint(item);
    const pts = [
      gridToScreen(f.gx, f.gy),
      gridToScreen(f.gx + f.w, f.gy),
      gridToScreen(f.gx + f.w, f.gy + f.d),
      gridToScreen(f.gx, f.gy + f.d),
    ];
    g.fillStyle(0xffd166, 0.22);
    g.fillPoints(pts, true);
    g.lineStyle(2, 0xffc93c, 0.95);
    g.strokePoints(pts, true);
  }

  private selAction(act: 'rotate' | 'move' | 'recolor' | 'store' | 'deselect') {
    // 壁のものが選ばれているときは、そちらを操作する（回転は無い）
    const wallUid = this.selectedWallUid;
    if (wallUid) {
      if (act === 'move') this.enterWallMoveMode(wallUid);
      else if (act === 'store') this.storeWallItem(wallUid);
      else if (act === 'recolor') this.openRecolor();
      else if (act === 'deselect') this.deselect();
      return;
    }
    const uid = this.selectedUid;
    if (!uid) return;
    switch (act) {
      case 'rotate':
        this.rotateSelected();
        break;
      case 'move':
        this.enterMoveMode(uid);
        break;
      case 'recolor':
        this.openRecolor();
        break;
      case 'store':
        this.storeItem(uid);
        break;
      case 'deselect':
        this.deselect();
        break;
    }
  }

  private rotateSelected() {
    const uid = this.selectedUid;
    if (!uid) return;
    const item = this.furniture.get(uid);
    if (!item) return;
    const def = getDef(item.defId);
    const next = ((item.rot + 1) % 4) as Rotation;
    if (!this.furniture.canPlace(def, next, item.gx, item.gy, uid)) {
      this.ui.toast('まわすスペースがないよ');
      return;
    }
    if (this.avatar.sittingOn === uid) this.avatar.standUp();
    this.furniture.update(uid, item.gx, item.gy, next);
    this.noteEdit();
    this.select(uid);
    this.avatar.refreshDepth();
    this.persist();
  }

  private storeItem(uid: string) {
    if (this.avatar.sittingOn === uid) this.avatar.standUp();
    const removed = this.furniture.remove(uid);
    if (!removed) return;
    this.avatar.refreshDepth();
    this.save.inventory[removed.defId] = (this.save.inventory[removed.defId] ?? 0) + 1;
    this.save.daily.stored += 1;
    this.noteEdit();
    this.ui.setInventory(this.save.inventory);
    this.syncMissions();
    this.ui.toast(`${getDef(removed.defId).name}をしまったよ`);
    this.deselect();
    this.persist();
  }

  // ---------------- とびだす（部屋の移動） ----------------

  /**
   * 行き先を決める。すでにその部屋にいるなら地上へ帰る、という約束にしてある。
   * ロケットの定義を1つにしたまま行きと帰りの両方を扱える。
   */
  private travelTargetOf(target: string): string {
    return target === this.save.currentRoom ? HOME_ROOM : target;
  }

  private travelling = false;

  /** 発進 → 画面が白くなる → 別の部屋 → 戻る。移動は即時・無料・何度でも */
  private travelTo(roomId: string) {
    if (this.visiting || this.travelling) return;
    if (roomId === this.save.currentRoom) return;
    this.travelling = true;
    this.avatar.stop();
    this.avatar.playMotion('surprised');
    this.ui.closePanels();
    this.deselect();
    if (this.mode === 'paint') this.togglePaint(false);
    else if (this.mode !== 'idle') this.cancelPlacing();
    this.ui.toast(roomId === MOON_ROOM ? 'つきへ しゅっぱつ！ 🚀' : 'ちきゅうへ もどるよ 🌍');

    const cam = this.cameras.main;
    cam.fadeOut(420, 255, 255, 255);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.enterRoom(roomId);
      cam.fadeIn(560, 255, 255, 255);
      this.travelling = false;
    });
  }

  /** 部屋を入れ替える。描画・占有マス・カメラ・UI をまとめて作り直す */
  private enterRoom(roomId: string) {
    this.persist(); // いまの部屋の内容を先に保存する
    if (roomId === MOON_ROOM && !this.save.rooms[MOON_ROOM]) {
      this.save.rooms[MOON_ROOM] = makeMoonRoom();
    }
    if (!this.save.rooms[roomId]) return;
    this.save.currentRoom = roomId;
    const room = this.cur;

    this.furniture.setSize(room.size);
    this.furniture.setItems(room.items);
    this.walls.setSize(room.size);
    this.walls.setItems(room.wallItems);
    this.room.redraw(room.floor, room.wall, room.size, room.floorPatch);

    this.avatar.stop();
    this.avatar.placeAt(room.spawn.gx, room.spawn.gy);
    this.avatar.setFloaty(roomId === MOON_ROOM);
    this.ensureAvatarStandable();
    this.avatar.refreshDepth();

    this.userZoomed = false;
    this.applyFitZoom();
    const center = gridToScreen(this.size / 2, this.size / 2);
    this.cameras.main.centerOn(center.x, center.y - WALL_H / 3);

    this.ui.setStyles(room.floor, room.wall);
    this.ui.setRoomText(room.name, room.note);
    this.ui.setAtHome(roomId === HOME_ROOM);
    this.brush = room.floor === 1 ? 0 : 1;
    this.ui.setBrush(this.brush);
    this.syncRoomSize();
    this.syncMissions();
    this.setHint();
    this.persist();
  }

  // ---------------- 床をぬる ----------------

  /** 床を1マスずつ塗るモードの出入り */
  private togglePaint(next?: boolean) {
    if (this.visiting) return;
    const on = next ?? this.mode !== 'paint';
    if (on) {
      this.deselect();
      if (this.mode !== 'idle' && this.mode !== 'paint') this.cancelPlacing();
      this.mode = 'paint';
    } else if (this.mode === 'paint') {
      this.mode = 'idle';
    }
    this.hoverG.clear();
    this.ui.setPainting(this.mode === 'paint', FLOOR_STYLES[this.brush]?.name ?? 'ゆか');
    this.setHint();
  }

  /** そのマスを「ぬる柄」にする。部屋の基本の柄を選んでいれば、もとに戻す */
  private paintTile(tile: Tile) {
    if (tile.gx < 0 || tile.gy < 0 || tile.gx >= this.size || tile.gy >= this.size) return;
    const key = tileKey(tile.gx, tile.gy);
    const before = this.cur.floorPatch[key];
    if (this.brush === this.cur.floor) {
      if (before === undefined) return; // すでに基本の柄
      delete this.cur.floorPatch[key];
    } else {
      if (before === this.brush) return; // もう同じ柄
      this.cur.floorPatch[key] = this.brush;
    }
    this.room.redraw(this.cur.floor, this.cur.wall, this.size, this.cur.floorPatch);
    this.save.daily.restyled += 1;
    this.noteEdit();
    this.persist();
  }

  private clearFloorPatch() {
    if (Object.keys(this.cur.floorPatch).length === 0) {
      this.ui.toast('張り替えているマスはないよ');
      return;
    }
    this.cur.floorPatch = {};
    this.room.redraw(this.cur.floor, this.cur.wall, this.size, this.cur.floorPatch);
    this.noteEdit();
    this.persist();
    this.ui.toast('ゆかをぜんぶ もどしたよ');
  }

  // ---------------- リカラー ----------------

  /** 選んでいる家具（床でも壁でも）の色を変えるパネルを開く */
  private openRecolor() {
    if (this.visiting) return;
    const wallUid = this.selectedWallUid;
    if (wallUid) {
      const item = this.walls.get(wallUid);
      if (item) this.ui.openRecolor(getDef(item.defId).name, item.recolor);
      return;
    }
    const uid = this.selectedUid;
    if (!uid) return;
    const item = this.furniture.get(uid);
    if (item) this.ui.openRecolor(getDef(item.defId).name, item.recolor);
  }

  private applyRecolor(recolor: Recolor | undefined) {
    if (this.visiting) return;
    const wallUid = this.selectedWallUid;
    if (wallUid) {
      this.walls.setRecolor(wallUid, recolor);
      this.drawWallSelection(this.walls.get(wallUid) ?? null);
    } else if (this.selectedUid) {
      this.furniture.setRecolor(this.selectedUid, recolor);
      this.avatar.refreshDepth();
    } else {
      return;
    }
    this.save.daily.restyled += 1;
    this.noteEdit();
    this.syncMissions();
    this.persist();
  }

  // ---------------- 配置・移動 ----------------

  private enterPlaceMode(defId: string) {
    if ((this.save.inventory[defId] ?? 0) <= 0) return;
    this.deselect();
    this.mode = 'place';
    this.placeDefId = defId;
    this.placeRot = 0;
    this.moveUid = null;
    this.ui.setPicked(defId);
    this.ui.showPlaceBar(getDef(defId).name);
    this.ui.closePanels();
    this.hoverG.clear();
    this.setHint();
    this.buildGhost(defId);
  }

  private enterMoveMode(uid: string) {
    const item = this.furniture.get(uid);
    if (!item) return;
    if (this.avatar.sittingOn === uid) this.avatar.standUp();
    this.deselect();
    this.mode = 'move';
    this.moveUid = uid;
    this.placeDefId = item.defId;
    this.placeRot = item.rot;
    this.furniture.setVisible(uid, false);
    this.ui.showPlaceBar(`${getDef(item.defId).name}を移動`);
    this.hoverG.clear();
    this.setHint();
    this.buildGhost(item.defId);
  }

  private cancelPlacing() {
    if (this.mode === 'move' && this.moveUid) this.furniture.setVisible(this.moveUid, true);
    if (this.mode === 'wall-move' && this.moveUid) this.walls.setVisible(this.moveUid, true);
    this.mode = 'idle';
    this.placeDefId = null;
    this.moveUid = null;
    this.ghost?.destroy();
    this.ghost = null;
    this.ghostG.clear();
    this.ui.showPlaceBar(null);
    this.ui.setPicked(null);
    this.setHint();
  }

  private rotatePlacing() {
    if (!this.placeDefId) return;
    this.placeRot = ((this.placeRot + 1) % 4) as Rotation;
    this.buildGhost(this.placeDefId);
    this.updateGhost(screenToTile(this.input.activePointer.worldX, this.input.activePointer.worldY));
  }

  private buildGhost(defId: string) {
    const def = getDef(defId);
    const tex = getFurnitureTexture(this, def, this.placeRot);
    this.ghost?.destroy();
    this.ghost = this.add
      .image(0, 0, tex.key)
      .setOrigin(tex.originX, tex.originY)
      .setAlpha(0.7)
      .setDepth(9_000_001);
  }

  private ghostTile: Tile = { gx: 0, gy: 0 };
  private ghostOk = false;

  private updateGhost(tile: Tile) {
    if (!this.placeDefId || !this.ghost) return;
    const def = getDef(this.placeDefId);
    const [w, d] = rotatedSize(def.size, this.placeRot);
    // ポインタの位置を占有範囲の中央にする
    const gx = Phaser.Math.Clamp(tile.gx - Math.floor((w - 1) / 2), 0, this.size - w);
    const gy = Phaser.Math.Clamp(tile.gy - Math.floor((d - 1) / 2), 0, this.size - d);
    this.ghostTile = { gx, gy };
    this.ghostOk = this.furniture.canPlace(def, this.placeRot, gx, gy, this.moveUid ?? undefined);

    const p = gridToScreen(gx, gy);
    this.ghost.setPosition(p.x, p.y);
    this.ghost.setTint(this.ghostOk ? 0xffffff : 0xff8888);
    // 置いたときと同じ重なり順になるよう、家具の並びのすき間に入れる
    this.ghost.setDepth(this.furniture.depthAt({ gx0: gx, gx1: gx + w, gy0: gy, gy1: gy + d }));

    // 占有範囲の表示
    const g = this.ghostG;
    g.clear();
    g.setDepth(-1700);
    const n = gridToScreen(gx, gy);
    const e = gridToScreen(gx + w, gy);
    const s = gridToScreen(gx + w, gy + d);
    const wp = gridToScreen(gx, gy + d);
    const color = this.ghostOk ? 0x6fe08a : 0xff6b6b;
    g.fillStyle(color, 0.3);
    g.fillPoints([n, e, s, wp], true);
    g.lineStyle(2, color, 0.9);
    g.strokePoints([n, e, s, wp], true);
  }

  private commitPlacement(_tile: Tile) {
    if (!this.placeDefId) return;
    if (!this.ghostOk) {
      this.ui.toast('ここには置けないよ');
      return;
    }
    const { gx, gy } = this.ghostTile;
    if (this.mode === 'move' && this.moveUid) {
      const uid = this.moveUid;
      this.furniture.update(uid, gx, gy, this.placeRot);
      this.noteEdit();
      this.furniture.setVisible(uid, true);
      this.avatar.refreshDepth();
      this.cancelPlacing();
      this.select(uid);
      this.persist();
      return;
    }

    const defId = this.placeDefId;
    const item: PlacedFurniture = { uid: newUid(), defId, gx, gy, rot: this.placeRot };
    this.furniture.add(item);
    this.save.inventory[defId] = Math.max(0, (this.save.inventory[defId] ?? 0) - 1);
    this.save.daily.placed += 1;
    this.noteEdit();
    this.ui.setInventory(this.save.inventory);
    this.syncMissions();
    this.persist();

    // アバターが家具の中に閉じ込められないよう、押し出す
    this.ensureAvatarStandable();
    this.avatar.refreshDepth();

    if ((this.save.inventory[defId] ?? 0) <= 0) {
      this.cancelPlacing();
    } else {
      this.updateGhost(this.ghostTile);
    }
  }

  /** 置いた家具でアバターが埋まったら、近くの歩けるマスへ移動させる */
  private ensureAvatarStandable() {
    if (this.avatar.sittingOn) return;
    const { gx, gy } = this.avatar.tile;
    if (!this.furniture.isBlocked(gx, gy)) return;
    for (let r = 1; r < this.size; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= this.size || ny >= this.size) continue;
          if (this.furniture.isBlocked(nx, ny)) continue;
          this.avatar.stop();
          this.avatar.placeAt(nx, ny);
          return;
        }
      }
    }
  }

  // ---------------- コインとミッション ----------------

  private missionCtx() {
    return { daily: this.save.daily, items: this.furniture.all };
  }

  private syncMissions() {
    this.ui.setMissions(missionViews(this.save, this.missionCtx()));
  }

  /** 買った・売った・受け取った あとの表示更新 */
  private afterEconomyChange() {
    this.ui.setCoins(this.save.coins);
    this.ui.setRoomSize(this.size, nextRoomStep(this.size), this.save.coins);
    this.ui.setInventory(this.save.inventory);
    this.syncMissions();
    this.persist();
  }

  // ---------------- 表示・保存 ----------------

  private drawHover(tile: Tile) {
    const g = this.hoverG;
    g.clear();
    if (tile.gx < 0 || tile.gy < 0 || tile.gx >= this.size || tile.gy >= this.size) return;
    const p = gridToScreen(tile.gx, tile.gy);
    const pts = [
      { x: p.x, y: p.y },
      { x: p.x + HW, y: p.y + HH },
      { x: p.x, y: p.y + TILE_H },
      { x: p.x - HW, y: p.y + HH },
    ];
    g.fillStyle(0xffffff, 0.18);
    g.fillPoints(pts, true);
    g.lineStyle(1.5, 0xffffff, 0.6);
    g.strokePoints(pts, true);
  }

  private applyLook(look: AvatarLook) {
    this.save.avatar.look = look;
    this.avatar.setLook(look);
    this.persist();
  }

  private setHint() {
    if (this.mode === 'place') this.ui.setHint('置きたい場所をクリック（Rで回転 / Escでやめる）');
    else if (this.mode === 'move') this.ui.setHint('移動先をクリック（Rで回転 / Escでやめる）');
    else if (this.mode === 'wall-place' || this.mode === 'wall-move')
      this.ui.setHint('かべをクリックで かける（Escでやめる）');
    else if (this.mode === 'paint') this.ui.setHint('床をなぞると1マスずつ張り替わるよ（Escでやめる）');
    else if (this.visiting) this.ui.setHint('ここは ひとの おへや。歩いたり すわったりできるよ');
    else this.ui.setHint('床をクリックして歩こう。家具をクリックすると操作できるよ');
  }

  private persist() {
    if (this.visiting) return; // 人の部屋を自分のセーブに書き込まない
    this.cur.items = this.furniture.all.map((i) => ({ ...i }));
    this.cur.wallItems = this.walls.all.map((i) => ({ ...i }));
    this.cur.spawn = { gx: this.avatar.tile.gx, gy: this.avatar.tile.gy };
    saveDebounced(this.save);
  }
}
