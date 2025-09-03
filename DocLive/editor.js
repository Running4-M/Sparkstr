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
  createDocument,
  fetchEventFromFirebase,
  fetchDocument,
  updateDocumentContent,
  saveDocumentHistory,
  fetchDocumentHistory,
  fetchHistoryItem,
  saveChatMessage,
  fetchChatMessages,
  deleteDocumentHistory,
  firebaseInitPromise 
} from "../backend/firebase.js";

import { checkAndUpdateUsage } from "../backend/planUsage.js";

import { 
  collection, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";




// Global state
let selectedText = '';
let isRightPanelOpen = false;
let currentAction = null;
let currentMobileTab = 'response';
let touchStartX = 0;
let touchEndX = 0;
let mobileTabHistory = [];
let isMobileSidebarOpen = false;
let currentHistoryId = null;

async function init() {
  try {
    console.log("Starting initialization...");
    
    await initializeFirebase();
    console.log("Firebase initialized");
    getCurrentUserId();
    
  } catch (error) {
    console.error("Error initializing application:", error);
  }
}

firebaseInitPromise.then(() => {
  if (!getCurrentUserId()) {
    window.location.href = "../Login/signup.html";
  }
});

function getDocumentIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("documentId");
}

window.sendMessage = sendDesktopMessage;
window.toggleUrlInput = toggleUrlInput;
window.handleFileUpload = handleFileUpload;
window.removeUrlPreview = removeUrlPreview;
window.removeFilePreview = removeFilePreview;
window.addUrl = addDesktopUrl; // For desktop chat

window.sendMessageMobile = sendMobileMessage;
window.toggleUrlInputMobile = toggleUrlInputMobile;
window.handleFileUploadMobile = handleFileUploadMobile;
window.removeUrlPreviewMobile = removeUrlPreviewMobile;
window.removeFilePreviewMobile = removeFilePreviewMobile;
window.addMobileUrl = addMobileUrl; // For mobile chat
window.sendMobileMessage = sendMobileMessage;

document.addEventListener('DOMContentLoaded', init);
document.addEventListener('DOMContentLoaded', async function() {
    
    await loadDocumentContent();
    
});





function getHistoryPreview(markdown) {
    // Render markdown, then strip HTML tags for preview
    const html = window.markdownit().render(markdown || "");
    const div = document.createElement('div');
    div.innerHTML = html;
    // Get first 60 chars of text content
    return div.textContent.replace(/\s+/g, ' ').trim().substring(0, 60) + "...";
}

// Desktop Save Button
const desktopEditor = document.getElementById('document-editor');
const saveBtn = document.getElementById('save-btn');
let lastSavedDesktopContent = desktopEditor ? desktopEditor.innerHTML : "";

if (desktopEditor && saveBtn) {
    desktopEditor.addEventListener('input', () => {
        const unsaved = (desktopEditor.innerHTML !== lastSavedDesktopContent);
        saveBtn.disabled = !unsaved;
        if (unsaved) {
            saveBtn.classList.add('unsaved');
        } else {
            saveBtn.classList.remove('unsaved');
        }
    });
    saveBtn.addEventListener('click', async () => {
        const documentId = getDocumentIdFromUrl();
        if (!documentId) return;
        await updateDocumentContent(documentId, desktopEditor.innerHTML);
        lastSavedDesktopContent = desktopEditor.innerHTML;
        saveBtn.disabled = true;
        saveBtn.classList.remove('unsaved');
        showToast("Document saved!");
    });
}

// Mobile Save Button
const mobileEditor = document.getElementById('mobile-document-editor');
const mobileSaveBtn = document.getElementById('mobile-save-btn');
let lastSavedMobileContent = mobileEditor ? mobileEditor.innerHTML : "";

if (mobileEditor && mobileSaveBtn) {
    mobileEditor.addEventListener('input', () => {
        const unsaved = (mobileEditor.innerHTML !== lastSavedMobileContent);
        mobileSaveBtn.disabled = !unsaved;
        if (unsaved) {
            mobileSaveBtn.classList.add('unsaved');
        } else {
            mobileSaveBtn.classList.remove('unsaved');
        }
    });
    mobileSaveBtn.addEventListener('click', async () => {
        const documentId = getDocumentIdFromUrl();
        if (!documentId) return;
        await updateDocumentContent(documentId, mobileEditor.innerHTML);
        lastSavedMobileContent = mobileEditor.innerHTML;
        mobileSaveBtn.disabled = true;
        mobileSaveBtn.classList.remove('unsaved');
        showToast("Document saved!");
    });
}

function showUnsavedModal(isMobile = false, onContinue) {
    // Remove existing modal if present
    let modal = document.getElementById('unsaved-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'unsaved-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.5)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '99999';

    modal.innerHTML = `
    <div style="background:#fff;padding:32px 28px;border-radius:16px;max-width:340px;text-align:center;box-shadow:0 4px 32px rgba(0,0,0,0.18);">
        <div style="font-size:2rem;font-weight:700;color:#2563eb;margin-bottom:18px;">
            Just a kind reminder:
        </div>
        <div style="font-size:18px;font-weight:600;margin-bottom:10px;">Remember to save your progress before exiting.</div>
        <div style="font-size:15px;color:#444;margin-bottom:22px;">You have unsaved changes. Please save before leaving, or you may lose your work.</div>
        <div style="display:flex;gap:12px;justify-content:center;">
            <button id="unsaved-save-btn" style="padding:10px 18px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:15px;cursor:pointer;">Thanks for reminding me</button>
            <button id="unsaved-continue-btn" style="padding:10px 18px;background:#eee;color:#222;border:none;border-radius:6px;font-size:15px;cursor:pointer;">No thanks</button>
        </div>
    </div>
`;
    document.body.appendChild(modal);

    document.getElementById('unsaved-save-btn').onclick = () => {
        modal.remove();
    };
    document.getElementById('unsaved-continue-btn').onclick = () => {
        modal.remove();
        if (typeof onContinue === 'function') onContinue();
    };
}

function showEditorLoaderOverlay(isMobile = false) {
    const editorContainer = isMobile
        ? document.querySelector('.mobile-document-container')
        : document.querySelector('.document-container');
    if (!editorContainer) return;
    let loader = editorContainer.querySelector('.editor-loader-overlay');
    if (!loader) {
        loader = document.createElement('div');
        loader.className = 'editor-loader-overlay';
        loader.style.cssText = `
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(30,41,59,0.85);
            z-index: 999;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        `;
        loader.innerHTML = `
            <div class="loader-spinner"></div>
            <div class="loader-label">Loading document...</div>
        `;
        editorContainer.style.position = 'relative';
        editorContainer.appendChild(loader);
    }
    loader.style.display = 'flex';
}

function hideEditorLoaderOverlay(isMobile = false) {
    const editorContainer = isMobile
        ? document.querySelector('.mobile-document-container')
        : document.querySelector('.document-container');
    if (!editorContainer) return;
    const loader = editorContainer.querySelector('.editor-loader-overlay');
    if (loader) loader.style.display = 'none';
}

// When loading document content, update lastSaved*Content and disable save
async function loadDocumentContent() {
    showEditorLoaderOverlay(false); // Desktop
    showEditorLoaderOverlay(true);  // Mobile

    const editor = document.getElementById('document-editor');
    const mobileEditor = document.getElementById('mobile-document-editor');
    if (editor) editor.style.display = 'none';
    if (mobileEditor) mobileEditor.style.display = 'none';

    const documentId = getDocumentIdFromUrl();
    if (!documentId) return;
    const doc = await fetchDocument(documentId);

    if (doc) {
        const isProbablyHtml = (doc.content || '').trim().startsWith('<');
        if (editor) {
            editor.innerHTML = isProbablyHtml ? doc.content : window.markdownit().render(doc.content || "");
            editor.style.display = '';
        }
        if (mobileEditor) {
            mobileEditor.innerHTML = isProbablyHtml ? doc.content : window.markdownit().render(doc.content || "");
            mobileEditor.style.display = '';
        }
    }
    hideEditorLoaderOverlay(false); // Desktop
    hideEditorLoaderOverlay(true);  // Mobile
}

async function saveCurrentDocument() {
    const documentId = getDocumentIdFromUrl();
    if (!documentId) return;
    const editor = document.getElementById('document-editor');
    if (!editor) return;
    await updateDocumentContent(documentId, editor.innerHTML);
    showToast("Document saved!");
}



function enableRightPanelResize() {
    const rightPanelContainer = document.getElementById('right-panel-container');
    const mainContent = document.querySelector('.main-content');
    const dragHandle = document.getElementById('right-panel-drag-handle');
    let isDragging = false;
    let startX = 0;
    let startWidth = 0;

    dragHandle.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startWidth = rightPanelContainer.offsetWidth;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        let newWidth = startWidth + (startX - e.clientX);
        newWidth = Math.max(100, Math.min(window.innerWidth, newWidth));
        rightPanelContainer.style.width = newWidth + 'px';
        // Optionally, shrink main content as panel grows
        if (mainContent) {
            mainContent.style.width = `calc(100vw - ${newWidth}px)`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

    // Convert image file to base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Extract text from PDF file
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

// Extract text from DOCX file
async function extractDocxText(file) {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const contentXml = await zip.file("word/document.xml").async("string");
    const xmlDoc = new DOMParser().parseFromString(contentXml, "application/xml");
    const textNodes = [...xmlDoc.getElementsByTagName("w:t")];
    return textNodes.map(node => node.textContent).join(" ");
}

// Extract text from URL using backend parser
async function extractUrlText(url) {
    try {
        const response = await fetch(`https://my-backend-three-pi.vercel.app/api/parser?url=${encodeURIComponent(url)}`);
        if (!response.ok) throw new Error('Failed to fetch URL');
        const data = await response.json();
        return data.text || 'Unfortunately, the website provided could not be accessed or scraped for information.';
    } catch (err) {
        console.error("URL extraction error:", err);
        return 'Unfortunately, the website provided could not be accessed or scraped for information.';
    }
}

const loadingPhrases = [
    "Analyzing text...",
    "Checking grammar...",
    "Finding improvements...",
    "Consulting AI wisdom...",
    "Almost ready..."
];

let inlineLoaderInterval = null;

// --- Loader Utility ---
function showInlineLoader(btn, withText = false) {
    btn.disabled = true;
    btn._originalHTML = btn.innerHTML;
    if (withText) {
        let idx = 0;
        btn.innerHTML = `
            <span class="inline-loader-container">
                <span class="inline-loader"></span>
                <span class="inline-loader-text" id="inline-loader-text">${loadingPhrases[idx]}</span>
            </span>
        `;
        inlineLoaderInterval = setInterval(() => {
            idx = (idx + 1) % loadingPhrases.length;
            const textEl = btn.querySelector('#inline-loader-text');
            if (textEl) textEl.textContent = loadingPhrases[idx];
        }, 1000);
    } else {
        btn.innerHTML = `<span class="inline-loader"></span>`;
    }
}

// Updated hideInlineLoader
function hideInlineLoader(btn) {
    btn.disabled = false;
    if (btn._originalHTML) btn.innerHTML = btn._originalHTML;
    if (inlineLoaderInterval) {
        clearInterval(inlineLoaderInterval);
        inlineLoaderInterval = null;
    }
}
const style = document.createElement('style');
style.innerHTML = `
@keyframes spin { 100% { transform: rotate(360deg); } }
.inline-loader-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 48px;
    width: 100%;
}
.inline-loader {
    vertical-align: middle;
    display: inline-block;
    width: 32px;
    height: 32px;
    border: 4px solid #e5e7eb;
    border-top: 4px solid #6366f1;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-right: 12px;
}
.inline-loader-text {
    display: inline-block;
    vertical-align: middle;
    font-size: 15px;
    color: #6366f1;
    font-weight: 500;
    min-width: 120px; /* Ensure text is visible */
}
`;
document.head.appendChild(style);

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeDesktop();
    initializeMobile();
    initializeTextSelection();
    initializeToolbar();
    initializeDownload();
    initializeSwipeNavigation();
    enableRightPanelResize();
});

document.getElementById('add-context-btn').addEventListener('click', showContextModal);

document.getElementById('toggle-history-btn').addEventListener('click', () => {
    // Do NOT show loading for history
    hideRightPanelLoading();
    showDesktopHistory();
});

// Desktop initialization
function initializeDesktop() {
    const collapseBtn = document.getElementById('collapse-btn');
    const sidebar = document.getElementById('ai-sidebar');
    const toggleHistoryBtn = document.getElementById('toggle-history-btn');
    const closePanelBtn = document.getElementById('close-right-panel-btn');
    
    if (collapseBtn && sidebar) {
        collapseBtn.addEventListener('click', () => {
            sidebar.classList.toggle('ai-sidebar-collapsed');
            const icon = collapseBtn.querySelector('svg');
            if (sidebar.classList.contains('ai-sidebar-collapsed')) {
                icon.style.transform = 'rotate(180deg)';
            } else {
                icon.style.transform = 'rotate(0deg)';
            }
        });
    }



function closeAllPanels() {
    // Hide right panel and chat for desktop
    const rightPanel = document.getElementById('right-panel-container');
    if (rightPanel) rightPanel.classList.remove('show');
    const chatSidebar = document.getElementById('modern-chat-sidebar');
    if (chatSidebar) chatSidebar.classList.add('hidden');
    // Hide mobile tab navigation and chat
    hideMobileTabNavigation();
    const mobileChat = document.getElementById('modern-mobile-chat');
    if (mobileChat) mobileChat.classList.add('hidden');
}

// Update all sidebar/toolbar button handlers to call closeAllPanels first
document.querySelectorAll('.ai-action-btn[data-action]').forEach(button => {
    button.addEventListener('click', (e) => {
        closeAllPanels();
        const action = e.currentTarget.getAttribute('data-action');
        if (window.innerWidth >= 1024) {
            handleDesktopAIAction(action);
        } else {
            handleMobileAIAction(action);
        }
    });
});

document.getElementById('toggle-history-btn').addEventListener('click', () => {
    closeAllPanels();
    if (window.innerWidth >= 1024) {
        showDesktopHistory();
    } else {
        showMobileHistory();
    }
});

    if (toggleHistoryBtn) {
        toggleHistoryBtn.addEventListener('click', () => {
            if (window.innerWidth >= 1024) {
                showDesktopHistory();
            } else {
                showMobileHistory();
            }
        });
    }

    if (closePanelBtn) {
        closePanelBtn.addEventListener('click', closeRightPanel);
    }

    // Panel action buttons
    const applyBtn = document.getElementById('apply-changes-btn');
    const chatBtn = document.getElementById('start-chat-btn');
    const keepBtn = document.getElementById('keep-open-btn');
    const dismissBtn = document.getElementById('dismiss-btn');

    if (applyBtn) applyBtn.addEventListener('click', applyChanges);
    if (chatBtn) chatBtn.addEventListener('click', startChat);
    if (keepBtn) keepBtn.addEventListener('click', () => closeRightPanel());
    if (dismissBtn) dismissBtn.addEventListener('click', () => closeRightPanel());
}

// Mobile initialization
function initializeMobile() {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const closeSidebarBtn = document.getElementById('close-mobile-sidebar-btn');
    const sidebar = document.getElementById('mobile-ai-sidebar');
    const overlay = document.getElementById('mobile-sidebar-overlay');
    const mobileHistoryBtn = document.getElementById('mobile-toggle-history-btn');
    
    if (menuBtn && sidebar && overlay) {
        menuBtn.addEventListener('click', () => {
            sidebar.classList.remove('hidden');
            overlay.classList.remove('hidden');
            isMobileSidebarOpen = true;
        });

        closeSidebarBtn?.addEventListener('click', () => {
            sidebar.classList.add('hidden');
            overlay.classList.add('hidden');
            isMobileSidebarOpen = false;
        });

        overlay.addEventListener('click', () => {
            sidebar.classList.add('hidden');
            overlay.classList.add('hidden');
            isMobileSidebarOpen = false;
        });
    }

    if (mobileHistoryBtn) {
        mobileHistoryBtn.addEventListener('click', showMobileHistory);
    }

    // Mobile tab navigation
    const closeTabBtn = document.getElementById('close-mobile-tab-btn');
    
// Desktop Back Button
const backBtn = document.getElementById('backToDocumentsBtn');
if (backBtn && desktopEditor) {
    backBtn.addEventListener('click', (e) => {
        // Clear desktop history on exit
        localStorage.removeItem('desktopHistory');
        localStorage.removeItem('desktopHistoryIndex');
        const unsaved = (desktopEditor.innerHTML !== lastSavedDesktopContent);
        if (unsaved) {
            e.preventDefault();
            showUnsavedModal(false, () => {
                window.location.href = 'documentHub.html';
            });
        } else {
            window.location.href = 'documentHub.html';
        }
    });
}

// Mobile Back Button
const mobileBackBtn = document.getElementById('mobileBackToDocumentsBtn');
if (mobileBackBtn && mobileEditor) {
    mobileBackBtn.addEventListener('click', (e) => {
        // Clear mobile history on exit
        localStorage.removeItem('mobileHistory');
        localStorage.removeItem('mobileHistoryIndex');
        const unsaved = (mobileEditor.innerHTML !== lastSavedMobileContent);
        if (unsaved) {
            e.preventDefault();
            showUnsavedModal(true, () => {
                window.location.href = 'documentHub.html';
            });
        } else {
            window.location.href = 'documentHub.html';
        }
    });
}

    if (closeTabBtn) {
        closeTabBtn.addEventListener('click', () => {
            closeMobileTab();
        });
    }

    // Mobile action buttons
    const mobileApplyBtn = document.getElementById('mobile-apply-changes-btn');
    const mobileChatBtn = document.getElementById('mobile-start-chat-btn');
    const mobileKeepBtn = document.getElementById('mobile-keep-open-btn');
    const mobileDismissBtn = document.getElementById('mobile-dismiss-btn');

    if (mobileApplyBtn) mobileApplyBtn.addEventListener('click', applyChanges);
    if (mobileChatBtn) mobileChatBtn.addEventListener('click', startMobileChat);
    if (mobileKeepBtn) mobileKeepBtn.addEventListener('click', closeMobileTab);
    if (mobileDismissBtn) mobileDismissBtn.addEventListener('click', closeMobileTab);
}

// Initialize swipe navigation for mobile
function initializeSwipeNavigation() {
    if (window.innerWidth < 1024) {
        const documentEditor = document.getElementById('mobile-document-editor');
        const tabNavigation = document.getElementById('mobile-tab-navigation');
        
        if (documentEditor) {
            documentEditor.addEventListener('touchstart', handleTouchStart, { passive: true });
            documentEditor.addEventListener('touchend', handleTouchEnd, { passive: true });
        }
        
        if (tabNavigation) {
            tabNavigation.addEventListener('touchstart', handleTouchStart, { passive: true });
            tabNavigation.addEventListener('touchend', handleTouchEnd, { passive: true });
        }
    }
}

// Touch handlers for swipe navigation
function handleTouchStart(e) {
    touchStartX = e.changedTouches[0].screenX;
}

function handleTouchEnd(e) {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
}

function handleSwipe() {
    const swipeThreshold = 50;
    const swipeLength = touchEndX - touchStartX;

    if (Math.abs(swipeLength) > swipeThreshold) {
        if (swipeLength > 0) {
            // Swipe right
            // Always show history list, not just change title
            showMobileHistory();
        } else {
            // Swipe left
            if (currentMobileTab === 'history') {
                if (mobileTabHistory.length > 0) {
                    const lastTab = mobileTabHistory[mobileTabHistory.length - 1];
                    if (lastTab === 'chat') {
                        showMobileChat();
                    } else {
                        showMobileResponse();
                    }
                } else {
                    showMobileResponse();
                }
            } else if (isTabNavigationVisible()) {
                closeMobileTab();
            }
        }
    }
}

function isTabNavigationVisible() {
    const tabNav = document.getElementById('mobile-tab-navigation');
    return tabNav && !tabNav.classList.contains('hidden');
}

// Text selection functionality
function initializeTextSelection() {
    const editor = document.getElementById('document-editor');
    const mobileEditor = document.getElementById('mobile-document-editor');
    const selectionIndicator = document.getElementById('text-selection-indicator');
    const previewElement = document.getElementById('selection-preview');
    const clearBtn = document.getElementById('clear-selection-btn');

    function handleSelection() {
        const selection = window.getSelection();
        const text = selection.toString().trim();
        if (text && text.length > 0) {
            selectedText = text;
            if (previewElement) {
                previewElement.textContent = text.length > 30 ? text.substring(0, 30) + '...' : text;
            }
            if (selectionIndicator) {
                selectionIndicator.classList.remove('hidden');
            }
        }
        // Do NOT clear selection unless X button is clicked
    }

    function clearSelection() {
        selectedText = '';
        if (selectionIndicator) {
            selectionIndicator.classList.add('hidden');
        }
        window.getSelection().removeAllRanges();
    }

    if (editor) {
        editor.addEventListener('mouseup', handleSelection);
        editor.addEventListener('keyup', handleSelection);
    }

    if (mobileEditor) {
        mobileEditor.addEventListener('touchend', handleSelection);
        mobileEditor.addEventListener('mouseup', handleSelection);
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', clearSelection);
    }
    // Remove outside click handler!
}

// Toolbar functionality
function initializeToolbar() {
    // Desktop toolbar
    document.querySelectorAll('#desktop-layout .toolbar-btn[data-command]').forEach(button => {
        button.addEventListener('click', () => {
            const command = button.getAttribute('data-command');
            executeCommand(command, 'document-editor');
            updateToolbarState('desktop');
        });
    });

    // Mobile toolbar
    document.querySelectorAll('#mobile-layout .toolbar-btn[data-command]').forEach(button => {
        button.addEventListener('click', () => {
            const command = button.getAttribute('data-command');
            executeCommand(command, 'mobile-document-editor');
            updateToolbarState('mobile');
        });
    });



    // Font size selectors
    const fontSizeSelector = document.getElementById('font-size');
    const mobileFontSizeSelector = document.getElementById('mobile-font-size');

    if (fontSizeSelector) {
        fontSizeSelector.addEventListener('change', (e) => {
            executeCommand('fontSize', 'document-editor', e.target.value);
        });
    }

    if (mobileFontSizeSelector) {
        mobileFontSizeSelector.addEventListener('change', (e) => {
            executeCommand('fontSize', 'mobile-document-editor', e.target.value);
        });
    }

    // Color inputs
    const textColorInput = document.getElementById('text-color');
    const bgColorInput = document.getElementById('background-color');
    const mobileTextColorInput = document.getElementById('mobile-text-color');
    const mobileBgColorInput = document.getElementById('mobile-background-color');

    if (textColorInput) {
        textColorInput.addEventListener('change', (e) => {
            executeCommand('foreColor', 'document-editor', e.target.value);
        });
    }

    if (bgColorInput) {
        bgColorInput.addEventListener('change', (e) => {
            executeCommand('backColor', 'document-editor', e.target.value);
        });
    }

    if (mobileTextColorInput) {
        mobileTextColorInput.addEventListener('change', (e) => {
            executeCommand('foreColor', 'mobile-document-editor', e.target.value);
        });
    }

    if (mobileBgColorInput) {
        mobileBgColorInput.addEventListener('change', (e) => {
            executeCommand('backColor', 'mobile-document-editor', e.target.value);
        });
    }
}

let desktopHistory = [];
let desktopHistoryIndex = -1;
let mobileHistory = [];
let mobileHistoryIndex = -1;

// Save history on input const desktopEditor = document.getElementById('document-editor');
if (desktopEditor) {
  desktopEditor.addEventListener('input', () => {
    desktopHistory = desktopHistory.slice(0, desktopHistoryIndex + 1);
    desktopHistory.push(desktopEditor.innerHTML);
    desktopHistoryIndex = desktopHistory.length - 1;
    localStorage.setItem('desktopHistory', JSON.stringify(desktopHistory));
    localStorage.setItem('desktopHistoryIndex', desktopHistoryIndex);
  });
}


if (mobileEditor) {
  mobileEditor.addEventListener('input', () => {
    mobileHistory = mobileHistory.slice(0, mobileHistoryIndex + 1);
    mobileHistory.push(mobileEditor.innerHTML);
    mobileHistoryIndex = mobileHistory.length - 1;
    localStorage.setItem('mobileHistory', JSON.stringify(mobileHistory));
    localStorage.setItem('mobileHistoryIndex', mobileHistoryIndex);
  });
}

// Undo/Redo handlers
document.getElementById('undo-btn').onclick = function() {
  if (desktopHistoryIndex > 0) {
    desktopHistoryIndex--;
    desktopEditor.innerHTML = desktopHistory[desktopHistoryIndex];
    localStorage.setItem('desktopHistoryIndex', desktopHistoryIndex);
  }
};
document.getElementById('redo-btn').onclick = function() {
  if (desktopHistoryIndex < desktopHistory.length - 1) {
    desktopHistoryIndex++;
    desktopEditor.innerHTML = desktopHistory[desktopHistoryIndex];
    localStorage.setItem('desktopHistoryIndex', desktopHistoryIndex);
  }
};
document.getElementById('mobile-undo-btn').onclick = function() {
  if (mobileHistoryIndex > 0) {
    mobileHistoryIndex--;
    mobileEditor.innerHTML = mobileHistory[mobileHistoryIndex];
    localStorage.setItem('mobileHistoryIndex', mobileHistoryIndex);
  }
};
document.getElementById('mobile-redo-btn').onclick = function() {
  if (mobileHistoryIndex < mobileHistory.length - 1) {
    mobileHistoryIndex++;
    mobileEditor.innerHTML = mobileHistory[mobileHistoryIndex];
    localStorage.setItem('mobileHistoryIndex', mobileHistoryIndex);
  }
};

// On load, restore history
document.addEventListener('DOMContentLoaded', () => {
  desktopHistory = JSON.parse(localStorage.getItem('desktopHistory') || '[]');
  desktopHistoryIndex = parseInt(localStorage.getItem('desktopHistoryIndex') || '-1');
  if (desktopEditor && desktopHistory.length > 0 && desktopHistoryIndex >= 0) {
    desktopEditor.innerHTML = desktopHistory[desktopHistoryIndex];
  }
  mobileHistory = JSON.parse(localStorage.getItem('mobileHistory') || '[]');
  mobileHistoryIndex = parseInt(localStorage.getItem('mobileHistoryIndex') || '-1');
  if (mobileEditor && mobileHistory.length > 0 && mobileHistoryIndex >= 0) {
    mobileEditor.innerHTML = mobileHistory[mobileHistoryIndex];
  }
});

// Clear history on undo
document.getElementById('undo-btn').addEventListener('dblclick', () => {
  desktopHistory = [];
  desktopHistoryIndex = -1;
  localStorage.removeItem('desktopHistory');
  localStorage.removeItem('desktopHistoryIndex');
});
document.getElementById('mobile-undo-btn').addEventListener('dblclick', () => {
  mobileHistory = [];
  mobileHistoryIndex = -1;
  localStorage.removeItem('mobileHistory');
  localStorage.removeItem('mobileHistoryIndex');
});

function setupGrammarDropdowns(issues, aiText) {
    document.querySelectorAll('.grammar-dropdown-btn').forEach(btn => {
        btn.onclick = function(e) {
            e.stopPropagation();
            // Hide all other dropdowns
            document.querySelectorAll('.grammar-dropdown').forEach(d => d.classList.add('hidden'));
            const idx = btn.getAttribute('data-idx');
            document.getElementById(`dropdown-${idx}`).classList.toggle('hidden');
        };
    });
    // Hide dropdowns on click outside
    document.addEventListener('click', () => {
        document.querySelectorAll('.grammar-dropdown').forEach(d => d.classList.add('hidden'));
    });

    // Accept/Dismiss logic
    document.querySelectorAll('.accept-grammar-btn').forEach(btn => {
    btn.onclick = function(e) {
        e.stopPropagation();
        const idx = +btn.getAttribute('data-idx');
        applyGrammarCorrection(idx, JSON.stringify(issues));
        showToast('Change applied');
    };
});
    document.querySelectorAll('.ignore-grammar-btn').forEach(btn => {
        btn.onclick = function() {
            const idx = +btn.getAttribute('data-idx');
            document.querySelector(`.grammar-suggestion-card[data-idx="${idx}"]`).style.display = 'none';
        };
    });
    // Accept All
    const acceptAllBtn = document.getElementById('accept-all-grammar-btn');
    if (acceptAllBtn) {
        acceptAllBtn.onclick = function() {
            issues.forEach((_, idx) => applyGrammarCorrection(idx, JSON.stringify(issues)));
            showToast('All changes applied');
        };
    }
}

function renderGrammarOverviewAndHighlights(grammarObj) {
    const suggestion = document.getElementById('ai-suggestion');
    const highlightsList = document.getElementById('highlights-list');
    const aiResponseSection = document.querySelector('.ai-response-section');
    if (!grammarObj) return;

    // Show overview at the top
    if (suggestion) {
        suggestion.innerHTML = grammarObj.overview
            ? `<div class="p-3 mb-3 rounded-lg bg-blue-100 text-blue-900 border border-blue-200 font-semibold">${grammarObj.overview}</div>`
            : '';
    }
    if (aiResponseSection) aiResponseSection.style.display = '';

    // Show cards for each issue
    if (highlightsList && Array.isArray(grammarObj.issues) && grammarObj.issues.length > 0) {
        highlightsList.innerHTML = grammarObj.issues.map((issue, idx) => {
            let typeClass = "grammar";
            if (issue.type === "spelling") typeClass = "spelling";
            else if (issue.type === "punctuation") typeClass = "punctuation";
            else if (issue.type === "style") typeClass = "style";
            else if (issue.type === "clarity") typeClass = "clarity";
            return `
                <div class="highlight grammar-suggestion-card ${typeClass}" data-idx="${idx}">
                    <div class="highlight-main">
                        <strong>${capitalize(typeClass)}</strong>
                        <span class="highlight-phrase">${issue.phrase}</span>
                        <span>→</span>
                        <span class="highlight-correction">${issue.correction}</span>
                    </div>
                    <div class="highlight-explanation">${issue.explanation || ""}</div>
                    <div class="highlight-actions">
                        <button class="accept-grammar-btn" data-idx="${idx}">Accept</button>
                        <button class="dismiss-grammar-btn" data-idx="${idx}">Dismiss</button>
                    </div>
                </div>
            `;
        }).join('');
    } else if (highlightsList) {
        highlightsList.innerHTML = `<div class="p-3 rounded-lg bg-green-100 text-green-900 border border-green-200">No grammar issues found!</div>`;
    }
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function setupGrammarHighlightActions(issues) {
    document.querySelectorAll('.highlight').forEach(card => {
        card.onclick = function(e) {
            if (!e.target.classList.contains('accept-grammar-btn') && !e.target.classList.contains('dismiss-grammar-btn')) {
                document.querySelectorAll('.highlight').forEach(h => h.classList.remove('active'));
                card.classList.toggle('active');
            }
        };
    });
    document.querySelectorAll('.accept-grammar-btn').forEach(btn => {
        btn.onclick = function(e) {
            e.stopPropagation();
            const idx = +btn.getAttribute('data-idx');
            const issue = issues[idx];
            if (!issue) return;
            const editor = document.getElementById('document-editor');
            if (editor && issue.phrase && issue.correction) {
                const regex = new RegExp(escapeRegExp(issue.phrase), 'gi');
                editor.innerHTML = editor.innerHTML.replace(regex, issue.correction);
            }
            btn.closest('.highlight').style.display = 'none';
            showToast('Change applied');
        };
    });
    document.querySelectorAll('.dismiss-grammar-btn').forEach(btn => {
        btn.onclick = function(e) {
            e.stopPropagation();
            btn.closest('.highlight').style.display = 'none';
        };
    });
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.highlight')) {
            document.querySelectorAll('.highlight').forEach(h => h.classList.remove('active'));
        }
    });
}

function applyGrammarCorrection(idx, jsonString) {
    let issues;
    try {
        issues = JSON.parse(jsonString);
    } catch { return; }
    const issue = issues[idx];
    if (!issue) return;
    // Replace the phrase in both editors
    const editors = [
        document.getElementById('document-editor'),
        document.getElementById('mobile-document-editor')
    ];
    editors.forEach(editor => {
        if (editor && issue.phrase && issue.correction) {
            const regex = new RegExp(escapeRegExp(issue.phrase), 'gi');
            if (editor.isContentEditable) {
                editor.innerHTML = editor.innerHTML.replace(regex, issue.correction);
            } else if (editor.tagName === 'TEXTAREA') {
                editor.value = editor.value.replace(regex, issue.correction);
            }
        }
    });
    // Optionally, remove the issue from the UI
    const el = document.querySelector(`.highlight[data-idx="${idx}"]`);
if (el) el.style.display = 'none';
}

let loadingInterval = null;

function showRightPanelLoading() {
    const loading = document.getElementById('right-panel-loading');
    if (loading) loading.style.display = 'flex';
    let idx = 0;
    loadingInterval = setInterval(() => {
        document.getElementById('loading-text').textContent = loadingPhrases[idx % loadingPhrases.length];
        idx++;
    }, 1000);
    // Disable all AI buttons
    document.querySelectorAll('.ai-action-btn').forEach(btn => btn.disabled = true);
}
function hideRightPanelLoading() {
    const loading = document.getElementById('right-panel-loading');
    if (loading) loading.style.display = 'none';
    clearInterval(loadingInterval);
    document.querySelectorAll('.ai-action-btn').forEach(btn => btn.disabled = false);
}


const editor = document.getElementById('document-editor');
if (editor && saveBtn) {
    editor.addEventListener('input', () => {
        saveBtn.style.display = 'block';
    });
    saveBtn.addEventListener('click', saveCurrentDocument);
}


// Rewrite Option Buttons (right panel)
document.querySelectorAll('#rewrite-options .adjustment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const rewriteOption = btn.getAttribute('data-rewrite');
        // Open right panel and trigger AI only when option picked
        showRightPanel();
        streamAISuggestion('rewrite', { rewriteOption });
    });
});

document.querySelectorAll('#rewrite-adjustments .adjustment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        let rewriteOption = '';
        switch (btn.textContent.trim().toLowerCase()) {
            case 'make it shorter': rewriteOption = 'shorter'; break;
            case 'make it longer': rewriteOption = 'longer'; break;
            case 'more formal': rewriteOption = 'more_formal'; break;
            case 'more casual': rewriteOption = 'more_casual'; break;
            case 'take a different approach': rewriteOption = 'completely_different'; break;
            default: return;
        }
        showRightPanel();
        streamAISuggestion('rewrite', { rewriteOption });
    });
});

// Desktop: Tone Option Buttons (right panel)
document.querySelectorAll('#tone-adjustments .adjustment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const toneOption = btn.getAttribute('data-tone');
        if (!toneOption) return;
        streamAISuggestion('tone', { toneOption });
    });
});

async function getEventAndResponseInfoIfNeeded(documentId) {
    // Fetch the document meta
    const docData = await fetchDocument(documentId);
    if (!docData || docData.sourceType !== "response" || !docData.eventId || !docData.responseId) return null;

    // Fetch event info
    const eventDoc = await fetchEventFromFirebase(docData.eventId);
    let eventTitle = "", eventDescription = "";
    if (eventDoc && eventDoc.exists()) {
        const data = eventDoc.data();
        eventTitle = data.title || "";
        eventDescription = data.description || "";
    }

    // Fetch response info
    const userId = getCurrentUserId();
    let responseText = "";
    if (userId) {
        const responseSnap = await getDoc(doc(db, "users", userId, "responses", docData.responseId));
        if (responseSnap.exists()) {
            const respData = responseSnap.data();
            responseText = respData.response || "";
        }
    }

    return { eventTitle, eventDescription, responseText };
}
async function streamAISuggestion(action, options = {}) {
    showRightPanel();
    showRightPanelLoading();

    const suggestion = document.getElementById('ai-suggestion');
    if (suggestion) suggestion.innerHTML = '';

    const editor = document.getElementById('document-editor');
    const text = editor ? editor.innerText : '';
    const userId = getCurrentUserId() || 'demo-user-1';
    const documentId = getDocumentIdFromUrl();

    let extraInfo = {};
    if (documentId) {
        const info = await getEventAndResponseInfoIfNeeded(documentId);
        if (info) extraInfo = info;
    }

    const payload = {
        action,
        text,
        selectedText,
        userId,
        ...options,
        ...extraInfo // Only includes if present
    };

    console.log("Sending AI request:", payload);

    try {
        const response = await fetch('https://my-backend-three-pi.vercel.app/api/editor_ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.body) {
            suggestion.innerHTML = '<span style="color:#f87171;">No response from AI.</span>';
            hideRightPanelLoading();
            return;
        }

        let aiText = '';
        let firstChunk = true;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let tempPre = document.createElement('pre');
        tempPre.style.whiteSpace = 'pre-wrap';
        suggestion.appendChild(tempPre);

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            console.log("AI chunk:", chunk);
            const lines = chunk.split('\n\n');
            for (const line of lines) {
                if (line.startsWith('data:')) {
                    const data = line.replace('data:', '').trim();
                    if (data === '[DONE]') break;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.delta) {
    console.log("[editor.js] Delta received from backend:", parsed.delta);
    aiText += parsed.delta;
    tempPre.textContent = aiText;
} else if (parsed.error) {
    console.warn("[editor.js] Backend reported error:", parsed.error);
    tempPre.textContent = `⚠️ ${parsed.error}`;
} else {
    console.warn("[editor.js] Empty delta received. Backend may have sent fallback.");
}
                    } catch (e) {}
                }
            }
        }

        // If grammar, parse JSON and render overview + cards
        if (action === 'grammar') {
            let grammarObj;
            try {
                grammarObj = JSON.parse(aiText);
            } catch {
                suggestion.innerHTML = '<span style="color:#f87171;">Error parsing grammar response.</span>';
                hideRightPanelLoading();
                return;
            }
            renderGrammarOverviewAndHighlights(grammarObj);
            setupGrammarHighlightActions(grammarObj.issues || []);
        } else {
            suggestion.innerHTML = window.markdownit().render(aiText);
        }

        const documentId = getDocumentIdFromUrl();
        if (documentId && aiText && action) {
            await saveDocumentHistory(documentId, action, aiText);
        }
        hideRightPanelLoading();

    } catch (err) {
        if (suggestion) suggestion.innerHTML = '<span style="color:#f87171;">Error getting AI response.</span>';
        hideRightPanelLoading();
    }
}

function executeCommand(command, editorId, value = null) {
    const editor = document.getElementById(editorId);
    if (editor) {
        editor.focus();
        document.execCommand(command, false, value);
    }
}

function updateToolbarState(platform) {
    const prefix = platform === 'mobile' ? '#mobile-layout ' : '#desktop-layout ';
    
    // Update button states based on current selection
    const commands = ['bold', 'italic', 'underline', 'strikeThrough'];
    commands.forEach(command => {
        const button = document.querySelector(`${prefix}.toolbar-btn[data-command="${command}"]`);
        if (button) {
            if (document.queryCommandState(command)) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        }
    });
}

// Desktop AI actions
function handleDesktopAIAction(action) {
    currentAction = action;
    showRightPanel();
    updatePanelHeader(action);
    showDesktopResponse(action); 
    streamAISuggestion(action);
}


function showRightPanel() {
    const container = document.getElementById('right-panel-container');
    const mainContent = document.querySelector('.main-content');
    if (container) {
        container.classList.add('show');
        container.style.width = '';      // Reset inline styles
        container.style.minWidth = '';
        container.style.maxWidth = '';
        isRightPanelOpen = true;
    }
    if (mainContent) {
    mainContent.classList.remove('full-width');
    mainContent.style.width = 'calc(100vw - 400px)';
}
}

function closeRightPanel() {
    const container = document.getElementById('right-panel-container');
    const panel = document.querySelector('.right-panel');
    const mainContent = document.querySelector('.main-content');
    if (container) {
        container.classList.remove('show');
        container.style.width = '0';
        container.style.minWidth = '0';
        container.style.maxWidth = '0';
    }
    if (panel) {
        panel.style.display = 'none';
        setTimeout(() => { panel.style.display = ''; }, 300);
    }
    if (mainContent) {
        mainContent.classList.add('full-width');
        mainContent.style.width = '100vw';
    }
    hideAllPanelContent();
    isRightPanelOpen = false;
}

function applyChanges() {
    // If grammar, apply ONLY the active grammar correction
    if (currentAction === 'grammar') {
        const highlights = document.querySelectorAll('.highlight.active');
        // Desktop
        const desktopEditor = document.getElementById('document-editor');
        // Mobile
        const mobileEditor = document.getElementById('mobile-document-editor');
        highlights.forEach(card => {
            if (card.style.display !== 'none') {
                const phrase = card.querySelector('.highlight-phrase')?.textContent;
                const correction = card.querySelector('.highlight-correction')?.textContent;
                if (phrase && correction) {
                    const regex = new RegExp(escapeRegExp(phrase), 'gi');
                    if (desktopEditor) desktopEditor.innerHTML = desktopEditor.innerHTML.replace(regex, correction);
                    if (mobileEditor) mobileEditor.innerHTML = mobileEditor.innerHTML.replace(regex, correction);
                    card.style.display = 'none';
                }
            }
        });
        showToast('Change applied');
        closeRightPanel();
        closeMobileTab();
        return;
    }

    // If rewrite, replace editor content with AI suggestion
    if (currentAction === 'rewrite') {
        // Desktop
        const desktopEditor = document.getElementById('document-editor');
        const aiSuggestion = document.getElementById('ai-suggestion');
        if (desktopEditor && aiSuggestion) {
            desktopEditor.innerHTML = aiSuggestion.innerHTML;
        }
        // Mobile
        const mobileEditor = document.getElementById('mobile-document-editor');
        const mobileAISuggestion = document.getElementById('mobile-ai-suggestion');
        if (mobileEditor && mobileAISuggestion) {
            mobileEditor.innerHTML = mobileAISuggestion.innerHTML;
        }
        showToast('Rewrite applied');
        closeRightPanel();
        closeMobileTab();
        return;
    }
}
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function autoResizeEditor() {
    const editor = document.getElementById('document-editor');
    if (editor) {
        editor.style.height = 'auto';
        editor.style.height = (editor.scrollHeight + 40) + 'px';
    }
}
document.getElementById('document-editor').addEventListener('input', autoResizeEditor);

function hideAllPanelContent() {
    const sections = ['response-content', 'history-content', 'chat-content'];
    sections.forEach(sectionId => {
        const section = document.getElementById(sectionId);
        if (section) section.classList.add('hidden');
    });
}

function updatePanelHeader(action) {
    const icon = document.getElementById('response-action-icon');
    const title = document.getElementById('response-action-title');
    
    const actionConfig = {
        feedback: { icon: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z', title: 'AI Feedback', color: 'bg-blue-100' },
        grammar: { icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', title: 'Grammar Check', color: 'bg-green-100' },
        rewrite: { icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z', title: 'Rewrite', color: 'bg-purple-100' },
        expand: { icon: 'M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4', title: 'Expand Ideas', color: 'bg-orange-100' },
        simplify: { icon: 'M13 10V3L4 14h7v7l9-11h-7z', title: 'Simplify', color: 'bg-teal-100' },
        tone: { icon: 'M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m-9 8h10m-10 4h10', title: 'Adjust Tone', color: 'bg-pink-100' }
    };
    
    const config = actionConfig[action] || actionConfig.feedback;
    
    if (icon) {
        icon.className = `p-1.5 rounded ${config.color}`;
        const svg = icon.querySelector('svg');
        if (svg) {
            const path = svg.querySelector('path');
            if (path) path.setAttribute('d', config.icon);
        }
    }
    
    if (title) {
        title.textContent = config.title;
    }
}

// Add mobile AI action button listeners
document.querySelectorAll('#mobile-ai-sidebar .ai-action-btn[data-action]').forEach(button => {
    button.addEventListener('click', (e) => {
        const action = e.currentTarget.getAttribute('data-action');
        if (action === 'tone') {
            document.getElementById('mobile-tone-adjustments').classList.remove('hidden');
            // DO NOT close sidebar or open panel yet!
            return;
        }
        streamMobileAISuggestion(action);
    });
});



// Mobile Rewrite Option Buttons (right panel)
document.querySelectorAll('#mobile-rewrite-adjustments .adjustment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        let rewriteOption = '';
        switch (btn.textContent.trim().toLowerCase()) {
            case 'make it shorter': rewriteOption = 'shorter'; break;
            case 'make it longer': rewriteOption = 'longer'; break;
            case 'more formal': rewriteOption = 'more_formal'; break;
            case 'more casual': rewriteOption = 'more_casual'; break;
            case 'take a different approach': rewriteOption = 'completely_different'; break;
            default: return;
        }
        showMobileTabNavigation();
        streamMobileAISuggestion('rewrite', { rewriteOption });
    });
});

// Mobile: Tone Option Buttons (right panel)
document.querySelectorAll('#mobile-tone-adjustments .adjustment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const toneOption = btn.getAttribute('data-tone');
        if (!toneOption) return;
        streamMobileAISuggestion('tone', { toneOption });
    });
});

// Mobile AI streaming function
async function streamMobileAISuggestion(action, options = {}) {
    showMobileLoading();

    const suggestion = document.getElementById('mobile-ai-suggestion');
    if (suggestion) suggestion.innerHTML = '';

    const editor = document.getElementById('mobile-document-editor');
    const text = editor ? editor.innerText : '';
    const userId = getCurrentUserId() || 'demo-user-1';
    const documentId = getDocumentIdFromUrl();

    let extraInfo = {};
    if (documentId) {
        const info = await getEventAndResponseInfoIfNeeded(documentId);
        if (info) extraInfo = info;
    }

    const payload = {
        action,
        text,
        selectedText,
        userId,
        ...options,
        ...extraInfo // Only includes if present
    };

    try {
        const response = await fetch('https://my-backend-three-pi.vercel.app/api/editor_ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.body) {
            suggestion.innerHTML = '<span style="color:#f87171;">No response from AI.</span>';
            hideMobileLoading();
            return;
        }

        let aiText = '';
        let firstChunk = true;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let tempPre = document.createElement('pre');
        tempPre.style.whiteSpace = 'pre-wrap';
        suggestion.appendChild(tempPre);

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n\n');
            for (const line of lines) {
                if (line.startsWith('data:')) {
                    const data = line.replace('data:', '').trim();
                    if (data === '[DONE]') break;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.delta) {
    console.log("[editor.js] Delta received from backend:", parsed.delta);
    aiText += parsed.delta;
    tempPre.textContent = aiText;
} else if (parsed.error) {
    console.warn("[editor.js] Backend reported error:", parsed.error);
    tempPre.textContent = `⚠️ ${parsed.error}`;
} else {
    console.warn("[editor.js] Empty delta received. Backend may have sent fallback.");
}
                    } catch (e) {}
                }
            }
        }

        suggestion.innerHTML = window.markdownit().render(aiText);

        hideMobileLoading();

    } catch (err) {
        if (suggestion) suggestion.innerHTML = '<span style="color:#f87171;">Error getting AI response.</span>';
        hideMobileLoading();
    }
}

function showMobileLoading() {
    const loading = document.getElementById('mobile-right-panel-loading');
    if (loading) loading.style.display = 'flex';
    let idx = 0;
    loadingInterval = setInterval(() => {
        document.getElementById('mobile-loading-text').textContent = loadingPhrases[idx % loadingPhrases.length];
        idx++;
    }, 1000);
    document.querySelectorAll('#mobile-ai-sidebar .ai-action-btn').forEach(btn => btn.disabled = true);
}
function hideMobileLoading() {
    const loading = document.getElementById('mobile-right-panel-loading');
    if (loading) loading.style.display = 'none';
    clearInterval(loadingInterval);
    document.querySelectorAll('#mobile-ai-sidebar .ai-action-btn').forEach(btn => btn.disabled = false);
}

// Mobile grammar rendering
function renderMobileGrammarOverviewAndHighlights(grammarObj) {
    const suggestion = document.getElementById('mobile-ai-suggestion');
    const highlightsList = document.getElementById('mobile-highlights-list');
    const aiResponseSection = document.querySelector('#mobile-response-content .ai-response-section');
    if (Array.isArray(grammarObj.issues) && grammarObj.issues.length > 0) {
        if (suggestion) {
            suggestion.innerHTML = grammarObj.overview
                ? `<div class="p-3 mb-3 rounded-lg bg-blue-100 text-blue-900 border border-blue-200 font-semibold">${grammarObj.overview}</div>`
                : '';
        }
        if (aiResponseSection) aiResponseSection.style.display = '';
        if (highlightsList) {
            highlightsList.innerHTML = grammarObj.issues.map((issue, idx) => {
                let typeClass = "grammar";
                if (issue.type === "spelling") typeClass = "spelling";
                else if (issue.type === "punctuation") typeClass = "punctuation";
                else if (issue.type === "style") typeClass = "style";
                else if (issue.type === "clarity") typeClass = "clarity";
                return `
                    <div class="highlight ${typeClass}" data-idx="${idx}">
                        <div class="highlight-main">
                            <strong>${capitalize(typeClass)}</strong>
                            <span class="highlight-phrase">${issue.phrase}</span>
                            <span>→</span>
                            <span class="highlight-correction">${issue.correction}</span>
                        </div>
                        <div class="highlight-explanation">${issue.explanation || ""}</div>
                        <div class="highlight-actions">
                            <button class="accept-grammar-btn" data-idx="${idx}">Accept</button>
                            <button class="dismiss-grammar-btn" data-idx="${idx}">Dismiss</button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    } else {
        if (highlightsList) {
            highlightsList.innerHTML = `<div class="p-3 rounded-lg bg-green-100 text-green-900 border border-green-200">No grammar issues found!</div>`;
        }
        if (aiResponseSection) aiResponseSection.style.display = 'none';
    }
}

function setupMobileGrammarHighlightActions(issues) {
    document.querySelectorAll('#mobile-highlights-list .highlight').forEach(card => {
        card.onclick = function(e) {
            if (!e.target.classList.contains('accept-grammar-btn') && !e.target.classList.contains('dismiss-grammar-btn')) {
                document.querySelectorAll('#mobile-highlights-list .highlight').forEach(h => h.classList.remove('active'));
                card.classList.toggle('active');
            }
        };
    });
    document.querySelectorAll('#mobile-highlights-list .accept-grammar-btn').forEach(btn => {
        btn.onclick = function(e) {
            e.stopPropagation();
            const idx = +btn.getAttribute('data-idx');
            const issue = issues[idx];
            if (!issue) return;
            const editor = document.getElementById('mobile-document-editor');
            if (editor && issue.phrase && issue.correction) {
                const regex = new RegExp(escapeRegExp(issue.phrase), 'gi');
                editor.innerHTML = editor.innerHTML.replace(regex, issue.correction);
            }
            btn.closest('.highlight').style.display = 'none';
            showToast('Change applied');
        };
    });
    document.querySelectorAll('#mobile-highlights-list .dismiss-grammar-btn').forEach(btn => {
        btn.onclick = function(e) {
            e.stopPropagation();
            btn.closest('.highlight').style.display = 'none';
        };
    });
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.highlight')) {
            document.querySelectorAll('#mobile-highlights-list .highlight').forEach(h => h.classList.remove('active'));
        }
    });
}


function showDesktopResponse(action) {
    hideAllPanelContent();

    const responseContent = document.getElementById('response-content');
    if (responseContent) responseContent.classList.remove('hidden');

    // Show original text if there's a selection
    const originalSection = document.getElementById('original-text-section');
    const originalText = document.getElementById('original-text');
    if (selectedText && originalSection && originalText) {
        originalSection.classList.remove('hidden');
        originalText.textContent = selectedText;
    } else if (originalSection) {
        originalSection.classList.add('hidden');
    }

    // Clear AI suggestion
    const suggestion = document.getElementById('ai-suggestion');
    if (suggestion) suggestion.innerHTML = '';

    // Show/hide tone and rewrite option buttons in right panel
    const toneAdjustments = document.getElementById('tone-adjustments');
    if (toneAdjustments) toneAdjustments.classList.toggle('hidden', action !== 'tone');
    const rewriteAdjustments = document.getElementById('rewrite-adjustments');
    if (rewriteAdjustments) rewriteAdjustments.classList.toggle('hidden', action !== 'rewrite');

    // Show/hide apply button ONLY for grammar and rewrite
    const applyBtn = document.getElementById('apply-changes-btn');
    if (applyBtn) {
        if (action === 'grammar' || action === 'rewrite') {
            applyBtn.classList.remove('hidden');
        } else {
            applyBtn.classList.add('hidden');
        }
    }

    // Show/hide grammar highlights ONLY for grammar
    const grammarHighlights = document.getElementById('grammar-highlights');
    if (grammarHighlights) {
        grammarHighlights.style.display = (action === 'grammar') ? '' : 'none';
    }
}

async function openHistoryItem(historyId) {
    const documentId = getDocumentIdFromUrl();
    if (!documentId || !historyId) return;
    const item = await fetchHistoryItem(documentId, historyId);
    if (!item) return;
    showRightPanel();
    hideAllPanelContent();
    const responseContent = document.getElementById('response-content');
    if (responseContent) responseContent.classList.remove('hidden');
    const suggestion = document.getElementById('ai-suggestion');
    if (suggestion) suggestion.innerHTML = window.markdownit().render(item.aiResponse || "");
    // Optionally, set the panel header to the action type
    updatePanelHeader(item.action);
    // Optionally, allow "Discuss Further" to load chat for this historyId
    currentHistoryId = historyId;
    await loadChatForHistory(documentId, historyId);
}

const colorMap = {
    feedback: '#2563eb',
    grammar: '#10b981',
    rewrite: '#a78bfa',
    expand: '#f59e42',
    simplify: '#14b8a6',
    tone: '#ec4899'
};

async function showDesktopHistory() {
    document.getElementById('historyLoader').style.display = 'flex';
    hideRightPanelLoading();
    showRightPanel();
    hideAllPanelContent();

    const historyContent = document.getElementById('history-content');
    if (historyContent) historyContent.classList.remove('hidden');

    const title = document.getElementById('response-action-title');
    if (title) title.textContent = 'Response History';

    const documentId = getDocumentIdFromUrl();
    const historyList = document.getElementById('history-list');
    if (!documentId || !historyList) return;

    let history = await fetchDocumentHistory(documentId);
     document.getElementById('historyLoader').style.display = 'none';

    // Sort by timestamp descending (most recent first)
    history = history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (!history.length) {
        historyList.innerHTML = `<div class="history-item">No history yet.</div>`;
        return;
    }

    historyList.innerHTML = history.map(item => {
        const color = colorMap[item.action] || '#6366f1';
        return `
        <div class="history-item" style="cursor:pointer; border-left:6px solid ${color}; background:#23272f; margin-bottom:12px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.08); position:relative;" data-history-id="${item.id}">
            <div style="display:flex;align-items:center;justify-content:space-between;">
                <span style="font-weight:600;font-size:15px;color:${color};">${item.action.charAt(0).toUpperCase() + item.action.slice(1)} Request</span>
                <span style="font-size:12px;color:#b3b3b3;">${new Date(item.timestamp).toLocaleString()}</span>
            </div>
            <div style="margin-top:6px;font-size:14px;color:#e5e7eb;">${getHistoryPreview(item.aiResponse)}</div>
            <span class="history-delete-btn" style="display:none;position:absolute;top:6px;right:6px;cursor:pointer;color:#f87171;z-index:2;" title="Delete">
                <svg width="36" height="36" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="18" fill="#f87171" opacity="0.15"/><path d="M12 12l12 12M12 24L24 12"/></svg>
            </span>
        </div>
        `;
    }).join('');

    // Add click and hover handlers
    historyList.querySelectorAll('.history-item').forEach(el => {
        el.addEventListener('click', async (e) => {
            if (e.target.closest('.history-delete-btn')) return; // Don't open if clicking delete
            const historyId = el.getAttribute('data-history-id');
            await openHistoryItem(historyId);
        });
        // Show bin icon on hover
        el.addEventListener('mouseenter', () => {
            el.querySelector('.history-delete-btn').style.display = 'block';
        });
        el.addEventListener('mouseleave', () => {
            el.querySelector('.history-delete-btn').style.display = 'none';
        });
        // Delete handler (no confirmation)
        el.querySelector('.history-delete-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            const historyId = el.getAttribute('data-history-id');
            const documentId = getDocumentIdFromUrl();
            await deleteDocumentHistory(documentId, historyId);
            showDesktopHistory();
            showToast('History deleted');
        });
    });
}

// Mobile functions
function handleMobileAIAction(action) {
    currentAction = action;
    mobileTabHistory.push('response');
    showMobileResponse();
    hideMobileSidebar();
    showMobileTabNavigation();
    updateMobileResponseContent(action);
    
    // For other actions, trigger AI immediately
    streamMobileAISuggestion(action);
}

function showMobileTabNavigation() {
    const tabNav = document.getElementById('mobile-tab-navigation');
    if (tabNav) {
        tabNav.classList.remove('hidden');
    }
}

function hideMobileTabNavigation() {
    const tabNav = document.getElementById('mobile-tab-navigation');
    if (tabNav) {
        tabNav.classList.add('hidden');
    }
}

function showMobileSidebar() {
    const sidebar = document.getElementById('mobile-ai-sidebar');
    const overlay = document.getElementById('mobile-sidebar-overlay');
    
    if (sidebar && overlay) {
        hideMobileTabNavigation();
        sidebar.classList.remove('hidden');
        overlay.classList.remove('hidden');
        isMobileSidebarOpen = true;
    }
}

function hideMobileSidebar() {
    const sidebar = document.getElementById('mobile-ai-sidebar');
    const overlay = document.getElementById('mobile-sidebar-overlay');
    
    if (sidebar && overlay) {
        sidebar.classList.add('hidden');
        overlay.classList.add('hidden');
        isMobileSidebarOpen = false;
    }
}

function closeMobileTab() {
    hideMobileTabNavigation();
    mobileTabHistory = [];
    currentMobileTab = 'history'; // <-- Always reset to history
    // Hide all tab contents
    const responseContent = document.getElementById('mobile-response-content');
    const historyContent = document.getElementById('mobile-history-content');
    const chatContent = document.getElementById('mobile-chat-content');
    if (responseContent) responseContent.classList.add('hidden');
    if (historyContent) historyContent.classList.add('hidden');
    if (chatContent) chatContent.classList.add('hidden');
}

function showMobileResponse() {
    currentMobileTab = 'response';
    updateMobileTabTitle('AI Response');
    
    // Show response content, hide others
    const responseContent = document.getElementById('mobile-response-content');
    const historyContent = document.getElementById('mobile-history-content');
    const chatContent = document.getElementById('mobile-chat-content');
    
    if (responseContent) responseContent.classList.remove('hidden');
    if (historyContent) historyContent.classList.add('hidden');
    if (chatContent) chatContent.classList.add('hidden');
}

function showMobileChat() {
    currentMobileTab = 'chat';
    updateMobileTabTitle('Chat with AI');
    
    if (!mobileTabHistory.includes('chat')) {
        mobileTabHistory.push('chat');
    }
    
    // Show chat content, hide others
    const responseContent = document.getElementById('mobile-response-content');
    const historyContent = document.getElementById('mobile-history-content');
    const chatContent = document.getElementById('mobile-chat-content');
    
    if (responseContent) responseContent.classList.add('hidden');
    if (historyContent) historyContent.classList.add('hidden');
    if (chatContent) chatContent.classList.remove('hidden');
}

function updateMobileTabTitle(title) {
    const titleElement = document.getElementById('mobile-tab-title');
    if (titleElement) {
        titleElement.textContent = title;
    }
}

function updateMobileResponseContent(action) {
    // Show/hide tone and rewrite option buttons in right panel
    const mobileToneAdjustments = document.getElementById('mobile-tone-adjustments');
    if (mobileToneAdjustments) mobileToneAdjustments.classList.toggle('hidden', action !== 'tone');
    const mobileRewriteAdjustments = document.getElementById('mobile-rewrite-adjustments');
    if (mobileRewriteAdjustments) mobileRewriteAdjustments.classList.toggle('hidden', action !== 'rewrite');

    // Show original text if there's a selection
    const originalSection = document.getElementById('mobile-original-text-section');
    const originalText = document.getElementById('mobile-original-text');
    if (selectedText && originalSection && originalText) {
        originalSection.classList.remove('hidden');
        originalText.textContent = selectedText;
    } else if (originalSection) {
        originalSection.classList.add('hidden');
    }

    // Show AI suggestion (clear, will be streamed in)
    const suggestion = document.getElementById('mobile-ai-suggestion');
    if (suggestion) suggestion.innerHTML = '';

    // Show/hide apply button ONLY for grammar and rewrite
    const applyBtn = document.getElementById('mobile-apply-changes-btn');
    if (applyBtn) {
        if (action === 'grammar' || action === 'rewrite') {
            applyBtn.classList.remove('hidden');
        } else {
            applyBtn.classList.add('hidden');
        }
    }

    // Show/hide grammar highlights ONLY for grammar
    const grammarHighlights = document.getElementById('mobile-grammar-highlights');
    if (grammarHighlights) {
        grammarHighlights.style.display = (action === 'grammar') ? '' : 'none';
    }
}


let previousDesktopAIResponse = null;
let previousMobileAIResponse = null;

// When user clicks "Discuss Further" (or similar), set previousDesktopAIResponse
// Example: Add this to your "Discuss Further" button handler
function discussFurtherDesktop() {
    const aiSuggestion = document.getElementById('ai-suggestion');
    if (aiSuggestion && aiSuggestion.innerHTML.trim()) {
        previousDesktopAIResponse = aiSuggestion.innerText || aiSuggestion.textContent;
        startChat();
    }
}

// For mobile
function discussFurtherMobile() {
    const mobileAISuggestion = document.getElementById('mobile-ai-suggestion');
    if (mobileAISuggestion && mobileAISuggestion.innerHTML.trim()) {
        previousMobileAIResponse = mobileAISuggestion.innerText || mobileAISuggestion.textContent;
        startMobileChat();
    }
}

function startChat() {
    documentContextSentDesktop = false;
    hideAllPanelContent();
    document.getElementById('modern-chat-sidebar').classList.remove('hidden');
    // Only set messages if none loaded
    if (desktopMessages.length === 0) {
        const aiSuggestion = document.getElementById('ai-suggestion');
        if (aiSuggestion && aiSuggestion.innerHTML.trim()) {
            desktopMessages = [{
                id: (Date.now() + 1).toString(),
                type: 'assistant',
                content: aiSuggestion.innerText || aiSuggestion.textContent,
                timestamp: new Date(),
                attachment: null
            }];
        }
    }
    renderDesktopMessages();
}

// Desktop chat state
let desktopMessages = [];
let desktopUrlPreview = null;
let desktopFilePreview = null;
let desktopShowUrlInput = false;

// Desktop chat DOM elements
const desktopMessagesContainer = document.getElementById('messagesContainer');
const desktopEmptyState = document.getElementById('emptyState');
const desktopMessageTextarea = document.getElementById('messageTextarea');
const desktopSendButton = document.getElementById('sendButton');
const desktopUrlPreviewEl = document.getElementById('urlPreview');
const desktopUrlPreviewText = document.getElementById('urlPreviewText');
const desktopFilePreviewEl = document.getElementById('filePreview');
const desktopFilePreviewText = document.getElementById('filePreviewText');
const desktopFilePreviewImage = document.getElementById('filePreviewImage');
const desktopUrlInputContainer = document.getElementById('urlInputContainer');
const desktopUrlInput = document.getElementById('urlInput');

// Desktop chat: auto-resize textarea
if (desktopMessageTextarea) {
    desktopMessageTextarea.addEventListener('input', function() {
        this.style.height = 'auto';
        const scrollHeight = this.scrollHeight;
        this.style.height = Math.min(scrollHeight, 120) + 'px';
        updateDesktopSendButton();
    });

    desktopMessageTextarea.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendDesktopMessage();
        }
    });
}

if (desktopUrlInput) {
    desktopUrlInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            addDesktopUrl();
        }
    });
}

// Desktop chat: update send button state
function updateDesktopSendButton() {
    const hasText = desktopMessageTextarea.value.trim();
    const hasAttachment = window.desktopUrlPreview || window.desktopFilePreview;
    desktopSendButton.disabled = !(hasText || hasAttachment);
}

// Desktop chat: toggle URL input
function toggleUrlInput() {
    desktopShowUrlInput = !desktopShowUrlInput;
    desktopUrlInputContainer.classList.toggle('hidden', !desktopShowUrlInput);
    if (desktopShowUrlInput) {
        desktopUrlInput.focus();
    }
}

// Desktop chat: add URL
async function addDesktopUrl() {
    const url = desktopUrlInput.value.trim();
    if (!url) return;
    const addBtn = document.getElementById('add-url-btn');
    if (addBtn) showInlineLoader(addBtn);
    desktopSendButton.disabled = true; // Disable send while processing

    try {
        const content = await extractUrlText(url);
        window.desktopUrlPreview = { url, content };
        desktopUrlPreviewText.textContent = `🔗 ${url}`;
        desktopUrlPreviewEl.classList.remove('hidden');
        desktopUrlInput.value = '';
        desktopUrlInputContainer.classList.add('hidden');
        desktopShowUrlInput = false;
        updateDesktopSendButton();
        showToast('URL Added', 'URL preview has been added to your message.');
    } finally {
        if (addBtn) hideInlineLoader(addBtn);
        desktopSendButton.disabled = false; // Re-enable send
    }
}

// Desktop chat: remove URL preview
function removeUrlPreview() {
    desktopUrlPreview = null;
    desktopUrlPreviewEl.classList.add('hidden');
    updateDesktopSendButton();
}

// Desktop chat: handle file upload
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const fileBtn = document.getElementById('file-upload-btn');
    showInlineLoader(desktopSendButton, false); // Show loader on send button
    desktopSendButton.disabled = true;

    let fileData = null;
    try {
        if (file.type.startsWith('image/')) {
            const base64 = await fileToBase64(file);
            fileData = { name: file.name, isImage: true, base64 };
            desktopFilePreviewImage.src = base64;
            desktopFilePreviewImage.classList.remove('hidden');
            desktopFilePreviewText.textContent = file.name;
        } else if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
            const content = await extractPdfText(file);
            fileData = { name: file.name, content };
            desktopFilePreviewText.textContent = file.name;
            desktopFilePreviewImage.classList.add('hidden');
        } else if (file.name.toLowerCase().endsWith(".docx")) {
            const content = await extractDocxText(file);
            fileData = { name: file.name, content };
            desktopFilePreviewText.textContent = file.name;
            desktopFilePreviewImage.classList.add('hidden');
        } else {
            showToast("Unsupported file type. Only images, PDF, and DOCX are supported.");
            return;
        }
        window.desktopFilePreview = fileData;
        desktopFilePreviewEl.classList.remove('hidden');
        updateDesktopSendButton();
        showToast('File Added', `${file.name} has been added to your message.`);
    } finally {
        hideInlineLoader(desktopSendButton); // Hide loader
        event.target.value = '';
        desktopSendButton.disabled = false;
    }
}

// Desktop chat: remove file preview
function removeFilePreview() {
    window.desktopFilePreview = null;
    desktopFilePreviewEl.classList.add('hidden');
    desktopFilePreviewImage.classList.add('hidden');
    updateDesktopSendButton();
}

let documentContextSentDesktop = false;
let documentContextSentMobile = false;

// Loader functions
function showChatLoader(type) {
    let loader = document.getElementById(type === 'desktop' ? 'chat-loader' : 'chat-loader-mobile');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = type === 'desktop' ? 'chat-loader' : 'chat-loader-mobile';
        loader.className = 'chat-loader';
        loader.style.cssText = 'padding:16px;text-align:center;font-size:15px;color:#6366f1;';
        document.getElementById(type === 'desktop' ? 'messagesContainer' : 'messagesContainerMobile').appendChild(loader);
    }
    let phrases = [
        "Thinking deeply...",
        "Analyzing your message...",
        "Consulting AI wisdom...",
        "Almost ready...",
        "Reviewing your document..."
    ];
    let idx = 0;
    loader.textContent = phrases[idx];
    loader._interval = setInterval(() => {
        idx = (idx + 1) % phrases.length;
        loader.textContent = phrases[idx];
    }, 1000);
}
function hideChatLoader(type) {
    let loader = document.getElementById(type === 'desktop' ? 'chat-loader' : 'chat-loader-mobile');
    if (loader) {
        clearInterval(loader._interval);
        loader.remove();
    }
}

async function getSmartPlanIfNeeded(documentId) {
    // Only for connected docs
    const doc = await fetchDocument(documentId);
    if (!doc || doc.sourceType !== "response" || !doc.eventId) return null;
    // Use your getSmartPlan helper
    return await getSmartPlan(doc.eventId);
}



let desktopContext = "";

// Show context modal
async function showContextModal() {
  let modal = document.getElementById('context-modal');
  if (modal) modal.remove();

  const documentId = getDocumentIdFromUrl();

  fetchDocument(documentId).then(async (docData) => {
    let isConnected = docData && docData.sourceType === "response" && docData.eventId;
    let smartPlan = "";
    let documentContent = docData?.content || "";
    if (isConnected) {
      smartPlan = await getSmartPlan(docData.eventId) || "";
    }

    modal = document.createElement('div');
    modal.id = 'context-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.45)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '99999';

    // Modern selector
    modal.innerHTML = `
  <div style="
    background: #111317;
    padding: 32px 28px;
    border-radius: 20px;
    max-width: 400px;
    width: 95vw;
    color: #F3F4F6;
    border: 1.5px solid #2B2F36;
    font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(6px);
  ">
    <div style="
      font-size: 1.35rem;
      font-weight: 700;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: #FACC15;
    ">
      🧠 <span style="color: #F3F4F6;">Attach Context for AI</span>
    </div>

    <div style="margin-bottom: 20px;">
      <div style="
        font-size: 1rem;
        font-weight: 500;
        margin-bottom: 12px;
        color: #D1D5DB;
      ">
        Choose what to attach:
      </div>
      <div id="context-selector" style="
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      ">
        <button class="context-select-btn" data-value="none" style="
          background: #1F2937;
          border: 1px solid #374151;
          color: #E5E7EB;
          padding: 10px 16px;
          border-radius: 8px;
          font-weight: 500;
          font-size: 0.95rem;
          flex-grow: 1;
          text-align: center;
        ">None</button>
        <button class="context-select-btn" data-value="doc" style="
          background: #1F2937;
          border: 1px solid #374151;
          color: #E5E7EB;
          padding: 10px 16px;
          border-radius: 8px;
          font-weight: 500;
          font-size: 0.95rem;
          flex-grow: 1;
          text-align: center;
        ">Document</button>
        ${isConnected ? `<button class="context-select-btn" data-value="smart" style="
          background: #1F2937;
          border: 1px solid #374151;
          color: #E5E7EB;
          padding: 10px 16px;
          border-radius: 8px;
          font-weight: 500;
          font-size: 0.95rem;
          flex-grow: 1;
          text-align: center;
        ">Smart Plan</button>` : ""}
        ${isConnected ? `<button class="context-select-btn" data-value="both" style="
          background: #1F2937;
          border: 1px solid #374151;
          color: #E5E7EB;
          padding: 10px 16px;
          border-radius: 8px;
          font-weight: 500;
          font-size: 0.95rem;
          flex-grow: 1;
          text-align: center;
        ">Both</button>` : ""}
      </div>
    </div>

    <div id="context-preview" class="context-modal-preview" style="
      display: none;
      padding: 12px;
      background: #1E2026;
      border: 1px solid #2F333C;
      border-radius: 8px;
      margin-bottom: 18px;
      color: #D1D5DB;
      font-size: 0.95rem;
    "></div>

    <div style="
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      margin-top: 10px;
    ">
      <button id="save-context-btn" style="
        padding: 10px 20px;
        background: #2563eb;
        color: #ffffff;
        border: none;
        border-radius: 10px;
        font-size: 1rem;
        font-weight: 600;
        text-align: center;
        cursor: pointer;
      ">Save</button>
      <button id="cancel-context-btn" style="
        padding: 10px 20px;
        background: #1C1F25;
        color: #E5E7EB;
        border: 1.5px solid #2F333C;
        border-radius: 10px;
        font-size: 1rem;
        font-weight: 500;
        text-align: center;
        cursor: pointer;
      ">Cancel</button>
    </div>
  </div>
`;

    document.body.appendChild(modal);

    // Selector logic
    let selected = "none";
    let contextValue = "";
    const selectorBtns = modal.querySelectorAll('.context-select-btn');
    const preview = modal.querySelector('#context-preview');
    function updatePreview() {
      let val = selected;
      let previewText = "";
      if (val === "doc") {
        previewText = `<b style="color:#60a5fa;">Document Content:</b><br><span>${documentContent ? documentContent.substring(0, 400) : "<i>No content</i>"}</span>`;
        contextValue = `DOCUMENT CONTENT:\n${documentContent}`;
      } else if (val === "smart") {
        previewText = `<b style="color:#fbbf24;">Smart Plan:</b><br><span>Smart Plan context will be attached.</span>`;
        contextValue = `SMART PLAN:\n${typeof smartPlan === "string" ? smartPlan : JSON.stringify(smartPlan, null, 2)}`;
      } else if (val === "both") {
        previewText = `<b style="color:#fbbf24;">Smart Plan:</b><br><span>Smart Plan context will be attached.</span><br><br><b style="color:#60a5fa;">Document Content:</b><br><span>${documentContent ? documentContent.substring(0, 200) : "<i>No content</i>"}</span>`;
        contextValue = `SMART PLAN:\n${typeof smartPlan === "string" ? smartPlan : JSON.stringify(smartPlan, null, 2)}\n\nDOCUMENT CONTENT:\n${documentContent}`;
      } else {
        previewText = "<i style='color:#888'>No context will be attached.</i>";
        contextValue = "";
      }
      preview.innerHTML = previewText;
      preview.style.display = "block";
    }
    selectorBtns.forEach(btn => {
      btn.onclick = () => {
        selectorBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selected = btn.getAttribute('data-value');
        updatePreview();
      };
    });
    // Default select "none"
    selectorBtns[0].click();

    modal.querySelector('#save-context-btn').onclick = () => {
      desktopContext = contextValue;
      modal.remove();
      showToast('Context saved!');
      addContextChipToAttachments(selected, 'desktop');
    };
    modal.querySelector('#cancel-context-btn').onclick = () => {
      modal.remove();
    };
  });
}

// Desktop chat: send message

async function sendDesktopMessage() {
  let usageKey = null;
  let usageMsg = '';
  const hasFile = !!window.desktopFilePreview;
  const hasUrl = !!window.desktopUrlPreview;
  const hasContext = !!desktopContext;

  // You need these two lines somewhere above:
const highestModelActive = state.premiumModel === 'gpt-4.1-full';
const premiumChatActive = state.premiumModel === 'gpt-4.1-mini';

if (hasFile || hasUrl) {
  usageKey = 'docFileAndUrlPerDay';
  usageMsg = 'You have reached your daily file/url upload limit for your plan.';
} else if (hasContext) {
  usageKey = 'docContextAttachPerDay';
  usageMsg = 'You have reached your daily context attach limit for your plan.';
} else if (highestModelActive) {
  usageKey = 'docLiveFullPerDay';
  usageMsg = 'You have reached your daily GPT-4.1 (Highest) message limit.';
} else if (premiumChatActive) {
  usageKey = 'docLiveMiniPerDay';
  usageMsg = 'You have reached your daily GPT-4.1 Mini message limit.';
} else {
  usageKey = 'docLiveNanoPerDay';
  usageMsg = 'You have reached your daily chat message limit for this model.';
}

  // Only check usage AFTER validation
  if (usageKey) {
    const allowed = await checkAndUpdateUsage(usageKey);
    if (!allowed) {
      showToast(usageMsg, 'error');
      return;
    }
  }
    if (desktopSendButton.disabled) return;
    showInlineLoader(desktopSendButton, false); // Spinner only
    desktopSendButton.disabled = true;
    const text = desktopMessageTextarea.value.trim();
    const urlPreview = window.desktopUrlPreview;
    const filePreview = window.desktopFilePreview;

    if (!text && !urlPreview && !filePreview) return;

    // Prepare files array
    let files = [];
    if (filePreview) {
        if (filePreview.isImage && filePreview.base64) {
            files.push({
                name: filePreview.name,
                isImage: true,
                base64: filePreview.base64
            });
        } else if (filePreview.name && filePreview.content) {
            files.push({
                name: filePreview.name,
                content: filePreview.content
            });
        }
    }

    // Prepare urls array
    let urls = [];
    if (urlPreview) {
        urls.push({
            url: urlPreview.url,
            content: urlPreview.content
        });
    }

    // Create user message object
    const userMessage = {
        id: Date.now().toString(),
        type: 'user',
        content: text,
        timestamp: new Date(),
        attachment: null
    };

    // Attachments for Firestore
    let attachment = null;
    if (urlPreview) {
        userMessage.attachment = {
            type: 'url',
            data: urlPreview
        };
        attachment = { type: 'url', data: urlPreview };
    } else if (filePreview) {
        userMessage.attachment = {
            type: filePreview.isImage ? 'image' : 'file',
            data: filePreview
        };
        attachment = { type: filePreview.isImage ? 'image' : 'file', data: filePreview };
    }

    desktopMessages.push(userMessage);

    // --- SAVE USER MESSAGE TO FIRESTORE ---
    const documentId = getDocumentIdFromUrl();
    if (documentId && currentHistoryId) {
        await saveChatMessage(documentId, currentHistoryId, "user", text, attachment);
    }
    renderDesktopMessages();

    // Clear inputs and previews
    desktopMessageTextarea.value = '';
    desktopMessageTextarea.style.height = 'auto';
    window.desktopUrlPreview = null;
    window.desktopFilePreview = null;
    removeUrlPreview();
    removeFilePreview();
    updateDesktopSendButton();

    desktopSendButton.disabled = true;

    // Only send last 5 messages as history
    const lastFiveMessages = desktopMessages.slice(-5);
    const userId = getCurrentUserId() || 'demo-user-1';

    // Add event/response info if needed
    let extraInfo = {};
    if (documentId) {
        const info = await getEventAndResponseInfoIfNeeded(documentId);
        if (info) extraInfo = info;
    }

    // Add smart plan and document content to context if available
    let context = desktopContext || "";
    if (extraInfo && extraInfo.eventTitle) {
        context += `\n\nEvent Title: ${extraInfo.eventTitle}`;
    }
    if (extraInfo && extraInfo.eventDescription) {
        context += `\n\nEvent Description: ${extraInfo.eventDescription}`;
    }
    if (extraInfo && extraInfo.responseText) {
        context += `\n\nResponse: ${extraInfo.responseText}`;
    }
    // Optionally, you can add more document context here if needed

    let payload = {
        message: text,
        userId,
        premiumModel: state.premiumModel,
        files: files.length ? files : null,
        urls: urls.length ? urls : null,
        previousAIResponse: previousDesktopAIResponse || null,
        history: lastFiveMessages.map(m => ({
            role: m.type === 'user' ? 'user' : 'assistant',
            content: m.content
        })),
        context: context.trim(),
        ...extraInfo
    };

    previousDesktopAIResponse = null;

    showChatLoader('desktop');

    // Create empty assistant message immediately for streaming
    const aiMessageId = (Date.now() + 1).toString();
    const aiMessage = {
        id: aiMessageId,
        type: 'assistant',
        content: '',
        timestamp: new Date(),
        attachment: null
    };
    desktopMessages.push(aiMessage);
    renderDesktopMessages();

    const messageElement = desktopMessagesContainer.querySelector('.message.assistant:last-child .assistant-message');
    let accumulated = '';
    let firstChunkReceived = false;

    try {
        const response = await fetch('https://my-backend-three-pi.vercel.app/api/editor_chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.body) throw new Error('No response body from AI');

        // --- Detect if response is streaming or not ---
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            // Non-streaming (image): handle as JSON
            const data = await response.json();
            hideChatLoader('desktop');
            hideInlineLoader(desktopSendButton);
            desktopSendButton.disabled = false;
            if (data && data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
                aiMessage.content = data.choices[0].delta.content;
                renderDesktopMessages();
            } else if (data.error) {
                aiMessage.content = `<span style="color:#f87171;">${data.error}</span>`;
                renderDesktopMessages();
            }
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);

            const lines = chunk.split('\n\n');
            for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const data = line.slice(5).trim();

                if (data === '[DONE]') continue;

                // Try to parse JSON
                let deltaContent = '';
                try {
                    const parsed = JSON.parse(data);
                    deltaContent = parsed.choices?.[0]?.delta?.content || '';
                } catch (err) {
                    deltaContent = data;
                }

                if (deltaContent) {
                    accumulated += deltaContent;
                    if (!firstChunkReceived) {
                        hideChatLoader('desktop');
                        firstChunkReceived = true;
                    }
                    if (messageElement) {
                        messageElement.innerHTML = window.md.render(accumulated);
                    }
                }
            }
        }

        aiMessage.content = accumulated;
        if (documentId && currentHistoryId) {
            await saveChatMessage(documentId, currentHistoryId, "assistant", accumulated, null);
        }
        renderDesktopMessages();
    } catch (error) {
        if (messageElement) {
            messageElement.innerHTML = '<span style="color:#f87171;">Error getting AI response.</span>';
        }
    } finally {
        hideChatLoader('desktop');
        hideInlineLoader(desktopSendButton);
        desktopSendButton.disabled = false;
    }
}


async function loadChatForHistory(documentId, historyId) {
    const messages = await fetchChatMessages(documentId, historyId);
    desktopMessages = messages.map(msg => ({
        id: msg.id,
        type: msg.role === "user" ? "user" : "assistant",
        content: msg.content,
        timestamp: new Date(msg.timestamp),
        attachment: msg.attachment || null
    }));
    renderDesktopMessages();
}

// Desktop chat: render messages
function renderDesktopMessages() {
    if (desktopMessages.length === 0) {
        desktopEmptyState.classList.remove('hidden');
        return;
    }
    desktopEmptyState.classList.add('hidden');
    desktopMessagesContainer.innerHTML = desktopMessages.map((message, idx, arr) => {
        const time = message.timestamp.toLocaleTimeString();
        let attachmentHtml = '';
        if (message.attachment) {
            if (message.attachment.type === 'url') {
                attachmentHtml = `
                    <div class="attachment-preview">
                        <div class="attachment-card">
                            <div class="attachment-url">🔗 ${message.attachment.data.url}</div>
                            ${message.attachment.data.content ? `<div class="attachment-content">${message.attachment.data.content.substring(0, 100)}...</div>` : ''}
                        </div>
                    </div>
                `;
            } else if (message.attachment.type === 'image') {
                attachmentHtml = `
                    <div class="attachment-preview">
                        <img src="${message.attachment.data.base64}" alt="Uploaded" class="attachment-image" style="max-width:120px;max-height:120px;display:block;margin-bottom:6px;" />
                        <div class="attachment-url">${message.attachment.data.name}</div>
                    </div>
                `;
            } else if (message.attachment.type === 'file') {
                attachmentHtml = `
                    <div class="attachment-preview">
                        <div class="attachment-card">
                            <div class="attachment-url">📄 ${message.attachment.data.name}</div>
                            ${message.attachment.data.content ? `<div class="attachment-content">${message.attachment.data.content.substring(0, 100)}...</div>` : ''}
                        </div>
                    </div>
                `;
            }
        }
        if (message.type === 'user') {
            return `
                <div class="message user">
                    <div class="message-content">
                        <div class="message-avatar user-avatar">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            </svg>
                        </div>
                        <div class="message-body">
                            ${attachmentHtml}
                            ${message.content ? `<div class="message-bubble user-bubble">${message.content}</div>` : ''}
                            <div class="message-time">${time}</div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Check previous user message for image
            let showPhraseLoader = false;
            if (idx > 0) {
                const prevMsg = arr[idx - 1];
                if (
                    prevMsg.type === 'user' &&
                    prevMsg.attachment &&
                    prevMsg.attachment.type === 'image'
                ) {
                    showPhraseLoader = true;
                }
            }
            return `
                <div class="message assistant">
                    <div class="message-content">
                        <div class="message-avatar assistant-avatar">
                            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2L2 7L12 12L22 7L12 2Z" />
                                <path d="M2 17L12 22L22 17" />
                                <path d="M2 12L12 17L22 12" />
                            </svg>
                        </div>
                        <div class="message-body">
                            ${attachmentHtml}
                            <div class="assistant-message">
                                ${
                                    message.content
                                    ? window.md.render(message.content)
                                    : (
                                        showPhraseLoader
                                        ? `<span class="inline-loader-container">
                                            <span class="inline-loader"></span>
                                            <span class="inline-loader-text" id="chat-inline-loader-text-desktop">Thinking deeply...</span>
                                        </span>`
                                        : `<span class="inline-loader"></span>`
                                    )
                                }
                            </div>
                            <div class="message-time">${time}</div>
                        </div>
                    </div>
                </div>
            `;
        }
    }).join('');
    desktopMessagesContainer.scrollTop = desktopMessagesContainer.scrollHeight;

    // Animate phrase only if loader with phrases is present
    const lastAssistant = desktopMessagesContainer.querySelector('.assistant-message .inline-loader-text#chat-inline-loader-text-desktop');
    if (lastAssistant) {
        let idx = 0;
        const phrases = [
            "Thinking deeply...",
            "Analyzing your message...",
            "Consulting AI wisdom...",
            "Almost ready...",
            "Reviewing your document..."
        ];
        lastAssistant.textContent = phrases[idx];
        if (window._chatInlineLoaderIntervalDesktop) clearInterval(window._chatInlineLoaderIntervalDesktop);
        window._chatInlineLoaderIntervalDesktop = setInterval(() => {
            idx = (idx + 1) % phrases.length;
            lastAssistant.textContent = phrases[idx];
        }, 1000);
    } else {
        if (window._chatInlineLoaderIntervalDesktop) clearInterval(window._chatInlineLoaderIntervalDesktop);
    }
}

// Desktop chat: initialize send button state
updateDesktopSendButton();

function startMobileChat() {
    documentContextSentMobile = false;
    showMobileChat();
    document.getElementById('modern-mobile-chat').classList.remove('hidden');
    // Only set messages if none loaded
    if (mobileMessages.length === 0) {
        const mobileAISuggestion = document.getElementById('mobile-ai-suggestion');
        if (mobileAISuggestion && mobileAISuggestion.innerHTML.trim()) {
            mobileMessages = [{
                id: (Date.now() + 1).toString(),
                type: 'assistant',
                content: mobileAISuggestion.innerText || mobileAISuggestion.textContent,
                timestamp: new Date(),
                attachment: null
            }];
        }
    }
    renderMobileMessages();
}


// Mobile chat state
let mobileMessages = [];
let mobileUrlPreview = null;
let mobileFilePreview = null;
let mobileShowUrlInput = false;

// Mobile chat DOM elements
// Mobile chat DOM elements
const mobileMessagesContainer = document.getElementById('messagesContainerMobile');
const mobileEmptyState = document.getElementById('emptyStateMobile');
const mobileMessageTextarea = document.getElementById('messageTextareaMobile');
const mobileSendButton = document.getElementById('sendButtonMobile');
const mobileUrlPreviewEl = document.getElementById('urlPreviewMobile');
const mobileUrlPreviewText = document.getElementById('urlPreviewTextMobile');
const mobileFilePreviewEl = document.getElementById('filePreviewMobile');
const mobileFilePreviewText = document.getElementById('filePreviewTextMobile');
const mobileFilePreviewImage = document.getElementById('filePreviewImageMobile');
const mobileUrlInputContainer = document.getElementById('urlInputContainerMobile');
const mobileUrlInput = document.getElementById('urlInputMobile');
// Mobile chat: auto-resize textarea
if (mobileMessageTextarea) {
    mobileMessageTextarea.addEventListener('input', function() {
        this.style.height = 'auto';
        const scrollHeight = this.scrollHeight;
        this.style.height = Math.min(scrollHeight, 120) + 'px';
        updateMobileSendButton();
    });

    mobileMessageTextarea.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMobileMessage();
        }
    });
}

if (mobileUrlInput) {
    mobileUrlInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            addMobileUrl();
        }
    });
}

// Mobile chat: update send button state
function updateMobileSendButton() {
    const hasText = mobileMessageTextarea.value.trim();
    const hasAttachment = window.mobileUrlPreview || window.mobileFilePreview;
    mobileSendButton.disabled = !(hasText || hasAttachment);
}

// Mobile chat: toggle URL input
function toggleUrlInputMobile() {
    mobileShowUrlInput = !mobileShowUrlInput;
    mobileUrlInputContainer.classList.toggle('hidden', !mobileShowUrlInput);
    if (mobileShowUrlInput) {
        mobileUrlInput.focus();
    }
}

// Mobile chat: add URL
async function addMobileUrl() {
    const url = mobileUrlInput.value.trim();
    if (!url) return;
    const addBtn = document.getElementById('add-url-btn-mobile');
    if (addBtn) showInlineLoader(addBtn);
    mobileSendButton.disabled = true;

    try {
        const content = await extractUrlText(url);
        window.mobileUrlPreview = { url, content };
        mobileUrlPreviewText.textContent = `🔗 ${url}`;
        mobileUrlPreviewEl.classList.remove('hidden');
        mobileUrlInput.value = '';
        mobileUrlInputContainer.classList.add('hidden');
        mobileShowUrlInput = false;
        updateMobileSendButton();
        showToast('URL Added', 'URL preview has been added to your message.');
    } finally {
        if (addBtn) hideInlineLoader(addBtn);
        mobileSendButton.disabled = false;
    }
}

// Mobile chat: remove URL preview
function removeUrlPreviewMobile() {
    mobileUrlPreview = null;
    mobileUrlPreviewEl.classList.add('hidden');
    updateMobileSendButton();
}

// Mobile chat: handle file upload
async function handleFileUploadMobile(event) {
    const file = event.target.files[0];
    if (!file) return;
    showInlineLoader(mobileSendButton, false);
    mobileSendButton.disabled = true;

    let fileData = null;
    try {
        if (file.type.startsWith('image/')) {
            const base64 = await fileToBase64(file);
            fileData = { name: file.name, isImage: true, base64 };
            mobileFilePreviewImage.src = base64;
            mobileFilePreviewImage.classList.remove('hidden');
            mobileFilePreviewText.textContent = file.name;
        } else if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
            const content = await extractPdfText(file);
            fileData = { name: file.name, content };
            mobileFilePreviewText.textContent = file.name;
            mobileFilePreviewImage.classList.add('hidden');
        } else if (file.name.toLowerCase().endsWith(".docx")) {
            const content = await extractDocxText(file);
            fileData = { name: file.name, content };
            mobileFilePreviewText.textContent = file.name;
            mobileFilePreviewImage.classList.add('hidden');
        } else {
            showToast("Unsupported file type. Only images, PDF, and DOCX are supported.");
            return;
        }
        window.mobileFilePreview = fileData;
        mobileFilePreviewEl.classList.remove('hidden');
        updateMobileSendButton();
        showToast('File Added', `${file.name} has been added to your message.`);
    } finally {
        hideInlineLoader(mobileSendButton);
        event.target.value = '';
        mobileSendButton.disabled = false;
    }
}

// Mobile chat: remove file preview
function removeFilePreviewMobile() {
    window.mobileFilePreview = null;
    mobileFilePreviewEl.classList.add('hidden');
    mobileFilePreviewImage.classList.add('hidden');
    updateMobileSendButton();
}

// --- MOBILE FIRESTORE INTEGRATION ---

// --- Fix: When opening history from sidebar, always show history list ---
document.getElementById('mobile-toggle-history-btn').addEventListener('click', () => {
    showMobileHistory();
});

async function showMobileHistory() {
    // Always reset tab state
    currentMobileTab = 'history';
    mobileTabHistory = ['history'];
    updateMobileTabTitle('Response History');
    showMobileTabNavigation();

    // Hide ALL tab contents except history
    const responseContent = document.getElementById('mobile-response-content');
    const historyContent = document.getElementById('mobile-history-content');
    const chatContent = document.getElementById('mobile-chat-content');
    const mobileChat = document.getElementById('modern-mobile-chat');
    if (responseContent) responseContent.classList.add('hidden');
    if (historyContent) historyContent.classList.remove('hidden');
    if (chatContent) chatContent.classList.add('hidden');
    if (mobileChat) mobileChat.classList.add('hidden'); // <-- This hides the chat overlay

    // Load history items
    const documentId = getDocumentIdFromUrl();
    const historyList = document.getElementById('mobile-history-list');
    if (!documentId || !historyList) return;

    document.getElementById('mobileHistoryLoader').style.display = 'flex';
    let history = await fetchDocumentHistory(documentId);
    document.getElementById('mobileHistoryLoader').style.display = 'none';

    history = history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    if (!history.length) {
        historyList.innerHTML = `<div class="history-item">No history yet.</div>`;
        return;
    }

    historyList.innerHTML = history.map(item => {
        const color = colorMap[item.action] || '#6366f1';
        return `
        <div class="history-item swipeable" data-history-id="${item.id}" data-action="${item.action}">
            <div class="swipe-bg">
                <svg width="32" height="32" fill="none" stroke="#fff" stroke-width="2"><rect width="32" height="32" rx="16" fill="#f87171"/><path d="M10 10l12 12M10 22L22 10"/></svg>
            </div>
            <div class="swipe-content">
                <div style="display:flex;align-items:center;justify-content:space-between;">
                    <span style="font-weight:600;font-size:15px;color:${color};">${item.action.charAt(0).toUpperCase() + item.action.slice(1)} Request</span>
                    <span style="font-size:12px;color:#b3b3b3;">${new Date(item.timestamp).toLocaleString()}</span>
                </div>
                <div style="margin-top:8px;font-size:15px;color:#e5e7eb;line-height:1.5;word-break:break-word;">${getHistoryPreview(item.aiResponse)}</div>
            </div>
        </div>
        `;
    }).join('');

    showToast('Swipe left fully to delete. Tap to open.');


    // Improved swipe/tap logic
    historyList.querySelectorAll('.swipeable').forEach(card => {
        let startX = 0, currentX = 0, dragging = false, deleted = false, wasSwiped = false, swipeActivated = false;
        const swipeContent = card.querySelector('.swipe-content');
        const swipeBg = card.querySelector('.swipe-bg');
        const cardWidth = card.offsetWidth;
        const fullSwipeThreshold = cardWidth * 0.8; // 80% of card width

        card.addEventListener('touchstart', function(e) {
            if (deleted) return;
            dragging = true;
            wasSwiped = false;
            swipeActivated = false;
            startX = e.touches[0].clientX;
            swipeContent.style.transition = 'none';
        });

        card.addEventListener('touchmove', function(e) {
            if (!dragging || deleted) return;
            currentX = e.touches[0].clientX;
            let deltaX = Math.min(0, currentX - startX);
            if (Math.abs(deltaX) > 5) e.preventDefault();
            swipeContent.style.transform = `translateX(${deltaX}px)`;
            swipeBg.style.opacity = Math.min(1, Math.abs(deltaX) / fullSwipeThreshold);
            // Set wasSwiped for any swipe over 10% of card width
            if (Math.abs(deltaX) > cardWidth * 0.1) {
                wasSwiped = true;
                swipeActivated = true;
            }
        });

        card.addEventListener('touchend', async function(e) {
            if (!dragging || deleted) return;
            dragging = false;
            let deltaX = Math.min(0, currentX - startX);
            if (Math.abs(deltaX) > fullSwipeThreshold) {
                // Animate out and delete
                swipeContent.style.transition = 'transform 0.25s cubic-bezier(.4,1.4,.6,1)';
                swipeContent.style.transform = `translateX(-100%)`;
                swipeBg.style.opacity = 1;
                deleted = true;
                setTimeout(async () => {
                    card.style.height = `${card.offsetHeight}px`;
                    card.style.transition = 'height 0.2s, margin 0.2s';
                    card.style.height = '0px';
                    card.style.margin = '0';
                    setTimeout(async () => {
                        card.remove();
                        const historyId = card.getAttribute('data-history-id');
                        await deleteDocumentHistory(documentId, historyId);
                        showToast('History deleted');
                    }, 200);
                }, 200);
            } else {
                // Snap back for any swipe less than 80%
                swipeContent.style.transition = 'transform 0.25s cubic-bezier(.4,1.4,.6,1)';
                swipeContent.style.transform = `translateX(0px)`;
                swipeBg.style.opacity = 0;
                // Prevent click after any swipe
                setTimeout(() => { wasSwiped = false; swipeActivated = false; }, 100);
            }
        });

        // Only open if NOT swiped and NOT deleted and NOT swipeActivated
        swipeContent.addEventListener('click', async function(e) {
            if (dragging || deleted || wasSwiped || swipeActivated) return;
            const historyId = card.getAttribute('data-history-id');
            const actionType = card.getAttribute('data-action');
            await openMobileHistoryItem(historyId, actionType);
        });
    });
}

// Fix: openMobileHistoryItem should NOT show loader, and should hide grammar highlights for non-grammar
async function openMobileHistoryItem(historyId, actionType) {
    // Hide loader if present
    const loading = document.getElementById('mobile-right-panel-loading');
    if (loading) loading.style.display = 'none';

    const documentId = getDocumentIdFromUrl();
    if (!documentId || !historyId) return;
    const item = await fetchHistoryItem(documentId, historyId);
    if (!item) return;
    showMobileTabNavigation();
    currentMobileTab = 'response';
    updateMobileTabTitle('AI Response');
    // Show response content, hide others
    const responseContent = document.getElementById('mobile-response-content');
    const historyContent = document.getElementById('mobile-history-content');
    const chatContent = document.getElementById('mobile-chat-content');
    if (responseContent) responseContent.classList.remove('hidden');
    if (historyContent) historyContent.classList.add('hidden');
    if (chatContent) chatContent.classList.add('hidden');
    // Show AI suggestion
    const suggestion = document.getElementById('mobile-ai-suggestion');
    if (suggestion) suggestion.innerHTML = window.markdownit().render(item.aiResponse || "");
    currentHistoryId = historyId;
    await loadMobileChatForHistory(documentId, historyId);

    // Hide grammar highlights if not grammar
    const grammarHighlights = document.getElementById('mobile-grammar-highlights');
    if (grammarHighlights) {
        if (actionType !== 'grammar') {
            grammarHighlights.style.display = 'none';
        } else {
            grammarHighlights.style.display = '';
        }
    }
}

let mobileContext = "";

// Show context modal for mobile
async function showContextModalMobile() {
  let modal = document.getElementById('context-modal-mobile');
  if (modal) modal.remove();

  const documentId = getDocumentIdFromUrl();

  fetchDocument(documentId).then(async (docData) => {
    let isConnected = docData && docData.sourceType === "response" && docData.eventId;
    let smartPlan = "";
    let documentContent = docData?.content || "";
    if (isConnected) {
      smartPlan = await getSmartPlan(docData.eventId) || "";
    }

    modal = document.createElement('div');
    modal.id = 'context-modal-mobile';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.45)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '99999';

    modal.innerHTML = `
  <div style="
    background: #111317;
    padding: 22px 18px;
    border-radius: 18px;
    max-width: 95vw;
    width: 95vw;
    color: #F3F4F6;
    border: 1.5px solid #2B2F36;
    font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
  ">
    <div style="
      font-size: 1.2rem;
      font-weight: 700;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: #FACC15;
    ">
      🧠 <span style="color: #F3F4F6;">Attach Context for AI</span>
    </div>

    <div style="margin-bottom: 18px;">
      <div style="
        font-size: 1rem;
        font-weight: 500;
        margin-bottom: 10px;
        color: #D1D5DB;
      ">
        Choose what to attach:
      </div>
      <div id="context-selector-mobile" style="
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      ">
        <button class="context-select-btn" data-value="none" style="
          background: #1F2937;
          border: 1px solid #374151;
          color: #E5E7EB;
          padding: 10px 14px;
          border-radius: 8px;
          font-weight: 500;
          font-size: 0.95rem;
          flex: 1;
          text-align: center;
        ">None</button>
        <button class="context-select-btn" data-value="doc" style="
          background: #1F2937;
          border: 1px solid #374151;
          color: #E5E7EB;
          padding: 10px 14px;
          border-radius: 8px;
          font-weight: 500;
          font-size: 0.95rem;
          flex: 1;
          text-align: center;
        ">Document</button>
        ${isConnected ? `<button class="context-select-btn" data-value="smart" style="
          background: #1F2937;
          border: 1px solid #374151;
          color: #E5E7EB;
          padding: 10px 14px;
          border-radius: 8px;
          font-weight: 500;
          font-size: 0.95rem;
          flex: 1;
          text-align: center;
        ">Smart Plan</button>` : ""}
        ${isConnected ? `<button class="context-select-btn" data-value="both" style="
          background: #1F2937;
          border: 1px solid #374151;
          color: #E5E7EB;
          padding: 10px 14px;
          border-radius: 8px;
          font-weight: 500;
          font-size: 0.95rem;
          flex: 1;
          text-align: center;
        ">Both</button>` : ""}
      </div>
    </div>

    <div id="context-preview-mobile" class="context-modal-preview" style="
      display: none;
      padding: 12px;
      background: #1E2026;
      border: 1px solid #2F333C;
      border-radius: 8px;
      margin-bottom: 16px;
      color: #D1D5DB;
      font-size: 0.95rem;
    "></div>

    <div style="
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 10px;
    ">
      <button id="save-context-btn-mobile" style="
        padding: 12px;
        background: #2563eb;
        color: #ffffff;
        border: none;
        border-radius: 10px;
        font-size: 1rem;
        font-weight: 600;
        text-align: center;
      ">Save</button>
      <button id="cancel-context-btn-mobile" style="
        padding: 12px;
        background: #1C1F25;
        color: #E5E7EB;
        border: 1.5px solid #2F333C;
        border-radius: 10px;
        font-size: 1rem;
        font-weight: 500;
        text-align: center;
      ">Cancel</button>
    </div>
  </div>
`;

    document.body.appendChild(modal);

    // Selector logic
    let selected = "none";
    let contextValue = "";
    const selectorBtns = modal.querySelectorAll('.context-select-btn');
    const preview = modal.querySelector('#context-preview-mobile');
    function updatePreview() {
      let val = selected;
      let previewText = "";
      if (val === "doc") {
        previewText = `<b style="color:#60a5fa;">Document Content:</b><br><span>${documentContent ? documentContent.substring(0, 200) : "<i>No content</i>"}</span>`;
        contextValue = `DOCUMENT CONTENT:\n${documentContent}`;
      } else if (val === "smart") {
        previewText = `<b style="color:#fbbf24;">Smart Plan:</b><br><span>Smart Plan context will be attached.</span>`;
        contextValue = `SMART PLAN:\n${typeof smartPlan === "string" ? smartPlan : JSON.stringify(smartPlan, null, 2)}`;
      } else if (val === "both") {
        previewText = `<b style="color:#fbbf24;">Smart Plan:</b><br><span>Smart Plan context will be attached.</span><br><br><b style="color:#60a5fa;">Document Content:</b><br><span>${documentContent ? documentContent.substring(0, 100) : "<i>No content</i>"}</span>`;
        contextValue = `SMART PLAN:\n${typeof smartPlan === "string" ? smartPlan : JSON.stringify(smartPlan, null, 2)}\n\nDOCUMENT CONTENT:\n${documentContent}`;
      } else {
        previewText = "<i style='color:#888'>No context will be attached.</i>";
        contextValue = "";
      }
      preview.innerHTML = previewText;
      preview.style.display = "block";
    }
    selectorBtns.forEach(btn => {
      btn.onclick = () => {
        selectorBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selected = btn.getAttribute('data-value');
        updatePreview();
      };
    });
    // Default select "none"
    selectorBtns[0].click();

    modal.querySelector('#save-context-btn-mobile').onclick = () => {
      mobileContext = contextValue;
      modal.remove();
      showToast('Context saved!');
      addContextChipToAttachments(selected, 'mobile');
    };
    modal.querySelector('#cancel-context-btn-mobile').onclick = () => {
      modal.remove();
    };
  });
}

function addContextChipToAttachments(selected, platform) {
  let row;
  if (platform === 'desktop') {
    row = document.getElementById('context-attachments-row');
  } else {
    row = document.getElementById('context-attachments-row-mobile');
  }
  if (!row) return;
  row.innerHTML = ''; // Only one context at a time
  if (selected === "doc" || selected === "both") {
    row.innerHTML += `
      <span class="context-chip doc">
        <svg width="16" height="16" fill="none" stroke="#fff" stroke-width="2" style="margin-right:4px;">
          <rect x="2" y="4" width="12" height="8" rx="3" fill="#60a5fa"/>
        </svg>
        Document
        <button class="remove-chip" onclick="removeContextChip('${platform}')">&times;</button>
      </span>
    `;
  }
  if (selected === "smart" || selected === "both") {
    row.innerHTML += `
      <span class="context-chip smart">
        <svg width="16" height="16" fill="none" stroke="#fbbf24" stroke-width="2" style="margin-right:4px;">
          <circle cx="8" cy="8" r="7" fill="#fde68a"/>
        </svg>
        Smart Plan
        <button class="remove-chip" onclick="removeContextChip('${platform}')">&times;</button>
      </span>
    `;
  }
}
window.removeContextChip = function(platform) {
  let row;
  if (platform === 'desktop') {
    row = document.getElementById('context-attachments-row');
    desktopContext = "";
  } else {
    row = document.getElementById('context-attachments-row-mobile');
    mobileContext = "";
  }
  if (row) row.innerHTML = '';
};

// Save user and assistant chat messages for mobile
async function sendMobileMessage() {
  let usageKey = null;
  let usageMsg = '';
  const hasFile = !!window.mobileFilePreview;
  const hasUrl = !!window.mobileUrlPreview;
  const hasContext = !!mobileContext;

  // You need these two lines somewhere above:
const highestModelActive = state.premiumModel === 'gpt-4.1-full';
const premiumChatActive = state.premiumModel === 'gpt-4.1-mini';

if (hasFile || hasUrl) {
  usageKey = 'docFileAndUrlPerDay';
  usageMsg = 'You have reached your daily file/url upload limit for your plan.';
} else if (hasContext) {
  usageKey = 'docContextAttachPerDay';
  usageMsg = 'You have reached your daily context attach limit for your plan.';
} else if (highestModelActive) {
  usageKey = 'docLiveFullPerDay';
  usageMsg = 'You have reached your daily GPT-4.1 (Highest) message limit.';
} else if (premiumChatActive) {
  usageKey = 'docLiveMiniPerDay';
  usageMsg = 'You have reached your daily GPT-4.1 Mini message limit.';
} else {
  usageKey = 'docLiveNanoPerDay';
  usageMsg = 'You have reached your daily chat message limit for this model.';
}

  // Only check usage AFTER validation
  if (usageKey) {
    const allowed = await checkAndUpdateUsage(usageKey);
    if (!allowed) {
      showToast(usageMsg, 'error');
      return;
    }
  }
    if (mobileSendButton.disabled) return;
    showInlineLoader(mobileSendButton, false); // Spinner only
    mobileSendButton.disabled = true;
    const text = mobileMessageTextarea.value.trim();
    const urlPreview = window.mobileUrlPreview;
    const filePreview = window.mobileFilePreview;

    if (!text && !urlPreview && !filePreview) return;

    // Prepare files array
    let files = [];
    if (filePreview) {
        if (filePreview.isImage && filePreview.base64) {
            files.push({
                name: filePreview.name,
                isImage: true,
                base64: filePreview.base64
            });
        } else if (filePreview.name && filePreview.content) {
            files.push({
                name: filePreview.name,
                content: filePreview.content
            });
        }
    }

    // Prepare urls array
    let urls = [];
    if (urlPreview) {
        urls.push({
            url: urlPreview.url,
            content: urlPreview.content
        });
    }

    // Create user message object
    const userMessage = {
        id: Date.now().toString(),
        type: 'user',
        content: text,
        timestamp: new Date(),
        attachment: null
    };

    // Attachments for Firestore
    let attachment = null;
    if (urlPreview) {
        userMessage.attachment = {
            type: 'url',
            data: urlPreview
        };
        attachment = { type: 'url', data: urlPreview };
    } else if (filePreview) {
        userMessage.attachment = {
            type: filePreview.isImage ? 'image' : 'file',
            data: filePreview
        };
        attachment = { type: filePreview.isImage ? 'image' : 'file', data: filePreview };
    }

    mobileMessages.push(userMessage);

    // --- SAVE USER MESSAGE TO FIRESTORE ---
    const documentId = getDocumentIdFromUrl();
    if (documentId && currentHistoryId) {
        await saveChatMessage(documentId, currentHistoryId, "user", text, attachment);
    }
    renderMobileMessages();

    // Clear inputs and previews
    mobileMessageTextarea.value = '';
    mobileMessageTextarea.style.height = 'auto';
    window.mobileUrlPreview = null;
    window.mobileFilePreview = null;
    removeUrlPreviewMobile();
    removeFilePreviewMobile();
    updateMobileSendButton();

    mobileSendButton.disabled = true;

    // Only send last 5 messages as history
    const lastFiveMessages = mobileMessages.slice(-5);
    const userId = getCurrentUserId() || 'demo-user-1';

    // Add event/response info if needed
    let extraInfo = {};
    if (documentId) {
        const info = await getEventAndResponseInfoIfNeeded(documentId);
        if (info) extraInfo = info;
    }

    // Add smart plan and document content to context if available
    let context = mobileContext || "";
    if (extraInfo && extraInfo.eventTitle) {
        context += `\n\nEvent Title: ${extraInfo.eventTitle}`;
    }
    if (extraInfo && extraInfo.eventDescription) {
        context += `\n\nEvent Description: ${extraInfo.eventDescription}`;
    }
    if (extraInfo && extraInfo.responseText) {
        context += `\n\nResponse: ${extraInfo.responseText}`;
    }
    // Optionally, you can add more document context here if needed

    let payload = {
        message: text,
        userId,
        premium: premiumChatActive,
    highest: highestModelActive,
        files: files.length ? files : null,
        urls: urls.length ? urls : null,
        previousAIResponse: previousMobileAIResponse || null,
        history: lastFiveMessages.map(m => ({
            role: m.type === 'user' ? 'user' : 'assistant',
            content: m.content
        })),
        context: context.trim(),
        ...extraInfo
    };

    previousMobileAIResponse = null;

    showChatLoader('mobile');

    // Create empty assistant message immediately for streaming
    const aiMessageId = (Date.now() + 1).toString();
    const aiMessage = {
        id: aiMessageId,
        type: 'assistant',
        content: '',
        timestamp: new Date(),
        attachment: null
    };
    mobileMessages.push(aiMessage);
    renderMobileMessages();

    const messageElement = mobileMessagesContainer.querySelector('.message.assistant:last-child .assistant-message');
    let accumulated = '';
    let firstChunkReceived = false;

    try {
        const response = await fetch('https://my-backend-three-pi.vercel.app/api/editor_chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.body) throw new Error('No response body from AI');

        // --- Detect if response is streaming or not ---
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            // Non-streaming (image): handle as JSON
            const data = await response.json();
            hideChatLoader('mobile');
            hideInlineLoader(mobileSendButton);
            mobileSendButton.disabled = false;
            if (data && data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
                aiMessage.content = data.choices[0].delta.content;
                renderMobileMessages();
            } else if (data.error) {
                aiMessage.content = `<span style="color:#f87171;">${data.error}</span>`;
                renderMobileMessages();
            }
            return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);

            const lines = chunk.split('\n\n');
            for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const data = line.slice(5).trim();

                if (data === '[DONE]') continue;

                // Try to parse JSON
                let deltaContent = '';
                try {
                    const parsed = JSON.parse(data);
                    deltaContent = parsed.choices?.[0]?.delta?.content || '';
                } catch (err) {
                    deltaContent = data;
                }

                if (deltaContent) {
                    accumulated += deltaContent;
                    if (!firstChunkReceived) {
                        hideChatLoader('mobile');
                        firstChunkReceived = true;
                    }
                    if (messageElement) {
                        messageElement.innerHTML = window.md.render(accumulated);
                    }
                }
            }
        }

        aiMessage.content = accumulated;
        if (documentId && currentHistoryId) {
            await saveChatMessage(documentId, currentHistoryId, "assistant", accumulated, null);
        }
        renderMobileMessages();
    } catch (error) {
        if (messageElement) {
            messageElement.innerHTML = '<span style="color:#f87171;">Error getting AI response.</span>';
        }
    } finally {
        hideChatLoader('mobile');
        hideInlineLoader(mobileSendButton);
        mobileSendButton.disabled = false;
    }
}

// Load chat messages for a mobile history item
async function loadMobileChatForHistory(documentId, historyId) {
    const messages = await fetchChatMessages(documentId, historyId);
    mobileMessages = messages.map(msg => ({
        id: msg.id,
        type: msg.role === "user" ? "user" : "assistant",
        content: msg.content,
        timestamp: new Date(msg.timestamp),
        attachment: msg.attachment || null
    }));
    renderMobileMessages();
}

// --- END MOBILE FIRESTORE INTEGRATION ---

// --- MOBILE SAVE BUTTON ---
// Add this to your DOMContentLoaded or mobile init:
document.addEventListener('DOMContentLoaded', function() {
    const mobileEditor = document.getElementById('mobile-document-editor');
    const mobileSaveBtn = document.getElementById('mobile-save-btn');
    if (mobileEditor && mobileSaveBtn) {
        mobileEditor.addEventListener('input', () => {
            mobileSaveBtn.style.display = 'block';
        });
        mobileSaveBtn.addEventListener('click', async () => {
            const documentId = getDocumentIdFromUrl();
            if (!documentId) return;
            await updateDocumentContent(documentId, mobileEditor.innerHTML);
            showToast("Document saved!");
            mobileSaveBtn.style.display = 'none';
        });
    }
    const mobileBackToSidebarBtn = document.getElementById('mobile-back-to-sidebar-btn');
    if (mobileBackToSidebarBtn) {
        mobileBackToSidebarBtn.addEventListener('click', () => {
            hideMobileTabNavigation();
            showMobileSidebar();
        });
    }
});

// === DESKTOP AI ACTION BUTTONS WITH LIMIT CHECKS ===
const desktopActionButtons = [
  { id: null, selector: '.ai-action-btn[data-action="feedback"]', usageKey: 'docActionClickPerDay' },
  { id: null, selector: '.ai-action-btn[data-action="grammar"]', usageKey: 'docActionClickPerDay' },
  { id: null, selector: '.ai-action-btn[data-action="rewrite"]', usageKey: 'docActionClickPerDay' },
  { id: null, selector: '.ai-action-btn[data-action="expand"]', usageKey: 'docActionClickPerDay' },
  { id: null, selector: '.ai-action-btn[data-action="simplify"]', usageKey: 'docActionClickPerDay' },
  { id: null, selector: '.ai-action-btn[data-action="tone"]', usageKey: 'docActionClickPerDay' }
];

// Add event listeners for desktop AI action buttons
desktopActionButtons.forEach(({ selector, usageKey }) => {
  document.querySelectorAll(selector).forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const allowed = await checkAndUpdateUsage(usageKey);
      if (!allowed) {
        showToast('You have reached your daily AI action limit for your plan.');
        e.stopImmediatePropagation();
        e.preventDefault();
        return false;
      }
      // Let the normal click handler run
    }, true); // Use capture to run before other listeners
  });
});

// === DESKTOP REWRITE/TONE ADJUSTMENT BUTTONS ===
const desktopRewriteBtns = document.querySelectorAll('#rewrite-adjustments .adjustment-btn');
desktopRewriteBtns.forEach(btn => {
  btn.addEventListener('click', async (e) => {
    const allowed = await checkAndUpdateUsage('docActionClickPerDay');
    if (!allowed) {
      showToast('You have reached your daily AI action limit for your plan.');
      e.stopImmediatePropagation();
      e.preventDefault();
      return false;
    }
    // Let the normal click handler run
  }, true);
});

const desktopToneBtns = document.querySelectorAll('#tone-adjustments .adjustment-btn');
desktopToneBtns.forEach(btn => {
  btn.addEventListener('click', async (e) => {
    const allowed = await checkAndUpdateUsage('docActionClickPerDay');
    if (!allowed) {
      showToast('You have reached your daily AI action limit for your plan.');
      e.stopImmediatePropagation();
      e.preventDefault();
      return false;
    }
    // Let the normal click handler run
  }, true);
});

// === MOBILE AI ACTION BUTTONS WITH LIMIT CHECKS ===
const mobileActionButtons = [
  { id: null, selector: '#mobile-ai-sidebar .ai-action-btn[data-action="feedback"]', usageKey: 'docActionClickPerDay' },
  { id: null, selector: '#mobile-ai-sidebar .ai-action-btn[data-action="grammar"]', usageKey: 'docActionClickPerDay' },
  { id: null, selector: '#mobile-ai-sidebar .ai-action-btn[data-action="rewrite"]', usageKey: 'docActionClickPerDay' },
  { id: null, selector: '#mobile-ai-sidebar .ai-action-btn[data-action="expand"]', usageKey: 'docActionClickPerDay' },
  { id: null, selector: '#mobile-ai-sidebar .ai-action-btn[data-action="simplify"]', usageKey: 'docActionClickPerDay' },
  { id: null, selector: '#mobile-ai-sidebar .ai-action-btn[data-action="tone"]', usageKey: 'docActionClickPerDay' }
];

mobileActionButtons.forEach(({ selector, usageKey }) => {
  document.querySelectorAll(selector).forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const allowed = await checkAndUpdateUsage(usageKey);
      if (!allowed) {
        showToast('You have reached your daily AI action limit for your plan.');
        e.stopImmediatePropagation();
        e.preventDefault();
        return false;
      }
      // Let the normal click handler run
    }, true);
  });
});

// === MOBILE REWRITE/TONE ADJUSTMENT BUTTONS ===
const mobileRewriteBtns = document.querySelectorAll('#mobile-rewrite-adjustments .adjustment-btn');
mobileRewriteBtns.forEach(btn => {
  btn.addEventListener('click', async (e) => {
    const allowed = await checkAndUpdateUsage('docActionClickPerDay');
    if (!allowed) {
      showToast('You have reached your daily AI action limit for your plan.');
      e.stopImmediatePropagation();
      e.preventDefault();
      return false;
    }
    // Let the normal click handler run
  }, true);
});

const mobileToneBtns = document.querySelectorAll('#mobile-tone-adjustments .adjustment-btn');
mobileToneBtns.forEach(btn => {
  btn.addEventListener('click', async (e) => {
    const allowed = await checkAndUpdateUsage('docActionClickPerDay');
    if (!allowed) {
      showToast('You have reached your daily AI action limit for your plan.');
      e.stopImmediatePropagation();
      e.preventDefault();
      return false;
    }
    // Let the normal click handler run
  }, true);
});

document.getElementById('add-context-btn-mobile').addEventListener('click', showContextModalMobile);

// Mobile chat: render messages
function renderMobileMessages() {
    if (mobileMessages.length === 0) {
        mobileEmptyState.classList.remove('hidden');
        return;
    }
    mobileEmptyState.classList.add('hidden');
    mobileMessagesContainer.innerHTML = mobileMessages.map((message, idx, arr) => {
        const time = message.timestamp.toLocaleTimeString();
        let attachmentHtml = '';
        if (message.attachment) {
            if (message.attachment.type === 'url') {
                attachmentHtml = `
                    <div class="attachment-preview">
                        <div class="attachment-card">
                            <div class="attachment-url">🔗 ${message.attachment.data.url}</div>
                            ${message.attachment.data.content ? `<div class="attachment-content">${message.attachment.data.content.substring(0, 100)}...</div>` : ''}
                        </div>
                    </div>
                `;
            } else if (message.attachment.type === 'image') {
                attachmentHtml = `
                    <div class="attachment-preview">
                        <img src="${message.attachment.data.base64}" alt="Uploaded" class="attachment-image" style="max-width:120px;max-height:120px;display:block;margin-bottom:6px;" />
                        <div class="attachment-url">${message.attachment.data.name}</div>
                    </div>
                `;
            } else if (message.attachment.type === 'file') {
                attachmentHtml = `
                    <div class="attachment-preview">
                        <div class="attachment-card">
                            <div class="attachment-url">📄 ${message.attachment.data.name}</div>
                            ${message.attachment.data.content ? `<div class="attachment-content">${message.attachment.data.content.substring(0, 100)}...</div>` : ''}
                        </div>
                    </div>
                `;
            }
        }
        if (message.type === 'user') {
            return `
                <div class="message user">
                    <div class="message-content">
                        <div class="message-avatar user-avatar">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            </svg>
                        </div>
                        <div class="message-body">
                            ${attachmentHtml}
                            ${message.content ? `<div class="message-bubble user-bubble">${message.content}</div>` : ''}
                            <div class="message-time">${time}</div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Check previous user message for image
            let showPhraseLoader = false;
            if (idx > 0) {
                const prevMsg = arr[idx - 1];
                if (
                    prevMsg.type === 'user' &&
                    prevMsg.attachment &&
                    prevMsg.attachment.type === 'image'
                ) {
                    showPhraseLoader = true;
                }
            }
            return `
                <div class="message assistant">
                    <div class="message-content">
                        <div class="message-avatar assistant-avatar">
                            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2L2 7L12 12L22 7L12 2Z" />
                                <path d="M2 17L12 22L22 17" />
                                <path d="M2 12L12 17L22 12" />
                            </svg>
                        </div>
                        <div class="message-body">
                            ${attachmentHtml}
                            <div class="assistant-message">
                                ${
                                    message.content
                                    ? window.md.render(message.content)
                                    : (
                                        showPhraseLoader
                                        ? `<span class="inline-loader-container">
                                            <span class="inline-loader"></span>
                                            <span class="inline-loader-text" id="chat-inline-loader-text-mobile">Thinking deeply...</span>
                                        </span>`
                                        : `<span class="inline-loader"></span>`
                                    )
                                }
                            </div>
                            <div class="message-time">${time}</div>
                        </div>
                    </div>
                </div>
            `;
        }
    }).join('');
    mobileMessagesContainer.scrollTop = mobileMessagesContainer.scrollHeight;

    // Animate phrase only if loader with phrases is present
    const lastAssistant = mobileMessagesContainer.querySelector('.assistant-message .inline-loader-text#chat-inline-loader-text-mobile');
    if (lastAssistant) {
        let idx = 0;
        const phrases = [
            "Thinking deeply...",
            "Analyzing your message...",
            "Consulting AI wisdom...",
            "Almost ready...",
            "Reviewing your document..."
        ];
        lastAssistant.textContent = phrases[idx];
        if (window._chatInlineLoaderIntervalMobile) clearInterval(window._chatInlineLoaderIntervalMobile);
        window._chatInlineLoaderIntervalMobile = setInterval(() => {
            idx = (idx + 1) % phrases.length;
            lastAssistant.textContent = phrases[idx];
        }, 1000);
    } else {
        if (window._chatInlineLoaderIntervalMobile) clearInterval(window._chatInlineLoaderIntervalMobile);
    }
}

// Mobile chat: initialize send button state
updateMobileSendButton();


// Download functionality
function initializeDownload() {
    const downloadBtn = document.getElementById('download-btn');
    const mobileDownloadBtn = document.getElementById('mobile-download-btn');
    
    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadDocument);
    }
    
    if (mobileDownloadBtn) {
        mobileDownloadBtn.addEventListener('click', downloadDocument);
    }
}

function downloadDocument() {
    // Get content from the appropriate editor
    const desktopEditor = document.getElementById('document-editor');
    const mobileEditor = document.getElementById('mobile-document-editor');
    
    let content = '';
    if (window.innerWidth >= 1024 && desktopEditor) {
        content = desktopEditor.innerHTML;
    } else if (mobileEditor) {
        content = mobileEditor.innerHTML;
    }
    
    // Create a simple HTML document
    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Document</title>
            <style>
                body { font-family: Georgia, serif; line-height: 1.6; margin: 40px; }
                p { margin-bottom: 16px; }
            </style>
        </head>
        <body>
            ${content}
        </body>
        </html>
    `;
    
    // Create and download file
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}



function showToast(message) {
    let toast = document.getElementById('ai-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'ai-toast';
        toast.style.position = 'fixed';
        toast.style.bottom = '32px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.background = '#111827';
        toast.style.color = '#fff';
        toast.style.padding = '12px 24px';
        toast.style.borderRadius = '8px';
        toast.style.fontSize = '15px';
        toast.style.zIndex = 9999;
        toast.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 2000);
}

const premiumModels = [
  { key: 'nano', label: 'Nano', desc: 'Fast, basic answers', toast: 'Nano: Fastest, basic capabilities for quick replies.' },
  { key: 'mini', label: 'Mini', desc: 'Smarter, more accurate', toast: 'Mini: Smarter, more accurate answers with better reasoning.' },
  { key: 'full', label: 'Full', desc: 'Best, advanced GPT-4.1', toast: 'Full: Most advanced, best reasoning and creativity (GPT-4.1).' }
];
let premiumIdx = 0;
let state = { premiumModel: 'gpt-4.1-nano' };

function updatePremiumBtn(btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  const model = premiumModels[premiumIdx];
  btn.classList.remove('nano', 'mini', 'full');
  btn.classList.add(model.key);
  btn.querySelector('.premium-label').textContent = model.label;
  // Remove description and tooltip
  const desc = btn.querySelector('.premium-desc');
  if (desc) desc.style.display = 'none';
  const tooltip = btn.querySelector('.premium-tooltip');
  if (tooltip) tooltip.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('premiumChatBtn');
  if (btn) {
    btn.onclick = () => {
      premiumIdx = (premiumIdx + 1) % premiumModels.length;
      updatePremiumBtn('premiumChatBtn');
      state.premiumModel = (
        premiumModels[premiumIdx].key === 'nano' ? 'gpt-4.1-nano' :
        premiumModels[premiumIdx].key === 'mini' ? 'gpt-4.1-mini' :
        'gpt-4.1-full'
      );
    };
    updatePremiumBtn('premiumChatBtn');
  }
  const btnMobile = document.getElementById('premiumChatBtnMobile');
  if (btnMobile) {
    btnMobile.onclick = () => {
      premiumIdx = (premiumIdx + 1) % premiumModels.length;
      updatePremiumBtn('premiumChatBtnMobile');
      state.premiumModel = (
        premiumModels[premiumIdx].key === 'nano' ? 'gpt-4.1-nano' :
        premiumModels[premiumIdx].key === 'mini' ? 'gpt-4.1-mini' :
        'gpt-4.1-full'
      );
    };
    updatePremiumBtn('premiumChatBtnMobile');
  }
});

// Re-initialize swipe navigation on window resize
window.addEventListener('resize', () => {
    initializeSwipeNavigation();
});
