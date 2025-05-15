(function () {

  if (window.location.href.includes("?")) { 
    return;
  }

  // CSS einfügen
  var style = document.createElement('style');
  style.innerHTML = `
    /* Container für das Feedback-Widget */
    #feedback-widget {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 10000;
      font-family: Arial, sans-serif;
    }
    /* Floating Action Button */
    #feedback-button {
      background-color: #007BFF;
      color: white;
      border: none;
      border-radius: 50px;
      width: 50px;
      height: 50px;
      cursor: pointer;
      font-size: 24px;
      transition: width 0.3s, padding 0.3s, transform 0.3s;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      position: relative;
    }
    /* Standardzustand: Icon zentriert */
    #feedback-button .icon {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
    }
    /* Beim Hover: Button verbreitert sich, Icon wird linksbündig, Text erscheint */
    #feedback-button:hover {
      width: 210px;
      padding-left: 10px;
      justify-content: flex-start;
    }
    #feedback-button:hover .icon {
      position: static;
      transform: none;
    }
    #feedback-button .text {
      margin-left: 8px;
      opacity: 0;
      transition: opacity 0.3s;
      white-space: nowrap;
      font-size: 16px;
    }
    #feedback-button:hover .text {
      opacity: 1;
    }
    /* Wackel-Animation */
    @keyframes wiggle {
      0% { transform: rotate(0deg); }
      15% { transform: rotate(15deg); }
      30% { transform: rotate(-15deg); }
      45% { transform: rotate(15deg); }
      60% { transform: rotate(-15deg); }
      75% { transform: rotate(15deg); }
      100% { transform: rotate(0deg); }
    }
    .wiggle {
      animation: wiggle 0.6s ease;
    }
    /* Modal Hintergründe */
    #feedback-modal, #consent-modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.4);
      z-index: 9999;
    }
    /* Modal Inhalt: begrenzt auf 80% der Höhe */
    #feedback-content, #consent-content {
      background: #fff;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 550px;
      max-width: 95%;
      max-height: 80vh;
      border-radius: 10px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      display: flex;
      flex-direction: column;
    }
    /* Header fixiert oben */
    #feedback-header, #consent-header {
      background-color: #007BFF;
      color: white;
      padding: 10px 15px;
      border-radius: 10px 10px 0 0;
      font-size: 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
      cursor: move;
    }
    /* Scrollbarer Bereich */
    #feedback-scroll, #consent-scroll {
      overflow-y: auto;
      padding: 20px;
    }
    /* Schließen-Button */
    #close-feedback, #close-consent {
      cursor: pointer;
      font-size: 24px;
      line-height: 1;
    }
    /* Formular-Stile */
    #feedback-form label {
      display: block;
      margin-top: 20px;
      font-weight: bold;
    }
    #feedback-form p.intro-text {
      margin: 10px 0;
      line-height: 1.5;
      font-size: 14px;
    }
    #feedback-form textarea, 
    #feedback-form input[type="text"],
    #feedback-form input[type="number"],
    #feedback-form select {
      width: 100%;
      padding: 10px;
      margin-top: 8px;
      box-sizing: border-box;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 14px;
    }
    #feedback-form input[type="range"] {
      width: 100%;
      margin-top: 8px;
    }
    #feedback-form button {
      margin-top: 30px;
      padding: 12px;
      width: 100%;
      background-color: #28a745;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
    }
    /* Radio-Buttons in einer Reihe */
    .radio-group {
      display: flex;
      align-items: center;
      gap: 15px;
      margin-top: 8px;
    }
    .radio-group label {
      margin: 0;
      font-weight: normal;
    }
    .hidden {
      display: none;
    }
    /* Bereichsüberschriften */
    .section-header {
      margin-top: 30px;
      padding-bottom: 5px;
      border-bottom: 1px solid #ccc;
      font-size: 16px;
      font-weight: bold;
    }
    /* Consent Modal spezifische Stile */
    #consent-form label {
      display: block;
      margin-top: 20px;
      font-weight: bold;
    }
    #consent-form .consent-text {
      margin: 10px 0;
      line-height: 1.5;
      font-size: 14px;
      white-space: pre-wrap;
    }
    #consent-form input[type="checkbox"] {
      margin-right: 8px;
    }
    #consent-form button {
      margin-top: 20px;
      padding: 12px;
      width: 100%;
      background-color: #007BFF;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
    }
    #consent-form button:disabled {
      background-color: #aaa;
      cursor: not-allowed;
    }
  `;
  document.head.appendChild(style);

  // Vollständiger Consent-Text (nicht gekürzt)
  var fullConsentText = "Informed Consent of Participation\n\n" +
    "You are invited to participate in the online study Algorithmic And Language-based Analysis For The Detection Of Phishing Emails: Development Of A Hybrid Evaluation System, initiated and conducted by Jannik Hurst, and Felix Dietz M.Sc.. The research is supervised by Felix Dietz M.Sc. at the LMU Munich. Please note:\n\n" +
    "- Your participation is voluntary.\n" +
    "- The online study will last approximately 5 min.\n" +
    "- We will record personal demographics (age).\n" +
    "- You will receive no compensation.\n" +
    "- We may publish results from this and other sessions.\n" +
    "If you have any questions about the whole informed consent process of this research or your rights as a human research subject, please contact Felix Dietz M.Sc. (E-Mail: felix.dietz@unibw.de). You should carefully read the settings below. You may take as much time as you need to read the consent form. If you do not fully agree with something, or if your questions have not all been answered to your satisfaction, then you should not give your consent.\n\n" +
    "1. Purpose and Goal of this Research\n" +
    "Gathering qualitative feedback on the report. Developing and testing a system for better and more user-friendly detection and explanation of phishing mails. Your participation will help us achieve this goal. The results of this research may be presented at scientific or professional meetings or published in scientific proceedings and journals.\n\n" +
    "2. Participation and Compensation\n" +
    "Your participation in this online study is voluntary. You will be one of approximately 10 people being surveyed for this research. You will receive no compensation. You may withdraw and discontinue participation at any time. If possible, you may refuse to answer any questions you do not want to answer or withdraw from participation at any time.\n\n" +
    "At any time and without giving any reason, you can notify us that you want to withdraw the consent given (GDPR Art. 21). In case of withdrawal, your data stored based on your consent will be deleted or anonymized where this is legally permissible (GDPR Art. 17). If deletion is impossible or only possible with unreasonable technical effort, your data will be anonymized by deleting the personal identification information. However, anonymization of your data cannot entirely exclude the possibility of subsequent tracing of information to you via other sources. Finally, once the data is anonymized, the deletion of the data is not possible anymore as we will not be able to identify which data is yours.\n\n" +
    "3. Procedure\n" +
    "After giving consent, you will be able to fill the feedback form.\n" +
    "The complete procedure of this online study will last approximately 5 min.\n\n" +
    "4. Risks and Benefits\n" +
    "There are no risks associated with this online study. Discomforts or inconveniences will be minor and are unlikely to happen. If you feel uncomfortable, you may discontinue your participation. (You will not directly benefit through participation in this online study. We hope that the settings obtained from your participation may help to bring forward the research in this field.) With this research, we will advance knowledge in this research field.\n\n" +
    "5. Data Protection and Confidentiality\n" +
    "The General Data Protection Regulation (GDPR) of the European Union (EU) governs that data collection process. The legal basis for processing the personal data is the consent in accordance with GDPR Art. 6 (1). The GDPR guarantees a set of right to the data subjects, including the right to access, rectification, and erasure of personal data.\n\n" +
    "- You have the right to access your personal data at any time (GDPR Art. 15).\n" +
    "- You have the right to correct inaccurate personal data at any time (GDPR Art. 16).\n" +
    "- You have the right to have your personal data deleted (GDPR Art. 17).\n" +
    "- You have the right to limit the processing of your personal data (GDPR Art. 18).\n" +
    "- You have the right to have your data transferred to others (GDPR Art. 20).\n" +
    "- You have the right to withdraw the consent given (GDPR Art. 21).\n" +
    "If you wish to exercise any of your rights, please contact the researchers.\n\n" +
    "Personal data (age) will be recorded during participation. Researchers will not identify you by your real name in any reports using settings obtained from this online study, and your confidentiality as a participant in this online study will remain secure. Data collected in this online study will be treated in compliance with the GDPR.\n\n" +
    "We will record demographics, make manual notes, and browser meta data during the online study. All data you provide in this online study will not be published and kept confidential. This site uses cookies and other tracking technologies to conduct the research, to improve the user experience, the ability to interact with the system and to provide additional content from third parties. Despite careful control of content, the researchers assume no liability for damages, which directly or indirectly result from the use of this online application.\n\n" +
    "Your non-anonymized data will be stored for 1 year from the time your consent is given, unless you withdraw your consent before this period has elapsed. Your non-anonymized data will be stored in a secure location and will be accessible only to the researchers involved in this work.\n\n" +
    "The data collected cannot be viewed or used for futher research by everyone outside the researchers involved in this work. The data collected will be deleted after the end of the research. or if you contact the researcher to delete them.\n\n" +
    "As with any publication or online-related activity, the risk of a breach of confidentiality is always possible. According to the GDPR, the researchers will inform the participant if a breach of confidential data is detected.\n\n" +
    "6. Identification of Investigators\n" +
    "If you have any questions or concerns about the research, please feel free to contact:\n\n" +
    "Jannik Hurst (j.hurst@campus.lmu.de)\n" +
    "Felix Dietz M.Sc.\n" +
    "Principal Investigator\n" +
    "Frauenlobstr 7a\n" +
    "80337 Munich, Germany\n" +
    "felix.dietz@unibw.de\n\n" +
    "7. Informed Consent and Agreement\n" +
    "I understand the explanation provided to me. I have had all my questions answered to my satisfaction, and I voluntarily agree to participate in this online study.\n\n" +
    "I voluntarily consent to my data being recorded and subsequently processed in line with the GDPR. I have been informed about the consequences of withdrawing my consent.";

  // HTML-Struktur erstellen
  var widgetContainer = document.createElement('div');
  widgetContainer.id = 'feedback-widget';
  widgetContainer.innerHTML = `
    <button id="feedback-button" title="Feedback geben">
      <span class="icon">&#128172;</span>
      <span class="text">Jetzt Feedback geben</span>
    </button>
    <!-- Consent Modal -->
    <div id="consent-modal">
      <div id="consent-content">
        <div id="consent-header">
          <span>Informed Consent</span>
          <span id="close-consent" title="Schließen">&times;</span>
        </div>
        <div id="consent-scroll">
          <form id="consent-form">
            <div class="consent-text">${fullConsentText}</div>
            <label>
              <input type="checkbox" id="consent-checkbox">
              Ich stimme zu.
            </label>
            <button type="button" id="consent-continue" disabled>Weiter</button>
          </form>
        </div>
      </div>
    </div>
    <!-- Feedback Modal -->
    <div id="feedback-modal">
      <div id="feedback-content">
        <div id="feedback-header">
          <span>Feedback</span>
          <span id="close-feedback" title="Schließen">&times;</span>
        </div>
        <div id="feedback-scroll">
          <div id="feedback-intro">
          Beim Absenden wird das Feedback mit dem Report verknüpft. Die hochgeladene E-Mail wird jedoch zu keinem Zeitpunkt gespeichert. 
            <p class="intro-text">
            </p>
          </div>
          <form id="feedback-form">
            <!-- Persönliche Einschätzung -->
            <div class="section-header">Persönliche Einschätzung</div>
            
            <!-- PE1: Alter -->
            <label for="pe-age">PE1. Wie alt sind Sie?</label>
            <input type="number" id="pe-age" name="pe-age" placeholder="Ihr Alter" min="10" max="120">
            
            <!-- PE2: Selbsteinschätzung als Dropdown -->
            <label for="pe-knowledge">PE2. Wie schätzen Sie Ihr Wissen zu E-Mail-Sicherheit und Phishing ein?</label>
            <select id="pe-knowledge" name="pe-knowledge">
              <option value="Anfänger">Anfänger</option>
              <option value="Fortgeschritten">Fortgeschritten</option>
              <option value="Experte">Experte</option>
            </select>
            
            <!-- Neue Fragen zu E-Mail-Aktivität -->
            <label for="pe-emails-received">PE3. Wie viele E-Mails empfangen Sie durchschnittlich pro Tag?</label>
            <input type="number" id="pe-emails-received" name="pe-emails-received" placeholder="Anzahl empfangener E-Mails" min="0">
            
            <label for="pe-emails-sent">PE4. Wie viele E-Mails versenden Sie durchschnittlich pro Tag?</label>
            <input type="number" id="pe-emails-sent" name="pe-emails-sent" placeholder="Anzahl gesendeter E-Mails" min="0">
            
            <!-- Report-Feedback -->
            <div class="section-header">Report-Feedback</div>
            
            <!-- RS1: Einsendegrund -->
            <label for="rs1-reason">RS1. Was hat Sie dazu bewogen, diesen E-Mail-Report einzusenden? (z. B. bestehender Verdacht, Routinecheck o.ä.)</label>
            <textarea id="rs1-reason" name="rs1-reason" placeholder="Ihr Einsendegrund und ggf. Verdachtsbegründung..."></textarea>
            
            <!-- RS2: Verständlichkeit der Erklärungen -->
            <label for="rs2-clarity">RS2. Wie verständlich waren die Erklärungen im Report zur Analyse der E-Mail? (1 = unverständlich, 10 = sehr verständlich)</label>
            <input type="range" id="rs2-clarity" name="rs2-clarity" min="1" max="10" value="5">
            <span id="rs2-clarity-value">5</span>
            
            <!-- RS3: Darstellung des Reports -->
            <label for="rs3-design">RS3. Wie beurteilen Sie die Darstellung und visuelle Aufbereitung des Reports? (1 = schlecht, 10 = ausgezeichnet)</label>
            <input type="range" id="rs3-design" name="rs3-design" min="1" max="10" value="5">
            <span id="rs3-design-value">5</span>
            
            <!-- RS4: Unklarheiten -->
            <label for="rs4-questions">RS4. Gab es Unklarheiten oder Punkte, die Sie genauer erläutert haben möchten? Falls ja, welche?</label>
            <textarea id="rs4-questions" name="rs4-questions" placeholder="Ihre Anmerkungen..."></textarea>
            
            <!-- RS5: Unterstützung beim Erkennen von Risiken -->
            <label for="rs5-support">RS5. Wie gut unterstützt der Report Sie dabei, zukünftige Risiken selbstständig zu erkennen? (1 = gar nicht, 10 = sehr gut)</label>
            <input type="range" id="rs5-support" name="rs5-support" min="1" max="10" value="5">
            <span id="rs5-support-value">5</span>
            
            <!-- RS6: Allgemeines Feedback -->
            <label for="rs6-feedback">RS6. Haben Sie weiteres Feedback oder Anmerkungen?</label>
            <textarea id="rs6-feedback" name="rs6-feedback" placeholder="Weiteres Feedback..."></textarea>
            
            <!-- Neue Fragen zum Vertrauen -->
            <label for="rs7-email-trust">RS7. Wie sehr vertrauen Sie der eingesendeten E-Mail nach Erhalt des Feedbacks? (1 = gar nicht, 10 = sehr)</label>
            <input type="range" id="rs7-email-trust" name="rs7-email-trust" min="1" max="10" value="5">
            <span id="rs7-email-trust-value">5</span>
            
            <label for="rs8-feedback-trust">RS8. Wie sehr vertrauen Sie dem erhaltenen Feedback? (1 = gar nicht, 10 = sehr)</label>
            <input type="range" id="rs8-feedback-trust" name="rs8-feedback-trust" min="1" max="10" value="5">
            <span id="rs8-feedback-trust-value">5</span>
            
            <button type="submit">Feedback absenden</button>
          </form>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(widgetContainer);

  // DOM-Elemente holen
  var feedbackButton = document.getElementById('feedback-button');
  var feedbackModal = document.getElementById('feedback-modal');
  var closeFeedback = document.getElementById('close-feedback');
  var feedbackForm = document.getElementById('feedback-form');

  var consentModal = document.getElementById('consent-modal');
  var closeConsent = document.getElementById('close-consent');
  var consentCheckbox = document.getElementById('consent-checkbox');
  var consentContinue = document.getElementById('consent-continue');

  // Dynamische Anzeige der Slider-Werte
  var rs2Clarity = document.getElementById('rs2-clarity');
  var rs2ClarityValue = document.getElementById('rs2-clarity-value');
  rs2Clarity.addEventListener('input', function () {
    rs2ClarityValue.textContent = rs2Clarity.value;
  });
  var rs3Design = document.getElementById('rs3-design');
  var rs3DesignValue = document.getElementById('rs3-design-value');
  rs3Design.addEventListener('input', function () {
    rs3DesignValue.textContent = rs3Design.value;
  });
  var rs5Support = document.getElementById('rs5-support');
  var rs5SupportValue = document.getElementById('rs5-support-value');
  rs5Support.addEventListener('input', function () {
    rs5SupportValue.textContent = rs5Support.value;
  });
  var rs7EmailTrust = document.getElementById('rs7-email-trust');
  var rs7EmailTrustValue = document.getElementById('rs7-email-trust-value');
  rs7EmailTrust.addEventListener('input', function () {
    rs7EmailTrustValue.textContent = rs7EmailTrust.value;
  });
  var rs8FeedbackTrust = document.getElementById('rs8-feedback-trust');
  var rs8FeedbackTrustValue = document.getElementById('rs8-feedback-trust-value');
  rs8FeedbackTrust.addEventListener('input', function () {
    rs8FeedbackTrustValue.textContent = rs8FeedbackTrust.value;
  });

  // Checkbox-Logik: Weiter-Button aktivieren/deaktivieren
  consentCheckbox.addEventListener('change', function () {
    consentContinue.disabled = !consentCheckbox.checked;
  });

  // Öffnen und Schließen der Modals
  feedbackButton.addEventListener('click', function () {
    // Prüfen, ob Consent bereits gegeben wurde
    if (!localStorage.getItem('consentGiven')) {
      consentModal.style.display = 'block';
    } else {
      feedbackModal.style.display = 'block';
      loadPersonalData();
    }
  });
  closeFeedback.addEventListener('click', function () {
    feedbackModal.style.display = 'none';
  });
  closeConsent.addEventListener('click', function () {
    consentModal.style.display = 'none';
  });
  window.addEventListener('click', function (e) {
    if (e.target === feedbackModal) {
      feedbackModal.style.display = 'none';
    }
    if (e.target === consentModal) {
      consentModal.style.display = 'none';
    }
  });

  // Consent "Weiter" Button Logik
  consentContinue.addEventListener('click', function () {
    if (!consentCheckbox.checked) {
      return;
    }
    localStorage.setItem('consentGiven', 'true');
    consentModal.style.display = 'none';
    feedbackModal.style.display = 'block';
    loadPersonalData();
  });

  // Funktion: Persönliche Daten laden, falls bereits vorhanden
  function loadPersonalData() {
    if (localStorage.getItem('pe-age')) {
      document.getElementById('pe-age').value = localStorage.getItem('pe-age');
    }
    if (localStorage.getItem('pe-knowledge')) {
      document.getElementById('pe-knowledge').value = localStorage.getItem('pe-knowledge');
    }
    if (localStorage.getItem('pe-emails-received')) {
      document.getElementById('pe-emails-received').value = localStorage.getItem('pe-emails-received');
    }
    if (localStorage.getItem('pe-emails-sent')) {
      document.getElementById('pe-emails-sent').value = localStorage.getItem('pe-emails-sent');
    }
  }

  // Formular absenden: Persönliche Einschätzung im Local Storage speichern und reportbezogene Daten versenden
  feedbackForm.addEventListener('submit', function (e) {
    e.preventDefault();
    // Persönliche Daten speichern
    localStorage.setItem('pe-age', document.getElementById('pe-age').value);
    localStorage.setItem('pe-knowledge', document.getElementById('pe-knowledge').value);
    localStorage.setItem('pe-emails-received', document.getElementById('pe-emails-received').value);
    localStorage.setItem('pe-emails-sent', document.getElementById('pe-emails-sent').value);

    var data = {
      // Persönliche Einschätzung
      pe_age: document.getElementById('pe-age').value,
      pe_knowledge: document.getElementById('pe-knowledge').value,
      pe_emails_received: document.getElementById('pe-emails-received').value,
      pe_emails_sent: document.getElementById('pe-emails-sent').value,
      // Report-spezifisches Feedback
      rs_reason: document.getElementById('rs1-reason').value,
      rs_clarity: document.getElementById('rs2-clarity').value,
      rs_design: document.getElementById('rs3-design').value,
      rs_questions: document.getElementById('rs4-questions').value,
      rs_support: document.getElementById('rs5-support').value,
      rs_feedback: document.getElementById('rs6-feedback').value,
      rs_email_trust: document.getElementById('rs7-email-trust').value,
      rs_feedback_trust: document.getElementById('rs8-feedback-trust').value,
      emailReport: localStorage.getItem("emailReport") || null
    };

    fetch('/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (response) {
      if (response.ok) {
        alert('Feedback wurde erfolgreich gesendet.');
      } else {
        alert('Beim Senden des Feedbacks ist ein Fehler aufgetreten.');
      }
      feedbackModal.style.display = 'none';
    }).catch(function (error) {
      alert('Fehler: ' + error);
      feedbackModal.style.display = 'none';
    });
  });

  // Verschiebbarkeit des Feedback-Containers
  (function makeDraggable(el) {
    var posX = 0, posY = 0, mouseX = 0, mouseY = 0;
    var header = el.querySelector('#feedback-header') || el;
    header.onmousedown = dragMouseDown;
    function dragMouseDown(e) {
      e = e || window.event;
      e.preventDefault();
      mouseX = e.clientX;
      mouseY = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }
    function elementDrag(e) {
      e = e || window.event;
      e.preventDefault();
      posX = mouseX - e.clientX;
      posY = mouseY - e.clientY;
      mouseX = e.clientX;
      mouseY = e.clientY;
      el.style.top = (el.offsetTop - posY) + "px";
      el.style.left = (el.offsetLeft - posX) + "px";
    }
    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  })(document.getElementById('feedback-content'));

  // CTA: Wackeleffekt alle 5 Sekunden, wenn das Modal nicht offen ist
  setInterval(function () {
    if (feedbackModal.style.display !== 'block' && consentModal.style.display !== 'block') {
      feedbackButton.classList.add('wiggle');
      setTimeout(function () {
        feedbackButton.classList.remove('wiggle');
      }, 600);
    }
  }, 5000);
})();