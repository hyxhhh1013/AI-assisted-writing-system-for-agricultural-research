"""把 TIFF 第一页转成 PNG，供浏览器和正文插入显示。"""

import sys

from PIL import Image


def main() -> None:
    src, dst = sys.argv[1], sys.argv[2]
    with Image.open(src) as im:
        frame = im.copy()
    if frame.mode == "P":
        frame = frame.convert("RGBA")
    elif frame.mode not in ("RGB", "RGBA"):
        frame = frame.convert("RGB")
    frame.save(dst, "PNG")


if __name__ == "__main__":
    main()
