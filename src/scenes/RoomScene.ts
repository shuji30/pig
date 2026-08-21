import Phaser from 'phaser';
import { ROOM_H, ROOM_W, TILE_H, TILE_W, WALL_H } from '../config';
import { depthFor, gridToScreen, rotatedSize, screenToTile } from '../core/iso';
import { findPath, findPathAdjacent } from '../core/pathfinding';
import { getDef } from '../data/furniture';
import type { MotionKind } from '../data/motions';
import { AutoPlay } from '../entities/AutoPlay';
import { Avatar } from '../entities/Avatar';
import { FurnitureLayer } from '../entities/FurnitureLayer';
import { getFurnitureTexture } from '../render/furnitureTexture';
import { RoomView } from '../render/room';
import { buy, claimDailyBonus, claimMissions, missionViews, sell } from '../state/economy';
import { clearSave, load, newUid, saveDebounced } from '../state/save';
import type { AvatarLook, PlacedFurniture, Rotation, SaveData } from '../types';
import { Ui } from '../ui/ui';

type Mode = 'idle' | 'place' | 'move';
type Tile = { gx: number; gy: number };

const HW = TILE_W / 2;
const HH = TILE_H / 2;
const DRAG_THRESHOLD = 10;

export class RoomScene extends Phaser.Scene {
  private save!: SaveData;
  private room!: RoomView;
  private furniture!: FurnitureLayer;
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

  private userZoomed = false;
  /** 2本指の間隔と中点。ピンチ中だけ値が入る */
  private pinch: { dist: number; mx: number; my: number } | null = null;
  private pinching = false;
  private pointerDownAt: { x: number; y: number } | null = null;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };

  constructor() {
    super('room');
  }

  create() {
    this.save = load();

    this.cameras.main.setBackgroundColor('#2b2430');
    this.room = new RoomView(this);
    this.room.redraw(this.save.floor, this.save.wall);

    this.furniture = new FurnitureLayer(this);
    this.furniture.setItems(this.save.items);

    this.hoverG = this.add.graphics().setDepth(-1700);
    this.selG = this.add.graphics().setDepth(-1690);
    this.ghostG = this.add.graphics().setDepth(9_000_000);

    this.avatar = new Avatar(this, this.save.avatar.look, this.save.avatar.gx, this.save.avatar.gy);
    this.avatar.setDepthResolver((box) => this.furniture.depthAt(box));

    this.ui = new Ui(this, {
      onPickFurniture: (defId) => this.enterPlaceMode(defId),
      onFloorChange: (i) => {
        this.save.floor = i;
        this.room.redraw(this.save.floor, this.save.wall);
        this.save.daily.restyled += 1;
        this.syncMissions();
        this.persist();
      },
      onWallChange: (i) => {
        this.save.wall = i;
        this.room.redraw(this.save.floor, this.save.wall);
        this.save.daily.restyled += 1;
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
      onEmote: (kind) => {
        this.avatar.playMotion(kind);
        this.save.daily.emoted += 1;
        this.syncMissions();
        this.persist();
      },
      onBuy: (defId) => {
        const def = getDef(defId);
        if (!buy(this.save, def)) {
          this.ui.toast('コインが足りないよ');
          return;
        }
        this.ui.toast(`${def.name}を かいました`);
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
      onPanelOpen: (name) => {
        this.deselect();
        if (this.mode !== 'idle') this.cancelPlacing();
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
    this.ui.setStyles(this.save.floor, this.save.wall);
    this.ui.setInventory(this.save.inventory);
    this.ui.setCoins(this.save.coins);
    this.syncMissions();
    this.setHint();

    // その日はじめての訪問ならログインボーナス
    const bonus = claimDailyBonus(this.save);
    if (bonus.amount > 0) {
      this.ui.setCoins(this.save.coins);
      this.time.delayedCall(700, () =>
        this.ui.toast(`ログインボーナス 🪙+${bonus.amount}（${bonus.streak}日れんぞく）`),
      );
      this.persist();
    }

    this.ensureAvatarStandable();
    this.setupCamera();
    this.setupInput();
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
      const center = gridToScreen(ROOM_W / 2, ROOM_H / 2);
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
    return (ROOM_W + ROOM_H) * HW;
  }

  private roomFitsWidth(): boolean {
    return this.roomWidthPx() * this.cameras.main.zoom <= this.scale.width - 16;
  }

  private applyFitZoom() {
    const roomH = (ROOM_W + ROOM_H) * HH + WALL_H;
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
      if (this.mode !== 'idle') this.updateGhost(screenToTile(p.worldX, p.worldY));
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const downs = this.downPointers();
      if (downs.length >= 2) {
        this.updatePinch(downs);
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
      if (this.mode !== 'idle') this.rotatePlacing();
      else if (this.selectedUid) this.rotateSelected();
    });
    kb?.on('keydown-ESC', () => {
      if (this.ui.isTyping) return;
      if (this.mode !== 'idle') this.cancelPlacing();
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

    if (this.mode !== 'idle') {
      this.commitPlacement(tile);
      return;
    }

    const inRoom = tile.gx >= 0 && tile.gy >= 0 && tile.gx < ROOM_W && tile.gy < ROOM_H;
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

    this.deselect();
    if (inRoom) this.walkTo(tile);
  }

  // ---------------- 歩く・座る ----------------

  private blockedFn = (gx: number, gy: number) => this.furniture.isBlocked(gx, gy);

  private walkTo(tile: Tile, onArrive?: () => void) {
    if (this.avatar.sittingOn) this.avatar.standUp();
    const path = findPath(this.avatar.tile, tile, ROOM_W, ROOM_H, this.blockedFn);
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
      ROOM_W,
      ROOM_H,
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
      const gx = Phaser.Math.Clamp(from.gx + Phaser.Math.Between(-4, 4), 0, ROOM_W - 1);
      const gy = Phaser.Math.Clamp(from.gy + Phaser.Math.Between(-4, 4), 0, ROOM_H - 1);
      if (gx === from.gx && gy === from.gy) continue;
      if (this.furniture.isBlocked(gx, gy)) continue;
      const path = findPath(from, { gx, gy }, ROOM_W, ROOM_H, this.blockedFn);
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
    this.selectedUid = uid;
    this.furniture.setHighlight(uid);
    const item = this.furniture.get(uid);
    this.ui.showSelBar(item ? getDef(item.defId).name : null);
    this.drawSelection(item ?? null);
  }

  private deselect() {
    this.selectedUid = null;
    this.furniture.setHighlight(null);
    this.ui.showSelBar(null);
    this.selG.clear();
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

  private selAction(act: 'rotate' | 'move' | 'store' | 'deselect') {
    const uid = this.selectedUid;
    if (!uid) return;
    switch (act) {
      case 'rotate':
        this.rotateSelected();
        break;
      case 'move':
        this.enterMoveMode(uid);
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
    this.ui.setInventory(this.save.inventory);
    this.syncMissions();
    this.ui.toast(`${getDef(removed.defId).name}をしまったよ`);
    this.deselect();
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
    const gx = Phaser.Math.Clamp(tile.gx - Math.floor((w - 1) / 2), 0, ROOM_W - w);
    const gy = Phaser.Math.Clamp(tile.gy - Math.floor((d - 1) / 2), 0, ROOM_H - d);
    this.ghostTile = { gx, gy };
    this.ghostOk = this.furniture.canPlace(def, this.placeRot, gx, gy, this.moveUid ?? undefined);

    const p = gridToScreen(gx, gy);
    this.ghost.setPosition(p.x, p.y);
    this.ghost.setTint(this.ghostOk ? 0xffffff : 0xff8888);
    this.ghost.setDepth(depthFor(gx, gy, w, d) + 5);

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
    for (let r = 1; r < Math.max(ROOM_W, ROOM_H); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= ROOM_W || ny >= ROOM_H) continue;
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
    this.ui.setInventory(this.save.inventory);
    this.syncMissions();
    this.persist();
  }

  // ---------------- 表示・保存 ----------------

  private drawHover(tile: Tile) {
    const g = this.hoverG;
    g.clear();
    if (tile.gx < 0 || tile.gy < 0 || tile.gx >= ROOM_W || tile.gy >= ROOM_H) return;
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
    else this.ui.setHint('床をクリックして歩こう。家具をクリックすると操作できるよ');
  }

  private persist() {
    this.save.items = this.furniture.all.map((i) => ({ ...i }));
    this.save.avatar.gx = this.avatar.tile.gx;
    this.save.avatar.gy = this.avatar.tile.gy;
    saveDebounced(this.save);
  }
}
