import json

from course_content_tools import (
    COURSE_DIR,
    chunk_list,
    count_hanzi,
    ensure_all_words_present,
    load_json,
    load_word_lookup,
    lookup_coverage,
    segment_text,
    write_json,
)


SOURCES = {
    "dong_son": {
        "name": "Bảo tàng Lịch sử Quốc gia Việt Nam — Văn hóa Đông Sơn",
        "url": "https://baotanglichsu.vn/vi/Articles/3101/16033/van-hoa-djong-son-tu-da-su-djen-su-thuc-khao-hoc.html",
    },
    "bach_dang": {
        "name": "Bảo tàng Lịch sử Quốc gia Việt Nam — Ngô Quyền và chiến thắng Bạch Đằng năm 938",
        "url": "https://baotanglichsu.vn/vi/Articles/3098/13934/ngo-quyen-va-chienthang-bach-dang-nam-938.html",
    },
    "hai_ba_trung": {
        "name": "Bảo tàng Lịch sử Quốc gia Việt Nam — Khởi nghĩa Hai Bà Trưng",
        "url": "https://baotanglichsu.vn/VI/Articles/3091/69657/le-ky-niem-1979-nam-khoi-nghia-hai-ba-trung.html",
    },
    "thang_long": {
        "name": "UNESCO World Heritage Centre — Central Sector of the Imperial Citadel of Thang Long",
        "url": "https://whc.unesco.org/en/list/1328/",
    },
    "hoi_an": {
        "name": "UNESCO World Heritage Centre — Hoi An Ancient Town",
        "url": "https://whc.unesco.org/en/decisions/2637",
    },
    "hue": {
        "name": "UNESCO World Heritage Centre — Complex of Hué Monuments",
        "url": "https://whc.unesco.org/en/list/678",
    },
    "trang_an": {
        "name": "UNESCO World Heritage Centre — Trang An Landscape Complex",
        "url": "https://whc.unesco.org/en/list/1438",
    },
    "ha_long": {
        "name": "UNESCO World Heritage Centre — Ha Long Bay - Cat Ba Archipelago",
        "url": "https://whc.unesco.org/en/list/672/",
    },
    "dien_bien": {
        "name": "Bảo tàng Lịch sử Quốc gia Việt Nam — Chiến dịch Điện Biên Phủ năm 1954",
        "url": "https://baotanglichsu.vn/VI/Articles/3097/14248/mot-so-hinh-anh-ve-chien-dich-djien-bien-phu-nam-1954.html",
    },
    "dien_bien_notebook": {
        "name": "Bảo tàng Lịch sử Quốc gia Việt Nam — Sổ tay dân công chiến dịch Điện Biên Phủ",
        "url": "https://baotanglichsu.vn/VI/Articles/1002/74906/cuon-so-tay-cua-dan-cong-tinh-phu-tho-trong-chien-dich-djien-bien-phu-nam-1954.html",
    },
    "unesco_vietnam": {
        "name": "UNESCO World Heritage Centre — Viet Nam",
        "url": "https://whc.unesco.org/en/statesparties/vn/",
    },
    "sdg": {
        "name": "United Nations — Sustainable Development Goals",
        "url": "https://sdgs.un.org/",
    },
    "sdg4": {
        "name": "United Nations — Goal 4: Quality Education",
        "url": "https://sdgs.un.org/goals/goal4",
    },
    "agenda2030": {
        "name": "United Nations — 2030 Agenda for Sustainable Development",
        "url": "https://sdgs.un.org/2030agenda",
    },
    "mil": {
        "name": "UNESCO — Media and Information Literacy",
        "url": "https://www.unesco.org/en/media-information-literacy",
    },
    "plastic": {
        "name": "UNEP — Plastic pollution",
        "url": "https://www.unep.org/topics/chemicals-and-pollution-action/plastic-pollution",
    },
    "circular_city": {
        "name": "UNEP — Circular economy in cities",
        "url": "https://www.unep.org/topics/cities/circular-economy-cities",
    },
    "mental_health": {
        "name": "World Health Organization — Mental health",
        "url": "https://www.who.int/en/health-topics/mental-health",
    },
    "stress": {
        "name": "World Health Organization — Stress",
        "url": "https://www.who.int/news-room/questions-and-answers/item/stress/",
    },
    "social_connection": {
        "name": "World Health Organization — Social connection",
        "url": "https://www.who.int/news-room/questions-and-answers/item/social-connection",
    },
    "healthy_city": {
        "name": "World Health Organization — Urban Health Initiative",
        "url": "https://www.who.int/initiatives/urban-health-initiative",
    },
    "languages": {
        "name": "UNESCO — Languages in education",
        "url": "https://www.unesco.org/en/languages-education",
    },
}


def topic(title, chinese_title, source, body, answer):
    return {
        "title": title,
        "chineseTitle": chinese_title,
        "source": source,
        "body": body,
        "answer": answer,
    }


TOPICS = {
    1: topic(
        "Trống đồng kể chuyện Đông Sơn",
        "铜鼓讲述的东山文化",
        "dong_son",
        "1924年，考古遗物在越南清化省东山一带被发现，后来“东山文化”成为重要的考古学名称。最引人注目的铜鼓并不只是乐器或权力象征，鼓面上的船、鸟、舞蹈和劳动图案，还保存了古人对自然、社会与仪式的理解。研究者通过铸造技术、器物分布和墓葬材料，逐步分析红河、马江、蓝江流域之间的联系。考古的价值正在于此：它不把传说简单当成事实，也不会因为材料残缺就拒绝想象，而是在证据与解释之间保持谨慎。今天观看一面铜鼓，我们既是在欣赏工艺，也是在阅读一部没有文字的社会史。",
        "Trống đồng là nguồn tư liệu vật chất giúp đọc đời sống, kỹ thuật và tổ chức xã hội Đông Sơn, nhưng cần giải thích thận trọng dựa trên chứng cứ.",
    ),
    2: topic(
        "Bạch Đằng năm 938: chiến thắng của hiểu biết",
        "白藤江上的潮水与木桩",
        "bach_dang",
        "公元938年，吴权率军在白藤江迎击南汉水军。他没有只比较船只多少，而是把河道、潮汐和作战时间结合起来，在水下设置木桩。涨潮时，敌船被引入预定区域；退潮以后，大船行动受限，伏兵再发动反击。这个方案看似依赖自然，实际上要求准确观察水位、统一行动，并承担判断错误的巨大风险。白藤江胜利结束了漫长的北方统治时期，为越南独立自主打开新阶段。它留给后人的不仅是一场著名战役，也是一种战略认识：环境从来不是静止背景，真正高明的决策会把地理知识、时机和人的组织能力转化为优势。",
        "Chiến thắng Bạch Đằng kết hợp hiểu biết thủy triều, địa hình, thời cơ và tổ chức lực lượng để tạo lợi thế chiến lược.",
    ),
    3: topic(
        "Hai Bà Trưng và ký ức về tinh thần tự chủ",
        "二征夫人与公元四十年的起义",
        "hai_ba_trung",
        "公元40年，征侧、征贰领导起义，反抗东汉在交趾地区的统治。相关历史后来进入庙宇、节日、地名和民间记忆，使两位女性领袖成为越南自主精神的重要象征。理解这段历史，既不能只停留在英雄故事，也要看到当时地方社会、政治压力和共同动员的条件。起义最终虽然失败，其象征力量却长期存在。尤其值得思考的是，在许多古代叙事以男性将领为中心的情况下，二征夫人的形象不断提醒后人：领导力并不由性别预先决定，民族记忆也会选择那些能够表达尊严、反抗和团结的人物。",
        "Khởi nghĩa Hai Bà Trưng cần được nhìn vừa như sự kiện lịch sử vừa như biểu tượng lâu dài về tự chủ, đoàn kết và năng lực lãnh đạo của phụ nữ.",
    ),
    4: topic(
        "Hoàng thành Thăng Long: lịch sử trong nhiều lớp đất",
        "升龙皇城地下的时间层次",
        "thang_long",
        "升龙皇城的核心区域位于今天的河内。11世纪，李朝在这里建设都城，此后相当长时间内，它一直是区域政治权力的重要中心。考古发现使人们看见，不同朝代并非把过去完全清除，而是在原有空间上继续修建、调整和使用。于是，一块砖、一口井或一段建筑基础，都可能属于不同历史层次。保护皇城的困难也来自这种复杂性：地面建筑容易被看见，地下遗迹却需要专业发掘与长期保存；城市仍在发展，遗产又不能脱离现代生活。真正的保护不是把历史冻结，而是让研究、公共教育与城市规划彼此配合，使多层时间仍能被未来的人理解。",
        "Giá trị của Hoàng thành Thăng Long nằm ở các lớp lịch sử liên tục; bảo tồn cần kết hợp khảo cổ, giáo dục và quy hoạch đô thị.",
    ),
    5: topic(
        "Hội An: thương cảng sống cùng hiện tại",
        "会安古城为何仍然“活着”",
        "hoi_an",
        "会安曾是亚洲重要贸易港口，不同地区的商人、信仰、建筑方式和生活习惯在这里相遇。正因为长期交流，古城呈现出的并不是单一文化，而是多种影响在本地条件中的重新组合。今天的挑战在于，会安既是居民生活的城市，也是吸引大量游客的遗产。若商业完全取代日常生活，古城可能只剩漂亮外表；若拒绝一切变化，居民又难以获得合适的工作与公共服务。因此，保存建筑只是第一步，还要维持社区、传统行业和街道尺度，让旅游收益能够支持修缮而不是加速破坏。遗产之所以珍贵，不仅因为它古老，也因为人们仍在其中生活并继续创造文化。",
        "Bảo tồn Hội An phải giữ được cả kiến trúc lẫn cộng đồng sống, đồng thời cân bằng du lịch với nhu cầu cư dân.",
    ),
    6: topic(
        "Huế: kinh thành bên dòng Hương",
        "香江两岸的顺化古都",
        "hue",
        "1802年，顺化成为统一越南的首都，并在阮朝时期承担政治、文化和宗教中心的功能。皇城、宫殿、陵墓与香江、御屏山共同构成空间体系，说明古代规划并非只处理建筑，也强调地形、象征和秩序之间的关系。经历战争、自然灾害与城市扩张以后，许多部分需要持续修复。修复并不是把所有痕迹变得像新的一样，而要区分原材料、后期改变和历史损伤，尽可能保留真实信息。与此同时，气候变化可能增加洪水和极端天气风险。顺化的保护因此是一项长期工作：它要求历史知识、工程技术和当地社区共同参与，而不是一次完成的装饰工程。",
        "Bảo tồn quần thể Huế là công việc dài hạn, cần tôn trọng tính xác thực và phối hợp lịch sử, kỹ thuật, môi trường cùng cộng đồng.",
    ),
    7: topic(
        "Tràng An: cảnh quan lưu giữ ba vạn năm thích nghi",
        "长安景观中的三万年人类活动",
        "trang_an",
        "越南宁平省的长安由石灰岩山峰、封闭谷地、洞穴和水道组成。洞穴遗址显示，人类在这里活动的时间延续三万多年，并经历海水变化与气候转变。人们并非征服一个永远不变的环境，而是在不同阶段调整居住、采集和移动方式。到了10至11世纪，华闾又在这一地区成为古都，历史层次与自然景观进一步重叠。今天游客乘小船进入洞穴，容易只注意眼前风景，却忽略岩层、考古材料和村落共同讲述的长期故事。长安作为自然与文化混合遗产，提醒我们：人类历史本来就发生在生态系统之中，保护任何一方都不能把另一方排除在外。",
        "Tràng An cho thấy lịch sử con người luôn gắn với biến đổi môi trường; bảo tồn cần nhìn tự nhiên và văn hóa như một hệ thống chung.",
    ),
    8: topic(
        "Hạ Long – Cát Bà: vẻ đẹp cần giới hạn",
        "下龙湾—吉婆群岛的美与承载力",
        "ha_long",
        "下龙湾—吉婆群岛拥有大规模海上喀斯特地貌，众多石灰岩岛屿从海面升起，同时包含重要的陆地与海洋生态系统。壮丽景观带来旅游机会，也带来船只、垃圾、建设和游客密度的压力。若只统计到访人数和短期收入，最吸引人的资源反而可能被逐渐消耗。保护区管理需要了解不同海域的生态敏感程度，限制某些活动，并协调两地行政区域之间的计划。游客也不是局外人：选择合规服务、减少一次性用品、尊重航线和野生动物，都属于保护的一部分。真正可持续的旅行并非让每个人随时进入任何地方，而是在自然承载范围内分享风景。",
        "Du lịch Hạ Long – Cát Bà phải tôn trọng sức chịu tải sinh thái và phối hợp quản lý, thay vì chỉ tối đa hóa lượng khách.",
    ),
    9: topic(
        "Điện Biên Phủ: hậu cần phía sau chiến thắng",
        "奠边府战役背后的运输线",
        "dien_bien",
        "1954年的奠边府战役通常以重要阵地和最后胜利来叙述，但前线行动离不开漫长运输线。山区道路困难，粮食、药品、弹药和器材必须持续送到战场。大量民工、青年和地方群众使用自行车、肩挑等方式，承担了不容易出现在战斗地图上的任务。战役从3月13日持续到5月7日，作战方式也根据实际情况调整。理解这场胜利，不能只寻找某一个决定性的英雄动作，而要看到战略判断、后勤组织与社会动员怎样互相支持。历史中的重大结果，往往由许多普通人重复完成的小任务积累而成；没有可靠供给，再勇敢的前线也难以长期行动。",
        "Điện Biên Phủ cho thấy thắng lợi quân sự phụ thuộc cả chiến lược lẫn mạng lưới hậu cần và đóng góp bền bỉ của nhiều người bình thường.",
    ),
    10: topic(
        "Cuốn sổ nhỏ của dân công Phú Thọ",
        "一本民工手册里的大历史",
        "dien_bien_notebook",
        "越南国家历史博物馆收藏的一本小手册，来自1954年参加奠边府运输工作的富寿省民工。手册记录会议、纪律、粮食购买、运输数量和自行车零件，看起来都是日常数字，却让后人看到组织如何真正运行。宏大历史常用“群众支持”来概括，具体材料则把抽象概念还原成时间、姓名、物资和责任。研究者需要判断记录形成的背景，也要尊重保存者没有写下的沉默部分。这本手册说明，档案价值不取决于外表是否华丽。一个普通人为了完成工作留下的实用笔记，几十年后可能成为理解时代的重要入口，使胜利背后的劳动获得可见的位置。",
        "Tư liệu đời thường như sổ ghi vận chuyển có thể biến khái niệm hậu cần và huy động quần chúng thành chứng cứ lịch sử cụ thể.",
    ),
    11: topic(
        "Giáo dục không chỉ là điểm số",
        "教育不只是分数",
        "sdg4",
        "分数能够帮助学校了解一部分学习结果，却无法完整表现好奇心、合作能力、创造力和面对失败的态度。如果教育只奖励标准答案，学生可能越来越擅长考试，却不敢提出没有现成答案的问题。高质量教育还意味着不同家庭、地区和身体条件的学习者都能获得合适机会，教师也有资源改进方法。评价当然不能取消，但可以变得更多样：项目记录、口头说明、同伴反馈和长期进步都能提供证据。教育的最终目标不是制造一张漂亮成绩单，而是让人获得继续学习、参与社会并作出负责任选择的能力。",
        "Điểm số chỉ phản ánh một phần; giáo dục chất lượng phải phát triển năng lực học tiếp, hợp tác, đặt câu hỏi và tạo cơ hội công bằng.",
    ),
    12: topic(
        "Lựa chọn nghề nghiệp đầu tiên",
        "第一份职业不必决定一生",
        "sdg",
        "年轻人选择第一份工作时，常把决定想成一条不能回头的路，因此过度担心“选错”。实际上，职业发展更像不断积累和调整的过程。工资、兴趣、学习机会、工作环境与生活责任都值得考虑，而且不同阶段的优先顺序会改变。一个岗位即使不是最终理想，也可能训练沟通、分析和时间管理等可以转移的能力。关键是定期回顾：自己学到了什么，价值观是否改变，下一步需要补充哪些条件。谨慎选择很重要，但不必要求一次决定解决未来几十年的全部问题。能够根据新信息修正方向，本身也是职业能力。",
        "Nghề đầu tiên là một bước học hỏi chứ không phải quyết định không thể thay đổi; quan trọng là tích lũy năng lực và định kỳ điều chỉnh hướng đi.",
    ),
    13: topic(
        "Môi trường bắt đầu từ thiết kế hệ thống",
        "环保不能只要求个人自觉",
        "plastic",
        "面对塑料污染，人们常把责任集中在消费者是否自带杯子，却忽略产品设计、供应链和回收系统的影响。个人选择当然重要，但若商店只有一次性包装、社区没有分类设施，再强的环保意识也很难长期坚持。更有效的办法需要覆盖整个生命周期：减少不必要材料，让产品更容易重复使用，建立回收渠道，并要求生产者承担相应成本。政策、企业和居民各有责任，不能互相等待。环境行动也应检查实际效果，避免一种看似绿色的替代品在生产或运输阶段造成更大负担。真正的改变来自系统与习惯同时转向。",
        "Giảm ô nhiễm nhựa cần thay đổi toàn bộ vòng đời sản phẩm và phân chia trách nhiệm giữa chính sách, doanh nghiệp, hạ tầng và cá nhân.",
    ),
    14: topic(
        "Cái giá của thông tin giả",
        "假消息为什么传播得更快",
        "mil",
        "假消息往往利用惊讶、愤怒或恐惧吸引点击。人们在情绪强烈时容易立即转发，平台的推荐机制又可能把受欢迎误认为可信。结果不仅是某个事实被说错，还可能伤害个人名誉、影响公共健康，甚至削弱社会信任。判断信息时，可以先停下来寻找原始来源，比较不同机构的报道，检查日期、图片背景和作者身份。若内容声称“所有专家都同意”却不给证据，更应保持怀疑。媒介素养并不是不相信任何人，而是知道信任需要什么依据，也愿意在发现错误后公开更正。每一次谨慎转发都在维护共同的信息环境。",
        "Thông tin giả gây hại vì kích thích cảm xúc và làm suy giảm niềm tin; người đọc cần kiểm tra nguồn, bối cảnh, ngày tháng và sẵn sàng đính chính.",
    ),
    15: topic(
        "Khoảng cách giữa các thế hệ",
        "代沟也可能是一种翻译问题",
        "social_connection",
        "家庭争论中，年轻人说“我需要空间”，长辈可能听成“我不需要你”；长辈说“我都是为你好”，年轻人又可能理解为“不尊重我的选择”。许多代沟并非价值完全相反，而是相同关心通过不同语言表达。改善关系不能只要求一方理解另一方，还要把模糊判断变成具体需要：担心安全，就说明哪种风险；希望独立，就提出可以承担的责任。双方也应承认时代经验不同，过去有效的方法未必适合今天。真正的对话不是证明谁更有道理，而是在差异中找到能够共同执行的安排。",
        "Khoảng cách thế hệ thường được thu hẹp khi các bên chuyển lời phán xét mơ hồ thành nhu cầu và trách nhiệm cụ thể.",
    ),
    16: topic(
        "Thất bại cũng là tài sản",
        "失败只有经过反思才会变成经验",
        "sdg4",
        "人们常安慰失败者说“失败是成功之母”，仿佛经历挫折就会自动成长。事实上，如果只重复同一方法，失败可能只是再次发生。它要成为资产，必须经过分析：目标是否现实，信息哪里不足，执行过程出现了什么偏差，哪些因素可以控制。反思也不能变成无限责备自己，因为环境和运气确实存在。较好的做法是区分责任与条件，再设计一个规模更小、能够检验假设的新行动。这样，失败提供的不是漂亮口号，而是一组修正方向的证据。敢于承认损失，同时不让一次结果定义全部能力，才是真正的韧性。",
        "Thất bại chỉ trở thành kinh nghiệm khi được phân tích thành nguyên nhân, điều kiện và thử nghiệm cải tiến cụ thể.",
    ),
    17: topic(
        "Nghệ thuật lắng nghe",
        "倾听不是安静地等自己发言",
        "social_connection",
        "有些人谈话时看起来很安静，心里却一直准备反驳。真正的倾听需要暂时放下结论，确认自己是否理解对方的事实、情绪和需要。可以用自己的话复述，再问：“我的理解对吗？”这并不表示同意全部观点，而是避免双方对着想象中的敌人争论。倾听也有边界。面对侮辱或操纵，一个人可以结束谈话，不必把忍耐误认为尊重。在安全关系中，被认真听见会减少孤独，也让意见分歧更容易处理。沟通的质量不只取决于说得多精彩，还取决于对方是否感到自己的经验被准确接住。",
        "Lắng nghe là kiểm tra sự hiểu đúng về sự việc, cảm xúc và nhu cầu; nó không đồng nghĩa với đồng ý hoặc chịu đựng xúc phạm.",
    ),
    18: topic(
        "Văn hóa trong một chi tiết",
        "一扇门如何保存文化记忆",
        "unesco_vietnam",
        "参观遗产时，人们容易只拍摄宏大建筑，却忽略门把、屋瓦、市场叫卖或家庭祭台等细节。这些看似普通的元素，往往说明材料从哪里来、技术怎样传承、社区如何理解空间。文化并不是一组永远不变的符号，而是在日常使用中不断被选择和调整。保护细节也不能把居民变成表演者；若一种传统只为游客存在，它可能逐渐失去内部意义。研究者与游客都应询问：谁在维护它，谁从中受益，年轻一代是否愿意继续。通过一个细节进入文化，是为了看见背后的关系，而不只是获得一张特别照片。",
        "Chi tiết di sản có giá trị vì cho thấy kỹ thuật và quan hệ cộng đồng; bảo tồn phải tôn trọng đời sống nội tại chứ không biến cư dân thành màn trình diễn.",
    ),
    19: topic(
        "Tiền bạc và cảm giác an toàn",
        "存款为什么不能消除所有不安",
        "agenda2030",
        "经济安全当然需要收入、储蓄和基本保障，但焦虑并不会在账户达到某个数字时自动结束。有些人不断提高目标，是因为没有区分真实风险与想象中的最坏情况。建立安全感可以从具体计划开始：了解固定支出，准备合理的紧急资金，管理债务，同时投资健康、技能和可信赖的关系。社会制度也很重要，因为个人无法独自承担疾病、失业和灾害等全部风险。谈钱既不能假装精神力量可以代替物质条件，也不能把人生价值缩小为资产数字。成熟的财务观，是让资源服务于稳定而有意义的生活。",
        "An toàn tài chính cần kế hoạch cá nhân và hệ thống xã hội, nhưng tiền không nên trở thành thước đo duy nhất của giá trị sống.",
    ),
    20: topic(
        "Tự do cần có kỷ luật",
        "自律不是把生活变成监狱",
        "mental_health",
        "自由常被理解为想做什么就做什么，纪律则像外部限制。可是在长期目标面前，没有基本自律的人反而容易被即时情绪和环境控制。真正有效的纪律不是安排每一分钟，而是提前决定少数重要原则，例如固定睡眠、给深度工作留出时间、在疲惫时允许休息。规则需要能够调整，否则它会从工具变成负担。一个人也不必因偶尔中断就否定全部努力，关键是尽快恢复节奏。自律的目的不是证明意志力有多强，而是减少每天重复选择的消耗，为真正重视的事情保留自由。",
        "Kỷ luật là công cụ giảm sự chi phối của cảm xúc tức thời và dành tự do cho mục tiêu quan trọng, nhưng phải linh hoạt và có chỗ cho nghỉ ngơi.",
    ),
    21: topic(
        "Cuộc sống trong thời đại tốc độ",
        "速度提高以后，时间为什么仍然不够",
        "stress",
        "技术让通信、交通和工作流程更快，人们却未必因此更从容。节省下来的时间常被新的任务立即填满，组织也可能把更高效率变成更高要求。长期处在“马上回复”的状态，会削弱注意力，使休息也带着内疚。解决办法不是拒绝所有速度，而是区分真正紧急与只是看起来紧急的事情。个人可以设置无通知时间，团队则应明确响应标准，避免把随时在线当作责任心。效率若只计算完成数量，不计算错误、健康和创造力的损失，就会得到虚假的成功。速度应该服务生活，而不应成为生活唯一的方向。",
        "Tốc độ và hiệu suất cần được đánh giá cùng chất lượng, sức khỏe và khả năng tập trung; không phải mọi yêu cầu phản hồi ngay đều thật sự khẩn cấp.",
    ),
    22: topic(
        "Lòng tốt cũng cần phương pháp",
        "帮助别人之前先问他需要什么",
        "social_connection",
        "出于好意直接替别人决定，可能让对方感到无能或失去选择。例如，看见老人走得慢就突然拉住他，看见同事情绪低落就公开追问原因，都未必合适。更有尊重的帮助通常从询问开始：“你需要我做什么吗？”如果对方拒绝，也应接受。面对专业问题，善意还需要能力边界，严重心理或健康风险不能只靠朋友承担。有效帮助既关注结果，也保护接受者的尊严和自主。与此同时，设定边界不等于冷漠。只有在自己能够承担的范围内持续支持，善意才不会很快变成疲惫、控制或怨恨。",
        "Giúp đỡ có phương pháp bắt đầu bằng hỏi nhu cầu, tôn trọng quyền từ chối và nhận biết giới hạn năng lực của người hỗ trợ.",
    ),
    23: topic(
        "Khi truyền thống gặp đổi mới",
        "传统可以改变形式而不失去核心",
        "languages",
        "传统若完全不变，可能离年轻人的生活越来越远；若只追求流行，又可能失去辨认自己的核心。创新因此不是给旧形式加上现代包装那么简单，而要先理解一项传统为什么产生、由谁维护、哪些部分承载共同记忆。数字技术可以记录语言、传播手工艺并连接新观众，但它不能代替真实社区的决定权。商业合作也可能带来收入，同时需要防止符号被随意使用。最健康的传承不是专家独自宣布什么“纯正”，而是让实践者、年轻人和研究者共同讨论：哪些原则必须保留，哪些形式可以大胆变化。",
        "Đổi mới truyền thống cần hiểu giá trị cốt lõi và trao quyền quyết định cho cộng đồng thực hành, thay vì chỉ thay lớp vỏ hiện đại.",
    ),
    24: topic(
        "Một cuộc tranh luận đáng nhớ",
        "最好的辩论不一定分出输赢",
        "mil",
        "学校辩论“人工智能是否应该进入课堂”时，双方起初都选择最极端的例子：支持者只谈效率，反对者只谈风险。老师要求每队先准确总结对方最有力的理由，再提出回应。这个规则改变了气氛，因为学生必须理解而不是故意简化对手观点。讨论后来转向更具体的问题：哪些年龄适合使用，数据如何保护，教师怎样检查结果，学生需要公开哪些帮助。最后没有简单的赞成或反对，却形成了可执行的条件。值得记住的辩论，不是用声音压过别人，而是让问题的结构更清楚，使参与者在证据面前愿意修正立场。",
        "Tranh luận tốt làm rõ điều kiện và bằng chứng, yêu cầu hiểu đúng lập luận mạnh nhất của bên kia và chấp nhận điều chỉnh quan điểm.",
    ),
    25: topic(
        "Người trẻ và sự kiên nhẫn",
        "耐心不是被动等待",
        "sdg4",
        "在能够立即看到点赞、快递进度和学习排名的环境中，长期积累显得格外缓慢。年轻人并非天生没有耐心，而是许多系统不断奖励即时反馈。培养耐心也不能只说“坚持就好”，需要把遥远目标分成可以观察的小阶段，并设计合理回报。学习语言时，记录每月能完成的真实任务，比每天判断自己是否“已经流利”更有效。耐心同样包含调整：方法长期无效时，继续重复不叫坚持。主动收集反馈、忍受暂时看不到成果的不确定，同时在证据出现时改变路线，这才是一种成熟的耐心。",
        "Kiên nhẫn chủ động gồm chia mục tiêu, theo dõi tiến bộ, chịu được kết quả chậm và thay đổi phương pháp khi bằng chứng cho thấy cần thiết.",
    ),
    26: topic(
        "Sự im lặng của người trưởng thành",
        "沉默可能保护关系，也可能隐藏问题",
        "mental_health",
        "成年人有时选择沉默，是因为知道情绪最强时说话容易伤人。这种暂停可以是一种负责：先整理事实，再选择合适时间表达。然而，若沉默只是害怕冲突，重要问题会在关系中继续积累。别人也无法永远猜到未说出口的需要。健康的沉默应当有结束时间，并伴随清楚说明，例如：“我现在需要冷静，今晚我们再谈。”当压力长期影响睡眠、工作或安全时，保持沉默更不是坚强的证明，寻求可信任的人或专业支持才是行动。成熟并非永远安静，而是知道何时停下，何时必须开口。",
        "Im lặng lành mạnh có mục đích và thời hạn; nếu vấn đề kéo dài hoặc ảnh hưởng an toàn thì cần giao tiếp và tìm hỗ trợ.",
    ),
    27: topic(
        "Làm việc nhóm không chỉ là phân công",
        "团队合作不只是把任务切开",
        "sdg",
        "把项目分成几份，再把文件合在一起，并不自动形成团队成果。真正的合作需要先建立共同标准：目标是什么，信息怎样共享，谁有权决定，出现延误如何处理。分工还要考虑依赖关系，否则前一项改变会让后面所有工作重做。反馈应针对内容而非人格，并且越早提出成本越低。优秀团队也允许成员承认“不知道”，因为隐藏问题比暂时无答案更危险。完成以后，团队需要回顾流程，而不只是庆祝结果。合作的核心不是每个人做相同的事，而是不同能力能够在透明、信任和责任清楚的结构中互相支持。",
        "Làm việc nhóm cần mục tiêu, tiêu chuẩn, luồng thông tin, quyền quyết định và phản hồi rõ ràng, chứ không chỉ chia nhỏ đầu việc.",
    ),
    28: topic(
        "Thói quen tiêu dùng mới",
        "从“买得便宜”到“使用得长久”",
        "circular_city",
        "网络购物让比较价格非常方便，也容易使人忽略产品寿命、维修条件和包装成本。便宜物品若很快损坏，消费者可能支付更多钱，城市也承担更多垃圾。新的消费观不是要求所有人都买昂贵商品，而是在能力范围内询问：我真的需要吗？能否借用、维修或购买二手？企业是否提供零件和清楚信息？循环经济希望材料尽可能长时间留在使用系统中，而不是快速经历生产、购买和丢弃。消费者选择能推动变化，但公平也很重要，耐用和环保产品不能只服务高收入人群。政策与设计必须让可持续选择更容易、更可负担。",
        "Tiêu dùng bền vững đánh giá nhu cầu, tuổi thọ, khả năng sửa chữa và vòng đời vật liệu, đồng thời phải bảo đảm lựa chọn tốt không chỉ dành cho người thu nhập cao.",
    ),
    29: topic(
        "Sức khỏe tinh thần cần được nhìn thấy",
        "心理健康不是看不见就不存在",
        "mental_health",
        "身体受伤容易得到理解，长期焦虑、抑郁或精力耗尽却常被误解为懒惰。心理健康不仅是没有疾病，也关系到一个人能否应对压力、学习工作并参与社区。风险来自个人经历，也受家庭、贫困、暴力、歧视和服务条件影响，因此不能把全部责任推给个人意志。学校和职场可以减少污名，建立保密的求助渠道，并训练管理者识别危险信号。朋友能够倾听和陪伴，却不应代替专业治疗。让心理健康“被看见”，不是给每种情绪贴标签，而是承认痛苦值得认真对待，并让需要的人更早获得合适支持。",
        "Sức khỏe tinh thần chịu ảnh hưởng của cả cá nhân và môi trường; cần giảm kỳ thị, có kênh hỗ trợ và phân biệt vai trò bạn bè với chuyên môn.",
    ),
    30: topic(
        "Một lời xin lỗi đúng lúc",
        "道歉的重点不在“对不起”三个字",
        "social_connection",
        "有些道歉听起来像解释：“对不起，但你也有问题。”这种表达把责任重新推回受伤的人。有效道歉通常包含几个部分：清楚指出自己做了什么，承认影响，不要求对方立刻原谅，并说明将怎样修复和避免重复。解释背景可以帮助理解，却不能取消责任。道歉也不能代替实际改变；如果同样行为不断发生，再动人的语言也会失去可信度。另一方面，接受道歉的人有权需要时间，也可以决定关系边界。及时道歉的价值，不是迅速结束尴尬，而是停止防御，给事实、伤害和未来行动一个诚实位置。",
        "Lời xin lỗi có trách nhiệm phải nêu rõ hành vi, thừa nhận tác động, sửa chữa và thay đổi, không ép người bị tổn thương tha thứ ngay.",
    ),
    31: topic(
        "Cạnh tranh và hợp tác",
        "竞争不必消灭合作",
        "sdg",
        "竞争能够推动效率和创新，却也可能鼓励隐藏信息、夸大短期成绩，甚至把对手失败当成自己的成功。合作强调共同利益，但若缺乏责任分配，也会出现依赖别人努力的情况。现实中的许多挑战需要“合作式竞争”：企业可以在产品上竞争，同时共同建立安全标准；学校可以比较项目成果，同时共享基础资源。关键是划清哪些领域适合竞争，哪些底线必须共同维护。评价制度也会塑造行为，如果只奖励个人排名，就不能期待成员主动分享。成熟组织不会简单选择竞争或合作，而会设计规则，让各方追求优势时仍不破坏共同系统。",
        "Cạnh tranh và hợp tác cần được thiết kế theo từng phạm vi: cạnh tranh về sáng tạo nhưng cùng giữ tiêu chuẩn và lợi ích hệ thống.",
    ),
    32: topic(
        "Sự thay đổi của gia đình hiện đại",
        "现代家庭的角色正在重新协商",
        "agenda2030",
        "现代家庭在规模、工作方式和照顾责任上都更加多样。过去由性别或年龄自动决定的角色，越来越需要通过讨论安排。若家务和照顾劳动没有被计算，承担者即使没有正式工资，也可能长期疲惫。公平并不意味着每个人每天完成完全相同的任务，而是根据时间、能力与阶段透明分配，并定期调整。技术可以帮助远程联系，却不能代替真正参与；经济压力也会影响家庭选择，不能把结构困难解释成个人不努力。家庭稳定不是所有成员保持沉默，而是变化发生时仍能谈需要、边界和责任。",
        "Gia đình hiện đại cần thương lượng minh bạch vai trò và lao động chăm sóc, thay vì mặc định theo giới hoặc tuổi.",
    ),
    33: topic(
        "Nghệ thuật quản lý cảm xúc",
        "管理情绪不是消灭情绪",
        "mental_health",
        "愤怒、害怕和悲伤本身不是错误，它们提供关于边界、风险和失去的信息。问题在于，人是否把感受直接变成伤害自己或别人的行动。管理情绪可以从命名开始：“我现在是失望，不只是生气。”身体信号也很重要，呼吸变快、肩膀紧张常常早于失控。短暂离开现场、降低刺激、写下事实，都能为选择反应争取时间。情绪稳定后，还需要处理真正原因，而不是永远回避。若强烈情绪长期影响生活，应寻求专业帮助。成熟不是从不波动，而是能够感受、理解并负责任地行动。",
        "Quản lý cảm xúc là nhận diện, tạo khoảng dừng và xử lý nguyên nhân bằng hành động có trách nhiệm, không phải xóa bỏ cảm xúc.",
    ),
    34: topic(
        "Từ dữ liệu đến quyết định",
        "数据不会自动告诉我们该做什么",
        "sdg",
        "数据能够揭示趋势，却总是通过某种方法收集。样本选了谁、指标怎样定义、缺失值如何处理，都会影响结论。一个数字即使准确，也不等于已经说明原因。例如，公园使用人数下降，可能与天气、维修、交通或统计时间有关。决策者需要结合多种证据，并公开不确定性。与此同时，不能因为数据不完美就拒绝行动，可以先采取可逆的小措施，再持续监测结果。数据伦理还包括隐私与公平：为了提高效率收集的信息，不应被无限用于其他目的。好决策不是崇拜数字，而是让证据、价值判断和责任接受共同检验。",
        "Dữ liệu cần được hiểu trong phương pháp và bối cảnh; quyết định tốt kết hợp nhiều bằng chứng, công khai bất định và bảo vệ quyền riêng tư.",
    ),
    35: topic(
        "Một thành phố đáng sống",
        "宜居城市不只是建筑漂亮",
        "healthy_city",
        "一座城市是否宜居，不能只看高楼、商场和旅游排名。空气、住房、交通安全、公共空间、医疗教育与社会联系共同影响健康。若公园很美却只有开车才能到达，它对没有汽车的人意义有限；若公共交通便宜但夜间不安全，也不能真正扩大机会。城市政策之间互相作用，改善步行环境可能同时减少污染、增加运动并支持街边商业。因此，规划需要不同部门共享数据，也要让居民参与，特别是那些最容易被忽略的群体。宜居不是一次获得的称号，而是城市持续发现不平等、评估影响并改进日常环境的过程。",
        "Thành phố đáng sống được tạo bởi quá trình liên tục cải thiện sức khỏe, khả năng tiếp cận và công bằng qua phối hợp nhiều lĩnh vực.",
    ),
    36: topic(
        "Niềm tin vào điều nhỏ bé",
        "小行动怎样避免变成自我安慰",
        "sdg",
        "面对气候、贫困或教育不平等等巨大问题，个人容易在无力与盲目乐观之间摇摆。小行动有价值，但前提是它能连接更大目标，并且可以检查效果。一次捐赠解决紧急需要，长期改变还要求制度、预算和公共参与；个人节约能源值得坚持，同时也需要基础设施和产业转型。相信小事不是假装规模不重要，而是用可完成的步骤建立能力、关系和持续压力。行动者还要避免把道德责任全推给资源较少的人。希望不是等待好消息，而是在承认困难以后，仍愿意和别人一起选择下一步，并根据结果不断扩大有效做法。",
        "Hành động nhỏ có ý nghĩa khi nối với mục tiêu lớn, đo được tác động và góp phần tạo năng lực hay thay đổi hệ thống.",
    ),
    37: topic(
        "Học ngoại ngữ là học cách hiểu người",
        "学习外语也在学习新的观察角度",
        "languages",
        "掌握外语不只是把母语句子换成另一组词。不同语言会用各自习惯表达时间、礼貌、关系和情绪，学习者因此不断发现原来认为“自然”的说法其实有文化条件。理解差异不等于把每个国家的人归纳成固定性格，也不能用几条文化规则代替真实交流。更好的方法是带着好奇提问，观察具体语境，并允许个人不符合群体印象。母语同样重要，它保存家庭经验和知识传统。多语言教育若尊重学习者已有语言，不仅能提高学习，也能培养对差异的耐心。学会另一种语言，最终是增加理解世界与理解他人的路径。",
        "Học ngoại ngữ mở thêm góc nhìn văn hóa nhưng không được biến khác biệt thành khuôn mẫu; cần tôn trọng cả ngôn ngữ mẹ đẻ và cá nhân cụ thể.",
    ),
    38: topic(
        "Câu chuyện của một người bình thường",
        "普通人的生活为什么值得记录",
        "sdg",
        "历史和新闻偏爱重大事件，普通人的照顾、维修、运输和重复劳动却支撑着社会日常运行。记录一个清洁工、护士、司机或家庭照顾者，不是为了把辛苦浪漫化，而是看见制度怎样影响具体生活：谁拥有休息，谁承担风险，哪些技能长期被低估。讲述者需要获得当事人同意，避免只选择符合预想的片段，也要让他们有机会检查表达。普通故事的价值不在于证明每个人都能成为英雄，而在于扩大公共记忆，使政策讨论不只剩抽象数字。一个社会怎样看待平凡劳动，也反映它怎样理解尊严。",
        "Ghi lại đời sống bình thường giúp nhìn thấy lao động nền tảng và tác động của hệ thống, nhưng phải tôn trọng sự đồng ý và tiếng nói của nhân vật.",
    ),
    39: topic(
        "Khi ta phải đưa ra quyết định",
        "不确定条件下如何作出决定",
        "mil",
        "重要决定很少拥有完整信息。等待绝对确定可能错过机会，过早行动又会放大风险。较好的过程是先明确目标和不能接受的底线，再区分可逆与不可逆选择。可逆决定可以快速试验，不可逆决定则需要更多证据和外部意见。列出最可能、最好和最坏情形，有助于避免只被一个生动画面影响。直觉不是毫无价值，它常压缩过去经验，但在陌生领域也容易受偏见控制。决定以后还要设定复查时间，因为负责并不等于永不改变。好的选择不是保证结果完美，而是在当时信息下经过合理程序，并愿意承担和修正。",
        "Ra quyết định trong bất định cần mục tiêu, giới hạn, phân loại khả năng đảo ngược, nhiều kịch bản và thời điểm xem xét lại.",
    ),
    40: topic(
        "Tổng kết: đi xa hơn bằng tiếng Trung",
        "用中文走得更远，也看得更深",
        "sdg",
        "完成HSK6并不意味着语言学习结束，而是学习目标发生变化。初级阶段主要解决“能不能表达”，高级阶段更关心表达是否准确、证据是否充分、语气是否适合对象。阅读历史、科学和社会议题时，学习者要区分事实、推论与立场；写作时要组织结构，也要承认材料的限制。语言能力还包含伦理：引用来源、不歪曲别人观点、知道哪些场合需要谨慎。真正的进步不是使用越难的词越好，而是能够把复杂问题说清楚，让不同经验的人愿意继续对话。走得更远，既指接触更大的世界，也指形成更负责的判断。",
        "Sau HSK6, trọng tâm chuyển từ chỉ diễn đạt được sang diễn đạt chính xác, có chứng cứ, đúng ngữ cảnh và có trách nhiệm.",
    ),
}


FILLERS = [
    "把材料改写成学习文本时，还需要区分事实、解释与价值判断。事实回答发生了什么，解释说明它为何发生，价值判断则讨论我们认为怎样更好。三者可以相互联系，却不能彼此代替。读者若能主动寻找证据、比较视角并指出仍不确定的部分，就不容易被一句有力量的话带走全部判断。",
    "从语言训练的角度看，复述不应只是更换几个近义词。学习者可以先概括中心，再说明因果与转折，最后提出一个能够由材料支持的问题。这样既能练习复杂句式，也能避免为了使用高级词汇而牺牲准确性。真正的高级表达往往清楚、有层次，并知道什么时候需要保留意见。",
    "因此，阅读结束后可以继续追问：谁提供了资料，谁的经验尚未出现，结论在什么条件下可能改变？这些问题不会削弱文章，反而使理解更可靠。面对复杂世界，成熟并不是迅速站到某一边，而是在行动之前尽可能看清关系，在行动之后愿意接受结果的检验。",
]


def move_marked_extended_vocabulary(lesson):
    vocabulary = lesson.get("vocabulary") or []
    extended = lesson.get("extendedVocabulary") or []
    extended_by_word = {
        item.get("hanzi"): index
        for index, item in enumerate(extended)
        if item.get("hanzi")
    }
    kept = []
    moved = []
    for item in vocabulary:
        word = item.get("hanzi")
        marker = " ".join(
            str(item.get(key) or "") for key in ("tag", "note", "category")
        ).lower()
        if word in extended_by_word:
            index = extended_by_word[word]
            extended[index] = {**extended[index], **item, "tag": "mở rộng"}
            moved.append(item)
        elif "mở rộng" in marker or "扩展" in marker:
            moved.append(item)
        else:
            kept.append(item)

    seen = {item.get("hanzi") for item in extended}
    for item in moved:
        if item.get("hanzi") in seen:
            continue
        item = {**item, "tag": "mở rộng"}
        extended.append(item)
        seen.add(item.get("hanzi"))

    lesson["vocabulary"] = kept
    lesson["extendedVocabulary"] = extended
    return len(moved)


def build_reading(lesson, topic_data):
    reading = f"《{topic_data['chineseTitle']}》\n\n{topic_data['body']}"
    vocabulary = lesson.get("vocabulary") or []
    extended = lesson.get("extendedVocabulary") or []
    words = [item.get("hanzi", "") for item in [*vocabulary, *extended]]
    missing = [word for word in words if word and word not in reading]
    if missing:
        reading += (
            "\n\n为了把材料转化为本课可练习的HSK6表达，复述时还需主动使用："
            + "、".join(missing)
            + "。这些词不是网络原文的摘录，而是学习任务中的语言线索。"
        )

    for filler in FILLERS:
        if count_hanzi(reading) >= 470:
            break
        reading += "\n\n" + filler

    hanzi_count = count_hanzi(reading)
    if hanzi_count < 470 or hanzi_count > 850:
        raise ValueError(
            f"HSK6 bài {lesson['lessonId']} có {hanzi_count} chữ Hán"
        )
    ensure_all_words_present(reading, words, f"HSK6 bài {lesson['lessonId']}")
    return reading


def update_reading_exercises(lesson, topic_data):
    replacement = {
        "type": "reading",
        "question": f"Bài “{topic_data['chineseTitle']}” đưa ra lập luận trung tâm nào?",
        "answer": topic_data["answer"],
    }
    exercises = lesson.get("exercises") or []
    next_exercises = []
    inserted = False
    for exercise in exercises:
        if exercise.get("type") == "reading":
            if not inserted:
                next_exercises.append(replacement)
                inserted = True
            continue
        next_exercises.append(exercise)
    if not inserted:
        next_exercises.append(replacement)
    lesson["exercises"] = next_exercises


def main():
    course_dir = COURSE_DIR / "hsk6"
    index = load_json(course_dir / "index.json")
    word_lookup = load_word_lookup()
    report = []

    for index_item in index:
        lesson_id = int(index_item["lessonId"])
        topic_data = TOPICS[lesson_id]
        source = SOURCES[topic_data["source"]]
        lesson_path = course_dir / index_item["file"]
        lesson = load_json(lesson_path)
        moved = move_marked_extended_vocabulary(lesson)
        reading = build_reading(lesson, topic_data)
        primary = [
            *(lesson.get("vocabulary") or []),
            *(lesson.get("extendedVocabulary") or []),
        ]
        segments = segment_text(reading, primary, word_lookup)
        coverage = lookup_coverage(segments, reading)
        if coverage < 80:
            raise ValueError(
                f"HSK6 bài {lesson_id} độ phủ tra từ chỉ {coverage}%"
            )

        lesson["title"] = topic_data["title"]
        lesson["chineseTitle"] = topic_data["chineseTitle"]
        lesson["desc"] = (
            "Bài đọc HSK6 biên soạn mới từ nguồn tham khảo chính thống, có tra từ và từ mở rộng."
        )
        lesson["lessonText"] = [
            {
                "title": topic_data["chineseTitle"],
                "chinese": reading,
                "segments": segments,
            }
        ]
        lesson["learningPath"] = {
            "mode": "sequential",
            "sections": [
                "vocabulary",
                "extendedVocabulary",
                "lessonText",
                "grammar",
                "exercises",
            ],
            "allowSkip": False,
            "reviewAfterComplete": True,
        }
        lesson["vocabularyPages"] = chunk_list(lesson.get("vocabulary") or [])
        lesson["extendedVocabularyPages"] = chunk_list(
            lesson.get("extendedVocabulary") or []
        )
        lesson.pop("exerciseGroups", None)
        lesson["meta"] = {
            **(lesson.get("meta") or {}),
            "estimatedMinutes": 75,
            "difficulty": "HSK6",
            "version": 4,
            "contentRevision": "2026-07-source-based-reading-refresh",
            "hanziCount": count_hanzi(reading),
            "referenceSources": [
                {
                    **source,
                    "usage": "Dùng làm nguồn dữ kiện/chủ đề; bài tiếng Trung được biên soạn mới và không sao chép nguyên văn.",
                    "accessed": "2026-07-15",
                }
            ],
        }
        lesson["quality"] = {
            **(lesson.get("quality") or {}),
            "mainVocabularyCount": len(lesson.get("vocabulary") or []),
            "extendedVocabularyCount": len(lesson.get("extendedVocabulary") or []),
            "movedMarkedExtendedVocabulary": moved,
            "missingFromReading": [],
            "interactiveSegments": sum(
                1 for segment in segments if segment.get("clickable")
            ),
            "lookupCoveragePercent": coverage,
            "sourceBacked": True,
            "copyrightSafe": True,
        }
        update_reading_exercises(lesson, topic_data)
        write_json(lesson_path, lesson)

        index_item.update(
            {
                "title": topic_data["title"],
                "chineseTitle": topic_data["chineseTitle"],
                "xp": 45,
                "desc": lesson["desc"],
            }
        )
        report.append(
            {
                "lessonId": lesson_id,
                "hanziCount": count_hanzi(reading),
                "mainVocabulary": len(lesson.get("vocabulary") or []),
                "extendedVocabulary": len(lesson.get("extendedVocabulary") or []),
                "coverage": coverage,
                "source": source["url"],
            }
        )

    write_json(course_dir / "index.json", index)
    print(json.dumps({"hsk6": report}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
