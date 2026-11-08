"""Sync the crawler-owned character list. Run with --check in validation."""
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = root.parent / "bathroom-genius-crawler" / "equivalent_characters.json"
target = root / "src/modules/toilets/equivalent-characters.ts"
groups = json.loads(source.read_text(encoding="utf-8"))
assert all(len(group) >= 2 and all(len(char) == 1 for char in group) for group in groups)
chars = [char for group in groups for char in group]
assert len(chars) == len(set(chars)), "Character groups must not overlap"
content = "// Generated from crawler/equivalent_characters.json; run scripts/sync-equivalent-characters.py.\n"
content += "export const equivalentCharacters: readonly (readonly string[])[] = " + json.dumps(groups, ensure_ascii=False) + ";\n"
if "--check" in sys.argv:
    assert target.read_text(encoding="utf-8") == content, "Run sync-equivalent-characters.py"
else:
    target.write_text(content, encoding="utf-8")
