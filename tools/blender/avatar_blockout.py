"""
アバターをモデリングするための下地（ブロックアウト）と、ボーンを作る。

    Blender で開く: Scripting タブ → 開く → 実行
    コマンドから  : blender --background --python tools/blender/avatar_blockout.py

平らな絵（`src/render/avatarArt.ts`）と同じ寸法で、灰色の当たりを置くだけの
スクリプト。**この上からモデリングする**ことで、できたモデルがゲームの中で
今までと同じ大きさ・同じ目の高さになる。

## 約束ごと（ここを外すとゲーム側で合わない）

- 1 Blender 単位 = **1m**。足のうらが z = 0
- キャラクターは **-Y を向く**（Blender の正面図がそのまま前）。
  glTF に書き出すと -Y は +Z になり、ゲーム側の「体の正面は +z」と一致する
- ボーンの名前は下の `BONES` のとおり。ゲーム側はこの名前で姿勢を作る
- 書き出しは **glTF 2.0 (.glb)**、+Y Up のまま（既定）

## 寸法のもと

平らな絵は px で組んであり、**1m = 39.19px**（`src/render/models3d.js` の
`PX_PER_HEIGHT`）で換算している。例：いすの座面 20px = 0.51m。
"""

import math

import bpy
from mathutils import Vector

# ---------------------------------------------------------------- 寸法
# 1m あたりの px。models3d.js の PX_PER_HEIGHT と同じ値でなければならない
PX = 39.19


def m(px: float) -> float:
    """絵の px を m に直す"""
    return px / PX


# 立ち姿の各部（絵の y は下向きなので、符号を反転して高さにしてある）
GROUND = 0.0
SHOE_TOP = m(6.0)
HIP = m(14.0)
WAIST = m(13.0)  # 胴の下端
SHOULDER = m(27.0)
CHEST_TOP = m(29.0)  # 胴の上端
HAND = m(17.0)
EYE = m(39.6)
HEAD = m(42.0)  # 頭の中心
HEAD_R = m(13.4)
CROWN = HEAD + HEAD_R  # てっぺん 1.41m

TORSO_W = m(17.0)
TORSO_D = m(10.5)
LEG_R = m(3.3)
LEG_X = m(4.7)
ARM_R = m(2.5)
ARM_X = m(9.9)
HAND_R = m(3.1)
EYE_X = m(5.7)
SHOE_W = m(8.8)
SHOE_D = m(9.5)

# ---------------------------------------------------------------- ボーン
# (名前, 根もと, 先, 親)。位置は m、Blender の (x, y, z)
BONES = [
    ('root', (0, 0, 0), (0, 0, m(4)), None),
    ('hips', (0, 0, HIP), (0, 0, m(18)), 'root'),
    ('spine', (0, 0, m(18)), (0, 0, m(24)), 'hips'),
    ('chest', (0, 0, m(24)), (0, 0, CHEST_TOP), 'spine'),
    ('neck', (0, 0, CHEST_TOP), (0, 0, m(30.5)), 'chest'),
    ('head', (0, 0, m(30.5)), (0, 0, CROWN), 'neck'),
]
for side, sx in (('L', 1), ('R', -1)):
    BONES += [
        (f'shoulder.{side}', (0, 0, SHOULDER), (sx * ARM_X, 0, SHOULDER), 'chest'),
        (f'upperarm.{side}', (sx * ARM_X, 0, SHOULDER), (sx * ARM_X, 0, m(22)), f'shoulder.{side}'),
        (f'forearm.{side}', (sx * ARM_X, 0, m(22)), (sx * ARM_X, 0, HAND), f'upperarm.{side}'),
        (f'hand.{side}', (sx * ARM_X, 0, HAND), (sx * ARM_X, 0, m(13)), f'forearm.{side}'),
        (f'thigh.{side}', (sx * LEG_X, 0, HIP), (sx * LEG_X, 0, m(8)), 'hips'),
        (f'shin.{side}', (sx * LEG_X, 0, m(8)), (sx * LEG_X, 0, SHOE_TOP), f'thigh.{side}'),
        # つま先は前（-Y）へ
        (f'foot.{side}', (sx * LEG_X, 0, SHOE_TOP), (sx * LEG_X, -m(7), m(1)), f'shin.{side}'),
    ]


# ---------------------------------------------------------------- 道具
def clear_scene() -> None:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def collection(name: str) -> bpy.types.Collection:
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


def put(obj: bpy.types.Object, col: bpy.types.Collection) -> bpy.types.Object:
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)
    return obj


def ball(name, col, center, radius, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=center, segments=24, ring_count=16)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    return put(o, col)


def box(name, col, center, size):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    o = bpy.context.object
    o.name = name
    o.scale = size
    return put(o, col)


def capsule(name, col, center, radius, height):
    """ざっくりで良いので、円柱＋上下の球で代える"""
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=height, location=center, vertices=16)
    o = bpy.context.object
    o.name = name
    return put(o, col)


# ---------------------------------------------------------------- 本体
def build_blockout(col: bpy.types.Collection) -> None:
    """
    平らな絵と同じ寸法の当たり。この上からモデリングする。

    名前に `ref-` を付けてあるのは、ボーンと同じ名前だと Blender が
    勝手に `.001` を足してしまうため。
    """
    # 頭。平らな絵は半径 13.4 の真円なので、当たりも真球にしてある
    # （いまの立体は下ぶくれに見せるため少しつぶしているが、寸法のもとは絵のほう）
    ball('ref-head', col, (0, 0, HEAD), HEAD_R)
    # 目の位置の目印。VR のカメラはここに入る
    for sx in (1, -1):
        ball(f'ref-eye.{"L" if sx > 0 else "R"}', col, (sx * EYE_X, -HEAD_R * 0.86, EYE), m(2.6))

    # 胴
    box('ref-torso', col, (0, 0, (WAIST + CHEST_TOP) / 2), (TORSO_W, TORSO_D, CHEST_TOP - WAIST))

    for sx, side in ((1, 'L'), (-1, 'R')):
        # 腕（肩から手まで）と手
        capsule(f'ref-arm.{side}', col, (sx * ARM_X, 0, (HAND + SHOULDER) / 2), ARM_R, SHOULDER - HAND)
        ball(f'ref-hand.{side}', col, (sx * ARM_X, 0, HAND), HAND_R)
        # 脚とくつ
        capsule(f'ref-leg.{side}', col, (sx * LEG_X, 0, (SHOE_TOP + HIP) / 2), LEG_R, HIP - SHOE_TOP)
        box(f'ref-shoe.{side}', col, (sx * LEG_X, -m(1.6), SHOE_TOP / 2), (SHOE_W, SHOE_D, SHOE_TOP))

    # 床1マス（部屋の1マス = 1m）と、目の高さの線
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(0, 0, 0))
    put(bpy.context.object, col).name = 'ref-tile-1m'

    for o in col.objects:
        # 見えるが触らない。この上からモデリングするため
        o.display_type = 'WIRE'
        o.hide_render = True
        o.hide_select = True


def build_rig(col: bpy.types.Collection) -> bpy.types.Object:
    armature = bpy.data.armatures.new('pig-rig')
    rig = bpy.data.objects.new('pig-rig', armature)
    put(rig, col)

    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name, head, tail, parent in BONES:
        bone = armature.edit_bones.new(name)
        bone.head = Vector(head)
        bone.tail = Vector(tail)
        bone.use_connect = False
        if parent:
            bone.parent = armature.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def setup_scene() -> None:
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = 'METERS'


def main() -> None:
    clear_scene()
    setup_scene()
    build_blockout(collection('blockout'))
    build_rig(collection('rig'))
    print(f'できた: 身長 {CROWN:.3f}m / 目の高さ {EYE:.3f}m / ボーン {len(BONES)}本')


if __name__ == '__main__':
    main()
