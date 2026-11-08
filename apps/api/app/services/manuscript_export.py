"""Build inert HTML and EPUB from saved manuscript text."""
from html import escape
from io import BytesIO
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile
from datetime import datetime, timezone
import re

INVALID_XML = re.compile(r"[^\x09\x0a\x0d\x20-\ud7ff\ue000-\ufffd\U00010000-\U0010ffff]")


def text(value):
    return escape(INVALID_XML.sub("", value))


def paragraphs(value):
    return "".join(f"<p>{text(line)}</p>" for line in value.splitlines() if line.strip())


def manuscript_html(title, synopsis, chapters):
    links = "".join(f'<li><a href="#chapter-{i}">{text(c["title"])}</a></li>'
                    for i, c in enumerate(chapters, 1))
    body = "".join(f'<section id="chapter-{i}"><h2>{text(c["title"])}</h2>{paragraphs(c["content"])}</section>'
                   for i, c in enumerate(chapters, 1))
    return (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" '
            f'content="width=device-width, initial-scale=1"><title>{text(title)}</title></head>'
            f'<body><main><h1>{text(title)}</h1>{paragraphs(synopsis)}'
            f'<nav aria-label="Table of contents"><ol>{links}</ol></nav>{body}</main></body></html>').encode()


def xhtml(title, body):
    return (f'<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" '
            f'xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">'
            f'<head><title>{text(title)}</title></head><body>{body}</body></html>')


def manuscript_epub(project_id, version, title, synopsis, chapters):
    identifier = f"urn:indaverse:manuscript:{project_id}:{version}"
    modified = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    resources, spine, links = [], [], []
    out = BytesIO()
    with ZipFile(out, "w", compression=ZIP_DEFLATED) as book:
        book.writestr("mimetype", "application/epub+zip", compress_type=ZIP_STORED)
        book.writestr("META-INF/container.xml",
                      '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
                      '<rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/>'
                      '</rootfiles></container>')
        entries = [(title, synopsis), *((c["title"], c["content"]) for c in chapters)]
        for i, (heading, content) in enumerate(entries):
            name = f"chapter-{i}.xhtml"
            resources.append(f'<item id="c{i}" href="{name}" media-type="application/xhtml+xml"/>')
            spine.append(f'<itemref idref="c{i}"/>')
            links.append(f'<li><a href="{name}">{text(heading)}</a></li>')
            book.writestr(f"EPUB/{name}", xhtml(heading, f"<h1>{text(heading)}</h1>{paragraphs(content)}"))
        book.writestr("EPUB/nav.xhtml", xhtml("Contents",
                      '<nav epub:type="toc"><h1>Contents</h1><ol>' + "".join(links) + "</ol></nav>"))
        book.writestr("EPUB/package.opf",
                      f'<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">'
                      f'<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">{identifier}</dc:identifier>'
                      f'<dc:title>{text(title)}</dc:title><dc:language>en</dc:language>'
                      f'<meta property="dcterms:modified">{modified}</meta></metadata><manifest>'
                      '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
                      + "".join(resources) + "</manifest><spine>" + "".join(spine) + "</spine></package>")
    return out.getvalue()
