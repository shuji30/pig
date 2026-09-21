#!/usr/bin/env python3
"""
リグ付き .glb の「ボーンの位置が原点に潰れている」のを直す。

## 何が起きているか

Tripo の自動リギングで書き出した .glb は、骨格を
`inverseBindMatrices`（頂点を各ボーンの座標系へ移す行列）にだけ入れて、
**ノード階層側の位置を全部 0 のまま**にして出してくることがある。

glTF の読み手は、頂点の変形をこう計算する:

    変形後 = Σ 重み × (ボーンの今の姿勢) × (inverseBindMatrix) × 頂点

「ボーンの今の姿勢」はノード階層から取るので、そこが原点だと、
頂点は inverseBindMatrix のぶんだけ**引きちぎられて飛ぶ**。
three.js でも Blender でも同じように壊れる（読み手の問題ではない）。

## どう直すか

`inverseBindMatrices` の逆が、そのボーンの本来の姿勢そのもの。
そこから親ぶんを打ち消して、各ノードの「親から見た姿勢」を作り直す。

    ノードの姿勢 = (親の本来の姿勢)⁻¹ × (自分の本来の姿勢)

## 使いかた

    python3 tools/vroid/fix_rig.py もと.glb public/avatar.glb
"""
import json
import struct
import sys

import numpy as np

GLB_MAGIC = 0x46546C67


def read_glb(path: str) -> tuple[dict, bytes]:
    d = open(path, 'rb').read()
    magic, _, _ = struct.unpack_from('<III', d, 0)
    if magic != GLB_MAGIC:
        raise SystemExit(f'{path}: .glb ではない')
    off, chunks = 12, {}
    while off < len(d):
        clen, ctype = struct.unpack_from('<II', d, off)
        chunks[ctype] = (off + 8, clen)
        off += 8 + clen + ((4 - clen % 4) % 4 if clen % 4 else 0)
    js, jl = chunks[0x4E4F534A]
    bs, bl = chunks[0x004E4942]
    return json.loads(d[js:js + jl].decode()), d[bs:bs + bl]


def write_glb(path: str, gltf: dict, binary: bytes) -> None:
    j = json.dumps(gltf, separators=(',', ':')).encode()
    j += b' ' * ((4 - len(j) % 4) % 4)          # JSON は空白で詰める
    b = binary + b'\0' * ((4 - len(binary) % 4) % 4)  # BIN は 0 で詰める
    total = 12 + 8 + len(j) + 8 + len(b)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', GLB_MAGIC, 2, total))
        f.write(struct.pack('<II', len(j), 0x4E4F534A)); f.write(j)
        f.write(struct.pack('<II', len(b), 0x004E4942)); f.write(b)


def matrices(gltf: dict, binary: bytes, index: int) -> np.ndarray:
    """MAT4 のアクセサを (n, 4, 4) で読む。glTF は列優先なので転置して返す"""
    a = gltf['accessors'][index]
    bv = gltf['bufferViews'][a['bufferView']]
    start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    raw = np.frombuffer(binary, dtype=np.float32, count=a['count'] * 16, offset=start)
    return raw.reshape(a['count'], 4, 4).transpose(0, 2, 1).astype(np.float64)


def local_matrix(node: dict) -> np.ndarray:
    if 'matrix' in node:
        return np.array(node['matrix'], dtype=np.float64).reshape(4, 4).T
    m = np.eye(4)
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    r = np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])
    m[:3, :3] = r * np.array(node.get('scale', [1, 1, 1]))
    m[:3, 3] = node.get('translation', [0, 0, 0])
    return m


def decompose(m: np.ndarray) -> tuple[list[float], list[float], list[float]]:
    """
    4x4 を 位置・回転(クォータニオン)・拡大 に分ける。

    **`matrix` のまま書いてはいけない。** three.js の glTF 読み手は、
    `matrix` を持つノードの `matrixAutoUpdate` を切る。すると、あとから
    ボーンを回しても行列が作り直されず、**姿勢がまったく効かなくなる**。
    位置・回転・拡大 に分けて書けばそうならない。
    """
    t = m[:3, 3]
    r = m[:3, :3].copy()
    s = np.linalg.norm(r, axis=0)
    s[s == 0] = 1.0
    r /= s
    # 回転行列 → クォータニオン (x, y, z, w)
    tr = r[0, 0] + r[1, 1] + r[2, 2]
    if tr > 0:
        k = np.sqrt(tr + 1.0) * 2
        q = [(r[2, 1] - r[1, 2]) / k, (r[0, 2] - r[2, 0]) / k, (r[1, 0] - r[0, 1]) / k, 0.25 * k]
    elif r[0, 0] > r[1, 1] and r[0, 0] > r[2, 2]:
        k = np.sqrt(1.0 + r[0, 0] - r[1, 1] - r[2, 2]) * 2
        q = [0.25 * k, (r[0, 1] + r[1, 0]) / k, (r[0, 2] + r[2, 0]) / k, (r[2, 1] - r[1, 2]) / k]
    elif r[1, 1] > r[2, 2]:
        k = np.sqrt(1.0 + r[1, 1] - r[0, 0] - r[2, 2]) * 2
        q = [(r[0, 1] + r[1, 0]) / k, 0.25 * k, (r[1, 2] + r[2, 1]) / k, (r[0, 2] - r[2, 0]) / k]
    else:
        k = np.sqrt(1.0 + r[2, 2] - r[0, 0] - r[1, 1]) * 2
        q = [(r[0, 2] + r[2, 0]) / k, (r[1, 2] + r[2, 1]) / k, 0.25 * k, (r[1, 0] - r[0, 1]) / k]
    n = np.linalg.norm(q)
    q = [float(v / n) for v in q]
    return [float(v) for v in t], q, [float(v) for v in s]


def parents(gltf: dict) -> dict[int, int]:
    out: dict[int, int] = {}
    for i, n in enumerate(gltf['nodes']):
        for c in n.get('children', []):
            out[c] = i
    return out


def world_matrix(gltf: dict, par: dict[int, int], i: int) -> np.ndarray:
    m = local_matrix(gltf['nodes'][i])
    while i in par:
        i = par[i]
        m = local_matrix(gltf['nodes'][i]) @ m
    return m


def mesh_box(gltf: dict) -> tuple[np.ndarray, np.ndarray] | None:
    """皮のついたメッシュの、頂点の入る はこ"""
    for mesh in gltf.get('meshes', []):
        for prim in mesh['primitives']:
            if 'JOINTS_0' not in prim['attributes']:
                continue
            a = gltf['accessors'][prim['attributes']['POSITION']]
            if 'min' in a and 'max' in a:
                return np.array(a['min']), np.array(a['max'])
    return None


def yaw(deg: float) -> np.ndarray:
    c, s = np.cos(np.radians(deg)), np.sin(np.radians(deg))
    m = np.eye(4)
    m[0, 0], m[0, 2], m[2, 0], m[2, 2] = c, s, -s, c
    return m


def find_yaw(gltf: dict, bind: dict[int, np.ndarray]) -> float:
    """
    骨格がメッシュに対して何度ずれているかを当てる。

    自動リギングの書き出しは、骨格だけ別の向きで入っていることがある
    （腕が前後にのびていて、メッシュの腕は左右、など）。そのままボーンを
    回すと、頂点が**ちがう中心のまわりを回って**引きちぎれる。

    上下(y)はそのままに、上から見た向きだけを 90 度きざみで当てる。
    選びかたは「関節がメッシュの はこ からはみ出さないこと」と
    「Left の骨が +x 側に来ること」。
    """
    box = mesh_box(gltf)
    if box is None:
        return 0.0
    lo, hi = box
    names = {ni: gltf['nodes'][ni]['name'] for ni in bind}
    best, best_score = 0.0, None
    for deg in (0.0, 90.0, 180.0, 270.0):
        r = yaw(deg)
        pts = {ni: (r @ np.append(m[:3, 3], 1.0))[:3] for ni, m in bind.items()}
        over = sum(float(np.maximum(0, lo - p).sum() + np.maximum(0, p - hi).sum())
                   for p in pts.values())
        left = [p[0] for ni, p in pts.items() if 'Left' in names[ni]]
        right = [p[0] for ni, p in pts.items() if 'Right' in names[ni]]
        # 左が +x に来ていなければ、ぐんと不利にする
        flipped = 0.0
        if left and right and np.mean(left) < np.mean(right):
            flipped = 10.0
        score = over + flipped
        if best_score is None or score < best_score:
            best, best_score = deg, score
    return best


def check(gltf: dict, binary: bytes) -> float:
    """いまのずれ。0 に近ければ直っている"""
    worst = 0.0
    par = parents(gltf)
    for skin in gltf.get('skins', []):
        ibm = matrices(gltf, binary, skin['inverseBindMatrices'])
        for k, ni in enumerate(skin['joints']):
            err = np.abs(ibm[k] @ world_matrix(gltf, par, ni) - np.eye(4)).max()
            worst = max(worst, float(err))
    return worst


def write_matrices(gltf: dict, binary: bytearray, index: int, mats: np.ndarray) -> None:
    """MAT4 のアクセサを書きもどす（glTF は列優先）"""
    a = gltf['accessors'][index]
    bv = gltf['bufferViews'][a['bufferView']]
    start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    raw = mats.transpose(0, 2, 1).astype(np.float32).tobytes()
    binary[start:start + len(raw)] = raw


def fix(gltf: dict, binary: bytearray) -> tuple[int, float]:
    par = parents(gltf)
    fixed, turned = 0, 0.0
    for skin in gltf.get('skins', []):
        ibm = matrices(gltf, binary, skin['inverseBindMatrices'])
        # ボーンの本来の姿勢（ワールド）
        bind = {ni: np.linalg.inv(ibm[k]) for k, ni in enumerate(skin['joints'])}

        # 骨格ぜんたいの向きがメッシュとずれていたら、そろえる。
        # 骨格を R で回すぶん、inverseBindMatrix には R⁻¹ をかけて、
        # **休めの姿勢では何も変わらない**ようにする（B'·IBM' = R·B·IBM·R⁻¹ = I）
        deg = find_yaw(gltf, bind)
        if deg:
            turned = deg
            r = yaw(deg)
            ri = np.linalg.inv(r)
            bind = {ni: r @ m for ni, m in bind.items()}
            write_matrices(gltf, binary, skin['inverseBindMatrices'],
                           np.stack([ibm[k] @ ri for k in range(len(ibm))]))

        for ni, w in bind.items():
            p = par.get(ni)
            # 親もボーンならそのぶんを打ち消す。ボーンでなければ、
            # そこまでの階層の姿勢を打ち消す
            base = bind[p] if p in bind else (world_matrix(gltf, par, p) if p is not None else np.eye(4))
            local = np.linalg.inv(base) @ w
            node = gltf['nodes'][ni]
            node.pop('matrix', None)
            t, q, sc = decompose(local)
            node['translation'], node['rotation'], node['scale'] = t, q, sc
            fixed += 1
    return fixed, turned


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    src, dst = sys.argv[1], sys.argv[2]
    gltf, binary = read_glb(src)
    if not gltf.get('skins'):
        raise SystemExit(f'{src}: ボーンが入っていない（skins なし）。直しようがない')

    binary = bytearray(binary)
    print(f'直すまえのずれ: {check(gltf, binary):.4f}（0 なら正常）')
    n, deg = fix(gltf, binary)
    if deg:
        print(f'骨格の向きがメッシュと {deg:.0f} 度ずれていたので、そろえた')
    print(f'ボーンの姿勢を作り直した: {n} 本')
    print(f'直したあとのずれ: {check(gltf, binary):.6f}')
    write_glb(dst, gltf, bytes(binary))
    print(f'書き出し: {dst}')


if __name__ == '__main__':
    main()
