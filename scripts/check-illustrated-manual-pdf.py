"""Verify the manual PDF text and assemble contact sheets from rendered pages.

Render first: pdftoppm -r 65 -png <PDF> output/pdf/manual-current/page
Run with the bundled Python (pypdf and Pillow).
"""
import json
import re
import unicodedata
from pathlib import Path

from PIL import Image, ImageDraw
from pypdf import PdfReader


root = Path(__file__).resolve().parent.parent
sections = json.loads((root / "docs/manuals/sections.json").read_text(encoding="utf-8"))
pdf = root / "public/manuals/d-support/Dサポート_図解操作マニュアル.pdf"
rendered = root / "output/pdf/manual-current"
reader = PdfReader(pdf)
assert len(reader.pages) == len(sections) + 2, "Unexpected pagination"


def normalized(text):
    # Chromium's Japanese font map uses some CJK supplement radicals.
    text = unicodedata.normalize("NFKC", text).translate(str.maketrans({"⻑": "長", "⻘": "青", "⻩": "黄", "黃": "黄"}))
    return re.sub(r"\s+", "", text)


for index, section in enumerate(sections, start=2):
    page = normalized(reader.pages[index].extract_text())
    for expected in [section["title"], section["route"], *section["steps"], section["note"]]:
        assert normalized(expected) in page, f"Page {index + 1}: missing text from {section['id']}: {expected}"

images = sorted(rendered.glob("page-*.png"))
assert len(images) == len(reader.pages), "Render every PDF page before checking"
contacts = []
for offset in range(0, len(images), 8):
    sheet = Image.new("RGB", (1320, 1000), "#dbe1e8")
    draw = ImageDraw.Draw(sheet)
    for slot, path in enumerate(images[offset:offset + 8]):
        with Image.open(path) as page:
            assert page.width > 400 and page.height > 600, f"Insufficient resolution: {path}"
            thumbnail = page.convert("RGB")
            thumbnail.thumbnail((310, 450))
            x, y = 10 + (slot % 4) * 330, 28 + (slot // 4) * 490
            sheet.paste(thumbnail, (x, y))
            draw.text((x, y - 20), f"Page {offset + slot + 1}", fill="black")
    contact = rendered / f"contact-{offset // 8 + 1}.png"
    sheet.save(contact)
    contacts.append(str(contact))

print(json.dumps({"passed": True, "pages": len(reader.pages), "sections": len(sections),
                  "bytes": pdf.stat().st_size, "contactSheets": contacts}, ensure_ascii=False))
