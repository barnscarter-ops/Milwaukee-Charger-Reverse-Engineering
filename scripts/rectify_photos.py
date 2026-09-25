"""Derive the flat board textures used by the Board Atlas from the original evidence photos.

Inputs (never modified):
  evidence/2026-09-24/board-overview/1-Photo-1.jpg   component side
  evidence/2026-09-24/board-overview/3-Photo-3.jpg   solder side
  src/board.json                                     outline, cutouts, part footprints

Outputs (new folder, derived, safe to regenerate):
  evidence/derived/2026-09-24/board-top.jpg          component side, perspective-corrected, tall parts painted out
  evidence/derived/2026-09-24/board-bottom.jpg       solder side, perspective-corrected, mirrored into top-view coordinates
                                                     and registered to the component side with TIE_POINTS

Both images share one coordinate frame: 1 board unit = SCALE pixels, origin at the top-left of the
main block, y pointing down. The solder photo is mirrored so a point has the same x on both sides.

Usage:  pip install numpy opencv-python-headless
        python scripts/rectify_photos.py
"""
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'evidence' / '2026-09-24' / 'board-overview'
OUT = ROOT / 'evidence' / 'derived' / '2026-09-24'
SCALE = 1.8

data = json.loads((ROOT / 'src' / 'board.json').read_text())
W, H, HM, WT = data['size']['w'], data['size']['h'], data['size']['mainH'], data['size']['tabW']

# Board corner correspondences: (point in the 1500x2000 display space of the photo) -> (board units).
TOP_PTS = [((244, 358), (0, 0)), ((1315, 337), (W, 0)), ((1316, 1246), (W, HM)),
           ((600, 1256), (WT, HM)), ((244, 1719), (0, H)), ((602, 1719), (WT, H))]
BOT_PTS = [((28, 149), (W, 0)), ((1352, 138), (0, 0)), ((34, 1305), (W, HM)),
           ((966, 1315), (WT, HM)), ((1423, 1900), (0, H)), ((982, 1892), (WT, H))]


def rectify(photo, pts):
    img = cv2.imread(str(SRC / photo))
    k = img.shape[1] / 1500.0
    a = np.array([[p[0] * k, p[1] * k] for p, _ in pts], np.float32)
    b = np.array([[m[0] * SCALE, m[1] * SCALE] for _, m in pts], np.float32)
    homography, _ = cv2.findHomography(a, b, 0)
    return cv2.warpPerspective(img, homography, (int(W * SCALE), int(H * SCALE)), flags=cv2.INTER_CUBIC)


def poly(points):
    return (np.array(points, np.float32) * SCALE).astype(np.int32)


def board_mask():
    mask = np.zeros((int(H * SCALE), int(W * SCALE)), np.uint8)
    cv2.fillPoly(mask, [poly(data['outline'])], 255)
    for hole in data['holes']:
        cv2.fillPoly(mask, [poly(hole)], 0)
    return mask


def bleed_edges(img, mask):
    """Replace the blue mat / bench pixels that leak in at the board edge with nearby board colour."""
    inside = cv2.erode(mask, np.ones((7, 7), np.uint8))
    band = cv2.dilate(mask, np.ones((25, 25), np.uint8)) & ~inside
    return cv2.inpaint(img, band, 4, cv2.INPAINT_TELEA)


# Through-hole features visible on both faces: (component-side frame) -> (solder photo after its homography).
# The two homographies agree at the board corners but drift by up to ~22 units inside (lens distortion and
# board flex), so the solder image gets a smoothed thin-plate-spline correction into the component-side frame.
# Measured by eye on 5x crops, about +-2 units. Sources: pads CP/CC/M12-/M18-/M12CH+/M18CH+/Vcell1/Vcell2,
# jumper end holes, the T1 test pad, AC L/AC N holes, four U1 pins, two round holes, cross slot, long slot.
TIE_POINTS = [
    ((109.6, 895), (103, 880)), ((144.6, 937), (139.2, 923)), ((220, 688), (213, 677)), ((262, 684), (262, 676)),
    ((56, 684.6), (54, 673)), ((34, 333), (33, 319)), ((70, 1061), (60, 1047)), ((37, 1118), (25, 1100)),
    ((82.4, 808), (73, 794)), ((307, 809), (306, 799)), ((151, 999), (147, 989)), ((313, 1000), (311, 991)),
    ((358, 783), (356, 777)), ((299, 1096), (296, 1089)), ((301, 1237), (294, 1225)), ((135, 1164), (128, 1150)),
    ((241.6, 42), (252, 36)), ((240, 94), (248, 86)), ((123, 102), (125, 92)), ((122, 156), (126, 142)),
    ((13, 396), (15, 383)), ((76, 398), (80, 384)), ((85, 972), (78, 958)), ((522, 876), (525.7, 878)),
    ((674, 824), (685, 824)), ((863.9, 379), (887, 383)), ((864.1, 411.9), (887, 415)), ((865.3, 434.1), (887, 437)),
    ((841, 445.6), (863, 446.3)), ((582, 303), (582, 302)), ((582, 507), (584.6, 507)), ((177.5, 290), (187.5, 278)),
    ((180, 528), (185.4, 517)),
]
CORNERS = [(0, 0), (W, 0), (W, HM), (WT, HM), (WT, H), (0, H)]
TPS_SMOOTHING = 1e4


def _tps_kernel(r):
    with np.errstate(divide='ignore', invalid='ignore'):
        v = r * r * np.log(r)
    return np.nan_to_num(v)


def tps_fit(src, dst, lam=TPS_SMOOTHING):
    """Smoothed thin-plate spline mapping src -> dst (both N x 2, board units)."""
    src, dst = np.asarray(src, float), np.asarray(dst, float)
    n = len(src)
    a = np.zeros((n + 3, n + 3))
    a[:n, :n] = _tps_kernel(np.linalg.norm(src[:, None] - src[None], axis=2)) + lam * np.eye(n)
    a[:n, n:] = np.hstack([np.ones((n, 1)), src])
    a[n:, :n] = a[:n, n:].T
    b = np.zeros((n + 3, 2))
    b[:n] = dst
    return src, np.linalg.solve(a, b)


def tps_apply(model, pts):
    src, sol = model
    pts = np.asarray(pts, float)
    n = len(src)
    return _tps_kernel(np.linalg.norm(pts[:, None] - src[None], axis=2)) @ sol[:n] + sol[n] + pts @ sol[n + 1:]


def tie_model(inverse=False):
    top = [t for t, _ in TIE_POINTS] + CORNERS
    bot = [b for _, b in TIE_POINTS] + CORNERS
    return tps_fit(bot, top) if inverse else tps_fit(top, bot)


def register_bottom(img):
    """Warp the rectified solder image into the component-side frame using the tie points."""
    model = tie_model()
    step = 8
    h, w = img.shape[:2]
    gx, gy = np.meshgrid(np.arange(0, w + step, step), np.arange(0, h + step, step))
    grid = np.stack([gx.ravel(), gy.ravel()], 1) / SCALE
    src = tps_apply(model, grid) * SCALE
    map_x = cv2.resize(src[:, 0].reshape(gx.shape).astype(np.float32), None, fx=step, fy=step, interpolation=cv2.INTER_LINEAR)[:h, :w]
    map_y = cv2.resize(src[:, 1].reshape(gx.shape).astype(np.float32), None, fx=step, fy=step, interpolation=cv2.INTER_LINEAR)[:h, :w]
    return cv2.remap(img, map_x, map_y, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


PRINCIPAL = (506.0, 642.0)   # photo centre in board units; parallax pushes tall tops away from it


def base_polygon(p):
    """Footprint of a part at board level, in board units (None for flat parts left in the photo)."""
    x, y, kind = p['x'], p['y'], p['kind']
    if kind in ('xfmr', 'block', 'choke', 'film', 'to92'):
        w, d = p['w'] / 2, p['d'] / 2
        return [[x - w, y - d], [x + w, y - d], [x + w, y + d], [x - w, y + d]]
    if kind in ('elcap', 'fuse', 'graycyl', 'led'):
        r = p['dia'] / 2
        return [[x + r * math.cos(a * math.pi / 12), y + r * math.sin(a * math.pi / 12)] for a in range(24)]
    if kind == 'disc':
        w, d = p['dia'] / 2, p['t'] / 2
        return [[x - w, y - d], [x + w, y - d], [x + w, y + d], [x - w, y + d]]
    if kind == 'discflat':
        w, d = p['dia'] / 2, p['dia'] * 0.42
        return [[x + w * math.cos(a * math.pi / 12), y + d * math.sin(a * math.pi / 12)] for a in range(24)]
    if kind in ('filmcyl', 'axial'):
        ln, dia = p['len'] / 2, p['dia'] / 2
        if p.get('along', 'x') == 'y':
            ln, dia = dia, ln
        return [[x - ln, y - dia], [x + ln, y - dia], [x + ln, y + dia], [x - ln, y + dia]]
    if kind == 'bracket':
        top = p['t'] + p['lean']
        return [[x, p['y0']], [x + top, p['y0']], [x + top, p['y1']], [p['foot_x1'], p['y1']], [p['foot_x1'], p['foot_y0']], [x, p['foot_y0']]]
    return None


def footprint(p):
    """Base outline plus the same outline shifted by parallax at the part's height, as one convex hull."""
    base = base_polygon(p)
    if not base:
        return None
    k = 1 + p.get('h', 40) / 3500.0
    shifted = [[PRINCIPAL[0] + (bx - PRINCIPAL[0]) * k, PRINCIPAL[1] + (by - PRINCIPAL[1]) * k] for bx, by in base]
    hull = cv2.convexHull((np.array(base + shifted, np.float32) * SCALE).astype(np.int32))
    return hull[:, 0, :] / SCALE


def paint_out_tall_parts(img):
    mask = np.zeros(img.shape[:2], np.uint8)
    for p in data['parts']:
        if p['side'] != 'top':
            continue
        shape = footprint(p)
        if shape is not None:
            cv2.fillPoly(mask, [poly(shape)], 255)
    mask = cv2.dilate(mask, np.ones((29, 29), np.uint8))
    mask &= board_mask()
    # bare-board substrate: median colour of a clean patch of the tab plus a little paper-weave noise
    x0, y0, x1, y1 = [int(v * SCALE) for v in (150, 1010, 230, 1070)]
    colour = np.median(img[y0:y1, x0:x1].reshape(-1, 3), axis=0).astype(np.float32)
    rng = np.random.default_rng(7)
    noise = cv2.GaussianBlur(rng.normal(0, 6, img.shape[:2]).astype(np.float32), (0, 0), 0.9)
    fill = np.clip(colour[None, None, :] + noise[..., None], 0, 255)
    soft = cv2.GaussianBlur(mask, (0, 0), 4).astype(np.float32)[..., None] / 255.0
    return (img * (1 - soft) + fill * soft).astype(np.uint8)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    mask = board_mask()
    top = paint_out_tall_parts(bleed_edges(rectify('1-Photo-1.jpg', TOP_PTS), mask))
    bottom = bleed_edges(register_bottom(rectify('3-Photo-3.jpg', BOT_PTS)), mask)
    for name, img in (('board-top.jpg', top), ('board-bottom.jpg', bottom)):
        cv2.imwrite(str(OUT / name), img, [cv2.IMWRITE_JPEG_QUALITY, 88])
        print('wrote', OUT / name, img.shape[1], 'x', img.shape[0])


if __name__ == '__main__':
    sys.exit(main())
