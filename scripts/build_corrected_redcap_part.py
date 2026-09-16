#!/usr/bin/env python3
"""Create one corrected REDCap import part from the full sample CSV."""

from __future__ import annotations

import csv
from collections import OrderedDict
from pathlib import Path


SOURCE = Path("PilsDB_dev_sample_100_records.csv")
PART_NUMBERS = (4, 5, 7, 9)
RECORDS_PER_PART = 10


with SOURCE.open(encoding="utf-8-sig", newline="") as handle:
    reader = csv.DictReader(handle)
    fieldnames = reader.fieldnames
    if fieldnames is None:
        raise ValueError("The source CSV has no header.")
    groups: OrderedDict[str, list[dict[str, str]]] = OrderedDict()
    for row in reader:
        groups.setdefault(row["uic_ori"], []).append(row)

for part_number in PART_NUMBERS:
    start = (part_number - 1) * RECORDS_PER_PART
    selected_ids = list(groups)[start : start + RECORDS_PER_PART]
    corrections = 0
    output = Path(f"PilsDB_dev_sample_part_{part_number:02d}_corrected.csv")

    with output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for record_id in selected_ids:
            for source_row in groups[record_id]:
                row = source_row.copy()
                if row.get("hiv_art_status_code") == "4":
                    row["hiv_art_status_code"] = ""
                    corrections += 1
                writer.writerow(row)

    if len(selected_ids) != RECORDS_PER_PART or corrections != 1:
        raise AssertionError(
            f"Part {part_number}: expected 10 records and 1 correction; "
            f"found {len(selected_ids)} and {corrections}."
        )

    print(f"Created {output} with {len(selected_ids)} records and {corrections} corrected value.")
