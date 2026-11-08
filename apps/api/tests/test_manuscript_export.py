from io import BytesIO
from xml.etree import ElementTree
from zipfile import ZipFile, ZIP_STORED

from test_creative_workspace import workspace


def test_saved_chapter_order_status_and_safe_manuscript_files(workspace):
    client, _ = workspace
    base = "/api/v1/projects/1/story"
    first = {"id": "one", "title": "Beginning", "content": "Opening."}
    second = {"id": "two", "title": "After the storm", "content": "<script>do not run</script>\nNext line.",
              "status": "revising", "target_words": 450}
    assert client.put(base, json={"expected_version": 0, "title": "A & B", "chapters": [first, second]}).status_code == 200
    result = client.put(base, json={"expected_version": 1, "title": "A & B", "chapters": [second, first]})
    assert result.status_code == 200, result.text
    assert client.get(base).json()["chapters"] == [second, first]
    assert client.get(f"{base}/manuscript/html?version=1").status_code == 409
    html = client.get(f"{base}/manuscript/html?version=2")
    assert html.headers["cache-control"] == "no-store"
    assert html.headers["content-type"] == "text/html; charset=utf-8"
    assert "<script>" not in html.text and "&lt;script&gt;" in html.text
    assert html.text.index("After the storm") < html.text.index("Beginning")
    ebook = client.get(f"{base}/manuscript/epub?version=2")
    assert ebook.headers["content-type"] == "application/epub+zip"
    with ZipFile(BytesIO(ebook.content)) as book:
        assert book.namelist()[0] == "mimetype"
        assert book.getinfo("mimetype").compress_type == ZIP_STORED
        assert book.read("mimetype") == b"application/epub+zip"
        for name in book.namelist()[1:]:
            ElementTree.fromstring(book.read(name))
        nav = book.read("EPUB/nav.xhtml").decode()
        assert nav.index("After the storm") < nav.index("Beginning")
        assert "&lt;script&gt;" in book.read("EPUB/chapter-1.xhtml").decode()
    client.cookies.set("indaverse_access_token", "2")
    assert client.get(f"{base}/manuscript/epub?version=2").status_code == 404
