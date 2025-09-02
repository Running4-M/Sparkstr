// Update imports
import { 
  getCurrentUserId,
  getSmartPlan,
  updateSmartPlan,
  db,
  initializeFirebase,
  fetchEventData,
  updateProgressInFirebase,
  getEventIdFromUrl,
  saveSmartPlanChatMessage,
} from "../backend/firebase.js";

import { checkAndUpdateUsage } from '../backend/planUsage.js';
import { firebaseInitPromise, getCurrentUserId } from "../backend/firebase.js";
import { 
  collection, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
firebaseInitPromise.then(() => {
  if (!getCurrentUserId()) {
    window.location.href = "../Login/signup.html";
  }
});
// ...existing code...
let sidebarMode = 'chat'; // 'chat' or 'nav'

function getSpinnerSVG() {
  return `
    <svg class="icon spinner" viewBox="0 0 24 24" style="width:22px;height:22px;">
      <circle cx="12" cy="12" r="10" stroke="#a78bfa" stroke-width="4" fill="none" opacity="0.2"/>
      <path d="M22 12a10 10 0 0 1-10 10" stroke="#facc15" stroke-width="4" fill="none">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
      </path>
    </svg>
  `;
}



function showToast(message, type = 'info', duration = 2000) {

  // Remove any existing toast
  document.querySelectorAll('.custom-toast').forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = 'custom-toast';
  toast.style.cssText = `
    position: fixed;
    top: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: #23272f;
    color: #fff;
    border-radius: 8px;
    padding: 10px 22px;
    font-size: 15px;
    font-weight: 600;
    z-index: 99999;
    box-shadow: 0 2px 12px #0004;
    opacity: 0.97;
    display: flex;
    align-items: center;
    gap: 10px;
  `;
  // Simple icons
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';
  toast.innerHTML = `<span style="font-size:18px;">${icon}</span> <span>${message}</span>`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 350);
  }, 2000);
}

const premiumModels = [
  { key: 'nano', label: 'Nano', desc: 'Fast, basic answers', toast: 'Nano: Fastest, basic capabilities for quick replies.' },
  { key: 'mini', label: 'Mini', desc: 'Smarter, more accurate', toast: 'Mini: Smarter, more accurate answers with better reasoning.' },
  { key: 'full', label: 'Full', desc: 'Best, advanced GPT-4.1', toast: 'Full: Most advanced, best reasoning and creativity (GPT-4.1).' }
];
let premiumIdx = 0;
let state = { premiumModel: 'gpt-4.1-nano' };

function updatePremiumBtn() {
  const btn = document.getElementById('premiumChatBtn');
  if (!btn) return;
  const model = premiumModels[premiumIdx];
  btn.classList.remove('nano', 'mini', 'full');
  btn.classList.add(model.key);
  btn.querySelector('.premium-label').textContent = model.label;
  btn.querySelector('.premium-desc').textContent = model.desc;
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('premiumChatBtn');
  if (btn) {
    btn.onclick = () => {
      premiumIdx = (premiumIdx + 1) % premiumModels.length;
      updatePremiumBtn();
      showToast(premiumModels[premiumIdx].toast, 'info');
      state.premiumModel = (
        premiumModels[premiumIdx].key === 'nano' ? 'gpt-4.1-nano' :
        premiumModels[premiumIdx].key === 'mini' ? 'gpt-4.1-mini' :
        'gpt-4.1-full'
      );
    };
    updatePremiumBtn();
  }
});

// Add this array near the top of your file (after imports)
const imageLoadingPhrases = [
  "Analysing your beautiful image...",
  "Wow, love the colours! 🎨",
  "Scanning pixels for awesomeness...",
  "Looking for hidden details...",
  "Appreciating your artistic taste...",
  "Zooming in on creativity...",
  "Image detected! Summoning my inner artist...",
  "Processing your visual story...",
  "That's a cool image! Analysing...",
  "Let me take a closer look at your picture..."
];

// Helper: Convert file to base64 (for images)
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Helper: Extract text from PDF
async function extractPdfText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map(item => item.str);
    text += strings.join(' ') + '\n';
  }
  return text;
}

// Helper: Extract text from DOCX
async function extractDocxText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const contentXml = await zip.file("word/document.xml").async("string");
  const xmlDoc = new DOMParser().parseFromString(contentXml, "application/xml");
  const textNodes = [...xmlDoc.getElementsByTagName("w:t")];
  return textNodes.map(node => node.textContent).join(" ");
}

// Helper: Process file for attachment (image/pdf/docx)
async function processFileAttachment(item) {
  const file = item.file;
  if (!file) return null;

  // Image
  if (file.type.startsWith("image/") || /\.(png|jpe?g|gif|bmp|webp)$/i.test(file.name)) {
    const base64 = await fileToBase64(file);
    return { name: file.name, isImage: true, base64 };
  }
  // PDF
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const content = await extractPdfText(file);
    return { name: file.name, content };
  }
  // DOCX
  if (file.name.toLowerCase().endsWith(".docx")) {
    const content = await extractDocxText(file);
    return { name: file.name, content };
  }
  // Fallback
  return { name: file.name, content: "Unsupported file type." };
}



// Helper: Process URL via backend parser
async function processUrlContent(url) {
  try {
    const response = await fetch(`https://my-backend-three-pi.vercel.app/api/parser?url=${encodeURIComponent(url)}`);
    if (!response.ok) throw new Error(`Failed to fetch URL content: ${response.status}`);
    const data = await response.json();
    return data.text || '';
  } catch (error) {
    console.error("❌ Error processing URL:", error);
    return "Could not fetch content from this URL. Please try another link.";
  }
}






// --- Update renderAttachments to show images in chat ---
function renderAttachments(attachments) {
  if (!attachments) return '';

  let html = '';

  if (
    (attachments.files?.length > 0) ||
    (attachments.urls?.length > 0)
  ) {
    html += '<div class="attachments-preview" style="display:flex;gap:8px;flex-wrap:wrap;">';

    if (attachments.files?.length > 0) {
      html += '<div class="files-section" style="display:flex;gap:8px;">';
      attachments.files.forEach(file => {
        if (file.isImage && file.base64) {
          html += `
            <div class="attachment-item" style="display:inline-block;width:62px;">
              <img src="${file.base64}" alt="${file.name}" style="max-width:60px;max-height:60px;border-radius:6px;vertical-align:middle;margin-right:2px;border:1px solid #e5e7eb;">
              <span class="attachment-name" style="font-size:12px;">${file.name}</span>
            </div>
          `;
        } else if (file.name) {
          html += `
            <div class="attachment-item" style="display:inline-block;min-width:80px;">
              <span class="attachment-icon">📎</span>
              <span class="attachment-name" style="font-size:12px;">${file.name}</span>
            </div>
          `;
        }
      });
      html += '</div>';
    }

    if (attachments.urls?.length > 0) {
      html += '<div class="urls-section" style="display:flex;gap:8px;">';
      attachments.urls.forEach(url => {
        if (url.url) {
          html += `
            <div class="attachment-item" style="display:inline-block;min-width:80px;">
              <span class="attachment-icon">🔗</span>
              <span class="attachment-name" style="font-size:12px;">${url.url}</span>
            </div>
          `;
        }
      });
      html += '</div>';
    }

    html += '</div>';
  }

  return html;
}



// Chat Interface - Vanilla JavaScript Implementation
class ChatInterface {
  constructor() {
  // … your existing fields …
  this.messages = [
    {
    }
  ];
  this.hasSentFirstPrompt = false;
  this.selectedContextSteps = [];
  
     // highest
this.smartPlanSteps = [];
  this.chatHistory = [];     // WILL HOLD { role, content } pairs
  this.smartPlan = null;     // WILL BE POPULATED FROM fire­store
  this.currentStep = null;   // WILL BE SET BASED ON stepProgress
  this.isDarkMode = false;
  this.isTyping = false;
  this.init();
}


   async init() {
    await initializeFirebase();
    await this.loadMessagesFromFirestore(); // <-- Load messages from Firestore
    this.createStyles();
    this.createHTML();
    this.bindEvents();
    this.scrollToBottom();
    this.setupTheme();
    this.hideLoader();
  }

  showInputLoader() {
  // Remove if already exists
  this.hideInputLoader();

  const phrases = imageLoadingPhrases;
  let idx = Math.floor(Math.random() * phrases.length);

  const overlay = document.createElement('div');
  overlay.id = 'input-loader-overlay';
  overlay.style.cssText = `
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(255,255,255,0.85);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 100;
    pointer-events: all;
    border-radius: 24px;
  `;
  overlay.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
      <span style="display:inline-block;width:32px;height:32px;border-radius:50%;border:4px solid #a78bfa;border-top:4px solid #facc15;animation:spin 1s linear infinite;"></span>
      <span id="input-loader-text" style="font-size:17px;color:#7c3aed;font-weight:500;">${phrases[idx]}</span>
    </div>
    <style>
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  `;
  const inputWrapper = document.querySelector('.input-wrapper');
  if (inputWrapper) inputWrapper.appendChild(overlay);

  // Animate phrases
  this._inputLoaderInterval = setInterval(() => {
    idx = (idx + 1) % phrases.length;
    const textEl = document.getElementById('input-loader-text');
    if (textEl) textEl.textContent = phrases[idx];
  }, 2000);
}

hideInputLoader() {
  const overlay = document.getElementById('input-loader-overlay');
  if (overlay) overlay.remove();
  if (this._inputLoaderInterval) clearInterval(this._inputLoaderInterval);
}

  async loadMessagesFromFirestore() {
    try {
      const responseId = getEventIdFromUrl();
      const userId = getCurrentUserId();
      if (!responseId || !userId) return;

      const chatCol = collection(db, "users", userId, "responses", responseId, "smartplan_chat");
      const q = query(chatCol, orderBy("timestamp", "asc"));
      const snapshot = await getDocs(q);

      this.messages = [];
      this.chatHistory = [];

      snapshot.forEach(docSnap => {
        const msg = docSnap.data();
        // For backwards compatibility, handle missing fields
        this.messages.push({
          id: docSnap.id,
          text: msg.text || "",
          isUser: !!msg.isUser,
          files: msg.files || [],
          urls: msg.urls || [],
        });
        this.chatHistory.push({
          role: msg.isUser ? "user" : "assistant",
          content: msg.text || "",
        });
      });

      // If no messages, add the default welcome message
      if (this.messages.length === 0) {
        this.messages.push({
          id: '1',
          text: "Hello! I'm your AI assistant. I can help you with your Smart Plan. What would you like to explore today?",
          isUser: false,
        });
      }
    } catch (err) {
      console.error("Failed to load chat messages from Firestore:", err);
    }
  }

  createStyles() {
    
     const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=Roboto:wght@400;500;700&display=swap';
  document.head.appendChild(fontLink);
  const style = document.createElement('style');
    style.textContent = `
     * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    html, body {
      font-family: 'Inter', 'Roboto', Arial, sans-serif;
      background: #f6f7fb;
      min-width: 0 !important;
      max-width: 100vw !important;
      overflow-x: hidden !important;
    }
    body {
      font-size: 17px;
      color: #23272f;
      margin: 0;
      padding: 0;
      overflow-x: hidden !important;
    }
    .chat-container {
  min-height: 100vh;
  background: #f6f7fb;
  max-width: 100vw;
  width: 100vw;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
}
 .chat-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  width: 100vw;
  max-width: 100vw;
  z-index: 100;
  background: rgba(255,255,255,0.95);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  height: 64px;
  min-height: 64px;
  padding: 0 24px;
}
@media (max-width: 640px) {
  .chat-header {
    height: 52px;
    min-height: 52px;
    padding: 0 10px;
  }
}
.header-content {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 10px;
}
.header-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}
.header-title {
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 2px;
  letter-spacing: 0.01em;
  line-height: 1.1;
}
.header-subtitle {
  color: #6b7280;
  font-size: 12px;
  line-height: 1.1;
}
.back-button {
  padding: 4px;
  border-radius: 6px;
  font-size: 16px;
}
@media (max-width: 640px) {
  .header-title {
    font-size: 15px;
  }
  .header-subtitle {
    font-size: 10px;
  }
  .back-button {
    font-size: 13px;
    padding: 2px;
  }
}
.chat-container {
  padding-top: 48px;
  padding-bottom: 120px;
}
@media (max-width: 640px) {
  .chat-container {
    padding-top: 40px;
    padding-bottom: 140px;
  }
}

/* 2. Fix input-container always visible at bottom */
.input-container {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 101;
  width: 100vw;
  max-width: 100vw;
  box-sizing: border-box;
  background: none;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

/* 3. Prevent input from being pushed off screen on mobile */
@media (max-width: 640px) {
  .input-container {
    padding: 12px 8px;
    width: 100vw;
    max-width: 100vw;
    left: 0;
    right: 0;
    bottom: 0;
  }
  .input-wrapper {
    padding-left: 2px;
    padding-right: 2px;
  }
}
    .header-title {
      font-size: 24px;
      font-weight: bold;
      background: linear-gradient(to right, #3b82f6, #9333ea);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 4px;
      letter-spacing: 0.01em;
      font-family: 'Inter', 'Roboto', Arial, sans-serif;
    }
    @media (max-width: 640px) {
      .header-title {
        font-size: 20px;
      }
    }
    .header-subtitle {
      color: #6b7280;
      font-size: 14px;
      font-family: 'Inter', 'Roboto', Arial, sans-serif;
    }
    @media (max-width: 640px) {
      .header-subtitle {
        font-size: 12px;
      }
    }
    .theme-toggle-switch {
  margin-right: 24px;
  display: flex;
  align-items: center;
}
.theme-toggle-checkbox {
  display: none;
}
.theme-toggle-label {
  display: block;
  width: 48px;
  height: 28px;
  background: #e5e7eb;
  border-radius: 14px;
  position: relative;
  cursor: pointer;
  transition: background 0.3s;
}
.theme-toggle-slider {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 24px;
  height: 24px;
  background: #9333ea;
  border-radius: 50%;
  transition: left 0.3s, background 0.3s;
}
.theme-toggle-checkbox:checked + .theme-toggle-label .theme-toggle-slider {
  left: 22px;
  background: #facc15;
}
.theme-toggle-checkbox:checked + .theme-toggle-label {
  background: #a78bfa;
}
    
    /* Preview image styling */
    .attachments-preview {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 8px;
      width: auto;
      max-width: 100vw;
      overflow-x: auto;
    }
    .attachments-preview .attachment-item {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2px;
      min-width: 62px;
      max-width: 80px;
      margin-right: 4px;
      background: #f3f4f6;
      border-radius: 6px;
      font-size: 13px;
      color: #374151;
      font-family: 'Inter', 'Roboto', Arial, sans-serif;
    }
    .attachments-preview .attachment-item img {
      max-width: 60px;
      max-height: 60px;
      border-radius: 6px;
      vertical-align: middle;
      margin-bottom: 2px;
      border: 1px solid #e5e7eb;
      box-shadow: 0 2px 8px #0001;
      display: block;
    }
    .attachments-preview .attachment-icon {
      font-size: 16px;
      margin-right: 2px;
    }
    @media (max-width: 640px) {
      .attachments-preview {
        padding-left: 2px;
        padding-right: 2px;
        margin-bottom: 6px;
      }
      .attachments-preview .attachment-item {
        min-width: 60px;
        max-width: 70px;
        font-size: 12px;
      }
      .attachments-preview .attachment-item img {
        max-width: 50px;
        max-height: 50px;
      }
    }
    .input-container {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: linear-gradient(to top, white, white, transparent);
      padding: 24px;
      z-index: 100;
      width: 100vw;
      max-width: 100vw;
      box-sizing: border-box;
    }
    @media (max-width: 640px) {
      .input-container {
        padding: 12px 8px;
        width: 100vw;
        max-width: 100vw;
        left: 0;
        right: 0;
      }
      .input-wrapper {
        padding-left: 2px;
        padding-right: 2px;
      }
    }
    .input-wrapper {
      max-width: 1200px;
      margin: 0 auto;
      position: relative;
    }
    .input-form {
  background: #fff;
  border-radius: 24px;
  box-shadow: 0 8px 32px #a78bfa22;
  border: 1px solid #e5e7eb;
  padding: 18px 18px 12px 18px;
  margin: 0 0 18px 0;
  width: 100%;
  max-width: 700px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: all;
}

    }


    .message {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      opacity: 0;
      transform: translateY(10px);
      animation: fadeIn 0.3s ease-out forwards;
    }
    @keyframes fadeIn {
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
      .messages-container {
    width: 90vw;
    max-width: 1024px; /* Increased from 900px */
    margin: 0 auto;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px 0 80px 0;
  }
  @media (max-width: 1100px) {
    .messages-container {
      width: 98vw;
      max-width: 98vw;
      padding: 12px 0 120px 0;
    }
  }
.ai-content, .user-bubble {
  max-width: 90%; /* was 70% */
  margin-left: 0;
  margin-right: 0;
  padding: 16px; /* was 18px 22px */
}
.user-message {
  padding: 0 8px;
}
    .user-message {
      width: 100%;
      display: flex;
      justify-content: flex-end;
    }
    .user-message-content {
      max-width: 70%;
      min-width: 220px;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 2px 8px #0001;
      padding: 18px 22px;
      margin-right: 12px;
      font-size: 16px;
      line-height: 1.7;
      word-break: break-word;
    }
    .user-bubble {
      background: #64748b;
      color: #fff;
      border-radius: 8px;
      padding: 0;
      box-shadow: none;
    }
    .user-text {
      font-size: 16px;
      line-height: 1.7;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: 'Inter', 'Roboto', Arial, sans-serif;
    }
 .ai-content {
    max-width: 1024px; /* Make AI content as wide as container */
    margin: 0 auto;
    padding: 24px 0 0 0;
    background: none;
    box-shadow: none;
    border-radius: 0;
    width: 100%;
  }
  .ai-inner {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0;
    background: none;
    box-shadow: none;
  }
    
    @media (max-width: 900px) {
      .ai-content, .user-message-content {
        max-width: 98vw;
        margin-left: 0;
        margin-right: 0;
        padding: 12px 8px;
      }
    }
    @media (max-width: 640px) {
      .ai-content, .user-message-content {
        max-width: 99vw;
        padding: 8px 2px;
      }
      .messages-container {
      width: 99vw;
      max-width: 99vw;
      padding: 8px 0 120px 0;
    }
    }
    /* Dark mode overrides */
    body.dark-mode .ai-content {
      background: #23203a;
      color: #e0e7ff;
    }
    body.dark-mode .user-message-content {
      background: #312e81;
      color: #e0e7ff;
    }
    
      .back-button {
        background: none;
        border: none;
        cursor: pointer;
        padding: 8px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #6b7280;
      }

      .back-button:hover {
        background: #f3f4f6;
      }

      .header-info {
        flex: 1;
      }

      .header-title {
        font-size: 24px;
        font-weight: bold;
        background: linear-gradient(to right, #2563eb, #9333ea);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        margin-bottom: 4px;
      }

      @media (max-width: 640px) {
        .header-title {
          font-size: 20px;
        }
      }

      .header-subtitle {
        color: #6b7280;
        font-size: 14px;
      }

      @media (max-width: 640px) {
        .header-subtitle {
          font-size: 12px;
        }
      }

      .message {
        margin-bottom: 24px;
        opacity: 0;
        transform: translateY(10px);
        animation: fadeIn 0.3s ease-out forwards;
      }

      @keyframes fadeIn {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .user-message {
        max-width: 1200px;
        margin: 0 auto 24px auto;
        padding: 0 24px;
        display: flex;
        justify-content: flex-end;
      }

      @media (max-width: 640px) {
        .user-message {
          padding: 0 16px;
        }
      }

      .user-message-content {
        max-width: 70%;
      }

      @media (max-width: 640px) {
        .user-message-content {
          max-width: 85%;
        }
      }

      .user-attachments {
        margin-bottom: 8px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
      }

      .attachment-file {
        display: flex;
        align-items: center;
        gap: 8px;
        background: #dbeafe;
        color: #1e40af;
        padding: 8px 12px;
        border-radius: 20px;
        font-size: 14px;
      }

      @media (max-width: 640px) {
        .attachment-file {
          font-size: 12px;
          padding: 6px 10px;
        }
      }

      .attachment-url {
        display: flex;
        align-items: center;
        gap: 8px;
        background: #dcfce7;
        color: #166534;
        padding: 8px 12px;
        border-radius: 20px;
        font-size: 14px;
      }

      @media (max-width: 640px) {
        .attachment-url {
          font-size: 12px;
          padding: 6px 10px;
        }
      }

      .attachment-url span {
        max-width: 192px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      @media (max-width: 640px) {
        .attachment-url span {
          max-width: 120px;
        }
      }

      .user-bubble {
        padding: 16px;
        border-radius: 16px;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        background: #64748b;
        color: white;
      }

      @media (max-width: 640px) {
        .user-bubble {
          padding: 12px;
          border-radius: 12px;
        }
      }

      .user-text {
        font-size: 14px;
        line-height: 1.5;
        white-space: pre-wrap;
      }

      @media (max-width: 640px) {
        .user-text {
          font-size: 13px;
        }
      }

      .user-avatar {
        width: 40px;
        height: 40px;
        background: linear-gradient(135deg, #6b7280, #4b5563);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-left: 12px;
        flex-shrink: 0;
      }

      @media (max-width: 640px) {
        .user-avatar {
          width: 36px;
          height: 36px;
          margin-left: 8px;
        }
      }

      .ai-content {
        max-width: 1200px;
        margin: 0 auto;
        padding: 24px;
      }

      @media (max-width: 640px) {
        .ai-content {
          padding: 16px;
        }
      }

      .ai-inner {
        display: flex;
        gap: 16px;
      }

      @media (max-width: 640px) {
        .ai-inner {
          gap: 12px;
        }
      }

      .ai-avatar {
        width: 40px;
        height: 40px;
        background: linear-gradient(135deg, #3b82f6, #9333ea);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      @media (max-width: 640px) {
        .ai-avatar {
          width: 36px;
          height: 36px;
        }
      }

    
    /* Preview image styling */
    .attachments-preview .attachment-item img {
      max-width: 60px;
      max-height: 60px;
      border-radius: 6px;
      vertical-align: middle;
      margin-right: 2px;
      border: 1px solid #e5e7eb;
      box-shadow: 0 2px 8px #0001;
      display: block;
    }
    .attachments-preview .attachment-item {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2px;
    }
    /* File and URL preview styling */
    .attachments-preview .attachment-item {
      min-width: 60px;
      font-size: 13px;
      color: #374151;
      background: #f3f4f6;
      border-radius: 6px;
      padding: 4px 8px;
      margin-right: 4px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .attachments-preview .attachment-icon {
      font-size: 16px;
      margin-right: 2px;
    }


      .typing-indicator {
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }

      @keyframes pulse {
        0%, 100% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
      }

      .input-container {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: linear-gradient(to top, white, white, transparent);
        padding: 24px;
      }

      @media (max-width: 640px) {
        .input-container {
          padding: 16px;
        }
      }

      .input-wrapper {
        max-width: 1200px;
        margin: 0 auto;
        position: relative;
      }

      .input-form {
        background: white;
        border-radius: 24px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        border: 1px solid #e5e7eb;
        padding: 16px;
      }

      @media (max-width: 640px) {
        .input-form {
          padding: 12px;
          border-radius: 20px;
        }
      }

      .attachments-display {
  margin-bottom: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

      .attached-file, .attached-url {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 14px;
        position: relative;
      }

      @media (max-width: 640px) {
        .attached-file, .attached-url {
          font-size: 12px;
          padding: 4px 8px;
        }
      }

      .attached-file {
        background: #dbeafe;
        color: #1e40af;
      }

      .attached-url {
        background: #dcfce7;
        color: #166534;
      }

      .attached-url span {
        max-width: 128px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      @media (max-width: 640px) {
        .attached-url span {
          max-width: 80px;
        }
      }

.remove-attachment {
  margin-left: 6px;
  background: none !important;
  border: none !important;
  box-shadow: none !important;
  cursor: pointer;
  padding: 0 !important;
  outline: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.remove-attachment span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: #ef4444;
  color: #fff;
  border-radius: 50%;
  font-size: 18px;
  font-weight: bold;
  border: none;
  transition: background 0.2s, box-shadow 0.2s;
  box-shadow: 0 2px 8px #0002;
}
.remove-attachment span:hover {
  background: #dc2626;
  box-shadow: 0 4px 12px #0004;
}
@media (max-width: 640px) {
  .remove-attachment span {
    width: 28px;
    height: 28px;
    font-size: 20px;
  }
}

      @media (max-width: 640px) {
      }

      .attached-file .remove-attachment:hover {
        background: #bfdbfe;
      }

      .attached-url .remove-attachment:hover {
        background: #bbf7d0;
      }

      .url-input-container {
        margin-bottom: 12px;
        display: flex;
        gap: 8px;
      }

      @media (max-width: 640px) {
        .url-input-container {
          flex-direction: column;
          gap: 6px;
        }
      }

      .url-input {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        outline: none;
      }

      @media (max-width: 640px) {
        .url-input {
          padding: 10px 12px;
          font-size: 16px;
        }
      }

      .url-input:focus {
        outline: 2px solid #3b82f6;
        outline-offset: -2px;
      }

      .url-button {
        padding: 8px 12px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
      }

      @media (max-width: 640px) {
        .url-button {
          padding: 10px 16px;
          font-size: 14px;
        }
      }

      .url-add {
        background: #3b82f6;
        color: white;
      }

      .url-cancel {
        background: #f3f4f6;
        color: #374151;
        border: 1px solid #d1d5db;
      }

      .message-area {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  width: 100%;
}
.message-textarea {
  flex: 1;
  resize: none;
  border: none;
  outline: none;
  color: #374151;
  font-size: 18px;
  padding: 16px 18px;
  min-height: 54px;
  max-height: 128px;
  width: 100%;
  font-family: 'Inter', 'Roboto', Arial, sans-serif;
  background: transparent;
  border-radius: 16px;
  font-smooth: always;
  -webkit-font-smoothing: antialiased;
}
.send-button {
  background: #fff;
  color: #a78bfa;
  border: 2px solid #232323; /* <-- Add this line for black border */
  border-radius: 50%;
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  margin-left: 8px;
  box-shadow: 0 2px 8px #a78bfa22;
  transition: background 0.2s, color 0.2s, box-shadow 0.2s;
  cursor: pointer;
}
.send-button:hover {
  background: #f3f4f6;
  color: #7c3aed;
}
.send-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
@media (max-width: 640px) {
  .input-form {
    border-radius: 16px;
    padding: 10px 4px 8px 4px;
    margin-bottom: 8px;
    max-width: 99vw;
  }
  .send-button {
    width: 44px;
    height: 44px;
    font-size: 18px;
    margin-left: 4px;
  }
  .message-textarea {
    font-size: 16px;
    padding: 10px 10px;
    min-height: 44px;
    max-height: 120px;
  }
}

      @media (max-width: 640px) {
        .input-main {
          gap: 8px;
        }
      }

      .input-actions {
    display: flex;
    gap: 22px; /* Increased gap between buttons */
    margin-bottom: 6px;
    flex-wrap: wrap;
    align-items: center;
  }

      @media (max-width: 640px) {
        .input-actions {
      gap: 16px; /* Still a bit of gap on mobile */
      flex-wrap: nowrap;
      flex-direction: row !important;
      justify-content: flex-start;
      align-items: center;
    }
    .chat-action-btn {
      min-width: 36px;
      min-height: 36px;
    }
  }
  .chat-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px;
    border-radius: 10px;
    border: none;
    background: #f3f4f6;
    cursor: pointer;
    transition: background 0.18s;
  }
  .chat-action-btn:hover {
    background: #e5e7eb;
  }
      }

      .action-button {
        padding: 12px;
        border: 1px solid #d1d5db;
        background: white;
        border-radius: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      @media (max-width: 640px) {
        .action-button {
          padding: 10px;
          border-radius: 10px;
        }
      }

      .action-button:hover {
        background: #f9fafb;
      }

      .action-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      @media (max-width: 640px) {
        .message-textarea {
          font-size: 16px;
          padding: 14px;
          min-height: 80px;
          max-height: 160px;
        }
      }

      .message-textarea::placeholder {
        color: #9ca3af;
      }

      

      @media (max-width: 640px) {
        .send-button {
          padding: 14px;
          border-radius: 10px;
        }
      }

      .send-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .suggestions {
        margin-top: 16px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: center;
      }

      @media (max-width: 640px) {
        .suggestions {
          display: none;
        }
      }

      .suggestion {
        padding: 8px 16px;
        background: #f3f4f6;
        color: #374151;
        border: none;
        border-radius: 20px;
        font-size: 14px;
        cursor: pointer;
        transition: background-color 0.2s;
      }

      .suggestion:hover {
        background: #e5e7eb;
      }

      .hidden {
        display: none !important;
      }

      .icon {
        width: 20px;
        height: 20px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      @media (max-width: 640px) {
        .icon {
          width: 18px;
          height: 18px;
        }
      }

      .icon-small {
        width: 20px;
        height: 20px;
      }

      @media (max-width: 640px) {
        .icon-small {
          width: 18px;
          height: 18px;
        }
      }

      .icon-tiny {
        width: 14px;
        height: 14px;
      }

      @media (max-width: 640px) {
        .icon-tiny {
          width: 16px;
          height: 16px;
        }
      }
       
      
        /* DARK MODE OVERRIDES */
      body.dark-mode {
        background: #181028;
        color: #e0e7ff;
      }
      body.dark-mode .chat-container {
        background: #181028;
      }
      body.dark-mode .chat-header {
        background: rgba(24, 16, 40, 0.95);
        border-bottom: 1px solid #312e81;
      }
      body.dark-mode .header-title {
        background: linear-gradient(to right, #a78bfa);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      body.dark-mode .header-subtitle {
        color: #a78bfa;
      }
      .theme-toggle-btn {
  border: none;
  background: linear-gradient(90deg,#facc15 0%,#a78bfa 100%);
  color: #9333ea;
  border-radius: 50%;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  box-shadow: 0 2px 12px #a78bfa44;
  transition: background 0.3s, color 0.3s, transform 0.2s;
  cursor: pointer;
  outline: none;
}
.theme-toggle-btn:active {
  transform: scale(0.95) rotate(-10deg);
}
.theme-toggle-btn.theme-toggle-animate {
  transform: scale(1.15) rotate(10deg);
  box-shadow: 0 0 18px #facc15;
  transition: transform 0.3s, box-shadow 0.3s;
}
      body.dark-mode .user-bubble {
  background: #312e81;
  color: #e0e7ff; /* Use a soft light blue/white, not yellow */
}
      body.dark-mode .user-avatar {
        background: linear-gradient(135deg, #a78bfa, #facc15);
      }
      body.dark-mode .ai-avatar {
        background: linear-gradient(135deg, #facc15, #a78bfa);
      }
      body.dark-mode .ai-content {
        background: transparent;
      }
      body.dark-mode .ai-text {
        color: #e0e7ff;
      }
      body.dark-mode .input-container {
        background: linear-gradient(to top, #181028, #181028, transparent);
      }
      body.dark-mode .input-form {
        background: #23203a;
        border: 1px solid #312e81;
        box-shadow: 0 25px 50px -12px #000a;
      }
      body.dark-mode .attachments-display .attached-file {
        background: #312e81;
        color: #a78bfa;
      }
      body.dark-mode .attachments-display .attached-url {
        background: #23203a;
        color: #facc15;
      }
      body.dark-mode .remove-attachment span {
  background: #f87171;
  color: #181028;
  box-shadow: 0 2px 8px #0008;
}
body.dark-mode .remove-attachment span:hover {
  background: #ef4444;
}
      body.dark-mode .url-input {
        background: #181028;
        color: #e0e7ff;
        border: 1px solid #312e81;
      }
      body.dark-mode .url-input:focus {
        outline: 2px solid #a78bfa;
      }
      body.dark-mode .url-add {
        background: #a78bfa;
        color: #181028;
      }
      body.dark-mode .url-cancel {
        background: #23203a;
        color: #facc15;
        border: 1px solid #a78bfa;
      }
      body.dark-mode .action-button {
        background: #23203a;
        border: 1px solid #312e81;
        color: #a78bfa;
      }
      body.dark-mode .action-button:hover {
        background: #312e81;
      }
      body.dark-mode .message-textarea {
        color: #e0e7ff;
        background: transparent;
      }
      body.dark-mode .message-textarea::placeholder {
        color: #a78bfa;
      }
      
      body.dark-mode .ai-text code,
      body.dark-mode .ai-text pre {
        background: #23203a !important;
        color: white;
      }
      body.dark-mode .ai-text pre {
        border-radius: 6px;
        padding: 12px;
      }
         
  /* Preview image styling */
  .attachments-preview .attachment-item img {
    max-width: 60px;
    max-height: 60px;
    border-radius: 6px;
    vertical-align: middle;
    margin-right: 2px;
    border: 1px solid #e5e7eb;
    box-shadow: 0 2px 8px #0001;
    display: block;
  }
  .attachments-preview .attachment-item {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
  }
/* === AI RESPONSE CONTAINER === */
.assistant-message {
  width: 100%;
  font-size: 17px;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  line-height: 1.8;
  color: #1e293b; /* Slate-800 light mode */
  padding: 1.2rem;
}

/* Dark mode - softer contrast */
.dark .assistant-message {
  color: #e5e7eb; /* light gray */
}

/* === HEADINGS === */
.assistant-message h1,
.assistant-message h2,
.assistant-message h3,
.assistant-message h4,
.assistant-message h5,
.assistant-message h6 {
  font-weight: 600;
  margin: 1.3em 0 0.6em;
  line-height: 1.4;
  letter-spacing: -0.01em;
}

.assistant-message h1 { font-size: 1.9rem; }
.assistant-message h2 { font-size: 1.6rem; }
.assistant-message h3 { font-size: 1.35rem; }
.assistant-message h4 { font-size: 1.15rem; }
.assistant-message h5 { font-size: 1rem; }
.assistant-message h6 { font-size: 0.95rem; }

.dark .assistant-message h1,
.dark .assistant-message h2,
.dark .assistant-message h3,
.dark .assistant-message h4,
.dark .assistant-message h5,
.dark .assistant-message h6 {
  color: #f3f4f6;
}

/* === PARAGRAPHS === */
.assistant-message p {
  margin: 1em 0;
}

/* === LISTS === */
.assistant-message ul,
.assistant-message ol {
  margin: 1em 0;
  padding-left: 1.5em;
}

.assistant-message li {
  margin: 0.4em 0;
}

/* === BLOCKQUOTE === */
.assistant-message blockquote {
  border-left: 4px solid #cbd5e1;
  margin: 1em 0;
  padding-left: 1em;
  color: #475569;
  font-style: italic;
}

.dark .assistant-message blockquote {
  border-left-color: #374151;
  color: #9ca3af;
}

/* === CODE BLOCK === */
.assistant-message pre {
  background-color: #f3f4f6;
  color: #1f2937;
  padding: 0.85em 1em;
  border-radius: 8px;
  overflow-x: auto;
  margin: 1em 0;
  font-size: 0.95rem;
  font-family: 'Fira Code', monospace;
}

.dark .assistant-message pre {
  background-color: #1f2937;
  color: #f9fafb;
}

/* === INLINE CODE === */
.assistant-message code {
  background-color: #e5e7eb;
  color: #1f2937;
  padding: 0.25em 0.45em;
  border-radius: 4px;
  font-family: 'Fira Code', monospace;
  font-size: 0.95em;
}

.dark .assistant-message code {
  background-color: #374151;
  color: #f9fafb;
}

/* === TABLES === */
.assistant-message table {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
  border-radius: 6px;
  overflow: hidden;
}

.assistant-message th,
.assistant-message td {
  border: 1px solid #d1d5db;
  padding: 0.6em 0.75em;
  text-align: left;
}

.dark .assistant-message th,
.dark .assistant-message td {
  border-color: #374151;
}

.assistant-message th {
  background-color: #f9fafb;
  font-weight: 600;
}

.dark .assistant-message th {
  background-color: #1f2937;
}

/* === IMAGES === */
.assistant-message img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1em 0;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

/* === LINKS === */
.assistant-message a {
  color: #2563eb; /* Bright blue */
  text-decoration: underline;
  font-weight: 500;
  transition: color 0.2s ease;
}

.assistant-message a:hover {
  color: #1d4ed8;
}

.dark .assistant-message a {
  color: #60a5fa;
}

.dark .assistant-message a:hover {
  color: #93c5fd;
}

/* === HORIZONTAL RULE === */
.assistant-message hr {
  border: none;
  border-top: 1px solid #d1d5db;
  margin: 2em 0;
}

.dark .assistant-message hr {
  border-top-color: #374151;
}


 .chat-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.4rem 0.6rem;
  border-radius: 8px;
  border: 1px solid transparent;
  background-color: #f1f5f9; /* slate-100 */
  color: #1e293b;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease-in-out;
  cursor: pointer;
}

.chat-action-btn:hover {
  background-color: #e2e8f0; /* slate-200 */
  color: #0f172a;
}

/* SVG Icons */
.chat-action-btn svg.icon {
  width: 1.1rem;
  height: 1.1rem;
  stroke: currentColor;
}

/* Attach File SVG - Updated to look like a clip */
#fileBtn svg {
  width: 1.1rem;
  height: 1.1rem;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Attach Context Button */
#attachContextBtnSmart {
  background-color: #ede9fe; /* indigo-100 */
  color: #5b21b6; /* indigo-800 */
  padding: 0.35rem 0.7rem;
  font-size: 13px;
}

#attachContextBtnSmart svg {
  stroke: #7c3aed; /* indigo-600 */
  fill: #c4b5fd; /* indigo-300 */
  border-radius: 4px;
}

.premium-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.7em;
  border: none;
  border-radius: 999px;
  padding: 0.6em 1.6em;
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.25s, color 0.18s, box-shadow 0.18s;
  box-shadow: 0 2px 12px #a78bfa33;
  position: relative;
  min-width: 160px;
  min-height: 44px;
  outline: none;
  background: #e5e7eb;
  color: #374151;
}
.premium-btn .premium-icon {
  font-size: 1.3em;
  transition: color 0.2s, filter 0.2s;
}
.premium-btn.nano {
  background: #f3f4f6;
  color: #374151;
}
.premium-btn.nano .premium-icon::before {
  content: "🪶";
}
.premium-btn.mini {
  background: linear-gradient(90deg, #a78bfa 0%, #6366f1 100%);
  color: #fff;
  box-shadow: 0 2px 16px #a78bfa44;
}
.premium-btn.mini .premium-icon::before {
  content: "⚡";
}
.premium-btn.full {
  background: linear-gradient(90deg, #b45309 0%, #f59e42 100%);
  color: #fffbe6;
  box-shadow: 0 2px 18px #b4530933, 0 0 10px 2px #b4530988;
  animation: premium-glow 2s infinite alternate;
}
.premium-btn.full .premium-icon::before {
  content: "⭐";
  filter: drop-shadow(0 0 6px #fbbf24cc);
}
@keyframes premium-glow {
  0% { box-shadow: 0 2px 24px #fbbf2433, 0 0 8px 2px #fbbf2444; }
  100% { box-shadow: 0 2px 32px #fbbf2466, 0 0 16px 4px #fbbf24cc; }
}
.premium-btn .premium-desc {
  font-size: 0.97em;
  font-weight: 500;
  opacity: 0.92;
  margin-left: 0.5em;
  color: #374151;
}
.premium-btn .premium-tooltip {
  display: none;
  position: absolute;
  left: 0; top: 110%;
  background: #23272f;
  color: #fff;
  font-size: 0.95em;
  border-radius: 8px;
  padding: 0.7em 1em;
  box-shadow: 0 2px 12px #0004;
  z-index: 9999;
  min-width: 220px;
  pointer-events: none;
}
.premium-btn.nano .premium-desc { color: #374151; }
.premium-btn.mini .premium-desc { color: #f3f4f6; }
.premium-btn.full .premium-desc { color: #fffbe6; text-shadow: 0 1px 4px #b45309cc; }
.premium-btn:hover .premium-tooltip,
.premium-btn:focus .premium-tooltip {
  display: block;
}
@media (max-width: 600px) {
  .add-options-buttons {
    gap: 6px;
    flex-wrap: wrap;
  }
  .add-option-btn,
  #premiumChatBtn.premium-btn {
    font-size: 0.85rem !important;
    padding: 4px 8px !important;
    min-width: 0 !important;
    min-height: 36px !important;
    border-radius: 16px !important;
    flex: 1 1 44%;
    justify-content: center;
    align-items: center;
    max-width: 48vw;
    margin-bottom: 2px;
  }
  .add-option-btn svg,
  #premiumChatBtn .premium-icon {
    width: 22px !important;
    height: 22px !important;
    min-width: 22px !important;
    min-height: 22px !important;
    margin-right: 4px !important;
  }
  #premiumChatBtn .premium-label,
  #premiumChatBtn .premium-desc {
    font-size: 0.85em !important;
    margin-left: 2px !important;
  }
  #premiumChatBtn .premium-tooltip {
    min-width: 140px !important;
    font-size: 0.9em !important;
    left: 0;
    right: auto;
  }
  #premiumChatBtn {
    padding: 4px 8px !important;
    min-width: 0 !important;
    min-height: 36px !important;
    font-size: 0.85rem !important;
    border-radius: 16px !important;
    max-width: 48vw;
    margin-bottom: 2px;
  }
}
.add-option-btn svg,
#premiumChatBtn .premium-icon {
  width: 20px;
  height: 20px;
  min-width: 20px;
  min-height: 20px;
}

/* Label next to attach context */
.btn-label {
  font-size: 13px;
  font-weight: 500;
  font-style: italic;
  display: inline; /* Always show */
}

/* Responsive tweaks for mobile */
@media (max-width: 480px) {
  .chat-action-btn {
    padding: 0.3rem 0.5rem;
    font-size: 12.5px;
    gap: 0.25rem;
  }

  .chat-action-btn svg {
    width: 1rem;
    height: 1rem;
  }
}

  /* Context Modal Styles */
.context-modal {
  position: fixed;
  z-index: 99999;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.context-modal.hidden { display: none !important; }
.context-modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(24,16,40,0.85);
  backdrop-filter: blur(2px);
}
.context-modal-content {
  position: relative;
  background: #23203a;
  color: #e0e7ff;
  border-radius: 18px;
  box-shadow: 0 8px 32px #000a;
  padding: 32px 20px 20px 20px;
  min-width: 320px;
  max-width: 98vw;
  width: 420px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.context-modal-content h2 {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 10px;
  color: #a78bfa;
}
.context-steps-list {
  max-height: 260px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.context-step-item {
  background: #312e81;
  color: #e0e7ff;
  border-radius: 10px;
  padding: 12px 10px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border 0.18s, background 0.18s;
}
.context-step-item.selected {
  border: 2px solid #fbbf24;
  background: #a78bfa33;
}
.context-step-checkbox {
  margin-top: 3px;
  accent-color: #fbbf24;
}
.context-step-desc {
  flex: 1;
}
.context-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 10px;
}
.context-modal-btn {
  padding: 8px 18px;
  border-radius: 8px;
  border: none;
  background: #312e81;
  color: #e0e7ff;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.18s, color 0.18s;
}
.context-modal-btn-primary {
  background: linear-gradient(90deg,#fbbf24 60%,#fde68a 100%);
  color: #23203a;
  font-weight: 700;
}
.context-modal-btn:hover {
  filter: brightness(1.08);
}
@media (max-width: 600px) {
  .context-modal-content {
    min-width: 0;
    width: 98vw;
    padding: 18px 4vw 12px 4vw;
  }
  .context-steps-list {
    max-height: 180px;
  }
}
  .attached-context {
  display: inline-flex;
  align-items: center;
  background: rgba(251,191,36,0.18); /* transparent yellow */
  color: #b45309;
  border-radius: 16px;
  padding: 5px 12px;
  margin: 4px 4px 4px 0;
  font-size: 14px;
  font-weight: 500;
  max-width: 150px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
body.dark-mode .attached-context {
  background: #fbbf24;
  color: #23203a;
}
.context-chip {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 90px;
}
.context-step-item.selected {
  border: 2px solid #fbbf24;
  background: rgba(251,191,36,0.18);
}
body.dark-mode .context-step-item.selected {
  background: #fbbf24;
  color: #23203a;
}
    `;
    document.head.appendChild(style);
  }



async createHTML() {
  let eventTitle = "Smart Plan Helper";
  try {
    const data = await fetchEventData();
    if (data && data.eventTitle) eventTitle = data.eventTitle;
  } catch (e) {}

document.body.innerHTML = `

<div class="chat-container">
  <!-- Header -->
  <div class="chat-header">
    <div class="header-content">
      <button class="back-button" id="backBtn" aria-label="Back">
        <svg class="icon" viewBox="0 0 24 24">
          <path d="m12 19-7-7 7-7"/>
          <path d="M19 12H5"/>
        </svg>
      </button>

      <div class="header-info">
        <h1 class="header-title">${eventTitle}</h1>
      </div>

      <div class="theme-toggle-switch">
        <input type="checkbox" id="themeToggleSwitch" class="theme-toggle-checkbox">
        <label for="themeToggleSwitch" class="theme-toggle-label">
          <span class="theme-toggle-slider">
            <span id="themeIcon">🌙</span>
          </span>
        </label>
      </div>
    </div>
  </div>

  <!-- Messages -->
  <div class="messages-container" id="messagesContainer"></div>

  <!-- Input Section -->
  <div class="input-container">
  <form class="input-form" id="messageForm">
    <!-- Attachments -->
    <div id="attachmentsDisplay" class="attachments-display hidden"></div>
    <!-- Action Buttons -->
    <div class="input-actions">
      <input type="file" id="fileInput" class="hidden" multiple>
      <button type="button" class="chat-action-btn" id="fileBtn" title="Attach File">
        <svg class="icon" viewBox="0 0 24 24">
          <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.64 16.2a2 2 0 0 1-2.83-2.83l8.49-8.49"/>
        </svg>
      </button>
      <button type="button" class="chat-action-btn" id="linkBtn" title="Attach Link">
        <svg class="icon" viewBox="0 0 24 24">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
      </button>
      <button type="button" class="chat-action-btn" id="attachContextBtnSmart">
        <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="4" y="8" width="14" height="8" rx="4" fill="#a78bfa"/>
          <path d="M11 12v-2M11 12h2M11 12h-2" stroke="#6366f1" stroke-width="2"/>
        </svg>
        <span class="btn-label">Attach Context</span>
      </button>

      <button id="premiumChatBtn" class="premium-btn nano add-option-btn" type="button" title="Toggle AI Model">
  <span class="premium-icon"></span>
  <span class="premium-label">Nano</span>
  <span class="premium-desc">Fast, Basic</span>
  <span class="premium-tooltip">Nano: Fastest, basic capabilities.<br>Mini: Smarter, more context.<br>Full: Best, GPT-4.1 reasoning.</span>
</button>
    </div>
    <!-- URL Input -->
    <div id="urlInputContainer" class="url-input-container hidden">
      <input type="url" class="url-input" id="urlInput" placeholder="Enter URL...">
      <div class="url-buttons">
        <button type="button" class="url-button url-add" id="addUrlBtn">Add</button>
        <button type="button" class="url-button url-cancel" id="cancelUrlBtn">Cancel</button>
      </div>
    </div>
    <!-- Textarea and Send -->
    <div class="message-area">
      <textarea 
        class="message-textarea" 
        id="messageTextarea" 
        placeholder="Type your message..."
        rows="1"
      ></textarea>
      <button type="submit" class="send-button" id="sendBtn" title="Send Message">
        <svg class="icon" viewBox="0 0 24 24">
          <path d="m22 2-7 20-4-9-9-4Z"/>
          <path d="M22 2 11 13"/>
        </svg>
      </button>
    </div>
  </form>
</div>
  </div>
</div>

<!-- Context Modal -->
<div id="contextModalSmart" class="context-modal hidden">
  <div class="context-modal-backdrop"></div>
  <div class="context-modal-content">
    <h2>Select Smart Plan Steps as Context</h2>
    <div id="contextStepsList" class="context-steps-list"></div>
    <div class="context-modal-actions">
      <button id="contextModalCancelBtn" class="context-modal-btn">Cancel</button>
      <button id="contextModalApplyBtn" class="context-modal-btn context-modal-btn-primary">Attach</button>
    </div>
  </div>
</div>
`;

  // Wait for DOM to be ready before binding events
  setTimeout(() => this.bindEvents(), 0);

  this.renderMessages();
}

  

 bindEvents() {
  // Defensive: Only bind if elements exist
  const form = document.getElementById('messageForm');
  const textarea = document.getElementById('messageTextarea');
  const fileBtn = document.getElementById('fileBtn');
  const linkBtn = document.getElementById('linkBtn');
  const fileInput = document.getElementById('fileInput');
  const urlInput = document.getElementById('urlInput');
  const addUrlBtn = document.getElementById('addUrlBtn');
  const cancelUrlBtn = document.getElementById('cancelUrlBtn');
  const backBtn = document.getElementById('backBtn');
   const themeToggleSwitch = document.getElementById('themeToggleSwitch');
  const themeIcon = document.getElementById('themeIcon');
  if (themeToggleSwitch && themeIcon) {
  themeToggleSwitch.checked = this.isDarkMode;
  themeIcon.textContent = this.isDarkMode ? '🌙' : '☀️'; // <-- swap icons here
  themeToggleSwitch.addEventListener('change', () => {
    this.setDarkMode(themeToggleSwitch.checked);
  });
}

  if (form) form.addEventListener('submit', (e) => this.handleSubmit(e));
  if (textarea) {
    textarea.addEventListener('input', (e) => this.handleTextareaInput(e));
    textarea.addEventListener('keypress', (e) => this.handleKeyPress(e));
  }
  if (fileBtn && fileInput) fileBtn.addEventListener('click', () => fileInput.click());
  if (fileInput) fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
  if (linkBtn) linkBtn.addEventListener('click', () => this.showUrlInput());
  if (addUrlBtn) addUrlBtn.addEventListener('click', () => this.addUrl());
  if (cancelUrlBtn) cancelUrlBtn.addEventListener('click', () => this.hideUrlInput());
  if (backBtn) backBtn.addEventListener('click', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('eventId');
    if (eventId) {
      window.location.href = `focusMode.html?eventId=${eventId}`;
    } else {
      window.location.href = 'focusMode.html';
    }
  });

  this.attachedFiles = [];
  this.attachedUrls = [];
  this.updateSendButton();


const attachContextBtnSmart = document.getElementById('attachContextBtnSmart');
  const contextModal = document.getElementById('contextModalSmart');
  const contextStepsList = document.getElementById('contextStepsList');
  const contextModalCancelBtn = document.getElementById('contextModalCancelBtn');
  const contextModalApplyBtn = document.getElementById('contextModalApplyBtn');

  if (attachContextBtnSmart) {
    attachContextBtnSmart.addEventListener('click', async () => {
      // Fetch steps if not already loaded
      if (!this.smartPlanSteps.length) {
        try {
          const data = await fetchEventData();
          this.smartPlanSteps = Array.isArray(data.smartPlan?.steps)
            ? data.smartPlan.steps
            : data.steps || [];
        } catch (e) {
          this.smartPlanSteps = [];
        }
      }
      // Render steps
      contextStepsList.innerHTML = '';
      this.smartPlanSteps.forEach((step, idx) => {
        // Prevent selecting steps already attached
        const alreadyAttached = this.selectedContextSteps.includes(idx);
        const item = document.createElement('div');
        item.className = 'context-step-item' + (alreadyAttached ? ' selected' : '');
        item.innerHTML = `
          <div class="context-step-title">
            <strong>Step ${idx + 1}:</strong> ${step.title || step.description || ''}
          </div>
        `;
        item.addEventListener('click', () => {
          if (alreadyAttached) return; // Don't allow re-selecting
          if (item.classList.contains('selected')) {
            item.classList.remove('selected');
            this.selectedContextSteps = this.selectedContextSteps.filter(i => i !== idx);
          } else {
            item.classList.add('selected');
            this.selectedContextSteps.push(idx);
          }
        });
        contextStepsList.appendChild(item);
      });
      contextModal.classList.remove('hidden');
    });
  }

  if (contextModalCancelBtn) {
    contextModalCancelBtn.addEventListener('click', () => {
      contextModal.classList.add('hidden');
    });
  }
  if (contextModalApplyBtn) {
  contextModalApplyBtn.addEventListener('click', async () => {
    contextModal.classList.add('hidden');
    this.updateContextAttachments();
    if (typeof showToast === 'function') showToast("Context steps attached!");
  });
}
}
updateContextAttachments() {
  // Only keep unique steps
  this.selectedContextSteps = [...new Set(this.selectedContextSteps)];
  const container = document.getElementById('attachmentsDisplay');
  if (!container) return;
  // Remove previous context attachments
  container.querySelectorAll('.attached-context').forEach(el => el.remove());
  // Add new context attachments inline
  this.selectedContextSteps.forEach(idx => {
    const step = this.smartPlanSteps[idx];
    if (!step) return;
    const el = document.createElement('div');
    el.className = 'attached-context';
    el.innerHTML = `
      <span class="context-chip"><strong>Step ${idx + 1}:</strong> ${step.title || step.description || ''}</span>
      <button class="remove-attachment" title="Remove">
        <span>×</span>
      </button>
    `;
    el.querySelector('.remove-attachment').onclick = () => {
      this.selectedContextSteps = this.selectedContextSteps.filter(i => i !== idx);
      el.remove();
    };
    container.appendChild(el);
  });
  container.classList.remove('hidden');
}
  setupTheme() {
    // If user has a preference, use it; otherwise, use system preference
    const saved = localStorage.getItem('chat-theme');
    if (saved === 'dark') {
      this.setDarkMode(true);
    } else if (saved === 'light') {
      this.setDarkMode(false);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      this.setDarkMode(true);
    }
  }
toggleTheme() {
  this.setDarkMode(!this.isDarkMode);
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.classList.add('theme-toggle-animate');
    setTimeout(() => btn.classList.remove('theme-toggle-animate'), 400);
  }
}
setDarkMode(isDark) {
  this.isDarkMode = isDark;
  document.body.classList.toggle('dark-mode', isDark);
  const themeToggleSwitch = document.getElementById('themeToggleSwitch');
  const themeIcon = document.getElementById('themeIcon');
  if (themeToggleSwitch && themeIcon) {
  themeToggleSwitch.checked = isDark;
  themeIcon.textContent = isDark ? '🌙' : '☀️'; // <-- swap icons here
  themeIcon.style.color = isDark ? '#facc15' : '#9333ea';
  themeIcon.style.transition = 'color 0.3s';
}
  localStorage.setItem('chat-theme', isDark ? 'dark' : 'light');
}
  handleTextareaInput(e) {
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(60, textarea.scrollHeight) + 'px';
    
    this.updateSendButton();
  }

  handleKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.handleSubmit(e);
    }
  }

async handleSubmit(e) {
  e.preventDefault();
  const textarea = document.getElementById('messageTextarea');
  const message = textarea.value.trim();
  const hasFile = this.attachedFiles.length > 0;
  const hasUrl = this.attachedUrls.length > 0;
  const hasContext = this.selectedContextSteps.length > 0;

  // Only proceed if there's something to send
  if (!message && !hasFile && !hasUrl) return;

  // --- PLAN USAGE LOGIC ---
  let usageKey = null;
  let usageMsg = '';
  // You need these two lines somewhere above:
const highestModelActive = state.premiumModel === 'gpt-4.1-full';
const premiumChatActiveSmart = state.premiumModel === 'gpt-4.1-mini';

if (hasFile || hasUrl) {
  usageKey = 'focusFileAndUrlPerDay';
  usageMsg = 'You have reached your daily file/url upload limit for your plan.';
} else if (hasContext) {
  usageKey = 'smartPlanContextAttachPerDay';
  usageMsg = 'You have reached your daily context attachment limit.';
} else if (highestModelActive) {
  usageKey = 'focusFullPerDay';
  usageMsg = 'You have reached your daily GPT-4.1 (Highest) message limit.';
} else if (premiumChatActiveSmart) {
  usageKey = 'focusMiniPerDay';
  usageMsg = 'You have reached your daily GPT-4.1 Mini message limit.';
} else {
  usageKey = 'focusNanoPerDay';
  usageMsg = 'You have reached your daily chat message limit for this model.';
}

  // Restrict by plan
  // Only check usage AFTER validation
  if (usageKey) {
    const allowed = await checkAndUpdateUsage(usageKey);
    if (!allowed) {
      showToast(usageMsg, 'error');
      return;
    }
  }

  if ((message || hasFile || hasUrl) && !this.isTyping) {
    this.sendMessage(message, this.attachedFiles, this.attachedUrls);
    textarea.value = '';
    textarea.style.height = '60px';
    this.attachedFiles = [];
    this.attachedUrls = [];
    this.updateAttachmentsDisplay();
    this.hideUrlInput();
    this.updateSendButton();
  }
}

async handleFileOrUrlAttachment(type, value) {
  if (type === 'file') {
    this.attachedFiles.push(value);
  } else if (type === 'url') {
    this.attachedUrls.push(value);
  }
  this.updateAttachmentsDisplay();
  this.updateSendButton();
  return true;
}

  async handleFileUpload(e) {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    const ok = await this.handleFileOrUrlAttachment('file', file);
    if (!ok) break;
  }
}

  showUrlInput() {
    document.getElementById('urlInputContainer').classList.remove('hidden');
    document.getElementById('urlInput').focus();
  }

  hideUrlInput() {
    document.getElementById('urlInputContainer').classList.add('hidden');
    document.getElementById('urlInput').value = '';
  }

  async addUrl() {
  const urlInput = document.getElementById('urlInput');
  const url = urlInput.value.trim();
  if (url) {
    const ok = await this.handleFileOrUrlAttachment('url', url);
    if (!ok) return;
    this.hideUrlInput();
  }
}

updateAttachmentsDisplay() {
  const container = document.getElementById('attachmentsDisplay');
  if (this.attachedFiles.length === 0 && this.attachedUrls.length === 0) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');
  container.innerHTML = '';

  // Render files (including images)
  this.attachedFiles.forEach((file, index) => {
    const fileEl = document.createElement('div');
    fileEl.className = 'attached-file';
    if (file.type && file.type.startsWith('image/')) {
      fileToBase64(file).then(base64 => {
        fileEl.innerHTML = `
          <img src="${base64}" alt="${file.name}" style="max-width:48px;max-height:48px;border-radius:6px;margin-right:6px;">
          <span>${file.name}</span>
          <button class="remove-attachment" onclick="chatInterface.removeFile(${index})" title="Remove">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;background:#ef4444;color:#fff;border-radius:50%;font-size:15px;font-weight:bold;border:none;">
              ×
            </span>
          </button>
        `;
      });
    } else {
      fileEl.innerHTML = `
        <span>📎</span>
        <span>${file.name}</span>
        <button class="remove-attachment" onclick="chatInterface.removeFile(${index})" title="Remove">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;background:#ef4444;color:#fff;border-radius:50%;font-size:15px;font-weight:bold;border:none;">
            ×
          </span>
        </button>
      `;
    }
    container.appendChild(fileEl);
  });

  // Render URLs
  this.attachedUrls.forEach((url, index) => {
    const urlEl = document.createElement('div');
    urlEl.className = 'attached-url';
    urlEl.innerHTML = `
      <span>🔗</span>
      <span>${url}</span>
      <button class="remove-attachment" onclick="chatInterface.removeUrl(${index})" title="Remove">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;background:#ef4444;color:#fff;border-radius:50%;font-size:15px;font-weight:bold;border:none;">
          ×
        </span>
      </button>
    `;
    container.appendChild(urlEl);
  });
}

  removeFile(index) {
    this.attachedFiles.splice(index, 1);
    this.updateAttachmentsDisplay();
    this.updateSendButton();
  }

  removeUrl(index) {
    this.attachedUrls.splice(index, 1);
    this.updateAttachmentsDisplay();
    this.updateSendButton();
  }

  handleSuggestionClick(text) {
    const textarea = document.getElementById('messageTextarea');
    textarea.value = text;
    textarea.focus();
    this.updateSendButton();
  }

async sendMessage(text, files = [], urls = []) {
  // --- 1. Process files (images, pdf, docx) ---
  const processedFiles = [];
  for (const file of files) {
    if (file.type && file.type.startsWith("image/")) {
      // Convert image to base64 for preview and backend
      const base64 = await fileToBase64(file);
      processedFiles.push({ name: file.name, isImage: true, base64 });
    } else if (file.name && file.name.toLowerCase().endsWith(".pdf")) {
      const content = await extractPdfText(file);
      processedFiles.push({ name: file.name, content });
    } else if (file.name && file.name.toLowerCase().endsWith(".docx")) {
      const content = await extractDocxText(file);
      processedFiles.push({ name: file.name, content });
    } else {
      processedFiles.push({ name: file.name });
    }
  }

  // --- 2. Process URLs (fetch content from backend parser) ---
  const processedUrls = [];
  for (const url of urls) {
    if (typeof url === "string") {
      const content = await processUrlContent(url);
      processedUrls.push({ url, content });
    } else if (url.url) {
      const content = await processUrlContent(url.url);
      processedUrls.push({ url: url.url, content });
    }
  }

  const hasImage = processedFiles.some(f => f.isImage);
if (hasImage) this.showInputLoader();

  // --- 3. Push user message into UI and chatHistory ---
  const userMessage = {
    id: Date.now().toString(),
    text,
    isUser: true,
    files: processedFiles,
    urls: processedUrls
  };

  this.messages.push(userMessage);
  this.chatHistory.push({ role: 'user', content: text });
  this.renderMessages();
  this.isTyping = true;
  this.updateSendButton();

  // --- Save user message to Firestore ---
  try {
    const responseId = getEventIdFromUrl();
    await saveSmartPlanChatMessage(responseId, {
      text,
      isUser: true,
      files: processedFiles,
      urls: processedUrls
    });
  } catch (err) {
    console.error("Failed to save user message to Firestore:", err);
  }

  // --- Send to backend ---
  try {
    await this.fetchAIResponse(text, processedFiles, processedUrls);
  } catch (error) {
    console.error('AI error:', error);
    this.messages.push({
      id: (Date.now() + 2).toString(),
      text: "Sorry, I couldn’t process that. Please try again later.",
      isUser: false,
    });
    this.renderMessages();
  } finally {
    this.isTyping = false;
    this.updateSendButton();
    this.hideInputLoader();
  }
}




async fetchAIResponse(userInput, files = [], urls = []) {
  const eventId = getEventIdFromUrl();
  if (!eventId) throw new Error("No eventId provided in URL");
  const responseId = eventId;

  if (!this.smartPlan) {
    const data = await fetchEventData();
    const stepsArray = Array.isArray(data.smartPlan?.steps)
      ? data.smartPlan.steps
      : data.steps;
    if (!stepsArray) throw new Error("Missing `steps` array from Firestore document.");

    this.smartPlan = { steps: stepsArray };
    const stepProgress = Array.isArray(data.stepProgress)
      ? data.stepProgress
      : data.progress || [];
    const idx = stepProgress.findIndex((done) => done === false);
    this.currentStep = idx === -1 ? 0 : idx;
    this.initialResponseText = data.response || "";
  }

  const userId = getCurrentUserId();
  if (!userId) throw new Error("User is not authenticated");

  const contextHistory = this.chatHistory.slice(-5);
  const selectedContextSteps = this.selectedContextSteps.map(idx => this.smartPlanSteps[idx]);
  
  const payload = {
    smartPlan:   this.smartPlan,
    currentStep: this.currentStep,
    message:     userInput,
    history:     contextHistory,
    responseId,
    userId,
    files,
    urls,
    contextSteps: selectedContextSteps, 
  firstMessage: !this.hasSentFirstPrompt,
  premiumModel: state.premiumModel,
  };

  const backendURL = "https://my-backend-three-pi.vercel.app/api/focusMode_chat";
  const res = await fetch(backendURL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let accumulated = "";
  const isImageUpload = Array.isArray(files) && files.some(f => f.isImage);
  let imageLoaderInterval;

  const aiMessageId = `ai-${Date.now()}`;
  this.messages.push({
    id: aiMessageId,
    text: "",
    isUser: false,
    isTyping: true,
    files: []
  });
  this.renderMessages();

  const container = document.querySelector(
    `[data-message-id="${aiMessageId}"] .ai-text`
  );
  this.hasSentFirstPrompt = true;
  if (!container) {
    console.warn("⚠️ Missing .ai-text element for messageId", aiMessageId);
    return "";
  }

  if (isImageUpload) {
    let loaderIndex = Math.floor(Math.random() * imageLoadingPhrases.length);
    requestAnimationFrame(() => {
      const container = document.querySelector(
        `[data-message-id="${aiMessageId}"] .ai-text`
      );
      if (container) {
        container.innerHTML = `
          <div id="ai-image-loader" style="display:flex;align-items:center;gap:12px;">
            <span id="ai-image-loader-circle" style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#a78bfa;animation:spin 1s linear infinite;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#fff" stroke-width="3" opacity="0.5"/>
                <path d="M22 12a10 10 0 0 1-10 10" stroke="#fff" stroke-width="3"/>
              </svg>
            </span>
            <span id="ai-image-loader-text" style="font-size:15px;color:#7c3aed;font-weight:500;">${imageLoadingPhrases[loaderIndex]}</span>
          </div>
          <style>
            @keyframes spin { to { transform: rotate(360deg); } }
          </style>
        `;
      }
    });
    imageLoaderInterval = setInterval(() => {
      loaderIndex = (loaderIndex + 1) % imageLoadingPhrases.length;
      const loaderText = document.getElementById("ai-image-loader-text");
      if (loaderText) loaderText.textContent = imageLoadingPhrases[loaderIndex];
    }, 2000);
  }

  // --- If image, accumulate all and show at once ---
  if (isImageUpload && res.body) {
    let fullData = '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const deltaContent = parsed.choices?.[0]?.delta?.content;
          if (deltaContent) {
            fullData += deltaContent;
          }
        } catch (err) {
          // Ignore parse errors
        }
      }
    }
    if (typeof imageLoaderInterval !== "undefined") clearInterval(imageLoaderInterval);
    container.innerHTML = `<div class="assistant-message">${md.render(fullData)}</div>`;
    accumulated = fullData;
    this.messages.find(m => m.id === aiMessageId).isTyping = false;
    this.messages.find(m => m.id === aiMessageId).text = accumulated;
    this.renderMessages();
    try {
      await saveSmartPlanChatMessage(responseId, {
        text: accumulated,
        isUser: false
      });
    } catch (err) {
      console.error("Failed to save AI message to Firestore:", err);
    }
    this.chatHistory.push({ role: "assistant", content: accumulated });
    return accumulated;
  }

  // --- If not image, handle streaming as usual ---
  if (res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;

        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch (err) {
          console.warn("⚠️ Could not JSON.parse chunk:", data);
          continue;
        }

        const deltaContent = parsed.choices?.[0]?.delta?.content;
        if (typeof deltaContent === "string" && deltaContent.length > 0) {
          accumulated += deltaContent;

          // --- Improved AI text styling ---
          const html = `<div class="assistant-message">${md.render(accumulated)}</div>`;
          requestAnimationFrame(() => {
            container.innerHTML = html;
            container.querySelectorAll("pre code")
              .forEach(block => Prism.highlightElement(block));
          });

          this.scrollToBottom();
        }
      }
    }
    if (typeof imageLoaderInterval !== "undefined") clearInterval(imageLoaderInterval);
    const idx = this.messages.findIndex((m) => m.id === aiMessageId);
    if (idx !== -1) {
      this.messages[idx].isTyping = false;
      this.messages[idx].text = accumulated;
    }
    this.renderMessages();

    try {
      await saveSmartPlanChatMessage(responseId, {
        text: accumulated,
        isUser: false
      });
    } catch (err) {
      console.error("Failed to save AI message to Firestore:", err);
    }

    this.chatHistory.push({ role: "assistant", content: accumulated });
    return accumulated;
  }

  // --- Fallback for non-streaming response ---
  const text = await res.text();
  let content = "";
  try {
    const matches = text.match(/\{.*?\}/gs);
    if (matches && matches.length > 0) {
      const last = JSON.parse(matches[matches.length - 1]);
      content = last.choices?.[0]?.delta?.content || "";
    }
  } catch (e) {
    content = text;
  }
  accumulated = content;
  if (typeof imageLoaderInterval !== "undefined") clearInterval(imageLoaderInterval);
  if (container) container.innerHTML = `<div class="assistant-message">${md.render(accumulated)}</div>`;
  this.messages.find(m => m.id === aiMessageId).isTyping = false;
  this.messages.find(m => m.id === aiMessageId).text = accumulated;
  this.renderMessages();
  try {
    await saveSmartPlanChatMessage(responseId, {
      text: accumulated,
      isUser: false
    });
  } catch (err) {
    console.error("Failed to save AI message to Firestore:", err);
  }
  this.chatHistory.push({ role: "assistant", content: accumulated });
  return accumulated;
  
}


  async typeMessage(messageId, fullText) {
    const messageEl = document.querySelector(`[data-message-id="${messageId}"] .ai-text`);
    if (!messageEl) return;

    let currentIndex = 0;
    const typeChar = () => {
      if (currentIndex < fullText.length) {
        messageEl.textContent = fullText.slice(0, currentIndex + 1) + '|';
        currentIndex++;
        setTimeout(typeChar, 30);
      } else {
        messageEl.textContent = fullText;
      }
    };

    typeChar();
  }

renderMessages() {
  const container = document.getElementById('messagesContainer');
  if (!container) return;

  container.innerHTML = '';

  this.messages.forEach(message => {
    const messageEl = document.createElement('div');
    messageEl.className = 'message';
    messageEl.setAttribute('data-message-id', message.id);

    if (message.isUser) {
      messageEl.innerHTML = `
        <div class="user-message">
          <div class="user-bubble">
            <div class="user-text">${message.text}</div>
          </div>
        </div>
      `;
    } else {
      let aiHtml = '';
      if (message.files && message.files.length > 0) {
        aiHtml += this.renderAttachments(message.files, []);
      }
      if (message.urls && message.urls.length > 0) {
        aiHtml += this.renderAttachments([], message.urls);
      }
      aiHtml += `<div class="assistant-message">${md.render(message.text || '')}</div>`;

      messageEl.innerHTML = `
        <div class="ai-message">
          <div class="ai-content">
            <div class="ai-inner">
              <div class="ai-text">${aiHtml}</div>
            </div>
          </div>
        </div>
      `;
    }

    container.appendChild(messageEl);
  });

  this.scrollToBottom();
}



renderAttachments(files = [], urls = []) {
  let html = '';
  if ((files && files.length > 0) || (urls && urls.length > 0)) {
    html += '<div class="attachments-preview">';
    if (files && files.length > 0) {
      files.forEach(file => {
        if (file.isImage && file.base64) {
          html += `
            <div class="attachment-item">
              <img src="${file.base64}" alt="${file.name}" />
              <span class="attachment-name">${file.name}</span>
            </div>
          `;
        } else if (file.name) {
          html += `
            <div class="attachment-item">
              <span class="attachment-icon">📎</span>
              <span class="attachment-name">${file.name}</span>
            </div>
          `;
        }
      });
    }
    if (urls && urls.length > 0) {
      urls.forEach(url => {
        if (url.url) {
          html += `
            <div class="attachment-item">
              <span class="attachment-icon">🔗</span>
              <span class="attachment-name">${url.url}</span>
            </div>
          `;
        }
      });
    }
    html += '</div>';
  }
  return html;
}

updateSendButton() {
  const sendBtn = document.getElementById('sendBtn');
  const textarea = document.getElementById('messageTextarea');
  if (!sendBtn || !textarea) return;
  const hasContent = textarea.value.trim() || this.attachedFiles.length > 0 || this.attachedUrls.length > 0;
  sendBtn.disabled = !hasContent || this.isTyping;

  // Spinner logic
  if (this.isTyping) {
    sendBtn.innerHTML = getSpinnerSVG();
  } else {
    sendBtn.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24">
        <path d="m22 2-7 20-4-9-9-4Z"/>
        <path d="M22 2 11 13"/>
      </svg>
    `;
  }
}

  scrollToBottom() {
    setTimeout(() => {
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
      });
    }, 100);
  }
}

// Initialize the chat interface when the DOM is loaded
export function showChatInterface() {
  // If not already initialized
  if (!window.chatInterface) {
    window.chatInterface = new ChatInterface();
  }
}