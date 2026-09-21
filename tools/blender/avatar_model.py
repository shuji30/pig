"""
アバターの立体をひととおり組み立てて、`.glb` に書き出す。

    Blender で開く: Scripting タブ → 開く → 実行
    コマンドから  : blender --background --python tools/blender/avatar_model.py

## 体つき

平らな絵（2頭身の紙人形）をそのまま立体にすると、頭でっかちの ずんぐり になって
VR で見たときに こわい。ここでは**着せかえ人形（リカちゃん）の体つき**に寄せる。

    ぜんぶで 6.4 頭身 / 背 55.4px = 1.414m（タイル1枚ぶん）

背の高さと目の高さは VR のカメラが使うので、ここは動かさない。
中の配りかた（頭を小さく、脚を長く、肩と胴を細く）だけを人形に寄せている。

## 作りの方針

家具（`src/render/models3d.js`）と同じで、**角を丸めた基本形を組んで、
まとめてなめらかにする**。この箱庭はその質感で通っているので、キャラクターだけ
作り込んでも浮く。

ボーンへの結びつけは**部位ごとに丸ごと1本へ**（リジッド）。平らな絵も
「腰から下」「胸から上」を別々に動かす紙人形なので、曲げないほうが絵と合う。
自動ウェイトは、離れた島がある形では解が出ないことがあるので使わない。

## 色

マテリアルを名前で分けてある。ゲーム側はこの名前を見て、きせかえの色に差し替える。
    skin / hair / eyes / shirt / pants / shoes
白目・口・くつした などは変えないので、別のマテリアルにしてある。

## 切り替えるもの

表情・髪型・ふくは**メッシュごと差し替える**。シェイプキーを使うより作りやすく、
ゲーム側は `variant` の名前を見て、そのとき要るものだけを出せばよい。
    face-{normal,happy,laugh,sad,sleep,love,surprised,blink}
    hair-0..9 / outfit-{shirt,dress,hoodie,sailor}
"""

import math
import os

import bpy
import bmesh  # noqa: E402  bpy を読んだあとでないと見つからない
from mathutils import Vector

# ---------------------------------------------------------------- 寸法
PX = 39.19


def m(px: float) -> float:
    return px / PX


CROWN = m(55.4)         # 頭のてっぺん = 背の高さ。ここは平らな絵と同じ
HEAD_R = m(5.55)        # 頭のよこ半径。**5頭身**になるよう決めてある
HEAD = m(49.0)          # 頭の中心（目の高さのあたり）
# 頭のたて半径は上と下で変える。同じにすると あごが長くのびて 馬づら になる
HEAD_UP = HEAD_R * 1.15
HEAD_DN = HEAD_R * 0.85
CHIN = HEAD - HEAD_DN
EYE = m(48.3)           # VR のカメラの高さ
NECK_TOP = CHIN + m(1.6)   # 首の上はしは あごの中 まで入れる（すきまを作らない）
CHEST_TOP = m(42.4)
SHOULDER = m(41.4)
BUST = m(38.4)
WAIST = m(33.0)
HIP = m(28.2)           # 背の 51%。ここが高いと脚ばかり長く見える
ELBOW = m(34.8)
WRIST = m(28.6)
HAND = m(27.8)
KNEE = m(15.0)
SHOE_TOP = m(3.0)       # くるぶし

TORSO_W = m(9.8)        # 肩はば。頭のよこはばと同じくらいが人形らしい
TORSO_D = m(4.9)
HIP_W = m(9.2)
ARM_X = m(5.6)          # スカートの外へ出す
ARM_R = m(1.22)
HAND_R = m(1.25)
LEG_X = m(2.5)
LEG_R = m(1.85)
NECK_R = m(1.35)
SHOE_W = m(3.4)
SHOE_D = m(5.2)
SOCK_TOP = m(14.0)      # ハイソックスの口

FACE_EYE_X = m(1.80)    # 目の中心の左右
EYE_W = m(1.06)         # 目のよこ半径（目のはば = この2倍）
EYE_H = m(0.94)


def hr(k: float) -> float:
    """頭の半径を1としたときの長さ。顔まわりはこれで書く"""
    return HEAD_R * k


# ---------------------------------------------------------------- 色
# きせかえの既定値（src/config.ts の先頭の色）。ゲーム側で差し替わる
COLORS = {
    'skin': (1.000, 0.878, 0.784, 1),
    'hair': (0.612, 0.435, 0.259, 1),
    'eyes': (0.357, 0.243, 0.157, 1),
    'shirt': (1.000, 0.620, 0.769, 1),
    'pants': (0.490, 0.624, 0.941, 1),
    'shoes': (0.231, 0.169, 0.157, 1),
    'eyewhite': (1.000, 1.000, 1.000, 1),
    'mouth': (0.851, 0.400, 0.435, 1),
    'blush': (0.980, 0.667, 0.702, 1),
    'lash': (0.180, 0.129, 0.118, 1),
    'glint': (1.000, 1.000, 1.000, 1),
    'sock': (0.976, 0.969, 0.957, 1),   # くつした・えり・レース
    'ribbon': (0.180, 0.161, 0.176, 1),  # リボン・帯
}
# つやの出かた。髪はすべらかに（ハイライトが乗る）、ふくはざらっと（布に見える）
ROUGHNESS = {'eyes': 0.26, 'eyewhite': 0.16, 'shoes': 0.38, 'hair': 0.28,
             'blush': 0.95, 'sock': 0.78, 'shirt': 0.92, 'pants': 0.90,
             'lash': 0.26, 'glint': 0.04, 'ribbon': 0.40, 'skin': 0.62}
# 布のふわっとした照り返し（glTF の KHR_materials_sheen として出る）
SHEEN = {'shirt': 0.6, 'pants': 0.45, 'sock': 0.5}

# 部位 → どのボーンに丸ごとついていくか
BONE_OF = {
    'head': 'head',
    'neck': 'neck',
    'torso': 'chest',
    'hip': 'hips',
    'arm.L': 'upperarm.L',
    'arm.R': 'upperarm.R',
    'forearm.L': 'forearm.L',
    'forearm.R': 'forearm.R',
    'hand.L': 'hand.L',
    'hand.R': 'hand.R',
    'leg.L': 'thigh.L',
    'leg.R': 'thigh.R',
    'shin.L': 'shin.L',
    'shin.R': 'shin.R',
    'shoe.L': 'foot.L',
    'shoe.R': 'foot.R',
}

BONES = [
    ('root', (0, 0, 0), (0, 0, m(4)), None),
    ('hips', (0, 0, HIP), (0, 0, WAIST), 'root'),
    ('spine', (0, 0, WAIST), (0, 0, BUST), 'hips'),
    ('chest', (0, 0, BUST), (0, 0, CHEST_TOP), 'spine'),
    ('neck', (0, 0, CHEST_TOP), (0, 0, NECK_TOP), 'chest'),
    ('head', (0, 0, NECK_TOP), (0, 0, CROWN), 'neck'),
]
for _side, _sx in (('L', 1), ('R', -1)):
    BONES += [
        (f'shoulder.{_side}', (0, 0, SHOULDER), (_sx * ARM_X, 0, SHOULDER), 'chest'),
        (f'upperarm.{_side}', (_sx * ARM_X, 0, SHOULDER), (_sx * ARM_X, 0, ELBOW), f'shoulder.{_side}'),
        (f'forearm.{_side}', (_sx * ARM_X, 0, ELBOW), (_sx * ARM_X, 0, WRIST), f'upperarm.{_side}'),
        (f'hand.{_side}', (_sx * ARM_X, 0, WRIST), (_sx * ARM_X, 0, HAND - m(3)), f'forearm.{_side}'),
        (f'thigh.{_side}', (_sx * LEG_X, 0, HIP), (_sx * LEG_X, 0, KNEE), 'hips'),
        (f'shin.{_side}', (_sx * LEG_X, 0, KNEE), (_sx * LEG_X, 0, SHOE_TOP), f'thigh.{_side}'),
        (f'foot.{_side}', (_sx * LEG_X, 0, SHOE_TOP), (_sx * LEG_X, -m(3.4), m(0.4)), f'shin.{_side}'),
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
    if name in SHEEN:
        bsdf.inputs['Sheen Weight'].default_value = SHEEN[name]
        bsdf.inputs['Sheen Roughness'].default_value = 0.35
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


def bake_scale(obj: bpy.types.Object) -> None:
    """
    大きさ**だけ**をメッシュに焼く。

    `transform_apply` は既定で location と rotation も焼いてしまう。位置まで焼かれると
    オブジェクトの原点が (0,0,0) に戻り、そのあとの回転が「その場で回す」ではなく
    「ワールド原点のまわりを回る」になる。顔の部品が外へ飛び、髪のうねがトゲの冠に
    なるのはこれが原因。ここを通して、取りちがえないようにする。
    """
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def join(objs: list[bpy.types.Object], name: str) -> bpy.types.Object:
    """
    まとめて1つのメッシュにする。髪すじのように部品が増えても、
    出し分けの単位（髪型ひとつ）は1メッシュのままにできる。

    くっつけると他のオブジェクトの modifier は消えるので、先に焼いておく。
    """
    for o in objs:
        bpy.context.view_layer.objects.active = o
        for mod in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    head = objs[0]
    bpy.context.view_layer.objects.active = head
    bpy.ops.object.join()
    head.name = name
    return head


def sphere(name, loc, radius, scale=(1, 1, 1), segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=loc,
                                         segments=segments, ring_count=rings)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    return o


def blob(name, loc, scale, mat, part, rot=(0, 0, 0), levels=1, segments=20, rings=12):
    """つぶした丸をひとつ置く。いちばんよく使う形"""
    o = sphere(name, loc, 1, scale=scale, segments=segments, rings=rings)
    bake_scale(o)
    o.rotation_euler = rot
    return finish(o, mat, part, levels=levels)


def rounded_box(name, loc, size, bevel=0.35):
    """角を丸めた箱。`size` は**全体の大きさ**（半分ではない）"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod = o.modifiers.new('bevel', 'BEVEL')
    mod.width = min(size) * bevel
    mod.segments = 4
    return o


def limb(name, top, bottom, r_top, r_bottom=None, vertices=16):
    """腕・脚。上と下で太さを変えられる棒。両はしは丸める"""
    r_bottom = r_top if r_bottom is None else r_bottom
    height = (Vector(top) - Vector(bottom)).length
    center = (Vector(top) + Vector(bottom)) / 2
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r_bottom, radius2=r_top,
                                    depth=height, location=center)
    o = bpy.context.object
    o.name = name
    # 斜めの棒は、上から下へ向くように倒す
    d = Vector(bottom) - Vector(top)
    if abs(d.x) > 1e-6 or abs(d.y) > 1e-6:
        o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    mod = o.modifiers.new('bevel', 'BEVEL')
    mod.width = min(r_top, r_bottom) * 0.5
    mod.segments = 4
    return o


def tube(name, top, bottom, r_top, r_bottom, mat, part, levels=1):
    return finish(limb(name, top, bottom, r_top, r_bottom), mat, part, levels=levels)


def grid_mesh(name, verts, nu, nv, mat, part, thickness=None, smooth=True, levels=0):
    """
    (nu+1) x (nv+1) の網を1枚のメッシュにする。
    髪の布・ふくの身ごろ のように「継ぎ目を出したくない形」はこれで張る。
    """
    faces = [(j * (nu + 1) + i, j * (nu + 1) + i + 1,
              (j + 1) * (nu + 1) + i + 1, (j + 1) * (nu + 1) + i)
             for j in range(nv) for i in range(nu)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    if thickness:
        mod = o.modifiers.new('solid', 'SOLIDIFY')
        mod.thickness = thickness
        mod.offset = 1.0
    if smooth:
        bpy.ops.object.shade_smooth()
    return finish(o, mat, part, levels=levels)


def profile_r(profile, z):
    """(高さ, よこ半径, 前後半径) の並びから、その高さでの太さを なめらかに 読む"""
    if z >= profile[0][0]:
        return profile[0][1], profile[0][2]
    if z <= profile[-1][0]:
        return profile[-1][1], profile[-1][2]
    for (z0, x0, y0), (z1, x1, y1) in zip(profile, profile[1:]):
        if z1 <= z <= z0:
            t = (z0 - z) / max(1e-6, z0 - z1)
            t = t * t * (3 - 2 * t)          # 角を出さない（なめらかにつなぐ）
            return x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
    return profile[-1][1], profile[-1][2]


def revolve(name, profile, mat, part, seg=44, rings=40, thickness=None, levels=0):
    """
    たての形（プロファイル）を回してひとつの面にする。

    身ごろとスカートを別々の筒で作ると、腰のところに **切れ目** が出る。
    肩から裾までを1枚でつなぐと、その継ぎ目がそもそも生まれない。
    """
    z_top, z_bot = profile[0][0], profile[-1][0]
    verts = []
    for j in range(rings + 1):
        z = z_top + (z_bot - z_top) * (j / rings)
        rx, ry = profile_r(profile, z)
        for i in range(seg + 1):
            a = math.tau * (i / seg)
            verts.append((rx * math.sin(a), -ry * math.cos(a), z))
    return grid_mesh(name, verts, seg, rings, mat, part,
                     thickness=thickness, levels=levels)


# ---------------------------------------------------------------- 体
def build_head() -> bpy.types.Object:
    """
    頭。球のままだと あご がなく、風船に顔を描いたように見える。
    まん中から下をすぼめ、先をすこし前へ出して あご をつくる。
    """
    head = sphere('head', (0, 0, HEAD), HEAD_R, scale=(1.0, 1.02, 1.0),
                  segments=48, rings=30)
    bake_scale(head)
    bm = bmesh.new()
    bm.from_mesh(head.data)
    for v in bm.verts:
        # たては上下で のばし かたを変える（下を短くして あごを詰める）
        v.co.z *= (HEAD_UP if v.co.z >= 0 else HEAD_DN) / HEAD_R
        t = max(0.0, -v.co.z / HEAD_R) ** 1.4      # 0（目の高さ）→ 1（あご先）
        k = 1.0 - 0.34 * t                         # 下ほど細く（えらを落とす）
        v.co.x *= k
        v.co.y *= k * (1.0 - 0.08 * t)
        if v.co.y < 0:
            v.co.y -= HEAD_R * 0.07 * t            # あご先を前へ
        # あご。断面をまるいままにすると おまんじゅう になる。
        # 下へ行くほど「前だけ残して横を絞る」形へ寄せると、あごの線が出る
        rad = math.hypot(v.co.x, v.co.y)
        if rad > 1e-5 and t > 0:
            th = math.atan2(v.co.x, -v.co.y)       # 正面 0
            jaw = 0.58 + 0.42 * math.cos(th)       # 正面 1 → 横 0.58
            w = 1.0 + (jaw - 1.0) * min(1.0, t * 1.3)
            v.co.x *= w
            v.co.y *= w
        # ひたい を すこし立てる。まる のままだと赤んぼうに見える
        u = max(0.0, v.co.z / HEAD_R) ** 2
        if v.co.y < 0:
            v.co.y *= 1.0 - 0.07 * u
    bm.to_mesh(head.data)
    bm.free()
    return finish(head, 'skin', 'head')


def build_hand(side: str, sx: int) -> list[bpy.types.Object]:
    """
    手。まるい かたまり だけだとミトンに見えるので、指を4本と親指をつける。
    1本 1cm ほどしかないが、鏡に映ったときと下を見たときに効く。
    """
    x = sx * ARM_X
    out = [blob(f'hand.{side}', (x, -m(0.1), HAND + m(0.5)),
                (HAND_R * 0.86, HAND_R * 0.62, HAND_R * 1.25), 'skin', f'hand.{side}')]
    for i, dx in enumerate((-m(0.62), -m(0.21), m(0.21), m(0.62))):
        # 中ゆびを長く。そろえると熊手に見える
        length = m(1.9) - abs(dx) * 0.9
        out.append(tube(f'finger{i}.{side}', (x + dx, -m(0.15), HAND - m(0.4)),
                        (x + dx, -m(0.35), HAND - m(0.4) - length),
                        m(0.30), m(0.26), 'skin', f'hand.{side}', levels=0))
    out.append(tube(f'thumb.{side}', (x - sx * m(0.7), -m(0.45), HAND + m(0.4)),
                    (x - sx * m(1.4), -m(0.75), HAND - m(0.5)),
                    m(0.34), m(0.28), 'skin', f'hand.{side}', levels=0))
    return out


def build_shoe(side: str, sx: int) -> list[bpy.types.Object]:
    """
    くつ。四角い箱だと作業靴に、丸だけだと まんじゅう に見える。
    「つま先の下がった甲 ＋ うしろに立ち上がったかかと ＋ 平らな底」で組む。
    白いゴム底は付けない（本体と同じ色でひとつながりに見せる）。
    """
    x = sx * LEG_X
    return [
        # 甲
        blob(f'shoe.{side}', (x, -m(0.6), SHOE_TOP * 0.60),
             (SHOE_W * 0.48, SHOE_D * 0.46, SHOE_TOP * 0.62), 'shoes', f'shoe.{side}'),
        # つま先。前へ行くほど低くなる。ここで「足の形」に見える
        blob(f'shoe-toe.{side}', (x, -m(2.5), SHOE_TOP * 0.42),
             (SHOE_W * 0.42, SHOE_D * 0.34, SHOE_TOP * 0.44), 'shoes', f'shoe.{side}'),
        # かかと
        blob(f'shoe-heel.{side}', (x, m(1.5), SHOE_TOP * 0.66),
             (SHOE_W * 0.42, SHOE_D * 0.24, SHOE_TOP * 0.72), 'shoes', f'shoe.{side}'),
        # 底。丸いままだと転がりそうなので、うすく平らな板でそこを切る
        finish(rounded_box(f'shoe-sole.{side}', (x, -m(0.9), m(0.42)),
                           (SHOE_W * 0.88, SHOE_D * 0.94, m(0.84)), bevel=0.42),
               'shoes', f'shoe.{side}'),
        # 甲のストラップ。人形のくつらしくなる
        blob(f'shoe-strap.{side}', (x, -m(0.3), SHOE_TOP * 0.92),
             (SHOE_W * 0.50, m(0.34), m(0.30)), 'sock', f'shoe.{side}', levels=0),
    ]


def build_body() -> list[bpy.types.Object]:
    parts = [build_head()]

    # 耳。髪でだいたい隠れるので、すこし低め・うしろめに
    for side, sx in (('L', 1), ('R', -1)):
        parts.append(blob(f'ear.{side}', (sx * hr(0.94), hr(0.16), HEAD - hr(0.42)),
                          (hr(0.12), hr(0.19), hr(0.30)), 'skin', 'head'))

    # 首。人形は首が細くて長い。ここが顔の印象をだいぶ決める
    parts.append(tube('neck', (0, -m(0.15), NECK_TOP), (0, 0, CHEST_TOP - m(1.6)),
                      NECK_R * 0.95, NECK_R * 1.50, 'skin', 'neck'))

    # 胴。ふくの下に入る素体。えりもとや そで口 から のぞく
    torso = blob('torso', (0, 0, (CHEST_TOP + WAIST) / 2),
                 (TORSO_W * 0.46, TORSO_D * 0.52, (CHEST_TOP - WAIST) * 0.60),
                 'skin', 'torso')
    parts.append(torso)
    # 腰。胴とももをつなぐ
    parts.append(blob('hip', (0, 0, HIP + m(1.6)),
                      (HIP_W * 0.48, TORSO_D * 0.50, m(3.4)), 'skin', 'hip'))

    for side, sx in (('L', 1), ('R', -1)):
        # 肩。いかり肩に見えないよう、低めに小さくつぶした玉を当てて、
        # 首から腕へ ゆるく 下る線（なで肩）にする
        parts.append(blob(f'shoulder.{side}', (sx * (ARM_X - m(0.9)), 0, SHOULDER - m(1.0)),
                          (m(1.9), m(1.15), m(1.05)), 'skin', f'arm.{side}'))

        # 腕。1本の棒だと ひじも手首も ない。上腕 → ひじ → 前腕 → 手首 に分け、
        # ひじをすこし外へ出して、まっすぐな棒に見えないようにする
        ex = sx * m(0.35)
        parts.append(tube(f'arm.{side}', (sx * ARM_X, 0, SHOULDER - m(0.4)),
                          (sx * ARM_X + ex, 0, ELBOW), ARM_R * 1.12, ARM_R * 0.86,
                          'skin', f'arm.{side}'))
        parts.append(blob(f'elbow.{side}', (sx * ARM_X + ex, 0, ELBOW),
                          (ARM_R * 0.92, ARM_R * 0.88, ARM_R * 1.05), 'skin', f'arm.{side}'))
        parts.append(tube(f'forearm.{side}', (sx * ARM_X + ex, 0, ELBOW),
                          (sx * ARM_X, 0, WRIST), ARM_R * 0.90, ARM_R * 0.62,
                          'skin', f'forearm.{side}'))
        parts.append(blob(f'wrist.{side}', (sx * ARM_X, 0, WRIST),
                          (ARM_R * 0.62, ARM_R * 0.58, ARM_R * 0.80), 'skin', f'forearm.{side}'))
        parts += build_hand(side, sx)

        # 脚。ももからひざへ細く、ひざから足首へもう一段細く（人形の脚の線）
        parts.append(tube(f'leg.{side}', (sx * LEG_X, 0, HIP + m(0.6)),
                          (sx * LEG_X, 0, KNEE), LEG_R * 1.06, LEG_R * 0.72,
                          'pants', f'leg.{side}'))
        parts.append(blob(f'knee.{side}', (sx * LEG_X, -m(0.15), KNEE),
                          (LEG_R * 0.74, LEG_R * 0.70, LEG_R * 0.86), 'pants', f'leg.{side}'))
        # ふくらはぎ。まっすぐな棒だと つっぱり棒 に見える
        parts.append(tube(f'shin.{side}', (sx * LEG_X, 0, KNEE),
                          (sx * LEG_X, m(0.2), SHOE_TOP), LEG_R * 0.74, LEG_R * 0.40,
                          'pants', f'shin.{side}'))
        parts.append(blob(f'calf.{side}', (sx * LEG_X, m(0.55), KNEE - m(4.0)),
                          (LEG_R * 0.66, LEG_R * 0.52, m(3.2)), 'pants', f'shin.{side}'))
        parts += build_shoe(side, sx)

    return parts


# ---------------------------------------------------------------- 顔
def face_piece(name, x, z, scale, mat, sink=None, roll=0.0, levels=0):
    """
    顔の部品を、頭の面に **沿わせて** 置く。

    平らな楕円をまっすぐ押しつけると、まん中は埋まるのに外側のふちが飛び出す
    （頭が丸いので、少し横へ行くだけで面が手前に来る）。その高さでの断面の円を
    求め、面に接する位置に置いたうえで、法線の向きへ回して貼りつける。

    @param sink どれだけ面より内側に沈めるか(m)
    @param roll 顔の面の中での傾き（への字の目・目じりに使う）
    """
    sink = hr(0.05) if sink is None else sink
    # あごをすぼめたぶん、その高さの断面も細い（build_head と同じ式）
    t = max(0.0, (HEAD - z) / HEAD_R) ** 1.4
    k = 1.0 - 0.34 * t
    ring = k * math.sqrt(max(1e-6, HEAD_R ** 2 - (HEAD - z) ** 2))
    d = max(1e-3, ring - sink)
    phi = math.asin(max(-0.94, min(0.94, x / d)))     # 顔から はみ出さない ように留める
    o = sphere(name, (d * math.sin(phi), -d * math.cos(phi) * 1.02, z), 1, scale=scale)
    bake_scale(o)
    o.rotation_euler = (0.0, roll, phi)
    return finish(o, mat, 'head', levels=levels)


# ---------------------------------------------------------------- 顔（テクスチャ）
# 目・まつ毛・眉・口は、小さな玉を並べても人形の顔にならない（玉が玉に見える）。
# **顔の前に1枚の板を貼り、そこに絵を描く**。人形やアニメ調のキャラクターは
# たいていこの作り。表情の差し替えも「絵を替える」だけで済む。
#
# 板は頭の面に沿わせた、経度 ±A_MAX・緯度 B_MIN..B_MAX の一枚。
# UV はその角度をそのまま 0..1 にしてある。

TEX = 512                 # 顔の絵の大きさ（たて・よこ）
A_MAX = 1.02              # 板がまわりこむ角度（よこ）
B_MIN, B_MAX = -0.68, 0.52   # 同（たて）。あご下から ひたい まで
HEAD_A = HEAD_R           # 頭を楕円体と見たときの半径
HEAD_B = HEAD_R * 1.02
HEAD_C = HEAD_UP        # 顔の板は ひたい 側しか使わないので上の半径でよい


def _clamp(v, lo=-1.0, hi=1.0):
    return max(lo, min(hi, v))


def head_taper(z):
    """あごをすぼめた ぶん の細さ（build_head と同じ式）"""
    t = max(0.0, (HEAD - z) / HEAD_R) ** 1.4
    return 1.0 - 0.34 * t


def uv_of(x, z):
    """顔の上の位置（世界の m）→ 顔テクスチャの (u, v)"""
    b = math.asin(_clamp((z - HEAD) / HEAD_C))
    cb = max(1e-3, math.cos(b))
    a = math.asin(_clamp(x / head_taper(z) / (HEAD_A * cb)))
    return ((a + A_MAX) / (2 * A_MAX), (b - B_MIN) / (B_MAX - B_MIN))


def duv(x, z, dx, dz):
    """px でのおおきさ → uv でのおおきさ（その場所での のび を見る）"""
    u0, v0 = uv_of(x, z)
    u1, _ = uv_of(x + dx, z)
    _, v1 = uv_of(x, z + dz)
    return abs(u1 - u0), abs(v1 - v0)


class Canvas:
    """顔の絵。うすい板に重ねて描く（numpy は Blender に入っている）"""

    def __init__(self):
        import numpy as np
        self.np = np
        self.rgb = np.zeros((TEX, TEX, 3), dtype=np.float32)
        self.a = np.zeros((TEX, TEX), dtype=np.float32)
        # v は下から上（Blender の UV と同じ向き）
        u = (np.arange(TEX) + 0.5) / TEX
        self.U, self.V = np.meshgrid(u, u)

    def _mask(self, cu, cv, ru, rv, rot=0.0, power=2.0, soft=0.0035):
        np = self.np
        du, dv = self.U - cu, self.V - cv
        if rot:
            c, s = math.cos(rot), math.sin(rot)
            du, dv = du * c + dv * s, -du * s + dv * c
        d = (np.abs(du / max(ru, 1e-6)) ** power + np.abs(dv / max(rv, 1e-6)) ** power)
        # 1 の内がわ を塗る。ふちは やわらかく
        e = soft / max(min(ru, rv), 1e-6)
        return np.clip((1.0 - d) / max(e, 1e-6) + 0.5, 0.0, 1.0)

    def over(self, mask, color, alpha=1.0):
        np = self.np
        a = np.clip(mask * alpha, 0.0, 1.0)[..., None]
        col = np.array(color[:3], dtype=np.float32)
        self.rgb = self.rgb * (1 - a) + col * a
        self.a = np.clip(self.a + a[..., 0] * (1 - self.a), 0.0, 1.0)

    def ellipse(self, cu, cv, ru, rv, color, rot=0.0, power=2.0, alpha=1.0, soft=0.0035):
        self.over(self._mask(cu, cv, ru, rv, rot, power, soft), color, alpha)

    def crescent(self, cu, cv, ru, rv, color, lift, rot=0.0, power=2.0):
        """三日月。上の ふち だけ残す＝まつ毛の線になる"""
        keep = self._mask(cu, cv, ru, rv, rot, power)
        cut = self._mask(cu, cv - lift, ru * 1.02, rv, rot, power)
        self.over(self.np.clip(keep - cut, 0.0, 1.0), color)

    def clipped(self, inner, outer, color):
        self.over(self.np.clip(inner * outer, 0.0, 1.0), color)

    def to_image(self, name):
        np = self.np
        img = bpy.data.images.new(name, TEX, TEX, alpha=True)
        # foreach_set は float32 の連続した並びしか受けつけない
        px = np.concatenate([self.rgb, self.a[..., None]], axis=2)
        img.pixels.foreach_set(np.ascontiguousarray(px, dtype=np.float32).ravel())
        img.pack()
        return img


def draw_face(kind, spec) -> 'bpy.types.Image':
    """表情ひとつぶんの絵を描く"""
    c = Canvas()
    np = c.np
    eyes = COLORS['eyes'][:3]
    lash = COLORS['lash'][:3]
    white = (1.0, 1.0, 1.0)
    brown = COLORS['hair'][:3]

    style = spec['eye']
    ew, eh = EYE_W * spec.get('ew', 1.0), EYE_H * spec.get('eh', 1.0)

    for side, sx in (('L', 1), ('R', -1)):
        x = sx * FACE_EYE_X
        cu, cv = uv_of(x, EYE)
        ru, rv = duv(x, EYE, ew, eh)

        if style in ('open', 'wide'):
            # 白目。上がまっすぐ・下がまるい アーモンド
            eye_mask = c._mask(cu, cv, ru, rv, power=2.4)
            c.over(eye_mask, white)
            # ひとみ。白目からはみ出さないよう、白目の形で切る
            ir = min(ru * 0.86, rv * 0.92)
            iris = c._mask(cu, cv - rv * 0.06, ir, ir * 1.06, power=2.0)
            c.clipped(iris, eye_mask, eyes)
            # ひとみの ふち を濃く、まん中に黒目
            c.clipped(c._mask(cu, cv - rv * 0.06, ir * 0.52, ir * 0.58), eye_mask,
                      (0.08, 0.05, 0.05))
            # ひかり。大きいのを左上、小さいのを右下。これで目が生きる
            c.clipped(c._mask(cu - ru * 0.34, cv + rv * 0.34, ir * 0.30, ir * 0.32),
                      eye_mask, white)
            c.clipped(c._mask(cu + ru * 0.34, cv - rv * 0.40, ir * 0.16, ir * 0.17),
                      eye_mask, white)
            # 下まつ毛。うすい線
            c.crescent(cu + sx * ru * 0.16, cv - rv * 0.02, ru * 0.92, rv * 1.02,
                       lash, -rv * 0.14, power=2.4)
            # 上まつ毛。太い線＋目じりの はね。ここが顔のいちばんの見せ場
            c.crescent(cu, cv, ru * 1.04, rv * 1.06, lash, rv * 0.30, power=2.4)
            c.ellipse(cu + sx * ru * 1.02, cv + rv * 0.62, ru * 0.30, rv * 0.13,
                      lash, rot=-sx * 0.7)
        elif style in ('smile', 'down'):
            # とじた目。への字／逆への字の線
            sign = 1.0 if style == 'smile' else -1.0
            for dx, tilt in ((-ru * 0.55, 0.55), (ru * 0.55, -0.55)):
                c.ellipse(cu + dx, cv - abs(dx) * 0.34 * sign, ru * 0.62, rv * 0.14,
                          lash, rot=tilt * sign * sx * (1 if dx > 0 else -1))
        else:  # flat（ねる・まばたき）
            c.ellipse(cu, cv, ru * 0.98, rv * 0.13, lash)

        # 眉
        bz, tilt = spec['brow']
        bu, bv = uv_of(x + sx * m(0.18), EYE + m(bz))
        bru, brv = duv(x, EYE + m(bz), ew * 0.78, m(0.16))
        c.ellipse(bu, bv, bru, brv, brown, rot=sx * tilt, power=1.7)

        if spec.get('blush'):
            gu, gv = uv_of(sx * m(2.6), EYE - m(0.9))
            gru, grv = duv(sx * m(2.6), EYE - m(0.9), m(0.95), m(0.55))
            c.ellipse(gu, gv, gru, grv, COLORS['blush'][:3], alpha=0.55, soft=0.02)

    # 口
    mz, mw, mh = spec['mouth']
    mu, mv = uv_of(0, EYE - m(mz))
    mru, mrv = duv(0, EYE - m(mz), m(mw), m(mh))
    c.ellipse(mu, mv, mru, mrv, COLORS['mouth'][:3], power=1.8)
    if spec.get('open_mouth'):
        c.ellipse(mu, mv - mrv * 0.15, mru * 0.66, mrv * 0.62, (0.42, 0.16, 0.20))

    return c.to_image(f'face-{kind}')


def face_material(kind, image):
    mat = bpy.data.materials.new(f'face-{kind}')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = image
    tex.interpolation = 'Cubic'
    tex.location = (-400, 0)
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    bsdf.inputs['Roughness'].default_value = 0.30
    bsdf.inputs['Specular IOR Level'].default_value = 0.4
    mat.blend_method = 'BLEND'
    return mat


def face_card(kind, mat, nu=40, nv=44):
    """
    顔の板。頭の面にぴったり沿わせた四角い網。
    UV は 経度・緯度 をそのまま 0..1 にしてあるので、`uv_of` と対で使える。
    """
    verts, uvs, faces = [], [], []
    lift = hr(0.012)
    for j in range(nv + 1):
        b = B_MIN + (B_MAX - B_MIN) * (j / nv)
        for i in range(nu + 1):
            a = -A_MAX + 2 * A_MAX * (i / nu)
            cb, sb = math.cos(b), math.sin(b)
            z = HEAD + HEAD_C * sb
            k = head_taper(z)
            x = HEAD_A * cb * math.sin(a) * k
            y = -HEAD_B * cb * math.cos(a) * k * (1.0 - 0.08 * (1 - k) / 0.34)
            y -= HEAD_R * 0.07 * ((1 - k) / 0.34)
            u = max(0.0, (z - HEAD) / HEAD_R) ** 2
            y *= 1.0 - 0.07 * u
            # 面よりすこし前へ出す（頭に埋もれないように）
            d = math.sqrt(x * x + y * y + (z - HEAD) ** 2) or 1.0
            f = 1.0 + lift / d
            verts.append((x * f, y * f, HEAD + (z - HEAD) * f))
            uvs.append((i / nu, j / nv))
    for j in range(nv):
        for i in range(nu):
            p = j * (nu + 1) + i
            faces.append((p, p + 1, p + nu + 2, p + nu + 1))

    mesh = bpy.data.meshes.new(f'face-{kind}')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    layer = mesh.uv_layers.new(name='UVMap')
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            layer.data[li].uv = uvs[mesh.loops[li].vertex_index]
    obj = bpy.data.objects.new(f'face-{kind}', mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth()
    mesh.materials.append(mat)
    obj.visible_shadow = False   # 板の影が頭に ひし形 のあとを落とすのを止める
    obj['part'] = 'head'
    obj['variant'] = f'face-{kind}'
    return obj


# 表情。`FaceKind`（src/data/motions.ts）＋ まばたき の8つ。
# brow は (目からの高さ px, 内側を下げる向き)。眉の角度で表情がいちばん変わる
FACES = {
    'normal': dict(eye='open', mouth=(2.55, 0.34, 0.16), brow=(1.62, 0.00)),
    'happy': dict(eye='smile', mouth=(2.55, 0.44, 0.20), brow=(1.78, -0.16)),
    'laugh': dict(eye='smile', mouth=(2.50, 0.50, 0.30), brow=(1.84, -0.20),
                  open_mouth=True),
    'sad': dict(eye='down', mouth=(2.62, 0.30, 0.14), brow=(1.56, 0.32)),
    'sleep': dict(eye='flat', mouth=(2.55, 0.26, 0.13), brow=(1.56, 0.10)),
    'love': dict(eye='open', mouth=(2.55, 0.42, 0.20), blush=True, brow=(1.70, -0.14)),
    'surprised': dict(eye='wide', mouth=(2.50, 0.28, 0.26), brow=(2.08, -0.04),
                      ew=1.06, eh=1.16, open_mouth=True),
    'blink': dict(eye='flat', mouth=(2.55, 0.34, 0.16), brow=(1.62, 0.00)),
}


def build_faces() -> list[bpy.types.Object]:
    """表情を8つぶん作る。ゲーム側はそのときの1つだけを出す"""
    return [face_card(kind, face_material(kind, draw_face(kind, spec)))
            for kind, spec in FACES.items()]


def build_nose() -> list[bpy.types.Object]:
    """
    鼻。絵では出せないので、ここだけ立体。

    先の丸だけだと「顔に豆がついている」ように見える。
    眉間から鼻先まで通る **鼻すじ** を、うすく長い ふくらみ で足す。
    """
    return [
        face_piece('bridge', 0, EYE - m(0.30), (m(0.26), hr(0.15), m(1.25)),
                   'skin', sink=hr(0.128), levels=1),
        face_piece('bridge2', 0, EYE - m(1.30), (m(0.36), hr(0.155), m(0.95)),
                   'skin', sink=hr(0.118), levels=1),
        face_piece('nose', 0, EYE - m(1.95), (m(0.42), hr(0.16), m(0.38)),
                   'skin', sink=hr(0.10), levels=1),
    ]


# ---------------------------------------------------------------- 髪
# 髪を玉の集まりで作ると こぶ の かたまり に、つるりとした ふた 一枚で作ると
# **ヅラ** になる。毛に見せるには、
#
#   1. 頭にそう下地（地肌を隠すだけの、うすい ふた）
#   2. その上に重ねる **毛束**（細長い帯。先が とがっている）
#
# の2段で組む。束の長さと太さをばらけさせ、先を尖らせるのが かんじん。
# 生えぎわも、束の先で ぎざぎざ にする（一本の線で切ると ヅラ の ふち になる）。


def bang_edge(ang, low):
    """
    その角度での前がみの すそ の高さ。

    斜めに流した線。分け目のあたりがいちばん高く、反対がわへ向かって長くなる。
    """
    return EYE + low - hr(0.34) * (0.5 + 0.5 * math.sin(ang * 0.9 + 0.55))


def scalp(a, z, lift=0.0, wide=1.0, back=1.0):
    """
    頭のまわり、角度 a・高さ z の面の位置。
    頭より下では、頭のいちばん太いところの太さのまま落ちる。
    """
    if z >= HEAD:
        # 頭より上は頭の形に沿ってすぼまる（ここを保つと バケツ になる）
        rr = math.sqrt(max(0.0, 1 - ((z - HEAD) / (HEAD_UP * 1.02)) ** 2))
    else:
        # 頭より下は、いちばん太いところの太さのまま落ちる
        rr = 1.0
    rx = (HEAD_R + lift) * rr * wide
    ry = (HEAD_R * 1.02 + lift) * rr * wide * back
    return (rx * math.sin(a), -ry * math.cos(a) + HEAD_R * 0.10, z)


def hair_cap(name, back=1.0, low=hr(0.96)):
    """
    下地。地肌を隠すだけの うすい ふた。毛束の下に隠れるので、
    ここは なめらか でよい。生えぎわの ぎざぎざ は毛束が作る。
    """
    seg, rings = 56, 30
    verts = []
    for j in range(rings + 1):
        for i in range(seg + 1):
            a = -math.pi + math.tau * (i / seg)
            front = (1 + math.cos(a)) / 2
            top = HEAD + HEAD_UP * 1.02
            bot = bang_edge(a, low) * front + (EYE - hr(0.34)) * (1 - front)
            t = j / rings
            z = top + (bot - top) * t
            verts.append(scalp(a, z, lift=hr(0.06), back=back))
    return [grid_mesh(name, verts, seg, rings, 'hair', 'head', thickness=hr(0.05))]


def hair_lock(name, a, z_top, z_bot, width, lift, twist=0.0, back=1.0,
              wide=1.0, taper=0.55, seg=7, rings=14):
    """
    毛束ひとつ。頭の面に沿った細長い帯。**先を尖らせる**のが かんじん で、
    ここが四角いままだと、いくつ重ねても板にしか見えない。

    @param a     頭のまわりのどこから生えるか(rad)
    @param twist 下へ行くほど横へ流すぶん(rad)
    @param taper 毛先の太さ（つけねを1として）
    """
    verts = []
    for j in range(rings + 1):
        t = j / rings
        z = z_top + (z_bot - z_top) * t
        # 先を細く。いちばん下は一点に集める
        w = width * (1 - (1 - taper) * t) * math.sqrt(max(0.0, 1 - t ** 6))
        ac = a + twist * t * t
        for i in range(seg + 1):
            da = (i / seg - 0.5) * 2 * w
            # 束の まん中 をふくらませる（板にしない）
            bulge = lift + hr(0.05) * math.cos((i / seg - 0.5) * math.pi) * (1 - t * 0.5)
            verts.append(scalp(ac + da, z, lift=bulge, back=back, wide=wide))
    return grid_mesh(name, verts, seg, rings, 'hair', 'head', thickness=hr(0.045))


def hair_locks(name, low, z_bot, count=22, spread=math.pi, twist=0.0,
               back=1.0, wide=1.0, front_short=0.0, jitter=True):
    """
    毛束を うしろ半分 にならべる。長さと太さをばらけさせないと すだれ になる。

    `spread` は「うしろ側にどこまで回りこむか」。正面の ±(π - spread) は
    **あけておく**（ここを埋めると顔が毛にうもれる）。
    """
    out = []
    open_a = math.pi - spread                      # 正面のあけるはば
    for i in range(count):
        a = open_a + (math.tau - 2 * open_a) * ((i + 0.5) / count)
        front = max(0.0, math.cos(a)) ** 1.5
        # 生えぎわから、束ごとに ちがう長さ で垂らす
        wob = (0.82 + 0.36 * ((i * 7) % 5) / 4.0) if jitter else 1.0
        top = HEAD + HEAD_UP * 0.55
        bot = z_bot + front_short * front
        bot = top + (bot - top) * wob
        out.append(hair_lock(f'{name}{i}', a, top, bot,
                             width=((math.tau - 2 * open_a) / count) * (1.4 if jitter else 1.1),
                             lift=hr(0.10 + 0.05 * ((i * 3) % 3)),
                             twist=twist * (1 if i % 2 else 0.6),
                             back=back, wide=wide))
    return out


def hair_bangs(name, low, count=13):
    """
    前がみ。生えぎわから ぱらり と垂らす短い束。
    一本の線で切らず、束の先でふちを ぎざぎざ にする。
    """
    out = []
    for i in range(count):
        a = -1.28 + 2.56 * ((i + 0.5) / count)
        edge = bang_edge(a, low)
        # 束ごとに長さを変える。そろえると おかっぱ の板になる
        wob = 0.30 + 0.55 * (((i * 5) % 7) / 6.0)
        top = HEAD + HEAD_UP * 0.72
        bot = edge - hr(0.26) * wob
        out.append(hair_lock(f'{name}{i}', a, top, bot,
                             width=0.17, lift=hr(0.12), twist=0.16 * (1 - i / count),
                             taper=0.30, rings=10))
    return out


def build_hair() -> list[bpy.types.Object]:
    """
    きせかえの髪型10種（src/config.ts の HAIR_STYLE_NAMES と同じ並び）。
    平らな絵と同じで、**型ごとの目印**で見分けをつける。
    """
    parts = []

    def style(i, make):
        # 毛束で部品が多いので、髪型ごとに1メッシュへまとめる。
        # ゲーム側の出し分けは「髪型ひとつ」単位なので、これで困らない
        one = join(make(), f'hair-{i}')
        one['part'] = 'head'
        one['variant'] = f'hair-{i}'
        return [one]

    def base(low, back=1.0):
        return [*hair_cap('cap', back=back, low=low), *hair_bangs('bang', low)]

    def bow(x, y, z, size=1.0):
        """リボン。人形らしさがひと目で出る"""
        return [
            blob('bow.L', (x + hr(0.24) * size, y, z),
                 (hr(0.21) * size, hr(0.11) * size, hr(0.15) * size), 'shirt', 'head',
                 rot=(0, 0, -0.5)),
            blob('bow.R', (x - hr(0.24) * size, y, z),
                 (hr(0.21) * size, hr(0.11) * size, hr(0.15) * size), 'shirt', 'head',
                 rot=(0, 0, 0.5)),
            blob('bow.C', (x, y - hr(0.03), z),
                 (hr(0.07) * size, hr(0.07) * size, hr(0.07) * size), 'ribbon', 'head'),
        ]

    # 0 ショート：えりあしまで
    parts += style(0, lambda: [
        *base(hr(1.04)),
        *hair_locks('lock', hr(1.04), CHEST_TOP + hr(0.10), count=20,
                    spread=2.25, front_short=hr(0.55)),
    ])
    # 1 ボブ：あごの高さでそろえる
    parts += style(1, lambda: [
        *base(hr(0.94), back=1.02),
        *hair_locks('lock', hr(0.94), CHIN - hr(0.24), count=22,
                    spread=2.55, front_short=hr(0.10)),
    ])
    # 2 ツインテール
    parts += style(2, lambda: [
        *base(hr(1.00)),
        *hair_locks('lock', hr(1.00), CHEST_TOP + hr(0.20), count=16,
                    spread=2.05, front_short=hr(0.45)),
        *[o for s, sx in (('L', 1), ('R', -1)) for o in (
            blob(f'tie.{s}', (sx * hr(0.94), hr(0.16), HEAD + hr(0.34)),
                 (hr(0.15), hr(0.15), hr(0.15)), 'ribbon', 'head'),
            *[hair_lock(f'tail{k}.{s}', sx * (1.35 + 0.16 * k), HEAD + hr(0.10),
                        HEAD - hr(1.30) - hr(0.22) * k, 0.16, hr(0.55),
                        twist=sx * 0.10, taper=0.35) for k in range(3)],
        )],
    ])
    # 3 ロング：背中まで まっすぐ（人形の見た目はこれ）
    parts += style(3, lambda: [
        *base(hr(0.92), back=1.02),
        *hair_locks('lock', hr(0.92), WAIST + hr(0.10), count=26,
                    spread=2.70, twist=0.10, front_short=hr(1.30)),
        *bow(hr(0.58), -hr(0.26), HEAD + hr(0.74)),
    ])
    # 4 おだんご
    parts += style(4, lambda: [
        *base(hr(1.00)),
        *hair_locks('lock', hr(1.00), CHEST_TOP + hr(0.30), count=18,
                    spread=2.15, front_short=hr(0.45)),
        blob('bun', (0, hr(0.22), CROWN + hr(0.18)),
             (hr(0.44), hr(0.44), hr(0.38)), 'hair', 'head'),
        blob('buntie', (0, hr(0.22), CROWN - hr(0.16)),
             (hr(0.29), hr(0.29), hr(0.09)), 'ribbon', 'head'),
    ])
    # 5 ふんわり：外へ広がる
    parts += style(5, lambda: [
        *base(hr(0.88), back=1.04),
        *hair_locks('lock', hr(0.88), CHEST_TOP - hr(0.10), count=26,
                    spread=2.80, wide=1.10, twist=0.18, front_short=hr(0.35)),
    ])
    # 6 ポニーテール：右へ流す
    parts += style(6, lambda: [
        *base(hr(0.98)),
        *hair_locks('lock', hr(0.98), CHEST_TOP + hr(0.25), count=16,
                    spread=2.05, front_short=hr(0.45)),
        blob('tie', (hr(0.80), hr(0.40), HEAD + hr(0.30)),
             (hr(0.17), hr(0.17), hr(0.17)), 'ribbon', 'head'),
        *[hair_lock(f'tail{k}', 1.25 + 0.14 * k, HEAD + hr(0.20),
                    HEAD - hr(1.55) - hr(0.25) * k, 0.18, hr(0.62),
                    twist=0.12, taper=0.32) for k in range(4)],
    ])
    # 7 みつあみ
    parts += style(7, lambda: [
        *base(hr(0.94)),
        *hair_locks('lock', hr(0.94), CHEST_TOP + hr(0.15), count=18,
                    spread=2.35, front_short=hr(0.40)),
        *[blob(f'braid{i}.{s}', (sx * hr(0.92), hr(0.26), CHIN - hr(0.05) - hr(0.40) * i),
               (hr(0.19), hr(0.19), hr(0.24)), 'hair', 'head')
          for s, sx in (('L', 1), ('R', -1)) for i in range(4)],
    ])
    # 8 ひめカット：長い後ろ髪＋横で切りそろえた房
    parts += style(8, lambda: [
        *base(hr(0.88), back=1.02),
        *hair_locks('lock', hr(0.88), WAIST - hr(0.20), count=26,
                    spread=2.80, front_short=hr(1.70), jitter=False),
    ])
    # 9 くるくる
    parts += style(9, lambda: [
        *base(hr(0.98)),
        *hair_locks('lock', hr(0.98), CHEST_TOP + hr(0.10), count=20,
                    spread=2.35, twist=0.30, front_short=hr(0.40)),
        *[blob(f'curl{i}', (dx, hr(0.18), HEAD + dz),
               (hr(0.34), hr(0.34), hr(0.34)), 'hair', 'head')
          for i, (dx, dz) in enumerate([
              (hr(0.94), hr(0.02)), (-hr(0.94), hr(0.02)),
              (hr(0.84), -hr(0.58)), (-hr(0.84), -hr(0.58)),
              (hr(0.54), -hr(1.10)), (-hr(0.54), -hr(1.10))])],
    ])
    return parts


# ---------------------------------------------------------------- ふく
def build_outfits() -> list[bpy.types.Object]:
    """
    きせかえのふく4種（src/config.ts の OUTFITS と同じ並び）。
    ゲーム側はそのときの1種だけを出す。

    身ごろとスカートは**肩から裾まで1枚**で張る。別々の筒を重ねると、
    腰のところに継ぎ目の わ が出て、着ているように見えない。

    ワンピースとセーラーのときは**脚が素足＋くつした**になるが、
    脚のメッシュは共通のままで、ゲーム側が色を肌色に差し替える
    （平らな絵も `dress ? shade(skin) : pants` で同じことをしている）。
    """
    parts = []
    W, D = TORSO_W * 0.5, TORSO_D * 0.5

    def outfit(name, make):
        group = make()
        for o in group:
            o.name = f'outfit-{name}.{o.name}'
            o['variant'] = f'outfit-{name}'
        return group

    def dress(label, hem=None, r_hem=None, mat='shirt', loose=1.0, skirt=True):
        """肩から裾までひとつながりの身ごろ。すそを広げるとワンピースになる"""
        hem = HIP - m(6.4) if hem is None else hem
        r_hem = HIP_W * 1.02 if r_hem is None else r_hem
        # (高さ, よこ半径, 前後半径)。上から下へ
        prof = [
            (SHOULDER + m(0.2), W * 0.86 * loose, D * 0.94 * loose),
            (BUST, W * 0.94 * loose, D * 1.10 * loose),
            (WAIST + m(1.0), W * 0.80 * loose, D * 0.86 * loose),
            (WAIST - m(1.2), W * 0.86 * loose, D * 0.94 * loose),
        ]
        if skirt:
            prof += [(HIP, HIP_W * 0.62, HIP_W * 0.58),
                     (hem + m(1.2), r_hem, r_hem * 0.96),
                     (hem, r_hem * 0.99, r_hem * 0.95)]
        else:
            prof += [(HIP + m(1.0), W * 0.94 * loose, D * 1.0 * loose),
                     (HIP - m(1.0), W * 0.92 * loose, D * 0.98 * loose)]
        out = [revolve(label, prof, mat, 'torso', rings=54)]
        if skirt:
            # すその白いふち（レース）
            out.append(blob(f'{label}-lace', (0, 0, hem + m(0.3)),
                            (r_hem * 1.01, r_hem * 0.97, m(0.45)), 'sock', 'hip'))
        return out

    def puff_sleeve(label, mat='shirt'):
        """ふくらんだ そで。人形のふくはだいたいこれ"""
        return [blob(f'{label}.{s}', (sx * (ARM_X - m(0.3)), 0, SHOULDER - m(1.3)),
                     (m(1.85), m(1.60), m(1.70)), mat, f'arm.{s}')
                for s, sx in (('L', 1), ('R', -1))]

    def collar(label, mat='sock'):
        """まるえり。白いえりがあるだけで「よそゆき」に見える"""
        out = []
        for i in range(15):
            a = -1.35 + i / 14 * 2.70
            out.append(blob(f'{label}{i}',
                            (math.sin(a) * W * 0.76, -math.cos(a) * D * 1.10,
                             SHOULDER - m(0.5)),
                            (m(0.86), m(0.56), m(0.17)), mat, 'torso',
                            rot=(0, 0.28, a), levels=0))
        return out

    def sash(label):
        """腰の帯とリボン"""
        out = [blob(f'{label}-belt', (0, 0, WAIST),
                    (W * 0.86, D * 0.96, m(0.60)), 'ribbon', 'torso')]
        out += [blob(f'{label}-bow.{s}', (sx * m(1.7), -D * 0.88, WAIST),
                     (m(1.25), m(0.55), m(0.80)), 'ribbon', 'torso',
                     rot=(0, 0, -sx * 0.45))
                for s, sx in (('L', 1), ('R', -1))]
        out.append(blob(f'{label}-knot', (0, -D * 0.98, WAIST),
                        (m(0.45), m(0.38), m(0.50)), 'ribbon', 'torso'))
        return out

    def socks():
        """ハイソックス。すその口をすこし太らせる"""
        out = []
        for s, sx in (('L', 1), ('R', -1)):
            out.append(tube(f'sock.{s}', (sx * LEG_X, m(0.1), SOCK_TOP),
                            (sx * LEG_X, m(0.25), SHOE_TOP - m(0.2)),
                            LEG_R * 0.82, LEG_R * 0.48, 'sock', f'shin.{s}'))
            out.append(blob(f'sockcuff.{s}', (sx * LEG_X, m(0.1), SOCK_TOP),
                            (LEG_R * 0.88, LEG_R * 0.88, m(0.55)), 'sock', f'shin.{s}'))
        return out

    # 0 シャツ：シャツ＋ズボン（脚はそのままズボンの色）
    parts += outfit('shirt', lambda: [
        *dress('top', skirt=False),
        *puff_sleeve('sleeve'),
    ])
    # 1 ワンピース：ひとつながりの身ごろ＋白えり＋帯＋ハイソックス
    parts += outfit('dress', lambda: [
        *dress('top'),
        *puff_sleeve('sleeve'),
        *collar('collar'),
        *sash('sash'),
        *socks(),
    ])
    # 2 パーカー：厚い身ごろ＋フード＋ポケット
    parts += outfit('hoodie', lambda: [
        *dress('top', skirt=False, loose=1.16),
        *puff_sleeve('sleeve'),
        blob('hood', (0, D * 1.30, SHOULDER - m(0.2)),
             (m(2.9), m(1.7), m(1.7)), 'shirt', 'torso'),
        finish(rounded_box('pocket', (0, -D * 1.24, WAIST + m(0.4)),
                           (m(4.8), m(0.6), m(2.0)), bevel=0.3), 'shirt', 'torso'),
    ])
    # 3 セーラー：身ごろ＋セーラーえり＋短いスカート（スカートはズボンの色）
    parts += outfit('sailor', lambda: [
        *dress('top', hem=HIP - m(4.6), r_hem=HIP_W * 0.92),
        *puff_sleeve('sleeve'),
        *collar('collar'),
        finish(rounded_box('flap', (0, D * 0.88, SHOULDER - m(2.4)),
                           (W * 1.44, m(0.4), m(3.4)), bevel=0.3), 'sock', 'torso'),
        blob('tie', (0, -D * 1.10, SHOULDER - m(2.2)),
             (m(0.75), m(0.34), m(1.5)), 'ribbon', 'torso'),
        *socks(),
    ])
    return parts


# ---------------------------------------------------------------- 骨
def build_rig() -> bpy.types.Object:
    armature = bpy.data.armatures.new('pig-rig')
    rig = bpy.data.objects.new('pig-rig', armature)
    bpy.context.collection.objects.link(rig)
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


def bind(parts: list[bpy.types.Object], rig: bpy.types.Object) -> None:
    """
    部位ごとに丸ごと1本のボーンへ結びつける。

    切り替えるもの（表情・髪型・ふく）があるので、**1つにまとめない**。
    ゲーム側は名前を見て、そのとき要るものだけを出す。
    """
    for obj in parts:
        bpy.context.view_layer.objects.active = obj
        for mod in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
        group = obj.vertex_groups.new(name=BONE_OF[obj['part']])
        group.add(range(len(obj.data.vertices)), 1.0, 'REPLACE')
        mod = obj.modifiers.new('armature', 'ARMATURE')
        mod.object = rig
        obj.parent = rig


def export_glb(path: str) -> None:
    """ゲームが読む形で書き出す。+Y Up は既定のまま（Blender の -Y が +Z になる）"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', export_apply=True,
        export_skins=True, export_yup=True,
    )


def build_all() -> list[bpy.types.Object]:
    return build_body() + build_nose() + build_faces() + build_hair() + build_outfits()


def main() -> None:
    clear_scene()
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.length_unit = 'METERS'

    parts = build_all()
    rig = build_rig()
    bind(parts, rig)

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'avatar.glb')
    export_glb(out)
    faces = sum(len(o.data.polygons) for o in parts)
    variants = sorted({o.get('variant') for o in parts if o.get('variant')})
    print(f'できた: メッシュ {len(parts)} / 面 {faces} / ボーン {len(rig.data.bones)}')
    print(f'背の高さ {CROWN:.3f}m / 頭 {CROWN / (CROWN - CHIN):.1f}頭身')
    print(f'切り替えるもの {len(variants)}: {", ".join(variants)}')
    print(f'書き出し: {out}')


if __name__ == '__main__':
    main()
