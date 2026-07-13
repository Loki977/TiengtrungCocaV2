/* =============================================================
   data.js — Shared HSK dataset for Tiếng Trung Cam & Coca
   Sets globals: window.LESSON_DATA  (5 rich HSK 1 lessons)
                 window.HSK_COURSE_DATA  (6-level course grid)
   ============================================================= */

/* ── HSK 1: 5 Structured Lessons ── */
window.LESSON_DATA = [
  {
    lesson_id: 1,
    lesson_title: 'Chào hỏi & Giới thiệu',
    icon: '👋',
    description: 'Học cách chào hỏi, tự giới thiệu và lịch sự bằng tiếng Trung',
    vocabulary: [
      { word: '你好',   pinyin: 'nǐ hǎo',     type: 'Lời chào',   meaning: 'Xin chào',            example_zh: '你好，我叫小明。',         example_vi: 'Xin chào, tôi tên là Tiểu Minh.' },
      { word: '再见',   pinyin: 'zài jiàn',   type: 'Lời chào',   meaning: 'Tạm biệt',             example_zh: '再见，明天见！',           example_vi: 'Tạm biệt, hẹn gặp lại ngày mai!' },
      { word: '谢谢',   pinyin: 'xiè xiè',    type: 'Lời cảm ơn', meaning: 'Cảm ơn',               example_zh: '谢谢你的帮助！',           example_vi: 'Cảm ơn bạn đã giúp đỡ!' },
      { word: '对不起', pinyin: 'duì bu qǐ',  type: 'Lời xin lỗi',meaning: 'Xin lỗi',              example_zh: '对不起，我来晚了。',       example_vi: 'Xin lỗi, tôi đến muộn.' },
      { word: '我',     pinyin: 'wǒ',         type: 'Đại từ',     meaning: 'Tôi / Mình',           example_zh: '我是越南人。',             example_vi: 'Tôi là người Việt Nam.' },
      { word: '你',     pinyin: 'nǐ',         type: 'Đại từ',     meaning: 'Bạn / Anh / Chị',      example_zh: '你叫什么名字？',           example_vi: 'Bạn tên là gì?' },
      { word: '是',     pinyin: 'shì',        type: 'Động từ',    meaning: 'Là (be)',               example_zh: '我是学生。',               example_vi: 'Tôi là học sinh.' },
      { word: '名字',   pinyin: 'míng zi',    type: 'Danh từ',    meaning: 'Tên (gọi)',             example_zh: '你的名字很好听。',         example_vi: 'Tên bạn rất hay.' },
    ],
    grammar: [
      {
        title: 'Câu giới thiệu với 是 (shì)',
        structure: '主语 (S) + 是 + 名词 (N)',
        explanation: '是 (shì) là động từ tương đương "là" trong tiếng Việt. Dùng để xác nhận danh tính hoặc thuộc tính. Phủ định dùng 不是 (bú shì).',
        example_zh: '我是越南人。 / 我不是老师。',
        example_vi: 'Tôi là người Việt Nam. / Tôi không phải là giáo viên.'
      },
      {
        title: 'Câu hỏi với 吗 (ma)',
        structure: '陈述句 (câu kể) + 吗？',
        explanation: 'Thêm 吗 vào cuối câu khẳng định để tạo câu hỏi Yes/No mà không đảo ngữ. Trả lời khẳng định: 是/对 | Phủ định: 不是/不对.',
        example_zh: '你是越南人吗？— 是的，我是越南人。',
        example_vi: 'Bạn có phải người Việt Nam không? — Đúng, tôi là người Việt Nam.'
      },
      {
        title: 'Câu hỏi tên với 叫 (jiào)',
        structure: '你叫什么名字？/ 我叫 + tên',
        explanation: '叫 (jiào) có nghĩa là "gọi là / tên là". Đây là cách phổ biến nhất để hỏi và trả lời về tên trong tiếng Trung.',
        example_zh: '你叫什么名字？— 我叫阮明。',
        example_vi: 'Bạn tên là gì? — Tôi tên là Nguyễn Minh.'
      },
    ]
  },
  {
    lesson_id: 2,
    lesson_title: 'Số đếm & Thời gian',
    icon: '🔢',
    description: 'Nắm vững số đếm cơ bản và cách hỏi, nói về ngày tháng năm',
    vocabulary: [
      { word: '一',   pinyin: 'yī',       type: 'Số đếm',  meaning: 'Một (1)',         example_zh: '一个苹果。',           example_vi: 'Một quả táo.' },
      { word: '两',   pinyin: 'liǎng',    type: 'Số đếm',  meaning: 'Hai (dùng với lượng từ)', example_zh: '两个人。',     example_vi: 'Hai người.' },
      { word: '十',   pinyin: 'shí',      type: 'Số đếm',  meaning: 'Mười (10)',        example_zh: '我有十本书。',         example_vi: 'Tôi có mười quyển sách.' },
      { word: '百',   pinyin: 'bǎi',      type: 'Số đếm',  meaning: 'Trăm (100)',       example_zh: '一百块钱。',           example_vi: 'Một trăm đồng.' },
      { word: '今天', pinyin: 'jīn tiān', type: 'Danh từ', meaning: 'Hôm nay',          example_zh: '今天天气很好。',       example_vi: 'Hôm nay thời tiết rất tốt.' },
      { word: '明天', pinyin: 'míng tiān',type: 'Danh từ', meaning: 'Ngày mai',          example_zh: '明天我去北京。',       example_vi: 'Ngày mai tôi đến Bắc Kinh.' },
      { word: '年',   pinyin: 'nián',     type: 'Danh từ', meaning: 'Năm (time)',        example_zh: '今年是2024年。',       example_vi: 'Năm nay là năm 2024.' },
      { word: '几',   pinyin: 'jǐ',       type: 'Đại từ',  meaning: 'Mấy / Bao nhiêu (nhỏ)', example_zh: '今天几号？',     example_vi: 'Hôm nay mấy ngày?' },
    ],
    grammar: [
      {
        title: 'Hỏi số lượng với 几 và 多少',
        structure: '几 + 量词 + 名词？ / 多少 + 名词？',
        explanation: '几 (jǐ) dùng hỏi số lượng nhỏ (dưới 10), luôn đi kèm lượng từ. 多少 (duō shāo) hỏi số lượng lớn hơn và không bắt buộc có lượng từ.',
        example_zh: '你有几本书？/ 这里有多少人？',
        example_vi: 'Bạn có mấy quyển sách? / Ở đây có bao nhiêu người?'
      },
      {
        title: 'Hỏi ngày tháng',
        structure: '今天 + 几月几号？/ 星期几？',
        explanation: 'Cách hỏi ngày trong tiếng Trung theo thứ tự: Năm → Tháng → Ngày. Tháng dùng 月, ngày dùng 号 (hoặc 日), thứ trong tuần dùng 星期 + số.',
        example_zh: '今天几月几号？— 今天三月十五号。',
        example_vi: 'Hôm nay mấy tháng mấy? — Hôm nay là ngày 15 tháng 3.'
      },
      {
        title: 'Lượng từ cơ bản 个 (gè)',
        structure: '数字 + 个 + 名词',
        explanation: '个 (gè) là lượng từ phổ biến nhất, dùng cho người và nhiều đồ vật. Khi dùng số 2 với lượng từ phải dùng 两 thay vì 二.',
        example_zh: '三个学生。/ 两个苹果。',
        example_vi: 'Ba học sinh. / Hai quả táo.'
      },
    ]
  },
  {
    lesson_id: 3,
    lesson_title: 'Gia đình & Người thân',
    icon: '👨‍👩‍👧',
    description: 'Học cách nói về gia đình và mối quan hệ thân tộc bằng tiếng Trung',
    vocabulary: [
      { word: '爸爸', pinyin: 'bà ba',    type: 'Danh từ', meaning: 'Bố / Ba',          example_zh: '我爸爸是医生。',         example_vi: 'Bố tôi là bác sĩ.' },
      { word: '妈妈', pinyin: 'mā ma',    type: 'Danh từ', meaning: 'Mẹ / Má',          example_zh: '妈妈做的饭很好吃。',     example_vi: 'Cơm mẹ nấu rất ngon.' },
      { word: '哥哥', pinyin: 'gē ge',    type: 'Danh từ', meaning: 'Anh trai',          example_zh: '我哥哥在大学学习。',     example_vi: 'Anh trai tôi học đại học.' },
      { word: '姐姐', pinyin: 'jiě jiě',  type: 'Danh từ', meaning: 'Chị gái',           example_zh: '我姐姐很漂亮。',         example_vi: 'Chị gái tôi rất đẹp.' },
      { word: '弟弟', pinyin: 'dì di',    type: 'Danh từ', meaning: 'Em trai',           example_zh: '弟弟今年六岁。',         example_vi: 'Em trai năm nay sáu tuổi.' },
      { word: '妹妹', pinyin: 'mèi mei',  type: 'Danh từ', meaning: 'Em gái',            example_zh: '妹妹喜欢唱歌。',         example_vi: 'Em gái thích hát.' },
      { word: '家',   pinyin: 'jiā',      type: 'Danh từ', meaning: 'Nhà / Gia đình',    example_zh: '我家有四口人。',         example_vi: 'Nhà tôi có bốn người.' },
      { word: '有',   pinyin: 'yǒu',      type: 'Động từ', meaning: 'Có (possession)',   example_zh: '你有兄弟姐妹吗？',       example_vi: 'Bạn có anh chị em không?' },
    ],
    grammar: [
      {
        title: 'Câu sở hữu với 有 (yǒu) và 没有',
        structure: '主语 + 有/没有 + 名词',
        explanation: '有 (yǒu) có nghĩa là "có". Phủ định là 没有 (méi yǒu - không có). Lưu ý: KHÔNG nói 不有, phải dùng 没有.',
        example_zh: '我有一个哥哥。/ 我没有妹妹。',
        example_vi: 'Tôi có một anh trai. / Tôi không có em gái.'
      },
      {
        title: 'Trợ từ sở hữu 的 (de)',
        structure: '名词/代词 + 的 + 名词',
        explanation: '的 (de) là trợ từ sở hữu giống như "của" trong tiếng Việt. Trong giao tiếp thân mật với người thân hoặc đồ vật cá nhân, 的 có thể được lược bỏ.',
        example_zh: '这是我的书。/ 妈妈的手机。',
        example_vi: 'Đây là sách của tôi. / Điện thoại của mẹ.'
      },
      {
        title: 'Hỏi về gia đình với 家里有几口人',
        structure: '你家里有几口人？/ 家里有…',
        explanation: '口 (kǒu) là lượng từ đặc biệt dùng khi đếm số người trong gia đình. Đây là cách hỏi và trả lời tiêu chuẩn về số người trong gia đình.',
        example_zh: '你家里有几口人？— 我家里有五口人。',
        example_vi: 'Nhà bạn có mấy người? — Nhà tôi có năm người.'
      },
    ]
  },
  {
    lesson_id: 4,
    lesson_title: 'Thức ăn & Đồ uống',
    icon: '🍜',
    description: 'Học từ vựng về ẩm thực và cách đặt đồ ăn uống bằng tiếng Trung',
    vocabulary: [
      { word: '吃',   pinyin: 'chī',       type: 'Động từ', meaning: 'Ăn',               example_zh: '你吃了吗？',               example_vi: 'Bạn ăn chưa?' },
      { word: '喝',   pinyin: 'hē',        type: 'Động từ', meaning: 'Uống',              example_zh: '我想喝茶。',               example_vi: 'Tôi muốn uống trà.' },
      { word: '饭',   pinyin: 'fàn',       type: 'Danh từ', meaning: 'Cơm / Bữa ăn',     example_zh: '中午我们一起吃饭吧！',     example_vi: 'Buổi trưa chúng ta cùng ăn cơm nhé!' },
      { word: '面条', pinyin: 'miàn tiáo', type: 'Danh từ', meaning: 'Mì sợi / Phở',     example_zh: '我爱吃面条。',             example_vi: 'Tôi thích ăn mì.' },
      { word: '水',   pinyin: 'shuǐ',      type: 'Danh từ', meaning: 'Nước',              example_zh: '请给我一杯水。',           example_vi: 'Làm ơn cho tôi một ly nước.' },
      { word: '茶',   pinyin: 'chá',       type: 'Danh từ', meaning: 'Trà / Chè',         example_zh: '中国人很喜欢喝茶。',       example_vi: 'Người Trung Quốc rất thích uống trà.' },
      { word: '好吃', pinyin: 'hǎo chī',   type: 'Tính từ', meaning: 'Ngon (đồ ăn)',      example_zh: '这个菜很好吃！',           example_vi: 'Món này rất ngon!' },
      { word: '想',   pinyin: 'xiǎng',     type: 'Động từ', meaning: 'Muốn / Nghĩ',       example_zh: '我想吃饺子。',             example_vi: 'Tôi muốn ăn bánh bao.' },
    ],
    grammar: [
      {
        title: 'Diễn đạt mong muốn với 想 (xiǎng)',
        structure: '主语 + 想 + 动词 + (宾语)',
        explanation: '想 (xiǎng) đặt trước động từ để diễn đạt mong muốn (muốn làm gì). Phủ định dùng 不想 (bù xiǎng). Mạnh hơn một bậc là 要 (yào).',
        example_zh: '我想吃米饭。/ 我不想喝咖啡。',
        example_vi: 'Tôi muốn ăn cơm. / Tôi không muốn uống cà phê.'
      },
      {
        title: 'Hỏi giá với 多少钱 (duō shāo qián)',
        structure: '……多少钱？/ ……块钱。',
        explanation: '多少钱？là câu hỏi về giá tiền. 块 (kuài) là đơn vị tiền tệ thông thường trong tiếng Trung (tương đương tệ/NDT). Trong văn nói thường bỏ 钱 ở cuối câu trả lời.',
        example_zh: '这碗面条多少钱？— 十五块钱。',
        example_vi: 'Bát mì này bao nhiêu tiền? — Mười lăm tệ.'
      },
      {
        title: 'Mời / Đề nghị với 请 (qǐng)',
        structure: '请 + 动词 + 宾语',
        explanation: '请 (qǐng) là cách lịch sự để mời, yêu cầu hay ra lệnh. Tương đương "xin" hay "mời" trong tiếng Việt. Rất thông dụng trong giao tiếp nhà hàng.',
        example_zh: '请给我一杯茶。/ 请问，厕所在哪里？',
        example_vi: 'Làm ơn cho tôi một tách trà. / Xin hỏi, nhà vệ sinh ở đâu?'
      },
    ]
  },
  {
    lesson_id: 5,
    lesson_title: 'Màu sắc & Tính từ mô tả',
    icon: '🎨',
    description: 'Học cách miêu tả đồ vật với màu sắc và các tính từ cơ bản',
    vocabulary: [
      { word: '大',   pinyin: 'dà',     type: 'Tính từ', meaning: 'To / Lớn',          example_zh: '中国很大。',               example_vi: 'Trung Quốc rất lớn.' },
      { word: '小',   pinyin: 'xiǎo',   type: 'Tính từ', meaning: 'Nhỏ / Bé',          example_zh: '这只猫很小。',             example_vi: 'Con mèo này rất nhỏ.' },
      { word: '多',   pinyin: 'duō',    type: 'Tính từ', meaning: 'Nhiều',              example_zh: '这里的人很多。',           example_vi: 'Ở đây rất nhiều người.' },
      { word: '红',   pinyin: 'hóng',   type: 'Tính từ', meaning: 'Màu đỏ',            example_zh: '我喜欢红色。',             example_vi: 'Tôi thích màu đỏ.' },
      { word: '黄',   pinyin: 'huáng',  type: 'Tính từ', meaning: 'Màu vàng',          example_zh: '这朵花是黄色的。',         example_vi: 'Bông hoa này có màu vàng.' },
      { word: '蓝',   pinyin: 'lán',    type: 'Tính từ', meaning: 'Màu xanh dương',    example_zh: '今天天空很蓝。',           example_vi: 'Hôm nay bầu trời rất xanh.' },
      { word: '白',   pinyin: 'bái',    type: 'Tính từ', meaning: 'Màu trắng',         example_zh: '白色的裙子很漂亮。',       example_vi: 'Váy trắng rất đẹp.' },
      { word: '黑',   pinyin: 'hēi',    type: 'Tính từ', meaning: 'Màu đen',           example_zh: '他穿着一件黑色的衣服。',   example_vi: 'Anh ấy mặc một chiếc áo màu đen.' },
    ],
    grammar: [
      {
        title: 'Câu tính từ vị ngữ với 很 (hěn)',
        structure: '主语 + 很 + 形容词',
        explanation: '很 (hěn) đặt trước tính từ khi tính từ làm vị ngữ. Trong câu xác nhận bình thường, 很 là bắt buộc (dù nghĩa "rất" bị giảm nhẹ). Nếu bỏ 很 thì câu mang nghĩa so sánh.',
        example_zh: '天气很好。/ 她很漂亮。',
        example_vi: 'Thời tiết rất tốt. / Cô ấy rất đẹp.'
      },
      {
        title: 'Phủ định với 不 (bù/bú)',
        structure: '主语 + 不 + 动词/形容词',
        explanation: '不 (bù) phủ định động từ và tính từ. Khi 不 đứng trước âm có thanh 4 (去声), 不 đổi thành bú (thanh 2). Ví dụ: 不是 đọc là "bú shì".',
        example_zh: '今天不冷。/ 我不喜欢黑色。',
        example_vi: 'Hôm nay không lạnh. / Tôi không thích màu đen.'
      },
      {
        title: 'Bổ ngữ màu sắc: 颜色 (yán sè) và 色 (sè)',
        structure: '颜色 + 的 / 颜色 + 色',
        explanation: '颜色 (yán sè) nghĩa là "màu sắc". Khi đứng trước danh từ, thêm 色 sau màu: 红色 (màu đỏ). Hỏi màu: 这是什么颜色？(Đây là màu gì?)',
        example_zh: '你喜欢什么颜色？— 我喜欢蓝色。',
        example_vi: 'Bạn thích màu gì? — Tôi thích màu xanh.'
      },
    ]
  },
];

/* ── HSK Course Grid Data (all 6 levels) ── */
window.HSK_COURSE_DATA = {
  1: {
    title: 'HSK 1 – Sơ Cấp', chinese: '初级', vocab: 150, lessons: 20, hours: 15,
    progress: 100, status: 'completed',
    chapters: [
      {
        name: 'Chương 1: Giao Tiếp Cơ Bản',
        lessons: [
          { id:1, icon:'👋', title:'Bài 1: Chào hỏi & Giới thiệu', desc:'你好 再见 谢谢 — Lời chào và tự giới thiệu',   progress:100, status:'completed', xp:20, detail_id: 1 },
          { id:2, icon:'🔢', title:'Bài 2: Số đếm & Thời gian',     desc:'一 二 三 今天 明天 几 — Số và ngày tháng',      progress:100, status:'completed', xp:20, detail_id: 2 },
          { id:3, icon:'👨‍👩‍👧', title:'Bài 3: Gia đình & Người thân',  desc:'爸爸 妈妈 哥哥 姐姐 — Từ vựng gia đình',       progress:100, status:'completed', xp:20, detail_id: 3 },
          { id:4, icon:'🍜', title:'Bài 4: Thức ăn & Đồ uống',      desc:'吃 喝 饭 茶 — Từ vựng ẩm thực',               progress:100, status:'completed', xp:20, detail_id: 4 },
          { id:5, icon:'🎨', title:'Bài 5: Màu sắc & Tính từ',      desc:'大 小 红 蓝 — Màu sắc và mô tả',               progress:100, status:'completed', xp:25, detail_id: 5 },
        ]
      },
      {
        name: 'Chương 2: Mở Rộng HSK 1',
        lessons: [
          { id:6,  icon:'🕐', title:'Bài 6: Thời gian & Lịch',      desc:'早上 下午 晚上 — Buổi sáng trưa chiều tối',    progress:100, status:'completed', xp:25 },
          { id:7,  icon:'🌍', title:'Bài 7: Địa điểm & Nơi chốn',   desc:'这里 那里 哪里 — Từ chỉ địa điểm',             progress:100, status:'completed', xp:25 },
          { id:8,  icon:'🏃', title:'Bài 8: Động từ thường dùng',    desc:'去 来 走 跑 — Các động từ cơ bản',             progress:100, status:'completed', xp:25 },
        ]
      },
      {
        name: 'Chương 3: Ôn Tập & Kiểm Tra',
        lessons: [
          { id:9,  icon:'📖', title:'Bài 9: Ôn tập tổng hợp',       desc:'Ôn lại toàn bộ từ vựng và ngữ pháp HSK 1',    progress:100, status:'completed', xp:40 },
          { id:10, icon:'🎧', title:'Bài 10: Nghe & Hội thoại',      desc:'Luyện nghe đoạn hội thoại đơn giản',           progress:100, status:'completed', xp:40 },
        ]
      }
    ]
  },
  2: {
    title: 'HSK 2 – Sơ Cấp +', chinese: '初级+', vocab: 300, lessons: 30, hours: 25,
    progress: 65, status: 'active',
    chapters: [
      {
        name: 'Chương 1: Mở Rộng Từ Vựng',
        lessons: [
          { id:1, icon:'🛒', title:'Bài 1: Mua sắm',        desc:'买东西 多少钱 打折 — Mua bán, giá cả',   progress:100, status:'completed', xp:25 },
          { id:2, icon:'🚌', title:'Bài 2: Giao thông',      desc:'公共汽车 地铁 出租车 — Phương tiện',      progress:100, status:'completed', xp:25 },
          { id:3, icon:'🏥', title:'Bài 3: Sức khỏe',        desc:'医院 医生 药 — Bệnh viện, bác sĩ',        progress:100, status:'completed', xp:25 },
          { id:4, icon:'📅', title:'Bài 4: Lịch & Ngày tháng',desc:'星期一 二三四 — Các ngày trong tuần',    progress:100, status:'completed', xp:25 },
        ]
      },
      {
        name: 'Chương 2: Hội Thoại Nâng Cao',
        lessons: [
          { id:5, icon:'📖', title:'Bài 5: Mua sắm & Giá cả',desc:'多少钱? 太贵了 打折吗 — Thỏa thuận giá', progress:65, status:'active', xp:30 },
          { id:6, icon:'🎧', title:'Bài 6: Nghe & Hội thoại', desc:'Luyện nghe đoạn hội thoại hàng ngày',    progress:0, status:'locked', xp:30 },
          { id:7, icon:'✍️', title:'Bài 7: Viết câu phức',    desc:'Mẫu câu có mệnh đề phụ 因为…所以',      progress:0, status:'locked', xp:30 },
        ]
      }
    ]
  },
  3: {
    title: 'HSK 3 – Trung Cấp', chinese: '中级', vocab: 600, lessons: 40, hours: 40,
    progress: 0, status: 'locked',
    chapters: [
      {
        name: 'Chương 1: Giao Tiếp Nâng Cao',
        lessons: [
          { id:1, icon:'💼', title:'Bài 1: Công việc & Nghề nghiệp', desc:'工作 上班 公司 职业',   progress:0, status:'locked', xp:35 },
          { id:2, icon:'✈️', title:'Bài 2: Du lịch',                 desc:'旅游 机票 酒店',          progress:0, status:'locked', xp:35 },
          { id:3, icon:'🍽️', title:'Bài 3: Nhà hàng & Đặt món',     desc:'点菜 菜单 味道',          progress:0, status:'locked', xp:35 },
        ]
      }
    ]
  },
  4: {
    title: 'HSK 4 – Trung Cấp +', chinese: '中级+', vocab: 1200, lessons: 50, hours: 60,
    progress: 0, status: 'locked',
    chapters: [
      {
        name: 'Chương 1: Tư Duy & Diễn Đạt',
        lessons: [
          { id:1, icon:'🧠', title:'Bài 1: Bày tỏ quan điểm', desc:'我认为 在我看来 — Diễn đạt ý kiến', progress:0, status:'locked', xp:45 },
          { id:2, icon:'📰', title:'Bài 2: Đọc hiểu báo chí', desc:'Từ vựng và cấu trúc trong tin tức', progress:0, status:'locked', xp:45 },
        ]
      }
    ]
  },
  5: {
    title: 'HSK 5 – Nâng Cao', chinese: '高级', vocab: 2500, lessons: 60, hours: 80,
    progress: 0, status: 'locked',
    chapters: [
      {
        name: 'Chương 1: Văn Học & Văn Hóa',
        lessons: [
          { id:1, icon:'📚', title:'Bài 1: Đọc văn học Trung Quốc', desc:'Tác phẩm văn học nổi tiếng', progress:0, status:'locked', xp:55 },
          { id:2, icon:'🏛️', title:'Bài 2: Lịch sử & Văn hóa',     desc:'Văn hóa và lịch sử Trung Quốc', progress:0, status:'locked', xp:55 },
        ]
      }
    ]
  },
  6: {
    title: 'HSK 6 – Thành Thạo', chinese: '精通', vocab: 5000, lessons: 80, hours: 120,
    progress: 0, status: 'locked',
    chapters: [
      {
        name: 'Chương 1: Thành Ngữ & Tục Ngữ',
        lessons: [
          { id:1, icon:'🀄', title:'Bài 1: Thành ngữ 4 chữ',  desc:'100 thành ngữ phổ biến nhất', progress:0, status:'locked', xp:70 },
          { id:2, icon:'🖋️', title:'Bài 2: Viết luận văn',    desc:'Cấu trúc bài luận học thuật',  progress:0, status:'locked', xp:70 },
        ]
      }
    ]
  }
};
