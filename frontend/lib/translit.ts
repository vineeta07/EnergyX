/**
 * Writes English words the way they sound, in Devanagari, Bengali, Tamil or Gurmukhi.
 * Used for text the dictionary cannot cover: names of places and plants, event messages from the
 * server, codes in sentences. It is a phonetic approximation, not a dictionary: irregular words
 * are corrected through the LEXICON below.
 */
export type ScriptKey = "hi" | "bn" | "ta" | "pa";
const IDX: Record<ScriptKey, number> = { hi: 0, bn: 1, ta: 2, pa: 3 };

interface Script {
  virama: string;
  endVirama: boolean;                    // Tamil writes a pulli on a final consonant
  nasal: string | null;                  // anusvara before a consonant, where the script has one
  cons: Record<string, string>;
  ind: Record<string, string>;           // independent vowels
  mat: Record<string, string>;           // vowel signs
  letters: Record<string, string>;       // how each letter is named, for acronyms
}

const LETTER_KEYS = "abcdefghijklmnopqrstuvwxyz".split("");
const names = (s: string) => Object.fromEntries(LETTER_KEYS.map((k, i) => [k, s.split(" ")[i]]));

const DEV: Script = {
  virama: "्", endVirama: false, nasal: "ं",
  cons: { k: "क", kh: "ख", g: "ग", gh: "घ", c: "च", j: "ज", t: "ट", d: "ड", th: "थ", dh: "ध", p: "प", f: "फ", b: "ब", m: "म", n: "न", y: "य", r: "र", l: "ल", v: "व", sh: "श", s: "स", h: "ह", z: "ज़", ks: "क्स", ng: "ङ", ny: "ञ", dz: "द" },
  ind: { a: "आ", i: "इ", ii: "ई", u: "उ", uu: "ऊ", e: "ए", ai: "ऐ", o: "ओ", au: "औ", O: "ऑ", x: "अ" },
  mat: { a: "ा", i: "ि", ii: "ी", u: "ु", uu: "ू", e: "े", ai: "ै", o: "ो", au: "ौ", O: "ॉ", x: "" },
  letters: names("ए बी सी डी ई एफ जी एच आई जे के एल एम एन ओ पी क्यू आर एस टी यू वी डब्ल्यू एक्स वाई ज़ेड"),
};
const BEN: Script = {
  virama: "্", endVirama: false, nasal: "ং",
  cons: { k: "ক", kh: "খ", g: "গ", gh: "ঘ", c: "চ", j: "জ", t: "ট", d: "ড", th: "থ", dh: "ধ", p: "প", f: "ফ", b: "ব", m: "ম", n: "ন", y: "য়", r: "র", l: "ল", v: "ভ", sh: "শ", s: "স", h: "হ", z: "জ", ks: "ক্স", ng: "ঙ", ny: "ঞ", dz: "দ" },
  ind: { a: "আ", i: "ই", ii: "ঈ", u: "উ", uu: "ঊ", e: "এ", ai: "ঐ", o: "ও", au: "ঔ", O: "অ", x: "অ" },
  mat: { a: "া", i: "ি", ii: "ী", u: "ু", uu: "ূ", e: "ে", ai: "ৈ", o: "ো", au: "ৌ", O: "ো", x: "" },
  letters: names("এ বি সি ডি ই এফ জি এইচ আই জে কে এল এম এন ও পি কিউ আর এস টি ইউ ভি ডাবলিউ এক্স ওয়াই জেড"),
};
const TAM: Script = {
  virama: "்", endVirama: true, nasal: null,
  cons: { k: "க", kh: "க", g: "க", gh: "க", c: "ச", j: "ஜ", t: "ட", d: "ட", th: "த", dh: "த", p: "ப", f: "ஃப", b: "ப", m: "ம", n: "ன", y: "ய", r: "ர", l: "ல", v: "வ", sh: "ஷ", s: "ஸ", h: "ஹ", z: "ஸ", ks: "க்ஸ", ng: "ங", ny: "ஞ", dz: "த" },
  ind: { a: "ஆ", i: "இ", ii: "ஈ", u: "உ", uu: "ஊ", e: "எ", ai: "ஐ", o: "ஒ", au: "ஔ", O: "ஆ", x: "அ" },
  mat: { a: "ா", i: "ி", ii: "ீ", u: "ு", uu: "ூ", e: "ெ", ai: "ை", o: "ொ", au: "ௌ", O: "ா", x: "" },
  letters: names("ஏ பி சி டி ஈ எஃப் ஜி எச் ஐ ஜே கே எல் எம் என் ஓ பி க்யூ ஆர் எஸ் டி யூ வி டபிள்யூ எக்ஸ் வை ஜெட்"),
};
const PUN: Script = {
  virama: "੍", endVirama: false, nasal: "ਂ",
  cons: { k: "ਕ", kh: "ਖ", g: "ਗ", gh: "ਘ", c: "ਚ", j: "ਜ", t: "ਟ", d: "ਡ", th: "ਥ", dh: "ਧ", p: "ਪ", f: "ਫ", b: "ਬ", m: "ਮ", n: "ਨ", y: "ਯ", r: "ਰ", l: "ਲ", v: "ਵ", sh: "ਸ਼", s: "ਸ", h: "ਹ", z: "ਜ਼", ks: "ਕਸ", ng: "ਙ", ny: "ਞ", dz: "ਦ" },
  ind: { a: "ਆ", i: "ਇ", ii: "ਈ", u: "ਉ", uu: "ਊ", e: "ਏ", ai: "ਐ", o: "ਓ", au: "ਔ", O: "ਆ", x: "ਅ" },
  mat: { a: "ਾ", i: "ਿ", ii: "ੀ", u: "ੁ", uu: "ੂ", e: "ੇ", ai: "ੈ", o: "ੋ", au: "ੌ", O: "ਾ", x: "" },
  letters: names("ਏ ਬੀ ਸੀ ਡੀ ਈ ਐਫ ਜੀ ਐਚ ਆਈ ਜੇ ਕੇ ਐਲ ਐਮ ਐਨ ਓ ਪੀ ਕਿਊ ਆਰ ਐਸ ਟੀ ਯੂ ਵੀ ਡਬਲਯੂ ਐਕਸ ਵਾਈ ਜ਼ੈੱਡ"),
};
const SCRIPTS: Record<ScriptKey, Script> = { hi: DEV, bn: BEN, ta: TAM, pa: PUN };

type Tok = { c: string } | { v: string };
const VOWELS = "aeiou";
const isV = (ch: string | undefined) => !!ch && VOWELS.includes(ch);

/** Split an English word into consonant and vowel sounds. */
function tokenise(w: string): Tok[] {
  const out: Tok[] = [];
  const n = w.length;
  const c = (k: string) => out.push({ c: k });
  const v = (k: string) => out.push({ v: k });
  let i = 0;
  // silent starts
  if (/^(kn|gn|pn)/.test(w)) i = 1;
  else if (/^wr/.test(w)) i = 1;
  while (i < n) {
    const ch = w[i], nx = w[i + 1], n2 = w[i + 2], pv = w[i - 1];
    const rest = w.slice(i);
    // endings
    if (i === n - 1 && ch === "e" && n > 2 && !isV(pv)) { i++; continue; }          // silent final e
    if (rest === "tion" || rest === "sion") { c("sh"); v("o"); c("n"); i = n; continue; }
    if (rest === "tions" || rest === "sions") { c("sh"); v("o"); c("n"); c("s"); i = n; continue; }
    if (rest === "ture") { c("c"); v("x"); c("r"); i = n; continue; }
    if (rest === "ight" || rest === "ights") { v("ai"); c("t"); if (rest.endsWith("s")) c("s"); i = n; continue; }
    if (rest === "ed" && i > 1 && !isV(pv)) { v("e"); c("d"); i += 2; continue; }
    if (rest === "es" && i > 1 && !isV(pv) && "sxzh".includes(pv ?? "")) { v("e"); c("z"); i += 2; continue; }
    // magic e: vowel + consonant + e at the end
    const magic = (k: string) => i + 2 === n - 1 && w[n - 1] === "e" && !isV(nx) && nx !== undefined && k === ch;
    if (isV(ch) && !isV(nx) && i + 2 === n - 1 && w[n - 1] === "e" && nx && !"rwy".includes(nx)) {
      if (ch === "a") { v("e"); i++; continue; }
      if (ch === "i") { v("ai"); i++; continue; }
      if (ch === "o") { v("o"); i++; continue; }
      if (ch === "u") { v("uu"); i++; continue; }
    }
    void magic;
    // vowel groups
    const two = ch + (nx ?? "");
    if (isV(ch)) {
      if (two === "ee" || two === "ea") { v("ii"); i += 2; continue; }
      if (two === "oo") { v(n2 === "k" ? "u" : "uu"); i += 2; continue; }
      if (two === "ou") { v("au"); i += 2; continue; }
      if (two === "ow") { if (i + 2 >= n) v("o"); else v("au"); i += 2; continue; }
      if (two === "oa") { v("o"); i += 2; continue; }
      if (two === "ai" || two === "ay" || two === "ei" || two === "ey") { v("e"); i += 2; continue; }
      if (two === "au" || two === "aw") { v("O"); i += 2; continue; }
      if (two === "oi" || two === "oy") { v("O"); c("y"); i += 2; continue; }
      if (two === "ie") { v("ii"); i += 2; continue; }
      if (two === "ue" || two === "ui") { v("uu"); i += 2; continue; }
      if (two === "io" ) { v("ii"); v("o"); i += 2; continue; }
      if (ch === "a") { v("a"); i++; continue; }
      if (ch === "e") { v("e"); i++; continue; }
      if (ch === "i") { v(i === n - 1 ? "ii" : "i"); i++; continue; }
      if (ch === "o") { v(i === 0 ? "o" : "O"); i++; continue; }
      if (ch === "u") {
        // closed syllable (cut, number) keeps the plain consonant; open (menu) gets a long u
        if (nx && !isV(nx) && nx !== "r") v("x"); else v(i === n - 1 ? "uu" : "u");
        i++; continue;
      }
    }
    // consonants
    const tri = ch + (nx ?? "") + (n2 ?? "");
    if (tri === "tch") { c("c"); i += 3; continue; }
    if (tri === "dge") { c("j"); i += 3; continue; }
    if (two === "ch") { c("c"); i += 2; continue; }
    if (two === "sh") { c("sh"); i += 2; continue; }
    if (two === "th") { c("th"); i += 2; continue; }
    if (two === "ph") { c("f"); i += 2; continue; }
    if (two === "ck") { c("k"); i += 2; continue; }
    if (two === "kh") { c("kh"); i += 2; continue; }
    if (two === "gh") { if (i > 0 && !isV(n2)) { i += 2; continue; } c("gh"); i += 2; continue; }
    if (two === "dh") { c("dh"); i += 2; continue; }
    if (two === "bh") { c("b"); i += 2; continue; }
    if (two === "wh") { c("v"); i += 2; continue; }
    if (two === "qu") { c("k"); c("v"); i += 2; continue; }
    if (two === "ng" && (i + 2 >= n || !isV(n2))) { c("n"); c("g"); i += 2; continue; }
    if (two === "mb" && i + 2 >= n) { c("m"); i += 2; continue; }
    if (ch === nx && !isV(ch) && ch !== "r") { i++; continue; }                         // double letters
    switch (ch) {
      case "c": c(nx && "eiy".includes(nx) ? "s" : "k"); break;
      case "g": c(nx && "e".includes(nx) && i + 2 < n ? "j" : "g"); break;
      case "j": c("j"); break;
      case "q": c("k"); break;
      case "x": c("ks"); break;
      case "w": if (i > 0 && isV(pv) ) { /* sound carried by the vowel pair */ } c("v"); break;
      case "y": if (i === 0 || isV(pv)) c("y"); else v(i === n - 1 ? "ii" : "i"); break;
      case "z": c("z"); break;
      case "s": c(isV(pv) && isV(nx) ? "z" : "s"); break;
      case "h": if (i === 0 || !isV(pv)) c("h"); break;
      default: if (/[a-z]/.test(ch)) c(ch === "t" ? "t" : ch === "d" ? "d" : ch);
    }
    i++;
  }
  return out;
}

function render(w: string, key: ScriptKey): string {
  const S = SCRIPTS[key];
  const toks = tokenise(w);
  let out = "";
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], prev = toks[i - 1], next = toks[i + 1];
    if ("v" in t) {
      const k = key !== "hi" && t.v === "O" ? "o" : t.v;
      if (prev && "c" in prev) out += S.mat[k] ?? "";
      else out += S.ind[k] ?? S.ind.a;
      continue;
    }
    // nasal followed by a stop: anusvara in scripts that have one
    if ((t.c === "n" || t.c === "m") && prev && "v" in prev && next && "c" in next && S.nasal && !["n", "m", "y", "r", "l", "v", "h"].includes(next.c) && !(next.c === "t" && toks[i + 2] === undefined && false)) { out += S.nasal; continue; }
    out += S.cons[t.c] ?? "";
    if (next && "c" in next) out += S.virama;
    else if (!next && S.endVirama) out += S.virama;
  }
  return out;
}

/** Letter-by-letter reading, for acronyms such as MCD or WtE. */
function spell(w: string, key: ScriptKey) {
  const L = SCRIPTS[key].letters;
  return w.toLowerCase().split("").map((c) => L[c] ?? c).join("");
}

// Irregular words, stop words and the places that appear in the demo network: [hi, bn, ta, pa].
const LEXICON: Record<string, [string, string, string, string]> = {
  the: ["द", "দ্য", "த", "ਦ"], of: ["ऑफ़", "অফ", "ஆஃப்", "ਆਫ਼"], and: ["एंड", "অ্যান্ড", "ஆண்ட்", "ਐਂਡ"], to: ["टू", "টু", "டு", "ਟੂ"],
  for: ["फ़ॉर", "ফর", "ஃபார்", "ਫ਼ਾਰ"], in: ["इन", "ইন", "இன்", "ਇਨ"], at: ["ऐट", "অ্যাট", "ஆட்", "ਐਟ"], by: ["बाय", "বাই", "பை", "ਬਾਏ"],
  with: ["विद", "উইথ", "வித்", "ਵਿਦ"], from: ["फ़्रॉम", "ফ্রম", "ஃபிராம்", "ਫ਼੍ਰਾਮ"], is: ["इज़", "ইজ", "இஸ்", "ਇਜ਼"], are: ["आर", "আর", "ஆர்", "ਆਰ"],
  on: ["ऑन", "অন", "ஆன்", "ਆਨ"], a: ["ए", "এ", "ஏ", "ਏ"], an: ["एन", "অ্যান", "ஆன்", "ਐਨ"], be: ["बी", "বি", "பி", "ਬੀ"], or: ["ऑर", "অর", "ஆர்", "ਆਰ"],
  route: ["रूट", "রুট", "ரூட்", "ਰੂਟ"], routes: ["रूट्स", "রুটস", "ரூட்ஸ்", "ਰੂਟਸ"], waste: ["वेस्ट", "ওয়েস্ট", "வேஸ்ட்", "ਵੇਸਟ"],
  energy: ["एनर्जी", "এনার্জি", "எனர்ஜி", "ਐਨਰਜੀ"], power: ["पावर", "পাওয়ার", "பவர்", "ਪਾਵਰ"], plant: ["प्लांट", "প্ল্যান্ট", "பிளாண்ட்", "ਪਲਾਂਟ"],
  facility: ["फ़ैसिलिटी", "ফ্যাসিলিটি", "ஃபெசிலிட்டி", "ਫ਼ੈਸਿਲਿਟੀ"], facilities: ["फ़ैसिलिटीज़", "ফ্যাসিলিটিজ", "ஃபெசிலிட்டிஸ்", "ਫ਼ੈਸਿਲਿਟੀਜ਼"],
  work: ["वर्क", "ওয়ার্ক", "வொர்க்", "ਵਰਕ"], world: ["वर्ल्ड", "ওয়ার্ল্ড", "வேர்ல்ட்", "ਵਰਲਡ"], word: ["वर्ड", "ওয়ার্ড", "வேர்ட்", "ਵਰਡ"],
  network: ["नेटवर्क", "নেটওয়ার্ক", "நெட்வொர்க்", "ਨੈੱਟਵਰਕ"], hub: ["हब", "হাব", "ஹப்", "ਹੱਬ"], truck: ["ट्रक", "ট্রাক", "டிரக்", "ਟਰੱਕ"],
  kg: ["kg", "kg", "kg", "kg"], pickup: ["पिकअप", "পিকআপ", "பிக்கப்", "ਪਿਕਅੱਪ"], pickups: ["पिकअप", "পিকআপ", "பிக்கப்", "ਪਿਕਅੱਪ"],
  zone: ["ज़ोन", "জোন", "ஜோன்", "ਜ਼ੋਨ"], warning: ["वॉर्निंग", "ওয়ার্নিং", "வார்னிங்", "ਵਾਰਨਿੰਗ"], model: ["मॉडल", "মডেল", "மாடல்", "ਮਾਡਲ"],
  data: ["डेटा", "ডেটা", "டேட்டா", "ਡੇਟਾ"], city: ["सिटी", "সিটি", "சிட்டி", "ਸਿਟੀ"], civil: ["सिविल", "সিভিল", "சிவில்", "ਸਿਵਲ"], lines: ["लाइंस", "লাইনস", "லைன்ஸ்", "ਲਾਈਨਜ਼"],
  central: ["सेंट्रल", "সেন্ট্রাল", "சென்ட்ரல்", "ਸੈਂਟਰਲ"], south: ["साउथ", "সাউথ", "சவுத்", "ਸਾਊਥ"], north: ["नॉर्थ", "নর্থ", "நார்த்", "ਨੌਰਥ"], west: ["वेस्ट", "ওয়েস্ট", "வெஸ்ட்", "ਵੈਸਟ"], east: ["ईस्ट", "ইস্ট", "ஈஸ்ட்", "ਈਸਟ"],
  delhi: ["दिल्ली", "দিল্লি", "டெல்லி", "ਦਿੱਲੀ"], okhla: ["ओखला", "ওখলা", "ஓக்லா", "ਓਖਲਾ"], ghazipur: ["ग़ाज़ीपुर", "গাজিপুর", "காசிபூர்", "ਗਾਜ਼ੀਪੁਰ"],
  tehkhand: ["तेहखंड", "তেহখণ্ড", "தெஹ்கண்ட்", "ਤੇਹਖੰਡ"], bhalswa: ["भलस्वा", "ভালস্বা", "பல்ஸ்வா", "ਭਲਸਵਾ"], narela: ["नरेला", "নরেলা", "நரேலா", "ਨਰੇਲਾ"],
  bawana: ["बवाना", "বাওয়ানা", "பவானா", "ਬਵਾਨਾ"], rohini: ["रोहिणी", "রোহিণী", "ரோகிணி", "ਰੋਹਿਣੀ"], dwarka: ["द्वारका", "দ্বারকা", "துவாரகா", "ਦਵਾਰਕਾ"],
  najafgarh: ["नजफ़गढ़", "নজফগড়", "நஜஃப்கர்", "ਨਜਫ਼ਗੜ੍ਹ"], shahdara: ["शाहदरा", "শাহদারা", "ஷாஹ்தரா", "ਸ਼ਾਹਦਰਾ"], karol: ["करोल", "করোল", "கரோல்", "ਕਰੋਲ"], bagh: ["बाग़", "বাগ", "பாக்", "ਬਾਗ਼"],
  keshavpuram: ["केशवपुरम", "কেশবপুরম", "கேஷவ்புரம்", "ਕੇਸ਼ਵਪੁਰਮ"], timarpur: ["तिमारपुर", "তিমারপুর", "திமார்பூர்", "ਤਿਮਾਰਪੁਰ"], geeta: ["गीता", "গীতা", "கீதா", "ਗੀਤਾ"], colony: ["कॉलोनी", "কলোনি", "காலனி", "ਕਾਲੋਨੀ"],
  patparganj: ["पटपड़गंज", "পটপড়গঞ্জ", "பட்பர்கஞ்ச்", "ਪਟਪੜਗੰਜ"], pushp: ["पुष्प", "পুষ্প", "புஷ்ப்", "ਪੁਸ਼ਪ"], vihar: ["विहार", "বিহার", "விஹார்", "ਵਿਹਾਰ"],
  raghubir: ["रघुबीर", "রঘুবীর", "ரகுபீர்", "ਰਘੁਬੀਰ"], nagar: ["नगर", "নগর", "நகர்", "ਨਗਰ"], zakhira: ["ज़खीरा", "জাখিরা", "ஜகீரா", "ਜ਼ਖ਼ੀਰਾ"], ghogha: ["घोघा", "ঘোঘা", "கோகா", "ਘੋਘਾ"],
  gurugram: ["गुरुग्राम", "গুরুগ্রাম", "குருகிராம்", "ਗੁਰੂਗ੍ਰਾਮ"], noida: ["नोएडा", "নয়ডা", "நொய்டா", "ਨੋਇਡਾ"], lajpat: ["लाजपत", "লাজপত", "லஜ்பத்", "ਲਾਜਪਤ"],
  mcd: ["एमसीडी", "এমসিডি", "எம்சிடி", "ਐਮਸੀਡੀ"], dpcc: ["डीपीसीसी", "ডিপিসিসি", "டிபிசிசி", "ਡੀਪੀਸੀਸੀ"],
  sanitary: ["सैनिटरी", "স্যানিটারি", "சானிட்டரி", "ਸੈਨੀਟਰੀ"], landfill: ["लैंडफिल", "ল্যান্ডফিল", "லேண்ட்ஃபில்", "ਲੈਂਡਫਿਲ"],
  weighbridge: ["वेब्रिज", "ওয়েব্রিজ", "வேப்ரிட்ஜ்", "ਵੇਬ੍ਰਿਜ"], classified: ["क्लासिफ़ाइड", "ক্লাসিফাইড", "கிளாசிஃபைடு", "ਕਲਾਸੀਫ਼ਾਈਡ"],
  organic: ["ऑर्गेनिक", "অর্গানিক", "ஆர்கானிக்", "ਆਰਗੈਨਿਕ"], plastic: ["प्लास्टिक", "প্লাস্টিক", "பிளாஸ்டிக்", "ਪਲਾਸਟਿਕ"], paper: ["पेपर", "পেপার", "பேப்பர்", "ਪੇਪਰ"], metal: ["मेटल", "মেটাল", "மெட்டல்", "ਮੈਟਲ"],
  operator: ["ऑपरेटर", "অপারেটর", "ஆபரேட்டர்", "ਓਪਰੇਟਰ"], feedback: ["फ़ीडबैक", "ফিডব্যাক", "ஃபீட்பேக்", "ਫ਼ੀਡਬੈਕ"], approved: ["अप्रूव्ड", "অ্যাপ্রুভড", "அப்ரூவ்டு", "ਅਪ੍ਰੂਵਡ"],
  score: ["स्कोर", "স্কোর", "ஸ்கோர்", "ਸਕੋਰ"], vehicle: ["वाहन", "ভেহিকল", "வெஹிக்கிள்", "ਵਹੀਕਲ"], vehicles: ["वाहन", "ভেহিকলস", "வெஹிக்கிள்ஸ்", "ਵਹੀਕਲਜ਼"],
  capacity: ["कैपेसिटी", "ক্যাপাসিটি", "கெபாசிட்டி", "ਕੈਪੇਸਿਟੀ"], expected: ["एक्सपेक्टेड", "এক্সপেক্টেড", "எக்ஸ்பெக்டெட்", "ਐਕਸਪੈਕਟਡ"], optimizing: ["ऑप्टिमाइज़िंग", "অপ্টিমাইজিং", "ஆப்டிமைசிங்", "ਔਪਟਿਮਾਈਜ਼ਿੰਗ"],
  classification: ["क्लासिफ़िकेशन", "ক্লাসিফিকেশন", "கிளாசிஃபிகேஷன்", "ਕਲਾਸੀਫ਼ਿਕੇਸ਼ਨ"], confirmed: ["कन्फ़र्म्ड", "কনফার্মড", "கன்ஃபர்ம்டு", "ਕਨਫ਼ਰਮਡ"],
  one: ["वन", "ওয়ান", "ஒன்", "ਵਨ"], two: ["टू", "টু", "டூ", "ਟੂ"], new: ["न्यू", "নিউ", "நியூ", "ਨਿਊ"], no: ["नो", "নো", "நோ", "ਨੋ"], not: ["नॉट", "নট", "நாட்", "ਨਾਟ"],
};

/** Words that stay as written: SI unit symbols and the like. */
const KEEP = new Set(["kg", "g", "t", "km", "m", "kwh", "mwh", "kw", "mw", "l", "h", "min", "s", "tpd", "pp", "co", "co2e", "id", "pm", "am", "mhz", "ml", "api", "ok"]);

export function translitWord(word: string, key: ScriptKey): string {
  const lower = word.toLowerCase();
  const hit = LEXICON[lower];
  if (hit) return hit[IDX[key]];
  if (lower.length <= 1) return word;
  const upper = word.replace(/[^A-Z]/g, "").length;
  if (/^[A-Z]{2,5}$/.test(word) || (upper >= 2 && word.length <= 5 && /[A-Z]$/.test(word))) return spell(word, key);   // MCD, API, WtE
  return render(lower, key);
}

const WORD = /[A-Za-z][A-Za-z']*/g;
/** Transliterate every English word in a string; leaves numbers, units, codes and e-mail addresses alone. */
export function translitText(text: string, key: ScriptKey): string {
  if (!/[A-Za-z]/.test(text)) return text;
  if (/@|https?:\/\//.test(text)) return text;
  return text.replace(WORD, (w, off: number) => {
    const before = text[off - 1], after = text[off + w.length];
    const lower = w.toLowerCase();
    if (KEEP.has(lower)) return w;
    if (after && /[\d_₀-₉]/.test(after)) return w;                       // R12, CO₂, t2
    if (before && /[\d_]/.test(before)) return w;                         // 4G, 3x
    const codeLike = /^[A-Z]{2,5}$/.test(w);                                               // SHP, MRF, HUB
    if (codeLike && after === "-" && /[A-Z0-9]/.test(text[off + w.length + 1] ?? "")) return w;   // SHP-0001, MRF-DWK
    if (codeLike && before === "-" && /[A-Z0-9]/.test(text[off - 2] ?? "")) return w;             // WTE-OKH
    return translitWord(w, key);
  });
}
