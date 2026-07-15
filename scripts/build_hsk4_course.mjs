import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const COURSE_DIR = path.join(ROOT, 'assets', 'giaotrinhhsk', 'hsk4');
const HSK4_WORDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'data', 'hsk4.json'), 'utf8'));
const ALL_WORDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'data', 'all.json'), 'utf8'));

const WORD_LISTS = {
  1: ['法律', '俩', '印象', '深', '熟悉', '不仅', '性格', '开玩笑', '从来', '最好', '共同', '适合', '幸福', '生活', '刚', '浪漫', '够', '缺点', '接受', '羡慕', '爱情', '星星', '即使', '加班', '亮', '感动', '自然', '原因', '互相', '吸引', '幽默', '脾气'],
  2: ['适应', '交', '平时', '逛', '短信', '正好', '聚会', '联系', '差不多', '专门', '毕业', '麻烦', '好像', '重新', '尽管', '真正', '友谊', '丰富', '无聊', '讨厌', '却', '周围', '交流', '理解', '镜子', '而', '当', '困难', '及时', '陪'],
  3: ['挺', '紧张', '信心', '能力', '招聘', '提供', '负责', '本来', '应聘', '材料', '符合', '通知', '律师', '专业', '另外', '收入', '咱们', '安排', '首先', '正式', '留', '其次', '诚实', '改变', '感觉', '判断', '顾客', '准时', '不管', '与', '约会'],
  4: ['提', '以为', '份', '完全', '赚', '调查', '原来', '计划', '提前', '保证', '提醒', '乱', '生意', '谈', '并', '积累', '经验', '一切', '按照', '成功', '顺利', '感谢', '消息', '按时', '奖金', '工资', '方法', '知识', '不得不', '甚至', '责任'],
  5: ['家具', '沙发', '打折', '价格', '质量', '肯定', '流行', '顺便', '台', '逛', '实在', '制冷', '效果', '现金', '邀请', '葡萄', '艺术', '广告', '味道', '优点', '实际', '考虑', '标准', '样子', '年龄', '浪费', '购物', '尤其', '受到', '任何'],
  6: ['果汁', '售货员', '袜子', '打扰', '竟然', '西红柿', '百分之', '倍', '皮肤', '好处', '尝', '轻', '方面', '值得', '活动', '内', '免费', '修理', '支持', '举行', '满', '其中', '小说', '会员卡', '所有', '获得', '情况', '例如', '举办', '各', '降低'],
  7: ['流血', '所', '气候', '估计', '咳嗽', '严重', '窗户', '空气', '抽烟', '动作', '帅', '出现', '后悔', '来不及', '反对', '大夫', '植物', '研究', '超过', '散步', '提到', '精神', '教授', '数字', '说明', '要是', '又', '减肥', '辛苦', '肚子', '感情', '烦恼', '掉'],
  8: ['巧克力', '亲戚', '伤心', '使', '心情', '愉快', '景色', '放松', '压力', '回忆', '发生', '成为', '只要', '师傅', '大使馆', '堵车', '距离', '耐心', '生命', '缺少', '到处', '态度', '因此', '科学', '证明', '往往', '阳光', '积极', '特点'],
  9: ['饼干', '难道', '得', '坚持', '放弃', '主意', '网球', '国际', '轻松', '赢', '随便', '汗', '通过', '篇', '作家', '当时', '可是', '正确', '理想', '勇敢', '结果', '失败', '过程', '至少', '总结', '取', '经历', '许多', '区别', '暂时', '面对'],
  10: ['礼拜天', '空儿', '母亲', '不过', '永远', '方向', '努力', '优秀', '硕士', '翻译', '确实', '兴奋', '拉', '建议', '职业', '关键', '将来', '发展', '躺', '困', '经济', '条件', '富', '穷', '等', '由于', '比如', '橡皮', '糖', '低', '答案'],
  11: ['流利', '厉害', '语法', '准确', '词语', '连', '阅读', '来得及', '复杂', '只好', '填空', '猜', '否则', '客厅', '无论', '杂志', '著名', '页', '增加', '文章', '之', '内容', '然而', '看法', '相同', '顺序', '表示', '养成', '同时', '精彩'],
  12: ['规定', '死', '可惜', '全部', '也许', '商量', '并且', '盐', '勺子', '保护', '作用', '无法', '节', '详细', '解释', '对于', '叶子', '教育', '使用', '语言', '直接', '引起', '误会', '友好', '事半功倍', '节约', '力气', '相反', '任务', '意见', '仔细', '达到'],
  13: ['京剧', '演员', '观众', '厚', '演出', '大概', '来自', '遍', '偶尔', '吃惊', '基础', '表演', '正常', '申请', '有趣', '开心', '继续', '由', '讨论', '大约', '餐厅', '纸袋', '互联网', '进行', '错误'],
  14: ['出差', '毛巾', '牙膏', '重', '行', '省', '污染', '卫生间', '脏', '抱歉', '空', '盒', '扔', '以', '速度', '地球', '既然', '停', '得意', '目的', '暖', '塑料袋', '于是', '鼓励', '拒绝', '减少', '数量', '温度', '乘坐', '丢', '垃圾桶', '美丽'],
  15: ['弹钢琴', '棒', '孙子', '寒假', '父亲', '闹钟', '响', '醒', '赶', '厕所', '批评', '弄', '管理', '打针', '护士', '表扬', '千万', '怀疑', '故意', '敲', '整理', '合适', '骗', '儿童', '假', '左右', '懒', '笨', '粗心', '骄傲', '害羞'],
  16: ['博士', '签证', '报名', '表格', '传真', '号码', '参观', '激动', '小伙子', '记者', '代表', '恐怕', '失望', '郊区', '到底', '呀', '导游', '礼貌', '原谅', '挂', '同情', '推', '预习', '重点', '马虎', '自信'],
  17: ['凉快', '热闹', '云', '广播', '照', '倒', '毛', '抱', '干', '严格', '难受', '趟', '放暑假', '老虎', '入口', '排队', '活泼', '社会', '竞争', '森林', '剩', '暖和', '海洋', '底', '美人鱼', '公里', '仍然', '排列', '梦'],
  18: ['降落', '火', '作者', '交通', '技术', '是否', '秒', '方式', '受不了', '日记', '安全', '密码', '允许', '座', '桥', '危险', '接着', '警察', '抓', '咸', '矿泉水', '付款', '举', '迷路', '地址', '地点', '世纪', '邮局', '收', '信封', '网站', '信息'],
  19: ['学期', '出生', '性别', '道歉', '打印', '复印', '饺子', '刀', '破', '脱', '理发', '包子', '零钱', '打招呼', '戴', '眼镜', '舞蹈', '国籍', '抬', '胳膊', '转', '租', '吵', '厨房', '房东', '占线', '功夫', '乒乓球', '羽毛球', '场', '禁止', '座位'],
  20: ['加油站', '航班', '推迟', '高速公路', '登机牌', '首都', '旅行', '怪', '可怜', '对面', '烤鸭', '祝贺', '合格', '干杯', '民族', '打扮', '笑话', '存', '钥匙', '究竟', '棵', '汤', '对话', '普通话', '小吃', '收拾', '出发', '辣', '香', '酸']
};

const MANUAL_WORDS = {
  星星: {
    pinyin: 'xīngxing',
    meaning: 'ngôi sao',
    example: '夜空中的星星让这条路显得很浪漫。',
    examplePinyin: 'Yèkōng zhōng de xīngxing ràng zhè tiáo lù xiǎnde hěn làngmàn.',
    exampleTranslation: 'Những ngôi sao trên trời đêm khiến con đường này trở nên rất lãng mạn.',
    partOfSpeech: 'danh từ',
    note: 'Từ mở rộng có dấu * trong giáo trình.'
  },
  亮: {
    pinyin: 'liàng',
    meaning: 'sáng; chiếu sáng',
    example: '不管我多晚回家，客厅的灯总是亮着。',
    examplePinyin: 'Bùguǎn wǒ duō wǎn huí jiā, kètīng de dēng zǒngshì liàngzhe.',
    exampleTranslation: 'Dù tôi về nhà muộn thế nào, đèn phòng khách vẫn luôn sáng.',
    partOfSpeech: 'tính từ/động từ',
    note: 'Trong bài đọc, 亮着灯 diễn tả trạng thái đèn đang sáng.'
  },
  并: { pinyin: 'bìng', meaning: 'và; hoàn toàn (nhấn mạnh phủ định)', partOfSpeech: 'phó từ/liên từ', example: '计划并没有想象中顺利。', examplePinyin: 'Jìhuà bìng méiyǒu xiǎngxiàng zhōng shùnlì.', exampleTranslation: 'Kế hoạch hoàn toàn không thuận lợi như tưởng tượng.' },
  制冷: { pinyin: 'zhìlěng', meaning: 'làm lạnh', partOfSpeech: 'động từ', example: '这台空调的制冷效果很好。', examplePinyin: 'Zhè tái kōngtiáo de zhìlěng xiàoguǒ hěn hǎo.', exampleTranslation: 'Hiệu quả làm lạnh của chiếc điều hòa này rất tốt.' },
  会员卡: { pinyin: 'huìyuánkǎ', meaning: 'thẻ thành viên', partOfSpeech: 'danh từ', example: '使用会员卡可以打九折。', examplePinyin: 'Shǐyòng huìyuánkǎ kěyǐ dǎ jiǔ zhé.', exampleTranslation: 'Dùng thẻ thành viên có thể được giảm mười phần trăm.' },
  流血: { pinyin: 'liúxuè', meaning: 'chảy máu', partOfSpeech: 'động từ', example: '他的鼻子突然流血了。', examplePinyin: 'Tā de bízi tūrán liúxuè le.', exampleTranslation: 'Mũi anh ấy đột nhiên chảy máu.' },
  提到: { pinyin: 'tídào', meaning: 'đề cập, nhắc đến', partOfSpeech: 'động từ', example: '医生提到了一项新的研究。', examplePinyin: 'Yīshēng tídào le yí xiàng xīn de yánjiū.', exampleTranslation: 'Bác sĩ đã đề cập đến một nghiên cứu mới.' },
  空儿: { pinyin: 'kòngr', meaning: 'thời gian rảnh', partOfSpeech: 'danh từ', example: '这个礼拜天你有空儿吗？', examplePinyin: 'Zhège lǐbàitiān nǐ yǒu kòngr ma?', exampleTranslation: 'Chủ nhật này bạn có rảnh không?' },
  无法: { pinyin: 'wúfǎ', meaning: 'không thể, không có cách nào', partOfSpeech: 'động từ năng nguyện', example: '两个人无法继续合作。', examplePinyin: 'Liǎng ge rén wúfǎ jìxù hézuò.', exampleTranslation: 'Hai người không thể tiếp tục hợp tác.' },
  事半功倍: { pinyin: 'shìbàn-gōngbèi', meaning: 'bỏ ít công mà đạt hiệu quả gấp bội', partOfSpeech: 'thành ngữ', example: '用对方法可以事半功倍。', examplePinyin: 'Yòng duì fāngfǎ kěyǐ shìbàn-gōngbèi.', exampleTranslation: 'Dùng đúng phương pháp có thể bỏ ít công mà đạt hiệu quả cao.' },
  纸袋: { pinyin: 'zhǐdài', meaning: 'túi giấy', partOfSpeech: 'danh từ', example: '节目单装在纸袋里。', examplePinyin: 'Jiémùdān zhuāng zài zhǐdài lǐ.', exampleTranslation: 'Tờ chương trình được đựng trong túi giấy.' },
  盒: { pinyin: 'hé', meaning: 'hộp; lượng từ cho hộp', partOfSpeech: 'danh từ/lượng từ', example: '桌上放着一盒牙膏。', examplePinyin: 'Zhuō shàng fàngzhe yì hé yágāo.', exampleTranslation: 'Trên bàn có một hộp kem đánh răng.' },
  暖: { pinyin: 'nuǎn', meaning: 'ấm', partOfSpeech: 'tính từ', example: '太阳出来以后，房间变暖了。', examplePinyin: 'Tàiyáng chūlái yǐhòu, fángjiān biàn nuǎn le.', exampleTranslation: 'Sau khi mặt trời lên, căn phòng trở nên ấm hơn.' },
  闹钟: { pinyin: 'nàozhōng', meaning: 'đồng hồ báo thức', partOfSpeech: 'danh từ', example: '闹钟响了三遍，他才醒。', examplePinyin: 'Nàozhōng xiǎng le sān biàn, tā cái xǐng.', exampleTranslation: 'Đồng hồ báo thức reo ba lần anh ấy mới tỉnh.' },
  美人鱼: { pinyin: 'měirényú', meaning: 'nàng tiên cá', partOfSpeech: 'danh từ', example: '孩子画了一条住在海底的美人鱼。', examplePinyin: 'Háizi huà le yì tiáo zhù zài hǎidǐ de měirényú.', exampleTranslation: 'Đứa trẻ vẽ một nàng tiên cá sống dưới đáy biển.' },
  怪: { pinyin: 'guài', meaning: 'lạ; trách', partOfSpeech: 'tính từ/động từ', example: '今天的安排让人觉得很怪。', examplePinyin: 'Jīntiān de ānpái ràng rén juéde hěn guài.', exampleTranslation: 'Sự sắp xếp hôm nay khiến người ta thấy rất lạ.' }
};

const LESSONS = {
  1: {
    title: 'Tình yêu đơn giản',
    chineseTitle: '简单的爱情',
    icon: '💞',
    desc: 'Tình yêu, tính cách và cách hai người cùng trưởng thành.',
    sourceLesson: 'Giáo trình chuẩn HSK4 quyển thượng - Bài 1: 简单的爱情',
    reading: `《简单的爱情》
大学一年级时，我学法律，林安学新闻。我们俩第一次见面是在足球场。他刚替同学捡起书，我对他的印象并不深，只觉得他性格安静。后来我们参加共同的学习小组，慢慢熟悉起来。我发现他不仅学习认真，而且很幽默，常常跟大家开玩笑；他也说我的脾气直，却很自然。我们在性格上互相吸引，可是谁都没有马上谈爱情。

毕业后，他到外地工作，我留在学校。即使每天加班，他也从来没有忘记联系我。一天晚上，他让我抬头看窗外的星星，说：“真正的浪漫，不是礼物有多贵，而是回家时总有一盏灯为你亮着。”这句话让我很感动，我终于接受了他的心意。

结婚以后，我们的生活并不总是轻松。我有爱生气的缺点，他有做事太慢的缺点；有时钱不够，有时因为小事争论。可是我们知道，羡慕别人的幸福没有意义，最好先理解眼前的人。适合的伴侣不是没有缺点，而是愿意体贴对方、学习相处，在普通日子里彼此陪伴。爱情让我们明白，幸福的原因并不复杂：把每一天认真过好，俩人陪着彼此慢慢成长，就已经够浪漫了。`,
    extendedVocabulary: [
      {
        hanzi: '体贴',
        pinyin: 'tǐtiē',
        meaning: 'quan tâm chu đáo, biết nghĩ cho người khác',
        partOfSpeech: 'động từ/tính từ',
        example: '互相体贴比昂贵的礼物更重要。',
        exampleTranslation: 'Biết quan tâm đến nhau quan trọng hơn những món quà đắt tiền.'
      },
      {
        hanzi: '相处',
        pinyin: 'xiāngchǔ',
        meaning: 'chung sống, cư xử với nhau',
        partOfSpeech: 'động từ',
        example: '两个人相处时要学会接受不同。',
        exampleTranslation: 'Khi chung sống, hai người phải học cách chấp nhận sự khác biệt.'
      },
      {
        hanzi: '陪伴',
        pinyin: 'péibàn',
        meaning: 'đồng hành, ở bên',
        partOfSpeech: 'động từ',
        example: '真正的幸福是家人的陪伴。',
        exampleTranslation: 'Hạnh phúc thật sự là sự đồng hành của gia đình.'
      }
    ],
    grammar: [
      {
        title: '不仅……而且/也/还…… - không những… mà còn…',
        pattern: '不仅 + ý 1，而且/也/还 + ý 2',
        structure: 'Bổ sung ý thứ hai ở mức độ cao hơn hoặc quan trọng hơn ý thứ nhất.',
        explanation: 'Khi hai vế cùng chủ ngữ, 不仅 thường đứng sau chủ ngữ; khi khác chủ ngữ, 不仅 thường đứng trước chủ ngữ của vế đầu.',
        examples: ['他不仅学习认真，而且很幽默。', '这份工作不仅工资不错，还很适合我。'],
        usage: 'Có thể thay 而且 bằng 也 hoặc 还 tùy ngữ cảnh.'
      },
      {
        title: '从来 - từ trước đến nay',
        pattern: '从来 + 没(有)/不 + động từ',
        structure: 'Nhấn mạnh một tình trạng luôn đúng từ trước đến nay.',
        explanation: '从来 thường xuất hiện trong câu phủ định; khi nói về trải nghiệm chưa từng có, dùng 从来没有.',
        examples: ['他从来没有忘记联系我。', '我从来不拿别人的缺点开玩笑。'],
        usage: 'Không dùng 从来 để chỉ một lần xảy ra riêng lẻ.'
      },
      {
        title: '刚 - vừa mới',
        pattern: 'Chủ ngữ + 刚 + động từ',
        structure: 'Diễn tả hành động hoặc tình huống xảy ra cách thời điểm nói không lâu.',
        explanation: '刚 là phó từ, đứng sau chủ ngữ và trước động từ; khác với 刚才 là danh từ thời gian.',
        examples: ['他刚替同学捡起书。', '我刚到家，他就打电话来了。'],
        usage: 'Sau 刚 có thể có từ chỉ khoảng thời gian; sau 刚才 thì không.'
      },
      {
        title: '即使……也…… - cho dù… vẫn…',
        pattern: '即使 + điều kiện，主 ngữ + 也 + kết quả',
        structure: 'Nêu một điều kiện giả định hoặc đã có thật nhưng không làm thay đổi kết quả.',
        explanation: '即使 mở đầu vế nhượng bộ, 也 thường đứng ở vế kết quả để nhấn mạnh kết quả không đổi.',
        examples: ['即使每天加班，他也会给家人打电话。', '即使有缺点，我们也可以互相理解。'],
        usage: 'Có thể dùng 即便 thay cho 即使 trong văn viết.'
      },
      {
        title: '在……上 - xét về phương diện…',
        pattern: '在 + danh từ/phạm vi + 上',
        structure: 'Giới hạn nhận xét hoặc sự việc trong một phương diện cụ thể.',
        explanation: '上 ở đây không chỉ vị trí vật lý mà biểu thị phương diện như 性格上、工作上、学习上.',
        examples: ['我们在性格上互相吸引。', '他在工作上对自己要求很严格。'],
        usage: 'Không dịch 上 theo nghĩa “ở trên” trong cấu trúc này.'
      }
    ],
    readingQuestion: 'Hai nhân vật hiểu thế nào về một tình yêu phù hợp?',
    readingAnswer: 'Họ cho rằng tình yêu phù hợp là biết chấp nhận khuyết điểm, quan tâm và đồng hành cùng nhau trong cuộc sống bình thường.'
  }
};

function g(title, gloss, pattern, explanation, examples, usage = 'Chú ý vị trí của cấu trúc trong câu và chọn theo ngữ cảnh.') {
  return {
    title: `${title} - ${gloss}`,
    pattern,
    structure: explanation,
    explanation,
    examples,
    usage
  };
}

const GRAMMAR_BY_LESSON = {
  2: [
    g('正好', 'vừa đúng lúc; vừa khớp', '正好 + động từ / số lượng', 'Nhấn mạnh thời điểm, điều kiện hoặc số lượng trùng khớp với nhu cầu.', ['我正好要去图书馆，咱们一起走吧。', '这些椅子正好够十个人坐。']),
    g('差不多', 'xấp xỉ; gần như', '差不多 + số lượng / tính từ', 'Biểu thị hai sự vật gần giống nhau hoặc một việc gần hoàn thành.', ['我们差不多三年没见了。', '准备工作做得差不多了。']),
    g('尽管', 'mặc dù', '尽管……，但是/可是/却……', 'Mở đầu vế nhượng bộ; kết quả ở vế sau không thay đổi theo điều kiện ấy.', ['尽管工作很忙，他却及时来陪我。', '尽管意见不同，我们还是朋友。']),
    g('却', 'nhưng lại', 'Vế 1，主语 + 却 + vị ngữ', 'Nêu kết quả tương phản với điều người nói thường dự đoán.', ['他看起来严肃，却很会开玩笑。', '外面很冷，她却没穿外套。']),
    g('而', 'còn; mà; nhưng', 'A，而 B', 'Nối hai thành phần có quan hệ bổ sung hoặc đối chiếu, thường dùng trong văn viết.', ['友谊需要理解，而不是互相批评。', '他喜欢安静，而我喜欢热闹。'])
  ],
  3: [
    g('挺', 'khá, rất', '挺 + tính từ + 的', 'Dùng trong khẩu ngữ để đánh giá mức độ khá cao, cuối câu thường có 的.', ['这次面试挺顺利的。', '经理对我的印象挺好的。']),
    g('本来', 'vốn dĩ', '本来 + tình huống ban đầu', 'Nêu kế hoạch hoặc trạng thái ban đầu; vế sau thường cho biết sự thay đổi.', ['我本来想当律师，后来改变了主意。', '他本来不紧张，等候时却担心起来。']),
    g('另外', 'ngoài ra; cái khác', '另外 + danh từ / câu', 'Bổ sung một đối tượng hoặc một ý mới bên cạnh nội dung đã nói.', ['请准备简历，另外带一张照片。', '这件太大，我想看另外一件。']),
    g('首先……其次……', 'trước hết… tiếp theo…', '首先……，其次……', 'Sắp xếp các ý hoặc bước theo thứ tự rõ ràng.', ['首先要准时，其次要诚实。', '首先介绍经验，其次说明计划。']),
    g('不管', 'bất kể', '不管 + điều kiện， 都/也 + kết quả', 'Nêu nhiều khả năng khác nhau nhưng kết quả vẫn giữ nguyên.', ['不管结果怎样，都要有信心。', '不管顾客问什么，她都耐心回答。'])
  ],
  4: [
    g('以为', 'cứ tưởng', '主语 + 以为 + nhận định', 'Diễn tả nhận định chủ quan trước đây, thường hàm ý thực tế khác với dự đoán.', ['我以为开店很容易，原来并不是这样。', '他以为会议九点开始。']),
    g('原来', 'hóa ra; vốn là', '原来 + sự thật mới biết', 'Dùng khi phát hiện nguyên nhân hoặc tình hình thật; cũng có thể chỉ trạng thái trước đây.', ['原来成功需要长期积累。', '这里原来是一家书店。']),
    g('并', 'hoàn toàn không; và', '并 + 不/没 / động từ', 'Trong câu phủ định, 并 nhấn mạnh phủ định; trong văn viết có thể nối hai hành động.', ['计划并没有想象中顺利。', '双方讨论并解决了问题。']),
    g('按照', 'theo, căn cứ vào', '按照 + quy định/kế hoạch + động từ', 'Chỉ tiêu chuẩn hoặc phương thức được dùng để thực hiện hành động.', ['请按照计划按时完成任务。', '奖金按照工作表现来计算。']),
    g('甚至', 'thậm chí', '普通情况，甚至 + tình huống nổi bật', 'Đưa thêm trường hợp vượt mức thông thường để tăng sức nhấn mạnh.', ['他忙得甚至没有时间吃饭。', '她不仅记得名字，甚至记得日期。'])
  ],
  5: [
    g('肯定', 'chắc chắn', '肯定 + vị ngữ / 是……的', 'Biểu thị mức độ chắc chắn cao hoặc xác nhận một nhận định.', ['质量好的家具肯定更耐用。', '这肯定不是最理性的选择。']),
    g('再说', 'hơn nữa; để nói sau', 'Lý do 1，再说 + lý do 2', 'Bổ sung một lý do; hoặc cho biết một việc sẽ được bàn sau.', ['今天太晚了，再说我也没带现金。', '这件事明天再说吧。']),
    g('实际', 'thực tế', '实际（上）+ tình hình thật', 'Nêu tình hình thật để đối chiếu với vẻ ngoài, quảng cáo hoặc suy đoán.', ['广告很漂亮，实际效果却一般。', '实际价格比网上低。']),
    g('对……来说', 'đối với… mà nói', '对 + người/đối tượng + 来说', 'Giới hạn nhận xét theo góc nhìn hoặc điều kiện của một đối tượng.', ['对年轻人来说，实用比流行更重要。', '对我来说，这个价格太高。']),
    g('尤其', 'đặc biệt là', 'Phạm vi chung，尤其（是）+ phần nổi bật', 'Nhấn mạnh một thành phần nổi bật trong phạm vi đã nêu.', ['我喜欢水果，尤其是葡萄。', '购物时要看质量，尤其要看售后服务。'])
  ],
  6: [
    g('竟然', 'không ngờ lại', '主语 + 竟然 + vị ngữ', 'Biểu thị kết quả vượt ngoài dự đoán của người nói.', ['这双袜子竟然比那双贵一倍。', '商店竟然提供免费修理。']),
    g('倍', 'lần, gấp', 'A 是 B 的 + số + 倍 / 增加了 + số + 倍', 'So sánh bội số; cần phân biệt “là gấp mấy lần” và “tăng thêm mấy lần”.', ['今年的顾客是去年的两倍。', '价格增加了一倍。']),
    g('值得', 'đáng để', '值得 + động từ', 'Đánh giá một hành động hoặc sự vật có giá trị để thực hiện hay quan tâm.', ['这本小说值得读一遍。', '这家店的售后服务值得支持。']),
    g('其中', 'trong đó', 'Tổng thể，其中 + một phần', 'Dẫn ra một bộ phận thuộc tập hợp vừa được nhắc đến.', ['活动有五项，其中两项免费。', '我买了三种果汁，其中苹果汁最好喝。']),
    g('在……下', 'dưới điều kiện/tác động…', '在 + điều kiện/tác động + 下', 'Nêu điều kiện, hoàn cảnh hoặc sự hỗ trợ làm nền cho kết quả.', ['在会员卡的帮助下，价格降低了百分之十。', '在大家的支持下，活动顺利举行。'])
  ],
  7: [
    g('估计', 'ước chừng; đoán rằng', '估计 + số lượng / mệnh đề', 'Đưa ra phán đoán chưa hoàn toàn chắc chắn dựa trên tình hình hiện có.', ['医生估计他休息三天就会好。', '今天的气温估计会超过三十度。']),
    g('来不及', 'không kịp', '来不及 + động từ', 'Biểu thị thời gian còn lại không đủ để hoàn thành hành động.', ['再不出发就来不及看大夫了。', '我来不及吃早饭。']),
    g('离合词重叠', 'lặp động từ ly hợp', 'AAB / A一AB', 'Động từ ly hợp có thể lặp để diễn tả hành động ngắn hoặc thử làm.', ['吃完饭出去散散步吧。', '有烦恼时跟朋友见一见面。']),
    g('要是', 'nếu như', '要是……，就……', 'Đưa ra điều kiện giả định trong khẩu ngữ; gần nghĩa với 如果.', ['要是咳嗽严重，就及时去医院。', '要是空气好，我们就去散步。']),
    g('既……又/也/还……', 'vừa… vừa…', '既 + đặc điểm 1，又/也/还 + đặc điểm 2', 'Nối hai đặc điểm cùng tồn tại của một chủ thể.', ['散步既能放松精神，又对身体有好处。', '他既不抽烟，也不喝酒。'])
  ],
  8: [
    g('使', 'khiến, làm cho', 'A + 使 + B + tính từ/động từ', 'Nêu nguyên nhân A làm trạng thái hoặc hành động của B thay đổi.', ['阳光使人的心情更愉快。', '这段回忆使她非常感动。']),
    g('只要', 'chỉ cần', '只要……，就……', 'Nêu điều kiện đủ; khi điều kiện được đáp ứng thì kết quả có thể xảy ra.', ['只要态度积极，就能发现生活中的美。', '只要有耐心，就一定能学会。']),
    g('可不是', 'đúng thế còn gì', '可不是（吗）', 'Cách đáp trong khẩu ngữ để đồng tình mạnh với ý vừa nghe.', ['“今天堵车真严重。”“可不是，我等了半小时。”', '可不是吗，健康比什么都重要。']),
    g('因此', 'vì thế, do đó', 'Nguyên nhân，因此 + kết quả', 'Từ nối thiên về văn viết, dẫn ra kết quả của nội dung phía trước.', ['距离太远，因此我们决定坐地铁。', '他缺少休息，因此压力越来越大。']),
    g('往往', 'thường thường', '往往 + động từ/tính từ', 'Nêu quy luật thường xuất hiện trong những điều kiện nhất định, không chỉ một thói quen cá nhân.', ['乐观的人往往更容易放松。', '春天这里往往阳光很好。'])
  ],
  9: [
    g('难道', 'chẳng lẽ', '难道……吗？', 'Tạo câu hỏi tu từ, thường cho thấy người nói cho rằng điều ngược lại mới đúng.', ['一次失败难道就要放弃吗？', '难道只有赢才有意义吗？']),
    g('通过', 'thông qua', '通过 + phương thức + động từ', 'Nêu phương thức, quá trình hoặc kênh giúp đạt kết quả.', ['他通过训练进入了国际比赛。', '我们通过总结发现了问题。']),
    g('可是', 'nhưng', 'Vế 1，可是 + vế 2', 'Nối hai vế có ý nghĩa chuyển hướng hoặc tương phản rõ.', ['过程很辛苦，可是他没有放弃。', '我想打网球，可是外面下雨了。']),
    g('结果', 'kết quả là', 'Nguyên nhân/diễn biến，结果 + kết quả', 'Đưa ra kết quả cuối cùng, đôi khi khác với dự đoán ban đầu.', ['他每天坚持练习，结果真的赢了。', '我忘了带地图，结果迷路了。']),
    g('动词 + 上', 'bắt đầu/đạt được trạng thái', '动词 + 上 + tân ngữ', 'Bổ ngữ 上 có thể chỉ tiếp xúc, đạt được, bắt đầu hoặc gắn vào tùy động từ.', ['经过努力，他终于当上了作家。', '天气冷了，快穿上外套。'])
  ],
  10: [
    g('不过', 'nhưng mà; chỉ có điều', 'Nhận xét 1，不过 + bổ sung/giới hạn', 'Chuyển nhẹ sang thông tin hạn chế hoặc bổ sung, mức đối lập yếu hơn 但是.', ['收入不算高，不过这份职业很有价值。', '我可以去，不过要晚一点儿。']),
    g('确实', 'quả thực', '确实 + vị ngữ', 'Xác nhận một sự thật sau khi quan sát, suy nghĩ hoặc kiểm chứng.', ['她确实是一名优秀的翻译。', '这个建议确实很有帮助。']),
    g('在……看来', 'theo cách nhìn của…', '在 + người + 看来', 'Giới hạn nhận định theo quan điểm của một người hoặc nhóm người.', ['在母亲看来，健康永远最重要。', '在我看来，职业没有高低之分。']),
    g('由于', 'do, bởi vì', '由于 + nguyên nhân，nên + kết quả', 'Nêu nguyên nhân, thường dùng trong văn viết; có thể đi cùng 因此/所以.', ['由于经济条件有限，他选择先工作。', '由于准备充分，翻译很顺利。']),
    g('比如', 'ví dụ như', 'Nhận xét chung，比如 + ví dụ', 'Đưa ra một hoặc vài trường hợp cụ thể để minh họa.', ['减轻压力的方法很多，比如散步和听音乐。', '我喜欢甜食，比如糖和巧克力。'])
  ],
  11: [
    g('连', 'ngay cả', '连 + thành phần nhấn mạnh + 都/也……', 'Đưa ra trường hợp cực đoan để nhấn mạnh phạm vi hoặc mức độ.', ['这篇文章很难，我连题目都没看懂。', '他忙得连饭也来不及吃。']),
    g('否则', 'nếu không thì', 'Mệnh lệnh/điều kiện，否则 + hậu quả', 'Nêu hậu quả sẽ xảy ra nếu không làm theo nội dung phía trước.', ['要养成阅读习惯，否则词汇很难增加。', '请按顺序填写，否则容易出错。']),
    g('无论', 'bất luận', '无论 + nghi vấn/điều kiện，都/也……', 'Bao quát mọi khả năng; kết quả phía sau không thay đổi.', ['无论内容多复杂，都要仔细读。', '无论谁来，他都热情欢迎。']),
    g('然而', 'tuy nhiên', 'Câu 1。然而，câu 2。', 'Từ nối văn viết biểu thị chuyển ý mạnh giữa hai câu.', ['很多人知道阅读重要，然而真正坚持的人不多。', '文章不长，然而内容很精彩。']),
    g('同时', 'đồng thời', 'Hành động 1，同时 + hành động 2', 'Nêu hai hành động hoặc đặc điểm cùng xảy ra hoặc cùng tồn tại.', ['阅读能增加词语，同时能训练思考。', '他表示同意，同时提出了建议。'])
  ],
  12: [
    g('并且', 'và còn', 'Ý 1，并且 + ý 2', 'Nối hai hành động hoặc tính chất theo quan hệ tiến thêm, thường dùng trong văn viết.', ['请仔细阅读规定，并且按要求完成任务。', '这种方法简单并且有效。']),
    g('再……也……', 'dù… đến đâu cũng…', '再 + tính từ/động từ，也 + kết quả', 'Nhấn mạnh dù mức độ hoặc tình huống tăng thế nào thì kết quả vẫn không đổi.', ['任务再难也不能放弃。', '他再忙也会保护环境。']),
    g('对于', 'đối với', '对于 + đối tượng，主语 + nhận xét', 'Đưa đối tượng được bình luận lên đầu câu, sắc thái trang trọng hơn 对.', ['对于不同意见，我们应该先倾听。', '这本书对于初学者很有用。']),
    g('名量词重叠', 'lặp lượng từ', '一 + AA / AA + 都', 'Lặp lượng từ để biểu thị từng đơn vị hoặc toàn bộ không ngoại lệ.', ['孩子们一个个都听得很仔细。', '这些叶子片片都很绿。']),
    g('相反', 'ngược lại', 'Nhận định 1；相反，nhận định 2', 'Nêu tình hình hoàn toàn trái với nội dung phía trước.', ['他没有拒绝；相反，他主动提供帮助。', '节约不是降低生活质量，相反会减少浪费。'])
  ],
  13: [
    g('大概', 'khoảng; có lẽ', '大概 + số lượng / mệnh đề', 'Biểu thị con số ước lượng hoặc phán đoán chưa chắc chắn.', ['演出大概持续两个小时。', '他大概已经到餐厅了。']),
    g('偶尔', 'thỉnh thoảng', '偶尔 + động từ', 'Chỉ hành động xảy ra không thường xuyên.', ['我平时听流行音乐，偶尔也听京剧。', '他偶尔在网上看演出。']),
    g('由', 'do; bởi; từ', '由 + người/đơn vị + động từ', 'Trong câu bị động hoặc phân công, nêu chủ thể chịu trách nhiệm thực hiện.', ['这次演出由青年演员表演。', '活动由文化中心举办。']),
    g('进行', 'tiến hành', '进行 + danh từ hai âm tiết', 'Kết hợp với danh từ chỉ hoạt động trang trọng như 讨论、调查、交流.', ['观众正在进行热烈讨论。', '学校对学生进行了调查。']),
    g('随着', 'cùng với', '随着 + sự thay đổi，kết quả', 'Nêu kết quả biến đổi theo sự phát triển của một tình hình khác.', ['随着互联网发展，京剧有了新观众。', '随着年龄增加，他更喜欢传统艺术。'])
  ],
  14: [
    g('够', 'đủ', '够 + động từ / tính từ + 了', 'Biểu thị số lượng hoặc mức độ đạt yêu cầu; cũng có thể nhấn mạnh mức độ cao.', ['这些水够大家喝一天。', '房间已经够暖了。']),
    g('以', 'bằng; lấy; để', '以 + phương thức/mục đích', 'Giới từ văn viết dùng để nêu phương thức, căn cứ hoặc mục đích.', ['我们以实际行动保护地球。', '请以安全的速度行驶。']),
    g('既然', 'đã… thì…', '既然 + sự thật，就/那么 + kết quả', 'Nêu một tiền đề đã được thừa nhận rồi suy ra quyết định hợp lý.', ['既然知道塑料会污染环境，就少用塑料袋。', '既然来了，就坐一会儿吧。']),
    g('于是', 'thế là', 'Nguyên nhân，于是 + hành động tiếp theo', 'Nối sự việc theo trình tự nhân quả, vế sau thường là việc mới xảy ra.', ['垃圾桶满了，于是我们先把垃圾分类。', '雨停了，于是大家继续出发。']),
    g('什么的', 'vân vân, các thứ như…', 'A、B 什么的', 'Đặt sau vài ví dụ tiêu biểu để biểu thị còn những thứ tương tự khác.', ['毛巾、牙膏什么的都放进盒子里。', '周末我喜欢爬山、散步什么的。'])
  ],
  15: [
    g('想起来', 'nhớ ra', '主语 + 想起来 + nội dung', 'Chỉ thông tin vốn quên nhưng bất ngờ trở lại trong trí nhớ.', ['听到闹钟，我才想起来今天要打针。', '我想起来钥匙放在哪儿了。']),
    g('弄', 'làm; xử lý', '弄 + bổ ngữ/tân ngữ', 'Động từ khẩu ngữ có nghĩa rộng, phải dựa vào bổ ngữ để hiểu hành động cụ thể.', ['别把房间弄乱了。', '父亲把坏闹钟弄好了。']),
    g('千万', 'nhất định đừng/phải', '千万 + 要/别/不要 + động từ', 'Dùng để dặn dò mạnh, nhấn mạnh điều rất quan trọng.', ['过马路千万要小心。', '千万别故意骗孩子。']),
    g('来', 'để, nhằm', 'Dùng A 来 + động từ', 'Nối phương thức hoặc công cụ A với mục đích phía sau.', ['父母应该用合适的方法来教育孩子。', '我们开会来解决问题。']),
    g('左右', 'khoảng', 'Số lượng + 左右', 'Đứng sau con số để biểu thị xấp xỉ, không dùng đồng thời với 多/来 trong cùng cách nói.', ['儿童每天应该睡九个小时左右。', '他三十岁左右。'])
  ],
  16: [
    g('可', 'thật là; nhưng', '主语 + 可 + vị ngữ', 'Phó từ khẩu ngữ dùng để nhấn mạnh phán đoán hoặc tạo sắc thái chuyển ý.', ['拿到签证，他可激动了。', '你可别忘了报名。']),
    g('恐怕', 'e rằng; có lẽ', '恐怕 + mệnh đề', 'Đưa ra phán đoán có phần lo ngại hoặc cách nói từ chối mềm.', ['材料不全，恐怕不能按时报名。', '他恐怕已经去郊区了。']),
    g('到底', 'rốt cuộc', '到底 + từ nghi vấn', 'Tăng mức truy hỏi để yêu cầu làm rõ kết quả hoặc nguyên nhân.', ['你到底把号码写在哪儿了？', '这件事到底是谁负责？']),
    g('拿……来说', 'lấy… mà nói', '拿 + ví dụ + 来说', 'Chọn một trường hợp cụ thể để minh họa cho nhận xét chung.', ['拿准备签证来说，仔细最重要。', '拿这次参观来说，大家都很有礼貌。']),
    g('敢', 'dám', '敢 + động từ / 不敢 + động từ', 'Biểu thị có hoặc không có can đảm thực hiện hành động.', ['有问题就要敢提问。', '他不敢一个人去陌生地方。'])
  ],
  17: [
    g('倒', 'ngược lại; thì lại', '主语 + 倒 + vị ngữ', 'Nêu tình hình trái với dự đoán hoặc nhượng bộ một mặt.', ['山下很热，森林里倒很凉快。', '他年纪小，胆子倒不小。']),
    g('干', 'khô', '干 + danh từ / 变干', 'Tính từ chỉ không có nước hoặc độ ẩm; khác với động từ 干 “làm”.', ['天气太干，记得多喝水。', '毛巾已经干了。']),
    g('趟', 'chuyến, lượt', 'Động từ + số + 趟', 'Lượng từ cho số lần đi và trở về một địa điểm.', ['这个暑假我去了一趟森林。', '请你跑一趟邮局。']),
    g('为了……而……', 'vì… mà…', '为了 + mục đích + 而 + hành động', 'Nêu mục đích thúc đẩy hành động, sắc thái văn viết.', ['人们为了保护海洋而减少塑料垃圾。', '他为了梦想而努力。']),
    g('仍然', 'vẫn còn', '主语 + 仍然 + vị ngữ', 'Biểu thị trạng thái tiếp tục không thay đổi sau một khoảng thời gian hoặc biến cố.', ['天气变冷，游客仍然排队参观。', '失败以后，他仍然很自信。'])
  ],
  18: [
    g('是否', 'có… hay không', '是否 + động từ/tính từ', 'Cách nói hai khả năng chính–phủ định, thường dùng trong văn viết và câu gián tiếp.', ['请检查密码是否安全。', '我不知道航班是否降落了。']),
    g('受不了', 'không chịu nổi', '受不了 + danh từ / trạng thái', 'Biểu thị không thể tiếp tục chịu đựng về thể chất hoặc tinh thần.', ['我受不了这么咸的汤。', '这里太吵，他有点儿受不了。']),
    g('接着', 'tiếp theo', 'Hành động 1，接着 + hành động 2', 'Nối hai hành động xảy ra liên tiếp theo thời gian.', ['警察看了地址，接着检查了网站信息。', '他站起来，接着举起手。']),
    g('除此以外', 'ngoài điều đó ra', 'Nội dung 1，除此以外，nội dung 2', 'Bổ sung thông tin nằm ngoài phạm vi vừa nói.', ['手机能付款，除此以外还能帮助我们找路。', '我带了水，除此以外还带了地图。']),
    g('把……叫作……', 'gọi… là…', '把 + đối tượng + 叫作 + tên gọi', 'Dùng để giới thiệu tên hoặc cách gọi của một sự vật.', ['人们把这个系统叫作智慧交通。', '我们把这座桥叫作友谊桥。'])
  ],
  19: [
    g('疑问代词表示任指', 'đại từ nghi vấn chỉ bất kỳ', '谁/什么/哪儿 + 都/也……', 'Đại từ nghi vấn không dùng để hỏi mà bao quát mọi người, vật hoặc nơi.', ['谁都可以参加这场舞蹈活动。', '他什么运动都会一点儿。']),
    g('动词 + 上', 'đạt/gắn/mặc vào', '动词 + 上 + tân ngữ', 'Bổ ngữ 上 biểu thị động tác đạt mục tiêu, gắn vào hoặc bắt đầu một trạng thái.', ['她戴上眼镜开始打印材料。', '房东终于打上电话了。']),
    g('出来', 'ra; nhận ra', '动词 + 出来', 'Bổ ngữ xu hướng chỉ từ trong ra ngoài; sau động từ cảm giác còn chỉ nhận biết.', ['请把饺子端出来。', '我听出来他在道歉。']),
    g('总的来说', 'nói chung', '总的来说，+ kết luận', 'Tóm tắt và đưa ra đánh giá chung sau khi đã nêu nhiều mặt.', ['总的来说，新学期的生活很顺利。', '总的来说，这套房子很合适。']),
    g('在于', 'nằm ở, cốt ở', 'A + 在于 + nguyên nhân/điểm chính', 'Nêu bản chất, nguyên nhân hoặc điểm quan trọng nhất của sự việc.', ['学好功夫的关键在于坚持。', '礼貌不在于形式，而在于尊重。'])
  ],
  20: [
    g('动词 + 着 + 动词 + 着', 'đang… thì dần…', 'V1 + 着 + V1 + 着，（就）V2', 'Diễn tả một hành động đang tiếp diễn thì xuất hiện sự thay đổi hoặc hành động mới.', ['大家聊着聊着就笑了起来。', '我走着走着发现了一家小吃店。']),
    g('一……就……', 'hễ… là; vừa… liền…', '一 + động từ 1，就 + động từ 2', 'Hai hành động xảy ra sát nhau hoặc kết quả luôn xuất hiện khi có điều kiện.', ['飞机一降落，我们就去取行李。', '她一吃辣的就脸红。']),
    g('究竟', 'rốt cuộc', '究竟 + từ nghi vấn', 'Nhấn mạnh việc tìm cho ra sự thật; thường dùng trong câu hỏi hoặc mệnh đề gián tiếp.', ['航班究竟为什么推迟？', '我想知道他究竟去了哪里。']),
    g('起来', 'bắt đầu; trở nên', '动词/形容词 + 起来', 'Bổ ngữ chỉ hành động bắt đầu hoặc trạng thái phát triển dần.', ['听完笑话，大家都笑了起来。', '天气渐渐暖和起来。']),
    g('动词 + 起', 'nhắc đến; bắt đầu từ', '说/谈/想 + 起 + tân ngữ', 'Sau động từ nhận thức hoặc lời nói, 起 dẫn ra người hay việc được nhớ hoặc nhắc tới.', ['说起这次旅行，我有很多回忆。', '他一谈起首都的小吃就很兴奋。'])
  ]
};

function ext(hanzi, pinyin, meaning, partOfSpeech = 'danh từ') {
  return { hanzi, pinyin, meaning, partOfSpeech };
}

function courseLesson(id, title, chineseTitle, icon, desc, reading, extendedVocabulary, readingQuestion, readingAnswer) {
  const volume = id <= 10 ? 'quyển thượng' : 'quyển hạ';
  return {
    title,
    chineseTitle,
    icon,
    desc,
    sourceLesson: `Giáo trình chuẩn HSK4 ${volume} - Bài ${id}: ${chineseTitle}`,
    reading,
    extendedVocabulary,
    grammar: GRAMMAR_BY_LESSON[id],
    readingQuestion,
    readingAnswer
  };
}

Object.assign(LESSONS, {
  2: courseLesson(
    2, 'Người bạn thực sự', '真正的朋友', '🤝',
    'Tình bạn, sự tin cậy và cách đồng hành khi gặp khó khăn.',
    `《真正的朋友》
毕业后，我一个人到南方工作。刚开始，我很难适应新城市，也不知道怎样交朋友。平时下班以后，我不是回家看电影，就是独自逛附近的小店，生活好像很丰富，心里却常常觉得无聊。

一个周五，我收到大学同学小周的短信。他正好来这里出差，想组织一次聚会。我们差不多两年没联系了，他却专门记得我喜欢安静，便把地点换到离我家不远的茶馆。见面时，我担心重新交流会有些麻烦，尽管大家的工作和生活都变了，谈起共同的经历，距离很快就消失了。

聚会以后，小周还介绍我认识他周围的朋友。我曾经讨厌把困难告诉别人，因为怕给大家添麻烦。小周却说：“当你需要帮助时，真正的朋友会及时出现，而不是只在开心时陪你。”后来我生病住院，他每天联系医生，陪我检查，还耐心听我说烦恼。

我终于理解，朋友像一面镜子，让我们看见自己的优点和问题。友谊不是天天见面，而是彼此信任，愿意分享生活，并在普通日子里珍惜对方。`,
    [ext('信任', 'xìnrèn', 'tin tưởng', 'động từ'), ext('分享', 'fēnxiǎng', 'chia sẻ', 'động từ'), ext('珍惜', 'zhēnxī', 'trân trọng', 'động từ')],
    'Vì sao nhân vật cho rằng Tiểu Chu là một người bạn thực sự?',
    'Vì Tiểu Chu hiểu, tin cậy, kịp thời giúp đỡ và đồng hành với bạn khi bạn gặp khó khăn.'
  ),
  3: courseLesson(
    3, 'Giám đốc có ấn tượng tốt về tôi', '经理对我印象不错', '💼',
    'Tìm việc, phỏng vấn và những phẩm chất cần có trong môi trường chuyên nghiệp.',
    `《经理对我印象不错》
大学毕业后，我到一家律师事务所应聘。招聘通知上说，公司要找一名法律专业助理，主要负责整理材料、联系顾客，并为律师提供工作支持。我觉得自己的能力符合要求，可走进办公室时还是挺紧张的。

面试开始，经理首先让我介绍专业和实习经验，其次问我怎样判断顾客的真正需要。我本来准备了很多漂亮的答案，后来决定诚实地说：“我经验不多，不过学习能力强，也愿意与团队沟通。”经理听完没有马上表示意见，只安排我做一份临时任务。我准时完成以后，还主动留下来帮助另外一位应聘者检查材料。

回家路上，我感觉自己可能没有信心面对结果。第二天，公司却通知我正式上班。经理说，收入和知识都能慢慢增加，诚实、负责和准时更难得。他还提醒我，不管与同事合作，还是跟顾客约会，都要先听清问题再回答。

这次面试改变了我的看法：真正的专业不只是会说，而是有判断、有责任，能在团队中认真沟通。咱们只要做好准备，也敢承认不足，就会得到成长的机会。`,
    [ext('面试', 'miànshì', 'phỏng vấn', 'danh từ/động từ'), ext('团队', 'tuánduì', 'đội nhóm', 'danh từ'), ext('沟通', 'gōutōng', 'trao đổi, giao tiếp', 'động từ')],
    'Điều gì khiến giám đốc quyết định tuyển nhân vật?',
    'Sự trung thực, đúng giờ, có trách nhiệm và khả năng hợp tác, giao tiếp trong đội nhóm.'
  ),
  4: courseLesson(
    4, 'Đừng quá vội kiếm tiền', '不要太着急赚钱', '🌱',
    'Khởi nghiệp, tích lũy kinh nghiệm và thái độ có trách nhiệm với kế hoạch.',
    `《不要太着急赚钱》
大学毕业时，我和朋友谈起创业。我以为只要有一份计划，开店就能马上赚很多钱，甚至想提前租下市中心最贵的房子。父亲听后没有直接反对，只提了三个问题：顾客是谁？成本多少？谁能保证生意顺利？我一个也回答不完整。

于是我按照他的建议，先用两个月做市场调查。原来附近已经有很多同类商店，顾客真正需要的并不是漂亮广告，而是稳定的质量和服务。我重新整理计划，并找有经验的店主交流。为了积累知识，我不得不从最普通的工作做起：按时进货、记录每一笔收入、提醒伙伴别把仓库放乱，还要认真处理每条消息。

半年后，我们终于开了一家小店。开始时工资不高，也没有奖金，可大家明确各自的责任，并找到合作的方法。一位老顾客说，成功不是运气，而是把一切小事做好。听到这句话，我完全明白了父亲的意思。

创业有风险，当然希望赚钱，但不能只看眼前。感谢那段慢下来的时间，让我学会调查、计划与合作。只要每一步都负责任，机会来时才可能顺利抓住，而真正的成功也会更长久。`,
    [ext('创业', 'chuàngyè', 'khởi nghiệp', 'động từ'), ext('风险', 'fēngxiǎn', 'rủi ro', 'danh từ'), ext('合作', 'hézuò', 'hợp tác', 'động từ')],
    'Nhân vật đã thay đổi kế hoạch khởi nghiệp như thế nào?',
    'Nhân vật điều tra thị trường, tích lũy kinh nghiệm, chia rõ trách nhiệm và làm từng bước thay vì vội kiếm tiền.'
  ),
  5: courseLesson(
    5, 'Chỉ mua đồ phù hợp, không mua đồ đắt', '只买对的，不买贵的', '🛒',
    'Mua sắm lý trí, cân đối giá cả, chất lượng và nhu cầu thực tế.',
    `《只买对的，不买贵的》
搬家以后，我邀请姐姐一起逛家具店。我先看中一套流行的沙发，广告里的样子像艺术品，价格也高得吓人。售货员说今天打折，还送一台制冷效果很好的空调。我正想付现金，姐姐却让我先考虑实际需要。

她问：“对你这个年龄的人来说，经常搬家，家具是不是应该轻一点儿？任何赠品都会用到吗？”我这才发现，昂贵沙发虽然受到很多顾客欢迎，质量却不一定适合我的小客厅。那台空调实在太大，用起来还浪费电。我们顺便比较了材料、售后和耐用标准，又计算了每月预算。

最后，我买了一张价格普通但坐着舒服的沙发。它最大的优点是容易清洁，颜色也跟房间很配。尤其重要的是，我没有因为“免费”和“流行”而超出预算。回家路上，姐姐买了一串葡萄，我们边吃边谈购物经验，连葡萄的味道都比平时更甜。

理性消费不是只选便宜的，也不是肯定贵的就好。真正会购物的人懂得在价格、质量和生活之间找到平衡：不被广告带着走，不为没有用的东西浪费钱，只买适合自己的耐用品。`,
    [ext('理性', 'lǐxìng', 'lý trí', 'tính từ'), ext('预算', 'yùsuàn', 'ngân sách', 'danh từ'), ext('耐用', 'nàiyòng', 'bền, dùng được lâu', 'tính từ')],
    'Theo bài đọc, mua sắm lý trí là gì?',
    'Là cân nhắc nhu cầu thực tế, ngân sách, chất lượng và độ bền thay vì chạy theo giá cao, quảng cáo hay trào lưu.'
  ),
  6: courseLesson(
    6, 'Tiền nào của nấy', '一分钱一分货', '🏷️',
    'Giá trị hàng hóa, quyền lợi người tiêu dùng và dịch vụ sau bán hàng.',
    `《一分钱一分货》
社区举行了一场消费体验活动，各家商店都带来商品。入口处，一位售货员递给我免费果汁，还说会员卡能让所有商品降低百分之二十。我本来只想买袜子，没想到一双普通袜子的价格竟然是网上的两倍，便问他是否打扰了标价。

售货员耐心解释，便宜产品和这双袜子在材料、重量、皮肤安全等方面不同。例如，这双更轻，穿久了不会让皮肤难受，而且一年内提供免费修理和更换。为了证明质量，他让我亲手尝试拉一拉布料。旁边还有西红柿和果汁的品尝区，我尝过以后发现，新鲜程度也会影响价格。

活动内还有一场书店举办的小说分享会，报名人数已经满了，其中不少人是老会员。作家举例说：“一分钱一分货不是叫大家买最贵的，而是比较付出和获得。”如果商家只提高价格却不说明情况，就不值得支持；如果质量和售后确实更好，合理消费也能鼓励好产品。

我最后选择了那双袜子，并认真保存会员卡。消费时，价格当然重要，但不能只看一个数字。了解商品、比较选择、确认售后，才能判断多花的钱有没有真正的好处。`,
    [ext('消费', 'xiāofèi', 'tiêu dùng', 'danh từ/động từ'), ext('选择', 'xuǎnzé', 'lựa chọn', 'danh từ/động từ'), ext('售后', 'shòuhòu', 'dịch vụ sau bán hàng', 'danh từ')],
    'Vì sao nhân vật cuối cùng mua đôi tất có giá cao hơn?',
    'Vì sau khi so sánh, nhân vật thấy chất liệu, độ an toàn và dịch vụ sau bán hàng tương xứng với mức giá.'
  ),
  7: courseLesson(
    7, 'Bác sĩ tốt nhất là chính mình', '最好的医生是自己', '🩺',
    'Thói quen lành mạnh, phòng bệnh và trách nhiệm với sức khỏe bản thân.',
    `《最好的医生是自己》
我在一所大学工作，办公室的窗户常年关着，空气不好。以前我每天加班，吃饭没规律，还觉得抽烟的动作很帅。后来我开始咳嗽，有一次跑步时鼻子突然流血，肚子也很难受，才后悔没有早点关心健康。

我赶到医院时差点儿来不及挂号。大夫估计问题还不严重，却明确反对我继续抽烟。他提到一项研究：每天散步超过三十分钟，多吃植物类食物，能让人的精神更好。屏幕上的数字也说明，长期缺少运动会增加很多健康烦恼。

回家后，我给自己定下规律：早睡，按时吃饭，工作一小时就站起来做几个动作。要是天气和气候合适，我就出去散步；下雨时便在家运动。我不再为了减肥而不吃饭，也不因工作辛苦就掉进坏习惯里。朋友说我气色好了，又开玩笑说我比以前更帅。

教授告诉我们，医生可以治疗已经出现的问题，最好的预防却来自自己。健康不只是一份检查结果，它还影响感情、工作和生活。只要认真管理习惯，我们每个人都能成为照顾自己的那位“大夫”。`,
    [ext('健康', 'jiànkāng', 'sức khỏe; khỏe mạnh', 'danh từ/tính từ'), ext('习惯', 'xíguàn', 'thói quen', 'danh từ'), ext('规律', 'guīlǜ', 'đều đặn, có quy luật', 'tính từ/danh từ')],
    'Nhân vật đã hình thành những thói quen mới nào?',
    'Ngủ và ăn đúng giờ, vận động định kỳ, đi bộ khi thời tiết phù hợp và bỏ thuốc lá.'
  ),
  8: courseLesson(
    8, 'Cuộc sống không thiếu cái đẹp', '生活中不缺少美', '🌤️',
    'Quan sát cuộc sống bằng thái độ tích cực và biết trân trọng vẻ đẹp bình dị.',
    `《生活中不缺少美》
一次去大使馆办事，我遇上严重堵车。出租车师傅告诉我，前面的距离不远，走路反而更快。我下车时心情很差，压力也很大，觉得这一天不会愉快。没想到阳光刚从云后出来，街边的景色立刻使我慢慢放松。

我开始观察周围：一位老人耐心给游客指路，一个孩子把巧克力分给伤心的同伴，几名年轻人主动帮助陌生人。这样的事情到处都在发生，只是我们往往走得太快，没有注意。科学研究证明，积极观察生活的人更容易感到幸福，也更能保护自己的心理和生命状态。

办完事后，我去看亲戚。她最近失去工作，却没有成为只会抱怨的人。她说，只要改变看问题的态度，压力也能成为重新出发的力量。她带我去公园欣赏傍晚景色，我们谈起过去的回忆，发现普通日子里一直有值得开心的特点。

因此，美并不只在著名风景里。一次友好的帮助、一束温暖的阳光、一段愿意倾听的时间，都可能改变心情。生活从来不缺少美，缺少的是停下来观察、欣赏并保持乐观的眼睛。`,
    [ext('观察', 'guānchá', 'quan sát', 'động từ'), ext('欣赏', 'xīnshǎng', 'thưởng thức, ngắm nhìn', 'động từ'), ext('乐观', 'lạc quan', 'tính từ')],
    'Điều gì khiến tâm trạng nhân vật thay đổi trong ngày bị tắc đường?',
    'Việc chậm lại quan sát ánh nắng, cảnh vật và những hành động tử tế bình thường xung quanh.'
  ),
  9: courseLesson(
    9, 'Ánh nắng luôn sau mưa gió', '阳光总在风雨后', '🏆',
    'Kiên trì trước thất bại, rút kinh nghiệm và trưởng thành qua thử thách.',
    `《阳光总在风雨后》
我小时候的理想是成为职业网球运动员。第一次参加国际青少年比赛时，我以为自己一定能赢，还随便给朋友买了饼干庆祝。可是比赛刚开始，我就紧张得满头是汗，连最简单的球都没接住，结果很快失败了。

当时我觉得很没面子，甚至想放弃。教练却问：“一次失败难道就能决定你的一生吗？你得学会面对它。”他让我取出训练日记，把整个过程写成一篇总结。通过记录，我发现自己有许多问题：体力不够、主意常变、面对关键球不够勇敢，也没有坚持正确的方法。

之后的至少半年，我每天练习。累的时候，我告诉自己暂时休息不等于放弃；输的时候，我认真比较失败和错误的区别。这个过程一点儿也不轻松，却让我学会把大目标分成每天的小挑战。后来我没有成为国际冠军，却在大学当了网球教练，还把这段经历写成故事。

一位作家读后说，成长不是从来不失败，而是失败以后仍敢选择正确的方向。现在我的目标是帮助年轻队员坚持训练，也让他们明白：只要不停止总结和行动，风雨之后总能看见属于自己的阳光。`,
    [ext('目标', 'mùbiāo', 'mục tiêu', 'danh từ'), ext('挑战', 'tiǎozhàn', 'thử thách', 'danh từ/động từ'), ext('成长', 'chéngzhǎng', 'trưởng thành', 'động từ')],
    'Thất bại đầu tiên đã giúp nhân vật thay đổi thế nào?',
    'Nhân vật học cách ghi chép, tổng kết vấn đề, chia nhỏ mục tiêu và kiên trì bằng phương pháp đúng.'
  ),
  10: courseLesson(
    10, 'Tiêu chuẩn của hạnh phúc', '幸福的标准', '🧭',
    'Lựa chọn nghề nghiệp, giá trị sống và cách tự xác định hạnh phúc.',
    `《幸福的标准》
礼拜天有空儿，我陪母亲去公园。她问我硕士毕业后想做什么。我说自己喜欢语言，希望成为翻译，不过亲戚们建议我去经济条件好的公司，因为收入高，看起来更容易变富。母亲让我等一等，没有马上给答案，只拉着我在长椅上坐下。

她说，优秀的职业没有统一标准，关键在于是否适合自己的方向。有人希望将来管理大公司，有人愿意在学校发展，有人收入不高却确实觉得工作有价值。富不只表示钱多，穷也不等于没有幸福。由于每个人的条件和责任不同，选择当然不会完全一样。

回家后，我躺在床上想了很久，困了仍睡不着。桌上放着小时候用过的橡皮和母亲给的一颗糖，它们让我想起学习语言时最单纯的兴奋。我开始列出三项标准：能不断成长，能帮助别人，还能与生活保持平衡。只看工资高低，永远找不到真正适合自己的答案。

第二天，我接受了一家文化机构的翻译工作。它的收入普通，却给我学习和发展的空间。母亲说，比如鞋子，别人觉得漂亮的不一定合脚；职业也是如此。幸福没有唯一标准，努力走在自己认同的方向上，就是一种踏实的幸福。`,
    [ext('选择', 'xuǎnzé', 'lựa chọn', 'danh từ/động từ'), ext('价值', 'jiàzhí', 'giá trị', 'danh từ'), ext('平衡', 'pínghéng', 'cân bằng', 'danh từ/động từ')],
    'Nhân vật dùng ba tiêu chuẩn nào để chọn nghề?',
    'Có thể tiếp tục trưởng thành, giúp đỡ người khác và giữ cân bằng với cuộc sống.'
  )
});

Object.assign(LESSONS, {
  11: courseLesson(
    11, 'Đọc sách tốt, đọc sách hay, ham đọc sách', '读书好，读好书，好读书', '📚',
    'Thói quen đọc, phương pháp hiểu bài và năng lực suy nghĩ độc lập.',
    `《读书好，读好书，好读书》
刚学汉语时，我说得不流利，语法也不准确，连简单词语都常常用错。老师建议我每天阅读，可我总说作业太多，以后还来得及。一次填空考试，我看不懂题目，只好随便猜，结果错了一半。老师说：“阅读要成为习惯，否则学过的内容很快就会忘。”

我从客厅书架上的一本杂志开始。第一篇文章只有两页，讲一位著名科学家的故事。开始我觉得句子复杂，无论遇到什么生词都马上查，读一页要很久。后来老师教我先看标题，再按顺序理解段落，猜词语在上下文中的意思，最后才查重要的词。

一个月后，我的阅读量明显增加，也养成了每天二十分钟读书的习惯。我发现读书不仅帮助记忆词语，同时训练理解和思考。同学们对相同文章常有不同看法，这表示阅读没有唯一感受。然而，观点可以不同，判断必须以文章内容为基础。

现在我能比较流利地介绍一本书，也越来越喜欢精彩的故事。读书之所以厉害，不只是给我们答案，还让我们学会提出问题。读好书需要方法，好读书需要坚持，而真正的收获是在一页页阅读中形成自己的理解。`,
    [ext('理解', 'lǐjiě', 'hiểu, lý giải', 'động từ'), ext('记忆', 'jìyì', 'ghi nhớ, ký ức', 'danh từ/động từ'), ext('思考', 'sīkǎo', 'suy nghĩ', 'động từ')],
    'Phương pháp đọc mới của nhân vật gồm những bước nào?',
    'Xem tiêu đề, đọc đoạn theo thứ tự, đoán nghĩa trong ngữ cảnh rồi mới tra những từ quan trọng.'
  ),
  12: courseLesson(
    12, 'Dùng tâm để khám phá thế giới', '用心发现世界', '🔎',
    'Lắng nghe, giải thích rõ và dùng ngôn ngữ có trách nhiệm để tránh hiểu lầm.',
    `《用心发现世界》
学校规定每班完成一项“保护一片叶子”的任务。老师把同学分组，并且要求大家全部参加。小明觉得一片快死的叶子没有作用，直接把它扔了。小雨很生气，认为他故意破坏活动。两个人无法继续合作，差点儿引起更大的误会。

老师没有马上批评谁，而是让他们仔细解释。原来小明只是想把坏叶子换掉，却没有先商量；小雨也许太着急，没有详细询问。老师说，对于同一件事，每个人看到的部分不同。语言可以帮助交流，可惜表达不清也会让友好的愿望变成冲突。

后来他们重新设计实验：每节课给植物浇一勺子水，记录温度，并比较加盐和不加盐的情况。大家节约材料，合理使用工具，既省力气又达到教育目的。相反，如果只照规定做而不理解原因，再简单的任务也可能事倍功半；先倾听、再沟通，往往能事半功倍。

活动结束时，小明主动道歉，小雨也提出自己的意见。两人明白，发现世界不只靠眼睛，还要用心尊重别人。面对不同看法，先保护对方表达的机会，再一起寻找事实，才是有效沟通的方法。`,
    [ext('尊重', 'zūnzhòng', 'tôn trọng', 'động từ'), ext('倾听', 'qīngtīng', 'lắng nghe', 'động từ'), ext('沟通', 'gōutōng', 'trao đổi, giao tiếp', 'động từ')],
    'Hai học sinh đã giải quyết hiểu lầm bằng cách nào?',
    'Họ lần lượt giải thích, lắng nghe, xin lỗi và cùng thiết kế lại nhiệm vụ dựa trên sự thật.'
  ),
  13: courseLesson(
    13, 'Uống trà xem Kinh kịch', '喝着茶看京剧', '🎭',
    'Nghệ thuật Kinh kịch, trải nghiệm văn hóa và sức sống của truyền thống.',
    `《喝着茶看京剧》
朋友邀请我去茶馆看京剧。我对这种传统艺术基础不多，只在互联网看过一次短视频，所以出发前大概以为自己会听不懂。餐厅式的大厅里坐满观众，桌上有热茶和点心，厚厚的节目单装在纸袋里，气氛很有趣。

演出由一群年轻演员表演。他们的服装和动作来自传统舞台，声音却配合现代灯光。第一段结束后，主持人带大家进行讨论，并说明每个颜色代表的性格。我偶尔听不懂唱词，但看了几遍动作，便能判断人物关系。一个演员还走到观众中间，近距离展示怎样用眼神讲故事，大家都很吃惊。

演出大约两个小时。正常的剧场要求观众安静，这里却允许大家轻声交流。旁边一位老人告诉我，他年轻时申请进入京剧学校，虽然没有成为演员，却继续看了四十多年。他说，即使开始的理解有错误也没关系，京剧的魅力不只在唱得高，而在每个动作都有文化内容。

随着互联网发展，越来越多年轻人从短视频认识京剧，再走进剧场欣赏完整表演。喝着茶看京剧让我很开心，也让我明白：传统不是放在博物馆里的旧东西，而是由每一代人继续理解和创造的生活艺术。`,
    [ext('传统', 'chuántǒng', 'truyền thống', 'danh từ/tính từ'), ext('文化', 'wénhuà', 'văn hóa', 'danh từ'), ext('魅力', 'mèilì', 'sức hấp dẫn', 'danh từ')],
    'Điều gì giúp nhân vật dần hiểu và thích Kinh kịch?',
    'Phần giải thích, động tác biểu diễn, trao đổi với khán giả và câu chuyện của người xem lâu năm.'
  ),
  14: courseLesson(
    14, 'Bảo vệ Mẹ Trái Đất', '保护地球母亲', '🌍',
    'Thói quen bảo vệ môi trường trong chuyến đi và cuộc sống hằng ngày.',
    `《保护地球母亲》
上个月我去海边出差，乘坐的火车因为大雨停了两个小时。到酒店后，我发现卫生间里有一次性毛巾、牙膏和好几个空塑料盒。行李已经很重，我本想把不用的东西全扔进垃圾桶，服务员却提醒我，减少垃圾比事后处理污染更重要。

第二天，我们参观环保中心。工作人员说，地球温度上升的速度正在加快，各省每年丢掉的塑料袋数量也很大。既然知道问题严重，就不能以“一个人改变不了什么”为理由拒绝行动。于是我开始带自己的水杯和毛巾，购物时也不要塑料袋。

同行的人笑我做这些小事太得意。我抱歉地解释，目的不是表扬自己，而是鼓励更多人参加。我们还把海滩上又脏又空的瓶子捡进分类垃圾桶。太阳出来后，沙滩变暖，清理过的海岸显得特别美丽。那一刻，大家都觉得弯腰捡垃圾完全行。

环保不是一句大口号，而是每天的习惯：少用一个盒，少扔一只袋，以安全速度乘坐公共交通，节省每一份资源。个人力量虽然有限，许多选择加在一起，就能让美丽地球少一点负担。`,
    [ext('环保', 'huánbǎo', 'bảo vệ môi trường', 'danh từ/tính từ'), ext('资源', 'zīyuán', 'tài nguyên', 'danh từ'), ext('习惯', 'xíguàn', 'thói quen', 'danh từ')],
    'Sau chuyến công tác, nhân vật thay đổi những thói quen nào?',
    'Mang cốc và khăn riêng, từ chối túi nhựa, phân loại rác và ưu tiên phương tiện công cộng.'
  ),
  15: courseLesson(
    15, 'Nghệ thuật giáo dục trẻ', '教育孩子的艺术', '👨‍👩‍👧',
    'Kiên nhẫn, đồng hành và hướng dẫn trẻ thay vì chỉ trích hoặc lừa dối.',
    `《教育孩子的艺术》
寒假，我帮哥哥照顾他的孙子小乐。第一天早晨，闹钟响了三遍，他才醒，来不及赶去弹钢琴。父亲很生气，批评他又懒又笨，还怀疑他故意关掉闹钟。小乐低着头，很害羞，一句话也不说。

下午，我敲门提醒他出发时，他却在厕所门口摔了一跤，胳膊破了。护士给他打针时表扬他很勇敢。我这才想起来，儿童面对问题时，也需要先被理解。我没有骗他说打针不疼，而是耐心告诉他会有什么感觉，并陪伴他完成。回家后，我们一起整理房间，发现闹钟原来坏了，不是他故意弄坏的。

我和哥哥商量新的管理方法：千万别用“笨”“粗心”给孩子下结论；先问原因，再引导他自己安排时间。小乐每天晚上把琴谱、衣服整理好，早上提前十分钟起床。两个星期左右，他不但没有迟到，还在家庭演出中弹得很棒。大家的表扬让他更自信，却没有因此骄傲。

教育不是父母替孩子做所有选择，也不是用假的承诺让他听话。合适的引导需要耐心和陪伴：允许孩子犯错，帮助他理解责任，再给他改正的机会。被尊重的孩子，更愿意学会尊重别人。`,
    [ext('耐心', 'nàixīn', 'kiên nhẫn', 'danh từ/tính từ'), ext('陪伴', 'péibàn', 'đồng hành, ở bên', 'động từ'), ext('引导', 'yǐndǎo', 'hướng dẫn, dẫn dắt', 'động từ')],
    'Người lớn đã đổi cách giáo dục Tiểu Lạc như thế nào?',
    'Họ ngừng dán nhãn và chỉ trích, tìm nguyên nhân, kiên nhẫn đồng hành rồi hướng dẫn em tự sắp xếp thời gian.'
  ),
  16: courseLesson(
    16, 'Cuộc sống có thể tốt đẹp hơn', '生活可以更美好', '🌟',
    'Chuẩn bị hồ sơ, nắm bắt cơ hội và tự tin khi tham gia hoạt động xã hội.',
    `《生活可以更美好》
学校招募志愿者去郊区参观科技中心，我马上报名。申请表格要求填写护照号码、传真和签证情况，我却因为马虎漏了一项。负责老师说材料恐怕不合格，我听后非常失望，甚至怀疑自己到底适不适合参加。

一位博士看见我站在门口，推来一把椅子，请我重新检查。他说：“拿准备材料来说，重点不是速度，而是认真。犯错并不可怕，要敢发现并改正。”我补好表格后主动向老师道歉，老师原谅了我，还给了我代表学校发言的机会。

参观当天，我先预习了参观重点。一名记者采访我们，面对镜头，我可紧张了。旁边的小伙子导游很有礼貌，悄悄提醒我先深呼吸，还说：“你准备得不错呀！”我鼓起自信，介绍志愿者怎样帮助老人学习手机。记者听完很激动，说科技如果有人情味，就能让生活更方便。

回程时，我把工作牌挂在书桌前。它提醒我，机会常常藏在挑战后面。准备可以减少马虎，自信让人敢迈出第一步，同情与礼貌则让能力真正帮助别人。生活不会自动变美好，但我们可以从认真完成一张表格、友好帮助一个人开始改变。`,
    [ext('机会', 'jīhuì', 'cơ hội', 'danh từ'), ext('准备', 'zhǔnbèi', 'chuẩn bị', 'danh từ/động từ'), ext('挑战', 'tiǎozhàn', 'thử thách', 'danh từ/động từ')],
    'Nhân vật học được gì từ lỗi điền thiếu hồ sơ?',
    'Sai sót có thể sửa bằng chuẩn bị kỹ; tự tin và dám đối mặt thử thách sẽ biến nó thành cơ hội.'
  ),
  17: courseLesson(
    17, 'Con người và thiên nhiên', '人与自然', '🌲',
    'Hệ sinh thái, du lịch có trách nhiệm và sự hài hòa giữa con người với tự nhiên.',
    `《人与自然》
放暑假时，我参加了一趟自然营。城市很热闹，山里的森林却很凉快。入口处游客排队听广播，导游严格要求大家不能乱丢东西，也不能为了拍照去抱小动物。有人觉得规定太多，我倒认为这是对生命的尊重。

我们走了十几公里，云越来越低，空气也从干热变得暖和湿润。路上看见一只毛色漂亮的老虎模型，几个活泼的孩子吓得大叫。导游解释，真正的老虎生活在森林深处，数量只剩很少。它们不是为了同人类竞争而存在，每种动物都在生态系统里有自己的位置。

晚上，我们把白天照的照片按时间排列。有同学难受地说，海洋底的塑料垃圾可能比这里更多，传说中的美人鱼如果存在，也会失去美丽的家。大家于是讨论怎样减少旅行垃圾，并决定把剩下的食物带走，不留在山里。

回城以后，我仍然常梦见那片森林。人与自然的关系不该只是参观和使用，而应是尊重与和谐。社会发展需要资源，但真正长久的竞争力，来自保护森林、海洋和所有生命，让未来的人仍能听见云下的鸟声。`,
    [ext('生态', 'shēngtài', 'sinh thái', 'danh từ'), ext('尊重', 'zūnzhòng', 'tôn trọng', 'động từ'), ext('和谐', 'héxié', 'hài hòa', 'tính từ')],
    'Trại thiên nhiên đã giúp các học sinh hiểu điều gì?',
    'Mỗi loài có vai trò trong hệ sinh thái; du lịch và phát triển phải tôn trọng, bảo vệ thiên nhiên lâu dài.'
  ),
  18: courseLesson(
    18, 'Công nghệ và thế giới', '科技与世界', '📱',
    'Tiện ích công nghệ, an toàn thông tin và cách sử dụng có trách nhiệm.',
    `《科技与世界》
飞机降落后，我打开手机查看交通信息。一个网站告诉我，去酒店要经过一座桥，只需二十分钟。我没有检查地址是否准确，就按导航出发。走了几百米，地图突然失去信号，我在陌生地点迷路，热得有点儿受不了。

一位警察走来，先让我举起手机查看页面，接着指出那是上个世纪的旧信息。他提醒我，公共网站允许任何人阅读，但付款密码、家庭地址和私人日记必须注意安全。有人会利用假消息抓住用户着急的心理，危险有时并不是一团看得见的火。

警察带我到附近邮局。旁边餐厅的汤太咸，我只用手机付了一瓶矿泉水。我又买了信封，给一位不会上网的老人寄信。两种方式放在一起，让我想到一位作者的话：技术的价值不在于完全代替旧生活，而在于给不同的人更多选择。除此以外，创新也要保护隐私。

后来我把正确地点收进收藏，并设置了更安全的密码。智慧交通一秒就能提供路线，手机一座小小的屏幕也能连接世界；可是再便利的工具，也需要人的判断。我们把负责任的技术叫作进步，因为它既提高效率，也保护使用者的安全和尊严。`,
    [ext('创新', 'chuàngxīn', 'đổi mới, sáng tạo', 'danh từ/động từ'), ext('便利', 'biànlì', 'tiện lợi', 'tính từ/danh từ'), ext('隐私', 'yǐnsī', 'quyền riêng tư', 'danh từ')],
    'Vì sao nhân vật bị lạc và sau đó thay đổi cách dùng công nghệ?',
    'Nhân vật tin dữ liệu cũ mà không kiểm tra; sau đó biết xác minh thông tin, bảo vệ mật khẩu và quyền riêng tư.'
  ),
  19: courseLesson(
    19, 'Hương vị cuộc sống', '生活的味道', '🥟',
    'Thích nghi với cuộc sống mới qua việc nhà, giao tiếp và những phép lịch sự hằng ngày.',
    `《生活的味道》
新学期，我租了一间小房子。房东是一位会说功夫故事的老人，第一次见面就跟我打招呼，还问我的出生日期、性别和国籍。我刚想回答，电话却占线，厨房里又传来争吵声。原来两个留学生为了谁用最后一个座位吵起来了。

我主动道歉，请大家先坐下吃饭。桌上有饺子、包子，还有一把切水果的刀。一个盘子破了，我抬胳膊去拿时，眼镜差点儿掉进汤里，大家终于笑了。饭后，我们商量生活礼节：使用厨房后要收拾，晚上禁止大声放音乐，谁有零钱就先帮忙买日常用品。

第二天，我去理发，回来时脱下外套，发现门口贴着舞蹈活动通知。谁都可以报名，场地还能打乒乓球和羽毛球。我戴上眼镜打印材料，又复印了几份给室友。房东听说后很高兴，把空客厅转成小活动室。

总的来说，适应新生活不在于什么都不出错，而在于出错后愿意沟通。不同国籍的人住在一起，礼貌不是沉默，也不是只守自己的习惯；它是及时道歉、互相帮助，让普通日子慢慢有家的味道。`,
    [ext('日常', 'rìcháng', 'hằng ngày, thường nhật', 'tính từ/danh từ'), ext('礼节', 'lǐjié', 'lễ tiết, phép lịch sự', 'danh từ'), ext('适应', 'shìyìng', 'thích nghi', 'động từ')],
    'Các bạn cùng nhà đã làm gì để sống hòa thuận hơn?',
    'Họ cùng thống nhất phép sinh hoạt, chia sẻ việc nhà, giao tiếp, xin lỗi và tổ chức hoạt động chung.'
  ),
  20: courseLesson(
    20, 'Phong cảnh trên đường', '路上的风景', '✈️',
    'Trải nghiệm du lịch, giao tiếp văn hóa và những ký ức trên hành trình.',
    `《路上的风景》
去首都旅行那天，航班突然推迟。我收拾好行李，拿着登机牌坐在大厅，心里觉得很怪。广播说高速公路出了问题，工作人员还在加油站附近处理。对面一位打扮朴素的老人找不到钥匙，急得说自己真可怜，我便帮他一起找。

我们找着找着，老人忽然笑了起来：钥匙一直挂在包上。大家听了这个小笑话，也不再抱怨。飞机一降落，我就和老人出发去市中心。他普通话不太标准，却愿意和我对话，介绍当地民族、街边小吃以及哪家烤鸭最香。

午饭时，桌上有酸汤、辣菜和烤鸭。老人祝贺我第一次独自旅行，还举杯说“干杯”。我也祝贺他的孙女考试合格。他问我究竟为什么来这里，我说想看看书本以外的世界，把新鲜见闻存进记忆。饭后，我们在门外一棵老树下拍照，约定回家后互寄照片。

说起这段体验，我记得的不只是著名景点。航班推迟让陌生人开始交谈，一把钥匙变成共同回忆，一碗汤也让我理解不同地方的味道。路上的风景既在窗外，也在人与人的相遇里；愿意慢下来听故事，普通旅程也会变得丰富。`,
    [ext('见闻', 'jiànwén', 'điều tai nghe mắt thấy', 'danh từ'), ext('体验', 'tǐyàn', 'trải nghiệm', 'danh từ/động từ'), ext('回忆', 'huíyì', 'hồi ức; hồi tưởng', 'danh từ/động từ')],
    'Nhân vật nhớ nhất điều gì trong chuyến đi?',
    'Không chỉ là cảnh nổi tiếng mà còn là cuộc gặp, câu chuyện, món ăn và ký ức chung với người lạ trên đường.'
  )
});

const FUNCTION_WORDS = new Map([
  ['不仅', 'liên từ'], ['即使', 'liên từ'], ['而', 'liên từ'], ['从来', 'phó từ'],
  ['刚', 'phó từ'], ['最好', 'phó từ'], ['互相', 'phó từ']
]);

function cleanPinyin(value = '') {
  return String(value).replace(/\s*\[[^\]]*\]\s*$/, '').trim();
}

function wordSource(hanzi) {
  if (MANUAL_WORDS[hanzi]) return MANUAL_WORDS[hanzi];
  return HSK4_WORDS.find(item => item.hanzi === hanzi)
    || ALL_WORDS.find(item => item.hanzi === hanzi)
    || null;
}

function createVocabularyItem(hanzi, lessonId, index) {
  const source = wordSource(hanzi);
  if (!source) throw new Error(`Không tìm thấy dữ liệu từ “${hanzi}” ở HSK4 bài ${lessonId}.`);
  const sourceExample = source.examples?.[0] || {};
  return {
    id: `hsk4-l${String(lessonId).padStart(2, '0')}-w${String(index + 1).padStart(2, '0')}`,
    hanzi,
    pinyin: cleanPinyin(source.pinyin),
    meaning: source.meaning_vi || source.meaning || '',
    ...(source.partOfSpeech || FUNCTION_WORDS.get(hanzi) ? { partOfSpeech: source.partOfSpeech || FUNCTION_WORDS.get(hanzi) } : {}),
    example: source.example || sourceExample.hanzi || '',
    examplePinyin: source.examplePinyin || sourceExample.pinyin || '',
    exampleTranslation: source.exampleTranslation || sourceExample.translation || '',
    ...(source.note ? { note: source.note } : {}),
    audio: `vocab/${String(index + 1).padStart(2, '0')}.mp3`
  };
}

function createExtendedVocabularyItem(item, lessonId, index, reading) {
  const example = item.example || String(reading)
    .split(/(?<=[。！？])/u)
    .map(sentence => sentence.trim())
    .find(sentence => sentence.includes(item.hanzi)) || '';
  return {
    id: `hsk4-l${String(lessonId).padStart(2, '0')}-ext${String(index + 1).padStart(2, '0')}`,
    tag: 'mở rộng',
    ...item,
    example
  };
}

function segmentReading(text, vocabulary, extendedVocabulary) {
  const lookupMap = new Map();
  const addLookupItem = (item, isPrimary = false) => {
    const hanzi = item.hanzi;
    const pinyin = cleanPinyin(item.pinyin);
    const meaning = item.meaning || item.meaning_vi || '';
    if (!hanzi || !pinyin || !meaning || !/[\u3400-\u9fff]/u.test(hanzi)) return;
    if (!isPrimary && lookupMap.has(hanzi)) return;
    lookupMap.set(hanzi, {
      hanzi,
      pinyin,
      meaning,
      partOfSpeech: item.partOfSpeech || FUNCTION_WORDS.get(hanzi) || '',
      note: item.note || (isPrimary ? '' : 'Từ/cụm từ tra cứu bổ sung từ dữ liệu chung.'),
      vocabularyId: item.id || '',
      isPrimary
    });
  };

  ALL_WORDS.forEach(item => addLookupItem(item));
  HSK4_WORDS.forEach(item => addLookupItem(item));
  [...vocabulary, ...extendedVocabulary].forEach(item => addLookupItem(item, true));

  const termsByFirstCharacter = new Map();
  for (const item of lookupMap.values()) {
    const first = item.hanzi[0];
    if (!termsByFirstCharacter.has(first)) termsByFirstCharacter.set(first, []);
    termsByFirstCharacter.get(first).push(item);
  }
  termsByFirstCharacter.forEach(items => items.sort((a, b) => b.hanzi.length - a.hanzi.length));

  const segments = [];
  let plain = '';
  let cursor = 0;

  const flushPlain = () => {
    if (!plain) return;
    segments.push({ text: plain, clickable: false });
    plain = '';
  };

  while (cursor < text.length) {
    const candidates = termsByFirstCharacter.get(text[cursor]) || [];
    const match = candidates.find(item => {
      if (!text.startsWith(item.hanzi, cursor)) return false;
      if (item.isPrimary || item.hanzi.length === 1) return true;
      for (let offset = 1; offset < item.hanzi.length; offset += 1) {
        const overlappingPrimary = [...vocabulary, ...extendedVocabulary]
          .some(primary => text.startsWith(primary.hanzi, cursor + offset));
        if (overlappingPrimary) return false;
      }
      return true;
    });
    if (!match) {
      plain += text[cursor];
      cursor += 1;
      continue;
    }

    flushPlain();
    segments.push({
      text: match.hanzi,
      pinyin: match.pinyin || '',
      meaning: match.meaning || '',
      partOfSpeech: match.partOfSpeech || '',
      note: match.note || '',
      vocabularyId: match.vocabularyId,
      clickable: true
    });
    cursor += match.hanzi.length;
  }

  flushPlain();
  return segments;
}

function createExercises(lesson, vocabulary) {
  const first = vocabulary[0];
  const distractors = vocabulary.slice(1).map(item => item.meaning).filter(Boolean).slice(0, 3);
  const firstExample = first.example || `我正在学习“${first.hanzi}”这个词。`;
  const firstTranslation = first.exampleTranslation || `Tôi đang học từ “${first.hanzi}”.`;
  const firstGrammar = lesson.grammar[0];
  const grammarOptions = lesson.grammar.slice(0, 4).map(item => item.pattern);
  const readingSentence = lesson.reading
    .split(/(?<=[。！？])/u)
    .map(sentence => sentence.trim())
    .find(sentence => sentence && !sentence.startsWith('《')) || lesson.chineseTitle;
  const orderParts = readingSentence.split('，').filter(Boolean);
  const orderedAnswer = orderParts.join('，').replace(/[。！？]$/, '');
  const shuffledOrder = orderParts.length > 1
    ? [...orderParts].reverse().map(part => part.replace(/[。！？]$/, '')).join(' / ')
    : [...readingSentence].reverse().join(' / ');
  const blankQuestion = firstExample.includes(first.hanzi)
    ? firstExample.replace(first.hanzi, '___')
    : `请用“${first.hanzi}”填空：我正在学习___这个词。`;
  return [
    {
      type: 'multiple-choice',
      question: `${first.hanzi} nghĩa là gì?`,
      answer: first.meaning,
      options: [first.meaning, ...distractors]
    },
    {
      type: 'multiple-choice',
      question: `Mẫu câu nào thuộc điểm ngữ pháp “${firstGrammar.title.split(' - ')[0]}”?`,
      answer: firstGrammar.pattern,
      options: grammarOptions
    },
    {
      type: 'fill-blank',
      question: `Điền từ “${first.hanzi}” vào chỗ trống: ${blankQuestion}`,
      answer: first.hanzi
    },
    {
      type: 'sentence-order',
      question: `Xếp các phần thành câu theo bài đọc: ${shuffledOrder}`,
      answer: orderedAnswer
    },
    {
      type: 'error-correction',
      question: `Viết lại một câu đúng bằng cấu trúc: ${firstGrammar.pattern}`,
      answer: firstGrammar.examples[0]
    },
    {
      type: 'translation',
      question: `Dịch sang tiếng Việt: ${firstExample}`,
      answer: firstTranslation
    },
    {
      type: 'reading',
      question: lesson.readingQuestion,
      answer: lesson.readingAnswer
    },
    {
      type: 'writing',
      question: `Viết 3-5 câu liên quan đến chủ đề “${lesson.chineseTitle}”, dùng ít nhất hai từ mới của bài.`,
      answer: 'Bài viết cần dùng đúng từ mới và có nội dung mạch lạc.'
    }
  ];
}

function countHanzi(text) {
  return (String(text).match(/[\u3400-\u9fff]/g) || []).length;
}

function buildLesson(lessonId) {
  const source = LESSONS[lessonId];
  const words = WORD_LISTS[lessonId];
  if (!source || !words) throw new Error(`Thiếu cấu hình HSK4 bài ${lessonId}.`);
  if (new Set(words).size !== words.length) throw new Error(`HSK4 bài ${lessonId} có từ chính trùng trong cùng bài.`);
  if (source.extendedVocabulary.length !== 3) throw new Error(`HSK4 bài ${lessonId} phải có đúng 3 từ mở rộng.`);
  if (source.grammar.length !== 5) throw new Error(`HSK4 bài ${lessonId} phải có đúng 5 điểm ngữ pháp.`);
  const hanziCount = countHanzi(source.reading);
  if (hanziCount < 300 || hanziCount > 500) throw new Error(`Bài đọc HSK4 bài ${lessonId} có ${hanziCount} chữ Hán, ngoài khoảng 300–500.`);

  const vocabulary = words.map((hanzi, index) => createVocabularyItem(hanzi, lessonId, index));
  const extendedVocabulary = source.extendedVocabulary.map((item, index) => createExtendedVocabularyItem(item, lessonId, index, source.reading));
  const missingMain = words.filter(hanzi => !source.reading.includes(hanzi));
  const missingExtended = extendedVocabulary.filter(item => !source.reading.includes(item.hanzi)).map(item => item.hanzi);
  if (missingMain.length || missingExtended.length) {
    throw new Error(`Bài ${lessonId} thiếu từ trong bài đọc: ${[...missingMain, ...missingExtended].join('、')}`);
  }

  const segments = segmentReading(source.reading, vocabulary, extendedVocabulary);
  const rebuilt = segments.map(segment => segment.text).join('');
  if (rebuilt !== source.reading) throw new Error(`Phân đoạn bài đọc HSK4 bài ${lessonId} làm thay đổi văn bản.`);
  const clickableHanzi = segments
    .filter(segment => segment.clickable)
    .reduce((total, segment) => total + countHanzi(segment.text), 0);
  const lookupCoveragePercent = Number(((clickableHanzi / hanziCount) * 100).toFixed(1));
  if (lookupCoveragePercent < 85) throw new Error(`Độ phủ tra cứu HSK4 bài ${lessonId} chỉ đạt ${lookupCoveragePercent}%.`);

  return {
    lessonId,
    level: 4,
    title: source.title,
    chineseTitle: source.chineseTitle,
    icon: source.icon,
    xp: 30,
    desc: source.desc,
    meta: {
      estimatedMinutes: 55,
      difficulty: 'HSK4',
      version: 2,
      sourceLesson: source.sourceLesson,
      sourceUsage: 'Đối chiếu phạm vi từ vựng và ngữ pháp; bài đọc, ví dụ và bài tập được biên soạn mới.',
      passThreshold: 89,
      hanziCount
    },
    audio: {
      enabled: false,
      basePath: `assets/audio/hsk4/lesson${String(lessonId).padStart(2, '0')}/`
    },
    learningPath: {
      sections: ['vocabulary', 'extendedVocabulary', 'lessonText', 'grammar', 'exercises']
    },
    vocabulary,
    extendedVocabulary,
    lessonText: [{
      title: source.chineseTitle,
      chinese: source.reading,
      segments
    }],
    grammar: source.grammar.map(item => ({ ...item, source: source.sourceLesson })),
    exercises: createExercises(source, vocabulary),
    quality: {
      mainVocabularyCount: vocabulary.length,
      extendedVocabularyCount: extendedVocabulary.length,
      missingFromReading: [],
      interactiveSegments: segments.filter(segment => segment.clickable).length,
      lookupCoveragePercent,
      copyrightSafe: true
    },
    smartCheck: {
      translationPassPercent: 89,
      ignorePunctuation: true,
      ignoreSpaces: true,
      allowAlternativeAnswers: true
    }
  };
}

function indexEntry(lesson) {
  return {
    lessonId: lesson.lessonId,
    title: lesson.title,
    chineseTitle: lesson.chineseTitle,
    file: `lesson-${String(lesson.lessonId).padStart(2, '0')}.json`,
    icon: lesson.icon,
    xp: lesson.xp,
    progress: 0,
    desc: lesson.desc
  };
}

const lessonArgIndex = process.argv.indexOf('--lesson');
const selectedIds = lessonArgIndex >= 0
  ? [Number(process.argv[lessonArgIndex + 1])]
  : Object.keys(LESSONS).map(Number).sort((a, b) => a - b);

const missingSources = selectedIds.flatMap(lessonId =>
  (WORD_LISTS[lessonId] || [])
    .filter(hanzi => !wordSource(hanzi))
    .map(hanzi => ({ lessonId, hanzi }))
);
if (missingSources.length) {
  throw new Error(`Thiếu dữ liệu từ gốc: ${JSON.stringify(missingSources)}`);
}

const generated = selectedIds.map(buildLesson);
for (const lesson of generated) {
  const file = path.join(COURSE_DIR, `lesson-${String(lesson.lessonId).padStart(2, '0')}.json`);
  fs.writeFileSync(file, `${JSON.stringify(lesson, null, 2)}\n`, 'utf8');
}

const indexFile = path.join(COURSE_DIR, 'index.json');
const currentIndex = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
const nextIndex = new Map(currentIndex.map(item => [Number(item.lessonId), item]));
generated.forEach(lesson => nextIndex.set(lesson.lessonId, indexEntry(lesson)));
fs.writeFileSync(indexFile, `${JSON.stringify([...nextIndex.values()].sort((a, b) => a.lessonId - b.lessonId), null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  generated: generated.map(lesson => ({
    lessonId: lesson.lessonId,
    title: lesson.title,
    vocabulary: lesson.vocabulary.length,
    extendedVocabulary: lesson.extendedVocabulary.length,
    hanziCount: lesson.meta.hanziCount,
    interactiveSegments: lesson.quality.interactiveSegments
  }))
}, null, 2));
