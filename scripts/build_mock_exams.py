#!/usr/bin/env python3
"""Build versioned, original HSK 2.0 mock-exam data.

The five historical HSK 1 IDs are preserved. Their content is migrated from the
legacy JSON files; answers are moved to separate answer-key files. HSK 2–6 data
is generated deterministically from original, project-owned templates.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from pypinyin import Style, lazy_pinyin


ROOT = Path(__file__).resolve().parents[1]
LEGACY_DIR = ROOT / "assets/data/thi-thu/exams"
DATA_ROOT = ROOT / "assets/data/mock-tests"
EXAM_ROOT = DATA_ROOT / "exams"
KEY_ROOT = DATA_ROOT / "answer-keys"
STANDARD_VERSION = "HSK_2_0_CURRENT"
FREE_EXAM_IDS = {"hsk1-h10901", *{f"hsk{level}-mock-001" for level in range(2, 7)}}

LEVEL_CONFIG = {
    1: {
        "official": 40,
        "sections": [("listening", "Nghe", 20, 15, [5, 5, 5, 5], 2), ("reading", "Đọc", 20, 17, [5, 5, 5, 5], 0)],
        "pass": 120,
    },
    2: {
        "official": 55,
        "sections": [("listening", "Nghe", 35, 25, [10, 10, 10, 5], 2), ("reading", "Đọc", 25, 22, [5, 5, 5, 10], 0)],
        "pass": 120,
    },
    3: {
        "official": 90,
        "sections": [("listening", "Nghe", 40, 35, [10, 10, 10, 10], 2), ("reading", "Đọc", 30, 30, [10, 10, 10], 0), ("writing", "Viết", 10, 15, [5, 5], 0)],
        "pass": 180,
    },
    4: {
        "official": 105,
        "sections": [("listening", "Nghe", 45, 30, [10, 15, 20], 1), ("reading", "Đọc", 40, 40, [10, 10, 20], 0), ("writing", "Viết", 15, 25, [10, 5], 0)],
        "pass": 180,
    },
    5: {
        "official": 125,
        "sections": [("listening", "Nghe", 45, 30, [20, 25], 1), ("reading", "Đọc", 45, 45, [15, 10, 20], 0), ("writing", "Viết", 10, 40, [8, 2], 0)],
        "pass": 180,
    },
    6: {
        "official": 140,
        "sections": [("listening", "Nghe", 50, 35, [15, 15, 20], 1), ("reading", "Đọc", 50, 50, [10, 10, 10, 20], 0), ("writing", "Viết", 1, 45, [1], 0)],
        "pass": 180,
    },
}

PART_INSTRUCTIONS = {
    "listening": [
        "Nghe nội dung và chọn đáp án phù hợp nhất.",
        "Nghe đoạn hội thoại, sau đó trả lời câu hỏi.",
        "Nghe đoạn hội thoại và chọn thông tin đúng.",
        "Nghe đoạn nói ngắn và chọn kết luận phù hợp nhất.",
    ],
    "reading": [
        "Đọc câu và chọn đáp án phù hợp nhất.",
        "Chọn từ hoặc cụm từ thích hợp để hoàn thành câu.",
        "Đọc đoạn văn ngắn và trả lời câu hỏi.",
        "Đọc nội dung và chọn kết luận đúng.",
    ],
}

NAMES = ["李明", "王芳", "张老师", "小雨", "陈先生", "刘阿姨", "赵经理", "林医生", "周同学", "孙师傅"]
PLACES = ["图书馆", "学校", "公司", "医院", "超市", "火车站", "公园", "银行", "饭店", "博物馆"]
TIMES = ["上午八点", "上午十点", "中午十二点", "下午两点", "下午四点", "晚上七点", "星期一", "星期三", "星期六", "明天早上"]
ACTIVITIES = ["开会", "上课", "看医生", "买东西", "接朋友", "锻炼身体", "准备报告", "参加活动", "还书", "吃晚饭"]
EVENTS = ["课程", "会议", "讲座", "比赛", "培训", "展览", "面试", "交流活动", "健康检查", "参观活动"]
EVENT_PLACES = ["学校", "公司", "学校", "公园", "公司", "博物馆", "公司", "学校", "医院", "博物馆"]
PLACE_ACTIVITIES = [
    ("图书馆", "还书"),
    ("学校", "上课"),
    ("公司", "开会"),
    ("医院", "看医生"),
    ("超市", "买东西"),
    ("火车站", "接朋友"),
    ("公园", "锻炼身体"),
    ("银行", "办业务"),
    ("饭店", "吃晚饭"),
    ("博物馆", "参加活动"),
]
LISTENING_RATES = {1: "-22%", 2: "-18%", 3: "-12%", 4: "-5%", 5: "-5%", 6: "-5%"}
LISTENING_QUESTION_RATES = {2: "-28%", 3: "-22%", 4: "-15%", 5: "-15%", 6: "-15%"}
LISTENING_POST_TEMPOS = {1: 0.78, 2: 0.84, 3: 0.90}
LISTENING_QUESTION_PAUSE_MS = 450
TRANSPORTS = ["公共汽车", "地铁", "出租车", "自行车", "火车", "步行"]
WEEKDAYS = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
ITEMS = ["雨伞", "手机", "钥匙", "词典", "杯子", "眼镜", "书包", "笔记本", "车票", "文件"]
COLORS = ["红色", "蓝色", "白色", "黑色", "绿色", "黄色"]
FOODS = ["面条", "米饭", "饺子", "苹果", "西瓜", "鸡蛋", "面包", "鱼"]
PRICES = ["二十元", "三十五元", "四十八元", "六十元", "八十五元", "一百二十元"]
DURATIONS = ["十分钟", "二十分钟", "半个小时", "四十五分钟", "一个小时", "一个半小时"]
COUNTS = ["两份", "三份", "四份", "五份", "六份", "八份"]
REASONS = ["天气不好", "路上堵车", "身体不舒服", "设备出了问题", "临时要开会", "材料还没准备好"]
METHODS = ["先列清单再逐项完成", "把任务分成几个小步骤", "先听取意见再作决定", "提前预约并确认时间", "比较数据后再调整方案", "请有经验的同事协助"]
RESULTS = ["按时完成了任务", "把活动改到了室内", "减少了等待时间", "找到了更合适的方案", "避免了重复修改", "得到了大家的支持"]
PURPOSES = ["方便大家出行", "提高工作效率", "减少不必要的浪费", "让信息更容易理解", "保证活动顺利进行", "听取更多人的意见"]
EVALUATIONS = ["位置方便但环境有点儿吵", "价格合适而且服务很好", "内容清楚但例子还不够", "设计简单却很实用", "安排紧凑但时间合理", "方法新颖而且容易执行"]
BASIC_METHODS = ["早点儿出门", "先打电话问一下", "多休息多喝水", "每天练习半个小时", "把重要的事写下来", "请老师再讲一次"]
BASIC_RESULTS = ["按时到了", "在家休息", "买到了东西", "找到了钥匙", "完成了作业", "见到了朋友"]
BASIC_PURPOSES = ["去上课", "买东西", "看医生", "接朋友", "学习汉语", "锻炼身体"]
BASIC_PURPOSE_PLACES = ["学校", "超市", "医院", "火车站", "学校", "公园"]
BASIC_EVALUATIONS = ["很方便", "有点儿贵", "味道不错", "离家很近", "人太多了", "服务很好"]

LEVEL_CLAUSES = {
    2: [
        ("因为今天下雨，所以他坐公共汽车去学校。", "他怎么去学校？", "坐公共汽车"),
        ("她上午要上课，下午才有时间去买东西。", "她什么时候去买东西？", "下午"),
        ("桌子上的蓝杯子是妹妹的，红杯子是我的。", "哪个杯子是妹妹的？", "蓝杯子"),
        ("爸爸正在厨房做饭，妈妈在客厅看电视。", "谁在做饭？", "爸爸"),
        ("这件衣服一百块，那件便宜二十块。", "哪件衣服便宜？", "那件"),
        ("他每天六点起床，吃完早饭就去跑步。", "他吃完早饭做什么？", "去跑步"),
        ("妹妹喜欢苹果，不喜欢西瓜。", "妹妹喜欢什么？", "苹果"),
        ("老师说今天没有考试，大家都很高兴。", "今天有没有考试？", "没有"),
        ("从我家到公司坐地铁要二十分钟。", "去公司要多长时间？", "二十分钟"),
        ("她汉语说得很好，也会写很多汉字。", "她什么说得很好？", "汉语"),
    ],
    3: [
        ("因为地铁临时停运，他只好改坐公共汽车。", "他为什么坐公共汽车？", "地铁停运了"),
        ("会议原定三点开始，后来推迟了半个小时。", "会议几点开始？", "三点半"),
        ("她虽然感冒了，但是仍然按时完成了工作。", "她的身体怎么样？", "感冒了"),
        ("这家饭店离公司近，味道也不错，同事们常来。", "同事们为什么常来？", "方便而且好吃"),
        ("图书馆周一不开门，我们改成周二去。", "他们哪天去图书馆？", "周二"),
        ("他把钥匙忘在办公室了，只能请同事帮忙。", "他遇到了什么问题？", "忘带钥匙"),
        ("妹妹对历史感兴趣，生日时收到了一套历史书。", "妹妹可能喜欢什么？", "历史"),
        ("天气预报说下午有大雨，比赛提前到了上午。", "比赛为什么提前？", "下午可能下雨"),
        ("经理认为这个计划不错，但预算需要重新计算。", "计划哪里需要调整？", "预算"),
        ("她搬家以后离学校更近，每天能多睡半小时。", "搬家带来了什么好处？", "上学更方便"),
    ],
    4: [
        ("虽然申请材料已经准备齐全，但负责人建议再核对一次数据。", "负责人提出了什么建议？", "再次核对数据"),
        ("由于航班受天气影响延误，接机时间也相应推迟。", "接机时间为什么改变？", "航班延误"),
        ("他原本打算换工作，经过认真考虑后决定留下来。", "他最后做了什么决定？", "继续留下工作"),
        ("这项活动不仅能锻炼身体，还给邻居提供了交流机会。", "活动有什么作用？", "锻炼并促进交流"),
        ("产品价格没有变化，只是包装比以前更环保。", "产品发生了什么变化？", "包装更环保"),
        ("医生提醒她按时休息，否则恢复速度会受到影响。", "医生主要提醒什么？", "保证休息"),
        ("报告内容很完整，不过结论部分还可以表达得更清楚。", "报告哪里需要改进？", "结论的表达"),
        ("他宁可多走十分钟，也不愿在拥挤的车里久等。", "他选择了什么？", "步行更远"),
        ("博物馆为控制人数，要求参观者提前在网上预约。", "参观前需要做什么？", "网上预约"),
        ("这本书看起来很厚，实际内容生动，一点儿也不难读。", "这本书给人的实际感受怎样？", "生动易读"),
    ],
    5: [
        ("项目遇到的困难并没有打乱团队的节奏，反而促使大家重新审视原来的方案。", "困难带来了什么影响？", "推动团队重新审视方案"),
        ("她没有立即接受邀请，而是先了解活动目标是否与自己的研究方向一致。", "她为什么没有马上答应？", "需要确认活动是否合适"),
        ("城市增加夜间公交班次，主要是为了满足晚班职工和游客的出行需求。", "增加班次的主要目的是什么？", "方便夜间出行"),
        ("这家企业把顾客的批评整理成清单，逐项改善服务，因此重新赢得了信任。", "企业如何重新获得信任？", "根据批评改善服务"),
        ("研究发现，短暂休息并不会降低效率，合理安排反而能让注意力更集中。", "研究支持什么观点？", "合理休息有助于集中注意力"),
        ("他把复杂任务分成几个小目标，每完成一个就检查结果，错误明显减少了。", "他用了什么方法？", "分解任务并及时检查"),
        ("传统市场保留了原有建筑，同时引入电子支付，让老顾客和年轻人都感到方便。", "市场改造有什么特点？", "兼顾传统与便利"),
        ("与其急着给出答案，她更愿意先听清每个人的理由，再寻找共同点。", "她处理分歧的方式是什么？", "先倾听再协调"),
        ("这次展览没有追求作品数量，而是通过清楚的主题帮助观众理解创作背景。", "展览更重视什么？", "主题和理解"),
        ("公司允许员工选择办公地点，但要求团队提前安排面对面讨论的时间。", "公司提出了什么要求？", "提前安排线下讨论"),
    ],
    6: [
        ("当信息数量迅速增加时，真正稀缺的并非信息本身，而是判断信息价值并承担选择后果的能力。", "这段话强调哪种能力？", "判断与负责的能力"),
        ("公共空间的品质不能只用设施数量衡量，还取决于不同人群是否愿意停留并产生真实交流。", "衡量公共空间还应考虑什么？", "人们的使用与交流"),
        ("一些看似低效的讨论能够暴露隐含分歧，从长远看反而减少执行阶段反复修改的成本。", "讨论的长期价值是什么？", "提前发现分歧并降低返工"),
        ("技术工具可以扩大个人能力，却不能替代对目标的理解；方向不清时，速度越快偏差可能越大。", "作者提醒人们注意什么？", "先明确目标再使用工具"),
        ("城市更新若只关注外观，很容易抹去社区记忆；让居民参与，才能在变化中保留地方认同。", "居民参与有什么意义？", "保留社区认同"),
        ("研究者发现，人们往往高估短期奖励的吸引力，却低估长期习惯对生活质量的持续影响。", "研究发现了什么倾向？", "重短期而轻长期"),
        ("成熟的合作并不意味着没有冲突，而是各方能够把分歧转化为可讨论、可验证的问题。", "成熟合作的特征是什么？", "能理性处理分歧"),
        ("博物馆不应只是保存旧物的仓库，它还需要借助叙事把物品与今天的生活重新联系起来。", "博物馆还应承担什么功能？", "连接历史与当代生活"),
        ("面对不确定性，计划的价值不在于准确预测每个细节，而在于帮助团队识别风险并准备替代方案。", "计划的核心价值是什么？", "识别风险并准备方案"),
        ("经验可以提高判断速度，也可能让人忽视新的证据，因此专家同样需要保持自我质疑。", "专家为什么要自我质疑？", "避免经验遮蔽新证据"),
    ],
}

READING_ITEMS = {
    2: [
        ("我今天很忙，___不能和你一起去。", ["但是", "所以", "还是", "已经"], "所以"),
        ("这本书___那本书便宜十块钱。", ["比", "离", "从", "给"], "比"),
        ("妹妹正在房间里___汉字。", ["写", "坐", "开", "穿"], "写"),
        ("你喝茶___喝咖啡？", ["还是", "已经", "一起", "可能"], "还是"),
        ("外面下雨了，别忘了___伞。", ["带", "卖", "教", "站"], "带"),
        ("我家___学校不远，走路十分钟。", ["离", "比", "向", "把"], "离"),
        ("他___吃完饭，就去上班了。", ["刚", "最", "每", "再"], "刚"),
        ("这个问题我不懂，请你___说一次。", ["再", "最", "正", "别"], "再"),
        ("服务员，请___我一杯热水。", ["给", "向", "从", "让"], "给"),
        ("今天的天气___昨天暖和。", ["比", "离", "把", "被"], "比"),
    ],
    3: [
        ("只要认真准备，___会有进步。", ["就", "才", "又", "却"], "就"),
        ("他把会议时间___在了星期五下午。", ["安排", "发现", "提高", "参加"], "安排"),
        ("这条路正在修，大家只好___走另一条路。", ["改", "被", "替", "受"], "改"),
        ("她不仅会说汉语，___会写汉字。", ["还", "却", "才", "再"], "还"),
        ("如果明天不下雨，我们___去爬山。", ["就", "才", "被", "过"], "就"),
        ("这件事很重要，请你认真___一下。", ["考虑", "同意", "发现", "完成"], "考虑"),
        ("我到车站的时候，火车已经___了。", ["离开", "起飞", "结束", "关心"], "离开"),
        ("他对这里不熟，___走错了路。", ["结果", "然后", "首先", "终于"], "结果"),
        ("经理让我们今天___完成报告。", ["必须", "值得", "愿意", "同意"], "必须"),
        ("这家店的服务态度让顾客很___。", ["满意", "容易", "简单", "安静"], "满意"),
    ],
    4: [
        ("经过多次讨论，大家___同意了这个方案。", ["终于", "偶尔", "至少", "恐怕"], "终于"),
        ("这个办法不但节省时间，___降低了成本。", ["而且", "尽管", "否则", "由于"], "而且"),
        ("请把重要文件放好，___丢失。", ["以免", "尽管", "无论", "随着"], "以免"),
        ("他对工作的认真态度给我留下了深刻的___。", ["印象", "意见", "性格", "经历"], "印象"),
        ("无论遇到什么困难，她___没有放弃。", ["都", "才", "却", "又"], "都"),
        ("这次调查的结果基本___我们的判断。", ["符合", "适合", "配合", "结合"], "符合"),
        ("与过去相比，这里的交通条件有了明显___。", ["改善", "改变", "改正", "改造"], "改善"),
        ("他提前出门，___路上堵车耽误时间。", ["避免", "拒绝", "停止", "禁止"], "避免"),
        ("只有了解顾客真正的需要，___能改进服务。", ["才", "就", "却", "还"], "才"),
        ("这篇文章内容丰富，语言也十分___。", ["生动", "热闹", "活泼", "积极"], "生动"),
    ],
    5: [
        ("团队及时调整了计划，___了风险进一步扩大。", ["避免", "拒绝", "否认", "取消"], "避免"),
        ("事实证明，这项措施对提高效率具有___作用。", ["积极", "活泼", "主动", "热烈"], "积极"),
        ("面对复杂情况，我们不能只看表面，应该分析其___原因。", ["根本", "基本", "基础", "根基"], "根本"),
        ("双方经过充分沟通，最终___了一致意见。", ["达成", "到达", "完成", "造成"], "达成"),
        ("新规定的目的不是增加负担，而是___工作流程。", ["规范", "规律", "规格", "规则"], "规范"),
        ("这篇报道没有夸大事实，态度比较___。", ["客观", "主动", "乐观", "直观"], "客观"),
        ("他善于从失败中总结经验，___同样的错误再次发生。", ["防止", "停止", "禁止", "阻止"], "防止"),
        ("这种变化并非偶然，而是多种因素共同作用的___。", ["结果", "成果", "后果", "效果"], "结果"),
        ("企业应当在追求利润的同时___社会责任。", ["承担", "承认", "承受", "承包"], "承担"),
        ("只有建立稳定的信任，合作关系才能___发展。", ["持续", "连续", "陆续", "继续"], "持续"),
    ],
    6: [
        ("评价一项政策不能只关注短期效果，还要考察其长期___。", ["影响", "印象", "反应", "形象"], "影响"),
        ("作者通过具体案例___了抽象概念，使论证更容易理解。", ["阐释", "解释", "表示", "声明"], "阐释"),
        ("这项研究的结论仍需更多证据加以___。", ["验证", "证实", "证明", "确认"], "验证"),
        ("在资源有限的情况下，管理者必须明确任务的___顺序。", ["优先", "先进", "领先", "首先"], "优先"),
        ("真正有效的创新往往建立在对现实问题的准确___之上。", ["洞察", "观察", "考察", "查看"], "洞察"),
        ("制度若缺乏透明度，就可能___公众的信任。", ["削弱", "减少", "缩小", "降低"], "削弱"),
        ("经验固然重要，但不能因此___新的可能性。", ["排斥", "排除", "拒绝", "否定"], "排斥"),
        ("这篇文章的论证结构严谨，各部分之间相互___。", ["呼应", "回答", "反映", "反应"], "呼应"),
        ("讨论的目的不是回避分歧，而是寻找可以被共同___的基础。", ["接受", "接收", "承受", "采取"], "接受"),
        ("技术进步必须与社会需求相___，才能产生持久价值。", ["协调", "配合", "合作", "统一"], "协调"),
    ],
}

REORDERS = {
    3: [
        "我|每天|坐地铁|去公司", "妹妹|正在|房间里|写作业", "这本书|是|老师|送给我的",
        "他|已经|学了|两年汉语", "我们|周末|一起|去爬山",
    ],
    4: [
        "这次活动|吸引了|很多|年轻人参加", "他|把会议时间|改到了|星期五下午",
        "良好的习惯|能够|提高|学习效率", "请你|把这份材料|仔细地|检查一遍",
        "她|对中国历史|一直|很感兴趣", "我们|应该|尊重|别人的选择",
        "这个问题|比想象中|复杂|得多", "经理|同意了|我们提出的|新方案",
        "那家饭店|不仅环境好|而且|服务也很周到", "他|终于|找到了|解决问题的办法",
    ],
    5: [
        "丰富的实践经验|为他|解决这个问题|提供了帮助", "公司|正在考虑|如何|进一步提高服务质量",
        "保持好奇心|有助于|我们|发现新的可能", "这项研究结果|引起了|社会各界的|广泛关注",
        "合理安排时间|是|提高工作效率的|重要条件", "双方|经过讨论|最终|达成了一致意见",
        "面对变化|我们需要|及时调整|原来的计划", "他提出的建议|具有|很强的|实际价值",
    ],
}

REORDER_PREFIXES = {
    4: [
        ["去年", "后来", "事实证明，", "提交以前，", "从小", "在生活中，", "经过分析，", "讨论以后，", "在当地，", "经过努力，"],
        ["今年春天，", "接到通知后，", "在学习中，", "交给经理以前，", "上大学以后，", "相处时，", "仔细研究后，", "会议结束后，", "朋友告诉我，", "几个月后，"],
        ["上周，", "听取意见后，", "老师认为，", "下班以前，", "这些年来，", "无论何时，", "大家发现，", "再次沟通后，", "很多顾客觉得，", "在同事的帮助下，"],
        ["活动当天，", "情况改变后，", "实践说明，", "发出邮件以前，", "小时候，", "做决定时，", "进一步调查后，", "认真考虑后，", "对游客来说，", "坚持寻找以后，"],
    ],
    5: [
        ["在实践中，", "最近，", "面对未知时，", "发表以后，", "对职场新人来说，", "经过充分沟通，", "遇到新情况时，", "从长远看，"],
        ["在这次项目中，", "根据反馈，", "在日常生活中，", "公布以后，", "对管理者而言，", "为了解决分歧，", "市场发生变化时，", "经过验证，"],
        ["过去几年里，", "目前，", "研究问题时，", "在学术界，", "任务增加以后，", "为了继续合作，", "环境不断变化时，", "对团队来说，"],
        ["总结工作时，", "下一阶段，", "学习新事物时，", "会议结束后，", "工作节奏加快时，", "在第三次会议上，", "面对意外变化，", "实际应用中，"],
    ],
}

HANZI_WRITING_VARIANTS = [
    [
        ("wǒ měitiān liànxí xiě hànzì", "我每天练习写汉字"),
        ("tā de shēntǐ hěn jiànkāng", "他的身体很健康"),
        ("jīntiān de tiānqì fēicháng hǎo", "今天的天气非常好"),
        ("wǒmen míngtiān zài túshūguǎn jiàn", "我们明天在图书馆见"),
        ("qǐng bǎ mén guān shàng", "请把门关上"),
    ],
    [
        ("mèimei zhèngzài kàn diànyǐng", "妹妹正在看电影"),
        ("wǒ xiǎng mǎi yì běn cídiǎn", "我想买一本词典"),
        ("tāmen zuótiān qù yóuyǒng le", "他们昨天去游泳了"),
        ("zhè jiàn yīfu yǒudiǎnr guì", "这件衣服有点儿贵"),
        ("qǐng gěi wǒ yì bēi rè shuǐ", "请给我一杯热水"),
    ],
    [
        ("bàba zài chúfáng lǐ zuòfàn", "爸爸在厨房里做饭"),
        ("wǒ de shǒujī zài zhuōzi shàng", "我的手机在桌子上"),
        ("tā měitiān zuò gōnggòng qìchē shàngbān", "他每天坐公共汽车上班"),
        ("míngtiān kěnéng huì xiàyǔ", "明天可能会下雨"),
        ("wǒmen yǐjīng zhǔnbèi hǎo le", "我们已经准备好了"),
    ],
    [
        ("lǎoshī shuō de hěn qīngchu", "老师说得很清楚"),
        ("zhè jiā fàndiàn lí gōngsī hěn jìn", "这家饭店离公司很近"),
        ("wǒ bǎ yàoshi wàng zài jiā lǐ le", "我把钥匙忘在家里了"),
        ("tā duì Zhōngguó lìshǐ hěn gǎn xìngqù", "他对中国历史很感兴趣"),
        ("qǐng nǐ zài shuō yí cì", "请你再说一次"),
    ],
    [
        ("wǒmen zhōumò yìqǐ qù páshān", "我们周末一起去爬山"),
        ("huǒchē xiàwǔ sān diǎn chūfā", "火车下午三点出发"),
        ("tā bǐ qùnián gèng máng le", "他比去年更忙了"),
        ("wǒ xiān zuò zuòyè zài kàn diànshì", "我先做作业再看电视"),
        ("nǐ bié wàng le dài yǔsǎn", "你别忘了带雨伞"),
    ],
]

PICTURE_TASK_VARIANTS = [
    [
        ("library.svg", "安静", ["图书馆里很安静。", "大家安静地在图书馆看书。"]),
        ("bicycle.svg", "骑", ["他每天骑自行车上班。", "她正在公园里骑自行车。"]),
        ("rain.svg", "雨伞", ["外面下雨了，她带着一把雨伞。", "这把雨伞是我的。"]),
        ("cooking.svg", "准备", ["妈妈正在准备晚饭。", "他为朋友准备了很多菜。"]),
        ("meeting.svg", "讨论", ["他们正在会议室讨论问题。", "大家一起讨论了新的计划。"]),
    ],
    [
        ("library.svg", "学习", ["学生们正在图书馆学习。", "她喜欢在图书馆学习。"]),
        ("bicycle.svg", "锻炼", ["骑自行车可以锻炼身体。", "他每天骑车锻炼身体。"]),
        ("rain.svg", "下雨", ["外面正在下雨。", "因为下雨，她带了雨伞。"]),
        ("cooking.svg", "厨房", ["妈妈正在厨房里做饭。", "厨房里准备了很多菜。"]),
        ("meeting.svg", "会议", ["他们正在参加会议。", "今天的会议很重要。"]),
    ],
    [
        ("library.svg", "认真", ["她在图书馆认真地看书。", "同学们学习得很认真。"]),
        ("bicycle.svg", "方便", ["骑自行车上班很方便。", "这辆自行车给他带来了方便。"]),
        ("rain.svg", "忘记", ["他忘记带雨伞了。", "下雨天别忘记带伞。"]),
        ("cooking.svg", "晚饭", ["妈妈正在做晚饭。", "今天的晚饭很丰富。"]),
        ("meeting.svg", "意见", ["大家在会上发表意见。", "经理认真听取了大家的意见。"]),
    ],
    [
        ("library.svg", "借", ["她从图书馆借了一本书。", "我想去图书馆借书。"]),
        ("bicycle.svg", "绿色", ["骑自行车是一种绿色出行方式。", "绿色的自行车很好看。"]),
        ("rain.svg", "及时", ["她及时打开了雨伞。", "幸好他及时带来了雨伞。"]),
        ("cooking.svg", "帮忙", ["孩子正在厨房里帮忙。", "他帮妈妈准备晚饭。"]),
        ("meeting.svg", "决定", ["他们开会后做出了决定。", "这个决定得到了大家的支持。"]),
    ],
    [
        ("library.svg", "复习", ["考试前她在图书馆复习。", "同学们正在认真复习。"]),
        ("bicycle.svg", "周末", ["周末他们一起骑自行车。", "他周末喜欢骑车去公园。"]),
        ("rain.svg", "天气", ["今天的天气不太好。", "天气预报说下午有雨。"]),
        ("cooking.svg", "香", ["妈妈做的饭真香。", "厨房里的菜闻起来很香。"]),
        ("meeting.svg", "合作", ["大家开会讨论合作计划。", "两家公司决定继续合作。"]),
    ],
]

HSK5_LONG_TASK_VARIANTS = [
    (
        ["机会", "坚持", "改变", "经验", "成功"],
        "community-garden.svg",
        "Quan sát hình và viết một đoạn khoảng 80 chữ. Có thể nêu bối cảnh, diễn biến và kết quả.",
    ),
    (
        ["计划", "困难", "帮助", "完成", "感谢"],
        "meeting.svg",
        "Quan sát hình cuộc họp và viết một đoạn khoảng 80 chữ về sự hợp tác trong công việc.",
    ),
    (
        ["环境", "习惯", "减少", "影响", "责任"],
        "bicycle.svg",
        "Quan sát hình và viết một đoạn khoảng 80 chữ về một lựa chọn đi lại có lợi cho sức khỏe.",
    ),
    (
        ["阅读", "知识", "分享", "进步", "方法"],
        "library.svg",
        "Quan sát hình và viết một đoạn khoảng 80 chữ về một trải nghiệm học tập đáng nhớ.",
    ),
    (
        ["天气", "准备", "意外", "及时", "顺利"],
        "rain.svg",
        "Quan sát hình và viết một đoạn khoảng 80 chữ kể lại một việc xảy ra trong ngày mưa.",
    ),
]

HSK6_SOURCES = [(
    "一家社区图书馆曾经面临读者减少的问题。工作人员最初认为，只要增加新书数量，"
    "读者自然会回来。然而几个月后，借阅量并没有明显变化。一次调查发现，附近居民并非"
    "不需要阅读，而是开放时间与他们的工作时间冲突，馆内也缺少适合交流和亲子阅读的空间。"
    "图书馆随后调整了晚间和周末开放时间，把一部分安静阅览区保留下来，同时改造出小型讨论室"
    "和儿童阅读角。工作人员还邀请居民共同设计活动，让退休教师、大学生和家长都能分享自己的"
    "知识。半年后，来馆人数明显增加，但更重要的是，居民开始把图书馆看作社区生活的一部分。"
    "这次改变说明，公共服务不能只从提供者的角度判断需求。数量固然重要，时间安排、空间设计"
    "和参与方式同样会影响服务是否真正被使用。先理解使用者的生活，再决定如何投入资源，往往"
    "比单纯增加供给更有效。"
), (
    "一家制造企业发现，新员工入职半年后的离职率一直很高。管理者最初把原因归结为年轻人缺乏耐心，"
    "于是增加了纪律培训和考核次数，但情况并没有改善。人力部门后来访谈了不同岗位的员工，发现真正的"
    "问题不是工作强度，而是新人不了解任务的意义，也不知道遇到困难时该向谁求助。企业随后为每位新人"
    "安排了一名跨部门导师，并把最初三个月的目标拆成可以观察的小任务。导师不直接替新人解决问题，"
    "而是帮助他们理解流程、复盘错误，并认识其他部门的同事。半年后，新人的工作效率和稳定性都有提高。"
    "这一变化说明，组织培养人才不能只强调服从和结果。明确目标、提供反馈、建立可信任的支持关系，"
    "才能让新人逐步形成独立判断。真正有效的管理不是消除所有困难，而是让人知道如何面对困难。"
), (
    "一座城市为了缓解早高峰拥堵，曾计划单纯增加公交车辆。试运行后，管理者发现部分线路仍然拥挤，"
    "另一些线路却有很多空座。调查表明，居民的出行时间和目的地已经发生变化，旧线路无法反映新的需求。"
    "交通部门于是公开匿名出行数据，邀请社区、学校和企业共同讨论，并在不同区域设置短期试验线路。"
    "每次调整后，他们都记录候车时间、换乘次数和乘客意见，而不是只看载客总量。几个月后，车辆数量"
    "没有明显增加，平均通勤时间却缩短了。这个案例表明，解决复杂问题不能把资源投入等同于服务改善。"
    "如果缺少准确的信息和持续反馈，再多资源也可能被放在错误的位置。先理解变化，再用小规模试验验证，"
    "能够降低决策成本，也让公共政策更贴近真实生活。"
), (
    "一所学校发现，学生借阅的书越来越多，但完整读完一本书的人却越来越少。老师起初要求学生提交更多"
    "读书笔记，希望用检查推动阅读，结果不少笔记只是复制内容。后来，学校取消统一格式，改为每周安排"
    "一次小组交流。学生可以介绍一个问题、一段不理解的内容，或者一本不喜欢的书，并说明理由。老师不再"
    "把发言数量作为主要成绩，而是观察学生能否倾听他人、修改自己的判断。几个月后，借阅量略有下降，"
    "但学生讨论文本的深度明显增加，也更愿意主动寻找相关资料。这说明，数据容易记录，却不一定代表"
    "学习真正发生。教育评价若只追求可见数量，可能使人把完成任务当成最终目的。给思考留下时间，允许"
    "提出疑问和改变看法，往往比增加检查更能培养长期的阅读能力。"
), (
    "一家餐馆因为顾客等待时间过长，准备购买更快的设备。厨师长没有立即同意，而是连续一周记录从点菜"
    "到上菜的每个环节。他发现厨房速度并不慢，真正的延误来自菜单信息不清和前后台沟通重复。餐馆随后"
    "减少了部分过于复杂的菜品，统一订单标记，并让服务员在高峰前确认特殊需求。调整后，设备没有更换，"
    "平均等待时间却明显缩短，员工之间的争执也减少了。更重要的是，餐馆保留了顾客最喜欢的特色菜，"
    "没有因为追求速度而牺牲品质。这个经历说明，表面问题常常会让人急于寻找昂贵的答案。采取行动以前，"
    "先观察流程并确认限制条件，可以避免把资源浪费在错误环节。效率并不只是做得更快，也包括减少误解、"
    "返工以及没有价值的步骤。"
)]

HSK6_SOURCE_EXTENSIONS = [(
    "调整过程中也出现了新的矛盾。有些长期读者担心讨论活动会破坏安静环境，带孩子的家长则希望增加更多"
    "互动空间。图书馆没有简单选择其中一方，而是重新划分时段和区域：上午保持安静，傍晚开放讨论室，"
    "周末的儿童活动提前预约。工作人员每月公布各区域的使用情况，并邀请意见不同的居民一起评估。"
    "他们还发现，最受欢迎的活动并不是专家讲座，而是居民根据真实需要组织的小型交流。例如，有人教老人"
    "使用手机查询信息，有人带孩子阅读关于本地历史的故事。参与者既是服务对象，也成为内容提供者。"
    "一年以后，图书馆没有继续盲目增加活动数量，而是取消参与度低的项目，把有限经费用于改善照明、"
    "无障碍设施和工作人员培训。管理者认识到，公共服务的成功不能只看人流量，还要观察服务是否覆盖了"
    "原本不方便使用的人，以及社区成员是否愿意承担共同责任。只有把反馈变成持续调整的机制，一次成功的"
    "改造才不会随着热情消失而结束。"
), (
    "导师制度开始时也并不顺利。有的导师把它当成额外任务，只在月底签字；有的新人担心提问会显得能力"
    "不足，仍然选择独自处理。企业因此减少形式化表格，要求导师和新人每两周围绕一个真实问题交流，"
    "并允许双方在合作不合适时重新匹配。部门负责人只检查目标和结果，不要求公开私人谈话内容。"
    "与此同时，企业把新人常见的错误整理为匿名案例，让不同部门讨论流程中哪些规定容易引起误解。"
    "一些原来被认为是个人粗心的问题，实际上来自文件版本混乱和职责边界不清。修改流程以后，不仅新人"
    "犯错减少，老员工的重复工作也下降了。公司还发现，表现最好的导师并不一定经验最丰富，而是能够提出"
    "问题、承认自己不知道，并帮助新人寻找可靠信息的人。后来，导师经历被纳入管理者培养，但不直接与"
    "短期奖金挂钩，以免交流变成表演。这个案例提醒人们，留住人才不是提供一次欢迎活动，而是建立一种"
    "可以学习、求助和修正错误的工作环境。员工感到被支持，并不意味着要求被降低，而是他们清楚标准，"
    "也相信努力遇到阻碍时能够得到有效反馈。"
), (
    "试验线路并非每次都成功。有一条线路虽然缩短了距离，却增加了老人换乘的困难；另一条线路受到网络"
    "欢迎，实际乘客却很少。交通部门没有把失败隐藏起来，而是在公开说明原因后恢复原方案。这样的做法"
    "起初受到质疑，但逐渐使居民理解，试验不是随意改变，而是为了在大规模投入前发现问题。"
    "数据使用也需要谨慎。手机记录能够显示人群移动，却不能说明没有智能手机的人如何出行。因此调查员"
    "仍然在车站访谈老人、学生和夜班职工，并与医院了解行动不便者的需求。不同信息有时互相矛盾，管理者"
    "必须说明选择依据，而不能只挑选支持原计划的数据。后来，城市建立季度评估制度，把准点率、步行距离、"
    "票价负担和不同区域的服务差距一起公布。居民可以提出建议，但每项建议都要经过安全和成本评估。"
    "这种制度没有让所有人完全满意，却使争论从个人感受逐渐转向可以核实的问题。公共决策面对的往往不是"
    "唯一正确答案，而是在多种限制之间寻找较公平的安排。透明的试验、完整的信息和承认错误的能力，"
    "比一次看似完美却无法调整的计划更有价值。"
), (
    "交流活动也改变了教师的角色。过去，教师习惯在学生发言后立即给出标准解释，学生便等待结论，不愿"
    "暴露自己的困惑。后来教师先追问证据，让其他同学比较不同理解，最后才补充作品背景。为了避免善于"
    "表达的学生占据全部时间，小组设置了主持、记录和提问等轮换任务，书面表达较弱的学生也能通过整理"
    "问题参与讨论。学校还把图书馆员加入课程设计，由他们介绍怎样判断资料来源、怎样使用目录寻找相关"
    "作品。学生发现，同一主题在小说、历史记录和新闻中可能呈现完全不同的角度。期末评价不再统计笔记"
    "页数，而是要求学生选择一次观点变化，说明最初的判断、影响自己的证据以及仍未解决的问题。"
    "这种评价比统一答案更难评分，教师需要共同制定标准并保存案例，工作量一度增加。但经过调整，教师"
    "发现学生在其他学科中也更愿意核实信息，写作时引用材料更准确。学校并没有否定借阅量和考试成绩，"
    "而是把它们放回适当位置：这些数字能够提示现象，却不能单独解释学习质量。阅读教育的目标不是让每"
    "个人喜欢同一本书，而是培养持续理解、讨论和修正判断的能力。"
), (
    "为了确认改进不是短期现象，餐馆又记录了三个月的数据。管理者发现，等待时间在节假日仍然上升，"
    "原因是临时员工不了解新的标记。于是厨师把流程制作成简单图示，新员工先在非高峰时段练习，再进入"
    "正式岗位。服务员也被允许在订单信息不完整时立即退回确认，而不必担心受到批评。过去大家为了表现"
    "速度，常常把不清楚的问题留到最后，结果反而造成更多返工。菜单调整同样听取了顾客意见。一些制作"
    "复杂但具有地方特色的菜销量不高，餐馆没有直接取消，而是改为提前预订，并向顾客说明等待时间。"
    "这样既保留了特色，也让厨房能够安排原料。后来，邻近餐馆来参观这套流程，希望照搬订单标记。"
    "厨师长提醒他们，方法产生作用是因为它针对具体问题，换一个环境可能需要重新观察。"
    "管理者最终把每月一次的流程复盘固定下来，参与者包括厨师、服务员、采购人员和新员工。会议不追究"
    "个人责任，而是选择一个反复出现的问题，寻找可以小规模验证的改动。餐馆由此认识到，持续改进不是"
    "不断购买新工具，也不是要求员工无限加快速度，而是让信息准确流动，让每个岗位都能发现并纠正浪费。"
)]

VARIANT_CONTEXTS = [
    "",
    "在一次电话交流中",
    "完成当天的学习以后",
    "在周末的小组活动中",
    "整理本月安排时",
]


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def pinyin(text: str) -> str:
    parts = lazy_pinyin(text, style=Style.TONE, neutral_tone_with_five=False, errors=lambda x: list(x))
    joined = " ".join(parts)
    return re.sub(r"\s+([，。？！：；、])", r"\1", joined)


def audio_path(audio_segments: list[dict]) -> str:
    payload = json.dumps(audio_segments, ensure_ascii=False, sort_keys=True).encode("utf-8")
    digest = hashlib.sha256(payload).hexdigest()
    return f"./assets/audio/mock-tests/shared/{digest}.mp3"


def distribute_weights(count: int, total: float = 100.0) -> list[float]:
    base = round(total / count, 4)
    values = [base] * count
    values[-1] = round(total - sum(values[:-1]), 4)
    return values


def option_list(correct: str, distractors: list[str], seed: int, with_pinyin: bool) -> tuple[list[dict], str]:
    values = [correct] + [x for x in distractors if x != correct]
    values = values[:4] if len(values) >= 4 else values[:3]
    shift = seed % len(values)
    values = values[shift:] + values[:shift]
    ids = "ABCD"
    options = []
    answer = ""
    for index, value in enumerate(values):
        item = {"id": ids[index], "text": value}
        if with_pinyin:
            item["pinyin"] = pinyin(value)
        options.append(item)
        if value == correct:
            answer = ids[index]
    return options, answer


def listening_choices(values: list[str], correct: str, seed: int) -> list[str]:
    choices = [value for value in values if value != correct]
    if not choices:
        raise ValueError(f"Không có đáp án nhiễu cho {correct}")
    start = seed % len(choices)
    rotated = choices[start:] + choices[:start]
    return rotated[:3]


def build_varied_listening_item(level: int, serial: int) -> tuple[str, str, str, list[str], list[str]]:
    """Create one deterministic, answerable listening item for exam variants 2–5.

    Twenty scenario families rotate independently from names, places, times and
    objects. This keeps each exam varied without adding a repeated lead-in.
    """

    scenario = serial % 20
    cycle = serial // 20
    seed = serial * 7 + level * 11 + cycle * 3

    def pick(values: list[str], offset: int = 0, step: int = 1) -> str:
        return values[(seed * step + offset + cycle) % len(values)]

    name1 = NAMES[(scenario * 3 + cycle + level) % len(NAMES)]
    name2 = NAMES[(scenario * 7 + cycle * 3 + level + 4) % len(NAMES)]
    if name2 == name1:
        name2 = NAMES[(NAMES.index(name1) + 1) % len(NAMES)]
    place1 = pick(PLACES, 1)
    place2 = pick(PLACES, 5, 3)
    if place2 == place1:
        place2 = PLACES[(PLACES.index(place1) + 2) % len(PLACES)]
    time1 = pick(TIMES, 2)
    time2 = pick(TIMES, 7, 3)
    if time2 == time1:
        time2 = TIMES[(TIMES.index(time1) + 2) % len(TIMES)]
    activity1 = pick(ACTIVITIES, 3)
    activity2 = pick(ACTIVITIES, 8, 3)
    if activity2 == activity1:
        activity2 = ACTIVITIES[(ACTIVITIES.index(activity1) + 3) % len(ACTIVITIES)]
    event = pick(EVENTS, 3)
    event_place = EVENT_PLACES[EVENTS.index(event)]
    pair1 = PLACE_ACTIVITIES[(scenario * 2 + cycle + level) % len(PLACE_ACTIVITIES)]
    pair2 = PLACE_ACTIVITIES[(scenario * 3 + cycle * 2 + level + 4) % len(PLACE_ACTIVITIES)]
    if pair2 == pair1:
        pair2 = PLACE_ACTIVITIES[(PLACE_ACTIVITIES.index(pair1) + 1) % len(PLACE_ACTIVITIES)]
    transport1 = pick(TRANSPORTS, 1)
    transport2 = pick(TRANSPORTS, 4, 3)
    if transport2 == transport1:
        transport2 = TRANSPORTS[(TRANSPORTS.index(transport1) + 1) % len(TRANSPORTS)]
    item = pick(ITEMS, 2)
    color1 = pick(COLORS, 1)
    color2 = pick(COLORS, 4, 3)
    if color2 == color1:
        color2 = COLORS[(COLORS.index(color1) + 1) % len(COLORS)]
    food1 = pick(FOODS, 2)
    food2 = pick(FOODS, 5, 3)
    if food2 == food1:
        food2 = FOODS[(FOODS.index(food1) + 1) % len(FOODS)]
    price = pick(PRICES, 2)
    duration = pick(DURATIONS, 3)
    weekday1 = pick(WEEKDAYS, 1)
    weekday2 = pick(WEEKDAYS, 4, 3)
    if weekday2 == weekday1:
        weekday2 = WEEKDAYS[(WEEKDAYS.index(weekday1) + 2) % len(WEEKDAYS)]
    reason = pick(REASONS, 2)
    count = pick(COUNTS, 3)
    method_pool = BASIC_METHODS if level <= 3 else METHODS
    result_pool = BASIC_RESULTS if level <= 3 else RESULTS
    purpose_pool = BASIC_PURPOSES if level <= 3 else PURPOSES
    evaluation_pool = BASIC_EVALUATIONS if level <= 3 else EVALUATIONS
    method = pick(method_pool, 1)
    result = pick(result_pool, 2)
    purpose = pick(purpose_pool, 3)
    evaluation = pick(evaluation_pool, 4)
    advanced = level >= 4

    if scenario == 0:
        if advanced:
            statement = f"{name1}负责的{event}原定{time1}在{event_place}开始，场地确认后顺延到{time2}，其他安排不变。"
        else:
            statement = f"{name1}原来要{time1}去{event_place}参加{event}，现在改到{time2}。"
        asked, correct, pool = f"{name1}参加的{event}现在什么时候开始？", time2, TIMES
    elif scenario == 1:
        if advanced:
            statement = f"{name1}先到{pair1[0]}{pair1[1]}，随后前往{pair2[0]}{pair2[1]}，中途不再停留。"
        else:
            statement = f"{name1}先去{pair1[0]}{pair1[1]}，然后到{pair2[0]}{pair2[1]}。"
        asked, correct, pool = f"{name1}最后去哪里？", pair2[0], PLACES
    elif scenario == 2:
        if advanced:
            statement = f"{transport1}受{reason}影响，{name1}权衡时间后改乘{transport2}前往{place1}。"
        else:
            statement = f"因为{reason}，{name1}不坐{transport1}了，改坐{transport2}去{place1}。"
        asked, correct, pool = f"{name1}最后怎么去{place1}？", transport2, TRANSPORTS
    elif scenario == 3:
        if advanced:
            statement = f"{name1}在{pair1[0]}完成{pair1[1]}后，又前往{pair2[0]}{pair2[1]}，没有直接回家。"
        else:
            statement = f"{name1}在{pair1[0]}{pair1[1]}以后，还要去{pair2[0]}{pair2[1]}。"
        asked, correct, pool = f"{name1}{pair1[1]}以后做什么？", pair2[1], [item[1] for item in PLACE_ACTIVITIES]
    elif scenario == 4:
        if advanced:
            statement = f"{name1}负责整理资料，{name2}负责与{place1}联系；需要确认时间的是后者。"
        else:
            statement = f"{name1}整理东西，{name2}给{place1}打电话问时间。"
        asked, correct, pool = f"谁负责向{place1}确认时间？", name2, NAMES
    elif scenario == 5:
        if advanced:
            statement = f"桌上有两个{item}，{color1}的是{name1}的，贴着标签的{color2}那个属于{name2}。"
        else:
            statement = f"{color1}的{item}是{name1}的，{color2}的是{name2}的。"
        asked, correct, pool = f"{name2}的{item}是什么颜色？", color2, COLORS
    elif scenario == 6:
        if advanced:
            statement = f"{name1}比较了几家店，最终以{price}买下{item}，价格包含送货费。"
        else:
            statement = f"{name1}在商店买了一个{item}，一共花了{price}。"
        asked, correct, pool = f"{name1}买的{item}多少钱？", price, PRICES
    elif scenario == 7:
        if advanced:
            statement = f"{name1}觉得{food1}清淡合适，{food2}虽然有名却不合口味，因此点了前者。"
        else:
            statement = f"{name1}喜欢吃{food1}，不太喜欢{food2}。"
        asked, correct, pool = f"{name1}选择了什么？", food1, FOODS
    elif scenario == 8:
        if advanced:
            statement = f"{name1}了解到，从{place1}到{place2}通常需要{duration}，高峰期还可能再多十分钟。"
        else:
            statement = f"{name1}从{place1}到{place2}要{duration}。"
        asked, correct, pool = f"平时从{place1}到{place2}要多久？", duration, DURATIONS
    elif scenario == 9:
        if advanced:
            statement = f"{pair1[0]}在{weekday1}暂停开放，{name1}只好把原定{pair1[1]}改到{weekday2}。"
        else:
            statement = f"{pair1[0]}{weekday1}不开门，{name1}改成{weekday2}去{pair1[1]}。"
        asked, correct, pool = f"{name1}哪天去{pair1[0]}？", weekday2, WEEKDAYS
    elif scenario == 10:
        if advanced:
            statement = f"{name1}得知，考虑到{reason}，负责人取消了在{event_place}举行的{event}，并及时通知了参加者。"
            asked = f"{name1}提到的{event}为什么取消？"
        else:
            statement = f"因为{reason}，{name1}今天不能去{event_place}参加{event}。"
            asked = f"{name1}为什么不能按原计划参加{event}？"
        correct, pool = reason, REASONS
    elif scenario == 11:
        if advanced:
            statement = f"{place1}原本需要准备更多材料，核对报名人数后只保留了{count}，数量已经确认。"
        else:
            statement = f"{name1}要准备{count}材料，不是一份。"
        asked, correct, pool = f"{name1}最后需要准备多少？", count, COUNTS
    elif scenario == 12:
        if advanced:
            statement = f"{name1}离开{place1}后才发现{item}不在身边，回想起来应该落在{place2}的服务台。"
        else:
            statement = f"{name1}把{item}忘在{place2}了，到了{place1}才发现。"
        asked, correct, pool = f"{item}可能在哪里？", place2, PLACES
    elif scenario == 13:
        if advanced:
            statement = f"针对{reason}带来的影响，{name1}没有急着继续，而是决定{method}。"
        else:
            statement = f"{name1}遇到了问题，朋友建议他{method}。"
        asked, correct, pool = f"别人给{name1}什么建议？", method, method_pool
    elif scenario == 14:
        if advanced:
            statement = f"{name1}说明，{place1}调整流程并不是为了减少服务，而是为了{purpose}，试行一个月后再评估。"
            asked = f"{name1}说{place1}这样安排的主要目的是什么？"
        else:
            purpose_place = BASIC_PURPOSE_PLACES[BASIC_PURPOSES.index(purpose)]
            statement = f"{name1}每天去{purpose_place}，是为了{purpose}。"
            asked = f"{name1}为什么每天去{purpose_place}？"
        correct, pool = purpose, purpose_pool
    elif scenario == 15:
        if advanced:
            statement = f"面对进度落后的情况，{name1}采用了新办法：{method}，而不是简单延长工作时间。"
        else:
            statement = f"为了做好这件事，{name1}决定{method}。"
        asked, correct, pool = f"{name1}用了什么办法？", method, method_pool
    elif scenario == 16:
        if advanced:
            statement = f"{name1}所在的团队调整以后不仅没有耽误进度，还{result}，说明前面的判断是有效的。"
        else:
            statement = f"{name1}照着计划做，最后{result}。"
        asked, correct, pool = f"{name1}这边最后的结果怎么样？", result, result_pool
    elif scenario == 17:
        if advanced:
            statement = f"{name1}没有直接处理细节，而是先{method}，确认方向后才安排后续工作。"
        else:
            statement = f"{name1}先{method}，然后才去{place1}。"
        asked, correct, pool = f"{name1}先做了什么？", method, method_pool
    elif scenario == 18:
        if advanced:
            statement = f"{name1}体验了{place1}的新服务后认为，它{evaluation}，总体上值得继续使用。"
        else:
            statement = f"{name1}觉得这个地方{evaluation}。"
        asked, correct, pool = f"{name1}怎么评价这里？", evaluation, evaluation_pool
    else:
        if advanced:
            statement = f"讨论过{reason}和时间成本后，{name1}放弃了{activity1}，最终决定先{activity2}。"
        else:
            statement = f"{name1}本来要{activity1}，后来决定先{activity2}。"
        asked, correct, pool = f"{name1}最后决定先做什么？", activity2, ACTIVITIES

    distractors = listening_choices(pool, correct, seed + scenario)
    return statement, asked, correct, distractors, [correct, place1]


def build_listening_questions(level: int, count: int, repeat_count: int, variant: int = 1) -> tuple[list[dict], dict]:
    clauses = LEVEL_CLAUSES[level]
    weights = distribute_weights(count)
    questions, answers = [], {}
    for i in range(count):
        if variant > 1:
            serial = (variant - 2) * count + i
            statement, asked, correct, distractors, vocabulary_tags = build_varied_listening_item(level, serial)
        else:
            statement, asked, correct = clauses[i % len(clauses)]
            name = NAMES[(i * 3 + level) % len(NAMES)]
            place = PLACES[(i * 2 + level) % len(PLACES)]
            time = TIMES[(i * 4 + level) % len(TIMES)]
            activity = ACTIVITIES[(i * 5 + level) % len(ACTIVITIES)]
            if i >= len(clauses):
                context = ["这周", "下周", "这个月", "假期里", "培训期间"][i // len(clauses) - 1]
                changed_time = TIMES[(i + 2) % len(TIMES)]
                statement = f"{context}，{name}原来准备{time}去{place}{activity}，后来因为临时有事，改到了{changed_time}。"
                asked = f"{name}为什么改变了安排？"
                correct = "临时有事"
            distractors = [
                PLACES[(i + 1) % len(PLACES)],
                TIMES[(i + 3) % len(TIMES)],
                ACTIVITIES[(i + 4) % len(ACTIVITIES)],
            ]
            vocabulary_tags = [place, activity]

        if variant == 1 or (i + variant) % 2:
            statement_speaker = {"speaker": "female", "voice": "zh-CN-XiaoxiaoNeural", "label": "女"}
            question_speaker = {"speaker": "male", "voice": "zh-CN-YunxiNeural", "label": "男"}
        else:
            statement_speaker = {"speaker": "male", "voice": "zh-CN-YunxiNeural", "label": "男"}
            question_speaker = {"speaker": "female", "voice": "zh-CN-XiaoxiaoNeural", "label": "女"}
        rate = LISTENING_RATES[level]
        segments = [
            {
                "speaker": statement_speaker["speaker"],
                "voice": statement_speaker["voice"],
                "text": statement,
                "rate": rate,
                "role": "content",
            },
            {
                "speaker": question_speaker["speaker"],
                "voice": question_speaker["voice"],
                "text": asked,
                "rate": LISTENING_QUESTION_RATES[level],
                "role": "question",
                "pauseBeforeMs": LISTENING_QUESTION_PAUSE_MS,
            },
        ]
        if level in LISTENING_POST_TEMPOS:
            for segment in segments:
                segment["postTempo"] = LISTENING_POST_TEMPOS[level]
        option_seed = i if variant == 1 else i + variant * 17
        options, correct_id = option_list(correct, distractors, option_seed, level <= 2)
        qid = f"l{i + 1:03d}"
        question = {
            "id": qid,
            "questionType": "single_choice",
            "instruction": "Nghe đoạn hội thoại và chọn đáp án đúng.",
            "prompt": asked,
            "options": options,
            "transcript": (
                f"{statement_speaker['label']}：{statement}\n"
                f"{question_speaker['label']}：{asked}"
            ),
            "audioText": f"{statement} {asked}",
            "audioSegments": segments,
            "audioPath": audio_path(segments),
            "repeatCount": repeat_count,
            "scoreWeight": weights[i],
            "vocabularyTags": vocabulary_tags,
            "difficulty": f"HSK{level}",
        }
        if level <= 2:
            question["promptPinyin"] = pinyin(asked)
            question["transcriptPinyin"] = pinyin(f"{statement} {asked}")
        questions.append(question)
        answers[qid] = {
            "correctAnswer": correct_id,
            "explanation": f"Trong audio, thông tin quyết định là “{correct}”.",
        }
    return questions, answers


def build_reading_questions(level: int, count: int, variant: int = 1) -> tuple[list[dict], dict]:
    items = READING_ITEMS[level]
    weights = distribute_weights(count)
    questions, answers = [], {}
    for i in range(count):
        sentence, choices, correct = items[i % len(items)]
        if i >= len(items):
            prefix = NAMES[(i + level) % len(NAMES)]
            context = ["周一开会时", "周三上课时", "周末活动中", "月底总结时", "旅行回来后"][i // len(items) - 1]
            sentence = f"{context}，{prefix}说：“{sentence}”"
        if variant > 1:
            speaker = NAMES[(i + level + variant * 2) % len(NAMES)]
            sentence = f"{VARIANT_CONTEXTS[variant - 1]}，{speaker}写下了这句话：“{sentence}”"
        options, correct_id = option_list(correct, [x for x in choices if x != correct], i + level, level <= 2)
        qid = f"r{i + 1:03d}"
        question = {
            "id": qid,
            "questionType": "single_choice",
            "instruction": "Chọn từ hoặc cụm từ thích hợp nhất.",
            "prompt": sentence,
            "options": options,
            "repeatCount": 0,
            "scoreWeight": weights[i],
            "vocabularyTags": [correct],
            "difficulty": f"HSK{level}",
        }
        if level <= 2:
            question["promptPinyin"] = pinyin(sentence)
        questions.append(question)
        answers[qid] = {
            "correctAnswer": correct_id,
            "explanation": f"“{correct}” phù hợp nhất với ngữ pháp và ngữ nghĩa của câu.",
        }
    return questions, answers


def build_writing_questions(level: int, count: int, variant: int = 1) -> tuple[list[dict], dict]:
    questions, answers = [], {}
    weights = distribute_weights(count)
    if level in (3, 4, 5):
        reorder_count = {3: 5, 4: 10, 5: 8}[level]
        replacements = [
            {},
            {"我": "小林", "妹妹": "小雨", "他": "李明", "我们": "同学们", "这本书": "这份材料", "她": "王芳"},
            {"我": "王芳", "妹妹": "表妹", "他": "陈先生", "我们": "大家", "这本书": "这本词典", "她": "刘阿姨"},
            {"我": "小雨", "妹妹": "同学", "他": "赵经理", "我们": "团队", "这本书": "这份报告", "她": "林医生"},
            {"我": "李明", "妹妹": "朋友", "他": "周同学", "我们": "志愿者们", "这本书": "这本小说", "她": "张老师"},
        ][variant - 1]
        for i, raw in enumerate(REORDERS[level]):
            for source, target in sorted(replacements.items(), key=lambda item: len(item[0]), reverse=True):
                raw = raw.replace(source, target, 1)
            tokens = raw.split("|")
            if variant > 1 and level in REORDER_PREFIXES:
                tokens.insert(0, REORDER_PREFIXES[level][variant - 2][i])
            answer = "".join(tokens) + "。"
            qid = f"w{i + 1:03d}"
            questions.append({
                "id": qid,
                "questionType": "reorder",
                "instruction": "Sắp xếp các từ thành một câu hoàn chỉnh.",
                "prompt": " / ".join(reversed(tokens) if i % 2 else tokens[1:] + tokens[:1]),
                "tokens": list(reversed(tokens) if i % 2 else tokens[1:] + tokens[:1]),
                "repeatCount": 0,
                "scoreWeight": weights[i],
                "vocabularyTags": tokens[:2],
                "difficulty": f"HSK{level}",
            })
            answers[qid] = {
                "acceptedAnswers": [answer, answer.rstrip("。")],
                "explanation": f"Trật tự tự nhiên: {answer}",
            }
        if level == 3:
            for offset, (romanized, answer) in enumerate(HANZI_WRITING_VARIANTS[variant - 1]):
                i = reorder_count + offset
                qid = f"w{i + 1:03d}"
                questions.append({
                    "id": qid,
                    "questionType": "hanzi_from_pinyin",
                    "instruction": "Viết câu chữ Hán tương ứng với pinyin.",
                    "prompt": romanized,
                    "placeholder": "Nhập chữ Hán",
                    "repeatCount": 0,
                    "scoreWeight": weights[i],
                    "vocabularyTags": answer[-3:],
                    "difficulty": "HSK3",
                })
                answers[qid] = {
                    "acceptedAnswers": [answer, answer + "。"],
                    "explanation": answer,
                }
        elif level == 4:
            for offset, (image, keyword, accepted) in enumerate(PICTURE_TASK_VARIANTS[variant - 1]):
                i = reorder_count + offset
                qid = f"w{i + 1:03d}"
                questions.append({
                    "id": qid,
                    "questionType": "short_writing",
                    "instruction": "Nhìn hình và dùng từ cho trước để đặt một câu.",
                    "prompt": f"Từ cho trước: {keyword}",
                    "requiredWords": [keyword],
                    "imagePath": f"./assets/images/mock-tests/{image}",
                    "imageAlt": f"Minh họa cho từ {keyword}",
                    "placeholder": "Viết một câu tiếng Trung",
                    "repeatCount": 0,
                    "scoreWeight": weights[i],
                    "vocabularyTags": [keyword],
                    "difficulty": "HSK4",
                })
                answers[qid] = {
                    "acceptedAnswers": accepted,
                    "rubric": {"requiredWords": 2, "grammar": 2, "meaning": 1},
                    "explanation": f"Câu tham khảo: {accepted[0]}",
                }
        else:
            required_words, image_name, image_prompt = HSK5_LONG_TASK_VARIANTS[variant - 1]
            long_tasks = [
                {
                    "prompt": f"Viết một đoạn khoảng 80 chữ, bắt buộc dùng đủ các từ: {'、'.join(required_words)}。",
                    "requiredWords": required_words,
                    "imagePath": None,
                },
                {
                    "prompt": image_prompt,
                    "requiredWords": [],
                    "imagePath": f"./assets/images/mock-tests/{image_name}",
                },
            ]
            for offset, task in enumerate(long_tasks):
                i = reorder_count + offset
                qid = f"w{i + 1:03d}"
                question = {
                    "id": qid,
                    "questionType": "long_writing",
                    "instruction": "Viết đoạn văn theo yêu cầu; hệ thống chỉ kiểm tra điều kiện cơ bản, không giả lập điểm chính xác.",
                    "prompt": task["prompt"],
                    "requiredWords": task["requiredWords"],
                    "minCharacters": 70,
                    "targetCharacters": 80,
                    "placeholder": "Viết đoạn văn tiếng Trung tại đây",
                    "repeatCount": 0,
                    "scoreWeight": weights[i],
                    "vocabularyTags": task["requiredWords"],
                    "difficulty": "HSK5",
                }
                if task["imagePath"]:
                    question["imagePath"] = task["imagePath"]
                    question["imageAlt"] = "Hình minh họa cho đề viết HSK 5"
                questions.append(question)
                answers[qid] = {
                    "grading": "rubric",
                    "rubric": {"taskCompletion": 15, "organization": 15, "language": 15, "mechanics": 5},
                    "explanation": "Bài viết dài cần được chấm theo rubric; không có một đáp án chuỗi duy nhất.",
                }
    elif level == 6:
        qid = "w001"
        questions.append({
            "id": qid,
            "questionType": "summary_writing",
            "instruction": "Đọc bài nguồn trong 10 phút. Sau đó bài nguồn sẽ bị ẩn và bạn có 35 phút để viết bản tóm tắt khoảng 400 chữ; không thêm quan điểm cá nhân.",
            "prompt": "Tóm tắt nội dung bài đọc bằng tiếng Trung.",
            "sourceText": HSK6_SOURCES[variant - 1] + HSK6_SOURCE_EXTENSIONS[variant - 1],
            "sourceReadMinutes": 10,
            "writingMinutes": 35,
            "minCharacters": 320,
            "targetCharacters": 400,
            "forbidNotesDuringReading": True,
            "placeholder": "Viết bản tóm tắt tại đây",
            "repeatCount": 0,
            "scoreWeight": 100,
            "vocabularyTags": ["概括", "公共服务", "社区"],
            "difficulty": "HSK6",
        })
        answers[qid] = {
            "grading": "rubric",
            "rubric": {"contentAccuracy": 40, "organization": 25, "language": 25, "noPersonalOpinion": 10},
            "explanation": "Bài tóm tắt cần chấm theo rubric và không có một đáp án chuỗi duy nhất.",
        }
    return questions, answers


def split_parts(section_id: str, questions: list[dict], counts: list[int]) -> list[dict]:
    parts, offset = [], 0
    for index, part_count in enumerate(counts, start=1):
        chunk = questions[offset:offset + part_count]
        for question in chunk:
            question["partId"] = f"{section_id}-part-{index}"
        parts.append({
            "id": f"{section_id}-part-{index}",
            "title": f"Phần {index}",
            "instruction": PART_INSTRUCTIONS.get(section_id, ["Hoàn thành yêu cầu."])[min(index - 1, len(PART_INSTRUCTIONS.get(section_id, [""])) - 1)]
            if section_id != "writing"
            else chunk[0]["instruction"],
            "questions": chunk,
        })
        offset += part_count
    return parts


def exam_shell(exam_id: str, level: int, title: str, description: str) -> dict:
    config = LEVEL_CONFIG[level]
    total_questions = sum(section[2] for section in config["sections"])
    timed_minutes = sum(section[3] for section in config["sections"])
    total_points = 200 if level <= 2 else 300
    return {
        "schemaVersion": 2,
        "id": exam_id,
        "level": f"HSK {level}",
        "levelNumber": level,
        "standardVersion": STANDARD_VERSION,
        "title": title,
        "description": description,
        "status": "published",
        "contentSource": "original_project_content",
        "officialTotalDurationMinutes": config["official"],
        "timedDurationMinutes": timed_minutes,
        "personalInfoMinutesOmitted": 5,
        "totalQuestionCount": total_questions,
        "totalPoints": total_points,
        "passPoints": config["pass"],
        "answerKeyPath": f"./assets/data/mock-tests/answer-keys/{exam_id}.answers.json",
        "introAudio": {
            "vi": f"./assets/audio/mock-tests/intros/hsk{level}/intro-vi.mp3",
            "zh": f"./assets/audio/mock-tests/intros/hsk{level}/intro-zh.mp3",
            "soundTest": "./assets/audio/mock-tests/shared/sound-test.mp3",
        },
        "modeSettings": {
            "defaultMode": "official",
            "official": {
                "sectionTimers": True,
                "lockPreviousSections": True,
                "lockFutureSections": True,
                "allowAudioReplay": False,
                "allowAudioSeeking": False,
                "showExplanationsDuringExam": False,
            },
            "practice": {
                "sectionTimers": False,
                "lockPreviousSections": False,
                "lockFutureSections": False,
                "allowAudioReplay": True,
                "allowAudioSeeking": True,
                "showExplanationsDuringExam": True,
            },
        },
        "sections": [],
    }


def migrate_hsk1(source: dict) -> tuple[dict, dict]:
    exam = exam_shell(source["id"], 1, source["title"], source.get("description", "Đề HSK 1 được chuẩn hóa theo cấu trúc hiện hành."))
    key = {"schemaVersion": 1, "examId": source["id"], "standardVersion": STANDARD_VERSION, "answers": {}}
    config_sections = {item[0]: item for item in LEVEL_CONFIG[1]["sections"]}
    for legacy_section in source["sections"]:
        section_id = legacy_section["id"]
        _, title, expected, minutes, part_counts, repeats = config_sections[section_id]
        questions = []
        weights = distribute_weights(expected)
        for index, old in enumerate(legacy_section["questions"]):
            qtype = old.get("type", "single_choice")
            segments = [{
                "speaker": "female",
                "voice": "zh-CN-XiaoxiaoNeural",
                "text": old.get("transcript") or old.get("hanzi") or old["prompt"],
                "rate": LISTENING_RATES[1],
                "postTempo": LISTENING_POST_TEMPOS[1],
            }]
            question = {
                "id": old["id"],
                "questionType": qtype,
                "instruction": old.get("prompt", "Chọn đáp án đúng."),
                "prompt": old.get("prompt", "Chọn đáp án đúng."),
                "audioText": segments[0]["text"] if section_id == "listening" else None,
                "audioSegments": segments if section_id == "listening" else None,
                "audioPath": audio_path(segments) if section_id == "listening" else None,
                "transcript": old.get("transcript") if section_id == "listening" else None,
                "transcriptPinyin": old.get("transcriptPinyin") if section_id == "listening" else None,
                "hanzi": old.get("hanzi"),
                "pinyin": old.get("pinyin"),
                "context": old.get("context"),
                "contextPinyin": old.get("contextPinyin"),
                "options": old.get("options"),
                "repeatCount": repeats if section_id == "listening" else 0,
                "scoreWeight": weights[index],
                "vocabularyTags": [],
                "difficulty": "HSK1",
            }
            question = {name: value for name, value in question.items() if value not in (None, [], "")}
            questions.append(question)
            answer_entry = {"explanation": old.get("explanation", "Đối chiếu nội dung câu hỏi và thông tin đã nghe/đọc.")}
            if qtype == "fill_blank":
                answer_entry["acceptedAnswers"] = old.get("acceptedAnswers") or [old.get("answer", "")]
            else:
                answer_entry["correctAnswer"] = old.get("answer")
            key["answers"][old["id"]] = answer_entry
        exam["sections"].append({
            "id": section_id,
            "title": title,
            "durationMinutes": minutes,
            "questionCount": expected,
            "repeatCount": repeats,
            "parts": split_parts(section_id, questions, part_counts),
        })
    return exam, key


def build_generated_exam(level: int, variant: int) -> tuple[dict, dict]:
    exam_id = f"hsk{level}-mock-{variant:03d}"
    exam = exam_shell(
        exam_id,
        level,
        f"Đề thi thử HSK {level} — Số {variant:02d}",
        f"Đề luyện HSK {level} số {variant:02d} do Tiếng Trung Cô Ca biên soạn riêng theo cấu trúc HSK 2.0 hiện hành.",
    )
    key = {"schemaVersion": 1, "examId": exam_id, "standardVersion": STANDARD_VERSION, "answers": {}}
    for section_id, title, count, minutes, part_counts, repeats in LEVEL_CONFIG[level]["sections"]:
        if section_id == "listening":
            questions, answers = build_listening_questions(level, count, repeats, variant)
        elif section_id == "reading":
            questions, answers = build_reading_questions(level, count, variant)
        else:
            questions, answers = build_writing_questions(level, count, variant)
        key["answers"].update(answers)
        exam["sections"].append({
            "id": section_id,
            "title": title,
            "durationMinutes": minutes,
            "questionCount": count,
            "repeatCount": repeats,
            "parts": split_parts(section_id, questions, part_counts),
        })
    return exam, key


def build_standard() -> dict:
    levels = {}
    for level, config in LEVEL_CONFIG.items():
        levels[str(level)] = {
            "officialTotalDurationMinutes": config["official"],
            "personalInfoMinutes": 5,
            "timedDurationMinutes": sum(item[3] for item in config["sections"]),
            "totalQuestionCount": sum(item[2] for item in config["sections"]),
            "totalPoints": 200 if level <= 2 else 300,
            "passPoints": config["pass"],
            "sections": [
                {
                    "id": section_id,
                    "questionCount": count,
                    "durationMinutes": minutes,
                    "partCounts": parts,
                    "repeatCount": repeats,
                }
                for section_id, _, count, minutes, parts, repeats in config["sections"]
            ],
        }
    return {
        "id": STANDARD_VERSION,
        "label": "HSK 2.0 hiện hành",
        "status": "default",
        "effectivePolicy": "Không trộn cấu trúc với HSK 3.0 trong cùng một đề.",
        "levels": levels,
    }


def build_schema() -> dict:
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://tiengtrungcoca.vn/schemas/mock-exam-v2.schema.json",
        "title": "Tiếng Trung Cô Ca mock exam v2",
        "type": "object",
        "required": ["schemaVersion", "id", "levelNumber", "standardVersion", "status", "sections", "answerKeyPath"],
        "properties": {
            "schemaVersion": {"const": 2},
            "id": {"type": "string", "minLength": 1},
            "levelNumber": {"type": "integer", "minimum": 1, "maximum": 6},
            "standardVersion": {"type": "string", "minLength": 1},
            "status": {"enum": ["draft", "published", "archived"]},
            "answerKeyPath": {"type": "string", "minLength": 1},
            "sections": {
                "type": "array",
                "minItems": 2,
                "items": {
                    "type": "object",
                    "required": ["id", "durationMinutes", "questionCount", "parts"],
                    "properties": {
                        "id": {"enum": ["listening", "reading", "writing"]},
                        "durationMinutes": {"type": "number", "exclusiveMinimum": 0},
                        "parts": {"type": "array", "minItems": 1},
                    },
                },
            },
        },
    }


def build_voices() -> dict:
    return {
        "version": 1,
        "voices": {
            "viFemale": "vi-VN-HoaiMyNeural",
            "zhFemale": "zh-CN-XiaoxiaoNeural",
            "zhMale": "zh-CN-YunxiNeural",
            "enFemale": "en-US-JennyNeural",
        },
        "aliases": {
            "xiaoxiaonature": "zh-CN-XiaoxiaoNeural",
            "XiaoxiaoNatural": "zh-CN-XiaoxiaoNeural",
            "zh-CN-XiaoxiaoNatural": "zh-CN-XiaoxiaoNeural",
        },
        "encoding": {"format": "mp3", "sampleRate": 24000, "channels": 1, "bitrateKbps": 56},
        "generation": {"concurrency": 4, "retries": 4, "resume": True, "hash": "sha256"},
    }


def main() -> None:
    write_json(DATA_ROOT / "schemas/exam-v2.schema.json", build_schema())
    write_json(DATA_ROOT / "standards/hsk-2.0-current.json", build_standard())
    write_json(DATA_ROOT / "voices.json", build_voices())

    all_exams = []
    legacy_names = ["hsk1-h10901", "hsk1-h10902", "hsk1-h11003", "hsk1-h11004", "hsk1-h11005"]
    for name in legacy_names:
        source = json.loads((LEGACY_DIR / f"{name}.json").read_text(encoding="utf-8"))
        exam, key = migrate_hsk1(source)
        write_json(EXAM_ROOT / "hsk1" / f"{name}.json", exam)
        write_json(KEY_ROOT / f"{name}.answers.json", key)
        all_exams.append(exam)

    for level in range(2, 7):
        for variant in range(1, 6):
            exam, key = build_generated_exam(level, variant)
            write_json(EXAM_ROOT / f"hsk{level}" / f"{exam['id']}.json", exam)
            write_json(KEY_ROOT / f"{exam['id']}.answers.json", key)
            all_exams.append(exam)

    index = [
        {
            "id": exam["id"],
            "title": exam["title"],
            "level": exam["level"],
            "levelNumber": exam["levelNumber"],
            "standardVersion": exam["standardVersion"],
            "description": exam["description"],
            "officialTotalDurationMinutes": exam["officialTotalDurationMinutes"],
            "timedDurationMinutes": exam["timedDurationMinutes"],
            "questionCount": exam["totalQuestionCount"],
            "accessType": "free" if exam["id"] in FREE_EXAM_IDS else "vip",
            "active": exam["status"] == "published",
            "path": f"./assets/data/mock-tests/exams/hsk{exam['levelNumber']}/{exam['id']}.json",
        }
        for exam in all_exams
    ]
    write_json(EXAM_ROOT / "index.json", index)
    print(f"Built {len(all_exams)} exams with {sum(item['totalQuestionCount'] for item in all_exams)} questions.")


if __name__ == "__main__":
    main()
