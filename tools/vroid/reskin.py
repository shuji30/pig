"""
リグ付き .glb の「どの頂点がどの骨に付くか（ウェイト）」を付け直す。

## なぜ要るか

自動リギングの書き出しは、骨格は入っているのにウェイトがでたらめなことがある
（Tripo の場合、腕の頂点の **7割が腰** に付いていた）。そのまま腕を回すと、
一部の頂点だけが動いて残りは取り残され、**引きちぎられる**。

骨の位置がずれているだけなら `fix_rig.py` で直せるが、ウェイトは計算し直す
しかない。

## 配りかた

Blender の自動ウェイト（ボーンヒート）は、**閉じていないメッシュでは解けない**。
画像から起こしたモデルは、髪・服・体がばらばらの殻になっていることが多く、
ここではまず解けなかった（重みが全部 0 になる）。

そこで自前で配る。頂点から見て **骨の線分（head→tail）までの距離**が近い順に
4本まで選び、距離の4乗の逆数で重みを付ける。素朴だが、

- どんなメッシュでも必ず解ける（殻が分かれていてよい）
- 髪は頭、すそは脚、というふうに近い骨へ素直に付く

## 使いかた

    python3 tools/vroid/reskin.py もと.glb 出したさき.glb

`fix_rig.py` を先に通しておくこと（骨の位置が正しくないと、
いくら配り直しても合わない）。
"""
import os
import sys

import bpy
import numpy as np


def clear_scene() -> None:
    """
    まっさらにする。`bpy.ops` 経由の選択・削除は、隠れたコレクションに
    いるものを取りこぼすので、データを直に消す。
    """
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.armatures):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


# 1つの頂点が付く骨の数。多くすると なめらか だが ぼやける
INFLUENCES = 4
# 距離の重みの効きかた。大きいほど「いちばん近い骨」に寄る
FALLOFF = 4.0


def bone_segments(rig: bpy.types.Object) -> tuple[list[str], np.ndarray, np.ndarray]:
    """動かす骨の名前と、骨格の座標での 線分の両はし"""
    names, head, tail = [], [], []
    for bone in rig.data.bones:
        if not bone.use_deform:
            continue
        a, b = np.array(bone.head_local), np.array(bone.tail_local)
        if np.linalg.norm(b - a) < 1e-6:
            continue
        names.append(bone.name)
        head.append(a)
        tail.append(b)
    return names, np.array(head), np.array(tail)


def segment_distance(p: np.ndarray, a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """点(n,3) から 線分(m,3)〜(m,3) までの距離 (n,m)"""
    ab = b - a                                  # (m,3)
    ab2 = np.einsum('ij,ij->i', ab, ab)         # (m,)
    ap = p[:, None, :] - a[None, :, :]          # (n,m,3)
    t = np.clip(np.einsum('nmi,mi->nm', ap, ab) / ab2, 0.0, 1.0)
    near = a[None, :, :] + t[:, :, None] * ab[None, :, :]
    return np.linalg.norm(p[:, None, :] - near, axis=2)


def assign_weights(mesh: bpy.types.Object, rig: bpy.types.Object) -> None:
    """頂点ごとに、近い骨から順に重みを配る"""
    names, head, tail = bone_segments(rig)
    if not names:
        raise SystemExit('動かせる骨がない')

    mesh.vertex_groups.clear()
    for mod in list(mesh.modifiers):
        if mod.type == 'ARMATURE':
            mesh.modifiers.remove(mod)

    # 頂点を骨格の座標へ
    to_rig = rig.matrix_world.inverted() @ mesh.matrix_world
    co = np.empty(len(mesh.data.vertices) * 3, dtype=np.float64)
    mesh.data.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    m = np.array(to_rig)
    pts = co @ m[:3, :3].T + m[:3, 3]

    dist = segment_distance(pts, head, tail)
    order = np.argsort(dist, axis=1)[:, :INFLUENCES]
    rows = np.arange(len(pts))[:, None]
    near = dist[rows, order]
    w = 1.0 / np.maximum(near, 1e-5) ** FALLOFF
    w /= w.sum(axis=1, keepdims=True)

    groups = [mesh.vertex_groups.new(name=n) for n in names]
    for slot in range(INFLUENCES):
        for bi in range(len(names)):
            hit = np.nonzero(order[:, slot] == bi)[0]
            if hit.size == 0:
                continue
            # 同じ重みごとにまとめて入れる（1頂点ずつ呼ぶと遅い）
            for v, weight in zip(hit.tolist(), w[hit, slot].tolist()):
                groups[bi].add([v], weight, 'ADD')
    print(f'  {mesh.name}: {len(pts)} 頂点 → 骨 {len(names)} 本へ配った '
          f'(いちばん近い骨までの距離 中央値 {np.median(near[:, 0]):.4f})')


def reskin(src: str, dst: str) -> None:
    clear_scene()
    # 読みこむ前にあったものは対象にしない（Blender の初期シーンが残ることがある）
    before = {o.name for o in bpy.context.scene.objects}
    bpy.ops.import_scene.gltf(filepath=src)
    added = [o for o in bpy.context.scene.objects if o.name not in before]
    for o in list(bpy.context.scene.objects):
        if o.name in before:
            bpy.data.objects.remove(o, do_unlink=True)

    rigs = [o for o in added if o.type == 'ARMATURE']
    if not rigs:
        raise SystemExit(f'{src}: 骨格が見つからない')
    rig = rigs[0]

    # 皮の付いているメッシュだけを相手にする。Blender の glTF 読みこみは
    # 中身のないノードのために小さな玉を作ることがあるので、それは捨てる
    meshes = [o for o in added if o.type == 'MESH' and o.vertex_groups]
    for o in added:
        if o.type == 'MESH' and o not in meshes:
            print(f'皮の付いていないメッシュを捨てた: {o.name}')
            bpy.data.objects.remove(o, do_unlink=True)
    if not meshes:
        raise SystemExit(f'{src}: 皮の付いたメッシュが見つからない')
    print(f'メッシュ {len(meshes)} / ボーン {len(rig.data.bones)}')

    for mesh in meshes:
        # もとのウェイトと、ひも付けを外す
        mesh.vertex_groups.clear()
        for mod in list(mesh.modifiers):
            if mod.type == 'ARMATURE':
                mesh.modifiers.remove(mod)
        mesh.parent = None

    for mesh in meshes:
        assign_weights(mesh, rig)
        mod = mesh.modifiers.new('armature', 'ARMATURE')
        mod.object = rig
        mesh.parent = rig
        mesh.matrix_parent_inverse = rig.matrix_world.inverted()

    os.makedirs(os.path.dirname(os.path.abspath(dst)) or '.', exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=dst, export_format='GLB', export_apply=False,
        export_skins=True, export_yup=True,
    )
    print(f'書き出し: {dst}')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    reskin(sys.argv[1], sys.argv[2])
