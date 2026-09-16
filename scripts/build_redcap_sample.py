#!/usr/bin/env python3
"""Build a representative REDCap flat CSV sample from a REDCap ODM XML export."""

from __future__ import annotations

import csv
import math
import sys
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET

ODM = "{http://www.cdisc.org/ns/odm/v1.3}"
REDCAP = "{https://projectredcap.org}"


def local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def form_name(oid: str) -> str:
    return oid.removeprefix("Form.")


def main(source: Path, output: Path, sample_size: int = 100) -> None:
    repeating: set[str] = set()
    allowed_fields: list[str] = []
    excluded_types = {"calc", "descriptive", "file"}
    records: list[dict] = []
    in_clinical_data = False

    for event, elem in ET.iterparse(source, events=("start", "end")):
        name = local(elem.tag)
        if event == "start" and name == "ClinicalData":
            in_clinical_data = True
        elif event == "start" and not in_clinical_data and name == "RepeatingInstrument":
            instrument = elem.attrib.get(f"{REDCAP}RepeatInstrument", "")
            if instrument:
                repeating.add(instrument)
        elif event == "start" and not in_clinical_data and name == "ItemDef":
            field_type = elem.attrib.get(f"{REDCAP}FieldType", "")
            # REDCap imports each checkbox choice through its coded ___choice
            # column, while other field types use the base variable name.
            if field_type == "checkbox":
                field = elem.attrib.get("OID") or elem.attrib.get("Name")
            else:
                field = elem.attrib.get(f"{REDCAP}Variable") or elem.attrib.get("Name") or elem.attrib.get("OID")
            if field and field_type not in excluded_types and field not in allowed_fields and field != "redcap_data_access_group":
                allowed_fields.append(field)
        elif event == "end" and name == "SubjectData":
            record_id = elem.attrib.get("SubjectKey", "").strip()
            base: dict[str, str] = {"uic_ori": record_id}
            repeat_rows: list[dict[str, str]] = []
            forms_present: set[str] = set()
            feature_values: dict[str, str] = {}
            nonempty = 0

            for form in elem.iter():
                if local(form.tag) != "FormData":
                    continue
                instrument = form_name(form.attrib.get("FormOID", ""))
                instance = form.attrib.get("FormRepeatKey", "1")
                values: dict[str, str] = {}
                for item in form.iter():
                    if local(item.tag) != "ItemData":
                        continue
                    field = item.attrib.get("ItemOID", "")
                    value = item.attrib.get("Value", "")
                    if field and field in allowed_fields:
                        values[field] = value
                        if value not in ("", "0"):
                            nonempty += 1
                            feature_values[field] = value
                if any(value not in ("", "0") for value in values.values()):
                    forms_present.add(instrument)
                if instrument in repeating:
                    if values:
                        repeat_rows.append({"uic_ori": record_id, "redcap_repeat_instrument": instrument, "redcap_repeat_instance": instance, **values})
                else:
                    base.update(values)

            features = {f"prefix:{record_id[:1] or '?'}"}
            features.update(f"form:{instrument}" for instrument in forms_present)
            for field in (
                "client_gender_identity", "sex_assigned_birth_4b080f", "client_active",
                "outreach_hiv_rapid_result", "outreach_hepc_result", "outreach_hepb_result",
                "outreach_syp_result", "vital_status", "prep_status", "hiv_status",
            ):
                if feature_values.get(field):
                    features.add(f"{field}:{feature_values[field]}")
            for field, value in feature_values.items():
                if field.startswith("client_kp_type___") and value == "1":
                    features.add(f"kp:{field.rsplit('___', 1)[-1]}")

            records.append({
                "record_id": record_id,
                "base": base,
                "repeats": repeat_rows,
                "features": features,
                "density": nonempty,
            })
            elem.clear()

    if len(records) < sample_size:
        raise ValueError(f"Export contains only {len(records)} records; cannot select {sample_size}.")

    frequency = Counter(feature for record in records for feature in record["features"])
    selected: list[dict] = []
    selected_features: Counter[str] = Counter()
    remaining = list(records)

    while len(selected) < sample_size:
        def score(record: dict) -> tuple[float, int, str]:
            diversity = sum(
                (1.0 / math.sqrt(frequency[feature])) / (1 + selected_features[feature])
                for feature in record["features"]
            )
            richness = math.log1p(record["density"]) * 0.035
            repeats = math.log1p(len(record["repeats"])) * 0.025
            return diversity + richness + repeats, record["density"], record["record_id"]

        best = max(remaining, key=score)
        remaining.remove(best)
        selected.append(best)
        selected_features.update(best["features"])

    selected.sort(key=lambda record: record["record_id"])
    headers = ["uic_ori", "redcap_repeat_instrument", "redcap_repeat_instance"]
    headers.extend(field for field in allowed_fields if field != "uic_ori")

    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        for record in selected:
            writer.writerow(record["base"])
            for row in record["repeats"]:
                writer.writerow(row)

    unique_ids = {record["record_id"] for record in selected}
    if len(unique_ids) != sample_size:
        raise AssertionError(f"Expected {sample_size} unique records, found {len(unique_ids)}.")
    print(f"Created {output}")
    print(f"Unique records: {len(unique_ids)}")
    print(f"CSV rows: {sum(1 + len(record['repeats']) for record in selected)}")
    print(f"Columns: {len(headers)}")
    print(f"Repeating instruments represented: {len({row['redcap_repeat_instrument'] for record in selected for row in record['repeats']})}")
    print("UIC prefixes: " + ", ".join(f"{key.split(':',1)[1]}={value}" for key, value in sorted(selected_features.items()) if key.startswith("prefix:")))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: build_redcap_sample.py SOURCE.xml OUTPUT.csv")
    main(Path(sys.argv[1]), Path(sys.argv[2]))
