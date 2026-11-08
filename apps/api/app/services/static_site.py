"""Build a portable static site without rendering supplied HTML."""
from html import escape as esc
from io import BytesIO
import posixpath
import re
from zipfile import ZIP_DEFLATED, ZipFile


def route(path):
    return path.rstrip("/") or "/"


def validate_pages(pages):
    seen, issues = set(), []
    paths = {route(page["path"]) for page in pages}
    if "/" not in paths:
        issues.append("Add a homepage at /.")
    for page in pages:
        path = route(page["path"])
        if "//" in page["path"] or any(
            re.fullmatch(r"CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]", part, re.I)
            for part in path.split("/")
        ):
            issues.append(f'{page["name"]}: choose a portable path for {path}.')
        if path.casefold() in seen:
            issues.append(f'{page["name"]}: {path} conflicts with another page.')
        seen.add(path.casefold())
        for section in page["sections"]:
            link = section.get("link_path")
            if link and route(link) not in paths:
                issues.append(f'{page["name"]}: {link} does not match a saved page.')
    return issues


def filename(path):
    return (route(path).strip("/") + "/index.html").lstrip("/")


def build_site(blueprint):
    pages = blueprint.pages
    names = {route(page["path"]): page["name"] for page in pages}
    stream = BytesIO()
    with ZipFile(stream, "w", ZIP_DEFLATED) as archive:
        for page in pages:
            name = filename(page["path"])

            def href(path):
                return esc(posixpath.relpath(filename(path), posixpath.dirname(name) or "."))

            title = esc(page.get("seo_title") or page["name"])
            description = esc(page.get("seo_description") or blueprint.description[:300])
            social_title = esc(page.get("social_title") or page.get("seo_title") or page["name"])
            social_desc = esc(page.get("social_description") or page.get("seo_description") or blueprint.description[:300])
            nav = []
            for item in pages:
                label = item.get("nav_label", "").strip()
                if label:
                    current = ' aria-current="page"' if item["id"] == page["id"] else ""
                    nav.append(f'<a{current} href="{href(item["path"])}">{esc(label)}</a>')
            nav_html = '<nav aria-label="Main navigation">' + " ".join(nav) + "</nav>" if nav else ""
            body = []
            for section in page["sections"]:
                heading = f'<h2>{esc(section["heading"])}</h2>' if section["heading"] else ""
                content = esc(section["content"])
                link = section.get("link_path")
                button = f'<p><a href="{href(link)}">Visit {esc(names[route(link)])}</a></p>' if link else ""
                note = "<p>Form planned; this static export does not submit data.</p>" if section["kind"] == "form" else ""
                body.append(f'<section>{heading}<p class="copy">{content}</p>{button}{note}</section>')
            archive.writestr(name, f'''<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title>
<meta name="description" content="{description}"><meta property="og:type" content="website">
<meta property="og:title" content="{social_title}"><meta property="og:description" content="{social_desc}">
<style>body{{font:1.1rem/1.6 system-ui;margin:auto;max-width:50rem;padding:1.5rem;color:#172236;background:#f8fafc}}
nav{{display:flex;flex-wrap:wrap;gap:1rem}}a{{color:#204aa0}}a[aria-current]{{font-weight:bold}}
section{{border-top:1px solid #cbd5e1;padding:.75rem 0}}.copy{{white-space:pre-wrap;overflow-wrap:anywhere}}</style></head>
<body><a href="#content">Skip to content</a>{nav_html}<main id="content"><h1>{esc(page["name"])}</h1>{"".join(body)}</main></body></html>''')
    return stream.getvalue()
