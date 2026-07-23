#!/usr/bin/env python3
"""Build POS and sentence-component annotations used only by Luyen viet.

Requires Jieba and Stanza with the zh-hans tokenize,pos,lemma,depparse models. The
generated JSON is committed so browsers do not need NLP dependencies at runtime.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from collections import defaultdict
from pathlib import Path

import stanza
import jieba
import jieba.posseg as pseg


ROOT = Path(__file__).resolve().parents[1]
LEVEL_FILES = {
    1: ROOT / "assets/data/hsk1.json",
    **{level: ROOT / f"assets/data/writing/hsk{level}.json" for level in range(2, 7)},
}

JIEBA_POS_LABELS = {
    "n": "Danh từ", "ng": "Danh từ", "s": "Danh từ", "t": "Danh từ",
    "nr": "Danh từ riêng", "ns": "Danh từ riêng", "nt": "Danh từ riêng", "nz": "Danh từ riêng",
    "v": "Động từ", "vd": "Động từ", "vn": "Động từ",
    "a": "Tính từ", "ad": "Tính từ", "an": "Tính từ", "ag": "Tính từ", "b": "Tính từ", "z": "Tính từ",
    "d": "Phó từ", "m": "Số từ", "q": "Lượng từ", "r": "Đại từ", "p": "Giới từ",
    "c": "Liên từ", "u": "Trợ từ", "e": "Thán từ", "o": "Từ tượng thanh", "f": "Phương vị từ",
    "i": "Cụm từ", "l": "Cụm từ", "x": "Cụm từ",
}
WORD_TYPE_OVERRIDES = {
    "忙": ["Tính từ"], "饿": ["Tính từ"], "热": ["Tính từ"], "错": ["Tính từ", "Động từ"],
    "对": ["Tính từ", "Động từ", "Giới từ", "Lượng từ"], "可爱": ["Tính từ"], "满意": ["Tính từ", "Động từ"],
    "安静": ["Tính từ"], "高兴": ["Tính từ"], "生气": ["Tính từ", "Động từ"],
    "认真": ["Tính từ", "Phó từ"], "给": ["Động từ", "Giới từ"],
    "和": ["Liên từ", "Giới từ"], "跟": ["Động từ", "Giới từ", "Liên từ"],
    "把": ["Lượng từ", "Giới từ"], "过": ["Động từ", "Trợ từ"], "得": ["Động từ", "Trợ từ"],
    "地": ["Danh từ", "Trợ từ"], "着": ["Động từ", "Trợ từ"], "在": ["Động từ", "Giới từ", "Phó từ"],
    "为": ["Động từ", "Giới từ"], "还": ["Động từ", "Phó từ"], "要": ["Động từ", "Phó từ"],
    "多": ["Tính từ", "Phó từ", "Số từ"], "好": ["Tính từ", "Phó từ"],
    "可能": ["Danh từ", "Tính từ", "Phó từ"], "通过": ["Động từ", "Giới từ"],
    "由于": ["Giới từ", "Liên từ"], "因为": ["Giới từ", "Liên từ"],
    "本": ["Lượng từ"], "家": ["Danh từ", "Lượng từ"], "班": ["Danh từ", "Lượng từ"],
    "包": ["Danh từ", "Động từ", "Lượng từ"], "杯": ["Danh từ", "Lượng từ"],
    "场": ["Danh từ", "Lượng từ"], "点": ["Danh từ", "Động từ", "Số từ", "Lượng từ"],
    "回": ["Động từ", "Lượng từ"],
    "不客气": ["Cụm từ"], "东西": ["Danh từ"], "很": ["Phó từ"],
    "吗": ["Trợ từ"], "呢": ["Trợ từ"], "没": ["Phó từ", "Động từ"],
    "哪里 (哪儿)": ["Đại từ"], "年": ["Danh từ", "Lượng từ"],
    "日": ["Danh từ", "Lượng từ"], "月": ["Danh từ", "Lượng từ"], "岁": ["Lượng từ"],
    "谢谢": ["Động từ", "Thán từ"], "小姐": ["Danh từ"], "喂": ["Thán từ", "Động từ"],
    "工作": ["Danh từ", "Động từ"], "分钟": ["Danh từ", "Lượng từ"],
    "块": ["Danh từ", "Lượng từ"], "些": ["Lượng từ"],
    "上": ["Động từ", "Phương vị từ"], "下": ["Động từ", "Phương vị từ"],
}
MEASURE_WORDS = {
    "把", "班", "包", "杯", "本", "遍", "层", "场", "次", "袋", "道", "滴", "点",
    "栋", "段", "对", "朵", "份", "封", "幅", "个", "根", "公斤", "公里", "罐",
    "户", "回", "家", "件", "间", "节", "届", "斤", "句", "棵", "颗", "口", "块",
    "类", "辆", "名", "排", "盘", "篇", "瓶", "期", "群", "扇", "首", "双", "所",
    "台", "套", "条", "头", "位", "项", "页", "张", "支", "只", "种", "座",
}

ROLE_LABELS = {
    "subject": "Chủ ngữ",
    "predicate": "Vị ngữ",
    "object": "Tân ngữ",
    "adverbial": "Trạng ngữ",
    "attribute": "Định ngữ",
    "complement": "Bổ ngữ",
    "conjunction": "Liên từ",
    "time": "Thành phần thời gian",
    "location": "Thành phần địa điểm",
    "purpose": "Thành phần mục đích",
    "reason": "Thành phần nguyên nhân",
    "condition": "Thành phần điều kiện",
    "head": "Trung tâm ngữ",
    "subject-head": "Trung tâm chủ ngữ",
    "object-head": "Trung tâm tân ngữ",
    "ba": "Cấu trúc 把",
    "bei": "Cấu trúc 被",
    "pp": "Cụm giới từ",
}

TIME_WORDS = {
    "昨天", "今天", "明天", "前天", "后天", "现在", "刚才", "早上", "上午", "中午",
    "下午", "晚上", "每天", "每年", "每月", "周末", "星期", "时候", "以前", "以后",
    "最近", "一会儿",
}
LOCATION_MARKERS = ("在", "从", "到", "向", "往", "离", "沿着")
PURPOSE_MARKERS = ("为了", "为", "以便", "好让")
REASON_MARKERS = ("因为", "由于", "既然", "因", "鉴于")
CONDITION_MARKERS = ("如果", "要是", "只要", "除非", "即使", "哪怕")
CONJUNCTIONS = {
    "和", "与", "及", "而", "而且", "但是", "可是", "不过", "所以", "因此", "如果",
    "虽然", "尽管", "既然", "否则", "或者", "还是", "并且", "然后", "于是", "同时",
    "不但", "不仅",
}
MENTAL_VERBS = {
    "爱", "喜欢", "希望", "想", "觉得", "认为", "知道", "相信", "同意", "决定", "发现",
    "记得", "忘记", "担心", "怕", "决定", "准备",
}
SPLIT_BEFORE_ZAI = {"坐", "住", "放", "站", "躺", "留", "停", "写", "挂", "贴", "装", "摆", "洒", "倒", "扔", "落"}
SURFACE_ADVERBS = {
    "也", "又", "却", "则", "都", "就", "才", "还", "再", "正", "正在", "已经", "曾经",
    "总", "总是", "很", "太", "更", "最", "终于", "只", "仅", "仅仅", "大概", "可能", "一定",
}
RESULTATIVE_SUFFIXES = (
    "起来", "下来", "下去", "上来", "上去", "出来", "进去", "回来", "回去", "过来", "过去",
    "干净", "清楚", "明白", "完整", "成功", "完", "好", "到", "见", "懂", "开", "住", "走", "掉", "成", "满",
)
RESULTATIVE_EXCLUSIONS = {
    "完成", "成功", "明白", "清楚", "起来", "下来", "下去", "上来", "上去", "出来", "进去",
    "回来", "回去", "过来", "过去", "看到", "见到", "知道", "得到", "觉得", "获得", "值得", "赢得",
}
LEXICAL_DE_WORDS = {"觉得", "获得", "值得", "赢得", "得到", "舍不得"}


def clean_hanzi(value: object) -> str:
    return str(value or "").strip()


def load_source():
    words: set[str] = set()
    sentences: set[str] = set()
    for level, path in LEVEL_FILES.items():
        rows = json.loads(path.read_text(encoding="utf-8"))
        for row in rows:
            hanzi = clean_hanzi(row.get("hanzi") or row.get("chinese") or row.get("word"))
            if hanzi:
                words.add(hanzi)
            examples = row.get("examples") if isinstance(row.get("examples"), list) else []
            if level >= 2:
                examples = examples[:1]
            for example in examples:
                sentence = clean_hanzi(example.get("hanzi") or example.get("chinese"))
                if sentence:
                    sentences.add(sentence)
    return sorted(words), sorted(sentences)


def chunks(items, size):
    for index in range(0, len(items), size):
        yield items[index:index + size]


def pretokenized_document(text):
    tokens = []
    for token in jieba.cut(text, HMM=False):
        if token in {"这是", "那是", "哪是", "谁是"}:
            tokens.extend((token[:-1], token[-1]))
        elif token.endswith("在") and token[:-1] in SPLIT_BEFORE_ZAI:
            tokens.extend((token[:-1], "在"))
        elif token.endswith("得") and token not in LEXICAL_DE_WORDS and len(token) > 1:
            tokens.extend((token[:-1], "得"))
        else:
            suffix = next((item for item in RESULTATIVE_SUFFIXES if token.endswith(item) and token != item), None)
            internal_suffix = next((item for item in RESULTATIVE_SUFFIXES if 0 < token.find(item) < len(token) - len(item)), None)
            if suffix and token not in RESULTATIVE_EXCLUSIONS:
                tokens.extend((token[:-len(suffix)], suffix))
            elif internal_suffix and token not in RESULTATIVE_EXCLUSIONS:
                position = token.find(internal_suffix)
                tokens.extend((token[:position], internal_suffix, token[position + len(internal_suffix):]))
            else:
                tokens.append(token)
    sentence = [{"id": index + 1, "text": token} for index, token in enumerate(tokens)]
    return stanza.Document([sentence], text=text)


def build_word_types(_nlp, words):
    output = {}
    for source in words:
        if source in WORD_TYPE_OVERRIDES:
            output[source] = WORD_TYPE_OVERRIDES[source]
            continue
        labels = ["Lượng từ"] if source in MEASURE_WORDS else []
        for token in pseg.cut(source):
            prefix = token.flag if token.flag in JIEBA_POS_LABELS else token.flag[:1]
            label = JIEBA_POS_LABELS.get(prefix)
            if label and label not in labels:
                labels.append(label)
        output[source] = labels or ["Cụm từ"]
    return output


def subtree_ids(words, root_id):
    children = defaultdict(list)
    for word in words:
        children[word.head].append(word.id)
    result = set()
    pending = [root_id]
    while pending:
        current = pending.pop()
        if current in result:
            continue
        result.add(current)
        pending.extend(children[current])
    return result


def subtree_text(words, root_id):
    ids = subtree_ids(words, root_id)
    return "".join(word.text for word in words if word.id in ids and word.upos != "PUNCT")


def starts_with_marker(text, markers):
    compact = re.sub(r"\s+", "", text)
    return any(compact.startswith(marker) for marker in markers)


def is_time_expression(text):
    return (
        any(marker in text for marker in TIME_WORDS)
        or bool(re.fullmatch(r"[零〇一二两三四五六七八九十百千万\d]+(?:点|时|分钟|分|秒)", text))
    )


def sentence_components(sentence):
    words = sentence.words
    by_id = {word.id: word for word in words}
    roles = {}
    surface_roles = {}

    root_position = next((word.id for word in words if word.head == 0 or word.deprel == "root"), 10**9)
    resultative_ids = {
        word.id for index, word in enumerate(words)
        if word.text in RESULTATIVE_SUFFIXES and index > 0 and words[index - 1].upos in {"VERB", "ADJ"}
    }
    de_complement_ids = set()
    for index, word in enumerate(words):
        if word.text != "得" or index == 0:
            continue
        de_complement_ids.add(word.id)
        for following in words[index + 1:]:
            if following.upos == "PUNCT" or following.text in CONJUNCTIONS:
                break
            de_complement_ids.add(following.id)

    for index, word in enumerate(words):
        if word.id in de_complement_ids or word.id in resultative_ids:
            surface_roles[word.id] = "complement"
        elif word.text in SURFACE_ADVERBS:
            surface_roles[word.id] = "adverbial"
        elif word.text == "的":
            surface_roles[word.id] = "attribute"
        elif word.text == "把":
            surface_roles[word.id] = "ba"
        elif word.text == "被":
            surface_roles[word.id] = "bei"
        elif word.text in {"来", "去"} and word.upos in {"VERB", "AUX", "SCONJ"}:
            surface_roles[word.id] = "predicate"
        if word.text in LOCATION_MARKERS and index + 1 < len(words):
            location_role = "complement" if word.id > root_position else "location"
            surface_roles[word.id] = location_role
            for following in words[index + 1:]:
                if following.upos == "PUNCT" or following.text in CONJUNCTIONS:
                    break
                if location_role == "location" and following.upos in {"VERB", "ADJ", "AUX"}:
                    break
                surface_roles[following.id] = location_role

    for index, word in enumerate(words):
        if word.id not in resultative_ids:
            continue
        for following in words[index + 1:]:
            if following.upos == "PUNCT" or following.text in CONJUNCTIONS:
                break
            if following.upos in {"NOUN", "PROPN", "PRON"}:
                surface_roles[following.id] = "object"
                break

    # 把 introduces the disposed patient; 被 introduces an agentive prepositional phrase.
    for index, word in enumerate(words):
        if word.text not in {"把", "被"}:
            continue
        phrase_role = "object" if word.text == "把" else "adverbial"
        phrase_started = False
        for following in words[index + 1:]:
            if phrase_started and (following.upos in {"VERB", "ADJ", "AUX"} or following.upos == "PUNCT"):
                break
            surface_roles[following.id] = phrase_role
            phrase_started = True

    # Clause-level semantic roles take precedence over their internal syntax.
    clause_roles = {}
    for word in words:
        relation = word.deprel.split(":", 1)[0]
        if relation not in {"advcl", "ccomp", "xcomp", "obl"}:
            continue
        text = subtree_text(words, word.id)
        if starts_with_marker(text, REASON_MARKERS):
            clause_roles[word.id] = "reason"
        elif starts_with_marker(text, PURPOSE_MARKERS):
            clause_roles[word.id] = "purpose"
        elif starts_with_marker(text, CONDITION_MARKERS):
            clause_roles[word.id] = "condition"
        elif starts_with_marker(text, LOCATION_MARKERS):
            clause_roles[word.id] = "location"

    def enclosing_clause_role(word_id):
        current = word_id
        while current:
            if current in clause_roles:
                return clause_roles[current]
            current = by_id[current].head if current in by_id else 0
        return None

    for word in words:
        relation = word.deprel
        base_relation = relation.split(":", 1)[0]
        if word.id in surface_roles:
            roles[word.id] = surface_roles[word.id]
            continue
        clause_role = enclosing_clause_role(word.id)
        if clause_role:
            roles[word.id] = clause_role
            continue
        if word.upos == "PUNCT":
            roles[word.id] = "punct"
        elif word.text == "是" and base_relation == "cop":
            roles[word.id] = "predicate"
        elif relation in {"nsubj", "csubj", "nsubj:pass"}:
            roles[word.id] = "subject"
        elif base_relation in {"obj", "iobj"} or relation == "obl:patient":
            roles[word.id] = "object"
        elif relation == "nmod:tmod" or is_time_expression(word.text):
            roles[word.id] = "time"
        elif base_relation in {"amod", "det", "nummod", "clf", "acl"} or relation == "nmod":
            roles[word.id] = "attribute"
        elif word.text in CONJUNCTIONS and word.upos in {"CCONJ", "SCONJ", "ADV", "PART"}:
            roles[word.id] = "conjunction"
        elif word.upos == "ADV" or base_relation == "advmod":
            roles[word.id] = "adverbial"
        elif base_relation == "cc" or word.upos in {"CCONJ", "SCONJ"}:
            roles[word.id] = "conjunction"
        elif base_relation == "advcl" and word.upos in {"VERB", "ADJ"}:
            roles[word.id] = "predicate"
        elif base_relation in {"advcl", "obl"}:
            roles[word.id] = "adverbial"
        elif base_relation in {"xcomp", "ccomp"}:
            head_text = by_id.get(word.head).text if by_id.get(word.head) else ""
            if head_text in MENTAL_VERBS:
                roles[word.id] = "object"
            elif word.upos in {"VERB", "ADJ"}:
                roles[word.id] = "predicate"
            else:
                roles[word.id] = "complement"
        elif base_relation == "conj" and word.upos in {"VERB", "ADJ"}:
            roles[word.id] = "predicate"
        elif word.head == 0 or relation == "root":
            has_copula = any(candidate.head == word.id and candidate.text == "是" for candidate in words)
            roles[word.id] = "object" if has_copula and word.upos in {"NOUN", "PROPN", "PRON"} else "predicate"

    # In simple clauses, a leading nominal/pronoun before the predicate is the subject.
    for word in words:
        if word.id >= root_position or word.upos not in {"NOUN", "PROPN", "PRON"}:
            continue
        if not is_time_expression(word.text) and roles.get(word.id) not in {"attribute", "object", "location"}:
            roles[word.id] = "subject"
            break

    if "predicate" not in roles.values():
        root_word = next((word for word in words if word.head == 0 or word.deprel == "root"), None)
        if root_word:
            roles[root_word.id] = "predicate"

    def inherited_role(word):
        current = word
        seen = set()
        while current and current.id not in seen:
            seen.add(current.id)
            if current.id in roles and roles[current.id] != "punct":
                return roles[current.id]
            current = by_id.get(current.head)
        return "predicate"

    assigned = []
    previous_role = "predicate"
    for word in words:
        role = roles.get(word.id)
        if role == "punct":
            assigned.append((word.text, previous_role, True))
            continue
        role = role or inherited_role(word)
        previous_role = role
        assigned.append((word.text, role, False))

    # Mark the lexical head explicitly when an attributive phrase modifies S or O.
    for index in range(1, len(assigned)):
        text, role, punctuation = assigned[index]
        if punctuation or assigned[index - 1][1] != "attribute":
            continue
        if role == "subject":
            assigned[index] = (text, "subject-head", False)
        elif role == "object":
            assigned[index] = (text, "object-head", False)

    grouped = []
    for text, role, punctuation in assigned:
        if punctuation and grouped:
            grouped[-1]["text"] += text
        elif grouped and grouped[-1]["key"] == role:
            grouped[-1]["text"] += text
        else:
            grouped.append({"text": text, "key": role, "label": ROLE_LABELS[role]})
    return grouped


def build_sentence_annotations(nlp, sources):
    output = {}
    for batch in chunks(sources, 64):
        docs = nlp.bulk_process([pretokenized_document(text) for text in batch])
        for source, doc in zip(batch, docs):
            components = []
            for sentence in doc.sentences:
                components.extend(sentence_components(sentence))
            output[source] = components
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", default=os.environ.get("STANZA_DIR", str(Path.cwd() / ".stanza")))
    parser.add_argument("--output", default=str(ROOT / "assets/data/writing/annotations.json"))
    args = parser.parse_args()

    words, sentences = load_source()
    nlp = stanza.Pipeline(
        "zh-hans",
        dir=args.model_dir,
        processors="tokenize,pos,lemma,depparse",
        tokenize_pretokenized=True,
        use_gpu=False,
        logging_level="WARN",
    )
    payload = {
        "meta": {
            "levels": ["hsk1", "hsk2", "hsk3", "hsk4", "hsk5", "hsk6"],
            "wordCount": len(words),
            "sentenceCount": len(sentences),
            "source": "Luyen viet data + Stanza zh-hans POS/dependency parse + Chinese grammar rules",
        },
        "wordTypes": build_word_types(nlp, words),
        "sentences": build_sentence_annotations(nlp, sentences),
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Generated {output.relative_to(ROOT)}: {len(words)} words, {len(sentences)} sentences")


if __name__ == "__main__":
    main()
