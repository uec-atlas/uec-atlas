import pdfplumber
import pandas as pd
import numpy as np
import re
import cv2
import io
from functools import cache
from pypdf import PdfReader, PdfWriter
from typing import Optional, Any
import mojimoji
import MeCab

RE_JAPANESE = re.compile(r"[\u3040-\u30ff\u4e00-\u9faf]")
TAGGER = MeCab.Tagger()


@cache
def clean_text(text: str) -> str:
    if not text:
        return ""
    text = mojimoji.zen_to_han(text, kana=False)
    # 日本語文字間の不要なスペースを削除
    text = re.sub(r"([^\x00-\x7f])\s+", r"\1", text)
    text = re.sub(r"\s+([^\x00-\x7f])", r"\1", text)
    return text.strip()


@cache
def get_naturalness_score(text: str) -> float:
    if not text or not text.strip() or not RE_JAPANESE.search(text):
        return 0
    node = TAGGER.parseToNode(clean_text(text))
    last_cost = 0
    while node:
        if node.surface:
            last_cost = node.cost
        node = node.next
    return -last_cost


def cluster_coords(coords: list[float], threshold: float = 2.0) -> list[float]:
    if not coords:
        return []
    vals = np.sort(np.unique(coords))
    diffs = np.diff(vals)
    splits = np.where(diffs > threshold)[0] + 1
    return [float(np.mean(c)) for c in np.split(vals, splits)]


def get_visual_grid_segments(page, dpi, debug_path: str = None) -> tuple[list[dict], list[dict]]:
    pix = page.to_image(resolution=dpi).original
    img_color = cv2.cvtColor(np.array(pix), cv2.COLOR_RGB2BGR)
    gray = cv2.cvtColor(img_color, cv2.COLOR_BGR2GRAY)
    bw = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2)

    k_size = dpi // 8
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (k_size, 1))
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, k_size))
    h_mask = cv2.morphologyEx(bw, cv2.MORPH_OPEN, h_kernel)
    v_mask = cv2.morphologyEx(bw, cv2.MORPH_OPEN, v_kernel)

    scale = 72.0 / dpi
    contours_h, _ = cv2.findContours(
        h_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours_v, _ = cv2.findContours(
        v_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    min_len_pt = 10.0
    raw_h = [{"x0": x*scale, "x1": (x+w)*scale, "top": y*scale, "bottom": (y+h)*scale}
             for x, y, w, h in [cv2.boundingRect(c) for c in contours_h] if w*scale >= min_len_pt]
    raw_v = [{"x0": x*scale, "x1": (x+w)*scale, "top": y*scale, "bottom": (y+h)*scale}
             for x, y, w, h in [cv2.boundingRect(c) for c in contours_v] if h*scale >= min_len_pt]

    if not raw_h or not raw_v:
        return [], []

    y_grid = cluster_coords([s["top"] for s in raw_h] +
                            [s["bottom"] for s in raw_h], threshold=2.0)
    x_grid = cluster_coords([s["x0"] for s in raw_v] + [s["x1"]
                            for s in raw_v], threshold=2.0)

    def snap(v, grid): return min(grid, key=lambda g: abs(g - v))

    final_h = []
    for s in raw_h:
        y, x0, x1 = snap(s["top"], y_grid), snap(
            s["x0"], x_grid), snap(s["x1"], x_grid)
        if x1 > x0:
            final_h.append({"object_type": "line", "orientation": "h",
                           "x0": x0, "x1": x1, "top": y, "bottom": y, "width": x1-x0})

    final_v = []
    for s in raw_v:
        x, y0, y1 = snap(s["x0"], x_grid), snap(
            s["top"], y_grid), snap(s["bottom"], y_grid)
        if y1 > y0:
            final_v.append({"object_type": "line", "orientation": "v",
                           "x0": x, "x1": x, "top": y0, "bottom": y1, "height": y1-y0})

    if debug_path:
        for s in final_h:
            cv2.line(img_color, (int(s["x0"]/scale), int(s["top"]/scale)),
                     (int(s["x1"]/scale), int(s["top"]/scale)), (255, 0, 0), 2)
        for s in final_v:
            cv2.line(img_color, (int(s["x0"]/scale), int(s["top"]/scale)),
                     (int(s["x0"]/scale), int(s["bottom"]/scale)), (0, 0, 255), 2)
        cv2.imwrite(debug_path, img_color)

    return final_h, final_v


class TableExtractor:
    def __init__(self, table_obj):
        self.table = table_obj
        self.page_chars = table_obj.page.chars
        self.avg_char_h = np.mean(
            [c["height"] for c in self.page_chars]) if self.page_chars else 10
        self.avg_char_w = np.mean(
            [c["width"] for c in self.page_chars]) if self.page_chars else 10

    def _extract_cell_text(self, bbox: tuple[float, float, float, float]) -> str:
        x0, y0, x1, y1 = bbox
        in_cell = [c for c in self.page_chars if
                   x0 - 1.0 <= (c["x0"] + c["x1"]) / 2 <= x1 + 1.0 and
                   y0 - 1.0 <= (c["top"] + c["bottom"]) / 2 <= y1 + 1.0]
        if not in_cell:
            return ""

        def build(mode, rev, th):
            p_attr, s_attr, p_end = (
                "top", "x0", "bottom") if mode == "h" else ("x0", "top", "x1")
            sorted_chars = sorted(in_cell, key=lambda c: (
                c[p_attr] + c[p_end]) / 2, reverse=rev)
            groups = []
            for c in sorted_chars:
                val = (c[p_attr] + c[p_end]) / 2
                if not groups or abs(val - np.mean([(x[p_attr] + x[p_end]) / 2 for x in groups[-1]])) > th:
                    groups.append([c])
                else:
                    groups[-1].append(c)
            return "\n".join(["".join([x["text"] for x in sorted(g, key=lambda x: x[s_attr])]) for g in groups])

        h_text = build("h", False, self.avg_char_h * 0.5)
        v_text = build("v", True, self.avg_char_w * 0.5)
        return clean_text(v_text if get_naturalness_score(v_text) > get_naturalness_score(h_text) else h_text)

    def to_dataframe(self) -> tuple[pd.DataFrame, list[float]]:
        cells = self.table.cells
        x_coords = [c[0] for c in cells] + [c[2] for c in cells]
        y_coords = [c[1] for c in cells] + [c[3] for c in cells]

        col_edges = cluster_coords(x_coords, threshold=2.0)
        row_edges = cluster_coords(y_coords, threshold=2.0)

        n_rows = max(0, len(row_edges) - 1)
        n_cols = max(0, len(col_edges) - 1)
        grid = [["" for _ in range(n_cols)] for _ in range(n_rows)]

        cell_cache = {}
        for r in range(n_rows):
            for c in range(n_cols):
                mid_x = (col_edges[c] + col_edges[c+1]) / 2
                mid_y = (row_edges[r] + row_edges[r+1]) / 2

                matched_cell = None
                for cell in cells:
                    cx0, ctop, cx1, cbot = cell
                    if cx0 <= mid_x <= cx1 and ctop <= mid_y <= cbot:
                        matched_cell = cell
                        break

                if matched_cell:
                    cell_id = tuple(round(v, 2) for v in matched_cell)
                    if cell_id not in cell_cache:
                        cell_cache[cell_id] = self._extract_cell_text(
                            matched_cell)
                    grid[r][c] = cell_cache[cell_id]

        return pd.DataFrame(grid), col_edges


def estimate_header_boundary(df: pd.DataFrame) -> int:
    """科目番号パターンとセル結合の痕跡から、データ行の開始位置（ヘッダー行数）を特定する"""

    def _norm(v: Any) -> str:
        if v is None:
            return ""
        if isinstance(v, float) and np.isnan(v):
            return ""
        s = str(v).strip()
        return "" if s.lower() == "nan" else s

    inspect_rows = min(5, len(df))

    if inspect_rows >= 2 and len(df.columns) > 0:
        header_candidate = 0
        for c in range(len(df.columns)):
            top_val = _norm(df.iat[0, c])
            if not top_val:
                continue

            span = 1
            while span < inspect_rows and _norm(df.iat[span, c]) == top_val:
                span += 1

            if 1 < span:
                header_candidate = max(header_candidate, span)
        if 0 < header_candidate < inspect_rows:
            return header_candidate

    # 1行目がすべて空でない場合は、ヘッダー行とみなす
    if all(_norm(df.iat[0, c]) for c in range(len(df.columns))):
        return 1

    return 0


def finalize_header(df: pd.DataFrame, hb: int) -> pd.DataFrame:
    """複数行の見出しを結合し、重複ワードをクレンジングする"""
    if df.empty:
        return df

    # ヘッダーが0行（続きの表など）の場合、ダミーの列名をつけて全行をデータとして扱う
    if hb <= 0:
        res_df = df.copy()
        res_df.columns = [f"Col_{c}" for c in range(len(df.columns))]
        return res_df

    header_rows = df.iloc[:hb]
    new_cols = []
    for c in range(len(df.columns)):
        labels = []
        for val in header_rows.iloc[:, c]:
            text = str(val).strip()
            # 「科目 科目」のように同じ単語が続く場合は1つにまとめる
            if text and (not labels or text != labels[-1]):
                labels.append(text)
        new_cols.append(clean_text(" ".join(labels)) if labels else f"Col_{c}")

    res_df = df.iloc[hb:].reset_index(drop=True)
    res_df.columns = new_cols
    return res_df


def estimate_table_title(page, last_y: float, current_table_top: float) -> str:
    try:
        search_top = max(last_y, current_table_top - 60)
        gap_bbox = (0, search_top, page.width, current_table_top)
        lines = page.within_bbox(gap_bbox).extract_text_lines()
        valid = [l['text'].strip() for l in lines if len(
            l['text'].strip()) > 3 and not l['text'].strip().isdigit()]
        return clean_text(valid[-1]) if valid else ""
    except:
        return ""


def merge_tables_structural(tables: list[dict]) -> list[dict]:
    merged = [tables[0]]
    for nxt in tables[1:]:
        curr = merged[-1]

        # 列の境界線が近いか（列数が同じで、座標のズレが許容範囲内か）
        is_same_structure = len(curr["col_edges"]) == len(nxt["col_edges"]) and \
            np.allclose(curr["col_edges"], nxt["col_edges"], atol=15)

        cols_curr: list[str] = [c.replace(" ", "").split(".")[0]
                                for c in curr["df"].columns]
        cols_nxt: list[str] = [c.replace(" ", "").split(".")[0]
                               for c in nxt["df"].columns]

        is_same_columns = cols_curr == cols_nxt

        should_merge = False
        if is_same_columns:
            # 列名が完全一致している場合は結合対象
            should_merge = True
        if is_same_structure and len(cols_curr) == len(cols_nxt) and not any(c.startswith("(cid:") for c in [*cols_curr, *cols_nxt]):
            # 列の構造が同じで、列数も同じ場合で、cidが含まれていない（列名が正しく抽出されている）場合は結合対象
            should_merge = True

        if should_merge:
            # 次の表の列名を前の表に合わせて結合
            nxt_df = nxt["df"].copy()
            nxt_df.columns = curr["df"].columns
            curr["df"] = pd.concat([curr["df"], nxt_df], ignore_index=True)
            if not curr["title"] and nxt["title"]:
                curr["title"] = nxt["title"]
        else:
            merged.append(nxt)
    return merged


def merge_tables(tables: list[pd.DataFrame]) -> list[pd.DataFrame]:
    merged = [tables[0]]
    for nxt in tables[1:]:
        curr = merged[-1]

        cols_curr = [c.replace(" ", "").split(".")[0]
                     for c in curr.columns]
        cols_nxt = [c.replace(" ", "").split(".")[0]
                    for c in nxt.columns]

        is_same_columns = cols_curr == cols_nxt

        if is_same_columns:
            nxt_df = nxt.copy()
            nxt_df.columns = curr.columns
            attrs = curr.attrs.copy()
            curr = pd.concat([curr, nxt_df], ignore_index=True)
            curr.attrs = attrs
            if not curr.attrs.get("title") and nxt.attrs.get("title"):
                curr.attrs["title"] = nxt.attrs.get("title")
            merged[-1] = curr
        else:
            merged.append(nxt)
    return merged


def extract_tables(pdf_path: str, pages: Optional[list[int]] = None, rotate_pages: Optional[dict[int, int]] = None) -> list[pd.DataFrame]:
    raw_results = []
    reader = PdfReader(pdf_path)
    writer = PdfWriter()

    for page in reader.pages:
        if rotate_pages and page.page_number + 1 in rotate_pages:
            page.rotate(rotate_pages[page.page_number + 1])
        writer.add_page(page)

    pdf_bytes = io.BytesIO()
    writer.write(pdf_bytes)
    pdf_bytes.seek(0)

    with pdfplumber.open(pdf_bytes) as pdf:
        target_pages = [pdf.pages[p-1] for p in pages] if pages else pdf.pages
        for page in target_pages:
            # debug_img = f"debug_lines_p{page.page_number}.png"
            debug_img = None
            h_segs, v_segs = get_visual_grid_segments(
                page, 400, debug_path=debug_img)

            if len(h_segs) < 2 or len(v_segs) < 2:
                continue

            settings = {
                "vertical_strategy": "explicit", "horizontal_strategy": "explicit",
                "explicit_vertical_lines": v_segs, "explicit_horizontal_lines": h_segs,
                "snap_tolerance": 5, "join_tolerance": 5
            }

            found = page.find_tables(table_settings=settings)
            last_y = 0
            for t in sorted(found, key=lambda x: x.bbox[1]):
                if (t.bbox[2]-t.bbox[0]) * (t.bbox[3]-t.bbox[1]) < 1000:
                    continue

                title = estimate_table_title(page, last_y, t.bbox[1])
                df, col_edges = TableExtractor(t).to_dataframe()

                hb = estimate_header_boundary(df)
                final_df = finalize_header(df, hb)

                raw_results.append({
                    "title": title,
                    "df": final_df,
                    "col_edges": col_edges,
                    "hb": hb,
                    "page": page.page_number
                })
                last_y = t.bbox[3]

    if not raw_results:
        return []

    # -----------------------------------------------------
    # 同一構造の表を結合する処理 (Merge Fragments)
    # -----------------------------------------------------

    final_dfs = []
    for m in merge_tables_structural(raw_results):
        df = m["df"]
        df.attrs["title"] = m["title"]
        df.attrs["page"] = m.get("page")
        final_dfs.append(df)

    return final_dfs


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_path")
    parser.add_argument("--pages")
    args = parser.parse_args()
    pg_list = [int(x) for x in args.pages.split(",")] if args.pages else None

    tables = extract_tables(args.pdf_path, pages=pg_list)
    for i, df in enumerate(tables):
        print(f"\n### Table {i+1}: {df.attrs.get('title', 'Untitled')}\n")
        print(df.to_markdown(index=False))
