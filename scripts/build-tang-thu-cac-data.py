#!/usr/bin/env python3
"""Build compact static data for the Tàng Thư Các page.

- Grammar is collected from every lesson JSON in assets/giaotrinhhsk/hsk1..hsk6.
- Duplicate grammar points are merged while preserving the richest explanation.
- Idioms reuse verified HSK6 vocabulary records and add a compact curated set.

Run from the project root:
    python3 scripts/build-tang-thu-cac-data.py
"""
from __future__ import annotations

import glob
import hashlib
import html
import json
import re
import unicodedata
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "data" / "tang-thu-cac"
OUT_DIR.mkdir(parents=True, exist_ok=True)

TAG_RE = re.compile(r"<[^>]+>")
CJK_RE = re.compile(r"[\u3400-\u9fff]")


def plain(value: Any) -> str:
    text = html.unescape(TAG_RE.sub("", str(value or "")))
    return re.sub(r"\s+", " ", text).strip()


def compact_key(value: str) -> str:
    value = plain(value).lower()
    value = value.replace("...", "……")
    value = re.sub(r"[\s‘’'\"“”《》〈〉（）()\[\]{}，,。.!！?？:：;；、/\\|+=—–-]", "", value)
    return value


def ascii_fold(value: str) -> str:
    value = unicodedata.normalize("NFD", value)
    return "".join(ch for ch in value if unicodedata.category(ch) != "Mn")


def derive_sort_label(title: str, item: dict[str, Any]) -> str:
    title = plain(title)
    parts = re.split(r"\s[-–—]\s", title, maxsplit=1)
    candidate = parts[1] if len(parts) > 1 else title
    candidate = re.sub(
        r"^(cách dùng|cấu trúc|phân biệt|mẫu câu|câu hỏi với|câu với|câu chữ|"
        r"diễn tả|biểu thị|dùng|nhấn mạnh|phó từ|liên từ|trợ từ|bổ ngữ)\s*[:：]?\s*",
        "",
        candidate,
        flags=re.I,
    )
    candidate = CJK_RE.sub(" ", candidate)
    candidate = re.sub(r"[…·/＋+（）()“”\"'：:，,。！？!?、=<>\[\]]", " ", candidate)
    candidate = re.sub(r"\s+", " ", candidate).strip(" -")

    if not re.search(r"[A-Za-zÀ-ỹ]", candidate):
        for field in ("explanation", "structure", "usage", "practiceHint", "pattern"):
            fallback = CJK_RE.sub(" ", plain(item.get(field, "")))
            fallback = re.sub(r"[^A-Za-zÀ-ỹ0-9\s-]", " ", fallback)
            fallback = re.sub(r"\s+", " ", fallback).strip()
            if re.search(r"[A-Za-zÀ-ỹ]", fallback):
                candidate = fallback
                break

    candidate = candidate or "Khác"
    return candidate[:100]


def split_example(value: Any) -> dict[str, str]:
    if isinstance(value, dict):
        return {
            "zh": plain(value.get("hanzi") or value.get("zh") or value.get("chinese")),
            "pinyin": plain(value.get("pinyin")),
            "vi": plain(value.get("translation") or value.get("vi") or value.get("meaning")),
        }

    text = plain(value)
    if not text:
        return {"zh": "", "pinyin": "", "vi": ""}

    # Many lesson examples are stored as "中文句子。Bản dịch tiếng Việt.".
    latin = re.search(r"[A-Za-zÀ-ỹ]", text)
    if latin:
        cut = latin.start()
        zh = text[:cut].strip()
        vi = text[cut:].strip()
        if CJK_RE.search(zh):
            return {"zh": zh, "pinyin": "", "vi": vi}
    return {"zh": text, "pinyin": "", "vi": ""}


def grammar_score(item: dict[str, Any]) -> int:
    return sum(len(plain(item.get(k, ""))) for k in ("pattern", "structure", "explanation", "usage", "practiceHint")) + 30 * len(item.get("examples") or [])


SUPPLEMENTAL_GRAMMAR = [
    {
        "title": "结果补语 - Bổ ngữ kết quả",
        "pattern": "Động từ + 完/好/到/见/懂/错/住…",
        "structure": "V + bổ ngữ kết quả (+ 了 / tân ngữ)",
        "explanation": "Bổ ngữ kết quả cho biết hành động đã tạo ra kết quả nào. Không chỉ nói hành động xảy ra, mà còn nhấn mạnh kết quả hoàn thành, đạt được, hiểu ra hoặc sai lệch.",
        "usage": "Phủ định thường dùng 没(有) + V + bổ ngữ kết quả; không dùng 不 để phủ định một kết quả đã xảy ra.",
        "examples": [
            {"zh": "我看懂了这篇文章。", "pinyin": "Wǒ kàn dǒng le zhè piān wénzhāng.", "vi": "Tôi đã đọc hiểu bài văn này."},
            {"zh": "他还没写完作业。", "pinyin": "Tā hái méi xiě wán zuòyè.", "vi": "Cậu ấy vẫn chưa làm xong bài tập."},
        ],
        "levels": ["HSK2", "HSK3"],
    },
    {
        "title": "趋向补语 - Bổ ngữ xu hướng",
        "pattern": "Động từ + 来/去; V + 上/下/进/出/回/过/起 + 来/去",
        "structure": "V + hướng đơn/kép",
        "explanation": "Bổ ngữ xu hướng mô tả hướng di chuyển so với vị trí của người nói hoặc điểm nhìn. 来 hướng về phía người nói, 去 hướng ra xa người nói.",
        "usage": "Khi có tân ngữ địa điểm, tân ngữ thường đứng trước 来/去; với tân ngữ sự vật, vị trí có thể thay đổi theo trọng tâm câu.",
        "examples": [
            {"zh": "请走进来。", "pinyin": "Qǐng zǒu jìn lái.", "vi": "Mời đi vào đây."},
            {"zh": "他拿出一本书来。", "pinyin": "Tā ná chū yì běn shū lái.", "vi": "Anh ấy lấy ra một quyển sách."},
        ],
        "levels": ["HSK2", "HSK3"],
    },
    {
        "title": "程度补语 - Bổ ngữ mức độ",
        "pattern": "Tính từ/động từ tâm lý + 得 + cụm chỉ mức độ",
        "structure": "V/Adj + 得 + rất/đến mức…",
        "explanation": "Bổ ngữ mức độ bổ sung mức độ hoặc trạng thái do hành động tạo ra, thường đứng sau 得.",
        "usage": "Nếu động từ có tân ngữ, thường lặp lại động từ hoặc đưa tân ngữ lên trước: 他汉语说得很好 / 他说汉语说得很好。",
        "examples": [
            {"zh": "她高兴得跳了起来。", "pinyin": "Tā gāoxìng de tiào le qǐlái.", "vi": "Cô ấy vui đến mức nhảy cẫng lên."},
            {"zh": "他跑得特别快。", "pinyin": "Tā pǎo de tèbié kuài.", "vi": "Anh ấy chạy đặc biệt nhanh."},
        ],
        "levels": ["HSK2", "HSK3"],
    },
    {
        "title": "动态助词 了 - Trợ từ động thái 了",
        "pattern": "Động từ + 了 (+ tân ngữ)",
        "structure": "V + 了 biểu thị hành động hoàn thành hoặc có biến đổi",
        "explanation": "了 sau động từ thường đánh dấu một hành động đã hoàn thành; 了 cuối câu thường nhấn mạnh tình huống mới hoặc sự thay đổi trạng thái.",
        "usage": "Không đồng nhất 了 với thì quá khứ. Trong câu phủ định dùng 没(有), thường bỏ 了 sau động từ.",
        "examples": [
            {"zh": "我买了一本词典。", "pinyin": "Wǒ mǎi le yì běn cídiǎn.", "vi": "Tôi đã mua một quyển từ điển."},
            {"zh": "天冷了。", "pinyin": "Tiān lěng le.", "vi": "Trời trở lạnh rồi."},
        ],
        "levels": ["HSK1", "HSK2"],
    },
    {
        "title": "动态助词 过 - Trợ từ trải nghiệm 过",
        "pattern": "Động từ + 过 (+ tân ngữ)",
        "structure": "S + V + 过 + O",
        "explanation": "过 cho biết chủ thể từng có trải nghiệm làm việc gì ít nhất một lần trước thời điểm nói.",
        "usage": "Phủ định dùng 没(有) + V + 过; 过 không tập trung vào thời điểm cụ thể mà tập trung vào kinh nghiệm.",
        "examples": [
            {"zh": "我去过北京。", "pinyin": "Wǒ qù guo Běijīng.", "vi": "Tôi từng đến Bắc Kinh."},
            {"zh": "她没吃过这个菜。", "pinyin": "Tā méi chī guo zhège cài.", "vi": "Cô ấy chưa từng ăn món này."},
        ],
        "levels": ["HSK2"],
    },
    {
        "title": "正在/在/正……呢 - Hành động đang diễn ra",
        "pattern": "S + 正在/在/正 + V (+ O) + 呢",
        "structure": "Phó từ tiến hành + động từ",
        "explanation": "正在, 在 và 正 đặt trước động từ để biểu thị hành động đang diễn ra; 呢 cuối câu làm sắc thái tiếp diễn rõ hơn.",
        "usage": "Có thể dùng riêng từng dấu hiệu, không bắt buộc phải xuất hiện đồng thời.",
        "examples": [
            {"zh": "我正在看书呢。", "pinyin": "Wǒ zhèngzài kàn shū ne.", "vi": "Tôi đang đọc sách."},
            {"zh": "他们在开会。", "pinyin": "Tāmen zài kāihuì.", "vi": "Họ đang họp."},
        ],
        "levels": ["HSK1", "HSK2"],
    },
    {
        "title": "存现句 - Câu tồn hiện",
        "pattern": "Địa điểm + 有/是/động từ + danh từ không xác định",
        "structure": "Nơi chốn + vị ngữ tồn hiện + sự vật/người",
        "explanation": "Câu tồn hiện dùng để giới thiệu sự xuất hiện, tồn tại hoặc biến mất của một người hay sự vật tại một nơi.",
        "usage": "Danh từ ở cuối thường là thông tin mới và hay đi với số lượng từ; không thường dùng đại từ xác định ở vị trí này.",
        "examples": [
            {"zh": "桌子上放着一本书。", "pinyin": "Zhuōzi shàng fàngzhe yì běn shū.", "vi": "Trên bàn có đặt một quyển sách."},
            {"zh": "前面来了一个人。", "pinyin": "Qiánmiàn lái le yí ge rén.", "vi": "Phía trước có một người đi tới."},
        ],
        "levels": ["HSK3", "HSK4"],
    },
    {
        "title": "兼语句 - Câu kiêm ngữ",
        "pattern": "S + động từ 1 + người/vật + động từ 2",
        "structure": "Tân ngữ của V1 đồng thời là chủ ngữ logic của V2",
        "explanation": "Câu kiêm ngữ thường xuất hiện sau các động từ như 请, 让, 叫, 派, 命令, 希望 để yêu cầu hoặc khiến người khác thực hiện hành động.",
        "usage": "Không thêm 的 giữa thành phần kiêm ngữ và động từ thứ hai.",
        "examples": [
            {"zh": "老师让我们复习课文。", "pinyin": "Lǎoshī ràng wǒmen fùxí kèwén.", "vi": "Giáo viên bảo chúng tôi ôn bài khóa."},
            {"zh": "我请他帮忙。", "pinyin": "Wǒ qǐng tā bāngmáng.", "vi": "Tôi nhờ anh ấy giúp đỡ."},
        ],
        "levels": ["HSK2", "HSK3"],
    },
]

ADVANCED_GRAMMAR_SEEDS = [
    ("非……不可 - Bắt buộc phải", "非 + V + 不可", "Nhấn mạnh một việc nhất định phải làm hoặc một kết quả tất yếu phải xảy ra.", "Sắc thái mạnh, thường dùng khi người nói đã quyết tâm hoặc hoàn cảnh không cho phép lựa chọn khác.", "这件事今天非解决不可。", "Việc này hôm nay nhất định phải giải quyết."),
    ("岂不是……吗 - Chẳng phải là……sao", "岂不是 + mệnh đề + 吗", "Câu hỏi tu từ dùng để khẳng định điều người nói cho là hiển nhiên.", "Thường dùng trong tranh luận hoặc văn viết; không chờ câu trả lời thật.", "这样做岂不是浪费时间吗？", "Làm như vậy chẳng phải là lãng phí thời gian sao?"),
    ("以免 - Để tránh", "Mệnh đề 1，以免 + kết quả không mong muốn", "Nối một biện pháp với mục đích ngăn hậu quả xấu xảy ra.", "Vế sau thường là điều tiêu cực hoặc rủi ro cần phòng tránh.", "请提前保存文件，以免数据丢失。", "Hãy lưu tệp trước để tránh mất dữ liệu."),
    ("倒 - Trái lại / thực ra", "Chủ ngữ + 倒 + vị ngữ", "Biểu thị kết quả trái dự đoán, đưa ra ý kiến mềm hơn hoặc chuyển sang một góc nhìn khác.", "Ý nghĩa phụ thuộc ngữ cảnh; không đồng nghĩa hoàn toàn với 反而.", "大家都很紧张，他倒显得很轻松。", "Mọi người đều căng thẳng, riêng anh ấy lại tỏ ra rất thoải mái."),
    ("反而 - Trái lại", "Không A，反而 B", "Cho biết kết quả thực tế đi ngược với dự đoán hoặc mục đích ban đầu.", "Vế B thường là thông tin trọng tâm và có mức độ bất ngờ rõ.", "他没生气，反而笑了。", "Anh ấy không tức giận mà trái lại còn cười."),
    ("根本……到底…… - Hoàn toàn / rốt cuộc", "根本 + phủ định; 到底 + câu hỏi/nhấn mạnh", "根本 nhấn mạnh từ gốc hoặc hoàn toàn; 到底 truy hỏi kết quả cuối cùng hay bản chất sự việc.", "Không hoán đổi hai từ khi một câu đang hỏi 'rốt cuộc'.", "你到底想说什么？我根本听不懂。", "Rốt cuộc bạn muốn nói gì? Tôi hoàn toàn không hiểu."),
    ("居然 - Không ngờ lại", "Chủ ngữ + 居然 + vị ngữ", "Biểu thị sự việc xảy ra ngoài dự đoán của người nói.", "Có sắc thái ngạc nhiên rõ; có thể tích cực hoặc tiêu cực.", "这么难的题，他居然答对了。", "Câu khó như vậy mà anh ấy không ngờ lại trả lời đúng."),
    ("一时与一度 - Nhất thời và đã từng", "一时 + trạng thái; 一度 + sự việc từng xảy ra", "一时 nói trạng thái ngắn hạn; 一度 nói một giai đoạn từng xuất hiện trong quá khứ.", "Chọn theo việc muốn nhấn mạnh thời lượng ngắn hay một giai đoạn đã từng có.", "他一时想不起答案，公司也一度陷入困难。", "Anh ấy nhất thời không nhớ ra đáp án; công ty cũng từng rơi vào khó khăn."),
    ("一直与一向 - Liên tục và xưa nay", "一直 + hành động kéo dài; 一向 + thói quen/đánh giá", "一直 nhấn mạnh sự liên tục theo thời gian; 一向 nhấn mạnh thói quen hoặc đặc điểm vốn có.", "一向 thường đi với nhận xét ổn định, không dùng cho một hành động tạm thời.", "她一直在等你，也一向很守时。", "Cô ấy vẫn luôn chờ bạn và xưa nay rất đúng giờ."),
    ("很是 - Rất là", "很是 + tính từ/động từ tâm lý", "Cách diễn đạt hơi trang trọng, nhấn mạnh mức độ cao của cảm xúc hoặc trạng thái.", "Thường gặp trong văn viết và lời kể; ít khẩu ngữ hơn 很.", "听到这个消息，我很是欣慰。", "Nghe tin này, tôi rất lấy làm an lòng."),
    ("为……而…… - Vì……mà……", "为 + mục tiêu/đối tượng + 而 + hành động", "Nêu mục tiêu, nguyên nhân hoặc đối tượng khiến hành động được thực hiện.", "Mang sắc thái cô đọng, thường dùng trong văn viết, khẩu hiệu và phát biểu.", "我们为共同的目标而努力。", "Chúng ta nỗ lực vì mục tiêu chung."),
    ("通过……使…… - Thông qua……khiến……", "通过 + phương thức，使 + đối tượng + kết quả", "Nêu phương thức trung gian và kết quả mà phương thức đó tạo ra.", "Tránh để chủ thể của 通过 và 使 mơ hồ trong câu dài.", "通过反复练习，使他的发音更自然了。", "Thông qua luyện tập lặp lại, phát âm của anh ấy trở nên tự nhiên hơn."),
    ("足足 - Trọn vẹn đến", "足足 + số lượng/thời lượng", "Nhấn mạnh số lượng hoặc thời gian đạt mức nhiều hơn tưởng tượng.", "Đứng trước cụm số lượng và mang sắc thái cảm thán.", "我们足足等了三个小时。", "Chúng tôi đã đợi trọn ba tiếng đồng hồ."),
    ("一再 - Hết lần này đến lần khác", "一再 + động từ", "Biểu thị cùng một hành động hoặc tình huống lặp lại nhiều lần.", "Thường dùng với nhắc nhở, trì hoãn, yêu cầu, cam kết hoặc sai phạm.", "他一再提醒大家注意安全。", "Anh ấy hết lần này đến lần khác nhắc mọi người chú ý an toàn."),
    ("凡是……都…… - Hễ là……đều……", "凡是 + phạm vi， 都 + kết luận", "Khái quát một quy luật áp dụng cho toàn bộ đối tượng thuộc phạm vi nêu ra.", "凡是 mang sắc thái khái quát và trang trọng hơn 只要 trong nhiều ngữ cảnh.", "凡是参加活动的人都要登记。", "Hễ ai tham gia hoạt động đều phải đăng ký."),
    ("向来 - Xưa nay", "Chủ ngữ + 向来 + vị ngữ", "Nêu một thói quen, thái độ hoặc tình trạng ổn định từ trước đến nay.", "Thường đi với 都, 不, 没 để tăng sắc thái nhất quán.", "他向来不轻易答应别人。", "Anh ấy xưa nay không dễ dàng nhận lời người khác."),
    ("早在……就…… - Ngay từ……đã……", "早在 + thời điểm + 就 + hành động", "Nhấn mạnh hành động xảy ra sớm hơn điều người nghe có thể nghĩ.", "Thời điểm sau 早在 phải cụ thể hoặc xác định được từ ngữ cảnh.", "早在十年前，他们就开始研究这个问题。", "Ngay từ mười năm trước, họ đã bắt đầu nghiên cứu vấn đề này."),
    ("果然 - Quả nhiên", "Chủ ngữ + 果然 + vị ngữ", "Cho biết sự thật xảy ra đúng như dự đoán hoặc lời nói trước đó.", "Cần có dự đoán, căn cứ hoặc kỳ vọng đã tồn tại trước khi kết quả xuất hiện.", "天气预报说会下雨，下午果然下了。", "Dự báo nói sẽ mưa, buổi chiều quả nhiên đã mưa."),
    ("似乎 - Dường như", "似乎 + mệnh đề", "Đưa ra phán đoán chưa chắc chắn dựa trên dấu hiệu quan sát được.", "Sắc thái dè dặt hơn 好像 trong văn viết; không dùng khi người nói đã chắc chắn.", "他似乎没有听懂我的意思。", "Anh ấy dường như chưa hiểu ý tôi."),
    ("以及 - Cùng với / và", "A、B以及C", "Nối các thành phần đồng loại, thường đặt trước mục cuối trong một chuỗi liệt kê.", "Mang sắc thái văn viết; không dùng để nối hai mệnh đề có quan hệ nhân quả.", "会议讨论了预算、人员以及时间安排。", "Cuộc họp đã thảo luận ngân sách, nhân sự và lịch trình."),
    ("兼 - Kiêm / đồng thời có", "A兼B; 兼 + động từ", "Biểu thị một người, vật hoặc chức năng đồng thời đảm nhiệm hai vai trò.", "Cô đọng và thiên về văn viết; có thể xuất hiện trong chức danh.", "她是翻译兼项目助理。", "Cô ấy vừa là phiên dịch vừa là trợ lý dự án."),
    ("偏偏 - Cứ đúng lúc lại", "Chủ ngữ + 偏偏 + tình huống trái ý", "Nhấn mạnh một sự việc không thuận lợi hoặc trái mong muốn lại xảy ra đúng lúc.", "Thường mang thái độ bất lực, phàn nàn hoặc bất ngờ.", "我最忙的时候，电脑偏偏坏了。", "Đúng lúc tôi bận nhất thì máy tính lại hỏng."),
    ("莫非……？ - Lẽ nào……", "莫非 + phỏng đoán + 吗/不成", "Câu hỏi tu từ hoặc suy đoán khi người nói nhận thấy một khả năng đáng ngờ.", "Thường dùng trong văn viết hoặc lời nói có sắc thái kịch tính.", "他一直没回消息，莫非出什么事了？", "Anh ấy mãi không trả lời, lẽ nào đã xảy ra chuyện gì?"),
    ("再……也…… - Dù đến đâu cũng", "再 + tính từ/động từ + 也 + kết luận", "Nhấn mạnh kết luận không thay đổi dù mức độ hoặc điều kiện tăng lên.", "Thường đi với phủ định, giới hạn hoặc quyết tâm.", "任务再难，我们也不能放弃。", "Nhiệm vụ dù khó đến đâu, chúng ta cũng không thể bỏ cuộc."),
    ("然而 - Tuy nhiên", "Mệnh đề 1，然而 + mệnh đề 2", "Chuyển sang ý đối lập hoặc kết quả trái với điều vừa nêu.", "Trang trọng và thiên về văn viết hơn 但是.", "方案看起来简单，然而执行起来并不容易。", "Phương án trông có vẻ đơn giản, tuy nhiên thực hiện không hề dễ."),
    ("假使……就…… - Giả sử……thì……", "假使 + điều kiện， 就 + kết quả", "Đặt ra một tình huống giả định để suy luận kết quả.", "Thiên về văn viết; tương đương 如果 nhưng sắc thái giả định rõ hơn.", "假使没有充分准备，就很难把握机会。", "Giả sử không chuẩn bị đầy đủ thì rất khó nắm bắt cơ hội."),
    ("鉴于 - Xét thấy", "鉴于 + căn cứ， + quyết định/kết luận", "Nêu lý do hoặc căn cứ chính thức trước một quyết định.", "Thường dùng trong thông báo, báo cáo và văn bản hành chính.", "鉴于天气恶劣，活动将延期举行。", "Xét thấy thời tiết xấu, hoạt động sẽ được hoãn lại."),
    ("总之 - Tóm lại", "总之，+ kết luận", "Tổng hợp nội dung phía trước thành một kết luận ngắn gọn.", "Thường đứng đầu câu kết hoặc đoạn kết; không dùng để mở một chủ đề hoàn toàn mới.", "总之，我们需要先解决最关键的问题。", "Tóm lại, chúng ta cần giải quyết vấn đề then chốt trước."),
    ("以……的名义 - Nhân danh", "以 + người/tổ chức + 的名义 + hành động", "Cho biết hành động được thực hiện dưới danh nghĩa của cá nhân hoặc tổ chức nào.", "Cần phân biệt danh nghĩa chính thức với mục đích thật của hành động.", "他以学校的名义向大家表示感谢。", "Anh ấy thay mặt nhà trường bày tỏ lời cảm ơn tới mọi người."),
    ("势必 - Ắt sẽ", "Điều kiện + 势必 + kết quả", "Khẳng định một kết quả khó tránh khỏi do xu thế hoặc điều kiện khách quan.", "Sắc thái suy luận mạnh và trang trọng hơn 一定.", "如果成本持续上升，价格势必受到影响。", "Nếu chi phí tiếp tục tăng, giá cả ắt sẽ bị ảnh hưởng."),
    ("是否 - Có hay không", "是否 + động từ/tính từ", "Biểu thị hai khả năng khẳng định và phủ định trong câu gián tiếp hoặc văn viết.", "Không dùng 是否 cùng 吗 trong một câu hỏi trực tiếp thông thường.", "请确认资料是否完整。", "Vui lòng xác nhận tài liệu có đầy đủ hay không."),
    ("尚且……何况…… - Đến……còn……huống chi……", "A 尚且 B，何况 C", "Lấy trường hợp nhẹ hoặc hiển nhiên làm căn cứ để suy ra trường hợp mạnh hơn.", "Hai vế phải có quan hệ tăng tiến hợp lý.", "成年人尚且会犯错，何况孩子呢？", "Người lớn còn mắc lỗi, huống chi trẻ con?"),
    ("在于 - Nằm ở", "Chủ thể + 在于 + điểm cốt lõi", "Chỉ ra nguyên nhân, giá trị hoặc điểm mấu chốt của một vấn đề.", "Thành phần sau 在于 thường là nội dung trừu tượng hoặc một mệnh đề.", "学习语言的关键在于长期使用。", "Điểm then chốt của việc học ngôn ngữ nằm ở sử dụng lâu dài."),
    ("一律 - Nhất loạt", "Phạm vi + 一律 + vị ngữ", "Cho biết mọi đối tượng trong phạm vi đều áp dụng cùng một quy định hoặc cách xử lý.", "Sắc thái quy định mạnh; không phù hợp khi có ngoại lệ chưa nêu.", "未登记的人员一律不得入场。", "Người chưa đăng ký nhất loạt không được vào."),
    ("无非 - Chẳng qua chỉ là", "Chủ thể + 无非是/无非 + phạm vi", "Thu hẹp nguyên nhân hoặc khả năng về một vài điều mà người nói cho là không phức tạp.", "Có thể mang sắc thái xem nhẹ; cần dùng thận trọng khi nói về người khác.", "他的担心无非是时间不够。", "Điều anh ấy lo chẳng qua chỉ là không đủ thời gian."),
    ("莫过于 - Không gì hơn", "Không có gì + 莫过于 + nội dung", "Khẳng định một sự vật hoặc hành động là nổi bật nhất trong phạm vi đang nói.", "Thường dùng trong nhận xét, cảm thán và văn viết.", "夏天最舒服的事莫过于喝一杯冰茶。", "Mùa hè không gì dễ chịu hơn uống một cốc trà đá."),
    ("跟……似的 - Giống như", "A 跟 B 似的 + vị ngữ", "So sánh A với B để làm nổi bật đặc điểm hoặc trạng thái.", "Mang sắc thái khẩu ngữ; 似的 đọc là shìde trong cấu trúc này.", "他累得跟跑完马拉松似的。", "Anh ấy mệt như vừa chạy xong marathon."),
    ("从而 - Từ đó", "Nguyên nhân/phương thức，从而 + kết quả", "Nối hành động hoặc điều kiện phía trước với kết quả logic phía sau.", "Thiên về văn viết; vế sau phải là kết quả phát triển từ vế trước.", "系统简化了流程，从而提高了效率。", "Hệ thống đơn giản hóa quy trình, từ đó nâng cao hiệu suất."),
    ("不愧是 - Quả không hổ là", "不愧是 + danh từ/đánh giá", "Khen một người hoặc sự vật đúng với danh tiếng, thân phận hay kỳ vọng.", "Thường dùng sau khi quan sát được một kết quả đáng thuyết phục.", "他不愧是专业翻译，处理得非常准确。", "Anh ấy quả không hổ là phiên dịch chuyên nghiệp, xử lý rất chính xác."),
    ("到时候 - Đến lúc đó", "到时候 + mệnh đề", "Chỉ thời điểm trong tương lai đã được nhắc hoặc có thể suy ra từ ngữ cảnh.", "Không cần lặp lại mốc thời gian khi hai bên đã biết rõ.", "先把计划定下来，到时候再分工。", "Trước hết hãy chốt kế hoạch, đến lúc đó rồi phân công."),
    ("与否 - Hay không", "Động từ/tính từ + 与否", "Biểu thị hai khả năng có và không trong văn viết.", "Thường đặt sau từ hoặc cụm ngắn; không lặp 不 trước 与否.", "结果成功与否取决于准备是否充分。", "Kết quả thành công hay không phụ thuộc vào việc chuẩn bị có đầy đủ hay không."),
    ("何必 - Hà tất", "何必 + động từ + 呢", "Câu hỏi tu từ cho rằng một hành động là không cần thiết.", "Có thể mang sắc thái khuyên nhủ hoặc trách nhẹ.", "既然可以商量，何必争吵呢？", "Đã có thể bàn bạc thì hà tất phải tranh cãi?"),
    ("本 - Bên này / cơ quan này", "本 + đơn vị/tổ chức/văn bản", "Đại từ chỉ định trang trọng, dùng khi tổ chức hoặc văn bản tự nói về mình.", "Thường gặp trong thông báo: 本公司, 本校, 本规定.", "本公司将于下周公布结果。", "Công ty chúng tôi sẽ công bố kết quả vào tuần sau."),
    ("之 - Quan hệ sở hữu văn viết", "A 之 B", "Nối hai danh từ theo quan hệ sở hữu hoặc bổ nghĩa, tương đương A 的 B trong văn viết.", "Không dùng tràn lan trong khẩu ngữ; thường xuất hiện trong cụm cố định và tiêu đề.", "诚信是合作之本。", "Chữ tín là nền tảng của hợp tác."),
    ("不屑于 - Không thèm", "不屑于 + động từ", "Biểu thị coi việc gì đó không đáng để làm hoặc không đáng quan tâm.", "Sắc thái coi thường khá mạnh, nên tránh dùng khi cần lịch sự.", "他不屑于用不正当的手段竞争。", "Anh ấy không thèm dùng thủ đoạn không chính đáng để cạnh tranh."),
    ("来着 - Vừa nãy là gì nhỉ", "Từ/câu hỏi + 来着", "Dùng cuối câu để cố nhớ hoặc xác nhận lại điều đã biết trong quá khứ gần.", "Khẩu ngữ; không dùng trong văn bản trang trọng.", "你刚才说他叫什么来着？", "Vừa nãy bạn nói anh ấy tên gì nhỉ?"),
    ("竟然 - Vậy mà", "Chủ ngữ + 竟然 + vị ngữ", "Nhấn mạnh kết quả vượt ngoài dự đoán, thường mạnh hơn 居然 trong văn viết.", "Sắc thái ngạc nhiên có thể kèm phê bình hoặc tán thưởng.", "他没有复习，竟然也通过了考试。", "Anh ấy không ôn tập mà vậy mà vẫn vượt qua kỳ thi."),
    ("由……作主 - Do……quyết định", "Việc + 由 + người/tổ chức + 作主", "Cho biết ai có quyền đưa ra quyết định cuối cùng.", "作主 nhấn mạnh quyền quyết định, khác với 主持 là chủ trì.", "具体安排由项目负责人作主。", "Sắp xếp cụ thể do người phụ trách dự án quyết định."),
    ("非得……不可 - Nhất định phải", "非得 + V + 不可", "Nhấn mạnh chủ thể khăng khăng hoặc hoàn cảnh bắt buộc phải thực hiện hành động.", "Khẩu ngữ mạnh; đôi khi mang sắc thái không đồng tình với sự cố chấp.", "你非得现在走不可吗？", "Bạn nhất định phải đi ngay bây giờ sao?"),
    ("以便 - Để tiện", "Mệnh đề 1，以便 + mục đích", "Nối hành động với mục đích tạo thuận lợi cho bước tiếp theo.", "Vế sau là mục tiêu tích cực; nếu tránh hậu quả xấu thì thường dùng 以免.", "请留下联系方式，以便我们及时通知你。", "Hãy để lại thông tin liên hệ để chúng tôi tiện thông báo kịp thời."),
    ("……性 - Hậu tố chỉ tính chất", "Danh từ/động từ/tính từ + 性", "Tạo danh từ trừu tượng chỉ tính chất, khả năng hoặc đặc điểm.", "Thường gặp trong văn học thuật: 可能性, 重要性, 可行性.", "我们需要评估这个方案的可行性。", "Chúng ta cần đánh giá tính khả thi của phương án này."),
    ("则 - Thì / còn", "Nếu A，则 B; A……，B则……", "Dùng để nêu kết quả điều kiện hoặc đối chiếu hai trường hợp trong văn viết.", "Trang trọng hơn 就; khi đối chiếu, có thể dịch là 'còn'.", "准备充分则成功的可能性更大。", "Chuẩn bị đầy đủ thì khả năng thành công lớn hơn."),
    ("一来……二来…… - Một là……hai là……", "一来 + lý do 1，二来 + lý do 2", "Liệt kê hai lý do hoặc lợi ích song song để giải thích quyết định.", "Thường dùng khi cả hai lý do đều cùng dẫn đến một kết luận.", "我选择坐地铁，一来省钱，二来准时。", "Tôi chọn đi tàu điện, một là tiết kiệm, hai là đúng giờ."),
    ("所 + động từ - Điều được……", "所 + V (+ 的) + danh từ", "Biến động từ thành thành phần bổ nghĩa mang nghĩa 'được…' hoặc 'điều mà…'.", "Thiên về văn viết; 所 không đứng một mình làm động từ.", "这正是大家所关心的问题。", "Đây chính là vấn đề mọi người quan tâm."),
    ("由……所…… - Bị / do……", "Danh từ + 由 + tác nhân + 所 + động từ", "Cấu trúc bị động trang trọng, nhấn mạnh tác nhân tạo ra hành động.", "Thường gặp trong văn bản học thuật và hành chính; khẩu ngữ hay dùng 被.", "该决定由委员会所作出。", "Quyết định này do ủy ban đưa ra."),
    ("越是……越…… - Càng……càng……", "越是 + điều kiện，越 + kết quả", "Nhấn mạnh mức độ của kết quả tăng theo mức độ của điều kiện.", "Có thể lược 是, nhưng dùng 越是 khi muốn làm nổi bật điều kiện.", "越是时间紧，越要保持冷静。", "Thời gian càng gấp càng phải giữ bình tĩnh."),
    ("宁可……也不…… - Thà……cũng không……", "宁可 + lựa chọn A，也不 + lựa chọn B", "Biểu thị chấp nhận A để kiên quyết từ chối B.", "Hai lựa chọn thường đều không hoàn hảo, nhưng B bị xem là khó chấp nhận hơn.", "我宁可多花时间，也不降低质量。", "Tôi thà tốn thêm thời gian cũng không hạ chất lượng."),
    ("无论如何 - Dù thế nào", "无论如何 + kết luận", "Khẳng định kết luận hoặc quyết tâm không thay đổi trong mọi hoàn cảnh.", "Có thể đứng đầu hoặc giữa câu; thường đi với 都/也/一定.", "无论如何，我们都要按时完成。", "Dù thế nào, chúng ta cũng phải hoàn thành đúng hạn."),
    ("未免 - Có phần quá", "Chủ ngữ + 未免 + tính từ/đánh giá", "Đưa ra phê bình nhẹ rằng mức độ của sự việc hơi vượt quá hợp lý.", "Thường đi với 太/有点; giọng nói nên mềm để tránh thành chỉ trích nặng.", "因为一个小错误就否定全部努力，未免太武断了。", "Chỉ vì một lỗi nhỏ mà phủ nhận toàn bộ nỗ lực thì có phần quá võ đoán."),
]


def advanced_grammar_items() -> list[dict[str, Any]]:
    return [
        {
            "title": title,
            "pattern": pattern,
            "structure": pattern,
            "explanation": explanation,
            "usage": usage,
            "examples": [{"zh": ex_zh, "pinyin": "", "vi": ex_vi}],
            "levels": ["HSK6"],
            "sourceNote": "Ngữ pháp nâng cao đối chiếu theo danh mục C1; ví dụ được biên soạn riêng.",
        }
        for title, pattern, explanation, usage, ex_zh, ex_vi in ADVANCED_GRAMMAR_SEEDS
    ]


def build_grammar() -> dict[str, Any]:
    merged: dict[str, dict[str, Any]] = {}

    for file_name in sorted(glob.glob(str(ROOT / "assets" / "giaotrinhhsk" / "hsk*" / "lesson-*.json"))):
        path = Path(file_name)
        try:
            lesson = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue

        level_number = re.search(r"hsk(\d+)", path.as_posix(), re.I)
        level = f"HSK{level_number.group(1)}" if level_number else plain(lesson.get("level"))
        lesson_id = plain(lesson.get("lessonId")) or path.stem
        lesson_title = plain(lesson.get("title") or lesson.get("chineseTitle"))

        for raw in lesson.get("grammar") or []:
            if not isinstance(raw, dict):
                continue
            title = plain(raw.get("title") or raw.get("pattern"))
            if not title:
                continue
            key = compact_key(title)
            examples = [split_example(ex) for ex in (raw.get("examples") or [])]
            examples = [ex for ex in examples if ex["zh"] or ex["vi"]][:3]
            item = {
                "title": title,
                "pattern": plain(raw.get("pattern")),
                "structure": plain(raw.get("structure")),
                "explanation": plain(raw.get("explanation")),
                "usage": plain(raw.get("usage") or raw.get("practiceHint")),
                "examples": examples,
                "levels": [level] if level else [],
                "sourceRefs": [{"level": level, "lessonId": lesson_id, "lessonTitle": lesson_title}],
                "sourceNote": plain(raw.get("source")),
            }

            current = merged.get(key)
            if current is None:
                merged[key] = item
            else:
                current["levels"] = sorted(set(current["levels"] + item["levels"]), key=lambda x: int(re.sub(r"\D", "", x) or 99))
                known_refs = {(r["level"], r["lessonId"]) for r in current["sourceRefs"]}
                for ref in item["sourceRefs"]:
                    if (ref["level"], ref["lessonId"]) not in known_refs:
                        current["sourceRefs"].append(ref)
                if grammar_score(item) > grammar_score(current):
                    saved_levels = current["levels"]
                    saved_refs = current["sourceRefs"]
                    merged[key] = item
                    merged[key]["levels"] = saved_levels
                    merged[key]["sourceRefs"] = saved_refs

    # Add a few standard categories that were not explicit in the lesson dataset.
    for raw in [*SUPPLEMENTAL_GRAMMAR, *advanced_grammar_items()]:
        key = compact_key(raw["title"])
        if key in merged:
            continue
        merged[key] = {
            "title": plain(raw["title"]),
            "pattern": plain(raw.get("pattern")),
            "structure": plain(raw.get("structure")),
            "explanation": plain(raw.get("explanation")),
            "usage": plain(raw.get("usage")),
            "examples": [split_example(ex) for ex in raw.get("examples", [])],
            "levels": raw.get("levels", []),
            "sourceRefs": [],
            "sourceNote": plain(raw.get("sourceNote")) or "Đối chiếu cấu trúc ngữ pháp phổ thông theo cấp độ.",
        }

    result = []
    for key, item in merged.items():
        sort_label = derive_sort_label(item["title"], item)
        folded = ascii_fold(sort_label).upper()
        first = next((ch for ch in folded if "A" <= ch <= "Z"), "#")
        item["id"] = "g-" + hashlib.sha1(key.encode("utf-8")).hexdigest()[:10]
        item["keyword"] = sort_label
        item["initial"] = first
        item["sourceRefs"] = item["sourceRefs"][:12]
        result.append(item)

    result.sort(key=lambda x: (x["initial"], ascii_fold(x["keyword"]).lower(), x["title"]))
    initials = sorted({x["initial"] for x in result if x["initial"] != "#"})
    return {
        "meta": {
            "title": "Ngữ pháp Tàng Thư Các",
            "version": 1,
            "generatedFrom": "assets/giaotrinhhsk/hsk1..hsk6/lesson-*.json",
            "organization": "A–Z theo từ khóa tiếng Việt; có bộ lọc HSK1–HSK6.",
            "references": [
                "Ngữ pháp trong Bài khóa HSK1–HSK6 của project",
                "Chinese Grammar Wiki — grammar points by level and comparison categories",
            ],
            "count": len(result),
            "initials": initials,
        },
        "items": result,
    }


CURATED_IDIOMS = [
    ("对牛弹琴", "duì niú tán qín", "nói điều hay với người không hiểu hoặc không muốn nghe", "đàn gảy tai trâu", "跟他解释艺术理论，简直是对牛弹琴。", "Giải thích lý thuyết nghệ thuật với anh ấy chẳng khác nào đàn gảy tai trâu.", "Giao tiếp & tư duy", "Tiêu cực"),
    ("守株待兔", "shǒu zhū dài tù", "chỉ ngồi chờ may mắn mà không chủ động", "há miệng chờ sung", "成功不能靠守株待兔，必须主动努力。", "Thành công không thể dựa vào việc ngồi chờ may mắn; phải chủ động cố gắng.", "Học tập & nỗ lực", "Tiêu cực"),
    ("马马虎虎", "mǎ mǎ hū hū", "qua loa, đại khái; tạm được", "làm cho có", "这份作业写得马马虎虎，需要重做。", "Bài tập này làm khá qua loa, cần làm lại.", "Phẩm chất & hành vi", "Tiêu cực"),
    ("一心一意", "yì xīn yí yì", "toàn tâm toàn ý, tập trung một lòng", "một lòng một dạ", "她一心一意准备汉语考试。", "Cô ấy toàn tâm toàn ý chuẩn bị cho kỳ thi tiếng Trung.", "Học tập & nỗ lực", "Tích cực"),
    ("三心二意", "sān xīn èr yì", "không chuyên tâm, dễ dao động", "đứng núi này trông núi nọ", "学习时三心二意，很难取得进步。", "Học mà không chuyên tâm thì rất khó tiến bộ.", "Học tập & nỗ lực", "Tiêu cực"),
    ("废寝忘食", "fèi qǐn wàng shí", "mải mê làm việc đến quên ăn quên ngủ", "quên ăn quên ngủ", "他为了完成研究，常常废寝忘食。", "Để hoàn thành nghiên cứu, anh ấy thường quên ăn quên ngủ.", "Học tập & nỗ lực", "Tích cực"),
    ("一针见血", "yì zhēn jiàn xiě", "nói thẳng và trúng ngay vấn đề cốt lõi", "nói trúng tim đen; nói trúng trọng tâm", "她一针见血地指出了方案的问题。", "Cô ấy chỉ ra vấn đề của phương án một cách trúng trọng tâm.", "Giao tiếp & tư duy", "Trung tính"),
    ("自相矛盾", "zì xiāng máo dùn", "lời nói hoặc hành động trước sau mâu thuẫn", "tự mâu thuẫn", "你的两种说法自相矛盾。", "Hai cách nói của bạn tự mâu thuẫn với nhau.", "Giao tiếp & tư duy", "Tiêu cực"),
    ("井井有条", "jǐng jǐng yǒu tiáo", "ngăn nắp, có thứ tự rõ ràng", "đâu ra đấy", "她把资料整理得井井有条。", "Cô ấy sắp xếp tài liệu rất đâu ra đấy.", "Công việc & xã hội", "Tích cực"),
    ("左右为难", "zuǒ yòu wéi nán", "kẹt giữa hai lựa chọn, bên nào cũng khó", "tiến thoái lưỡng nan", "两边都是朋友，我真是左右为难。", "Hai bên đều là bạn nên tôi thật sự tiến thoái lưỡng nan.", "Tình huống & kết quả", "Tiêu cực"),
    ("哭笑不得", "kū xiào bù dé", "rơi vào tình huống vừa buồn cười vừa khó xử", "dở khóc dở cười", "孩子的回答让大家哭笑不得。", "Câu trả lời của đứa trẻ khiến mọi người dở khóc dở cười.", "Cảm xúc & trạng thái", "Trung tính"),
    ("心满意足", "xīn mǎn yì zú", "hoàn toàn hài lòng và mãn nguyện", "mãn nguyện", "看到成果以后，大家都心满意足。", "Sau khi nhìn thấy thành quả, mọi người đều rất mãn nguyện.", "Cảm xúc & trạng thái", "Tích cực"),
    ("愁眉苦脸", "chóu méi kǔ liǎn", "gương mặt buồn rầu, lo lắng", "mặt ủ mày chau", "别愁眉苦脸了，我们一起想办法。", "Đừng mặt ủ mày chau nữa, chúng ta cùng nghĩ cách.", "Cảm xúc & trạng thái", "Tiêu cực"),
    ("一见如故", "yí jiàn rú gù", "mới gặp đã thân thiết như bạn cũ", "mới gặp đã như quen từ lâu", "我们第一次见面就一见如故。", "Lần đầu gặp nhau, chúng tôi đã thân thiết như bạn cũ.", "Quan hệ & phẩm chất", "Tích cực"),
    ("脱口而出", "tuō kǒu ér chū", "buột miệng nói ra ngay", "buột miệng", "听到问题，他立刻把答案脱口而出。", "Nghe câu hỏi, anh ấy lập tức buột miệng nói ra đáp án.", "Giao tiếp & tư duy", "Trung tính"),
    ("一模一样", "yí mú yí yàng", "giống hệt nhau, không có khác biệt", "giống như đúc", "这两张照片看起来一模一样。", "Hai bức ảnh này trông giống như đúc.", "Tình huống & kết quả", "Trung tính"),
    ("水到渠成", "shuǐ dào qú chéng", "điều kiện chín muồi thì kết quả tự nhiên xuất hiện", "nước đến thì kênh thành", "基础打牢以后，进步自然水到渠成。", "Khi nền tảng vững, tiến bộ sẽ tự nhiên đến.", "Tình huống & kết quả", "Tích cực"),
    ("雪中送炭", "xuě zhōng sòng tàn", "giúp đỡ đúng lúc người khác đang khó khăn", "một miếng khi đói bằng một gói khi no", "你在我最困难时帮忙，真是雪中送炭。", "Bạn giúp tôi lúc khó khăn nhất, đúng là một sự giúp đỡ vô cùng kịp thời.", "Quan hệ & phẩm chất", "Tích cực"),
    ("火上加油", "huǒ shàng jiā yóu", "làm cho tình hình vốn xấu càng nghiêm trọng", "đổ thêm dầu vào lửa", "大家正在争论，你别再火上加油。", "Mọi người đang tranh luận, bạn đừng đổ thêm dầu vào lửa.", "Tình huống & kết quả", "Tiêu cực"),
    ("多此一举", "duō cǐ yì jǔ", "làm thêm một việc thừa thãi, không cần thiết", "vẽ chuyện; thừa giấy vẽ voi", "文件已经备份，再复制十份只是多此一举。", "Tệp đã được sao lưu; chép thêm mười bản chỉ là việc thừa.", "Phẩm chất & hành vi", "Tiêu cực"),
    ("不知不觉", "bù zhī bù jué", "không nhận ra thời gian hoặc sự thay đổi đã xảy ra", "lúc nào không hay", "不知不觉，我们已经学了两个小时。", "Lúc nào không hay, chúng tôi đã học được hai giờ.", "Cảm xúc & trạng thái", "Trung tính"),
    ("平易近人", "píng yì jìn rén", "thân thiện, dễ gần, không làm người khác e ngại", "bình dị, gần gũi", "新老师很平易近人，学生都愿意提问。", "Giáo viên mới rất gần gũi nên học sinh đều muốn đặt câu hỏi.", "Quan hệ & phẩm chất", "Tích cực"),
    ("斤斤计较", "jīn jīn jì jiào", "so đo, tính toán quá mức vì chuyện nhỏ", "đo lọ nước mắm, đếm củ dưa hành", "朋友之间不应该为小事斤斤计较。", "Bạn bè không nên so đo vì những chuyện nhỏ.", "Quan hệ & phẩm chất", "Tiêu cực"),
    ("情不自禁", "qíng bù zì jīn", "không kìm được cảm xúc hoặc hành động", "không sao kìm được", "听到好消息，她情不自禁地笑了。", "Nghe tin vui, cô ấy không kìm được mà bật cười.", "Cảm xúc & trạng thái", "Trung tính"),
    ("守口如瓶", "shǒu kǒu rú píng", "giữ kín bí mật, tuyệt đối không tiết lộ", "kín như bưng", "这件事很重要，你一定要守口如瓶。", "Chuyện này rất quan trọng, bạn nhất định phải giữ kín như bưng.", "Giao tiếp & tư duy", "Tích cực"),
    ("胡说八道", "hú shuō bā dào", "nói linh tinh, vô căn cứ", "nói nhăng nói cuội", "不了解情况就别胡说八道。", "Chưa hiểu tình hình thì đừng nói nhăng nói cuội.", "Giao tiếp & tư duy", "Tiêu cực"),
    ("夜以继日", "yè yǐ jì rì", "làm việc liên tục cả ngày lẫn đêm", "ngày đêm không nghỉ", "团队夜以继日地修复系统。", "Nhóm làm việc ngày đêm để sửa hệ thống.", "Học tập & nỗ lực", "Tích cực"),
    ("坚持不懈", "jiān chí bù xiè", "kiên trì liên tục, không bỏ cuộc", "bền chí đến cùng", "只要坚持不懈，汉语一定会进步。", "Chỉ cần kiên trì, tiếng Trung nhất định sẽ tiến bộ.", "Học tập & nỗ lực", "Tích cực"),
    ("来之不易", "lái zhī bù yì", "có được không dễ dàng, phải trải qua nhiều nỗ lực", "khó khăn lắm mới có được", "这次机会来之不易，要好好珍惜。", "Cơ hội này khó khăn lắm mới có được, cần trân trọng.", "Tình huống & kết quả", "Trung tính"),
    ("引人注目", "yǐn rén zhù mù", "thu hút sự chú ý của mọi người", "bắt mắt; gây chú ý", "她的设计在展览会上十分引人注目。", "Thiết kế của cô ấy rất nổi bật tại triển lãm.", "Tình huống & kết quả", "Trung tính"),
    ("大惊小怪", "dà jīng xiǎo guài", "làm ầm lên vì chuyện nhỏ hoặc bình thường", "chuyện bé xé ra to", "只是一个小错误，不必大惊小怪。", "Chỉ là một lỗi nhỏ, không cần chuyện bé xé ra to.", "Phẩm chất & hành vi", "Tiêu cực"),
    ("不欢而散", "bù huān ér sàn", "chia tay hoặc kết thúc trong không khí không vui", "tan cuộc trong bất hòa", "双方没有达成一致，最后不欢而散。", "Hai bên không đạt được đồng thuận và cuối cùng tan cuộc trong bất hòa.", "Quan hệ & phẩm chất", "Tiêu cực"),
    ("患难与共", "huàn nàn yǔ gòng", "cùng nhau chia sẻ gian nan", "đồng cam cộng khổ", "真正的朋友愿意患难与共。", "Bạn bè thật sự sẵn lòng đồng cam cộng khổ.", "Quan hệ & phẩm chất", "Tích cực"),
    ("和颜悦色", "hé yán yuè sè", "nét mặt và giọng nói ôn hòa, thân thiện", "nhẹ nhàng, niềm nở", "老师总是和颜悦色地回答学生。", "Giáo viên luôn nhẹ nhàng trả lời học sinh.", "Quan hệ & phẩm chất", "Tích cực"),
    ("万众一心", "wàn zhòng yì xīn", "mọi người đồng lòng vì một mục tiêu", "muôn người như một", "大家万众一心，很快完成了任务。", "Mọi người đồng lòng nên nhanh chóng hoàn thành nhiệm vụ.", "Công việc & xã hội", "Tích cực"),
    ("四面八方", "sì miàn bā fāng", "mọi phương hướng, khắp mọi nơi", "bốn phương tám hướng", "游客从四面八方来到这里。", "Du khách từ bốn phương tám hướng đến đây.", "Công việc & xã hội", "Trung tính"),
]

EXCLUDED_FOUR_CHAR_TERMS = {"二氧化碳", "素食主义", "通货膨胀", "新陈代谢", "烟花爆竹"}

EQUIVALENTS = {
    "爱不释手": "yêu thích không rời tay",
    "安居乐业": "an cư lạc nghiệp",
    "拔苗助长": "dục tốc bất đạt",
    "半途而废": "có đầu không có cuối",
    "饱经沧桑": "dạn dày sương gió",
    "不可思议": "khó tin; không thể tưởng tượng nổi",
    "不相上下": "kẻ tám lạng, người nửa cân",
    "不言而喻": "không nói cũng hiểu",
    "不择手段": "không từ thủ đoạn",
    "称心如意": "vừa lòng như ý",
    "从容不迫": "ung dung, không hề nao núng",
    "得不偿失": "lợi bất cập hại",
    "丢三落四": "nhớ trước quên sau",
    "东张西望": "ngó đông ngó tây",
    "风土人情": "phong tục tập quán",
    "各抒己见": "mỗi người một ý",
    "根深蒂固": "ăn sâu bén rễ",
    "画蛇添足": "vẽ rắn thêm chân; lợn lành chữa thành lợn què",
    "恍然大悟": "bừng tỉnh hiểu ra",
    "见义勇为": "thấy việc nghĩa thì làm",
    "竭尽全力": "dốc hết sức lực",
    "聚精会神": "toàn tâm chú ý",
    "苦尽甘来": "hết cơn bĩ cực tới hồi thái lai",
    "名副其实": "danh xứng với thực",
    "齐心协力": "đồng tâm hiệp lực",
    "千方百计": "trăm phương nghìn kế",
    "锲而不舍": "có công mài sắt, có ngày nên kim",
    "轻而易举": "dễ như trở bàn tay",
    "全力以赴": "dốc toàn lực",
    "实事求是": "tôn trọng sự thật, cầu thị",
    "滔滔不绝": "nói thao thao bất tuyệt",
    "讨价还价": "cò kè bớt một thêm hai",
    "无可奈何": "không còn cách nào khác",
    "无能为力": "lực bất tòng tâm",
    "无微不至": "chu đáo đến từng li từng tí",
    "无忧无虑": "vô lo vô nghĩ",
    "物美价廉": "hàng tốt giá rẻ",
    "小心翼翼": "cẩn thận từng li từng tí",
    "雪上加霜": "họa vô đơn chí",
    "循序渐进": "tiến dần từng bước",
    "咬牙切齿": "nghiến răng căm giận",
    "一帆风顺": "thuận buồm xuôi gió",
    "一举两得": "một công đôi việc",
    "一目了然": "nhìn một lần là hiểu rõ",
    "一丝不苟": "tỉ mỉ, không cẩu thả",
    "再接再厉": "thừa thắng xông lên; tiếp tục cố gắng",
    "斩钉截铁": "dứt khoát như đinh đóng cột",
    "争先恐后": "tranh trước sợ sau",
    "知足常乐": "biết đủ thì luôn vui",
    "自力更生": "tự lực cánh sinh",
    "总而言之": "nói tóm lại",
}

NEGATIVE_IDIOMS = {
    "拔苗助长", "半途而废", "不屑一顾", "不择手段", "得不偿失", "丢三落四", "东张西望", "急功近利", "急于求成",
    "莫名其妙", "岂有此理", "肆无忌惮", "无动于衷", "无精打采", "无理取闹", "无能为力", "雪上加霜", "咬牙切齿",
}
POSITIVE_IDIOMS = {
    "安居乐业", "称心如意", "从容不迫", "得天独厚", "见多识广", "见义勇为", "竭尽全力", "锦绣前程", "精益求精",
    "聚精会神", "苦尽甘来", "齐心协力", "锲而不舍", "全力以赴", "深情厚谊", "实事求是", "无微不至", "无忧无虑",
    "欣欣向荣", "兴高采烈", "兴致勃勃", "一帆风顺", "再接再厉", "朝气蓬勃", "知足常乐", "自力更生",
}

CATEGORY_OVERRIDES = {
    "爱不释手": "Cảm xúc & trạng thái", "称心如意": "Cảm xúc & trạng thái", "恍然大悟": "Giao tiếp & tư duy",
    "津津有味": "Cảm xúc & trạng thái", "热泪盈眶": "Cảm xúc & trạng thái", "无动于衷": "Cảm xúc & trạng thái",
    "无精打采": "Cảm xúc & trạng thái", "无可奈何": "Cảm xúc & trạng thái", "无忧无虑": "Cảm xúc & trạng thái",
    "兴高采烈": "Cảm xúc & trạng thái", "兴致勃勃": "Cảm xúc & trạng thái", "咬牙切齿": "Cảm xúc & trạng thái",
    "半途而废": "Học tập & nỗ lực", "急功近利": "Học tập & nỗ lực", "急于求成": "Học tập & nỗ lực",
    "竭尽全力": "Học tập & nỗ lực", "精益求精": "Học tập & nỗ lực", "聚精会神": "Học tập & nỗ lực",
    "锲而不舍": "Học tập & nỗ lực", "全力以赴": "Học tập & nỗ lực", "循序渐进": "Học tập & nỗ lực", "再接再厉": "Học tập & nỗ lực",
    "不言而喻": "Giao tiếp & tư duy", "各抒己见": "Giao tiếp & tư duy", "滔滔不绝": "Giao tiếp & tư duy",
    "总而言之": "Giao tiếp & tư duy", "一目了然": "Giao tiếp & tư duy", "众所周知": "Giao tiếp & tư duy",
    "安居乐业": "Công việc & xã hội", "当务之急": "Công việc & xã hội", "供不应求": "Công việc & xã hội",
    "继往开来": "Công việc & xã hội", "举世闻名": "Công việc & xã hội", "举世瞩目": "Công việc & xã hội",
    "统筹兼顾": "Công việc & xã hội", "优胜劣汰": "Công việc & xã hội", "欣欣向荣": "Công việc & xã hội",
    "深情厚谊": "Quan hệ & phẩm chất", "天伦之乐": "Quan hệ & phẩm chất", "无微不至": "Quan hệ & phẩm chất",
    "一丝不苟": "Quan hệ & phẩm chất", "见义勇为": "Quan hệ & phẩm chất", "兢兢业业": "Quan hệ & phẩm chất",
}


def classify_category(hanzi: str, meaning: str) -> str:
    if hanzi in CATEGORY_OVERRIDES:
        return CATEGORY_OVERRIDES[hanzi]
    text = meaning.lower()
    if any(k in text for k in ("nói", "hiểu", "biết", "ý", "rõ", "thực sự", "tóm lại")):
        return "Giao tiếp & tư duy"
    if any(k in text for k in ("vui", "hài lòng", "nước mắt", "phấn khởi", "lo", "sức sống", "động lòng")):
        return "Cảm xúc & trạng thái"
    if any(k in text for k in ("cố gắng", "kiên trì", "tập trung", "hoàn thiện", "dốc", "chăm chỉ")):
        return "Học tập & nỗ lực"
    return "Tình huống & kết quả"


def build_idioms() -> dict[str, Any]:
    source = json.loads((ROOT / "assets" / "data" / "hsk6.json").read_text(encoding="utf-8"))
    items: dict[str, dict[str, Any]] = {}

    for raw in source:
        hanzi = plain(raw.get("hanzi"))
        if not re.fullmatch(r"[\u3400-\u9fff]{4}", hanzi) or hanzi in EXCLUDED_FOUR_CHAR_TERMS:
            continue
        examples = raw.get("examples") or []
        ex = split_example(examples[0]) if examples else {"zh": "", "pinyin": "", "vi": ""}
        meaning = plain(raw.get("meaning_vi") or raw.get("meaning"))
        tone = "Tiêu cực" if hanzi in NEGATIVE_IDIOMS else "Tích cực" if hanzi in POSITIVE_IDIOMS else "Trung tính"
        category = classify_category(hanzi, meaning)
        pinyin = plain(raw.get("pinyin"))
        initial = next((ch.upper() for ch in ascii_fold(pinyin) if ch.isalpha()), "#")
        items[hanzi] = {
            "id": "i-" + hashlib.sha1(hanzi.encode("utf-8")).hexdigest()[:10],
            "hanzi": hanzi,
            "pinyin": pinyin,
            "meaning": meaning,
            "equivalentVi": EQUIVALENTS.get(hanzi, meaning),
            "usage": "Dùng như một cụm cố định; chọn ngữ cảnh phù hợp với sắc thái của thành ngữ.",
            "example": ex,
            "category": category,
            "tone": tone,
            "hsk": int(raw.get("hsk") or 6),
            "initial": initial,
            "source": "Dữ liệu HSK6 trong project; biên tập lại nghĩa tương đương tiếng Việt.",
        }

    for hanzi, pinyin, meaning, equivalent, ex_zh, ex_vi, category, tone in CURATED_IDIOMS:
        if hanzi in items:
            continue
        initial = next((ch.upper() for ch in ascii_fold(pinyin) if ch.isalpha()), "#")
        items[hanzi] = {
            "id": "i-" + hashlib.sha1(hanzi.encode("utf-8")).hexdigest()[:10],
            "hanzi": hanzi,
            "pinyin": pinyin,
            "meaning": meaning,
            "equivalentVi": equivalent,
            "usage": "Ưu tiên dùng khi toàn bộ tình huống phù hợp với nghĩa bóng; không dịch máy từng chữ.",
            "example": {"zh": ex_zh, "pinyin": "", "vi": ex_vi},
            "category": category,
            "tone": tone,
            "hsk": 6,
            "initial": initial,
            "source": "Thành ngữ phổ dụng; ví dụ và đối chiếu tiếng Việt được biên soạn riêng.",
        }

    result = sorted(items.values(), key=lambda x: (x["initial"], ascii_fold(x["pinyin"]).lower(), x["hanzi"]))
    return {
        "meta": {
            "title": "Thành ngữ Trung – Việt",
            "version": 1,
            "organization": "A–Z theo Pinyin, kèm nhóm chủ đề và sắc thái.",
            "references": [
                "Dữ liệu HSK6 hiện có trong project",
                "Các danh sách thành ngữ thông dụng dùng trong đời sống và văn viết hiện đại",
                "Đối chiếu theo nguyên tắc dịch nghĩa, không dịch từng chữ",
            ],
            "count": len(result),
            "initials": sorted({x["initial"] for x in result if x["initial"] != "#"}),
        },
        "items": result,
    }


def write_json(name: str, payload: dict[str, Any]) -> None:
    path = OUT_DIR / name
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {path.relative_to(ROOT)} ({payload['meta']['count']} items)")


if __name__ == "__main__":
    write_json("grammar.json", build_grammar())
    write_json("idioms.json", build_idioms())
