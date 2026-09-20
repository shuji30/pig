"""
アバターの立体をひととおり組み立てて、`.glb` に書き出す。

    Blender で開く: Scripting タブ → 開く → 実行
    コマンドから  : blender --background --python tools/blender/avatar_model.py

`avatar_blockout.py` が置く当たりと同じ寸法で、丸みのある本体・顔・髪・ふく・くつを
作り、20本のボーンに結びつける。できた `.glb` はゲームの VR がそのまま読める。

## 作りの方針

家具（`src/render/models3d.js`）と同じで、**角を丸めた基本形を組んで、
まとめてなめらかにする**。この箱庭はその質感で通っているので、キャラクターだけ
作り込んでも浮く。

ボーンへの結びつけは**部位ごとに丸ごと1本へ**（リジッド）。平らな絵も
「腰から下」「胸から上」を別々に動かす紙人形なので、曲げないほうが絵と合う。
自動ウェイトは、離れた島がある形では解が出ないことがあるので使わない。

## 色

マテリアルを6つに分けてある。ゲーム側はこの名前を見て、きせかえの色に差し替える。
    skin / hair / eyes / shirt / pants / shoes
白目と口は変えないので、別のマテリアルにしてある。
"""

import math
import os

import bpy
from mathutils import Vector

# ---------------------------------------------------------------- 寸法
PX = 39.19


def m(px: float) -> float:
    return px / PX


HIP = m(14.0)
WAIST = m(13.0)
SHOULDER = m(27.0)
CHEST_TOP = m(29.0)
HAND = m(17.0)
EYE = m(39.6)
HEAD = m(42.0)
HEAD_R = m(13.4)
CROWN = HEAD + HEAD_R
SHOE_TOP = m(6.0)

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

# ---------------------------------------------------------------- 色
# きせかえの既定値（src/config.ts の先頭の色）。ゲーム側で差し替わる
COLORS = {
    'skin': (1.000, 0.878, 0.784, 1),
    'hair': (0.420, 0.275, 0.196, 1),
    'eyes': (0.357, 0.275, 0.188, 1),
    'shirt': (1.000, 0.620, 0.769, 1),
    'pants': (0.490, 0.624, 0.941, 1),
    'shoes': (0.231, 0.169, 0.157, 1),
    'eyewhite': (1.000, 1.000, 1.000, 1),
    'mouth': (0.698, 0.337, 0.373, 1),
}
ROUGHNESS = {'eyes': 0.25, 'eyewhite': 0.2, 'shoes': 0.5, 'hair': 0.8}

# 部位 → どのボーンに丸ごとついていくか
BONE_OF = {
    'head': 'head',
    'neck': 'neck',
    'torso': 'chest',
    'hip': 'hips',
    'arm.L': 'upperarm.L',
    'arm.R': 'upperarm.R',
    'hand.L': 'hand.L',
    'hand.R': 'hand.R',
    'leg.L': 'thigh.L',
    'leg.R': 'thigh.R',
    'shoe.L': 'foot.L',
    'shoe.R': 'foot.R',
}

BONES = [
    ('root', (0, 0, 0), (0, 0, m(4)), None),
    ('hips', (0, 0, HIP), (0, 0, m(18)), 'root'),
    ('spine', (0, 0, m(18)), (0, 0, m(24)), 'hips'),
    ('chest', (0, 0, m(24)), (0, 0, CHEST_TOP), 'spine'),
    ('neck', (0, 0, CHEST_TOP), (0, 0, m(30.5)), 'chest'),
    ('head', (0, 0, m(30.5)), (0, 0, CROWN), 'neck'),
]
for _side, _sx in (('L', 1), ('R', -1)):
    BONES += [
        (f'shoulder.{_side}', (0, 0, SHOULDER), (_sx * ARM_X, 0, SHOULDER), 'chest'),
        (f'upperarm.{_side}', (_sx * ARM_X, 0, SHOULDER), (_sx * ARM_X, 0, m(22)), f'shoulder.{_side}'),
        (f'forearm.{_side}', (_sx * ARM_X, 0, m(22)), (_sx * ARM_X, 0, HAND), f'upperarm.{_side}'),
        (f'hand.{_side}', (_sx * ARM_X, 0, HAND), (_sx * ARM_X, 0, m(13)), f'forearm.{_side}'),
        (f'thigh.{_side}', (_sx * LEG_X, 0, HIP), (_sx * LEG_X, 0, m(8)), 'hips'),
        (f'shin.{_side}', (_sx * LEG_X, 0, m(8)), (_sx * LEG_X, 0, SHOE_TOP), f'thigh.{_side}'),
        (f'foot.{_side}', (_sx * LEG_X, 0, SHOE_TOP), (_sx * LEG_X, -m(7), m(1)), f'shin.{_side}'),
    ]


# ---------------------------------------------------------------- 道具
def clear_scene() -> None:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.objects):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


_materials: dict[str, bpy.types.Material] = {}


def material(name: str) -> bpy.types.Material:
    mat = _materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = COLORS[name]
    bsdf.inputs['Roughness'].default_value = ROUGHNESS.get(name, 0.7)
    bsdf.inputs['Metallic'].default_value = 0.0
    _materials[name] = mat
    return mat


def finish(obj: bpy.types.Object, mat: str, part: str, levels: int = 1) -> bpy.types.Object:
    """なめらかにして、色と「どのボーンにつくか」を付ける"""
    obj.data.materials.append(material(mat))
    if levels:
        mod = obj.modifiers.new('subsurf', 'SUBSURF')
        mod.levels = mod.render_levels = levels
    bpy.ops.object.shade_smooth()
    obj['part'] = part
    return obj


def sphere(name, loc, radius, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=loc, segments=20, ring_count=12)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    return o


def rounded_box(name, loc, size, bevel=0.35):
    """角を丸めた箱。`size` は**全体の大きさ**（半分ではない）"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    mod = o.modifiers.new('bevel', 'BEVEL')
    mod.width = min(size) * bevel
    mod.segments = 4
    return o


def limb(name, top, bottom, radius):
    """腕・脚。両端を丸めた棒"""
    height = (Vector(top) - Vector(bottom)).length
    center = (Vector(top) + Vector(bottom)) / 2
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=height, location=center, vertices=14)
    o = bpy.context.object
    o.name = name
    mod = o.modifiers.new('bevel', 'BEVEL')
    mod.width = radius * 0.55
    mod.segments = 4
    return o


# ---------------------------------------------------------------- 体
def build_body() -> list[bpy.types.Object]:
    parts = []

    # 頭。すこし下ぶくれにして幼く見せる（平らな絵のほおのふくらみに当たる）
    head = sphere('head', (0, 0, HEAD), HEAD_R, scale=(1.0, 0.97, 0.98))
    bpy.ops.object.transform_apply(scale=True)
    parts.append(finish(head, 'skin', 'head'))

    # 首。ほとんど隠れるが、無いと頭が浮く
    neck = limb('neck', (0, 0, CHEST_TOP + m(2)), (0, 0, CHEST_TOP - m(2)), m(4.2))
    parts.append(finish(neck, 'skin', 'neck'))

    # 胴。肩を張らせて腰をすこし絞る
    torso = rounded_box('torso', (0, 0, (WAIST + CHEST_TOP) / 2 + m(1)),
                        (TORSO_W, TORSO_D, CHEST_TOP - WAIST + m(3)))
    parts.append(finish(torso, 'shirt', 'torso'))

    # 腰。胴とももをつなぐ
    hip = sphere('hip', (0, 0, HIP + m(0.5)), m(7.2), scale=(1.06, 0.7, 0.58))
    bpy.ops.object.transform_apply(scale=True)
    parts.append(finish(hip, 'pants', 'hip'))

    for side, sx in (('L', 1), ('R', -1)):
        # 肩。これが無いと腕が胴から離れて浮いて見える
        shoulder = sphere(f'shoulder.{side}', (sx * (ARM_X - m(1.2)), 0, SHOULDER - m(1.0)),
                          m(4.4), scale=(1.0, 0.86, 0.9))
        bpy.ops.object.transform_apply(scale=True)
        shoulder['part'] = f'arm.{side}'
        parts.append(finish(shoulder, 'shirt', f'arm.{side}'))

        arm = limb(f'arm.{side}', (sx * ARM_X, 0, SHOULDER), (sx * ARM_X, 0, HAND + m(1)), ARM_R)
        parts.append(finish(arm, 'shirt', f'arm.{side}'))

        hand = sphere(f'hand.{side}', (sx * ARM_X, 0, HAND), HAND_R, scale=(0.9, 1.0, 1.15))
        bpy.ops.object.transform_apply(scale=True)
        parts.append(finish(hand, 'skin', f'hand.{side}'))

        leg = limb(f'leg.{side}', (sx * LEG_X, 0, HIP + m(1)), (sx * LEG_X, 0, SHOE_TOP), LEG_R)
        parts.append(finish(leg, 'pants', f'leg.{side}'))

        # 脚の下端（SHOE_TOP）と重なるよう、すこし高めまで持ち上げる
        shoe_h = SHOE_TOP + m(2.0)
        shoe = rounded_box(f'shoe.{side}', (sx * LEG_X, -m(1.4), shoe_h / 2),
                           (SHOE_W, SHOE_D, shoe_h), bevel=0.24)
        parts.append(finish(shoe, 'shoes', f'shoe.{side}'))

    return parts


# ---------------------------------------------------------------- 顔
def build_face() -> list[bpy.types.Object]:
    """目・ひとみ・口。頭の球の面に沿わせて置く"""
    parts = []
    # 頭は球なので、その高さでの面までの距離は sqrt(R^2 - h^2)。
    # ここから内側へ押し込んで、顔から飛び出さないようにする
    front = math.sqrt(max(0.0, HEAD_R ** 2 - (HEAD - EYE) ** 2)) * 0.97

    for side, sx in (('L', 1), ('R', -1)):
        white = sphere(f'eyewhite.{side}', (sx * EYE_X, -front + m(3.4), EYE), 1,
                       scale=(m(2.7), m(2.6), m(3.0)))
        bpy.ops.object.transform_apply(scale=True)
        parts.append(finish(white, 'eyewhite', 'head', levels=0))

        iris = sphere(f'iris.{side}', (sx * EYE_X, -front + m(2.2), EYE - m(0.2)), 1,
                      scale=(m(1.5), m(1.7), m(1.7)))
        bpy.ops.object.transform_apply(scale=True)
        parts.append(finish(iris, 'eyes', 'head', levels=0))

    mouth_z = EYE - m(5.8)
    mouth_y = math.sqrt(max(0.0, HEAD_R ** 2 - (HEAD - mouth_z) ** 2)) * 0.97
    mouth = sphere('mouth', (0, -mouth_y + m(1.4), mouth_z), 1, scale=(m(2.2), m(1.6), m(1.0)))
    bpy.ops.object.transform_apply(scale=True)
    parts.append(finish(mouth, 'mouth', 'head', levels=0))

    return parts


# ---------------------------------------------------------------- 髪
def build_hair() -> list[bpy.types.Object]:
    """既定の髪型（ボブ）。ほかの9種は別メッシュとして足す想定"""
    parts = []
    r = HEAD_R + m(1.0)

    # かぶさっているところ。上半球を切って使う
    cap = sphere('hair-cap', (0, 0, HEAD), r, scale=(1.0, 1.0, 1.02))
    bpy.ops.object.transform_apply(scale=True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    # 目より下の頂点を落とす（顔を隠さない）
    for v in cap.data.vertices:
        v.select = (cap.matrix_world @ v.co).z < EYE + m(1.4)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.delete(type='VERT')
    bpy.ops.object.mode_set(mode='OBJECT')
    solid = cap.modifiers.new('solid', 'SOLIDIFY')
    solid.thickness = m(1.2)
    parts.append(finish(cap, 'hair', 'head'))

    # 後ろ。別の球を足すと横から見たとき「こぶ」に見えるので、
    # かぶさっているところを後ろへ伸ばすだけにする
    cap.scale = (1.0, 1.06, 1.0)
    bpy.ops.object.select_all(action='DESELECT')
    cap.select_set(True)
    bpy.context.view_layer.objects.active = cap
    bpy.ops.object.transform_apply(scale=True)

    # 前髪。ひたいに少し下ろす
    fringe = sphere('hair-fringe', (0, -m(2.6), HEAD + m(6.0)), 1,
                    scale=(r * 0.84, r * 0.6, m(5.4)))
    bpy.ops.object.transform_apply(scale=True)
    parts.append(finish(fringe, 'hair', 'head'))

    return parts


# ---------------------------------------------------------------- 骨
def build_rig() -> bpy.types.Object:
    armature = bpy.data.armatures.new('pig-rig')
    rig = bpy.data.objects.new('pig-rig', armature)
    bpy.context.scene.collection.objects.link(rig)
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


def bind(parts: list[bpy.types.Object], rig: bpy.types.Object) -> bpy.types.Object:
    """部位ごとに丸ごと1本のボーンへ結びつけ、1つのメッシュにまとめる"""
    for obj in parts:
        bpy.context.view_layer.objects.active = obj
        for mod in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
        group = obj.vertex_groups.new(name=BONE_OF[obj['part']])
        group.add(range(len(obj.data.vertices)), 1.0, 'REPLACE')

    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()

    body = bpy.context.object
    body.name = 'avatar'
    mod = body.modifiers.new('armature', 'ARMATURE')
    mod.object = rig
    body.parent = rig
    return body


def export_glb(path: str) -> None:
    """ゲームが読む形で書き出す。+Y Up は既定のまま（Blender の -Y が +Z になる）"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_apply=True,   # モディファイアを焼き込む
        export_skins=True,
        export_yup=True,
    )


def main() -> None:
    clear_scene()
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.length_unit = 'METERS'

    parts = build_body() + build_face() + build_hair()
    rig = build_rig()
    body = bind(parts, rig)

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'avatar.glb')
    export_glb(out)
    print(f'できた: 面 {len(body.data.polygons)} / マテリアル {len(body.data.materials)} / '
          f'ボーン {len(rig.data.bones)}')
    print(f'書き出し: {out}')


if __name__ == '__main__':
    main()
