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


HSK3_TOPICS = {
    1: {
        "chineseTitle": "咖啡店里的音乐比赛",
        "body": "苏明和明月准备开一家小咖啡店。苏明喜欢安静的古典音乐，认为客人听着名曲会更放松；明月却觉得年轻人更爱流行歌曲，歌词也容易记住。两个人争了半天，谁也不愿意改变意见。后来，他们决定做一个小实验：上午播放民歌，下午播放流行音乐，晚上再换成钢琴曲。三天以后，他们发现客人最关心的不是音乐种类，而是咖啡好不好喝、说话方不方便。从那以后，两个人不再比较谁的爱好更好，而是每天根据时间和客人的需要安排音乐。",
        "answer": "Ý kiến khác nhau có thể được giải quyết bằng thử nghiệm thực tế và lắng nghe nhu cầu của khách.",
    },
    2: {
        "chineseTitle": "南方学生的第一个北方冬天",
        "body": "小兰从南方到北京上学时，以为冬天只要多穿一件衣服就够了。十一月的一天，气温突然下降，她走出宿舍才发现风比想象中冷得多。教室里虽然有暖气，她的手还是一直发凉。同屋告诉她，北方的室内很暖和，出门却要戴帽子和手套，还要注意天气预报。一个月后，小兰已经习惯了北方生活。她发现南北方的冬天各有特点：南方空气湿，北方风大；南方屋里可能更冷，北方屋外的雪却让城市变得特别漂亮。",
        "answer": "Bài đọc so sánh mùa đông Nam–Bắc và cho thấy con người có thể dần thích nghi với môi trường mới.",
    },
    3: {
        "chineseTitle": "冬衣交换角",
        "body": "冬天快到了，学校里的国际学生开始准备厚衣服。有人买了新大衣，也有人发现去年的衣服已经不能穿。明月提出在宿舍楼下设一个“冬衣交换角”：大家把干净但不需要的帽子、围巾和外套放在那里，需要的人可以免费拿走。开始时，有些同学觉得不好意思，担心别人认为自己没有钱。后来老师先放了一件自己的大衣，还写了一张纸条：“让一件衣服继续保暖，比让它一直躺在箱子里更有意义。”几天以后，交换角不但装满了衣服，也贴满了感谢卡。",
        "answer": "Góc đổi áo mùa đông giúp đồ cũ tiếp tục hữu ích và khiến sinh viên biết chia sẻ với nhau.",
    },
    4: {
        "chineseTitle": "最后一班车还没开",
        "body": "晚上，苏明和明月跑到车站时，最后一班车马上就要开了。明月已经上车，苏明却突然发现钱包不见了。他想回刚才的商店找，又怕来不及。司机知道以后没有马上关门，而是让其他乘客先坐好。就在这时，一位老人从后面赶来，手里拿着苏明的钱包。原来苏明买水时把钱包落在了柜台上。苏明连声感谢，老人只说：“下次别跑得这么急，越着急越容易忘东西。”车终于开了，虽然晚了两分钟，却没有一个乘客抱怨。大家都觉得，等回一个钱包比准时两分钟更重要。",
        "answer": "Chuyến xe chờ thêm hai phút để Tô Minh nhận lại ví, cho thấy sự giúp đỡ quan trọng hơn chút chậm trễ.",
    },
    5: {
        "chineseTitle": "公园里的黄河钢琴曲",
        "body": "周日早上，明月在公园听见有人用旧钢琴演奏《黄河》。弹琴的是一位头发很白的老人，旁边只有几个孩子。老人说，他年轻时是音乐老师，退休以后每周都来这里弹一小时。钢琴虽然旧，有些声音也不够准，但他希望没有机会进音乐厅的人也能听到好音乐。一位小女孩问他为什么总弹同一首曲子。老人笑着说，每次天气、听众和心情都不同，所以同一首曲子也不会完全一样。演奏结束后，越来越多的人停下来鼓掌，公园像一个没有门票的小音乐厅。",
        "answer": "Âm nhạc trở nên có ý nghĩa khi được chia sẻ, ngay cả với một cây đàn cũ trong công viên.",
    },
    6: {
        "chineseTitle": "跟错旅游团以后",
        "body": "苏明第一次参加旅游团，导游让大家记住黄色的小旗。到了景点，他忙着拍照，抬头看见一面黄色的旗，就急忙跟了过去。走了十分钟，他才发现周围的人都说另一种语言，导游也不是原来的导游。幸好对方听懂了“我跟错团了”，马上帮他给自己的导游打电话。回到队伍后，朋友们都笑他只记住了颜色，没有看清旗子上的名字。苏明并不生气，还主动把这次经历讲给大家听。从那以后，他不仅跟着旗子走，也会记下集合地点和导游的号码。",
        "answer": "Khi đi theo đoàn cần nhớ cả điểm tập trung và thông tin hướng dẫn viên, không chỉ nhìn màu cờ.",
    },
    7: {
        "chineseTitle": "护照在复印机里",
        "body": "出发前一天，哥哥突然找不到护照了。全家把抽屉、书包和衣柜都检查了一遍，连冰箱也看了，还是没有找到。妹妹问他最后一次用护照是什么时候，他想起来上午去打印店复印过材料。两个人赶到店里，老板已经下班，门也锁了。第二天一早，他们刚到门口，老板就拿着护照出来。原来护照一直放在复印机的盖子下面。哥哥终于松了一口气，也明白了找东西不能只靠着急，应该先回想使用的时间、地点和动作。后来他给重要物品准备了固定的袋子。",
        "answer": "Muốn tìm đồ thất lạc hiệu quả nên nhớ lại lần sử dụng cuối và cất vật quan trọng ở một chỗ cố định.",
    },
    8: {
        "chineseTitle": "修不好的旧眼镜",
        "body": "父亲送给苏明的眼镜用了很多年。有一天镜腿突然坏了，朋友劝他直接买一副新的，他却拿到小店去修。师傅看了以后说，旧零件已经很难找到，就算修好也可能很快再坏。苏明有些失望，因为这副眼镜让他想起父亲陪自己第一次配眼镜的下午。师傅想了想，把还能使用的镜框清理干净，装进一个透明的小盒子，又帮他选择了一副更轻的新眼镜。苏明戴着新眼镜看得更清楚，也把旧眼镜留在书桌上。他懂得，珍惜回忆不一定要继续使用旧东西，也可以好好保存它的故事。",
        "answer": "Có thể gìn giữ kỷ niệm theo cách mới thay vì buộc phải tiếp tục dùng một món đồ đã hỏng.",
    },
    9: {
        "chineseTitle": "门上的钥匙",
        "body": "晚上十一点，楼上的邻居敲苏明的门，说他的钥匙还插在外面的锁上。苏明吃了一惊，赶快把钥匙取下来。他想起回家时一手拿着菜，一手接电话，开门以后就把这件事忘了。邻居没有批评他，只提醒他这样很不安全。第二天，苏明在门里面贴了一张小纸条：“关门、取钥匙、看手机。”开始几天，他每次出门都认真读一遍。过了一个月，这三个动作已经成了习惯。那张纸条虽然不再需要，他还是没有拿掉，因为它也提醒他：生活中的很多麻烦，并不是大问题，而是少做了一个小动作。",
        "answer": "Một lời nhắc nhỏ có thể giúp hình thành thói quen an toàn và tránh rắc rối lớn.",
    },
    10: {
        "chineseTitle": "谁忘了关会议室的门",
        "body": "公司下班后，会议室的门还开着，灯也亮着。经理以为有人忘了关，第二天便问大家。每个人都说自己离开时检查过，最后大家一起看门口的录像。原来清洁机器人经过时碰到了门，门慢慢打开，灯也因为感应到动作自动亮了。大家本来想找“粗心的人”，结果发现问题出在设备的设置。技术人员调整了机器人的路线，又给门加了自动关闭的时间。经理说，出现问题时先找原因，不要急着找一个人负责。这样既能解决事情，也不会让同事之间产生不必要的误会。",
        "answer": "Khi có sự cố nên tìm nguyên nhân hệ thống trước khi vội quy trách nhiệm cho một cá nhân.",
    },
    11: {
        "chineseTitle": "四合院的最后一个秋天",
        "body": "奶奶住了四十年的四合院要修理，秋天以后大家需要暂时搬走。院子不大，中间却有一棵老枣树。小时候，孩子们在树下写作业、听故事；长大以后，他们去了不同的城市，只有过节才回来。搬家前，全家决定在院子里再吃一次晚饭。奶奶没有一直说过去，而是让每个人讲一件将来想做的事。她说，房子可以改变，生活也会向前走，重要的是家人还愿意坐在一起。晚饭结束时，一颗枣落在桌上，大家都笑了。这个秋天不是告别，而是给共同记忆换一个新的地方。",
        "answer": "Ngôi nhà có thể thay đổi, nhưng ký ức và sự gắn kết gia đình vẫn có thể được mang sang nơi ở mới.",
    },
    12: {
        "chineseTitle": "公园里的人为什么变少了",
        "body": "小区旁边的公园以前每天都很热闹，最近来散步的人却越来越少。有人说工作太忙，有人认为手机里的娱乐更多，也有人觉得公园的椅子太旧、晚上灯不够亮。社区没有马上得出结论，而是在不同时间观察了一个星期，又请居民写下意见。调查发现，很多老人担心路面不平，年轻父母则希望有安全的儿童区。社区修好了小路，增加照明，还安排周末的小型活动。一个月后，公园里的人慢慢多了起来。这件事说明，公共空间不能只看起来漂亮，还要真正回答使用者的需要。",
        "answer": "Muốn không gian công cộng có người sử dụng thì phải quan sát và đáp ứng nhu cầu thật của nhiều nhóm cư dân.",
    },
    13: {
        "chineseTitle": "改变一天的一句话",
        "body": "小雨早上迟到，又在课堂上回答错问题，心情一直不好。中午她一个人坐在食堂，觉得今天做什么都不会顺利。收盘子的阿姨经过时看见她的画本，随口说了一句：“这朵花画得真有精神。”小雨有些意外，因为那只是她等饭时画的小图。下午，她把这句话写在画旁边，又主动帮助同学完成海报。放学前，老师表扬了他们的合作。回家路上，小雨发现，早上的错误并没有决定整整一天。别人的一句真诚肯定虽然很短，却能让一个人重新看见自己的优点，也愿意把好心情传给别人。",
        "answer": "Một lời công nhận chân thành có thể giúp người đang thất vọng nhìn lại điểm tốt và thay đổi phần còn lại của ngày.",
    },
    14: {
        "chineseTitle": "买不到的星期日下午",
        "body": "父亲工作很忙，常常用礼物补上错过的时间。儿子想要什么，他几乎都会买。一个星期日下午，父亲又问儿子需要什么新玩具，儿子却说只想一起去河边骑车。父亲本来还有邮件要回，最后还是关上电脑出门了。他们没有去很远，也没有花多少钱，只是在桥边吃了一个冰淇淋，谈学校里的朋友和最近读的故事。晚上儿子说，这是今年最喜欢的一份礼物。父亲这才明白，有些珍贵的东西不能放进购物车：专心听一个人说话、一起度过的时间，以及让对方感到自己比工作更重要。",
        "answer": "Thời gian và sự chú ý dành cho người thân thường quý hơn món quà có thể mua bằng tiền.",
    },
    15: {
        "chineseTitle": "老师留下的空白页",
        "body": "高中毕业时，老师送给每个学生一本小笔记本。别人收到的本子第一页都有祝福，只有小林的第一页是空白。他以为老师忘了，心里有一点儿失望。几年后，他回学校看老师，终于问起这件事。老师笑着说：“我不是忘了，而是希望你自己写。那时你总觉得别人应该告诉你怎么选择，我想把第一页留给你的决定。”小林回家后在空白页上写下：遇到重要问题，先听建议，再为自己的选择负责。他一直没有忘记这位老师，因为老师给他的不是一个标准答案，而是一张可以开始独立思考的白纸。",
        "answer": "Người thầy để trang đầu trống để học sinh tự lựa chọn và chịu trách nhiệm cho con đường của mình.",
    },
    16: {
        "chineseTitle": "山顶不是唯一的答案",
        "body": "公司组织爬山，苏明一开始很有信心，觉得自己一定能第一个到山顶。走到一半，一位同事脚疼，只能放慢速度。其他人继续往上走，苏明犹豫了一会儿，决定留下来陪他。他们边走边休息，最后没有赶上山顶的合影，却在半山看到了一片很安静的云海。同事一直向苏明道歉，苏明却说：“我原来只想证明自己爬得快，现在发现一起安全回来更重要。”下山后，大家把半山的照片也放进活动纪念册。一次旅行不只有一个成功标准，有时照顾同伴也是到达。",
        "answer": "Thành công của chuyến leo núi không chỉ là lên đỉnh mà còn là bảo đảm đồng đội cùng trở về an toàn.",
    },
    17: {
        "chineseTitle": "一张旧车票帮我想起来",
        "body": "整理书桌时，明月发现一张已经退色的车票，却怎么也想不起那次旅行。票上只有日期和城市，没有照片。她给当年同行的朋友发消息，朋友提醒她，那天火车晚点，他们在车站帮助一位老人找到了家人。明月慢慢记起，老人为了感谢他们，送了两只很小的橘子。她一直以为重要记忆需要很多照片，后来才发现，一张普通车票、一个味道或者一句话都可能打开过去。她在票的背面写下事情的经过，再把它放进新的笔记本。保存记忆，不只是留下物品，也要及时写下物品背后的故事。",
        "answer": "Đồ vật nhỏ có thể mở lại ký ức, nhưng nên ghi lại câu chuyện phía sau để ký ức không mất đi.",
    },
    18: {
        "chineseTitle": "没有景点清单的寒假",
        "body": "寒假前，三个朋友讨论去哪儿旅行。一个人想去有雪的地方，一个人只想吃当地小吃，另一个人希望每天睡到自然醒。他们列了很长的景点清单，却发现五天根本走不完。最后，大家只选了两个最想去的地方，其余时间留给散步和临时决定。旅行开始后，他们在一条没有写进攻略的小街上遇到手工市场，还跟店主学做了一盏灯。回家时，照片不算多，每个人却都能讲出完整的故事。他们明白，计划能让旅行更安心，但安排得太满也会错过真正发生在路上的惊喜。",
        "answer": "Kế hoạch vừa đủ tạo sự yên tâm, còn khoảng trống giúp chuyến đi có những trải nghiệm bất ngờ.",
    },
    19: {
        "chineseTitle": "迷路以后找谁帮忙",
        "body": "晚上，Lan在陌生城市坐错了公共汽车，下车后手机又没有电。她看见路边有人主动说可以带她去旅馆，却发现对方说的方向和地图牌不一样。Lan礼貌地拒绝，走到亮着灯的便利店，请店员帮忙。店员先让她给手机充电，又告诉她附近有警察服务站。警察根据旅馆地址查到正确路线，还联系旅馆确认有人等她。安全回去后，Lan把经历告诉朋友：遇到困难可以求助，但要选择有清楚身份、固定工作地点的人；如果感觉不对，也有权说“不”。冷静判断比不好意思更重要。",
        "answer": "Khi lạc đường nên tìm nơi và người có danh tính rõ ràng, đồng thời tin vào dấu hiệu không an toàn của bản thân.",
    },
    20: {
        "chineseTitle": "幸运号码改变不了准备",
        "body": "考试前，苏明听说数字八很幸运，便专门选择八号座位，还把八支笔放进书包。明月问他复习得怎么样，他却说只要号码好，题目也会容易。考试开始后，苏明发现真正有用的不是八支笔，而是前一天认真看过的语法。遇到不会的题时，他先做简单的，再回来思考，最后按时完成。成绩出来后，他考得不错，却没有说这是幸运号码的功劳。他把多余的笔分给同学，还在本子上写道：喜欢某个数字可以让人心情好，但不能代替准备、方法和努力。真正可靠的幸运，是自己已经做好了应该做的事。",
        "answer": "Con số may mắn có thể tạo tâm trạng tốt nhưng kết quả vẫn phụ thuộc vào chuẩn bị, phương pháp và nỗ lực.",
    },
}


HSK4_TOPICS = {
    1: {
        "chineseTitle": "简单的爱情",
        "body": "每天傍晚，图书馆快关门时，总有一对老夫妻一起来还书。丈夫负责把书分类，妻子则检查借书日期。有一次下大雨，丈夫先到了，手里却拿着两把伞。工作人员问他为什么不在家等，他说妻子膝盖不舒服，走得慢，但她不愿意因为自己让别人久等。十分钟后，妻子进门，先把一杯热水递给丈夫。两个人没有说浪漫的话，只是自然地替对方整理湿衣服。年轻读者看见这一幕，忽然明白爱情不一定是昂贵礼物，也可以是记得对方怕冷、愿意放慢脚步，以及多年以后仍把普通小事认真做好。",
        "answer": "Tình yêu giản dị thể hiện qua sự quan tâm bền bỉ và những việc nhỏ dành cho nhau.",
    },
    2: {
        "chineseTitle": "真正的朋友",
        "body": "小周参加演讲比赛前非常紧张，请好友阿明帮他练习。第一次排练时，阿明没有只说“很好”，而是指出开头太长、例子不清楚。小周听了有些不高兴，觉得朋友应该鼓励自己。第二天，他看完录像才发现阿明的判断是对的。阿明又陪他重新安排内容，甚至扮演观众提出最难的问题。正式比赛那天，小周虽然没有得第一名，却完成了自己最满意的一次演讲。他终于懂得，真正的朋友不只是陪你开心，也会在尊重你的前提下说出诚实意见，并在你愿意改变时继续陪着你。",
        "answer": "Bạn thật sự vừa động viên vừa góp ý thành thật và hỗ trợ ta sửa đổi.",
    },
    3: {
        "chineseTitle": "经理对我印象不错",
        "body": "实习第一周，小林发现自己发给顾客的表格里有一个数字写错了。问题不大，也暂时没人注意。他犹豫很久，最后还是马上告诉经理，并准备好正确文件和解决办法。经理没有批评他，只让他联系顾客说明情况。几天后，公司开会总结，经理提到小林给大家留下了很深的印象。小林以为是因为自己工作速度快，经理却说：“能力当然重要，但发现错误后不隐藏，还能主动负责，更值得信任。”从那以后，小林做事更加仔细，也不再把“没有人发现”当成“没有问题”。好的印象往往来自一个人在困难时作出的选择。",
        "answer": "Ấn tượng tốt đến từ việc thành thật nhận lỗi, chủ động chịu trách nhiệm và đưa ra cách giải quyết.",
    },
    4: {
        "chineseTitle": "不要太着急赚钱",
        "body": "大学毕业后，阿华收到两份工作邀请。一家公司工资很高，却只能让他重复简单任务；另一家公司收入普通，但愿意安排老师带他学习完整项目。家人希望他选择高工资，他自己也担心错过赚钱机会。阿华请教一位前辈，前辈没有替他决定，只让他写下三年后想拥有的能力和生活。比较以后，阿华选择了第二家公司。开始几个月并不轻松，他需要不断学习，也没有奖金。两年后，他已经能独立负责项目，收入也慢慢增加。他明白，年轻时赚钱很重要，但积累知识、经验和判断力，常常能带来更长久的发展。",
        "answer": "Khi mới đi làm không nên chỉ nhìn lương trước mắt mà cần cân nhắc kỹ năng và phát triển lâu dài.",
    },
    5: {
        "chineseTitle": "只买对的，不买贵的",
        "body": "明月准备买一把旅行用的伞。商场里最贵的伞看起来很漂亮，广告也说使用了新材料；旁边一把价格只有一半，样子普通，却更轻，收起来也更小。售货员没有急着推荐，而是问她常去哪里、行李有多重、是否经常遇到大风。明月试了几次，最后选择了便宜的那把。朋友开始觉得她错过了流行款，旅行回来后却发现这把伞正好能放进小包，下雨时也足够结实。购物的标准不应该只由价格决定。了解自己的实际需要，比较质量和使用场景，才能买到真正合适的东西。",
        "answer": "Món đồ phù hợp với nhu cầu và hoàn cảnh sử dụng quan trọng hơn việc chỉ chọn món đắt hoặc đang thịnh hành.",
    },
    6: {
        "chineseTitle": "一分钱一分货",
        "body": "小区准备给儿童活动室买桌椅。有人建议选择网上最便宜的一套，认为孩子长得快，不需要用太久；负责人却要求先看材料、安全标准和维修服务。他们请三家公司提供样品，让家长和老师一起试用。最便宜的桌子边角太尖，最贵的一套功能很多却不实用，最后大家选择了价格中等、结构最稳定的产品。半年以后，一把椅子出现问题，厂家很快免费修理。大家这才发现，“一分钱一分货”并不是越贵越好，而是价格背后应该有看得见的质量、合理的服务和对使用者负责的态度。",
        "answer": "Giá trị thật nằm ở chất lượng, an toàn và dịch vụ phù hợp chứ không đơn giản là giá càng cao càng tốt.",
    },
    7: {
        "chineseTitle": "最好的医生是自己",
        "body": "老陈总说工作忙，没有时间照顾身体。头疼时吃药，睡不好时喝更多咖啡，直到一次检查发现血压偏高。医生没有给他复杂的办法，只让他每天记录睡眠、饮食和运动。老陈开始提前半小时关电脑，中午少吃太咸的菜，下班后散步。他发现真正困难的不是知道健康知识，而是把小习惯坚持下来。三个月后，检查结果有了改善，心情也更稳定。当然，生病时仍需要专业医生，但一个人每天怎样生活，会不断影响身体。最好的自我照顾，是及时发现信号、接受建议，并为长期健康负责。",
        "answer": "Chăm sóc sức khỏe bắt đầu từ việc nhận biết tín hiệu cơ thể và duy trì thói quen tốt, đồng thời vẫn cần bác sĩ khi bệnh.",
    },
    8: {
        "chineseTitle": "生活中不缺少美",
        "body": "摄影课上，老师没有带学生去著名景点，而是让每个人在回家路上拍三张照片。有人抱怨街道太普通，根本没有美丽风景。小雨放慢脚步后，却注意到修车师傅把工具排得很整齐，卖花的老人正在给一束快干的花喷水，夕阳也正好照在旧墙的一扇窗上。第二天，她的照片没有特别技术，却让同学看了很久。老师说，美不只存在于宏大的景色，也藏在光线、动作和人与人的关系中。我们觉得生活无聊，可能不是周围没有精彩，而是自己走得太快，没有耐心观察那些自然发生的细节。",
        "answer": "Vẻ đẹp có trong chi tiết đời thường nếu ta chậm lại và quan sát bằng sự chú ý thật sự.",
    },
    9: {
        "chineseTitle": "阳光总在风雨后",
        "body": "第一次参加城市长跑，小林给自己定下很高目标。比赛当天突然下雨，他在十公里处摔倒，虽然没有受伤，却只能放慢速度。看着别人不断超过自己，他几次想放弃。路边一位志愿者递给他水，说：“今天安全到达，就是你的成绩。”小林调整呼吸，最后比计划晚了四十分钟到达终点。没有掌声最多的照片，也没有理想名次，但这次失败让他看见自己的急躁。接下来半年，他更科学地训练，也学会根据天气改变计划。第二次比赛晴空万里，他跑得更稳。真正的阳光不是困难自动消失，而是人经历风雨后拥有了新的方法和勇气。",
        "answer": "Sau thất bại, việc điều chỉnh phương pháp và tiếp tục tiến lên mới tạo nên sự trưởng thành thật sự.",
    },
    10: {
        "chineseTitle": "幸福的标准",
        "body": "杂志采访不同年龄的人：“什么是幸福？”小学生说是周末不用早起，大学生说是找到喜欢的方向，上班族希望有时间陪家人，老人则认为身体健康、每天有人说话就很好。记者原来想总结一个共同答案，最后却发现幸福没有统一标准。同一个人在人生不同阶段，答案也会变化。如果总按照别人的收入、房子或照片判断自己，很容易忽略已经拥有的生活。幸福并不等于没有烦恼，而是清楚什么对自己真正重要，愿意为它安排时间，也能在普通日子里感受到关系、成长和选择带来的满足。",
        "answer": "Hạnh phúc không có một tiêu chuẩn chung; mỗi người cần hiểu điều thật sự quan trọng với mình.",
    },
    11: {
        "chineseTitle": "读书好，读好书，好读书",
        "body": "社区图书馆成立了一个读书小组，规则不是比赛谁读得多，而是每月认真讨论一本书。第一次活动时，有人只介绍故事内容，有人不断引用著名评论，大家却很少说自己的看法。管理员提出三个问题：哪一段改变了你的判断？你不同意作者什么？这本书和现实生活有什么联系？从那以后，成员们开始在书页旁写问题，也愿意听不同解释。一本好书不一定给出简单答案，它可能让人发现原来的知识不够完整。好读书是一种习惯，读好书需要选择，而真正的阅读还需要思考、怀疑和交流。",
        "answer": "Đọc tốt không chỉ là đọc nhiều mà còn phải lựa chọn, đặt câu hỏi, suy nghĩ và trao đổi quan điểm.",
    },
    12: {
        "chineseTitle": "用心发现世界",
        "body": "城市观察活动要求学生记录一条街，却不能只写商店名字。开始时，大家不知道还能观察什么。老师提醒他们注意声音、气味、人的动作以及不同时间的变化。早上，早餐店门口最忙；中午，树下的椅子坐满送餐员；晚上，关门后的商店玻璃映出路灯。学生还发现，轮椅很难通过一段太窄的人行道。最后，他们把照片、地图和访问内容做成报告，交给社区讨论。用心发现世界，不是把每个细节都当作风景，而是通过仔细观察理解别人怎样生活，并思考一个环境还能怎样变得更友好。",
        "answer": "Quan sát có chiều sâu giúp hiểu cách người khác sống và nhận ra những điểm môi trường cần cải thiện.",
    },
    13: {
        "chineseTitle": "喝着茶看京剧",
        "body": "学校组织学生体验京剧，很多人担心听不懂，活动负责人便把演出安排在一个小茶馆。演员先介绍脸谱颜色和简单动作，再表演短短的一段。观众可以一边喝茶，一边观察演员怎样用声音、眼神和手势表现人物。演出后，一位从没看过京剧的学生说，自己虽然不能理解所有唱词，却能感到角色的着急和骄傲。演员回答，传统艺术不是只能放在博物馆里，它需要新的观众，也可以用更容易接近的方式介绍。尊重传统并不等于拒绝变化，而是在保留特点的同时，让今天的人愿意走近它。",
        "answer": "Có thể đưa nghệ thuật truyền thống đến gần khán giả mới bằng cách giải thích dễ tiếp cận mà vẫn giữ đặc trưng.",
    },
    14: {
        "chineseTitle": "保护地球母亲",
        "body": "学校食堂每天使用很多一次性塑料盒。环保小组开始时只在门口贴“保护地球”的海报，效果并不明显。后来他们调查发现，有些学生忘记带饭盒，有些人担心清洗麻烦。小组便和食堂合作提供可以借用的盒子，归还后统一清洗；自带饭盒的人还能得到一个小折扣。一个月后，一次性盒子的数量明显减少。大家认识到，环保不能只靠口号或批评个人，还要改变不方便的条件，让更好的选择容易做到。地球需要宏大的政策，也需要每个地方根据实际问题设计可持续的方法。",
        "answer": "Bảo vệ môi trường hiệu quả cần thay đổi điều kiện và thiết kế lựa chọn thuận tiện, không chỉ tuyên truyền khẩu hiệu.",
    },
    15: {
        "chineseTitle": "教育孩子的艺术",
        "body": "孩子不小心打破杯子后，父亲的第一反应是生气，但他看见孩子吓得不敢动，便先让他离开碎片。两个人一起清理时，父亲问事情是怎么发生的。孩子承认自己在屋里追球，也主动提出用零花钱买一个新杯子。父亲没有要求他马上赔偿，而是让他写下三条更安全的游戏规则。几天后，孩子把杯子的钱放在桌上，父亲只收了一半，另一半让他存起来。教育的目的不是让孩子害怕错误，而是帮助他理解后果、学习负责，并相信诚实说明问题后仍有机会改正。",
        "answer": "Giáo dục tốt giúp trẻ hiểu hậu quả, nhận trách nhiệm và có cơ hội sửa sai thay vì chỉ sợ bị phạt.",
    },
    16: {
        "chineseTitle": "生活可以更美好",
        "body": "社区门口有三级台阶，推婴儿车的家长、拉行李的老人和使用轮椅的人都不方便。居民曾多次抱怨，却一直认为改造太麻烦。一次社区会议上，设计专业的大学生画出简单方案，商店愿意让出一小块位置，居民也共同申请了维修资金。新的斜坡完成后，人们才发现受益者远不止轮椅使用者：送货员推车更轻松，雨天也少有人在台阶上滑倒。生活变得美好，常常不是增加华丽装饰，而是认真看见谁被挡在外面，再通过合作消除一个具体障碍。",
        "answer": "Cải thiện khả năng tiếp cận cho một nhóm thường tạo lợi ích cho cả cộng đồng.",
    },
    17: {
        "chineseTitle": "人与自然",
        "body": "河边湿地曾经因为游客太多受到破坏。为了保护鸟类，有人建议完全关闭；附近居民却担心失去散步空间和旅游收入。管理团队邀请研究人员、居民和商家共同讨论，最后划出核心保护区，限制进入时间，同时保留一条远离鸟巢的观察路线。志愿者负责介绍规则，商家也减少强光和噪声。一年后，鸟的数量逐渐恢复，游客仍能在合适距离观察自然。人与自然并不是只能选择利用或禁止。尊重生态规律、根据证据调整行为，才能让保护和生活形成更长久的平衡。",
        "answer": "Con người có thể vừa bảo vệ hệ sinh thái vừa sử dụng không gian hợp lý nhờ quy hoạch và điều chỉnh dựa trên bằng chứng.",
    },
    18: {
        "chineseTitle": "科技与世界",
        "body": "山村学校网络不稳定，外地老师的在线课程常常中断。技术团队没有直接送来最新设备，而是先了解当地电力、信号和教师使用习惯。他们把课程做成可以提前下载的小文件，又培训本地老师管理内容。学生不需要一直在线，也能观看实验视频并提交作业。半年后，设备并不比城市学校先进，使用效果却明显提高。这说明科技的价值不只在速度和新功能，更在于是否解决真实问题。把人的条件、知识和维护能力考虑进去，技术才会缩短距离；否则，再贵的机器也可能只是放在教室里的摆设。",
        "answer": "Công nghệ chỉ thật sự thu hẹp khoảng cách khi phù hợp điều kiện địa phương và giải quyết nhu cầu thực tế.",
    },
    19: {
        "chineseTitle": "生活的味道",
        "body": "奶奶做汤从来不用量杯，只说“盐放一点儿，火慢一点儿”。孙女第一次跟着学，认真记录每个数字，做出的味道却还是不同。奶奶让她先闻香味，再看蔬菜颜色，最后尝一小口。她说，菜谱能告诉人基本方法，但食材每天不完全一样，做饭的人也要学会判断。后来孙女在外地生活，每次想家就做这碗汤。她终于明白，生活的味道既来自材料，也来自耐心、经验和与某个人共同度过的时间。一道普通的菜因为记忆而特别，却也会在新的厨房里慢慢有新的味道。",
        "answer": "Hương vị món ăn được tạo bởi nguyên liệu, kinh nghiệm và ký ức chung, rồi tiếp tục thay đổi trong đời sống mới.",
    },
    20: {
        "chineseTitle": "路上的风景",
        "body": "坐长途火车时，很多乘客一上车就戴耳机、看手机。小林的手机刚好没电，只能望向窗外。他看见城市高楼慢慢变成田野，又看见远处有人在河边工作。对面老人拿出自己带的水果，告诉他沿线几个地方名字的来历。火车因为天气晚点，车厢里起初有人着急，后来大家开始聊天、分享食物。到站时，小林没有拍下一张照片，却记住了窗外变化和陌生人的故事。我们总想快点到达目的地，容易把路程看成等待；其实只要抬起头，路上也在不断提供认识世界的机会。",
        "answer": "Hành trình không chỉ là thời gian chờ đến đích mà còn là cơ hội quan sát và gặp gỡ những câu chuyện mới.",
    },
}


FILLERS = {
    3: [
        "后来，主人公把这次经历写进日记，也把学到的方法告诉了朋友。大家发现，认真观察、听完别人的话，再作决定，常常比马上回答更有效。",
        "这件小事没有改变整个世界，却让身边的人更愿意互相理解。生活中的进步，往往就是从一个可以做到的动作开始。",
    ],
    4: [
        "回头看这段经历，真正值得记住的并不是结果本身，而是人们如何观察问题、交换意见，并在事实面前调整原来的判断。成熟不是永远正确，而是愿意为选择负责，也愿意在发现不足后继续改进。",
        "因此，面对类似情况时，我们既要考虑眼前的方便，也要看到决定可能带来的长期影响。把抽象道理放进具体生活，知识才会变成能够使用的能力。",
    ],
}

COURSE_CHARACTER_NAMES = [
    {
        "hanzi": "苏明",
        "pinyin": "Sū Míng",
        "meaning": "Tô Minh (tên người)",
        "type": "tên riêng",
        "note": "Tên nhân vật trong bài.",
    },
    {
        "hanzi": "明月",
        "pinyin": "Míng Yuè",
        "meaning": "Minh Nguyệt (tên người)",
        "type": "tên riêng",
        "note": "Tên nhân vật trong bài.",
    },
]


def build_reading(level, lesson, topic):
    title = topic["chineseTitle"]
    reading = f"《{title}》\n\n{topic['body']}"
    vocabulary = lesson.get("vocabulary") or []
    extended = lesson.get("extendedVocabulary") or []
    words = [item.get("hanzi", "") for item in [*vocabulary, *extended]]
    missing = [word for word in words if word and word not in reading]
    if missing:
        reading += (
            "\n\n复述文章时，还可以结合这些词语补充人物、环境和过程："
            + "、".join(missing)
            + "。"
        )

    minimum = 240 if level == 3 else 330
    for filler in FILLERS[level]:
        if count_hanzi(reading) >= minimum:
            break
        reading += "\n\n" + filler

    maximum = 520 if level == 3 else 620
    hanzi_count = count_hanzi(reading)
    if hanzi_count < minimum or hanzi_count > maximum:
        raise ValueError(
            f"HSK{level} bài {lesson['lessonId']} có {hanzi_count} chữ Hán"
        )
    ensure_all_words_present(
        reading, words, f"HSK{level} bài {lesson['lessonId']}"
    )
    return reading


def update_reading_exercises(lesson, topic):
    exercises = lesson.get("exercises") or []
    replacement = {
        "type": "reading",
        "question": f"Bài “{topic['chineseTitle']}” muốn nhấn mạnh điều gì?",
        "answer": topic["answer"],
    }
    replaced = False
    next_exercises = []
    for exercise in exercises:
        if exercise.get("type") == "reading":
            if not replaced:
                next_exercises.append(replacement)
                replaced = True
            continue
        next_exercises.append(exercise)
    if not replaced:
        next_exercises.append(replacement)
    lesson["exercises"] = next_exercises


def rebuild_level(level, topics, word_lookup):
    course_dir = COURSE_DIR / f"hsk{level}"
    index = load_json(course_dir / "index.json")
    report = []

    for index_item in index:
        lesson_id = int(index_item["lessonId"])
        topic = topics[lesson_id]
        lesson_path = course_dir / index_item["file"]
        lesson = load_json(lesson_path)
        lesson["level"] = level
        reading = build_reading(level, lesson, topic)
        primary = [
            *(lesson.get("vocabulary") or []),
            *(lesson.get("extendedVocabulary") or []),
            *COURSE_CHARACTER_NAMES,
        ]
        segments = segment_text(reading, primary, word_lookup)
        coverage = lookup_coverage(segments, reading)
        if coverage < 82:
            raise ValueError(
                f"HSK{level} bài {lesson_id} độ phủ tra từ chỉ {coverage}%"
            )

        lesson["chineseTitle"] = topic["chineseTitle"]
        lesson["lessonText"] = [
            {
                "title": topic["chineseTitle"],
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
        lesson["meta"] = {
            **(lesson.get("meta") or {}),
            "estimatedMinutes": 45 if level == 3 else 55,
            "version": 4 if level == 3 else 3,
            "contentRevision": "2026-07-reading-refresh",
            "hanziCount": count_hanzi(reading),
            "sourceUsage": "Bài đọc được biên soạn mới theo chủ đề và phạm vi từ vựng của bài.",
        }
        lesson["quality"] = {
            **(lesson.get("quality") or {}),
            "mainVocabularyCount": len(lesson.get("vocabulary") or []),
            "extendedVocabularyCount": len(lesson.get("extendedVocabulary") or []),
            "missingFromReading": [],
            "interactiveSegments": sum(
                1 for segment in segments if segment.get("clickable")
            ),
            "lookupCoveragePercent": coverage,
            "copyrightSafe": True,
        }
        update_reading_exercises(lesson, topic)
        write_json(lesson_path, lesson)

        index_item["chineseTitle"] = topic["chineseTitle"]
        index_item["desc"] = (
            "Bài đọc mới theo chủ đề, có tra từ, phát âm và từ vựng mở rộng."
        )
        report.append(
            {
                "lessonId": lesson_id,
                "hanziCount": count_hanzi(reading),
                "coverage": coverage,
                "segments": lesson["quality"]["interactiveSegments"],
            }
        )

    write_json(course_dir / "index.json", index)
    return report


def main():
    word_lookup = load_word_lookup()
    result = {
        "hsk3": rebuild_level(3, HSK3_TOPICS, word_lookup),
        "hsk4": rebuild_level(4, HSK4_TOPICS, word_lookup),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
