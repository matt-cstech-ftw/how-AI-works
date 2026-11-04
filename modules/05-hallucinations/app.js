import { AutoTokenizer, AutoModelForCausalLM, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';
import { completeActivity, saveQuizScore } from '../../assets/js/progress.js';

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = 'HuggingFaceTB/SmolLM2-135M-Instruct';

// ==========================================
// STAGE 1 DATA: SPOT THE 99%-CONFIDENT HALLUCINATION
// ==========================================
const AUDIT_CASES = [
  {
    roundTag: 'AUDIT CASE 1 OF 3 // THE FAMOUS WORD-ASSOCIATION TRAP',
    title: 'Two Truths and a 98%-Confident Hallucination!',
    prompt: '"Give me 3 quick facts about the 1969 Apollo 11 Moon Landing."',
    claims: [
      {
        text: '1. Apollo 11 launched from Kennedy Space Center on July 16, 1969, carrying Commander Neil Armstrong, Buzz Aldrin, and Michael Collins.',
        conf: 99,
        isLie: false,
        feedback: `<strong>That one is 100% True!</strong> Look closely at the other two statements—which one sounds smooth on the surface but is historically impossible?`
      },
      {
        text: '2. Neil Armstrong became the first human to walk on the lunar surface, famously declaring, "That\'s one small step for a man, one giant leap for mankind."',
        conf: 99,
        isLie: false,
        feedback: `<strong>That one is also 100% True!</strong> Check Statement #3 to see where the AI got carried away!`
      },
      {
        text: '3. Before climbing back into the Lunar Module, Buzz Aldrin celebrated by playing a solo on a golden saxophone he brought from Houston.',
        conf: 97,
        isLie: true,
        feedback: `<strong>Busted! Hallucination Caught!</strong> Why did the AI say 97% confidence on a golden saxophone? Because once the sentence started with <em>"celebrated by playing a solo on a..."</em>, the grammar rules made <code>"saxophone"</code> a top-scoring next word—even though it never happened!`
      }
    ],
    walkthrough: null
  },
  {
    roundTag: 'AUDIT CASE 2 OF 3 // THE "POPULAR MYTH" COMPLETION TRAP',
    title: 'Find the Fabricated Engineering Fact!',
    prompt: '"Tell me 3 engineering facts about the Golden Gate Bridge in San Francisco."',
    claims: [
      {
        text: '1. The Golden Gate Bridge opened in 1937 and is painted in a signature shade called "International Orange" to make it visible through thick bay fog.',
        conf: 98,
        isLie: false,
        feedback: `<strong>Verified Fact!</strong> International Orange is indeed the real official color of the Golden Gate Bridge. Keep scanning!`
      },
      {
        text: '2. Every winter, engineers unhook the main suspension cables so the entire bridge can float south to San Diego for warmer weather.',
        conf: 95,
        isLie: true,
        feedback: `<strong>Hallucination Busted!</strong> Notice how once the AI predicted the words <em>"float south to..."</em>, its Star Map & Self-Attention naturally picked <code>"San Diego for warmer weather"</code> at 95% certainty because those words fit together grammatically!`
      },
      {
        text: '3. The main suspension span stretches 4,200 feet across the Golden Gate strait, connecting San Francisco to Marin County.',
        conf: 99,
        isLie: false,
        feedback: `<strong>Verified Fact!</strong> The main span is 4,200 feet long and connects to Marin County. Look at Statement #2!`
      }
    ],
    walkthrough: {
      tag: 'LEARNING MOMENT • THE FLUENCY TRAP EXPLAINED',
      title: 'Why AI Sounds Most Confident Right When It Lies',
      svgHtml: `
        <svg width="350" height="88" viewBox="0 0 350 88" fill="none">
          <rect x="12" y="18" width="145" height="52" rx="8" fill="#063928" stroke="#10b981" stroke-width="2"/>
          <text x="84" y="40" fill="#10b981" font-family="JetBrains Mono" font-size="11" font-weight="bold" text-anchor="middle">Grammar Score: 98%</text>
          <text x="84" y="57" fill="#d1fae5" font-family="JetBrains Mono" font-size="9" text-anchor="middle">"Sounds like good English"</text>

          <text x="175" y="48" fill="#ef4444" font-family="JetBrains Mono" font-size="18" font-weight="bold" text-anchor="middle">≠</text>

          <rect x="193" y="18" width="145" height="52" rx="8" fill="#3f1111" stroke="#ef4444" stroke-width="2"/>
          <text x="265" y="40" fill="#fca5a5" font-family="JetBrains Mono" font-size="11" font-weight="bold" text-anchor="middle">Fact Check: 0%</text>
          <text x="265" y="57" fill="#fecaca" font-family="JetBrains Mono" font-size="9" text-anchor="middle">"No built-in truth database"</text>
        </svg>
      `,
      bodyHtml: `
        Now you see how Labs 01, 02, 03, and 04 connect!<br><br>
        Because an AI only predicts <strong>what word sounds most natural next</strong> based on grammar and word neighborhoods, it can wander into a completely fake story and still score <strong>98% certainty</strong> on every word along the way!
      `,
      autoAdvanceToStage2: false
    }
  },
  {
    roundTag: 'AUDIT CASE 3 OF 3 // THE FAKE CITATION HALLUCINATION',
    title: 'Catch the Infamous "Fake Court Case" Hallucination!',
    prompt: '"Give me 3 real rules about airline passenger refunds and legal precedents."',
    claims: [
      {
        text: '1. Under US Department of Transportation rules, passengers are entitled to a full cash refund if an airline cancels their flight and they choose not to travel.',
        conf: 99,
        isLie: false,
        feedback: `<strong>100% True!</strong> That is the real US DOT refund rule. Check the other two statements!`
      },
      {
        text: '2. In the landmark 1987 Supreme Court case "Marty McFly v. Hill Valley Airlines (482 U.S. 901)", the Court ruled that delayed passengers must be given a free DeLorean.',
        conf: 96,
        isLie: true,
        feedback: `<strong>Fake Citation Caught!</strong> Lawyers in real life have actually gotten in trouble for pasting AI-invented court cases into legal briefs—because the AI formats fake case numbers like <code>"482 U.S. 901"</code> so convincingly!`
      },
      {
        text: '3. Airlines are required to refund checked bag fees if your luggage is significantly delayed and not delivered within the mandated timeframe.',
        conf: 98,
        isLie: false,
        feedback: `<strong>100% True!</strong> Look closely at the court case name in Statement #2!`
      }
    ],
    walkthrough: null
  }
];

// ==========================================
// STAGE 2 DATA: THE RAG FACT-INJECTOR
// ==========================================
const RAG_CHALLENGES = [
  {
    roundTag: 'CURE 1 OF 2 // GROUNDING WITH LIVE DATA (RAG)',
    title: 'Cure the AI\'s Hallucination About Company Policy!',
    question: '"What is the refund deadline at Apex Wash & Detail for ceramic coating packages?"',
    hallucinatedAnswer: `"At Apex Wash & Detail, customers can request a full refund within 90 days of purchase, provided they mail a handwritten letter to our headquarters in Seattle." (100% Hallucinated—the AI doesn't know this private company, so it guessed a generic policy!)`,
    correctCardIdx: 1,
    cards: [
      {
        title: 'Dossier A: Global Weather Almanac (1995)',
        snippet: 'Average annual rainfall in Seattle, Washington is 37.5 inches per year.',
        wrongReason: 'That document is about Seattle rainfall! If you inject unrelated facts into the prompt, the AI still won\'t know the refund policy.'
      },
      {
        title: 'Dossier B: Official Apex Wash & Detail Service Policy (Verified)',
        snippet: 'OFFICIAL POLICY: Cancellations made 48+ hours before a scheduled ceramic coating appointment receive a 100% instant digital refund. Same-day cancellations incur a $35 booking fee.',
        groundedAnswer: `"According to the Official Apex Wash & Detail Service Policy, you receive a 100% instant digital refund if you cancel at least 48 hours before your appointment, while same-day cancellations have a $35 booking fee."`
      },
      {
        title: 'Dossier C: Ancient Roman Ceramic Pottery Guide',
        snippet: 'Roman amphorae were fired in kilns at temperatures between 800°C and 1000°C.',
        wrongReason: 'That card has the word "ceramic" in it, but it\'s about Ancient Roman pottery! Pick Dossier B instead.'
      }
    ]
  },
  {
    roundTag: 'CURE 2 OF 2 // BREAKING A FALSE PREMISE WITH RAG',
    title: 'Stop the AI From Agreeing With a Trick Question!',
    question: '"Which astronaut brought the first golden retriever onto the International Space Station in 2004?"',
    hallucinatedAnswer: `"In 2004, Commander Mark Kelly famously brought a golden retriever named 'Astro' aboard the International Space Station for a 30-day zero-gravity experiment." (Hallucinated! The AI played along with the user's false question!)`,
    correctCardIdx: 0,
    cards: [
      {
        title: 'Dossier A: NASA Official ISS Biological History Log (Verified)',
        snippet: 'VERIFIED NASA RECORD: No dog or golden retriever has ever visited the International Space Station (ISS). In 2004, the ISS Expedition 9 crew consisted only of Gennady Padalka and Michael Fincke.',
        groundedAnswer: `"Actually, no golden retriever or dog has ever visited the International Space Station! According to NASA records, only human astronauts (Expedition 9) were aboard the ISS in 2004."`
      },
      {
        title: 'Dossier B: American Kennel Club Golden Retriever Care Guide',
        snippet: 'Golden Retrievers are friendly, intelligent dogs that require 60 minutes of daily exercise.',
        wrongReason: 'That card only talks about dog exercise—it doesn\'t give the AI the NASA facts needed to refute the space station myth!'
      },
      {
        title: 'Dossier C: 2004 Olympic Games Medal Count',
        snippet: 'The 2004 Summer Olympics were held in Athens, Greece.',
        wrongReason: 'That card is from 2004, but it\'s about the Athens Olympics! Click Dossier A (NASA Official Record).'
      }
    ]
  }
];

// State
let currentStage = 1;
let s1Idx = 0;
let s1Solved = false;
let s2Idx = 0;
let s2Solved = false;
let auditsCleared = 0;

// Stage 3 Live Model State
let tokenizer = null;
let model = null;
let isGenerating = false;
let activeTrapQuestion = 'In one short sentence, why did Leonardo da Vinci invent the first iPhone in 1495?';
let activeTrapFact = 'FACT CHECK: Leonardo da Vinci lived from 1452 to 1519 and never invented the iPhone. The iPhone was introduced by Apple in 2007.';

// DOM Elements
const progressReadout = document.getElementById('progress-readout');
const tabStage1 = document.getElementById('tab-stage-1');
const tabStage2 = document.getElementById('tab-stage-2');
const tabStage3 = document.getElementById('tab-stage-3');

const stage1Panel = document.getElementById('stage-1-panel');
const stage2Panel = document.getElementById('stage-2-panel');
const stage3Panel = document.getElementById('stage-3-panel');

// Stage 1 DOM
const auditRoundTag = document.getElementById('audit-round-tag');
const auditTitle = document.getElementById('audit-title');
const s1Terminal = document.getElementById('s1-terminal');
const s1PromptDisplay = document.getElementById('s1-prompt-display');
const s1ClaimsList = document.getElementById('s1-claims-list');
const s1GaugePct = document.getElementById('s1-gauge-pct');
const s1GaugeLabel = document.getElementById('s1-gauge-label');
const s1Diagnostic = document.getElementById('s1-diagnostic');
const s1DiagText = document.getElementById('s1-diag-text');
const btnS1Next = document.getElementById('btn-s1-next');

// Stage 2 DOM
const ragRoundTag = document.getElementById('rag-round-tag');
const ragTitle = document.getElementById('rag-title');
const ragCardsContainer = document.getElementById('rag-cards-container');
const ragQuestionBox = document.getElementById('rag-question-box');
const ragStatusPill = document.getElementById('rag-status-pill');
const ragInjectedContext = document.getElementById('rag-injected-context');
const ragAiAnswer = document.getElementById('rag-ai-answer');
const s2Diagnostic = document.getElementById('s2-diagnostic');
const s2DiagText = document.getElementById('s2-diag-text');
const btnS2Next = document.getElementById('btn-s2-next');

// Stage 3 DOM
const btnRunBluff = document.getElementById('btn-run-bluff');
const btnRunGrounded = document.getElementById('btn-run-grounded');
const s3SelectedQ = document.getElementById('s3-Selected-q');
const s3ModelStatus = document.getElementById('s3-model-status');
const s3StreamOutput = document.getElementById('s3-stream-output');
const s3Diagnostic = document.getElementById('s3-diagnostic');
const s3DiagText = document.getElementById('s3-diag-text');
const btnStage3Quiz = document.getElementById('btn-stage3-quiz');

// Modals
const wtModal = document.getElementById('walkthrough-modal');
const wtTag = document.getElementById('wt-tag');
const wtTitle = document.getElementById('wt-title');
const wtVisual = document.getElementById('wt-visual');
const wtBody = document.getElementById('wt-body');
const btnWtClose = document.getElementById('btn-wt-close');

const quizModal = document.getElementById('quiz-modal');
const btnOpenQuiz = document.getElementById('btn-open-quiz');
const btnCloseQuiz = document.getElementById('btn-close-quiz');
const btnSubmitQuiz = document.getElementById('btn-submit-quiz');
const quizFeedback = document.getElementById('quiz-feedback');

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
refreshIcons();

if (new URLSearchParams(window.location.search).get('quiz') === '1') {
  quizModal.classList.remove('hidden');
}

function updateAudits(val) {
  auditsCleared = Math.max(auditsCleared, val);
  progressReadout.innerHTML = `Audits Cleared: <strong>${auditsCleared} / 6</strong>`;
  if (auditsCleared >= 5) {
    completeActivity('mod-05', 200);
    btnOpenQuiz.classList.add('btn-primary');
  }
}

function switchStage(num) {
  currentStage = num;
  [stage1Panel, stage2Panel, stage3Panel].forEach((p, i) => p.classList.toggle('hidden', i + 1 !== num));
  [tabStage1, tabStage2, tabStage3].forEach((t, i) => t.classList.toggle('active', i + 1 === num));

  if (num === 1) loadAuditCase(s1Idx);
  if (num === 2) loadRagChallenge(s2Idx);
  if (num === 3) {
    tabStage3.classList.add('completed');
    updateAudits(6);
  }
}

tabStage1.addEventListener('click', () => switchStage(1));
tabStage2.addEventListener('click', () => switchStage(2));
tabStage3.addEventListener('click', () => switchStage(3));

// ==========================================
// STAGE 1 LOGIC: SPOT THE HALLUCINATION
// ==========================================
function loadAuditCase(idx) {
  s1Idx = idx;
  s1Solved = false;
  const c = AUDIT_CASES[idx];

  auditRoundTag.textContent = c.roundTag;
  auditTitle.textContent = c.title;
  s1PromptDisplay.innerHTML = `<strong>User Prompt:</strong> ${c.prompt}`;
  s1Terminal.className = 'dossier-terminal';
  s1ClaimsList.innerHTML = '';
  btnS1Next.classList.add('hidden');

  s1GaugePct.textContent = '98%';
  s1GaugeLabel.textContent = 'SOUNDS SMOOTH!';
  s1GaugeLabel.style.color = '#10b981';

  s1Diagnostic.className = 'diagnostic-bar status-neutral';
  s1DiagText.innerHTML = `<strong>Your Mission:</strong> Click the <strong>1 fabricated statement</strong> above where the AI hallucinated a fake fact!`;

  c.claims.forEach((claim) => {
    const row = document.createElement('div');
    row.className = 'claim-segment';
    row.innerHTML = `
      <span>${claim.text}</span>
      <span class="conf-pill">${claim.conf}% Word Certainty</span>
    `;

    row.addEventListener('mouseenter', () => {
      s1GaugePct.textContent = `${claim.conf}%`;
    });

    row.addEventListener('click', () => {
      if (s1Solved) return;

      if (claim.isLie) {
        s1Solved = true;
        row.classList.add('caught-lie');
        s1Terminal.className = 'dossier-terminal solved';
        s1GaugeLabel.textContent = 'FLUENCY TRAP EXPOSED!';
        s1GaugeLabel.style.color = '#ef4444';

        s1Diagnostic.className = 'diagnostic-bar status-solved';
        s1DiagText.innerHTML = claim.feedback;
        btnS1Next.classList.remove('hidden');

        updateAudits(s1Idx + 1);

        if (s1Idx < AUDIT_CASES.length - 1) {
          btnS1Next.innerHTML = `<span>Next Audit Case</span><i data-lucide="arrow-right" class="icon-xs"></i>`;
        } else {
          tabStage1.classList.add('completed');
          btnS1Next.innerHTML = `<span>Go to Stage 2: The RAG Fact-Injector</span><i data-lucide="shield-check" class="icon-xs"></i>`;
        }

        if (c.walkthrough) {
          wtTag.textContent = c.walkthrough.tag;
          wtTitle.textContent = c.walkthrough.title;
          wtVisual.innerHTML = c.walkthrough.svgHtml;
          wtBody.innerHTML = c.walkthrough.bodyHtml;
          wtModal.classList.remove('hidden');
        }
        refreshIcons();
      } else {
        row.classList.add('verified-truth');
        s1Terminal.classList.remove('error-shake');
        void s1Terminal.offsetWidth;
        s1Terminal.classList.add('error-shake');

        s1Diagnostic.className = 'diagnostic-bar status-good';
        s1DiagText.innerHTML = claim.feedback;
      }
    });

    s1ClaimsList.appendChild(row);
  });
}

btnS1Next.addEventListener('click', () => {
  if (s1Idx < AUDIT_CASES.length - 1) loadAuditCase(s1Idx + 1);
  else switchStage(2);
});

btnWtClose.addEventListener('click', () => wtModal.classList.add('hidden'));

// ==========================================
// STAGE 2 LOGIC: THE RAG FACT-INJECTOR
// ==========================================
function loadRagChallenge(idx) {
  s2Idx = idx;
  s2Solved = false;
  const ch = RAG_CHALLENGES[idx];

  ragRoundTag.textContent = ch.roundTag;
  ragTitle.textContent = ch.title;
  ragQuestionBox.innerHTML = `<strong>User Question:</strong> ${ch.question}`;

  ragStatusPill.className = 'hallucination-warning-tag';
  ragStatusPill.textContent = 'STATUS: HALLUCINATING FROM MEMORY';

  ragInjectedContext.classList.add('hidden');
  ragAiAnswer.style.borderColor = 'rgba(239, 68, 68, 0.5)';
  ragAiAnswer.style.color = '#fecaca';
  ragAiAnswer.innerHTML = ch.hallucinatedAnswer;

  btnS2Next.classList.add('hidden');
  s2Diagnostic.className = 'diagnostic-bar status-neutral';
  s2DiagText.innerHTML = `<strong>Cure the Hallucination:</strong> Click the matching <strong>Verified Fact Card</strong> on the left to paste real evidence into the AI's prompt!`;

  ragCardsContainer.innerHTML = '';
  ch.cards.forEach((card, cIdx) => {
    const el = document.createElement('div');
    el.className = 'evidence-card';
    el.innerHTML = `
      <strong style="font-size:0.84rem; color:var(--text-primary);">${card.title}</strong>
      <span style="font-family:var(--font-mono); font-size:0.74rem; color:var(--text-secondary);">${card.snippet}</span>
    `;

    el.addEventListener('click', () => {
      if (s2Solved) return;
      ragCardsContainer.querySelectorAll('.evidence-card').forEach(c => c.classList.remove('injected', 'wrong-doc'));

      if (cIdx === ch.correctCardIdx) {
        s2Solved = true;
        el.classList.add('injected');

        ragStatusPill.className = 'hallucination-warning-tag grounded-tag';
        ragStatusPill.textContent = 'STATUS: GROUNDED IN VERIFIED EVIDENCE (RAG)';

        ragInjectedContext.classList.remove('hidden');
        ragInjectedContext.innerHTML = `<strong>+ INJECTED INTO PROMPT:</strong> ${card.snippet}`;

        ragAiAnswer.style.borderColor = '#10b981';
        ragAiAnswer.style.color = '#d1fae5';
        ragAiAnswer.innerHTML = card.groundedAnswer;

        s2Diagnostic.className = 'diagnostic-bar status-solved';
        s2DiagText.innerHTML = `<strong>Hallucination Cured!</strong> By pasting the verified record directly into the prompt before the AI started guessing words, Self-Attention locked onto the real facts instead of guessing from blurry memory!`;
        btnS2Next.classList.remove('hidden');

        updateAudits(3 + s2Idx + 1);

        if (s2Idx < RAG_CHALLENGES.length - 1) {
          btnS2Next.innerHTML = `<span>Next RAG Challenge</span><i data-lucide="arrow-right" class="icon-xs"></i>`;
        } else {
          tabStage2.classList.add('completed');
          btnS2Next.innerHTML = `<span>Unlock Stage 3: Live AI Bluff Sandbox</span><i data-lucide="sparkles" class="icon-xs"></i>`;
        }
        refreshIcons();
      } else {
        el.classList.add('wrong-doc');
        s2Diagnostic.className = 'diagnostic-bar status-error';
        s2DiagText.innerHTML = `<strong>Wrong Evidence Dossier!</strong> ${card.wrongReason}`;
      }
    });

    ragCardsContainer.appendChild(el);
  });
}

btnS2Next.addEventListener('click', () => {
  if (s2Idx < RAG_CHALLENGES.length - 1) loadRagChallenge(s2Idx + 1);
  else switchStage(3);
});

// ==========================================
// STAGE 3 LOGIC: LIVE BROWSER AI HALLUCINATION TRAP
// ==========================================
document.querySelectorAll('.trap-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    activeTrapQuestion = btn.dataset.q;
    activeTrapFact = btn.dataset.fact;
    s3SelectedQ.textContent = `Trick Question: "${activeTrapQuestion}"`;
    s3StreamOutput.innerHTML = `Question loaded! Now click <strong>Run Mode A (Watch It Bluff)</strong> or <strong>Run Mode B (Inject Fact-Check Note)</strong> above.`;
  });
});

async function runLiveTrapGeneration(useRagFact) {
  if (isGenerating) return;
  isGenerating = true;

  btnRunBluff.disabled = true;
  btnRunGrounded.disabled = true;

  try {
    if (!model || !tokenizer) {
      s3ModelStatus.textContent = 'Waking Up SmolLM2-135M...';
      s3StreamOutput.innerHTML = `<span style="color:var(--cyan);">Loading live browser AI model from cache...</span>`;
      let device = 'wasm';
      if (navigator.gpu) {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) device = 'webgpu';
      }
      tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
      model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, { dtype: 'q4', device });
      s3ModelStatus.textContent = 'SmolLM2-135M: Active';
    }

    const systemPrompt = useRagFact
      ? `You are a factual assistant. Use ONLY this verified fact to answer in ONE short sentence: ${activeTrapFact}`
      : `You are a creative assistant. Play along and answer the user's question in ONE short sentence.`;

    const fullChat = `<|im_start|>system\n${systemPrompt}<|im_end|>\n<|im_start|>user\n${activeTrapQuestion}<|im_end|>\n<|im_start|>assistant\n`;

    s3StreamOutput.innerHTML = useRagFact
      ? `<div style="color:var(--emerald); font-size:0.75rem; margin-bottom:0.4rem;">[INJECTED FACT-CHECK]: ${activeTrapFact}</div><span style="color:var(--text-muted);">Generating grounded answer...</span>`
      : `<div style="color:var(--amber); font-size:0.75rem; margin-bottom:0.4rem;">[NO FACT-CHECK ATTACHED — RAW NEXT-WORD PREDICTION]</div><span style="color:var(--text-muted);">Generating unassisted answer...</span>`;

    const inputs = await tokenizer(fullChat);
    const out = await model.generate({
      ...inputs,
      max_new_tokens: 34,
      temperature: 0.3,
      do_sample: false
    });

    const promptLen = inputs.input_ids.dims[1];
    const generatedIds = Array.from(out.data).slice(promptLen).map(Number);
    const cleanText = tokenizer.decode(generatedIds, { skip_special_tokens: true }).trim();

    s3StreamOutput.innerHTML = useRagFact
      ? `<div style="color:var(--emerald); font-size:0.75rem; margin-bottom:0.45rem;">[GROUNDED WITH RAG FACT-CHECK]: ${activeTrapFact}</div><strong style="color:#d1fae5;">"${cleanText}"</strong>`
      : `<div style="color:var(--amber); font-size:0.75rem; margin-bottom:0.45rem;">[RAW MEMORY MODE — NO FACT-CHECK]:</div><strong style="color:#fde68a;">"${cleanText}"</strong>`;

    s3Diagnostic.className = 'diagnostic-bar status-solved';
    s3DiagText.innerHTML = useRagFact
      ? `<strong>Look at that difference!</strong> When we injected the <code>FACT CHECK</code> note into the prompt, Self-Attention locked onto the real dates and immediately rejected the trick question!`
      : `<strong>Caught in the act!</strong> Without a fact-check card in the prompt, the miniature AI just played the next-word guessing game and smoothly invented a reason! Now click <strong>Run Mode B</strong> to see how injecting a fact note cures it!`;

    updateAudits(6);
  } catch (err) {
    s3StreamOutput.textContent = `Model note: ${err.message}`;
  } finally {
    isGenerating = false;
    btnRunBluff.disabled = false;
    btnRunGrounded.disabled = false;
  }
}

btnRunBluff.addEventListener('click', () => runLiveTrapGeneration(false));
btnRunGrounded.addEventListener('click', () => runLiveTrapGeneration(true));

// ==========================================
// QUIZ MODAL LOGIC (Visual Per-Option Grading)
// ==========================================
btnOpenQuiz.addEventListener('click', () => quizModal.classList.remove('hidden'));
btnStage3Quiz.addEventListener('click', () => quizModal.classList.remove('hidden'));
btnCloseQuiz.addEventListener('click', () => quizModal.classList.add('hidden'));

document.querySelectorAll('.quiz-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    const parent = opt.closest('.quiz-q');
    parent.querySelectorAll('.quiz-opt').forEach(o => {
      o.classList.remove('selected', 'ans-correct', 'ans-wrong');
      const oldTag = o.querySelector('.quiz-status-tag');
      if (oldTag) oldTag.remove();
    });
    const oldHint = parent.querySelector('.q-inline-hint');
    if (oldHint) oldHint.remove();

    opt.classList.add('selected');
  });
});

btnSubmitQuiz.addEventListener('click', () => {
  const questions = document.querySelectorAll('.quiz-q');
  const selected = document.querySelectorAll('.quiz-opt.selected');
  if (selected.length < questions.length) {
    alert('Please select an answer for all 3 questions.');
    return;
  }

  let correct = 0;
  questions.forEach(q => {
    const chosen = q.querySelector('.quiz-opt.selected');
    const oldTag = chosen.querySelector('.quiz-status-tag');
    if (oldTag) oldTag.remove();
    const oldHint = q.querySelector('.q-inline-hint');
    if (oldHint) oldHint.remove();

    const isRight = chosen.dataset.correct === 'true';
    const tag = document.createElement('span');
    tag.className = 'quiz-status-tag';

    if (isRight) {
      correct++;
      chosen.classList.add('ans-correct');
      tag.textContent = '✔ CORRECT';
      chosen.appendChild(tag);
    } else {
      chosen.classList.add('ans-wrong');
      tag.textContent = '✖ NOT QUITE';
      chosen.appendChild(tag);

      if (q.dataset.hint) {
        const hintEl = document.createElement('div');
        hintEl.className = 'q-inline-hint';
        hintEl.innerHTML = `<strong>Hint:</strong> ${q.dataset.hint}`;
        q.appendChild(hintEl);
      }
    }
  });

  quizFeedback.classList.remove('hidden');
  if (correct === 3) {
    completeActivity('mod-05', 200);
    saveQuizScore('mod-05', 100, 100);
    quizFeedback.style.background = 'var(--emerald-dim)';
    quizFeedback.style.color = 'var(--emerald)';
    quizFeedback.innerHTML = `<strong>🎉 3/3 Correct! Course 100% Completed (+300 XP)!</strong> Returning to your Mastered Dashboard...`;
    setTimeout(() => { window.location.href = '../../index.html'; }, 1500);
  } else {
    quizFeedback.style.background = 'rgba(239, 68, 68, 0.15)';
    quizFeedback.style.color = '#fca5a5';
    quizFeedback.innerHTML = `<strong>You scored ${correct} out of 3.</strong> Check the red answer(s) and hint above, pick a new option, and verify again!`;
  }
});

// Boot Stage 1 on load
loadAuditCase(0);