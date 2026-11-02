from __future__ import annotations

import argparse
import csv
import io
import json
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF_DIR = ROOT / "tmp" / "pdfs" / "ipa"
DEFAULT_WORK_DIR = ROOT / "tmp" / "ocr" / "ipa-work"
DEFAULT_DATA_PATH = ROOT / "kakomon" / "ipa-it-passport-2021-2026.json"
DEFAULT_IMAGE_DIR = ROOT / "public" / "kakomon" / "img" / "ipa"
DEFAULT_TESSERACT = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")
DEFAULT_TESSDATA = ROOT / "tmp" / "ocr" / "tessdata"

LABELS = ("ア", "イ", "ウ", "エ")
CATEGORY_CODES = {
    "ストラテジ": "strategy",
    "マネジメント": "management",
    "テクノロジ": "technology",
}
SOURCE_URL = "https://www3.jitec.ipa.go.jp/JitesCbt/html/openinfo/questions.html"


@dataclass(frozen=True)
class YearConfig:
    year: int
    stem: str
    era_name: str


@dataclass(frozen=True)
class OcrLine:
    page_index: int
    top: int
    bottom: int
    left: int
    text: str

    @property
    def compact(self) -> str:
        return re.sub(r"\s+", "", self.text)


@dataclass(frozen=True)
class QuestionMarker:
    number: int
    page_index: int
    top: int
    line: OcrLine


@dataclass(frozen=True)
class CategoryRange:
    start: int
    end: int
    code: str
    page_index: int
    top: int


YEARS = (
    YearConfig(2021, "2021r03", "令和3年度"),
    YearConfig(2022, "2022r04", "令和4年度"),
    YearConfig(2023, "2023r05", "令和5年度"),
    YearConfig(2024, "2024r06", "令和6年度"),
    YearConfig(2025, "2025r07", "令和7年度"),
    YearConfig(2026, "2026r08", "令和8年度"),
)

FALLBACK_CATEGORY_RANGES = {
    2021: ((1, 35, "strategy"), (36, 55, "management"), (56, 100, "technology")),
    2022: ((1, 35, "strategy"), (36, 54, "management"), (55, 100, "technology")),
    2023: ((1, 35, "strategy"), (36, 55, "management"), (56, 100, "technology")),
    2024: ((1, 35, "strategy"), (36, 55, "management"), (56, 100, "technology")),
    2025: ((1, 35, "strategy"), (36, 55, "management"), (56, 100, "technology")),
    2026: ((1, 34, "strategy"), (35, 54, "management"), (55, 100, "technology")),
}

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build the official IPA IT Passport 2021-2026 question dataset.",
    )
    parser.add_argument(
        "--years",
        nargs="+",
        type=int,
        default=[config.year for config in YEARS],
        help="Years to process (default: 2021 through 2026).",
    )
    parser.add_argument("--pdf-dir", type=Path, default=DEFAULT_PDF_DIR)
    parser.add_argument("--work-dir", type=Path, default=DEFAULT_WORK_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_DATA_PATH)
    parser.add_argument("--image-dir", type=Path, default=DEFAULT_IMAGE_DIR)
    parser.add_argument("--tesseract", type=Path, default=DEFAULT_TESSERACT)
    parser.add_argument("--tessdata", type=Path, default=DEFAULT_TESSDATA)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument(
        "--reuse-existing-crops",
        action="store_true",
        help="Rebuild image-mode records from the existing 600 question crops.",
    )
    return parser.parse_args()


def ensure_inputs(
    args: argparse.Namespace,
    configs: list[YearConfig],
    require_pdfs: bool = True,
) -> None:
    if not require_pdfs:
        return

    if not args.tesseract.is_file():
        raise FileNotFoundError(f"Tesseract was not found: {args.tesseract}")
    for language in ("jpn", "eng"):
        model = args.tessdata / f"{language}.traineddata"
        if not model.is_file():
            raise FileNotFoundError(f"Tesseract model was not found: {model}")

    for config in configs:
        for suffix in ("qs", "ans"):
            pdf = args.pdf_dir / f"{config.stem}_ip_{suffix}.pdf"
            if not pdf.is_file():
                raise FileNotFoundError(f"Official IPA PDF was not found: {pdf}")


def extract_page_images(pdf_path: Path, output_dir: Path) -> list[Path]:
    from pypdf import PdfReader

    output_dir.mkdir(parents=True, exist_ok=True)
    reader = PdfReader(pdf_path)
    page_paths: list[Path] = []

    for page_index, page in enumerate(reader.pages):
        images = list(page.images)
        if len(images) != 1:
            raise ValueError(
                f"Expected exactly one raster image on page {page_index + 1} of {pdf_path.name}; "
                f"found {len(images)}."
            )

        output_path = output_dir / f"page-{page_index + 1:03}.jpg"
        if not output_path.is_file():
            output_path.write_bytes(images[0].data)
        page_paths.append(output_path)

    return page_paths


def run_tesseract_tsv(
    image_path: Path,
    tesseract: Path,
    tessdata: Path,
    cache_path: Path,
    psm: int = 6,
) -> Path:
    if cache_path.is_file():
        return cache_path

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        str(tesseract),
        str(image_path),
        "stdout",
        "--tessdata-dir",
        str(tessdata),
        "-l",
        "jpn+eng",
        "--psm",
        str(psm),
        "tsv",
    ]
    result = subprocess.run(command, check=True, capture_output=True)
    cache_path.write_bytes(result.stdout)
    return cache_path


def ocr_pages(
    page_paths: list[Path],
    year_work_dir: Path,
    tesseract: Path,
    tessdata: Path,
    workers: int,
) -> list[Path]:
    tsv_dir = year_work_dir / "tsv"
    completed: dict[int, Path] = {}

    with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        futures = {
            executor.submit(
                run_tesseract_tsv,
                page_path,
                tesseract,
                tessdata,
                tsv_dir / f"page-{page_index + 1:03}.tsv",
            ): page_index
            for page_index, page_path in enumerate(page_paths)
        }
        for future in as_completed(futures):
            page_index = futures[future]
            completed[page_index] = future.result()

    return [completed[index] for index in range(len(page_paths))]


def parse_tsv_lines(tsv_path: Path, page_index: int) -> list[OcrLine]:
    raw = tsv_path.read_text(encoding="utf-8")
    rows = csv.DictReader(io.StringIO(raw), delimiter="\t", quoting=csv.QUOTE_NONE)
    grouped: dict[tuple[int, int, int], list[dict[str, str]]] = {}

    for row in rows:
        if row.get("level") != "5" or not row.get("text", "").strip():
            continue
        key = (int(row["block_num"]), int(row["par_num"]), int(row["line_num"]))
        grouped.setdefault(key, []).append(row)

    lines: list[OcrLine] = []
    for words in grouped.values():
        ordered = sorted(words, key=lambda word: int(word["word_num"]))
        left = min(int(word["left"]) for word in ordered)
        top = min(int(word["top"]) for word in ordered)
        right = max(int(word["left"]) + int(word["width"]) for word in ordered)
        bottom = max(int(word["top"]) + int(word["height"]) for word in ordered)
        text = " ".join(word["text"].strip() for word in ordered if word["text"].strip())
        lines.append(OcrLine(page_index, top, bottom, left, text))

    return sorted(lines, key=lambda line: (line.top, line.left))


def build_marker_strips(
    page_paths: list[Path],
    output_dir: Path,
    scale: int = 3,
) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    marker_paths: list[Path] = []
    for page_index, page_path in enumerate(page_paths):
        output_path = output_dir / f"page-{page_index + 1:03}.jpg"
        if not output_path.is_file():
            with Image.open(page_path) as source:
                image = source.convert("RGB")
            left = 150
            right = min(image.width, 380)
            strip = image.crop((left, 0, right, image.height))
            strip = strip.resize((strip.width * scale, strip.height * scale))
            strip.save(output_path, format="JPEG", quality=95)
        marker_paths.append(output_path)
    return marker_paths


def scale_marker_lines(
    lines: list[OcrLine],
    scale: int = 3,
    left_offset: int = 150,
) -> list[OcrLine]:
    return [
        OcrLine(
            page_index=line.page_index,
            top=round(line.top / scale),
            bottom=round(line.bottom / scale),
            left=round(line.left / scale) + left_offset,
            text=line.text,
        )
        for line in lines
    ]


def question_number(line: OcrLine) -> int | None:
    if "から問" in line.compact or "から間" in line.compact:
        return None
    match = re.match(r"^[問間]\s*([0-9]{1,3})(?:\D|$)", line.text)
    if not match and line.left < 195:
        match = re.match(r"^[A-Za-z|Ilf]{1,3}\s*([0-9]{1,3})(?:\D|$)", line.text)
    if not match:
        return None
    value = int(match.group(1))
    return value if 1 <= value <= 100 else None


def resembles_question_marker(line: OcrLine) -> bool:
    return line.left < 205 and len(line.text.strip()) >= 4


def marker_assignment_cost(line: OcrLine, expected: int) -> float:
    observed = question_number(line)
    if observed == expected:
        return 0.0
    if observed is None:
        return 3.0
    return 1.5 + min(abs(observed - expected), 20) * 0.03


def find_question_markers(
    marker_lines_by_page: list[list[OcrLine]],
    category_ranges: list[CategoryRange],
) -> list[QuestionMarker]:
    header_positions = [
        (item.page_index, item.top)
        for item in category_ranges
        if item.page_index >= 0
    ]
    candidates = [
        line
        for lines in marker_lines_by_page
        for line in lines
        if resembles_question_marker(line)
        and "から問" not in line.compact
        and not any(
            line.page_index == page_index and abs(line.top - top) <= 55
            for page_index, top in header_positions
        )
    ]
    candidates.sort(key=lambda line: (line.page_index, line.top))

    q1_indexes = [
        index for index, line in enumerate(candidates) if question_number(line) == 1
    ]
    if not q1_indexes:
        diagnostic = [
            (line.page_index + 1, line.top, line.left, line.text)
            for line in candidates[:20]
        ]
        raise ValueError(f"Could not locate the first question marker: {diagnostic}")
    candidates = candidates[q1_indexes[0] :]
    if len(candidates) < 100:
        sample = [(line.page_index + 1, line.top, line.text) for line in candidates]
        raise ValueError(
            f"Only {len(candidates)} question-shaped lines were detected. "
            f"Candidates: {json.dumps(sample, ensure_ascii=False)}"
        )

    expected_count = 100
    candidate_count = len(candidates)
    infinity = float("inf")
    costs = [[infinity] * (candidate_count + 1) for _ in range(expected_count + 1)]
    parents: list[list[tuple[int, int, bool] | None]] = [
        [None] * (candidate_count + 1) for _ in range(expected_count + 1)
    ]
    costs[0][0] = 0.0

    for candidate_index in range(candidate_count):
        for assigned in range(expected_count + 1):
            current = costs[assigned][candidate_index]
            if current == infinity:
                continue
            skipped = current + 2.5
            if skipped < costs[assigned][candidate_index + 1]:
                costs[assigned][candidate_index + 1] = skipped
                parents[assigned][candidate_index + 1] = (assigned, candidate_index, False)
            if assigned < expected_count:
                assigned_cost = current + marker_assignment_cost(
                    candidates[candidate_index],
                    assigned + 1,
                )
                if assigned_cost < costs[assigned + 1][candidate_index + 1]:
                    costs[assigned + 1][candidate_index + 1] = assigned_cost
                    parents[assigned + 1][candidate_index + 1] = (
                        assigned,
                        candidate_index,
                        True,
                    )

    end_index = min(
        range(expected_count, candidate_count + 1),
        key=lambda index: costs[expected_count][index],
    )
    selected_lines: list[OcrLine] = []
    assigned = expected_count
    candidate_index = end_index
    while assigned or candidate_index:
        parent = parents[assigned][candidate_index]
        if parent is None:
            raise ValueError("Could not align the detected marker lines to questions 1-100.")
        previous_assigned, previous_index, used = parent
        if used:
            selected_lines.append(candidates[previous_index])
        assigned, candidate_index = previous_assigned, previous_index
    selected_lines.reverse()

    if len(selected_lines) != 100:
        raise ValueError(f"Expected 100 aligned markers; found {len(selected_lines)}.")
    print(
        f"Marker alignment: selected 100 of {len(candidates)} question-shaped lines "
        f"(cost {costs[expected_count][end_index]:.2f})."
    )
    return [
        QuestionMarker(number, line.page_index, line.top, line)
        for number, line in enumerate(selected_lines, start=1)
    ]


def row_runs(mask: np.ndarray, max_gap: int = 2) -> list[tuple[int, int]]:
    positions = np.flatnonzero(mask)
    if not len(positions):
        return []
    runs: list[tuple[int, int]] = []
    start = int(positions[0])
    previous = start
    for position_value in positions[1:]:
        position = int(position_value)
        if position - previous > max_gap + 1:
            runs.append((start, previous + 1))
            start = position
        previous = position
    runs.append((start, previous + 1))
    return runs


def normalized_glyph(mask: np.ndarray, size: int = 40) -> np.ndarray | None:
    rows, columns = np.where(mask)
    if not len(rows):
        return None
    top, bottom = int(rows.min()), int(rows.max()) + 1
    left, right = int(columns.min()), int(columns.max()) + 1
    if bottom - top < 18 or right - left < 15:
        return None
    glyph = Image.fromarray((~mask[top:bottom, left:right] * 255).astype(np.uint8), mode="L")
    glyph = ImageOps.pad(glyph, (size, size), color=255, method=Image.Resampling.NEAREST)
    return np.asarray(glyph) < 128


def glyph_similarity(first: np.ndarray, second: np.ndarray) -> float:
    union = np.logical_or(first, second).sum()
    if not union:
        return 0.0
    return float(np.logical_and(first, second).sum() / union)


def visual_marker_candidates(
    page_paths: list[Path],
    template: np.ndarray,
) -> list[tuple[float, int, int]]:
    candidates: list[tuple[float, int, int]] = []
    for page_index, page_path in enumerate(page_paths):
        with Image.open(page_path) as source:
            grayscale = np.asarray(source.convert("L"))
        band = grayscale[:, 145:190]
        dark = band < 175
        for top, bottom in row_runs(dark.sum(axis=1) >= 2):
            height = bottom - top
            if not 20 <= height <= 48:
                continue
            glyph = normalized_glyph(dark[top:bottom, :])
            if glyph is None:
                continue
            candidates.append((glyph_similarity(template, glyph), page_index, top))
    return candidates


def find_visual_question_markers(
    page_paths: list[Path],
    marker_lines_by_page: list[list[OcrLine]],
    category_ranges: list[CategoryRange],
) -> list[QuestionMarker]:
    first_header = next((item for item in category_ranges if item.start == 1), None)
    if first_header is not None and first_header.page_index >= 0:
        q1_lines = [
            line
            for line in marker_lines_by_page[first_header.page_index]
            if line.top > first_header.top + 60 and line.left < 205 and len(line.text.strip()) >= 4
        ]
    else:
        q1_lines = [
            line
            for lines in marker_lines_by_page
            for line in lines
            if question_number(line) == 1 and "から問" not in line.compact
        ]
    if not q1_lines:
        raise ValueError("Could not locate question 1 for the visual marker template.")
    q1_line = min(q1_lines, key=lambda line: (line.page_index, line.top))

    with Image.open(page_paths[q1_line.page_index]) as source:
        grayscale = np.asarray(source.convert("L"))
    dark = grayscale[:, 145:190] < 175
    nearby_runs = [
        (top, bottom)
        for top, bottom in row_runs(dark.sum(axis=1) >= 2)
        if abs(top - q1_line.top) <= 20 and 20 <= bottom - top <= 48
    ]
    if not nearby_runs:
        raise ValueError("Could not isolate the question marker glyph for question 1.")
    template_run = min(nearby_runs, key=lambda run: abs(run[0] - q1_line.top))
    template = normalized_glyph(dark[template_run[0] : template_run[1], :])
    if template is None:
        raise ValueError("The question marker template was empty.")

    header_positions = [
        (item.page_index, item.top)
        for item in category_ranges
        if item.page_index >= 0
    ]
    raw_candidates = [
        item
        for item in visual_marker_candidates(page_paths, template)
        if item[0] >= 0.08
        and not any(
            item[1] == page_index and abs(item[2] - top) <= 55
            for page_index, top in header_positions
        )
    ]
    raw_candidates.sort(key=lambda item: (item[1], item[2]))
    clustered: list[tuple[float, int, int]] = []
    group: list[tuple[float, int, int]] = []
    for candidate in raw_candidates:
        if group and (
            candidate[1] != group[-1][1] or candidate[2] - group[-1][2] >= 85
        ):
            clustered.append(max(group, key=lambda item: item[0]))
            group = []
        group.append(candidate)
    if group:
        clustered.append(max(group, key=lambda item: item[0]))

    visual_lines_by_page: list[list[OcrLine]] = [[] for _ in page_paths]
    score_by_position: dict[tuple[int, int], float] = {}
    for score, page_index, top in clustered:
        nearby = [
            line
            for line in marker_lines_by_page[page_index]
            if abs(line.top - top) <= 28
        ]
        nearest = min(nearby, key=lambda line: abs(line.top - top)) if nearby else None
        text = nearest.text if nearest is not None else "visual marker"
        if page_index == q1_line.page_index and abs(top - template_run[0]) <= 28:
            text = "問 1 official"
        line = OcrLine(page_index, top, top + 40, 150, text)
        visual_lines_by_page[page_index].append(line)
        score_by_position[(page_index, top)] = score

    selected = find_question_markers(visual_lines_by_page, category_ranges)
    for previous, current in zip(selected, selected[1:], strict=False):
        if previous.page_index == current.page_index and current.top - previous.top < 85:
            raise ValueError(
                f"Visual markers for questions {previous.number} and {current.number} "
                f"are too close: page {current.page_index + 1}, {previous.top}-{current.top}."
            )
    weakest_selected = min(
        score_by_position[(marker.page_index, marker.top)] for marker in selected
    )
    print(
        f"Visual marker matching: aligned 100 of {len(clustered)} candidates "
        f"(weakest selected score {weakest_selected:.3f})."
    )
    return selected


def find_category_ranges(lines_by_page: list[list[OcrLine]], year: int) -> list[CategoryRange]:
    detected: list[CategoryRange] = []
    for lines in lines_by_page:
        for line in lines:
            compact = line.compact.replace("間", "問")
            match = re.search(
                r"問([0-9]{1,3})から問([0-9]{1,3}).*?(ストラテジ|マネジメント|テクノロジ)",
                compact,
            )
            if not match:
                continue
            detected.append(
                CategoryRange(
                    start=int(match.group(1)),
                    end=int(match.group(2)),
                    code=CATEGORY_CODES[match.group(3)],
                    page_index=line.page_index,
                    top=line.top,
                ),
            )

    unique = {(item.start, item.end, item.code): item for item in detected}
    ranges = sorted(unique.values(), key=lambda item: item.start)
    expected = FALLBACK_CATEGORY_RANGES[year]
    detected_values = tuple((item.start, item.end, item.code) for item in ranges)
    if detected_values != expected:
        print(
            f"{year}: category headers were not fully recognized; using verified ranges {expected}. "
            f"OCR detected {detected_values or 'none'}.",
            file=sys.stderr,
        )
        detected_by_start = {item.start: item for item in ranges}
        ranges = [
            CategoryRange(
                start,
                end,
                code,
                detected_by_start[start].page_index if start in detected_by_start else -1,
                detected_by_start[start].top if start in detected_by_start else -1,
            )
            for start, end, code in expected
        ]

    covered = [number for item in ranges for number in range(item.start, item.end + 1)]
    if covered != list(range(1, 101)):
        raise ValueError(f"Category ranges do not cover questions 1-100 for {year}: {ranges}")
    return ranges


def category_for(number: int, ranges: list[CategoryRange]) -> str:
    for item in ranges:
        if item.start <= number <= item.end:
            return item.code
    raise ValueError(f"Question {number} is outside the category ranges.")


def extract_answers(answer_pdf: Path) -> list[str]:
    import pdfplumber

    with pdfplumber.open(answer_pdf) as document:
        text = "\n".join(page.extract_text() or "" for page in document.pages)
    pairs = re.findall(r"問\s*([0-9]{1,3})\s*([アイウエ])", text)
    answers_by_number = {int(number): answer for number, answer in pairs}
    if sorted(answers_by_number) != list(range(1, 101)):
        raise ValueError(
            f"Expected answer keys for questions 1-100 in {answer_pdf.name}; "
            f"found {len(answers_by_number)}."
        )
    return [answers_by_number[number] for number in range(1, 101)]


def position_before(page_index: int, top: int, boundary_page: int, boundary_top: int) -> bool:
    return (page_index, top) < (boundary_page, boundary_top)


def boundary_for_marker(
    marker: QuestionMarker,
    category_ranges: list[CategoryRange],
) -> tuple[int, int]:
    matching_headers = [
        item
        for item in category_ranges
        if item.start == marker.number and item.page_index >= 0
        and position_before(item.page_index, item.top, marker.page_index, marker.top)
    ]
    if not matching_headers:
        return marker.page_index, marker.top
    header = max(matching_headers, key=lambda item: (item.page_index, item.top))
    return header.page_index, header.top


def crop_question(
    page_paths: list[Path],
    marker: QuestionMarker,
    end_page: int,
    end_top: int,
    output_path: Path,
) -> tuple[int, int]:
    pieces: list[Image.Image] = []
    for page_index in range(marker.page_index, end_page + 1):
        with Image.open(page_paths[page_index]) as source:
            image = source.convert("RGB")
        width, height = image.size
        top = max(0, marker.top - 12) if page_index == marker.page_index else 45
        bottom = min(height - 120, end_top - 12) if page_index == end_page else height - 120
        if bottom <= top:
            continue
        pieces.append(image.crop((0, top, width, bottom)))

    if not pieces:
        raise ValueError(f"Question {marker.number} produced an empty crop.")

    canvas_width = max(piece.width for piece in pieces)
    canvas_height = sum(piece.height for piece in pieces)
    combined = Image.new("RGB", (canvas_width, canvas_height), "white")
    y = 0
    for piece in pieces:
        combined.paste(piece, (0, y))
        y += piece.height

    grayscale = np.asarray(combined.convert("L"))
    dark = grayscale < 225
    row_ink = dark.sum(axis=1)
    content_rows = np.flatnonzero(
        (row_ink >= 15) & (row_ink < combined.width * 0.20)
    )
    content_columns = np.flatnonzero(dark.sum(axis=0) >= 5)
    for split_index in np.flatnonzero(np.diff(content_rows) > 250):
        if len(content_rows) - split_index - 1 <= 10:
            content_rows = content_rows[: split_index + 1]
            break
    if not len(content_rows) or not len(content_columns):
        raise ValueError(f"Question {marker.number} crop did not contain visible content.")
    left = int(content_columns[0])
    right = int(content_columns[-1]) + 1
    top = int(content_rows[0])
    bottom = int(content_rows[-1]) + 1
    margin = 18
    cropped = combined.crop(
        (
            max(0, left - margin),
            max(0, top - margin),
            min(combined.width, right + margin),
            min(combined.height, bottom + margin),
        ),
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cropped.save(output_path, format="WEBP", quality=86, method=6)
    return cropped.size


def image_question_reference(year: int, question_no: int) -> str:
    if type(year) is not int or year not in range(2021, 2027):
        raise ValueError("Unsupported IPA year")
    if type(question_no) is not int or question_no not in range(1, 101):
        raise ValueError("Invalid IPA question number")
    return f"{year}年度 ITパスポート試験 公開問題 問{question_no}（原題画像を参照）"


def build_year(config: YearConfig, args: argparse.Namespace) -> list[dict[str, object]]:
    question_pdf = args.pdf_dir / f"{config.stem}_ip_qs.pdf"
    answer_pdf = args.pdf_dir / f"{config.stem}_ip_ans.pdf"
    year_work_dir = args.work_dir / str(config.year)
    page_paths = extract_page_images(question_pdf, year_work_dir / "pages")
    tsv_paths = ocr_pages(
        page_paths,
        year_work_dir,
        args.tesseract,
        args.tessdata,
        args.workers,
    )
    lines_by_page = [
        parse_tsv_lines(tsv_path, page_index)
        for page_index, tsv_path in enumerate(tsv_paths)
    ]
    marker_paths = build_marker_strips(page_paths, year_work_dir / "marker-pages")
    marker_tsv_paths = ocr_pages(
        marker_paths,
        year_work_dir / "markers",
        args.tesseract,
        args.tessdata,
        args.workers,
    )
    marker_lines_by_page = [
        scale_marker_lines(parse_tsv_lines(tsv_path, page_index))
        for page_index, tsv_path in enumerate(marker_tsv_paths)
    ]
    category_ranges = find_category_ranges(lines_by_page, config.year)
    markers = find_visual_question_markers(page_paths, marker_lines_by_page, category_ranges)
    answers = extract_answers(answer_pdf)
    page_heights: list[int] = []
    for page_path in page_paths:
        with Image.open(page_path) as image:
            page_heights.append(image.height)

    records: list[dict[str, object]] = []
    for index, marker in enumerate(markers):
        if index + 1 < len(markers):
            next_marker = markers[index + 1]
            end_page, end_top = boundary_for_marker(next_marker, category_ranges)
        else:
            end_page = marker.page_index
            end_top = page_heights[end_page] - 120

        image_path = args.image_dir / str(config.year) / f"q{marker.number:03}.webp"
        width, height = crop_question(page_paths, marker, end_page, end_top, image_path)
        if width < 300 or height < 80:
            raise ValueError(
                f"Question {marker.number} image is too small after cropping: {width}x{height}.",
            )

        answer = answers[marker.number - 1]
        question_text = image_question_reference(config.year, marker.number)
        records.append(
            {
                "sourceKey": f"ipa-it-passport-{config.year}-{marker.number:03}",
                "examCode": "it_passport",
                "categoryCode": category_for(marker.number, category_ranges),
                "sourceYear": config.year,
                "sourceSeason": "公開問題",
                "questionNo": marker.number,
                "questionText": question_text,
                "imagePath": f"/kakomon/img/ipa/{config.year}/q{marker.number:03}.webp",
                "explanation": None,
                "sourceName": "独立行政法人情報処理推進機構（IPA）",
                "sourceUrl": SOURCE_URL,
                "sourceEra": config.era_name,
                "displayMode": "official_scan",
                "choices": [
                    {
                        "label": label,
                        "text": f"選択肢{label}（原題画像を参照）",
                        "isCorrect": label == answer,
                        "sortOrder": choice_index + 1,
                    }
                    for choice_index, label in enumerate(LABELS)
                ],
            },
        )

    validate_year(config.year, records, args.image_dir)
    print(f"{config.year}: generated and validated {len(records)} questions.")
    return records


def rebuild_from_existing_crops(args: argparse.Namespace) -> list[dict[str, object]]:
    source_records = json.loads(args.output.read_text(encoding="utf-8"))
    if not isinstance(source_records, list) or len(source_records) != 600:
        raise ValueError(
            f"Expected an existing 600-question dataset at {args.output}; "
            f"found {len(source_records) if isinstance(source_records, list) else 'invalid JSON'}.",
        )

    def rebuild(record: dict[str, object]) -> dict[str, object]:
        year = int(record["sourceYear"])
        question_no = int(record["questionNo"])
        image_path = args.image_dir / str(year) / f"q{question_no:03}.webp"
        if not image_path.is_file():
            raise FileNotFoundError(f"Question image was not found: {image_path}")

        old_choices = record.get("choices")
        if not isinstance(old_choices, list) or len(old_choices) != 4:
            raise ValueError(f"{record.get('sourceKey')} does not have four source choices.")

        return {
            **record,
            "questionText": image_question_reference(year, question_no),
            "imagePath": f"/kakomon/img/ipa/{year}/q{question_no:03}.webp",
            "displayMode": "official_scan",
            "choices": [
                {
                    **choice,
                    "text": f"選択肢{choice['label']}（原題画像を参照）",
                }
                for choice in old_choices
            ],
        }

    rebuilt: dict[int, dict[str, object]] = {}
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = {
            executor.submit(rebuild, record): index
            for index, record in enumerate(source_records)
        }
        for completed, future in enumerate(as_completed(futures), start=1):
            index = futures[future]
            rebuilt[index] = future.result()
            if completed % 50 == 0:
                print(f"Rebuilt image mode for {completed}/600 questions.")

    records = [rebuilt[index] for index in range(len(source_records))]
    for config in YEARS:
        validate_year(
            config.year,
            [record for record in records if record["sourceYear"] == config.year],
            args.image_dir,
        )
    return records


def validate_year(year: int, records: list[dict[str, object]], image_dir: Path) -> None:
    if len(records) != 100:
        raise ValueError(f"Expected 100 questions for {year}; found {len(records)}.")
    if [record["questionNo"] for record in records] != list(range(1, 101)):
        raise ValueError(f"Question numbers for {year} are not sequential.")

    for record in records:
        choices = record["choices"]
        if not isinstance(choices, list) or len(choices) != 4:
            raise ValueError(f"{record['sourceKey']} does not have four choices.")
        if sum(bool(choice["isCorrect"]) for choice in choices) != 1:
            raise ValueError(f"{record['sourceKey']} does not have exactly one correct answer.")
        question_no = int(record["questionNo"])
        if record["questionText"] != image_question_reference(year, question_no):
            raise ValueError(f"{record['sourceKey']} must contain an image reference, not OCR text.")
        expected_image_path = f"/kakomon/img/ipa/{year}/q{question_no:03}.webp"
        if record["imagePath"] != expected_image_path:
            raise ValueError(f"{record['sourceKey']} has an invalid question image path.")
        if not (image_dir / str(year) / f"q{question_no:03}.webp").is_file():
            raise ValueError(f"{record['sourceKey']} question image is missing.")
        if record.get("displayMode") != "official_scan":
            raise ValueError(f"{record['sourceKey']} must use official scan display.")
        for choice in choices:
            expected_text = f"選択肢{choice['label']}（原題画像を参照）"
            if choice["text"] != expected_text:
                raise ValueError(f"{record['sourceKey']} has an invalid image choice label.")


def validate_all(records: list[dict[str, object]]) -> None:
    if len(records) != 600:
        raise ValueError(f"Expected 600 official IPA questions; found {len(records)}.")
    source_keys = [str(record["sourceKey"]) for record in records]
    if len(source_keys) != len(set(source_keys)):
        raise ValueError("Duplicate source keys were generated.")


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    with path.open("w", encoding="utf-8", newline="\r\n") as handle:
        handle.write(serialized)


def main() -> None:
    args = parse_args()
    requested = set(args.years)
    configs = [config for config in YEARS if config.year in requested]
    if {config.year for config in configs} != requested:
        unknown = sorted(requested - {config.year for config in configs})
        raise ValueError(f"Unsupported years: {unknown}")
    if requested != {config.year for config in YEARS}:
        raise ValueError("The production dataset must include every year from 2021 through 2026.")

    ensure_inputs(args, configs, require_pdfs=not args.reuse_existing_crops)
    if args.reuse_existing_crops:
        records = rebuild_from_existing_crops(args)
    else:
        records = [record for config in configs for record in build_year(config, args)]
    validate_all(records)
    write_json(args.output, records)
    print(f"Generated {len(records)} official IPA questions at {args.output}")


if __name__ == "__main__":
    main()
