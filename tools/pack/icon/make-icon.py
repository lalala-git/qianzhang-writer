"""千章图标：把本目录的 SVG 画成各尺寸，合成 tools/pack/icon.ico（exe、窗口、托盘都用它）。

用法：python make-icon.py [PNG 输出目录]
需要 Pillow 和 resvg-py（pip install pillow resvg-py）。
logo.svg 是完整图标（64px 以上）；logo-48 线条加粗（40/48px）；
logo-32 / logo-24 / logo-16 按像素网格画的简化版，小尺寸和托盘里才看得清。
"""
import hashlib, io, os, struct, sys
from PIL import Image
import resvg_py

HERE = os.path.dirname(os.path.abspath(__file__))
PLAN = {16: 'logo-16', 20: 'logo-24', 24: 'logo-24', 32: 'logo-32', 40: 'logo-48', 48: 'logo-48', 64: 'logo', 128: 'logo', 256: 'logo'}

def render(name, px):
    with open(os.path.join(HERE, name + '.svg'), encoding='utf-8') as f:
        data = resvg_py.svg_to_bytes(svg_string=f.read(), width=px, height=px)
    return Image.open(io.BytesIO(bytes(data))).convert('RGBA')

def bmp_entry(im):
    # 32 位 BGRA 位图（自下而上）+ 全 0 掩码，透明度靠 alpha
    s = im.size[0]; px = im.tobytes('raw', 'BGRA')
    rows = b''.join(px[y * s * 4:(y + 1) * s * 4] for y in reversed(range(s)))
    mask = ((s + 31) // 32) * 4 * s
    return struct.pack('<IiiHHIIiiII', 40, s, s * 2, 1, 32, 0, len(rows) + mask, 0, 0, 0, 0) + rows + b'\0' * mask

def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else None
    imgs = {px: render(name, px) for px, name in PLAN.items()}
    blobs = []
    for px, im in imgs.items():
        if out_dir: im.save(os.path.join(out_dir, 'icon-%d.png' % px))
        if px == 256:
            b = io.BytesIO(); im.save(b, 'PNG', optimize=True); blobs.append(b.getvalue())
        else:
            blobs.append(bmp_entry(im))
        print(px, hashlib.sha256(im.tobytes()).hexdigest()[:16])
    head = struct.pack('<HHH', 0, 1, len(blobs)); off = 6 + 16 * len(blobs); dirs = b''
    for px, b in zip(imgs, blobs):
        dirs += struct.pack('<BBBBHHII', px % 256, px % 256, 0, 0, 1, 32, len(b), off); off += len(b)
    with open(os.path.join(HERE, '..', 'icon.ico'), 'wb') as f: f.write(head + dirs + b''.join(blobs))
    print('icon.ico 已更新')

if __name__ == '__main__':
    main()