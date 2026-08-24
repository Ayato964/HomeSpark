"""Per-user and system-wide Weather forecast tools using Open-Meteo API.

Provides real-time, multi-day, and weekly weather forecasts (conditions, temperatures, precipitation probability).
Supports flexible date expressions ("today", "tomorrow", "1週間後", "今週末", "weekly", specific dates).
No external API key is required.
"""
from __future__ import annotations

import datetime
import json
import re
import urllib.parse
import urllib.request
import zoneinfo
from typing import Any, Dict, List, Optional

from .tool import Tool

CITY_COORDINATES: Dict[str, tuple[float, float, str]] = {
    "東京": (35.6895, 139.6917, "東京都"),
    "新宿": (35.6895, 139.6917, "東京都新宿区"),
    "渋谷": (35.6580, 139.7016, "東京都渋谷区"),
    "横浜": (35.4437, 139.6380, "神奈川県横浜市"),
    "川崎": (35.5308, 139.7029, "神奈川県川崎市"),
    "千葉": (35.6073, 140.1063, "千葉県千葉市"),
    "さいたま": (35.8617, 139.6455, "埼玉県さいたま市"),
    "埼玉": (35.8617, 139.6455, "埼玉県"),
    "大阪": (34.6937, 135.5023, "大阪府大阪市"),
    "名古屋": (35.1815, 136.9066, "愛知県名古屋市"),
    "愛知": (35.1815, 136.9066, "愛知県"),
    "京都": (35.0116, 135.7681, "京都府京都市"),
    "神戸": (34.6901, 135.1955, "兵庫県神戸市"),
    "兵庫": (34.6901, 135.1955, "兵庫県"),
    "福岡": (33.5904, 130.4017, "福岡県福岡市"),
    "博多": (33.5904, 130.4017, "福岡県福岡市博多区"),
    "札幌": (43.0618, 141.3545, "北海道札幌市"),
    "北海道": (43.0618, 141.3545, "北海道札幌市"),
    "仙台": (38.2682, 140.8694, "宮城県仙台市"),
    "宮城": (38.2682, 140.8694, "宮城県"),
    "広島": (34.3853, 132.4553, "広島県広島市"),
    "那覇": (26.2124, 127.6809, "沖縄県那覇市"),
    "沖縄": (26.2124, 127.6809, "沖縄県那覇市"),
    "金沢": (36.5613, 136.6562, "石川県金沢市"),
    "石川": (36.5613, 136.6562, "石川県"),
    "静岡": (34.9756, 138.3828, "静岡県静岡市"),
    "新潟": (37.9162, 139.0364, "新潟県新潟市"),
    "岡山": (34.6551, 133.9195, "岡山県岡山市"),
    "熊本": (32.8032, 130.7079, "熊本県熊本市"),
    "鹿児島": (31.5966, 130.5571, "鹿児島県鹿児島市"),
}

WMO_WEATHER_MAP: Dict[int, tuple[str, str]] = {
    0: ("☀️ 快晴", "一日を通してすっきりと晴れ渡る見込みです。"),
    1: ("🌤️ 晴れ", "概ね晴れて過ごしやすい一日となるでしょう。"),
    2: ("⛅ 晴れ時々曇り", "雲が広がる時間もありますが、日差しも届きます。"),
    3: ("☁️ 曇り", "雲が広がりやすいスッキリしない天気となりそうです。"),
    45: ("🌫️ 霧", "視界が悪くなりやすいためご注意ください。"),
    48: ("🌫️ 霧氷", "冷え込みによる霧にご注意ください。"),
    51: ("🌦️ 軽い霧雨", "時折パラパラと小雨が降る可能性があります。"),
    53: ("🌦️ 霧雨", "傘があると安心です。"),
    55: ("🌦️ 濃い霧雨", "傘をご持参ください。"),
    61: ("🌧️ 弱い雨", "傘を忘れずにお持ちください。"),
    63: ("🌧️ 雨", "しっかりとした雨となります。傘が必要です。"),
    65: ("🌧️ 強い雨", "本降りの雨となるため、大きめの傘やレイングッズがおすすめです。"),
    71: ("❄️ 軽い雪", "雪がちらつく可能性があります。防寒対策を。"),
    73: ("❄️ 雪", "雪が降る見込みです。足元にご注意ください。"),
    75: ("❄️ 強い雪", "積雪や路面の凍結にご注意ください。"),
    77: ("❄️ 雪粒", "冷え込みが厳しくなります。"),
    80: ("🌦️ 弱いにわか雨", "急な雨に備えて折りたたみ傘があると安心です。"),
    81: ("🌧️ にわか雨", "通り雨の可能性があります。"),
    82: ("🌧️ 激しいにわか雨", "急な強い雨や雷にご注意ください。"),
    85: ("🌨️ 弱いにわか雪", "一時的な降雪の可能性があります。"),
    86: ("🌨️ 強いにわか雪", "降雪による視界不良にご注意ください。"),
    95: ("⛈️ 雷雨", "雷を伴った強い雨にご注意ください。"),
    96: ("⛈️ 雹を伴う雷雨", "急な雷雨や突風にご注意ください。"),
    99: ("⛈️ 激しい雹を伴う雷雨", "激しい雷雨や荒天にご注意ください。"),
}

WEEKDAY_JP = ["月", "火", "水", "木", "金", "土", "日"]


def _resolve_coordinates(location: str) -> tuple[float, float, str]:
    clean_loc = location.strip().replace("都", "").replace("府", "").replace("県", "").replace("市", "")
    for key, (lat, lon, full_name) in CITY_COORDINATES.items():
        if key in clean_loc or clean_loc in key:
            return lat, lon, full_name

    try:
        encoded = urllib.parse.quote(location)
        geo_url = f"https://geocoding-api.open-meteo.com/v1/search?name={encoded}&count=1&language=ja&format=json"
        req = urllib.request.Request(geo_url, headers={"User-Agent": "SalesSpark/1.0"})
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            results = data.get("results")
            if results and len(results) > 0:
                item = results[0]
                lat = float(item["latitude"])
                lon = float(item["longitude"])
                name = item.get("name", location)
                admin1 = item.get("admin1", "")
                full_name = f"{admin1} {name}".strip() or location
                return lat, lon, full_name
    except Exception:
        pass

    return 35.6895, 139.6917, "東京都 (デフォルト)"


def get_weather_forecast(
    location: str = "東京",
    date_target: str = "tomorrow",
    days: int = 1,
) -> str:
    """指定した地域・都市の天気予報（今日、明日、1週間後、今週末、または週間天気など）を取得します。

    Parameters
    ----------
    location : str
        地名・都市名（例: "東京", "大阪", "横浜", "名古屋", "福岡", "札幌", "京都", "沖縄" など）。デフォルトは"東京"。
    date_target : str
        予報対象日。"today"（今日）、"tomorrow"（明日）、"day_after_tomorrow"（明後日）、"1週間後"、"今週末"、"weekly"（週間天気）、または"YYYY-MM-DD"形式。デフォルトは"tomorrow"。
    days : int
        取得日数。1（単日）または 7（週間天気）。"weekly" や "1週間" の場合は自動で7日間になります。
    """
    try:
        lat, lon, place_name = _resolve_coordinates(location)
        jst = zoneinfo.ZoneInfo("Asia/Tokyo")
        now_jst = datetime.datetime.now(jst)
        today_date = now_jst.date()

        target_str = (date_target or "tomorrow").strip().lower()
        is_weekly = False

        # Parse relative or weekly targets
        if target_str in ("weekly", "week", "週間", "1週間", "一週間", "今週", "週間天気", "週間予報") or days >= 7:
            is_weekly = True
            target_date = today_date
            day_label = "週間予報（向こう7日間）"
        elif target_str in ("today", "今日", "きょう"):
            target_date = today_date
            day_label = "今日"
        elif target_str in ("tomorrow", "明日", "あした", "あす"):
            target_date = today_date + datetime.timedelta(days=1)
            day_label = "明日"
        elif target_str in ("day_after_tomorrow", "明後日", "あさって"):
            target_date = today_date + datetime.timedelta(days=2)
            day_label = "明後日"
        elif "週末" in target_str or "土曜" in target_str:
            # Next Saturday
            days_to_sat = (5 - today_date.weekday()) % 7
            if days_to_sat == 0:
                days_to_sat = 7
            target_date = today_date + datetime.timedelta(days=days_to_sat)
            day_label = f"今週末（{target_date.month}月{target_date.day}日 土曜日）"
        elif "日曜" in target_str:
            days_to_sun = (6 - today_date.weekday()) % 7
            if days_to_sun == 0:
                days_to_sun = 7
            target_date = today_date + datetime.timedelta(days=days_to_sun)
            day_label = f"今週末（{target_date.month}月{target_date.day}日 日曜日）"
        elif "週間後" in target_str or "週後" in target_str:
            m = re.search(r"(\d+|一|二|三|1|2|3)", target_str)
            num_weeks = 1
            if m:
                val = m.group(1)
                num_weeks = int(val) if val.isdigit() else {"一": 1, "二": 2, "三": 3}.get(val, 1)
            target_date = today_date + datetime.timedelta(days=num_weeks * 7)
            day_label = f"{num_weeks}週間後（{target_date.month}月{target_date.day}日）"
        elif "日後" in target_str:
            m = re.search(r"(\d+)", target_str)
            days_add = int(m.group(1)) if m else 1
            target_date = today_date + datetime.timedelta(days=days_add)
            day_label = f"{days_add}日後（{target_date.month}月{target_date.day}日）"
        else:
            # Try parsing YYYY-MM-DD or MM月DD日
            parsed = None
            try:
                parsed = datetime.date.fromisoformat(target_str)
            except ValueError:
                m = re.search(r"(\d+)月(\d+)日?", target_str)
                if m:
                    m_val, d_val = int(m.group(1)), int(m.group(2))
                    parsed = datetime.date(today_date.year, m_val, d_val)
                    if parsed < today_date:
                        parsed = datetime.date(today_date.year + 1, m_val, d_val)

            if parsed:
                target_date = parsed
                diff = (target_date - today_date).days
                if diff == 0:
                    day_label = "今日"
                elif diff == 1:
                    day_label = "明日"
                elif diff == 2:
                    day_label = "明後日"
                else:
                    day_label = f"{diff}日後（{target_date.month}月{target_date.day}日）"
            else:
                target_date = today_date + datetime.timedelta(days=1)
                day_label = "明日"

        # Fetch Open-Meteo Multi-day Forecast (up to 14 days)
        forecast_days = 7 if is_weekly else min(14, max(7, (target_date - today_date).days + 2))
        url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={lat}&longitude={lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days={forecast_days}&timezone=Asia%2FTokyo"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "SalesSpark/1.0"})
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        daily = data.get("daily", {})
        times = daily.get("time", [])
        weathercodes = daily.get("weathercode", [])
        temp_maxs = daily.get("temperature_2m_max", [])
        temp_mins = daily.get("temperature_2m_min", [])
        precip_probs = daily.get("precipitation_probability_max", [])

        # Return Weekly View if requested
        if is_weekly:
            lines = [f"【{place_name}の週間天気予報（7日間）】"]
            for i in range(min(7, len(times))):
                d_str = times[i]
                d_obj = datetime.date.fromisoformat(d_str)
                w_jp = WEEKDAY_JP[d_obj.weekday()]
                code = weathercodes[i] if i < len(weathercodes) else 1
                t_max = temp_maxs[i] if i < len(temp_maxs) else None
                t_min = temp_mins[i] if i < len(temp_mins) else None
                precip = precip_probs[i] if i < len(precip_probs) else None
                cond, _ = WMO_WEATHER_MAP.get(code, ("晴れ時々曇り", ""))
                
                t_str = f"最高 {t_max:.0f}℃ / 最低 {t_min:.0f}℃" if (t_max is not None and t_min is not None) else "--"
                p_str = f"降水 {precip}%" if precip is not None else ""
                rel_label = " (今日)" if i == 0 else (" (明日)" if i == 1 else "")
                lines.append(f"- {d_obj.month}/{d_obj.day}({w_jp}){rel_label}: {cond} | {t_str} | {p_str}")

            lines.append("アドバイス: 週を通しての気温変化や雨の日に備えて予定を調整してください。")
            return "\n".join(lines)

        # Single Day View
        target_iso = target_date.isoformat()
        if target_iso not in times:
            # Fallback to closest available date
            idx = min(len(times) - 1, max(0, (target_date - today_date).days))
        else:
            idx = times.index(target_iso)

        code = weathercodes[idx] if idx < len(weathercodes) else 1
        t_max = temp_maxs[idx] if idx < len(temp_maxs) else None
        t_min = temp_mins[idx] if idx < len(temp_mins) else None
        precip = precip_probs[idx] if idx < len(precip_probs) else None

        condition, advice = WMO_WEATHER_MAP.get(code, ("晴れ時々曇り", "過ごしやすい気候です。"))
        weekday_str = WEEKDAY_JP[target_date.weekday()]

        lines = [
            f"【{place_name}の天気予報】",
            f"対象日: {target_date.year}年{target_date.month}月{target_date.day}日({weekday_str})（{day_label}）",
            f"天気: {condition}",
            f"最高気温: {t_max:.1f}℃" if t_max is not None else "最高気温: --",
            f"最低気温: {t_min:.1f}℃" if t_min is not None else "最低気温: --",
            f"降水確率: {precip}%" if precip is not None else "降水確率: 0%",
            f"アドバイス: {advice}",
        ]
        return "\n".join(lines)

    except Exception as e:
        return f"[error] 天気情報の取得に失敗しました: {e}"


def build_weather_tools() -> List[Tool]:
    """Return weather forecast tools for ToolRegistry."""
    return [
        Tool(
            name="get_weather",
            description="指定した地域・都市の天気予報（今日・明日・明後日・今週末・1週間後・週間天気など）を取得します。ユーザーから「明日の天気は？」「1週間後の天気」「今週末雨降る？」「東京の週間天気教えて」などと尋ねられた際に使用してください。",
            parameters={
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "天気を知りたい地域名・都市名（例: '東京', '大阪', '横浜', '名古屋', '福岡', '札幌', '京都', '那覇' など）。指定がない場合は'東京'。",
                    },
                    "date_target": {
                        "type": "string",
                        "description": "予報対象日。'today'（今日）、'tomorrow'（明日）、'day_after_tomorrow'（明後日）、'1週間後'、'今週末'、'weekly'（週間天気）、または'YYYY-MM-DD'。デフォルトは'tomorrow'。",
                    },
                },
                "required": [],
                "additionalProperties": False,
            },
            func=get_weather_forecast,
        )
    ]
