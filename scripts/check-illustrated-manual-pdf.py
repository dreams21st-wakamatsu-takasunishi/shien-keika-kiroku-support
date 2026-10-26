"""Verify every source paragraph, PDF navigation and rendered page of both guides."""
import json
import re
import sys
import unicodedata
from pathlib import Path
from PIL import Image, ImageDraw
from pypdf import PdfReader

root = Path(__file__).resolve().parent.parent
render_base = Path(sys.argv[1]) if len(sys.argv) == 2 else root / "output/pdf"
guides = [
    ("sections.json", "Dサポート_図解操作マニュアル.pdf", "manual-current"),
    ("troubleshooting.json", "Dサポート_トラブル対応ガイド.pdf", "troubleshooting-current"),
]
def normalized(text):
    text = unicodedata.normalize("NFKC", text).translate(str.maketrans({"⻑": "長", "⻘": "青", "⻩": "黄", "黃": "黄"}))
    return re.sub(r"\s+", "", text)

results = []
for source, filename, render_dir in guides:
    sections = json.loads((root / "docs/manuals" / source).read_text(encoding="utf-8"))
    pdf = root / "public/manuals/d-support" / filename
    rendered = render_base / render_dir
    reader = PdfReader(pdf)
    assert len(reader.pages) == len(sections) + 2, (filename, "Unexpected pagination", len(reader.pages))
    for index, section in enumerate(sections, start=2):
        page = normalized(reader.pages[index].extract_text())
        for expected in [section["title"], section["route"], *section["steps"], section["note"]]:
            assert normalized(expected) in page, f"{filename} page {index+1}: missing {section['id']}: {expected}"
        assert reader.pages[index].images, f"Page {index+1}: screenshot missing"
        assert str(index + 1) in page, "Printed page number missing"
    assert len(reader.pages[1].get("/Annots", [])) >= len(sections), "Clickable TOC missing"
    assert reader.outline, "PDF outline missing"
    images = sorted(rendered.glob("page-*.png"))
    assert len(images) == len(reader.pages), "Render every PDF page before checking"
    contacts = []
    for offset in range(0, len(images), 8):
        sheet = Image.new("RGB", (1320, 1000), "#dbe1e8")
        draw = ImageDraw.Draw(sheet)
        for slot, file in enumerate(images[offset:offset+8]):
            with Image.open(file) as page:
                assert page.width > 400 and page.height > 600, f"Insufficient resolution: {file}"
                thumbnail = page.convert("RGB")
                thumbnail.thumbnail((310, 450))
                x, y = 10 + (slot % 4) * 330, 28 + (slot // 4) * 490
                sheet.paste(thumbnail, (x, y))
                draw.text((x, y-20), f"Page {offset+slot+1}", fill="black")
        contact = rendered / f"contact-{offset//8+1}.png"
        sheet.save(contact)
        contacts.append(str(contact))
    results.append({"pdf": filename, "pages": len(reader.pages), "sections": len(sections),
                    "bytes": pdf.stat().st_size, "contactSheets": contacts})
print(json.dumps({"passed": True, "guides": results}, ensure_ascii=False))
