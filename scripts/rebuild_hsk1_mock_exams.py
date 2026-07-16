from __future__ import annotations

import json
from pathlib import Path

from pypinyin import Style, lazy_pinyin


ROOT = Path(__file__).resolve().parents[1]
EXAM_DIR = ROOT / "assets" / "data" / "thi-thu" / "exams"

EXAMS = [
    ("hsk1-h10901", "H10901", "Sinh hoạt hằng ngày"),
    ("hsk1-h10902", "H10902", "Gia đình và trường học"),
    ("hsk1-h11003", "H11003", "Ăn uống và mua sắm"),
    ("hsk1-h11004", "H11004", "Thời gian và đi lại"),
    ("hsk1-h11005", "H11005", "Sở thích và nơi chốn"),
]

EXAM_ONE_TEXT_ITEMS = [
    ("她在喝水。", "她在喝水。", True),
    ("他在看书。", "他不看书，他看电视。", False),
    ("他去学校。", "他坐车去学校。", True),
    ("桌子上有一个苹果。", "桌子上没有苹果。", False),
    ("妈妈在做饭。", "妈妈在做饭。", True),
]

EXAM_ONE_DIALOGUES_1 = [
    ("小李，你喝茶吗？\n不，我喝水。\n小李喝什么？", "水", ["茶", "水", "咖啡"]),
    ("小月，你去哪儿？\n我去学校。\n小月去哪儿？", "学校", ["医院", "学校", "商店"]),
    ("现在几点？\n十点。\n现在几点？", "十点", ["八点", "九点", "十点"]),
    ("小王，这是你的书吗？\n是，这是我的书。\n书是谁的？", "小王的", ["小王的", "老师的", "小月的"]),
    ("你妈妈好吗？\n她很好。\n妈妈怎么样？", "很好", ["很好", "很忙", "很冷"]),
]

EXAM_ONE_DIALOGUES_2 = [
    ("你的汉语书呢？\n在桌子上，那本红色的书就是。\n汉语书是什么颜色的？", "红色", ["红色", "白色", "蓝色"]),
    ("你上午有课吗？\n有，九点开始。\n课几点开始？", "九点", ["八点", "九点", "十点"]),
    ("你为什么不吃苹果？\n我不想吃，我想喝水。\n这个人想要什么？", "水", ["苹果", "水", "米饭"]),
    ("张老师今天来学校吗？\n不来，他今天在家。\n张老师今天在哪儿？", "家", ["学校", "医院", "家"]),
    ("桌子下面是什么？\n是我的小猫。\n小猫在哪儿？", "桌子下面", ["桌子下面", "椅子上面", "门后面"]),
]


def pinyin(text: str) -> str:
    parts = lazy_pinyin(text, style=Style.TONE, neutral_tone_with_five=False, errors=lambda chars: list(chars))
    out = " ".join(parts)
    for mark in "，。？！：；、":
        out = out.replace(f" {mark}", mark)
    return out


def option(letter: str, text: str) -> dict:
    return {"id": letter, "text": text, "pinyin": pinyin(text)}


SCENES = [
    ("A young Chinese woman drinking a glass of water at a kitchen table", "她在喝水。", True),
    ("A Chinese boy reading a book beside a sunny window", "他在看书。", True),
    ("A Chinese man standing beside a bicycle while holding a car key", "他开车去学校。", False),
    ("A Chinese girl eating one red apple at a dining table", "桌子上有一个苹果。", True),
    ("A Chinese mother cooking in a home kitchen while her child watches", "妈妈在睡觉。", False),
    ("A Chinese family of three smiling together in a living room", "他们是三个人。", True),
    ("A Chinese schoolgirl writing Chinese characters in a notebook at a desk", "她在写汉字。", True),
    ("A Chinese teacher standing in front of a classroom blackboard", "他是医生。", False),
    ("A Chinese father calling his daughter on a smartphone", "爸爸在打电话。", True),
    ("A Chinese boy sitting alone at a table with two empty chairs", "桌子旁边有三个人。", False),
    ("A Chinese woman buying vegetables from a market stall", "她在买菜。", True),
    ("A Chinese man eating noodles with chopsticks in a small restaurant", "他在喝茶。", False),
    ("A Chinese girl holding two cups of tea on a tray", "她有两杯茶。", True),
    ("A Chinese shop assistant showing a blue shirt to a customer", "这件衣服是蓝色的。", True),
    ("A Chinese boy looking into an empty refrigerator", "冰箱里有很多水果。", False),
    ("A red city bus stopping at a bus stop with one Chinese passenger waiting", "公共汽车来了。", True),
    ("A wall clock clearly showing eight o'clock in a simple room", "现在八点。", True),
    ("A Chinese woman walking under a red umbrella in heavy rain", "今天天气很好，没有雨。", False),
    ("A Chinese man arriving at an airport pulling a small suitcase", "他在飞机场。", True),
    ("A Chinese girl sleeping in bed while an alarm clock shows seven", "她七点起床。", False),
    ("A Chinese boy playing basketball alone on an outdoor court", "他喜欢打篮球。", True),
    ("A Chinese woman watching television on a sofa", "她在看电视。", True),
    ("A Chinese man swimming in a clean indoor pool", "他在跑步。", False),
    ("A Chinese girl sitting in a library surrounded by bookshelves", "她在商店。", False),
    ("A Chinese grandfather and grandson walking a small dog in a park", "他们在公园。", True),
]


LISTEN_FACTS = [
    "我上午九点去学校。", "桌子上有一本汉语书。", "她喜欢喝热茶。", "王老师在北京工作。", "今天星期三。",
    "我家有四个人。", "妹妹今年十岁。", "学生都在教室里。", "他的爸爸是医生。", "我认识那个老师。",
    "这个苹果五块钱。", "我想买一杯咖啡。", "米饭已经做好了。", "商店里有很多衣服。", "她不吃羊肉。",
    "飞机下午三点到。", "我坐公共汽车回家。", "昨天北京下雨了。", "他六点半起床。", "火车站在前面。",
    "我们一起去看电影。", "小猫在椅子下面。", "她会说一点汉语。", "医院在学校后面。", "我星期天不工作。",
]


DIALOGUES_1 = [
    ("女：你喝茶吗？\n男：不，我喝水。\n问：男的喝什么？", "水", ["茶", "水", "咖啡"]),
    ("男：你去哪儿？\n女：我去学校。\n问：女的去哪儿？", "学校", ["医院", "学校", "商店"]),
    ("女：现在几点？\n男：十点。\n问：现在几点？", "十点", ["八点", "九点", "十点"]),
    ("男：这是谁的书？\n女：是我的。\n问：这是谁的书？", "女的", ["男的", "女的", "老师的"]),
    ("女：你妈妈好吗？\n男：她很好。\n问：男的妈妈怎么样？", "很好", ["很好", "很忙", "很冷"]),
    ("男：你家有几个人？\n女：有五个人。\n问：女的家有几个人？", "五个人", ["三个人", "四个人", "五个人"]),
    ("女：他是你哥哥吗？\n男：不是，他是我同学。\n问：他是谁？", "男的的同学", ["男的的哥哥", "男的的同学", "男的的老师"]),
    ("男：老师在哪儿？\n女：在教室里。\n问：老师在哪儿？", "教室里", ["家里", "教室里", "学校外面"]),
    ("女：你女儿多大？\n男：她八岁。\n问：男的女儿多大？", "八岁", ["六岁", "七岁", "八岁"]),
    ("男：你认识李老师吗？\n女：认识，她教我汉语。\n问：谁教女的汉语？", "李老师", ["王老师", "李老师", "张医生"]),
    ("女：你想吃什么？\n男：我想吃米饭。\n问：男的想吃什么？", "米饭", ["面条", "米饭", "苹果"]),
    ("男：这个杯子多少钱？\n女：十八块。\n问：杯子多少钱？", "十八块", ["八块", "十块", "十八块"]),
    ("女：你买什么了？\n男：我买了三个苹果。\n问：男的买了几个苹果？", "三个", ["一个", "两个", "三个"]),
    ("男：你喜欢这件衣服吗？\n女：喜欢，但是太大了。\n问：衣服怎么样？", "太大了", ["太小了", "太大了", "太贵了"]),
    ("女：你喝咖啡吗？\n男：不喝，我喜欢喝茶。\n问：男的喜欢喝什么？", "茶", ["水", "咖啡", "茶"]),
    ("男：你怎么去北京？\n女：我坐飞机去。\n问：女的怎么去北京？", "坐飞机", ["坐飞机", "坐火车", "坐公共汽车"]),
    ("女：今天天气怎么样？\n男：很冷。\n问：今天天气怎么样？", "很冷", ["很热", "很冷", "很好"]),
    ("男：你几点回家？\n女：下午五点。\n问：女的几点回家？", "下午五点", ["上午五点", "下午三点", "下午五点"]),
    ("女：火车站远吗？\n男：不远，就在前面。\n问：火车站在哪儿？", "前面", ["前面", "后面", "里面"]),
    ("男：明天星期几？\n女：明天星期六。\n问：明天星期几？", "星期六", ["星期五", "星期六", "星期日"]),
    ("女：你会游泳吗？\n男：会，我星期天常去游泳。\n问：男的会做什么？", "游泳", ["开车", "游泳", "做饭"]),
    ("男：你喜欢看电影吗？\n女：不，我喜欢看电视。\n问：女的喜欢做什么？", "看电视", ["看电影", "看电视", "看书"]),
    ("女：小狗在哪儿？\n男：在桌子下面。\n问：小狗在哪儿？", "桌子下面", ["桌子上面", "椅子后面", "桌子下面"]),
    ("男：你在医院工作吗？\n女：不，我在商店工作。\n问：女的在哪儿工作？", "商店", ["医院", "商店", "学校"]),
    ("女：你星期天做什么？\n男：我和朋友去公园。\n问：男的星期天去哪儿？", "公园", ["饭店", "公园", "学校"]),
]


DIALOGUES_2 = [
    ("女：你的汉语书呢？\n男：在桌子上，那本红色的书就是。\n问：汉语书是什么颜色的？", "红色", ["红色", "白色", "蓝色"]),
    ("男：你上午有课吗？\n女：有，九点开始。\n问：课几点开始？", "九点", ["八点", "九点", "十点"]),
    ("女：你为什么不吃苹果？\n男：我不想吃，我想喝水。\n问：男的想要什么？", "水", ["苹果", "水", "米饭"]),
    ("男：张老师今天来学校吗？\n女：不来，他今天在家。\n问：张老师今天在哪儿？", "家", ["学校", "医院", "家"]),
    ("女：桌子下面是什么？\n男：是我的小猫。\n问：小猫在哪儿？", "桌子下面", ["桌子下面", "椅子上面", "门后面"]),
    ("男：你妹妹也是学生吗？\n女：是，她在北京学习。\n问：女的妹妹在哪儿学习？", "北京", ["北京", "上海", "家里"]),
    ("女：你爸爸几点下班？\n男：下午六点，他六点半到家。\n问：男的爸爸几点到家？", "六点半", ["五点半", "六点", "六点半"]),
    ("男：你们班有多少学生？\n女：二十个，男生和女生一样多。\n问：班里有多少学生？", "二十个", ["十个", "十二个", "二十个"]),
    ("女：这是你的照片吗？\n男：是，照片里是我和哥哥。\n问：照片里有谁？", "男的和哥哥", ["男的和哥哥", "男的和妹妹", "男的和老师"]),
    ("男：你给谁打电话？\n女：给妈妈，她今天生日。\n问：今天是谁的生日？", "女的的妈妈", ["女的", "女的的妈妈", "男的的妈妈"]),
    ("女：你买的西瓜大吗？\n男：很大，也很甜。\n问：西瓜怎么样？", "又大又甜", ["又大又甜", "很小", "不甜"]),
    ("男：我们去饭店吃饭吧。\n女：好，我想吃中国菜。\n问：女的想吃什么？", "中国菜", ["米饭", "中国菜", "水果"]),
    ("女：这件衣服一百块，那件五十块。\n男：我要便宜的。\n问：男的要多少钱的衣服？", "五十块", ["五十块", "八十块", "一百块"]),
    ("男：冰箱里有鸡蛋吗？\n女：没有，只有牛奶。\n问：冰箱里有什么？", "牛奶", ["鸡蛋", "牛奶", "水果"]),
    ("女：服务员，请给我一杯热茶。\n男：好的，请等一下。\n问：女的要什么？", "热茶", ["冷水", "热茶", "咖啡"]),
    ("男：你几点的飞机？\n女：下午四点，我两点去飞机场。\n问：女的几点去飞机场？", "下午两点", ["下午一点", "下午两点", "下午四点"]),
    ("女：外面下雨了，你怎么回家？\n男：我坐出租车回去。\n问：男的怎么回家？", "坐出租车", ["走路", "坐公共汽车", "坐出租车"]),
    ("男：昨天很冷，今天呢？\n女：今天不冷，也不热。\n问：今天天气怎么样？", "不冷也不热", ["很冷", "很热", "不冷也不热"]),
    ("女：公共汽车来了，我们走吧。\n男：等一下，我的朋友还没来。\n问：男的在等谁？", "朋友", ["老师", "朋友", "医生"]),
    ("男：现在七点半，电影八点开始。\n女：我们还有半个小时。\n问：电影几点开始？", "八点", ["七点", "七点半", "八点"]),
    ("女：你每天都跑步吗？\n男：不，我星期一和星期五跑步。\n问：男的什么时候跑步？", "星期一和星期五", ["每天", "星期一和星期五", "星期六和星期日"]),
    ("男：这是谁的电脑？\n女：是李老师的，他在后面打电话。\n问：电脑是谁的？", "李老师的", ["男的的", "女的的", "李老师的"]),
    ("女：你会写这个汉字吗？\n男：会写，但是我不会读。\n问：男的不会做什么？", "读这个汉字", ["写这个汉字", "读这个汉字", "看这个汉字"]),
    ("男：医院在这儿吗？\n女：不在，医院在学校的东边。\n问：医院在哪儿？", "学校东边", ["学校东边", "学校西边", "学校里面"]),
    ("女：周末你想去哪儿？\n男：上午去公园，下午在家看书。\n问：男的下午做什么？", "在家看书", ["去公园", "在家看书", "去商店"]),
]


READING_TF = [
    ("今天星期一。", "明天星期二。", True), ("他有两本书。", "他没有书。", False),
    ("妈妈是医生，在医院工作。", "妈妈是医生。", True), ("小王不喝咖啡。", "小王喜欢喝咖啡。", False),
    ("我八点去学校。", "我上午去学校。", True), ("我家有爸爸、妈妈和我。", "我家有三个人。", True),
    ("姐姐今年二十岁。", "姐姐十二岁。", False), ("老师在教室里面。", "老师不在教室。", False),
    ("这是我的朋友李明。", "我认识李明。", True), ("爸爸会说汉语，不会说英语。", "爸爸会说英语。", False),
    ("苹果三块钱一个。", "两个苹果六块钱。", True), ("杯子里没有水。", "杯子是空的。", True),
    ("他想吃米饭，不想吃面条。", "他想吃面条。", False), ("这件衣服太小了。", "这件衣服很大。", False),
    ("桌子上有茶和水果。", "桌子上有东西。", True), ("现在下午四点。", "现在不是上午。", True),
    ("今天下雨，很冷。", "今天天气很热。", False), ("飞机十点到北京。", "飞机上午到北京。", True),
    ("学校在医院前面。", "医院在学校后面。", True), ("他坐出租车去火车站。", "他走路去火车站。", False),
    ("妹妹喜欢看电影。", "妹妹不喜欢电影。", False), ("小狗在椅子下面。", "椅子下面有一只小狗。", True),
    ("她会游泳，也会开车。", "她会做两件事。", True), ("商店今天不开门。", "今天可以买东西。", False),
    ("我们星期天去公园。", "我们周末去公园。", True),
]


COMPLETIONS = [
    ("我___中国人。", "是", ["是", "有", "在"]), ("他___北京工作。", "在", ["是", "在", "喝"]),
    ("桌子上___一本书。", "有", ["有", "是", "去"]), ("你___什么名字？", "叫", ["看", "叫", "吃"]),
    ("我不___咖啡。", "喝", ["喝", "坐", "写"]), ("她是我___。", "妈妈", ["天气", "妈妈", "学校"]),
    ("弟弟今年十___。", "岁", ["个", "岁", "本"]), ("王老师教___汉语。", "我们", ["我们", "你们的", "他们的"]),
    ("这___我的同学。", "是", ["在", "有", "是"]), ("我___写汉字。", "会", ["会", "想", "叫"]),
    ("我想___一个苹果。", "买", ["买", "看", "听"]), ("请给我一___茶。", "杯", ["本", "杯", "块"]),
    ("这个西瓜很___。", "大", ["大", "多", "高兴"]), ("你想吃米饭___面条？", "还是", ["吗", "还是", "呢"]),
    ("商店里有很多___。", "衣服", ["衣服", "天气", "名字"]), ("我下午三点___家。", "回", ["回", "来", "开"]),
    ("今天___冷。", "很", ["很", "都", "也"]), ("他坐飞机___上海。", "去", ["去", "在", "有"]),
    ("火车站在学校___。", "后面", ["里面", "后面", "时候"]), ("我们八点___见。", "学校", ["学校", "学生", "学习"]),
    ("我喜欢___电影。", "看", ["看", "听", "说"]), ("猫在桌子___。", "下面", ["下面", "前面", "上个"]),
    ("她汉语说___很好。", "得", ["的", "得", "了"]), ("星期天我不___。", "工作", ["工作", "天气", "朋友"]),
    ("我们一起去___吧。", "公园", ["公园", "医生", "苹果"]),
]


QA_ITEMS = [
    ("你叫什么名字？", "我叫李月。", ["我叫李月。", "我很好。", "我二十岁。"]),
    ("你是哪国人？", "我是中国人。", ["我在中国。", "我是中国人。", "我说汉语。"]),
    ("你几点去学校？", "我八点去。", ["我八点去。", "我去学校。", "我坐车去。"]),
    ("这是谁的书？", "是我的书。", ["是汉语书。", "在桌子上。", "是我的书。"]),
    ("你喜欢喝什么？", "我喜欢喝茶。", ["我喜欢喝茶。", "我不吃米饭。", "我有一个杯子。"]),
    ("你家有几个人？", "我家有四个人。", ["我家很大。", "我家有四个人。", "他们在家。"]),
    ("你妈妈做什么工作？", "她是老师。", ["她在学校。", "她很好。", "她是老师。"]),
    ("你哥哥多大？", "他十八岁。", ["他十八岁。", "他是学生。", "他很高。"]),
    ("老师在哪儿？", "老师在教室里。", ["老师在教室里。", "老师教汉语。", "老师姓王。"]),
    ("你会说汉语吗？", "会说一点儿。", ["我喜欢汉语。", "会说一点儿。", "汉语不难。"]),
    ("这个苹果多少钱？", "三块钱。", ["三个苹果。", "三块钱。", "苹果很大。"]),
    ("你想吃什么？", "我想吃面条。", ["我想吃面条。", "我会做饭。", "我吃了。"]),
    ("杯子里有什么？", "有一些水。", ["杯子很小。", "有一些水。", "我喝水。"]),
    ("这件衣服怎么样？", "很好看。", ["五十块。", "在商店。", "很好看。"]),
    ("你要买多少个？", "我要买两个。", ["我要买两个。", "我买苹果。", "一共十块。"]),
    ("今天几号？", "今天十号。", ["今天星期十。", "今天十号。", "现在十点。"]),
    ("外面天气怎么样？", "外面很冷。", ["外面很冷。", "我在外面。", "今天星期五。"]),
    ("你怎么去飞机场？", "我坐出租车去。", ["飞机场很远。", "我坐出租车去。", "我三点去。"]),
    ("公共汽车站在哪儿？", "在医院前面。", ["我坐公共汽车。", "在医院前面。", "车来了。"]),
    ("你什么时候回家？", "我下午回家。", ["我回北京。", "我下午回家。", "我和妈妈回家。"]),
    ("你喜欢做什么？", "我喜欢看书。", ["我喜欢看书。", "这是我的书。", "我会写字。"]),
    ("你的猫在哪儿？", "在椅子下面。", ["猫很小。", "在椅子下面。", "我喜欢猫。"]),
    ("你会不会游泳？", "我不会游泳。", ["我不去游泳。", "我不会游泳。", "我星期天游泳。"]),
    ("你在哪儿工作？", "我在医院工作。", ["我是医生。", "我今天工作。", "我在医院工作。"]),
    ("星期天你去公园吗？", "去，我和朋友一起去。", ["公园很大。", "去，我和朋友一起去。", "星期天很好。"]),
]


FILLS = [
    ("这是我的___，她叫小月。", "朋友", ["朋友", "天气", "苹果"]), ("请___，这怎么读？", "问", ["问", "吃", "坐"]),
    ("我每天学习___。", "汉语", ["汉语", "北京", "老师"]), ("他___电视呢。", "看", ["看", "听", "说"]),
    ("明天我们___学校。", "去", ["去", "是", "有"]), ("___是我的姐姐。", "她", ["她", "哪", "谁"]),
    ("我爸爸在医院___。", "工作", ["工作", "学习", "认识"]), ("弟弟在学校___汉语。", "学习", ["学习", "工作", "睡觉"]),
    ("老师认识___学生。", "那个", ["那个", "哪儿", "多少"]), ("我们___是好朋友。", "都", ["都", "很", "太"]),
    ("我想吃___，不想吃苹果。", "西瓜", ["西瓜", "茶", "杯子"]), ("请给我一___米饭。", "碗", ["碗", "本", "件"]),
    ("这个菜不太___。", "热", ["热", "远", "大夫"]), ("这些水果___新鲜。", "很", ["很", "在", "叫"]),
    ("我没有钱，不能___。", "买", ["买", "看", "来"]), ("现在七点___。", "半", ["半", "后", "少"]),
    ("今天下雨，别___了。", "出去", ["出去", "回来", "看见"]), ("他坐___去北京。", "火车", ["火车", "天气", "饭店"]),
    ("学校在医院的___。", "左边", ["左边", "昨天", "里面的"]), ("我___到家了。", "已经", ["已经", "怎么", "多少"]),
    ("妹妹喜欢听___。", "音乐", ["音乐", "电影", "电视"]), ("我和朋友一起___篮球。", "打", ["打", "做", "写"]),
    ("小狗在门___。", "后面", ["后面", "时候", "上面有"]), ("她每天___电脑工作。", "用", ["用", "吃", "开"]),
    ("公园里有很多___。", "人", ["人", "水", "字"]),
]


def rotate_options(values: list[str], correct_index: int) -> tuple[list[str], str]:
    shift = correct_index % 3
    rotated = values[shift:] + values[:shift]
    return rotated, "ABC"[rotated.index(values[0])]


def listening_question(number: int, code: str, transcript: str, answer: str, options: list[str] | None = None, **extra) -> dict:
    audio_path = extra.pop("audioPath", f"./assets/data/thi-thu/exams/hsk1-audio/{code.lower()}/q{number:02d}.mp3")
    q = {
        "id": f"q{number:02d}", "type": "single_choice" if options else "true_false", "points": 5,
        "prompt": extra.pop("prompt", f"Câu {number}: Nghe và chọn đáp án đúng."),
        "answer": answer, "audio": audio_path,
        "transcript": transcript, "transcriptPinyin": pinyin(transcript.replace("\n", " ")),
        "part": extra.pop("part"), **extra,
    }
    if options:
        q["options"] = [option(letter, text) for letter, text in zip("ABC", options)]
    return q


def build_exam(exam_index: int, exam_id: str, code: str, theme: str) -> dict:
    start = exam_index * 5
    listening = []
    reading = []

    scene_items = SCENES[start:start + 5]
    if exam_index == 0:
        scene_items = [("", transcript, truth) for _hanzi, transcript, truth in EXAM_ONE_TEXT_ITEMS]

    for local, (scene, spoken, truth) in enumerate(scene_items, 1):
        number = local
        extra = {}
        if exam_index == 0:
            hanzi = EXAM_ONE_TEXT_ITEMS[local - 1][0]
            extra = {"hanzi": hanzi, "pinyin": pinyin(hanzi)}
        else:
            extra = {
                "image": f"./assets/images/thi-thu/hsk1/{code.lower()}/q{number:02d}.webp",
                "imageAlt": f"Minh họa riêng cho câu nghe {number}", "imagePrompt": scene,
            }
        listening.append(listening_question(
            number, code, spoken, str(truth).lower(), part="Nghe - Phần 1",
            prompt=f"Câu {number}: Nghe câu và chọn nội dung chữ Đúng hoặc Sai." if exam_index == 0 else f"Câu {number}: Nghe câu miêu tả, quan sát hình và chọn Đúng hoặc Sai.",
            audioPath=f"./assets/audio/thi-thu/hsk1/de-01/l{number:02d}.wav" if exam_index == 0 else f"./assets/data/thi-thu/exams/hsk1-audio/{code.lower()}/q{number:02d}.mp3",
            **extra,
        ))

    facts = LISTEN_FACTS[start:start + 5]
    for local, spoken in enumerate(facts, 6):
        source_index = local - 6
        raw = [facts[source_index], facts[(source_index + 1) % 5], facts[(source_index + 2) % 5]]
        choices, answer = rotate_options(raw, local + exam_index)
        listening.append(listening_question(local, code, spoken, answer, choices, part="Nghe - Phần 2",
            audioPath=f"./assets/audio/thi-thu/hsk1/de-01/l{local:02d}.wav" if exam_index == 0 else f"./assets/data/thi-thu/exams/hsk1-audio/{code.lower()}/q{local:02d}.mp3",
            prompt=f"Câu {local}: Nghe câu và chọn câu chữ phù hợp."))

    dialogue_items_1 = EXAM_ONE_DIALOGUES_1 if exam_index == 0 else DIALOGUES_1[start:start + 5]
    for local, (transcript, correct, choices) in enumerate(dialogue_items_1, 11):
        answer = "ABC"[choices.index(correct)]
        listening.append(listening_question(local, code, transcript, answer, choices, part="Nghe - Phần 3",
            audioPath=f"./assets/audio/thi-thu/hsk1/de-01/l{local:02d}.wav" if exam_index == 0 else f"./assets/data/thi-thu/exams/hsk1-audio/{code.lower()}/q{local:02d}.mp3",
            prompt=f"Câu {local}: Nghe hội thoại và chọn đáp án đúng."))

    dialogue_items_2 = EXAM_ONE_DIALOGUES_2 if exam_index == 0 else DIALOGUES_2[start:start + 5]
    for local, (transcript, correct, choices) in enumerate(dialogue_items_2, 16):
        answer = "ABC"[choices.index(correct)]
        listening.append(listening_question(local, code, transcript, answer, choices, part="Nghe - Phần 4",
            audioPath=f"./assets/audio/thi-thu/hsk1/de-01/l{local:02d}.wav" if exam_index == 0 else f"./assets/data/thi-thu/exams/hsk1-audio/{code.lower()}/q{local:02d}.mp3",
            prompt=f"Câu {local}: Nghe hội thoại và chọn đáp án đúng."))

    for local, (context, statement, truth) in enumerate(READING_TF[start:start + 5], 21):
        reading.append({
            "id": f"q{local:02d}", "type": "true_false", "points": 5, "part": "Đọc - Phần 1",
            "prompt": f"Câu {local}: Đọc hai câu và chọn Đúng hoặc Sai.",
            "context": context, "contextPinyin": pinyin(context), "hanzi": statement, "pinyin": pinyin(statement),
            "answer": str(truth).lower(),
        })

    for local, (sentence, correct, choices) in enumerate(COMPLETIONS[start:start + 5], 26):
        reading.append({
            "id": f"q{local:02d}", "type": "single_choice", "points": 5, "part": "Đọc - Phần 2",
            "prompt": f"Câu {local}: Chọn từ thích hợp điền vào chỗ trống.",
            "hanzi": sentence, "pinyin": pinyin(sentence), "answer": "ABC"[choices.index(correct)],
            "options": [option(letter, text) for letter, text in zip("ABC", choices)],
        })

    for local, (question, correct, choices) in enumerate(QA_ITEMS[start:start + 5], 31):
        reading.append({
            "id": f"q{local:02d}", "type": "single_choice", "points": 5, "part": "Đọc - Phần 3",
            "prompt": f"Câu {local}: Chọn câu trả lời phù hợp.",
            "hanzi": question, "pinyin": pinyin(question), "answer": "ABC"[choices.index(correct)],
            "options": [option(letter, text) for letter, text in zip("ABC", choices)],
        })

    for local, (sentence, correct, choices) in enumerate(FILLS[start:start + 5], 36):
        reading.append({
            "id": f"q{local:02d}", "type": "single_choice", "points": 5, "part": "Đọc - Phần 4",
            "prompt": f"Câu {local}: Chọn từ thích hợp điền vào chỗ trống.",
            "hanzi": sentence, "pinyin": pinyin(sentence), "answer": "ABC"[choices.index(correct)],
            "options": [option(letter, text) for letter, text in zip("ABC", choices)],
        })

    return {
        "id": exam_id, "title": "Đề thi thử HSK 1 — Số 01" if exam_index == 0 else f"Đề thi thử HSK 1 - {code}", "level": "HSK 1",
        "description": "Đề thi thử HSK 1 chỉ sử dụng âm thanh và văn bản." if exam_index == 0 else f"Đề biên soạn mới theo chủ đề {theme.lower()}: 20 câu nghe, 20 câu đọc.",
        "durationMinutes": 35, "totalPoints": 200, "passPoints": 120,
        "instructions": "Làm đủ 40 câu trong khoảng 35 phút. Phần nghe có audio riêng từng câu và không hiển thị transcript trước khi nộp bài. Chữ Hán có pinyin ở dòng dưới." if exam_index == 0 else "Làm đủ 40 câu trong khoảng 35 phút. Phần nghe có audio riêng từng câu; chỉ câu 1-5 dùng hình minh họa riêng. Chữ Hán trong đáp án và phần đọc có pinyin ở dòng dưới.",
        "version": 2, "contentSource": "original_rewrite", "audioSource": "tts_generated",
        "sections": [
            {"id": "listening", "title": "Nghe - 100 điểm", "questions": listening},
            {"id": "reading", "title": "Đọc - 100 điểm", "questions": reading},
        ],
    }


def main() -> None:
    index = []
    for exam_index, (exam_id, code, theme) in enumerate(EXAMS):
        exam = build_exam(exam_index, exam_id, code, theme)
        path = EXAM_DIR / f"{exam_id}.json"
        path.write_text(json.dumps(exam, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        index.append({
            "id": exam_id, "title": exam["title"], "level": "HSK 1",
            "description": exam["description"], "durationMinutes": 35, "questionCount": 40,
            "active": True, "path": f"./assets/data/thi-thu/exams/{exam_id}.json",
        })
    (EXAM_DIR / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
