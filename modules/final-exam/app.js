import { completeActivity, saveQuizScore } from '../../assets/js/progress.js';

const answeredReadout = document.getElementById('answered-readout');
const btnSubmitExam = document.getElementById('btn-submit-exam');
const examScoreReport = document.getElementById('exam-score-report');

const certificateSection = document.getElementById('certificate-section');
const certCanvas = document.getElementById('cert-canvas');
const certNameInput = document.getElementById('cert-name-input');
const btnDownloadCert = document.getElementById('btn-download-cert');
const btnPrintCert = document.getElementById('btn-print-cert');

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
refreshIcons();

function updateAnsweredCount() {
  const count = document.querySelectorAll('.exam-opt.selected').length;
  answeredReadout.innerHTML = `Answered: <strong>${count} / 10</strong>`;
}

document.querySelectorAll('.exam-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    const parent = opt.closest('.exam-q-card');
    parent.querySelectorAll('.exam-opt').forEach(o => {
      o.classList.remove('selected', 'ans-correct', 'ans-wrong');
      const oldTag = o.querySelector('.quiz-status-tag');
      if (oldTag) oldTag.remove();
    });
    opt.classList.add('selected');
    updateAnsweredCount();
  });
});

btnSubmitExam.addEventListener('click', () => {
  const cards = document.querySelectorAll('.exam-q-card');
  const selected = document.querySelectorAll('.exam-opt.selected');

  if (selected.length < cards.length) {
    alert(`Please select an answer for all 10 questions before grading (you have answered ${selected.length} of 10).`);
    return;
  }

  let correctCount = 0;
  const wrongList = [];

  cards.forEach((card, idx) => {
    const chosen = card.querySelector('.exam-opt.selected');
    const oldTag = chosen.querySelector('.quiz-status-tag');
    if (oldTag) oldTag.remove();

    const isRight = chosen.dataset.correct === 'true';
    const tag = document.createElement('span');
    tag.className = 'quiz-status-tag';

    if (isRight) {
      correctCount++;
      chosen.classList.add('ans-correct');
      tag.textContent = '✔ CORRECT';
      chosen.appendChild(tag);
    } else {
      wrongList.push(`Question #${idx + 1}`);
      chosen.classList.add('ans-wrong');
      tag.textContent = '✖ INCORRECT';
      chosen.appendChild(tag);
    }
  });

  const pct = Math.round((correctCount / cards.length) * 100);

  if (pct >= 70) {
    // Mark Capstone & Course 100% Complete
    completeActivity('mod-05', 200);
    saveQuizScore('mod-05', pct, 70);

    const missedSummary = wrongList.length > 0
      ? `Missed: ${wrongList.join(', ')} (marked in red above).`
      : `Perfect 10/10 score!`;

    examScoreReport.innerHTML = `
      <strong style="color:var(--emerald); font-size:1.05rem;">🎉 Exam Passed! Final Score: ${pct}% (${correctCount} / 10)</strong><br>
      <span style="color:var(--text-primary);">${missedSummary} Your official Certificate of Completion has been generated below!</span>
    `;

    certificateSection.classList.remove('hidden');
    renderWhitePaperCertificate();
    setTimeout(() => {
      certificateSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  } else {
    examScoreReport.innerHTML = `
      <strong style="color:var(--red); font-size:1.05rem;">Final Score: ${pct}% (${correctCount} / 10) — 70% (7 / 10) Required to Pass</strong><br>
      <span style="color:#fecaca;">You missed: <strong>${wrongList.join(', ')}</strong> (marked in red above). Review your selections and click <strong>Submit & Grade Final Exam</strong> again.</span>
    `;
    certificateSection.classList.add('hidden');
  }
});

// ==========================================
// CLASSIC WHITE-PAPER CERTIFICATE RENDERER
// Matches attached reference: White paper, outer solid black border + inner dotted black border,
// "How AI Works | Fundamentals" at top, "CERTIFICATE OF COMPLETION", Name Line, Subtext, and Date.
// ==========================================
function renderWhitePaperCertificate() {
  const ctx = certCanvas.getContext('2d');
  const w = certCanvas.width;   // 1200
  const h = certCanvas.height;  // 840
  const recipient = certNameInput.value.trim() || 'Student Name';
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // 1. Crisp White Paper Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  // 2. Outer Solid Black/Charcoal Border
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 8;
  ctx.strokeRect(28, 28, w - 56, h - 56);

  // Inner Fine Hairline Border
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(40, 40, w - 80, h - 80);

  // 3. Patterned Beaded/Dotted Black Inner Border (Matches Reference Certificate!)
  ctx.fillStyle = '#222222';
  const dotInset = 54;
  const dotSpacing = 14;
  const dotRadius = 3.2;

  // Top & Bottom Horizontal Dotted Borders
  for (let x = dotInset; x <= w - dotInset; x += dotSpacing) {
    ctx.beginPath();
    ctx.arc(x, dotInset, dotRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, h - dotInset, dotRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Left & Right Vertical Dotted Borders
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
  ctx.fillText(recipient, w / 2, 435);

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

  // 9. Date at Bottom
  ctx.fillStyle = '#111111';
  ctx.font = '500 21px "Inter", Georgia, sans-serif';
  ctx.fillText(`Date: ${dateStr}`, w / 2, 695);
}

certNameInput.addEventListener('input', renderWhitePaperCertificate);

btnDownloadCert.addEventListener('click', () => {
  renderWhitePaperCertificate();
  const link = document.createElement('a');
  link.download = 'How-AI-Works-Certificate.png';
  link.href = certCanvas.toDataURL('image/png');
  link.click();
});

btnPrintCert.addEventListener('click', () => {
  renderWhitePaperCertificate();
  window.print();
});

// Ensure web fonts render crisply onto the canvas once loaded
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    if (!certificateSection.classList.contains('hidden')) {
      renderWhitePaperCertificate();
    }
  });
}
