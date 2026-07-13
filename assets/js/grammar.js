//==============================
// HSK Grammar
//==============================

let allGrammar = [];
let filteredGrammar = [];
let currentIndex = 0;
let currentLevel = "all";

const grammarFiles = [
    "assets/data/hsk1.json",
    "assets/data/hsk2.json",
    "assets/data/hsk3.json",
    "assets/data/hsk4.json",
    "assets/data/hsk5.json",
    "assets/data/hsk6.json"
];

const grammarList = document.getElementById("grammarList");
const grammarDetail = document.getElementById("grammarDetail");
const searchInput = document.getElementById("searchInput");
const grammarCount = document.getElementById("grammarCount");

function normalizeGrammarItem(item, fallbackLevel){

    if(item.Title){

        return item;

    }

    const example1 = item.examples && item.examples[0] ? item.examples[0] : {};

    const example2 = item.examples && item.examples[1] ? item.examples[1] : {};

    const typeInfo = item.type ? `Loại từ: ${item.type}` : "";

    const radicalInfo = item.radical ? `Bộ thủ: ${item.radical}` : "";

    return {

        ID: item.id || "",

        Level: item.hsk ? `HSK${item.hsk}` : fallbackLevel,

        Title: item.hanzi || item.traditional || "",

        Pinyin: item.pinyin || "",

        Meaning: item.meaning_vi || item.meaning || item.meaning_en || "",

        Structure: [typeInfo, radicalInfo].filter(Boolean).join(" | ") || "Đang cập nhật",

        Explanation: item.lesson ? `Bài ${item.lesson}` : "Đang cập nhật",

        "Ex1 Hanzi": example1.hanzi || "",

        "Ex1 Pinyin": example1.pinyin || "",

        "Ex1 Meaning": example1.translation || "",

        "Ex2 Hanzi": example2.hanzi || "",

        "Ex2 Pinyin": example2.pinyin || "",

        "Ex2 Meaning": example2.translation || ""

    };

}


//========================================
// LOAD JSON
//========================================

async function loadGrammar(){

    allGrammar=[];

    for(const file of grammarFiles){

        try{

            const res=await fetch(file);

            const json=await res.json();

            const fallbackLevel = file.match(/hsk(\d+)/i)?.[1];

            const level = fallbackLevel ? `HSK${fallbackLevel}` : "HSK";

            allGrammar.push(...json.map(item => normalizeGrammarItem(item, level)));

        }catch(err){

            console.log(file+" not found.");

        }

    }

    filteredGrammar=[...allGrammar];

    grammarCount.innerText=filteredGrammar.length;

    renderList();

}

loadGrammar();


//========================================
// RENDER SIDEBAR
//========================================

function renderList(){

    grammarList.innerHTML="";

    grammarCount.innerText=filteredGrammar.length;

    filteredGrammar.forEach((item,index)=>{

        const div=document.createElement("div");

        div.className="grammar-item";

        if(index===currentIndex){

            div.classList.add("active");

        }

        div.innerHTML=`

            <div class="grammar-title">

                ${item.Title}

            </div>

            <div class="grammar-pinyin">

                ${item.Pinyin}

            </div>

            <div class="grammar-level">

                ${item.Level}

            </div>

        `;

        div.onclick=()=>{

            currentIndex=index;

            renderList();

            renderDetail(filteredGrammar[currentIndex]);

        }

        grammarList.appendChild(div);

    });

    if(filteredGrammar.length){

        renderDetail(filteredGrammar[currentIndex]);

    }

}


//========================================
// DETAIL
//========================================

function renderDetail(item){

grammarDetail.innerHTML=`

<div class="detail-header">

<div class="detail-title">

${item.Title}

</div>

<div class="detail-pinyin">

${item.Pinyin}

</div>

<div class="detail-level">

${item.Level}

</div>

</div>

<div class="detail-body">

<div class="detail-nav">

<button id="prevBtn">

◀ Previous

</button>

<button id="randomBtn">

🎲 Random

</button>

<button id="nextBtn">

Next ▶

</button>

</div>


<div class="detail-section">

<h3>Nghĩa</h3>

<div class="detail-box">

${item.Meaning}

</div>

</div>


<div class="detail-section">

<h3>Cấu trúc</h3>

<div class="detail-box">

${item.Structure}

</div>

</div>


<div class="detail-section">

<h3>Giải thích</h3>

<div class="detail-box">

${item.Explanation}

</div>

</div>


<div class="detail-section">

<h3>Ví dụ 1</h3>

<div class="example">

<div class="example-cn">

${item["Ex1 Hanzi"]}

</div>

<div class="example-pinyin">

${item["Ex1 Pinyin"]}

</div>

<div class="example-meaning">

${item["Ex1 Meaning"]}

</div>

</div>

</div>

${
item["Ex2 Hanzi"]?`

<div class="detail-section">

<h3>Ví dụ 2</h3>

<div class="example">

<div class="example-cn">

${item["Ex2 Hanzi"]}

</div>

<div class="example-pinyin">

${item["Ex2 Pinyin"]}

</div>

<div class="example-meaning">

${item["Ex2 Meaning"]}

</div>

</div>

</div>

`:""
}

</div>

`;

document.getElementById("prevBtn").onclick=prevGrammar;

document.getElementById("nextBtn").onclick=nextGrammar;

document.getElementById("randomBtn").onclick=randomGrammar;

}


//========================================
// SEARCH
//========================================

searchInput.addEventListener("input",filterGrammar);

function filterGrammar(){

    const keyword=searchInput.value
    .trim()
    .toLowerCase();

    filteredGrammar=allGrammar.filter(item=>{

        const matchLevel=currentLevel==="all"||

        item.Level===currentLevel;

        const matchKeyword=

        (item.Title||"").toLowerCase().includes(keyword)

        ||

        (item.Pinyin||"").toLowerCase().includes(keyword)

        ||

        (item.Meaning||"").toLowerCase().includes(keyword)

        ||

        (item.Structure||"").toLowerCase().includes(keyword);

        return matchLevel&&matchKeyword;

    });

    currentIndex=0;

    renderList();

}


//========================================
// FILTER
//========================================

document

.querySelectorAll(".level-btn")

.forEach(btn=>{

btn.onclick=()=>{

document

.querySelectorAll(".level-btn")

.forEach(b=>b.classList.remove("active"));

btn.classList.add("active");

currentLevel=btn.dataset.level;

filterGrammar();

}

});


//========================================
// NEXT
//========================================

function nextGrammar(){

if(currentIndex>=filteredGrammar.length-1)

return;

currentIndex++;

renderList();

scrollToActive();

}


//========================================
// PREVIOUS
//========================================

function prevGrammar(){

if(currentIndex<=0)

return;

currentIndex--;

renderList();

scrollToActive();

}


//========================================
// RANDOM
//========================================

function randomGrammar(){

currentIndex=Math.floor(

Math.random()*filteredGrammar.length

);

renderList();

scrollToActive();

}


//========================================
// AUTO SCROLL
//========================================

function scrollToActive(){

const active=document.querySelector(".grammar-item.active");

if(active){

active.scrollIntoView({

behavior:"smooth",

block:"center"

});

}

}


//========================================
// KEYBOARD
//========================================

document.addEventListener("keydown",(e)=>{

if(e.key==="ArrowRight"){

nextGrammar();

}

if(e.key==="ArrowLeft"){

prevGrammar();

}

});


//========================================
// ENTER SEARCH
//========================================

searchInput.addEventListener("keydown",(e)=>{

if(e.key==="Enter"){

if(filteredGrammar.length){

currentIndex=0;

renderList();

}

}

});


//========================================
// END
//========================================
