#!/usr/bin/env python3
"""Split a REDCap flat CSV without separating rows belonging to one record."""

from __future__ import annotations

import csv
import sys
from collections import OrderedDict
from pathlib import Path


def main(source: Path, output_dir: Path, records_per_file: int = 10) -> None:
    with source.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        header = next(reader)
        groups: OrderedDict[str, list[list[str]]] = OrderedDict()
        for row in reader:
            if not row or not row[0]:
                raise ValueError("Every REDCap row must have a record ID in the first column.")
            groups.setdefault(row[0], []).append(row)

    output_dir.mkdir(parents=True, exist_ok=True)
    items = list(groups.items())
    outputs: list[Path] = []
    for offset in range(0, len(items), records_per_file):
        part = offset // records_per_file + 1
        output = output_dir / f"PilsDB_dev_sample_part_{part:02d}.csv"
        with output.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(header)
            for _, rows in items[offset : offset + records_per_file]:
                writer.writerows(rows)
        outputs.append(output)

    print(f"Created {len(outputs)} files for {len(groups)} records")
    for output in outputs:
        print(f"{output.name}: {output.stat().st_size} bytes")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: split_redcap_sample.py SOURCE.csv OUTPUT_DIR")
    main(Path(sys.argv[1]), Path(sys.argv[2]))
