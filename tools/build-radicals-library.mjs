import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'assets', 'data', 'tang-thu-cac', 'radicals.json');
const SOURCE_PAGE = 'https://en.wikipedia.org/wiki/Kangxi_radicals';
const SOURCE_API = 'https://en.wikipedia.org/w/api.php?action=parse&page=Kangxi_radicals&prop=text|revid&format=json&formatversion=2';
const COMMON_COUNT = 60;
const SIMPLIFIED_RADICALS = new Map(Object.entries({
  戶: ['户', 4],
  糸: ['纟', 3],
  見: ['见', 4],
  言: ['讠', 2],
  貝: ['贝', 4],
  車: ['车', 4],
  金: ['钅', 5],
  長: ['长', 4],
  門: ['门', 3],
  韋: ['韦', 4],
  頁: ['页', 6],
  風: ['风', 4],
  飛: ['飞', 3],
  食: ['饣', 3],
  馬: ['马', 3],
  魚: ['鱼', 8],
  鳥: ['鸟', 5],
  鹵: ['卤', 7],
  麥: ['麦', 7],
  黃: ['黄', 11],
  黽: ['黾', 8],
  齊: ['齐', 6],
  齒: ['齿', 8],
  龍: ['龙', 5],
  龜: ['龟', 7]
}));

const VI_MEANINGS = [
  null,
  'một', 'nét sổ', 'chấm', 'nét phẩy', 'thứ hai', 'móc',
  'hai', 'nắp', 'người', 'chân người', 'đi vào', 'tám', 'khung rộng', 'mái che', 'băng',
  'bàn nhỏ', 'vật đựng mở', 'dao', 'sức lực', 'bao bọc', 'cái thìa', 'hộp mở bên phải',
  'khung che giấu', 'mười', 'bói toán', 'tiết, con dấu', 'vách đá', 'riêng tư', 'lại, thêm lần nữa',
  'miệng', 'khung bao quanh', 'đất', 'kẻ sĩ', 'đi', 'đi chậm', 'buổi tối', 'lớn', 'phụ nữ',
  'con trẻ', 'mái nhà', 'tấc', 'nhỏ', 'què', 'thân thể', 'mầm cây', 'núi', 'sông', 'công việc',
  'bản thân', 'khăn', 'khô', 'sợi tơ nhỏ', 'mái che xiên', 'bước dài', 'hai tay chắp', 'bắn',
  'cung', 'mõm', 'lông, vân trang trí', 'bước chân',
  'tim, tâm', 'qua, giáo', 'cửa một cánh', 'tay', 'cành nhánh', 'đánh nhẹ', 'chữ viết, văn',
  'cái đấu', 'rìu', 'vuông, phương hướng', 'không', 'mặt trời', 'nói rằng', 'mặt trăng', 'cây, gỗ',
  'thiếu, ngáp', 'dừng', 'chết, xấu', 'binh khí', 'chớ, không', 'so sánh', 'lông mao', 'họ tộc',
  'hơi, khí', 'nước', 'lửa', 'móng vuốt', 'cha', 'hào quẻ', 'mảnh gỗ chẻ', 'phiến, lát',
  'răng nanh', 'trâu bò', 'chó', 'huyền bí', 'ngọc', 'dưa', 'ngói', 'ngọt', 'sinh, sự sống',
  'dùng', 'ruộng', 'tấm vải', 'bệnh tật', 'bước chân dang', 'trắng', 'da', 'đồ đựng', 'mắt',
  'mâu, giáo', 'mũi tên', 'đá', 'thờ cúng', 'dấu chân', 'lúa', 'hang', 'đứng',
  'tre', 'gạo', 'tơ lụa', 'chum, vò', 'lưới', 'dê', 'lông vũ', 'già', 'mà, và', 'cái cày',
  'tai', 'bút', 'thịt', 'bề tôi', 'tự mình', 'đến', 'cối giã', 'lưỡi', 'trái ngược', 'thuyền',
  'dừng lại', 'màu sắc', 'cỏ cây', 'hổ', 'côn trùng', 'máu', 'đi lại', 'áo quần', 'phía tây',
  'nhìn thấy', 'sừng', 'lời nói', 'thung lũng', 'đậu', 'lợn', 'thú chân', 'vỏ sò, tiền của',
  'đỏ', 'chạy, đi', 'chân', 'thân mình', 'xe', 'cay đắng', 'thìn, buổi sớm', 'đi, bước',
  'ấp, thành phố', 'rượu', 'phân biệt', 'làng, bên trong', 'kim loại, vàng', 'dài', 'cổng',
  'gò đất', 'nô lệ', 'chim đuôi ngắn', 'mưa', 'xanh', 'sai, không phải',
  'mặt', 'da thuộc', 'da đã thuộc', 'hẹ', 'âm thanh', 'đầu, trang', 'gió', 'bay', 'ăn, thức ăn',
  'đầu', 'hương thơm', 'ngựa', 'xương', 'cao', 'tóc dài', 'đấu nhau', 'rượu cúng', 'vạc',
  'ma quỷ', 'cá', 'chim', 'muối', 'hươu', 'lúa mì', 'gai, cây đay', 'vàng', 'kê', 'đen',
  'thêu thùa', 'ếch', 'đỉnh ba chân', 'trống', 'chuột', 'mũi', 'đều, ngay ngắn', 'răng',
  'rồng', 'rùa', 'sáo'
];

function decodeHtml(value) {
  return String(value || '')
    .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, number) => String.fromCodePoint(Number(number)))
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHan(value) {
  return [...String(value || '').matchAll(/\p{Script=Han}/gu)].map((match) => match[0]);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function validate(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (items.length !== 214) throw new Error(`Cần đúng 214 bộ thủ, nhận được ${items.length}.`);
  if (new Set(items.map((item) => item.number)).size !== 214) throw new Error('Số thứ tự bộ thủ bị trùng.');
  if (items.filter((item) => item.category === 'common').length !== COMMON_COUNT) {
    throw new Error(`Cần đúng ${COMMON_COUNT} bộ trong nhóm thường gặp.`);
  }
  if (items.some((item, index) => item.number !== index + 1)) throw new Error('Danh sách không đúng thứ tự Khang Hy.');
  if (items.some((item) => !item.radical || !item.pinyin || !item.hanViet || !item.meaningVi || !item.strokes)) {
    throw new Error('Có bộ thủ thiếu chữ, Pinyin, Hán Việt, nghĩa hoặc số nét.');
  }
  if (items.some((item) => item.traditional && item.radical === item.traditional)) {
    throw new Error('Có bộ thủ phồn thể chưa được đổi sang dạng giản thể.');
  }
  for (const [traditional, [simplified, strokes]] of SIMPLIFIED_RADICALS) {
    const item = items.find((entry) => entry.traditional === traditional);
    if (!item || item.radical !== simplified || item.strokes !== strokes) {
      throw new Error(`Dạng giản thể ${traditional} → ${simplified} chưa đúng.`);
    }
  }
  if (!String(payload?.meta?.license || '').includes('CC BY-SA')) throw new Error('Thiếu thông tin giấy phép nguồn dữ liệu.');
  return payload;
}

async function build() {
  const response = await fetch(SOURCE_API, {
    headers: { 'User-Agent': 'TiengTrungCamCoca/1.0 educational-radicals-builder' }
  });
  if (!response.ok) throw new Error(`Không tải được nguồn (${response.status}).`);
  const source = await response.json();
  const html = source?.parse?.text || '';
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const parsed = [];

  for (const row of rows) {
    const cells = [...row[1].matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)]
      .map((cell) => decodeHtml(cell[1]));
    const number = Number.parseInt(cells[0], 10);
    if (!Number.isInteger(number) || number < 1 || number > 214 || cells.length < 12) continue;

    const canonical = String.fromCodePoint(0x2f00 + number - 1).normalize('NFKC');
    const radicalForms = extractHan(cells[1]);
    const simplifiedEntry = SIMPLIFIED_RADICALS.get(canonical);
    const displayRadical = simplifiedEntry?.[0] || canonical;
    const variants = simplifiedEntry
      ? []
      : unique(radicalForms).filter((value) => value !== displayRadical);
    const examples = unique(extractHan(cells.at(-1))).filter((value) => value !== canonical).slice(0, 8);
    parsed.push({
      id: `radical-${String(number).padStart(3, '0')}`,
      number,
      radical: displayRadical,
      traditional: simplifiedEntry ? canonical : '',
      variants,
      strokes: simplifiedEntry?.[1] || Number.parseInt(cells[2], 10),
      pinyin: cells[5],
      hanViet: cells[6],
      meaningVi: VI_MEANINGS[number],
      meaningEn: cells[3],
      frequency: Number.parseInt(cells[9].replaceAll(',', ''), 10) || 0,
      examples,
      category: 'other',
      commonRank: null
    });
  }

  parsed.sort((a, b) => a.number - b.number);
  if (parsed.length !== 214) throw new Error(`Chỉ phân tích được ${parsed.length}/214 hàng dữ liệu.`);
  const common = [...parsed].sort((a, b) => b.frequency - a.frequency || a.number - b.number).slice(0, COMMON_COUNT);
  common.forEach((item, index) => {
    const target = parsed.find((entry) => entry.number === item.number);
    target.category = 'common';
    target.commonRank = index + 1;
  });

  const payload = validate({
    meta: {
      title: '214 bộ thủ Khang Hy',
      count: parsed.length,
      commonCount: COMMON_COUNT,
      otherCount: parsed.length - COMMON_COUNT,
      strokeRange: [1, 17],
      sourceTitle: 'Kangxi radicals',
      sourceUrl: SOURCE_PAGE,
      sourceRevision: source?.parse?.revid || null,
      license: 'CC BY-SA 4.0',
      attribution: 'Wikipedia contributors, Kangxi radicals',
      generatedAt: new Date().toISOString()
    },
    items: parsed
  });

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Đã tạo ${parsed.length} bộ thủ: ${COMMON_COUNT} thường gặp, ${parsed.length - COMMON_COUNT} bộ còn lại.`);
}

if (process.argv.includes('--check')) {
  const payload = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
  validate(payload);
  console.log(`Radicals library: PASS (${payload.items.length} mục, ${payload.meta.commonCount} thường gặp).`);
} else {
  await build();
}
