from course_content_tools import (
    COURSE_DIR,
    build_extended_vocabulary,
    chunk_list,
    load_json,
    load_word_lookup,
    lookup_coverage,
    segment_text,
    sentence_pinyin,
    write_json,
)


def line(speaker, chinese, vietnamese):
    return {"speaker": speaker, "chinese": chinese, "vietnamese": vietnamese}


HSK1_EXTENDED = {
    1: ["同学", "认识", "名字"],
    2: ["汉语", "觉得", "容易"],
    3: ["明天", "一起", "见"],
    4: ["教室", "食堂", "先"],
    5: ["老师", "朋友", "欢迎"],
    6: ["练习", "汉字", "认真"],
    7: ["饺子", "好吃", "还是"],
    8: ["一共", "新鲜", "便宜"],
    9: ["银行", "护照", "汇率"],
    10: ["宿舍", "搬家", "附近"],
    11: ["国家", "交换生", "文化"],
    12: ["图书馆", "楼上", "安静"],
    13: ["感冒", "药店", "休息"],
    14: ["自行车", "修理", "颜色"],
    15: ["同事", "办公室", "开会"],
}


HSK2_EXTENDED = {
    1: ["借书证", "复习", "座位"],
    2: ["直播", "照片", "笑话"],
    3: ["快递", "地址", "包裹"],
    4: ["试衣间", "合身", "退换"],
    5: ["惊喜", "蛋糕", "愿望"],
    6: ["汇率", "取号", "柜台"],
    7: ["温度", "雨伞", "预报"],
    8: ["生词", "录音", "进步"],
    9: ["外卖", "饿", "打包"],
    10: ["攻略", "胡同", "迷路"],
    11: ["房东", "阳台", "押金"],
    12: ["高铁", "行李", "出发"],
    13: ["挂号", "发烧", "药方"],
    14: ["复习计划", "模拟考试", "成绩"],
    15: ["坚持", "目标", "流利"],
}


MANUAL_WORDS = {
    "见": {"hanzi": "见", "pinyin": "jiàn", "meaning": "gặp, thấy", "type": "động từ"},
    "食堂": {"hanzi": "食堂", "pinyin": "shítáng", "meaning": "nhà ăn, căng tin", "type": "danh từ"},
    "先": {"hanzi": "先", "pinyin": "xiān", "meaning": "trước, trước tiên", "type": "phó từ"},
    "汉字": {"hanzi": "汉字", "pinyin": "Hànzì", "meaning": "chữ Hán", "type": "danh từ"},
    "搬家": {"hanzi": "搬家", "pinyin": "bānjiā", "meaning": "chuyển nhà", "type": "động từ"},
    "交换生": {"hanzi": "交换生", "pinyin": "jiāohuànshēng", "meaning": "sinh viên trao đổi", "type": "danh từ"},
    "楼上": {"hanzi": "楼上", "pinyin": "lóushàng", "meaning": "tầng trên", "type": "danh từ chỉ vị trí"},
    "药店": {"hanzi": "药店", "pinyin": "yàodiàn", "meaning": "hiệu thuốc", "type": "danh từ"},
    "开会": {"hanzi": "开会", "pinyin": "kāihuì", "meaning": "họp", "type": "động từ"},
    "借书证": {"hanzi": "借书证", "pinyin": "jièshūzhèng", "meaning": "thẻ mượn sách", "type": "danh từ"},
    "快递": {"hanzi": "快递", "pinyin": "kuàidì", "meaning": "chuyển phát nhanh", "type": "danh từ"},
    "试衣间": {"hanzi": "试衣间", "pinyin": "shìyījiān", "meaning": "phòng thử đồ", "type": "danh từ"},
    "退换": {"hanzi": "退换", "pinyin": "tuìhuàn", "meaning": "đổi hoặc trả hàng", "type": "động từ"},
    "惊喜": {"hanzi": "惊喜", "pinyin": "jīngxǐ", "meaning": "sự bất ngờ vui vẻ", "type": "danh từ"},
    "取号": {"hanzi": "取号", "pinyin": "qǔhào", "meaning": "lấy số thứ tự", "type": "động từ"},
    "雨伞": {"hanzi": "雨伞", "pinyin": "yǔsǎn", "meaning": "ô, dù", "type": "danh từ"},
    "生词": {"hanzi": "生词", "pinyin": "shēngcí", "meaning": "từ mới", "type": "danh từ"},
    "外卖": {"hanzi": "外卖", "pinyin": "wàimài", "meaning": "đồ ăn giao tận nơi", "type": "danh từ"},
    "攻略": {"hanzi": "攻略", "pinyin": "gōnglüè", "meaning": "cẩm nang, kế hoạch chi tiết", "type": "danh từ"},
    "高铁": {"hanzi": "高铁", "pinyin": "gāotiě", "meaning": "tàu cao tốc", "type": "danh từ"},
    "行李": {"hanzi": "行李", "pinyin": "xíngli", "meaning": "hành lý", "type": "danh từ"},
    "药方": {"hanzi": "药方", "pinyin": "yàofāng", "meaning": "đơn thuốc", "type": "danh từ"},
    "复习计划": {"hanzi": "复习计划", "pinyin": "fùxí jìhuà", "meaning": "kế hoạch ôn tập", "type": "danh từ"},
    "模拟考试": {"hanzi": "模拟考试", "pinyin": "mónǐ kǎoshì", "meaning": "kỳ thi thử", "type": "danh từ"},
}


HSK1_DIALOGUES = {
    1: [
        line("旁白:", "开学第一天，Coca 看见一位新同学站在门口。", "Ngày đầu khai giảng, Coca thấy một bạn học mới đứng trước cửa."),
        line("Coca:", "你好！你是新同学吗？", "Xin chào! Bạn là học sinh mới phải không?"),
        line("Cam:", "是，我叫Cam。你叫什么名字？", "Đúng, tôi tên Cam. Bạn tên gì?"),
        line("Coca:", "我叫Coca。认识你很高兴。", "Tôi tên Coca. Rất vui được làm quen với bạn."),
        line("Cam:", "我也很高兴。你好吗？", "Tôi cũng rất vui. Bạn khỏe không?"),
        line("Coca:", "我很好，你呢？", "Tôi rất khỏe, còn bạn?"),
        line("Cam:", "我也很好，就是不知道教室在哪儿。", "Tôi cũng khỏe, chỉ là không biết phòng học ở đâu."),
        line("Coca:", "教室就在你后面。", "Phòng học ở ngay phía sau bạn."),
        line("Cam:", "啊，我站了十分钟，还没有看见！", "À, tôi đứng đây mười phút mà vẫn không nhìn thấy!"),
        line("老师:", "两位同学，先别聊天，我们已经上课了。", "Hai em, tạm dừng trò chuyện nhé, chúng ta vào học rồi."),
    ],
    2: [
        line("旁白:", "Cam 把汉语书放在冰箱上，Coca 觉得很奇怪。", "Cam đặt sách tiếng Trung lên tủ lạnh, Coca thấy rất lạ."),
        line("Coca:", "你的汉语书为什么在这儿？", "Tại sao sách tiếng Trung của bạn lại ở đây?"),
        line("Cam:", "我一边吃东西，一边看书。", "Tôi vừa ăn vừa đọc sách."),
        line("Coca:", "你觉得汉语难吗？", "Bạn cảm thấy tiếng Trung khó không?"),
        line("Cam:", "汉字不太容易，可是说汉语很有意思。", "Chữ Hán không dễ lắm, nhưng nói tiếng Trung rất thú vị."),
        line("Coca:", "这个字你会读吗？", "Chữ này bạn biết đọc không?"),
        line("Cam:", "会，它读“冰”。", "Biết, nó đọc là “băng”."),
        line("Coca:", "那不是书上的字，是冰箱上的字。", "Đó không phải chữ trong sách, mà là chữ trên tủ lạnh."),
        line("Cam:", "没关系，我今天又学了一个字。", "Không sao, hôm nay tôi lại học thêm một chữ."),
        line("Coca:", "好吧，但是别把书也放进冰箱。", "Được thôi, nhưng đừng đặt cả sách vào trong tủ lạnh nhé."),
    ],
    3: [
        line("Coca:", "明天你有时间吗？", "Ngày mai bạn có thời gian không?"),
        line("Cam:", "有，我们一起去公园吧。", "Có, chúng ta cùng đi công viên nhé."),
        line("Coca:", "好，上午九点在学校门口见。", "Được, chín giờ sáng gặp ở cổng trường."),
        line("Cam:", "明天会下雨吗？", "Ngày mai có mưa không?"),
        line("Coca:", "天气预报说不下雨。", "Dự báo thời tiết nói không mưa."),
        line("Cam:", "那我不带雨伞了。", "Vậy tôi không mang ô nữa."),
        line("旁白:", "第二天，Coca 带了两把雨伞，Cam 带了一个大西瓜。", "Hôm sau, Coca mang hai chiếc ô, còn Cam mang một quả dưa hấu lớn."),
        line("Coca:", "你为什么带西瓜？", "Tại sao bạn mang dưa hấu?"),
        line("Cam:", "公园见，当然要吃西瓜。", "Gặp ở công viên thì đương nhiên phải ăn dưa hấu."),
        line("Coca:", "好吧，明天见变成了今天吃。", "Được thôi, “hẹn ngày mai” đã biến thành “hôm nay ăn” rồi."),
    ],
    4: [
        line("Coca:", "Cam，你去哪儿？", "Cam, bạn đi đâu vậy?"),
        line("Cam:", "我去教室，你也去吗？", "Tôi đi đến phòng học, bạn cũng đi à?"),
        line("Coca:", "我先去食堂买水，再去教室。", "Tôi đến căng tin mua nước trước, rồi mới đến phòng học."),
        line("Cam:", "食堂在哪儿？", "Căng tin ở đâu?"),
        line("Coca:", "在图书馆旁边。", "Ở bên cạnh thư viện."),
        line("Cam:", "那我也去，我还没有吃早饭。", "Vậy tôi cũng đi, tôi vẫn chưa ăn sáng."),
        line("Coca:", "可是还有五分钟就上课了。", "Nhưng chỉ còn năm phút nữa là vào học."),
        line("Cam:", "我只买一个面包，很快。", "Tôi chỉ mua một chiếc bánh mì thôi, sẽ nhanh lắm."),
        line("旁白:", "五分钟以后，Coca 到了教室，Cam 还在食堂选面包。", "Năm phút sau, Coca đã tới phòng học, Cam vẫn đang chọn bánh mì ở căng tin."),
        line("老师:", "Cam，你的面包比你先来上课了。", "Cam, bánh mì của em còn đến lớp trước em đấy."),
    ],
    5: [
        line("Coca:", "Cam，这是王老师。", "Cam, đây là thầy Vương."),
        line("Cam:", "王老师，您好！欢迎您来我们班。", "Chào thầy Vương! Chào mừng thầy đến lớp chúng em."),
        line("王老师:", "你好，你是Coca的朋友吗？", "Chào em, em là bạn của Coca phải không?"),
        line("Cam:", "是，我们也是同学。", "Vâng, chúng em cũng là bạn học."),
        line("Coca:", "老师，Cam 会说一点儿汉语。", "Thưa thầy, Cam biết nói một chút tiếng Trung."),
        line("王老师:", "很好。Cam，你是哪国人？", "Rất tốt. Cam, em là người nước nào?"),
        line("Cam:", "我是越南人。老师，您呢？", "Em là người Việt Nam. Còn thầy ạ?"),
        line("王老师:", "我是中国人，也是你们的新老师。", "Thầy là người Trung Quốc, cũng là giáo viên mới của các em."),
        line("Cam:", "对不起，我太紧张了，老师当然是老师。", "Xin lỗi, em căng thẳng quá, thầy đương nhiên là thầy rồi."),
        line("Coca:", "没关系，今天大家都认识你了。", "Không sao, hôm nay mọi người đều biết bạn rồi."),
    ],
    6: [
        line("Coca:", "你每天怎么练习汉语？", "Mỗi ngày bạn luyện tiếng Trung thế nào?"),
        line("Cam:", "我读课文、写汉字，也听录音。", "Tôi đọc bài, viết chữ Hán và nghe ghi âm."),
        line("Coca:", "你写汉字很认真。", "Bạn viết chữ Hán rất chăm chú."),
        line("Cam:", "可是我写的“人”常常像“大”。", "Nhưng chữ “nhân” tôi viết thường giống chữ “đại”."),
        line("Coca:", "没关系，多写几次就好了。", "Không sao, viết thêm vài lần là được."),
        line("Cam:", "你会写我的中文名字吗？", "Bạn biết viết tên tiếng Trung của tôi không?"),
        line("Coca:", "会，我先写给你看。", "Biết, tôi viết cho bạn xem trước."),
        line("Cam:", "这个字真漂亮！", "Chữ này đẹp thật!"),
        line("Coca:", "那是因为我写了三年。", "Đó là vì tôi đã viết ba năm rồi."),
        line("Cam:", "好，我今天先写三十遍。", "Được, hôm nay tôi sẽ viết ba mươi lần trước."),
    ],
    7: [
        line("Coca:", "中午你想吃什么？", "Buổi trưa bạn muốn ăn gì?"),
        line("Cam:", "我想吃米饭，你呢？", "Tôi muốn ăn cơm, còn bạn?"),
        line("Coca:", "我想吃饺子，学校的饺子很好吃。", "Tôi muốn ăn sủi cảo, sủi cảo ở trường rất ngon."),
        line("Cam:", "我们吃饺子还是吃面条？", "Chúng ta ăn sủi cảo hay mì?"),
        line("Coca:", "都可以，但是我不吃太辣的。", "Đều được, nhưng tôi không ăn quá cay."),
        line("Cam:", "我也不吃辣。", "Tôi cũng không ăn cay."),
        line("服务员:", "这是你们的辣面和辣饺子。", "Đây là mì cay và sủi cảo cay của hai bạn."),
        line("Coca:", "我们没有点辣的。", "Chúng tôi không gọi món cay."),
        line("服务员:", "对不起，这是旁边桌的。", "Xin lỗi, đây là của bàn bên cạnh."),
        line("Cam:", "还好，不然我们今天只能喝水了。", "May quá, nếu không hôm nay chúng ta chỉ có thể uống nước."),
    ],
    8: [
        line("Cam:", "苹果多少钱一斤？", "Táo bao nhiêu tiền một cân?"),
        line("老板:", "六块钱一斤，很新鲜。", "Sáu tệ một cân, rất tươi."),
        line("Coca:", "买两斤可以便宜一点儿吗？", "Mua hai cân có thể rẻ hơn một chút không?"),
        line("老板:", "可以，十块钱两斤。", "Được, mười tệ hai cân."),
        line("Cam:", "那我们买三斤，一共多少钱？", "Vậy chúng tôi mua ba cân, tổng cộng bao nhiêu?"),
        line("老板:", "三斤十五块。", "Ba cân mười lăm tệ."),
        line("Cam:", "等等，两斤十块，三斤怎么也是十五块？", "Khoan đã, hai cân mười tệ, sao ba cân cũng là mười lăm tệ?"),
        line("Coca:", "因为十加五就是十五。", "Vì mười cộng năm bằng mười lăm."),
        line("Cam:", "我不是不会买苹果，我只是早上没有喝咖啡。", "Không phải tôi không biết mua táo, chỉ là sáng nay tôi chưa uống cà phê."),
        line("老板:", "那我送你一个苹果，让你快点儿醒。", "Vậy tôi tặng bạn một quả táo để bạn tỉnh nhanh hơn."),
    ],
    9: [
        line("Coca:", "你去银行做什么？", "Bạn đến ngân hàng làm gì?"),
        line("Cam:", "我想换人民币。", "Tôi muốn đổi nhân dân tệ."),
        line("Coca:", "你的护照带了吗？", "Bạn mang hộ chiếu chưa?"),
        line("Cam:", "带了，我把它放在汉语书里。", "Mang rồi, tôi để nó trong sách tiếng Trung."),
        line("工作人员:", "您好，请问您换多少钱？", "Xin chào, bạn muốn đổi bao nhiêu tiền?"),
        line("Cam:", "请问今天的汇率是多少？", "Cho hỏi tỷ giá hôm nay là bao nhiêu?"),
        line("工作人员:", "请先给我看护照。", "Vui lòng cho tôi xem hộ chiếu trước."),
        line("Cam:", "糟了，我带了书，没带护照。", "Ôi, tôi mang sách nhưng không mang hộ chiếu."),
        line("Coca:", "你的护照还在昨天那本书里。", "Hộ chiếu của bạn vẫn ở trong cuốn sách hôm qua."),
        line("工作人员:", "没关系，今天您先把“护照”这个词记住。", "Không sao, hôm nay bạn hãy nhớ từ “hộ chiếu” trước đã."),
    ],
    10: [
        line("Coca:", "你现在住在哪儿？", "Bây giờ bạn sống ở đâu?"),
        line("Cam:", "我住在学校宿舍。", "Tôi sống trong ký túc xá của trường."),
        line("Coca:", "宿舍离教室远吗？", "Ký túc xá cách phòng học xa không?"),
        line("Cam:", "不远，走路五分钟。", "Không xa, đi bộ năm phút."),
        line("Coca:", "听说你要搬家。", "Nghe nói bạn sắp chuyển nhà."),
        line("Cam:", "对，我想住在学校附近。", "Đúng, tôi muốn sống gần trường."),
        line("Coca:", "你的新房间大吗？", "Phòng mới của bạn có lớn không?"),
        line("Cam:", "不大，只能放一张床和一张桌子。", "Không lớn, chỉ đặt được một chiếc giường và một cái bàn."),
        line("Coca:", "那你的书放哪儿？", "Vậy sách của bạn đặt ở đâu?"),
        line("Cam:", "放在桌子上、床下，还有我的包里。房间小，办法多。", "Đặt trên bàn, dưới giường và trong túi. Phòng nhỏ nhưng cách thì nhiều."),
    ],
    11: [
        line("老师:", "今天我们班来了三位交换生。", "Hôm nay lớp chúng ta có ba sinh viên trao đổi mới."),
        line("Coca:", "欢迎你们！你们来自哪个国家？", "Chào mừng các bạn! Các bạn đến từ nước nào?"),
        line("Lan:", "我来自越南。", "Tôi đến từ Việt Nam."),
        line("Anna:", "我来自美国。", "Tôi đến từ Mỹ."),
        line("Yuki:", "我来自日本。", "Tôi đến từ Nhật Bản."),
        line("Cam:", "我们都是留学生，也都喜欢中国文化。", "Chúng tôi đều là du học sinh và đều thích văn hóa Trung Quốc."),
        line("Coca:", "你们会说汉语吗？", "Các bạn biết nói tiếng Trung không?"),
        line("Lan:", "会一点儿，但是说得不快。", "Biết một chút, nhưng nói không nhanh."),
        line("Cam:", "没关系，我说得很快，可是常常说错。", "Không sao, tôi nói rất nhanh nhưng thường nói sai."),
        line("老师:", "那正好，一个负责慢，一个负责快，大家一起进步。", "Vậy vừa hay, một người phụ trách chậm, một người phụ trách nhanh, mọi người cùng tiến bộ."),
    ],
    12: [
        line("Coca:", "你在哪儿学习？", "Bạn học ở đâu?"),
        line("Cam:", "我在图书馆楼上学习。", "Tôi học ở tầng trên của thư viện."),
        line("Coca:", "那儿安静吗？", "Ở đó có yên tĩnh không?"),
        line("Cam:", "很安静，大家都不说话。", "Rất yên tĩnh, mọi người đều không nói chuyện."),
        line("Coca:", "你为什么不在教室学习？", "Tại sao bạn không học trong phòng học?"),
        line("Cam:", "教室里人太多。", "Trong phòng học có quá nhiều người."),
        line("旁白:", "这时，Cam 的手机突然大声唱起歌来。", "Lúc đó, điện thoại của Cam đột nhiên phát nhạc rất to."),
        line("Cam:", "对不起！我忘了关声音。", "Xin lỗi! Tôi quên tắt âm thanh."),
        line("管理员:", "同学，图书馆要安静。", "Bạn học này, thư viện cần yên tĩnh."),
        line("Coca:", "现在大家都知道你在楼上学习了。", "Bây giờ mọi người đều biết bạn học ở tầng trên rồi."),
    ],
    13: [
        line("Coca:", "你怎么了？", "Bạn làm sao vậy?"),
        line("Cam:", "我感冒了，头有点儿疼。", "Tôi bị cảm, đầu hơi đau."),
        line("Coca:", "你去医院了吗？", "Bạn đã đi bệnh viện chưa?"),
        line("Cam:", "没有，我想先去药店买药。", "Chưa, tôi muốn đến hiệu thuốc mua thuốc trước."),
        line("Coca:", "这是中药还是茶？", "Đây là thuốc Đông y hay trà?"),
        line("Cam:", "我也不知道，盒子上写着一天喝三次。", "Tôi cũng không biết, trên hộp viết uống ba lần một ngày."),
        line("Coca:", "感冒要多喝水，也要好好休息。", "Bị cảm phải uống nhiều nước và nghỉ ngơi cho tốt."),
        line("Cam:", "那我今天不去上课了。", "Vậy hôm nay tôi không đi học nữa."),
        line("老师:", "可以休息，但是别把药当茶请全班喝。", "Em có thể nghỉ, nhưng đừng coi thuốc là trà rồi mời cả lớp uống nhé."),
        line("Cam:", "明白了，这一盒只够我一个人。", "Em hiểu rồi, hộp này chỉ đủ cho một mình em thôi."),
    ],
    14: [
        line("Coca:", "这是你的自行车吗？", "Đây là xe đạp của bạn phải không?"),
        line("Cam:", "是，新不新？", "Đúng, có mới không?"),
        line("Coca:", "颜色很漂亮，但是看起来有点儿旧。", "Màu rất đẹp, nhưng trông hơi cũ."),
        line("Cam:", "车是旧的，铃是新的。", "Xe thì cũ, chuông thì mới."),
        line("Coca:", "你会修理自行车吗？", "Bạn biết sửa xe đạp không?"),
        line("Cam:", "不会，所以我只修了车铃。", "Không biết, nên tôi chỉ sửa chuông xe."),
        line("Coca:", "那它能走吗？", "Vậy nó đi được không?"),
        line("Cam:", "现在不能，但是铃很响。", "Bây giờ không đi được, nhưng chuông rất to."),
        line("修车师傅:", "你的车不是来修理的，是来开音乐会的吧？", "Xe của bạn không phải tới sửa, mà tới mở hòa nhạc phải không?"),
        line("Cam:", "先让它会走，再让它唱歌。", "Trước tiên hãy để nó đi được, rồi mới cho nó hát."),
    ],
    15: [
        line("Coca:", "你们公司有多少人？", "Công ty của bạn có bao nhiêu người?"),
        line("Cam:", "有二十个员工。", "Có hai mươi nhân viên."),
        line("Coca:", "你的办公室大吗？", "Văn phòng của bạn có lớn không?"),
        line("Cam:", "不太大，但是很亮。", "Không lớn lắm, nhưng rất sáng."),
        line("Coca:", "你的同事都在办公室吗？", "Các đồng nghiệp của bạn đều ở văn phòng à?"),
        line("Cam:", "没有，他们正在开会。", "Không, họ đang họp."),
        line("Coca:", "那你为什么没去？", "Vậy tại sao bạn không đi?"),
        line("Cam:", "因为我在等会议室里的咖啡机。", "Vì tôi đang chờ máy pha cà phê trong phòng họp."),
        line("同事:", "Cam，开会已经开始了，咖啡也喝完了。", "Cam, cuộc họp đã bắt đầu rồi, cà phê cũng uống hết rồi."),
        line("Cam:", "原来公司有二十个员工，只有我在数咖啡。", "Hóa ra công ty có hai mươi nhân viên, chỉ mình tôi đang đếm cà phê."),
    ],
}


HSK2_DIALOGUES = {
    1: [
        line("Coca:", "你经常来图书馆吗？", "Bạn có thường đến thư viện không?"),
        line("Cam:", "最近每天都来，我要复习汉语。", "Gần đây ngày nào tôi cũng tới, tôi cần ôn tiếng Trung."),
        line("Coca:", "你的借书证办好了吗？", "Thẻ mượn sách của bạn làm xong chưa?"),
        line("Cam:", "办好了，可是我又找不到了。", "Làm xong rồi, nhưng tôi lại không tìm thấy."),
        line("Coca:", "你看看书包的小口袋。", "Bạn thử xem ngăn nhỏ của ba lô."),
        line("Cam:", "找到了！它跟昨天的电影票在一起。", "Tìm thấy rồi! Nó ở cùng vé xem phim hôm qua."),
        line("Coca:", "你不是每天都来复习吗？", "Chẳng phải ngày nào bạn cũng đến ôn tập sao?"),
        line("Cam:", "昨天先看电影，今天再认真学习。", "Hôm qua xem phim trước, hôm nay mới học nghiêm túc."),
        line("管理员:", "两位同学，请小声一点儿。", "Hai bạn, vui lòng nói nhỏ một chút."),
        line("Coca:", "我们去那边找座位吧。", "Chúng ta sang bên kia tìm chỗ ngồi nhé."),
        line("Cam:", "好，只要别坐在电影杂志旁边。", "Được, miễn là đừng ngồi cạnh tạp chí điện ảnh."),
        line("Coca:", "看来你最需要复习的是“认真”两个字。", "Xem ra thứ bạn cần ôn nhất là hai chữ “nghiêm túc”."),
    ],
    2: [
        line("Coca:", "你在做什么呢？", "Bạn đang làm gì vậy?"),
        line("Cam:", "我正在直播做饭。", "Tôi đang phát trực tiếp việc nấu ăn."),
        line("Coca:", "可是锅里什么都没有。", "Nhưng trong nồi chẳng có gì cả."),
        line("Cam:", "我还在等观众告诉我做什么。", "Tôi vẫn đang chờ khán giả bảo tôi nấu món gì."),
        line("Coca:", "有人留言了吗？", "Có ai để lại bình luận chưa?"),
        line("Cam:", "有，他们说先拍一张照片。", "Có, họ nói chụp một bức ảnh trước."),
        line("Coca:", "空锅的照片有什么好看？", "Ảnh cái nồi rỗng thì có gì hay?"),
        line("Cam:", "这叫做饭以前和做饭以后的对比。", "Đây gọi là so sánh trước và sau khi nấu."),
        line("Coca:", "你还没做，怎么知道以后也是空的？", "Bạn còn chưa nấu, sao biết sau đó vẫn rỗng?"),
        line("Cam:", "因为我不会做饭。", "Vì tôi không biết nấu ăn."),
        line("观众留言:", "这个笑话不错，请你们去饭店吧。", "Bình luận của khán giả: Truyện cười này hay đấy, hai bạn hãy ra nhà hàng đi."),
        line("Coca:", "直播结束，我们终于可以吃饭了。", "Buổi phát trực tiếp kết thúc, cuối cùng chúng ta có thể đi ăn rồi."),
    ],
    3: [
        line("Cam:", "我去邮局寄一个包裹。", "Tôi đến bưu điện gửi một bưu kiện."),
        line("Coca:", "现在也可以叫快递上门。", "Bây giờ cũng có thể gọi chuyển phát tới tận nhà."),
        line("Cam:", "可是这个包裹很重要，我想自己去。", "Nhưng bưu kiện này rất quan trọng, tôi muốn tự đi."),
        line("工作人员:", "请把收件人的地址写清楚。", "Vui lòng viết rõ địa chỉ người nhận."),
        line("Cam:", "我写好了，您看看。", "Tôi viết xong rồi, anh/chị xem giúp."),
        line("工作人员:", "城市和街道都有，但是没有名字。", "Có thành phố và đường phố, nhưng không có tên."),
        line("Cam:", "名字在盒子里面。", "Tên ở trong hộp."),
        line("Coca:", "快递员不能先打开盒子找名字。", "Nhân viên giao hàng không thể mở hộp tìm tên trước."),
        line("Cam:", "对，我把名字也写在外面。", "Đúng, tôi sẽ viết tên cả ở bên ngoài."),
        line("工作人员:", "里面是什么？需要小心吗？", "Bên trong là gì? Có cần cẩn thận không?"),
        line("Cam:", "是给朋友的生日礼物，一本我写的菜谱。", "Là quà sinh nhật cho bạn, một quyển công thức nấu ăn do tôi viết."),
        line("Coca:", "请在盒子上再写一句：最好先去饭店。", "Hãy viết thêm trên hộp một câu: Tốt nhất hãy tới nhà hàng trước."),
    ],
    4: [
        line("售货员:", "您好，需要帮忙吗？", "Xin chào, bạn cần giúp gì không?"),
        line("Coca:", "我想试试这件蓝色的衣服。", "Tôi muốn thử chiếc áo màu xanh này."),
        line("售货员:", "可以，试衣间在右边。", "Được, phòng thử đồ ở bên phải."),
        line("Cam:", "我也想试这件红色的。", "Tôi cũng muốn thử chiếc màu đỏ này."),
        line("Coca:", "你不是来帮我选衣服的吗？", "Chẳng phải bạn tới giúp tôi chọn quần áo sao?"),
        line("Cam:", "试过以后，我才能比较。", "Sau khi thử tôi mới có thể so sánh."),
        line("售货员:", "蓝色的很合身，红色的大了一点儿。", "Chiếc xanh rất vừa, chiếc đỏ hơi rộng."),
        line("Cam:", "大的舒服，我就买红色的。", "Rộng thì thoải mái, tôi sẽ mua chiếc đỏ."),
        line("Coca:", "可是那是一件女装。", "Nhưng đó là đồ nữ."),
        line("Cam:", "难怪口袋这么小。", "Thảo nào túi áo nhỏ thế."),
        line("售货员:", "七天内可以退换，请保留小票。", "Trong bảy ngày có thể đổi trả, vui lòng giữ hóa đơn."),
        line("Coca:", "先别退，今天你的故事比衣服更合身。", "Khoan trả đã, hôm nay câu chuyện của bạn còn vừa vặn hơn chiếc áo."),
    ],
    5: [
        line("Coca:", "今天是Cam的生日，我们给他一个惊喜吧。", "Hôm nay là sinh nhật Cam, chúng ta tạo cho bạn ấy một bất ngờ nhé."),
        line("Lan:", "我去买蛋糕，你来请他过来。", "Tôi đi mua bánh, bạn mời cậu ấy tới."),
        line("Coca:", "不能说是生日会。", "Không được nói đây là tiệc sinh nhật."),
        line("Lan:", "那就说老师找他。", "Vậy nói giáo viên tìm cậu ấy."),
        line("Cam:", "你们为什么把灯关了？", "Tại sao các bạn tắt đèn?"),
        line("大家:", "生日快乐！", "Chúc mừng sinh nhật!"),
        line("Cam:", "谢谢！我真的没想到。", "Cảm ơn! Tôi thật sự không nghĩ tới."),
        line("Coca:", "快许一个愿望吧。", "Mau ước một điều đi."),
        line("Cam:", "我的愿望是今年汉语考试及格。", "Điều ước của tôi là năm nay thi đỗ tiếng Trung."),
        line("老师:", "这个愿望不能只靠吹蜡烛。", "Điều ước này không thể chỉ dựa vào thổi nến."),
        line("Lan:", "没关系，我们送你的礼物是一套练习题。", "Không sao, quà chúng tôi tặng là một bộ bài tập."),
        line("Cam:", "这真是一个又甜又难的惊喜。", "Đây đúng là một bất ngờ vừa ngọt vừa khó."),
    ],
    6: [
        line("Cam:", "我得去银行换钱，你能陪我吗？", "Tôi phải tới ngân hàng đổi tiền, bạn đi cùng được không?"),
        line("Coca:", "可以，我们先在门口取号。", "Được, chúng ta lấy số ở cửa trước."),
        line("Cam:", "前面还有三十个人，要等很久。", "Phía trước còn ba mươi người, phải đợi rất lâu."),
        line("Coca:", "你可以先看看今天的汇率。", "Bạn có thể xem tỷ giá hôm nay trước."),
        line("Cam:", "这个数字怎么每天都不一样？", "Tại sao con số này mỗi ngày đều khác?"),
        line("Coca:", "汇率会变化，所以换钱以前要看清楚。", "Tỷ giá thay đổi, nên trước khi đổi tiền phải xem kỹ."),
        line("广播:", "请一百零八号到三号柜台。", "Mời số 108 tới quầy số 3."),
        line("Cam:", "我的号码是一百零八！", "Số của tôi là 108!"),
        line("Coca:", "快去，别让柜台等你。", "Mau đi, đừng để quầy chờ bạn."),
        line("工作人员:", "您好，请问要换多少？", "Xin chào, bạn muốn đổi bao nhiêu?"),
        line("Cam:", "我先换一百，剩下的钱请帮我存起来。", "Tôi đổi một trăm trước, số còn lại xin giúp tôi gửi vào."),
        line("工作人员:", "这里是换钱柜台，存钱请重新取号。", "Đây là quầy đổi tiền, gửi tiền xin vui lòng lấy số lại."),
    ],
    7: [
        line("Coca:", "今天天气怎么样？", "Thời tiết hôm nay thế nào?"),
        line("Cam:", "预报说上午晴，下午有雨。", "Dự báo nói sáng nắng, chiều có mưa."),
        line("Coca:", "现在温度二十八度，有点儿热。", "Bây giờ nhiệt độ 28 độ, hơi nóng."),
        line("Cam:", "我带了雨伞，但是没带帽子。", "Tôi mang ô nhưng không mang mũ."),
        line("Coca:", "雨伞也可以挡太阳。", "Ô cũng có thể che nắng."),
        line("Cam:", "那我们下午去爬山吧。", "Vậy chiều chúng ta đi leo núi nhé."),
        line("Coca:", "下雨的时候爬山不安全。", "Leo núi lúc mưa không an toàn."),
        line("Cam:", "那上午去，现在就出发。", "Vậy đi buổi sáng, xuất phát ngay bây giờ."),
        line("旁白:", "他们刚走到门口，天就下起大雨。", "Họ vừa tới cửa thì trời đổ mưa lớn."),
        line("Cam:", "天气预报是不是把上午和下午说反了？", "Có phải dự báo thời tiết nói ngược sáng và chiều không?"),
        line("Coca:", "至少你的雨伞带对了。", "Ít nhất bạn đã mang đúng ô."),
        line("Cam:", "今天最好的运动是在家看爬山视频。", "Môn thể thao tốt nhất hôm nay là ở nhà xem video leo núi."),
    ],
    8: [
        line("Coca:", "你学汉语多长时间了？", "Bạn học tiếng Trung bao lâu rồi?"),
        line("Cam:", "半年了，但是我说得还不太流利。", "Nửa năm rồi, nhưng tôi nói vẫn chưa lưu loát lắm."),
        line("Coca:", "你每天都学习吗？", "Bạn có học mỗi ngày không?"),
        line("Cam:", "我每天记生词，也听课文录音。", "Mỗi ngày tôi học từ mới và nghe ghi âm bài khóa."),
        line("Coca:", "你的发音已经进步很多了。", "Phát âm của bạn đã tiến bộ nhiều rồi."),
        line("Cam:", "可是我一紧张就忘词。", "Nhưng cứ căng thẳng là tôi quên từ."),
        line("Coca:", "我们现在只说汉语，练习五分钟。", "Bây giờ chúng ta chỉ nói tiếng Trung, luyện năm phút."),
        line("Cam:", "好。你……今天……吃……了吗？", "Được. Bạn… hôm nay… ăn… chưa?"),
        line("Coca:", "吃了。你不用一个字一个字地说。", "Ăn rồi. Bạn không cần nói từng chữ một."),
        line("Cam:", "我在给大脑时间找生词。", "Tôi đang cho não thời gian tìm từ mới."),
        line("Coca:", "那就把自己的录音听一遍，再说快一点儿。", "Vậy hãy nghe lại bản ghi âm của chính mình rồi nói nhanh hơn."),
        line("Cam:", "明白，进步就是今天比昨天少停一次。", "Hiểu rồi, tiến bộ là hôm nay dừng ít hơn hôm qua một lần."),
    ],
    9: [
        line("Coca:", "你吃饭了吗？", "Bạn ăn cơm chưa?"),
        line("Cam:", "还没有，我忙得忘了时间。", "Chưa, tôi bận tới mức quên thời gian."),
        line("Coca:", "你想出去吃还是叫外卖？", "Bạn muốn ra ngoài ăn hay gọi đồ giao tận nơi?"),
        line("Cam:", "我太饿了，叫外卖比较快。", "Tôi đói quá, gọi đồ giao sẽ nhanh hơn."),
        line("Coca:", "这家店的饺子不错。", "Sủi cảo của quán này khá ngon."),
        line("Cam:", "那就要两份，再要一个汤。", "Vậy gọi hai phần và thêm một món canh."),
        line("外卖员:", "您好，您的外卖到了。", "Xin chào, đồ ăn của bạn tới rồi."),
        line("Cam:", "这么快？我们刚点一分钟。", "Nhanh vậy? Chúng tôi vừa đặt một phút."),
        line("外卖员:", "对不起，这是楼下客人的。", "Xin lỗi, đây là của khách tầng dưới."),
        line("Coca:", "你的表情告诉我，你真的很饿。", "Biểu cảm của bạn cho tôi biết bạn thật sự rất đói."),
        line("Cam:", "如果他们吃不完，可以帮我打包。", "Nếu họ ăn không hết, có thể đóng gói giúp tôi."),
        line("Coca:", "别着急，你的外卖还有二十九分钟。", "Đừng vội, đồ ăn của bạn còn 29 phút nữa."),
    ],
    10: [
        line("Cam:", "我已经到北京了，今天想去看胡同。", "Tôi đã tới Bắc Kinh, hôm nay muốn đi xem ngõ cổ."),
        line("Coca:", "你做旅游攻略了吗？", "Bạn đã làm cẩm nang du lịch chưa?"),
        line("Cam:", "做了，我把要去的地方都写在手机里。", "Rồi, tôi viết tất cả nơi cần đi trong điện thoại."),
        line("Coca:", "手机还有电吗？", "Điện thoại còn pin không?"),
        line("Cam:", "只剩百分之三。", "Chỉ còn ba phần trăm."),
        line("Coca:", "那你最好带一张地图。", "Vậy tốt nhất bạn nên mang bản đồ."),
        line("旁白:", "一个小时后，Cam 在一条胡同里迷路了。", "Một giờ sau, Cam bị lạc trong một con ngõ."),
        line("Cam:", "请问，地铁站怎么走？", "Xin hỏi đi tới ga tàu điện ngầm thế nào?"),
        line("老人:", "一直往前走，到第二个路口左转。", "Đi thẳng, tới giao lộ thứ hai thì rẽ trái."),
        line("Cam:", "谢谢！我的攻略只告诉我怎么来，没告诉我怎么回去。", "Cảm ơn! Cẩm nang của tôi chỉ nói cách tới, không nói cách về."),
        line("Coca:", "这次迷路也可以写进下一版攻略。", "Lần lạc đường này cũng có thể viết vào bản cẩm nang tiếp theo."),
        line("Cam:", "标题就叫《手机没电以后》。", "Tiêu đề sẽ là “Sau khi điện thoại hết pin”."),
    ],
    11: [
        line("Cam:", "我想租一间房，你能陪我去见房东吗？", "Tôi muốn thuê một căn phòng, bạn đi gặp chủ nhà cùng được không?"),
        line("Coca:", "可以，你最关心什么？", "Được, bạn quan tâm nhất điều gì?"),
        line("Cam:", "离学校近，房间有阳台，价格也不能太贵。", "Gần trường, phòng có ban công và giá không quá đắt."),
        line("房东:", "这间房很安静，走路十分钟就到学校。", "Phòng này rất yên tĩnh, đi bộ mười phút tới trường."),
        line("Coca:", "一个月多少钱？", "Một tháng bao nhiêu tiền?"),
        line("房东:", "两千五，还要交一个月押金。", "Hai nghìn năm trăm, còn phải đặt cọc một tháng."),
        line("Cam:", "阳台为什么这么小？", "Tại sao ban công nhỏ vậy?"),
        line("房东:", "可以放两把椅子。", "Có thể đặt hai cái ghế."),
        line("Cam:", "如果放了椅子，人站在哪儿？", "Nếu đặt ghế rồi, người đứng ở đâu?"),
        line("房东:", "人可以坐在椅子上。", "Người có thể ngồi trên ghế."),
        line("Coca:", "这个回答很聪明，房租能不能也聪明一点儿？", "Câu trả lời rất thông minh, tiền thuê có thể thông minh hơn một chút không?"),
        line("房东:", "如果今天决定，我可以少收一百。", "Nếu quyết định hôm nay, tôi có thể bớt một trăm."),
    ],
    12: [
        line("Coca:", "这个周末你坐什么去旅行？", "Cuối tuần này bạn đi du lịch bằng gì?"),
        line("Cam:", "我坐高铁，两个小时就到了。", "Tôi đi tàu cao tốc, hai tiếng là tới."),
        line("Coca:", "你几点出发？", "Bạn xuất phát lúc mấy giờ?"),
        line("Cam:", "上午八点，所以我要六点起床。", "Tám giờ sáng, nên tôi phải dậy lúc sáu giờ."),
        line("Coca:", "行李准备好了吗？", "Hành lý chuẩn bị xong chưa?"),
        line("Cam:", "差不多了，只带衣服、相机和一本书。", "Gần xong rồi, chỉ mang quần áo, máy ảnh và một quyển sách."),
        line("Coca:", "你为什么带三双鞋？", "Tại sao bạn mang ba đôi giày?"),
        line("Cam:", "一双走路，一双拍照，一双下雨穿。", "Một đôi đi bộ, một đôi chụp ảnh, một đôi đi khi mưa."),
        line("Coca:", "你的旅行只有两天。", "Chuyến đi của bạn chỉ có hai ngày."),
        line("Cam:", "可是鞋不知道哪一天下雨。", "Nhưng giày không biết ngày nào trời mưa."),
        line("广播:", "请旅客不要携带过多行李。", "Xin hành khách không mang quá nhiều hành lý."),
        line("Coca:", "听见了吗？高铁已经替我回答你了。", "Nghe thấy chưa? Tàu cao tốc đã trả lời thay tôi rồi."),
    ],
    13: [
        line("Coca:", "你的脸怎么这么红？", "Sao mặt bạn đỏ vậy?"),
        line("Cam:", "我可能发烧了，身体不太舒服。", "Có lẽ tôi bị sốt, người không khỏe lắm."),
        line("Coca:", "我们去医院吧，先挂号。", "Chúng ta tới bệnh viện, đăng ký khám trước."),
        line("护士:", "请问您哪儿不舒服？", "Xin hỏi bạn khó chịu ở đâu?"),
        line("Cam:", "头疼、嗓子疼，还一直咳嗽。", "Đau đầu, đau họng và ho liên tục."),
        line("医生:", "体温三十八度，需要吃药和休息。", "Nhiệt độ 38 độ, cần uống thuốc và nghỉ ngơi."),
        line("Cam:", "我明天能去上课吗？", "Ngày mai tôi có thể đi học không?"),
        line("医生:", "如果不发烧了就可以。", "Nếu hết sốt thì có thể."),
        line("Coca:", "医生，请把“不能玩游戏”也写进药方。", "Bác sĩ, xin hãy viết cả “không được chơi game” vào đơn thuốc."),
        line("Cam:", "玩游戏可以让我忘记头疼。", "Chơi game có thể khiến tôi quên đau đầu."),
        line("医生:", "睡觉也可以，而且不需要充电。", "Ngủ cũng được, hơn nữa không cần sạc pin."),
        line("Cam:", "好吧，我今天听医生的。", "Được rồi, hôm nay tôi nghe lời bác sĩ."),
    ],
    14: [
        line("Coca:", "考试快到了，你准备得怎么样？", "Kỳ thi sắp tới, bạn chuẩn bị thế nào rồi?"),
        line("Cam:", "我做了一个复习计划，每天学三个小时。", "Tôi đã làm kế hoạch ôn tập, mỗi ngày học ba tiếng."),
        line("Coca:", "这个计划已经开始了吗？", "Kế hoạch này đã bắt đầu chưa?"),
        line("Cam:", "明天开始，今天先把计划写漂亮。", "Ngày mai bắt đầu, hôm nay viết kế hoạch cho đẹp trước."),
        line("Coca:", "昨天的模拟考试你参加了吗？", "Bạn có tham gia kỳ thi thử hôm qua không?"),
        line("Cam:", "参加了，听力成绩不错，阅读有点儿低。", "Có, điểm nghe khá tốt, đọc hơi thấp."),
        line("Coca:", "那就多读短文，别只画时间表。", "Vậy hãy đọc thêm bài ngắn, đừng chỉ vẽ thời gian biểu."),
        line("Cam:", "我每完成一项就画一个笑脸。", "Mỗi khi hoàn thành một mục tôi vẽ một mặt cười."),
        line("Coca:", "你现在画了几个？", "Bây giờ bạn đã vẽ mấy cái?"),
        line("Cam:", "一个，因为我完成了“画复习计划”。", "Một cái, vì tôi đã hoàn thành mục “vẽ kế hoạch ôn tập”."),
        line("老师:", "真正的笑脸要等成绩出来以后再画。", "Mặt cười thật sự hãy đợi sau khi có kết quả rồi vẽ."),
        line("Cam:", "明白，我现在就开始第一篇阅读。", "Em hiểu, bây giờ em bắt đầu bài đọc đầu tiên."),
    ],
    15: [
        line("Coca:", "你学汉语半年了，有什么目标？", "Bạn học tiếng Trung nửa năm rồi, có mục tiêu gì?"),
        line("Cam:", "我希望明年能说得更流利。", "Tôi hy vọng năm sau có thể nói lưu loát hơn."),
        line("Coca:", "你打算怎么做？", "Bạn dự định làm thế nào?"),
        line("Cam:", "每天听二十分钟，读一篇短文，再跟朋友聊天。", "Mỗi ngày nghe hai mươi phút, đọc một bài ngắn rồi trò chuyện với bạn."),
        line("Coca:", "最重要的是坚持。", "Quan trọng nhất là kiên trì."),
        line("Cam:", "我已经坚持六天了。", "Tôi đã kiên trì sáu ngày rồi."),
        line("Coca:", "今天是第七天，你学了吗？", "Hôm nay là ngày thứ bảy, bạn học chưa?"),
        line("Cam:", "我正在跟你说汉语，这也算学习。", "Tôi đang nói tiếng Trung với bạn, việc này cũng tính là học."),
        line("Coca:", "那你今天的目标是什么？", "Vậy mục tiêu hôm nay của bạn là gì?"),
        line("Cam:", "不说一句越南语，坚持十分钟。", "Không nói một câu tiếng Việt nào, kiên trì mười phút."),
        line("服务员:", "请问两位喝什么？", "Xin hỏi hai bạn uống gì?"),
        line("Cam:", "我要……那个……算了，请给我菜单，我还需要坚持学习。", "Tôi muốn… cái đó… thôi, cho tôi thực đơn, tôi vẫn cần tiếp tục kiên trì học."),
    ],
}


def prepare_manual_lookup(word_lookup):
    for word, row in MANUAL_WORDS.items():
        word_lookup.setdefault(word, row)


def choose_extended_words(requested, lesson, full_text, level, word_lookup):
    main_words = {
        item.get("hanzi") for item in lesson.get("vocabulary") or [] if item.get("hanzi")
    }
    selected = []
    for word in requested:
        if word in main_words or word in selected or word not in full_text:
            continue
        selected.append(word)

    candidates = []
    for word, row in word_lookup.items():
        source_level = int(row.get("hsk") or 99)
        if (
            len(word) < 2
            or word in main_words
            or word in selected
            or word not in full_text
            or source_level > level + 2
        ):
            continue
        candidates.append((full_text.index(word), -len(word), word))
    candidates.sort()
    for _, _, word in candidates:
        if len(selected) >= 3:
            break
        selected.append(word)

    if len(selected) != 3:
        raise ValueError(
            f"HSK{level} bài {lesson['lessonId']} không chọn đủ ba từ mở rộng"
        )
    return selected


def rebuild_level(level, dialogue_map, extended_map, word_lookup):
    course_dir = COURSE_DIR / f"hsk{level}"
    index = load_json(course_dir / "index.json")
    report = []

    for index_item in index:
        lesson_id = int(index_item["lessonId"])
        lesson_path = course_dir / index_item["file"]
        lesson = load_json(lesson_path)
        dialogue = dialogue_map[lesson_id]
        all_text = "".join(item["chinese"] for item in dialogue)
        extended_words = choose_extended_words(
            extended_map[lesson_id], lesson, all_text, level, word_lookup
        )
        extended = build_extended_vocabulary(
            extended_words, level, lesson_id, word_lookup, MANUAL_WORDS
        )
        primary = [*(lesson.get("vocabulary") or []), *extended]
        rendered = []
        all_segments = []

        for line_index, item in enumerate(dialogue, start=1):
            chinese = item["chinese"]
            segments = segment_text(chinese, primary, word_lookup)
            all_segments.extend(segments)
            rendered.append(
                {
                    **item,
                    "pinyin": sentence_pinyin(chinese),
                    "audio": f"dialogue/{line_index:03d}.mp3",
                    "segments": segments,
                }
            )

        for word in extended_words:
            if word not in all_text:
                raise ValueError(f"HSK{level} bài {lesson_id} chưa dùng từ mở rộng {word}")

        lesson["meta"] = {
            **(lesson.get("meta") or {}),
            "estimatedMinutes": 30 if level == 1 else 40,
            "version": 4,
            "contentRevision": "2026-07-dialogue-refresh",
            "dialogueLineCount": len(rendered),
        }
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
        lesson["extendedVocabulary"] = extended
        lesson["lessonText"] = rendered
        lesson["vocabularyPages"] = chunk_list(lesson.get("vocabulary") or [])
        lesson["extendedVocabularyPages"] = chunk_list(extended)
        lesson["quality"] = {
            **(lesson.get("quality") or {}),
            "mainVocabularyCount": len(lesson.get("vocabulary") or []),
            "extendedVocabularyCount": len(extended),
            "dialogueLineCount": len(rendered),
            "interactiveSegments": sum(
                1 for segment in all_segments if segment.get("clickable")
            ),
            "lookupCoveragePercent": lookup_coverage(all_segments, all_text),
            "extendedWordsUsed": True,
            "copyrightSafe": True,
        }
        write_json(lesson_path, lesson)
        report.append(
            {
                "lessonId": lesson_id,
                "lines": len(rendered),
                "extended": len(extended),
                "coverage": lesson["quality"]["lookupCoveragePercent"],
            }
        )

    return report


def main():
    word_lookup = load_word_lookup()
    prepare_manual_lookup(word_lookup)
    result = {
        "hsk1": rebuild_level(1, HSK1_DIALOGUES, HSK1_EXTENDED, word_lookup),
        "hsk2": rebuild_level(2, HSK2_DIALOGUES, HSK2_EXTENDED, word_lookup),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    import json

    main()
