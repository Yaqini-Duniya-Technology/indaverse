import json
from pathlib import Path


def test_tracker_contains_exactly_fifty_unique_complete_records():
    root=Path(__file__).resolve().parents[2]
    rows=json.loads((root/'docs/PHASE2-TRACKER.json').read_text())
    assert [row['id'] for row in rows]==[f'IND-{number:03}' for number in range(1,51)]
    required={'id','upgrade','priority','studio','status','dependencies','acceptance_criteria','testing','documentation','git_reference'}
    for row in rows:
        assert required <= row.keys()
        assert row['status'] in {'Planned','In Progress','Blocked','Tested','Completed'}
