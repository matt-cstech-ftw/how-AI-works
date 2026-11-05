import { completeActivity, saveQuizScore } from '../../assets/js/progress.js';

const CERT_STORAGE_KEY = 'ai_course_certificate_v1';

// DOM Elements
const examPaperView = document.getElementById('exam-paper-view');
const certificateScreen = document.getElementById('certificate-screen');
const answeredReadout = document.getElementById('answered-readout');
const returningGradBanner = document.getElementById('returning-grad-banner');
const btnBannerViewCert = document.getElementById('btn-banner-view-cert');
const btnTopViewCert = document.getElementById('btn-top-view-cert');

const btnSubmitExam = document.getElementById('btn-submit-exam');

// Modals
const passModal = document.getElementById('pass-modal');
const passModalScoreText = document.getElementById('pass-modal-score-text');
const modalNameInput = document.getElementById('modal-name-input');
const btnConfirmName = document.getElementById('btn-confirm-name');

const failModal = document.getElementById('fail-modal');
const failModalScoreText = document.getElementById('fail-modal-score-text');
const btnRetryExam = document.getElementById('btn-retry-exam');

// Certificate Screen DOM
const certCanvas = document.getElementById('cert-canvas');
const certSerialReadout = document.getElementById('cert-serial-readout');
const btnEditCertName = document.getElementById('btn-edit-cert-name');
const btnDownloadCert = document.getElementById('btn-download-cert');
const btnPrintCert = document.getElementById('btn-print-cert');
const btnRetakeExam = document.getElementById('btn-retake-exam');

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
refreshIcons();

function generateRandom10DigitSerial() {
  let s = String(Math.floor(1 + Math.random() * 9));
  for (let i = 0; i < 9; i++) {
    s += String(Math.floor(Math.random() * 10));
  }
  return s;
}

function getSavedCert() {
  try {
    const raw = localStorage.getItem(CERT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveCertData(data) {
  localStorage.setItem(CERT_STORAGE_KEY, JSON.stringify(data));
}

function updateAnsweredCount() {
  const count = document.querySelectorAll('.exam-opt.selected').length;
  answeredReadout.textContent = `Completed: ${count} / 10`;
}

// Check if user already has a saved certificate
const existingCert = getSavedCert();
if (existingCert) {
  returningGradBanner.classList.remove('hidden');
  btnTopViewCert.classList.remove('hidden');
  modalNameInput.value = existingCert.name || '';
}

// If navigated with ?view=cert and a certificate exists, open the certificate screen directly
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('view') === 'cert' && existingCert) {
  showCertificateScreen(existingCert);
}

// Option Selection (No right/wrong colors ever shown on options)
document.querySelectorAll('.exam-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    const parent = opt.closest('.exam-q-card');
    parent.querySelectorAll('.exam-opt').forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
    updateAnsweredCount();
  });
});

// Submit Examination
btnSubmitExam.addEventListener('click', () => {
  const cards = document.querySelectorAll('.exam-q-card');
  const selected = document.querySelectorAll('.exam-opt.selected');

  if (selected.length < cards.length) {
    alert(`Please select an answer for all 10 questions before submitting (${selected.length} of 10 answered).`);
    return;
  }

  let correctCount = 0;
  cards.forEach(card => {
    const chosen = card.querySelector('.exam-opt.selected');
    if (chosen && chosen.dataset.correct === 'true') {
      correctCount++;
    }
  });

  const pct = Math.round((correctCount / cards.length) * 100);

  if (pct >= 70) {
    // Passed! Mark course complete and prompt for name BEFORE showing certificate
    completeActivity('mod-05', 200);
    saveQuizScore('mod-05', pct, 70);

    passModalScoreText.textContent = `You scored ${pct}% (${correctCount} out of 10) and have officially passed the Final Examination. Please enter your name below as you would like it to appear on your Certificate of Completion.`;
    passModal.classList.remove('hidden');
    setTimeout(() => modalNameInput.focus(), 80);
  } else {
    // Did not pass: show supportive pop-up without revealing specific answers
    failModalScoreText.textContent = `You scored ${pct}% (${correctCount} out of 10). A score of 70% (7 out of 10) is required to pass. Take your time. You can try the exam again right now, or head back to the dashboard to review the modules first.`;
    failModal.classList.remove('hidden');
  }
});

// Retry after failing
btnRetryExam.addEventListener('click', () => {
  failModal.classList.add('hidden');
  document.querySelectorAll('.exam-opt').forEach(o => o.classList.remove('selected'));
  updateAnsweredCount();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Confirm Name in Pass Modal -> Generate & Transition to Certificate Screen
function confirmNameAndOpenCertificate() {
  const enteredName = modalNameInput.value.trim() || 'Course Graduate';
  const prev = getSavedCert();
  const serialNumber = prev && prev.serialNumber ? prev.serialNumber : generateRandom10DigitSerial();
  const dateStr = prev && prev.dateStr
    ? prev.dateStr
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const certData = {
    name: enteredName,
    dateStr,
    serialNumber
  };

  saveCertData(certData);
  passModal.classList.add('hidden');
  returningGradBanner.classList.remove('hidden');
  btnTopViewCert.classList.remove('hidden');
  showCertificateScreen(certData);
}

btnConfirmName.addEventListener('click', confirmNameAndOpenCertificate);
modalNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmNameAndOpenCertificate();
});

function showCertificateScreen(certData) {
  examPaperView.classList.add('hidden');
  answeredReadout.classList.add('hidden');
  certificateScreen.classList.remove('hidden');
  certSerialReadout.textContent = `Serial No: ${certData.serialNumber}`;
  renderWhitePaperCertificate(certData);
  refreshIcons();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

btnBannerViewCert.addEventListener('click', () => {
  const cert = getSavedCert();
  if (cert) showCertificateScreen(cert);
});

btnTopViewCert.addEventListener('click', () => {
  const cert = getSavedCert();
  if (cert) showCertificateScreen(cert);
});

btnEditCertName.addEventListener('click', () => {
  const cert = getSavedCert();
  if (cert) modalNameInput.value = cert.name;
  passModal.classList.remove('hidden');
  setTimeout(() => modalNameInput.focus(), 80);
});

btnRetakeExam.addEventListener('click', () => {
  certificateScreen.classList.add('hidden');
  examPaperView.classList.remove('hidden');
  answeredReadout.classList.remove('hidden');
  document.querySelectorAll('.exam-opt').forEach(o => o.classList.remove('selected'));
  updateAnsweredCount();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ==========================================
// CLASSIC WHITE-PAPER CERTIFICATE RENDERER
// White paper, patterned black border, "How AI Works | Fundamentals" at top,
// "CERTIFICATE OF COMPLETION", Name Line, Subtext, Date, and tiny 10-digit serial in bottom right.
// ==========================================
function renderWhitePaperCertificate(certData) {
  const data = certData || getSavedCert() || {
    name: 'Course Graduate',
    dateStr: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    serialNumber: generateRandom10DigitSerial()
  };

  const ctx = certCanvas.getContext('2d');
  const w = certCanvas.width;   // 1200
  const h = certCanvas.height;  // 840

  // 1. Crisp White Paper Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  // 2. Outer Solid Black Border
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 8;
  ctx.strokeRect(28, 28, w - 56, h - 56);

  // Inner Fine Hairline Border
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(40, 40, w - 80, h - 80);

  // 3. Patterned Beaded/Dotted Black Inner Border
  ctx.fillStyle = '#222222';
  const dotInset = 54;
  const dotSpacing = 14;
  const dotRadius = 3.2;

  for (let x = dotInset; x <= w - dotInset; x += dotSpacing) {
    ctx.beginPath();
    ctx.arc(x, dotInset, dotRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, h - dotInset, dotRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let y = dotInset + dotSpacing; y <= h - dotInset - dotSpacing; y += dotSpacing) {
    ctx.beginPath();
    ctx.arc(dotInset, y, dotRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(w - dotInset, y, dotRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. Top Header: "How AI Works | Fundamentals"
  ctx.fillStyle = '#333333';
  ctx.font = '600 20px "Inter", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('How AI Works  |  Fundamentals', w / 2, 135);

  // 5. Main Title: "CERTIFICATE OF COMPLETION"
  ctx.fillStyle = '#111111';
  ctx.font = '700 54px "Cinzel", Georgia, "Times New Roman", serif';
  ctx.fillText('CERTIFICATE OF COMPLETION', w / 2, 235);

  // 6. Lead-in Line
  ctx.fillStyle = '#222222';
  ctx.font = '400 23px "Inter", Georgia, sans-serif';
  ctx.fillText('This certificate is hereby bestowed upon', w / 2, 340);

  // 7. Recipient Name & Crisp Black Name Line
  ctx.fillStyle = '#111111';
  ctx.font = 'italic 600 58px "Cormorant Garamond", Georgia, "Times New Roman", serif';
  ctx.fillText(data.name, w / 2, 435);

  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 310, 452);
  ctx.lineTo(w / 2 + 310, 452);
  ctx.stroke();

  // 8. Subtext Underneath
  ctx.fillStyle = '#222222';
  ctx.font = '400 22px "Inter", Georgia, sans-serif';
  ctx.fillText(
    'for the successful completion of the How AI Works | Fundamentals curriculum,',
    w / 2,
    525
  );
  ctx.fillText(
    'demonstrating foundational knowledge of how modern artificial intelligence systems operate.',
    w / 2,
    562
  );

  // 9. Date Centered at Bottom
  ctx.fillStyle = '#111111';
  ctx.font = '500 21px "Inter", Georgia, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`Date: ${data.dateStr}`, w / 2, 695);

  // 10. Tiny Randomized 10-Digit Serial Number in Bottom Right Corner
  ctx.fillStyle = '#555555';
  ctx.font = '500 11px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`SN: ${data.serialNumber}`, w - 74, h - 72);
}

btnDownloadCert.addEventListener('click', () => {
  const cert = getSavedCert();
  renderWhitePaperCertificate(cert);
  const link = document.createElement('a');
  link.download = 'How-AI-Works-Certificate.png';
  link.href = certCanvas.toDataURL('image/png');
  link.click();
});

btnPrintCert.addEventListener('click', () => {
  const cert = getSavedCert();
  renderWhitePaperCertificate(cert);
  window.print();
});

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    const cert = getSavedCert();
    if (cert && !certificateScreen.classList.contains('hidden')) {
      renderWhitePaperCertificate(cert);
    }
  });
}
