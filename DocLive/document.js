import {
  createDocument,
  fetchDocuments,
  fetchDocument,
  initializeFirebase,
  getCurrentUserId,
  deleteDocument as deleteDocumentFromFirebase,
  firebaseInitPromise,
} from "../backend/firebase.js";
import { createSidebar } from '../sidebar.js'

async function init() {
  try {
    console.log("Starting initialization...");
    
    await initializeFirebase();
    userPlan = await fetchUserPlan();
    console.log("Firebase initialized");
    
  } catch (error) {
    console.error("Error initializing application:", error);
  }
}
firebaseInitPromise.then(() => {
  if (!getCurrentUserId()) {
    window.location.href = "../Login/signup.html";
  }
});
document.addEventListener('DOMContentLoaded', init);

let userPlan = "free";
async function fetchUserPlan() {
  try {
    const { getCurrentUserId, db } = await import("../backend/firebase.js");
    const userId = getCurrentUserId();
    if (!userId) return "free";
    const { getDoc, doc } = await import("https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js");
    const userDoc = await getDoc(doc(db, "users", userId, "settings", "profile"));
    if (userDoc.exists() && userDoc.data().plan) {
      return userDoc.data().plan;
    }
  } catch (e) {}
  return "free";
}

// Document Management Application
class DocumentApp {
    constructor() {
        this.documents = [];

        this.responses = [
        ];

        

        this.selectedResponse = null;
        this.currentDocumentId = null;
        this.sidebarCollapsed = false;
        this.filteredResponses = [...this.responses];

        this.init();
    }

    async loadDocuments() {
    document.getElementById('documentsLoader').style.display = 'flex';
    this.documents = await fetchDocuments();
    document.getElementById('documentsLoader').style.display = 'none';
    this.renderDocuments();
}


async handleRenameDocument() {
    const input = document.getElementById('renameDocumentInput');
    if (!input || !input.value.trim() || !this.currentDocumentId) return;
    const newTitle = input.value.trim();
    const doc = this.documents.find(d => d.id === this.currentDocumentId);
    if (!doc) return;

    try {
        const { updateDocumentTitle } = await import('../backend/firebase.js');
        await updateDocumentTitle(this.currentDocumentId, newTitle);

        doc.title = newTitle;
        doc.name = newTitle;
        this.renderDocuments();
        this.hideRenameModal();
    } catch (err) {
        alert('Failed to rename document. Please try again.');
    }
}

showRenameModal(docId = null) {
    this.hideDocumentMenu();
    if (docId) this.currentDocumentId = docId;
    const modal = document.getElementById('renameModalOverlay');
    const input = document.getElementById('renameDocumentInput');
    const saveBtn = document.getElementById('renameSubmitBtn');
    if (modal && input && saveBtn) {
        modal.style.display = 'flex';
        const doc = this.documents.find(d => d.id === this.currentDocumentId);
        input.value = doc ? (doc.title || doc.name || '') : '';
        input.focus();
        saveBtn.disabled = !input.value.trim();
        input.oninput = () => {
            saveBtn.disabled = !input.value.trim();
        };
    }
}

hideRenameModal() {
    const modal = document.getElementById('renameModalOverlay');
    const input = document.getElementById('renameDocumentInput');
    if (modal && input) {
        modal.style.display = 'none';
        input.value = '';
    }
}

async loadResponsesFromFirebase() {
    const responseList = document.getElementById('responseList');
    if (responseList) {
        responseList.innerHTML = `
            <div id="connectResponsesLoader" style="display:flex;justify-content:center;align-items:center;height:120px;">
                <div class="loader-spinner"></div>
                <div class="loader-label">Loading responses...</div>
            </div>
        `;
    }
    try {
        const { fetchAllResponses } = await import('../backend/firebase.js');
        let responses = await fetchAllResponses();

        // Sort by timestamp (most recent first)
        responses.sort((a, b) => {
            const aTime = new Date(a.timestamp || a.date || 0).getTime();
            const bTime = new Date(b.timestamp || b.date || 0).getTime();
            return bTime - aTime;
        });

        // Map to card format
        this.responses = responses.map(resp => ({
    id: resp.id,
    action: resp.aiTaskType || resp.action || 'AI Response',
    preview: resp.response || resp.smartPlan?.overview || 'No preview available',
    timestamp: resp.timestamp ? new Date(resp.timestamp) : (resp.date ? new Date(resp.date) : new Date()),
    eventTitle: resp.eventTitle || 'Untitled Event',
    date: resp.date || '',
    smartPlan: resp.smartPlan || null,
    eventId: resp.eventId || resp.id // <-- Add this line!
}));

        this.filteredResponses = [...this.responses];
        this.renderResponses();
    } catch (err) {
        console.error('Error loading responses:', err);
        this.responses = [];
        this.filteredResponses = [];
        this.renderResponses();
    }
}



    init() {
        this.initializeEventListeners();
        this.loadDocuments();
        this.renderResponses();
        this.initializeLucideIcons();
    }

    initializeEventListeners() {
        // Sidebar toggle
        const sidebarToggle = document.getElementById('sidebarToggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => this.toggleSidebar());
        }

        // Navigation items
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const path = e.currentTarget.dataset.path;
                this.navigate(path);
            });
        });

        // Action buttons
        const createBtn = document.getElementById('createDocumentBtn');
        const connectBtn = document.getElementById('connectResponseBtn');
        
        if (createBtn) {
            createBtn.addEventListener('click', () => this.showCreateModal());
        }
        
        if (connectBtn) {
  connectBtn.addEventListener('click', async () => {
    // Always fetch latest plan from backend
    const { loadUserSettings } = await import('../backend/firebase.js');
    let plan = "free";
    try {
      const settings = await loadUserSettings();
      plan = settings?.plan || "free";
    } catch (e) {
      plan = "free";
    }
    if (plan !== "basic" && plan !== "pro") {
      showConnectUpgradePopup();
      return;
    }
    this.showConnectModal();
  });
}

const renameSubmitBtn = document.getElementById('renameSubmitBtn');
if (renameSubmitBtn) {
    renameSubmitBtn.onclick = () => {
        this.handleRenameDocument();
    };
}
const renameCancelBtn = document.getElementById('renameCancelBtn');
if (renameCancelBtn) {
    renameCancelBtn.onclick = () => {
        this.hideRenameModal();
    };
}

        // Create document modal
        const createForm = document.getElementById('createDocumentForm');
        const documentNameInput = document.getElementById('documentName');
        const createSubmitBtn = document.getElementById('createSubmitBtn');

        if (createForm) {
            createForm.addEventListener('submit', (e) => this.handleCreateDocument(e));
        }

        if (documentNameInput) {
            documentNameInput.addEventListener('input', (e) => {
                const submitBtn = document.getElementById('createSubmitBtn');
                if (submitBtn) {
                    submitBtn.disabled = !e.target.value.trim();
                }
            });
        }

        // Connect response modal
        const responseSearch = document.getElementById('responseSearch');
        const connectSubmitBtn = document.getElementById('connectSubmitBtn');

        if (responseSearch) {
            responseSearch.addEventListener('input', (e) => this.handleResponseSearch(e));
        }

        if (connectSubmitBtn) {
            connectSubmitBtn.addEventListener('click', () => this.handleConnectResponse());
        }

        // Click outside to close dropdown
const dropdown = document.getElementById('documentDropdown');
if (dropdown) {
    dropdown.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'renameDocumentBtn') {
            if (app && typeof app.showRenameModal === 'function') {
                app.showRenameModal(app.currentDocumentId);
            }
        }
    });
}

        // Click outside to close modals
        const modals = document.querySelectorAll('.modal-overlay');
        modals.forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideAllModals();
                }
            });
        });

        // Escape key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideAllModals();
            }
        });
    }

    initializeLucideIcons() {
        // Initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }



    navigate(path) {
        // Simulate navigation - in a real app, this would use a router
        console.log(`Navigating to: ${path}`);
        
        // Update active state
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.classList.remove('active');
            if (item.dataset.path === path) {
                item.classList.add('active');
            }
        });

        // Handle different routes
        switch (path) {
            case '/documents':
                // Already on documents page
                break;
            case '/calendar':
                alert('Calendar feature coming soon!');
                break;
            case '/chat':
                alert('Chat feature coming soon!');
                break;
            case '/responses':
                alert('Response History feature coming soon!');
                break;
            default:
                console.log('Unknown route:', path);
        }
    }

    renderDocuments() {
        const grid = document.getElementById('documentsGrid');
        const emptyState = document.getElementById('emptyState');
        
        if (!grid || !emptyState) return;

        if (this.documents.length === 0) {
            grid.style.display = 'none';
            emptyState.style.display = 'block';
        } else {
            grid.style.display = 'grid';
            emptyState.style.display = 'none';
            
            grid.innerHTML = this.documents.map(doc => this.createDocumentCard(doc)).join('');
            
            // Add event listeners to document cards
            this.addDocumentCardListeners();
        }
        
        this.initializeLucideIcons();
    }

createDocumentCard(doc) {
    // Calculate word count from HTML content
    const text = doc.content ? doc.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const wordCount = text ? text.split(' ').length : 0;
    // Limit preview to 20 words
    let preview = text ? text.split(' ').slice(0, 20).join(' ') : '';
    if (text && text.split(' ').length > 20) preview += '...';
    return `
        <div class="document-card animate-fade-in" data-doc-id="${doc.id}">
            <div class="card-header">
                <div class="card-title-section">
                    <i data-lucide="file-text" class="card-icon"></i>
                    <h3 class="card-title">${this.escapeHtml(doc.title || doc.name || 'Untitled')}</h3>
                </div>
                <button class="card-menu-button" data-doc-id="${doc.id}" onclick="showDocumentMenu(event, '${doc.id}')">
                    <i data-lucide="more-vertical"></i>
                </button>
            </div>
            <div class="card-content" onclick="openDocument('${doc.id}')">
                <p class="card-description">${preview || 'No content yet...'}</p>
                <div class="card-footer">
                    <div class="card-date">
                        <i data-lucide="clock"></i>
                        <span>${doc.lastModified.toLocaleDateString()}</span>
                    </div>
                    <span class="card-word-count">${wordCount} words</span>
                </div>
            </div>
        </div>
    `;
}

    addDocumentCardListeners() {
        const cards = document.querySelectorAll('.document-card');
        cards.forEach(card => {
            const cardContent = card.querySelector('.card-content');
            if (cardContent) {
                cardContent.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const docId = card.dataset.docId;
this.openDocument(docId);
                });
            }
        });
    }

    showCreateModal() {
        const modal = document.getElementById('createModalOverlay');
        const input = document.getElementById('documentName');
        const submitBtn = document.getElementById('createSubmitBtn');
        
        if (modal && input && submitBtn) {
            modal.style.display = 'flex';
            input.value = '';
            input.focus();
            submitBtn.disabled = true;
        }
    }

    hideCreateModal() {
        const modal = document.getElementById('createModalOverlay');
        const input = document.getElementById('documentName');
        
        if (modal && input) {
            modal.style.display = 'none';
            input.value = '';
        }
    }

async handleCreateDocument(e) {
    e.preventDefault();
    const input = document.getElementById('documentName');
    if (!input || !input.value.trim()) return;
    const name = input.value.trim();
    const userId = getCurrentUserId() || 'demo-user-1';

    // Create in Firestore with userId and title
    const docId = await createDocument(name, "", userId);
    // Optionally, fetch again or just add to local state
    this.documents.unshift({
        id: docId,
        name,
        content: "",
        lastModified: new Date(),
        wordCount: 0
    });
    this.hideCreateModal();
    this.renderDocuments();

    // Navigate to editor with documentId in URL
    window.location.href = `editor.html?documentId=${docId}`;
}

    async showConnectModal() {
    const modal = document.getElementById('connectModalOverlay');
    const searchInput = document.getElementById('responseSearch');
    
    if (modal && searchInput) {
        modal.style.display = 'flex';
        searchInput.value = '';
        searchInput.focus();
        this.selectedResponse = null;
        // Load real responses from Firebase
        await this.loadResponsesFromFirebase();
        this.updateConnectButton();
    }
}

    hideConnectModal() {
        const modal = document.getElementById('connectModalOverlay');
        const searchInput = document.getElementById('responseSearch');
        
        if (modal && searchInput) {
            modal.style.display = 'none';
            searchInput.value = '';
            this.selectedResponse = null;
        }
    }

    handleResponseSearch(e) {
    const searchTerm = e.target.value.toLowerCase();
    this.filteredResponses = this.responses.filter(response =>
        (response.preview && response.preview.toLowerCase().includes(searchTerm)) ||
        (response.action && response.action.toLowerCase().includes(searchTerm)) ||
        (response.eventTitle && response.eventTitle.toLowerCase().includes(searchTerm)) ||
        (response.date && response.date.toLowerCase().includes(searchTerm))
    );
    this.renderResponses();
}

    renderResponses() {
        const responseList = document.getElementById('responseList');
        if (!responseList) return;

        if (this.filteredResponses.length === 0) {
            responseList.innerHTML = `
                <div class="response-empty">
                    <i data-lucide="message-square"></i>
                    <p>No responses found</p>
                </div>
            `;
        } else {
            responseList.innerHTML = `
                <div class="response-list-content">
                    ${this.filteredResponses.map(response => this.createResponseItem(response)).join('')}
                </div>
            `;
            
            this.addResponseListeners();
        }
        
        this.initializeLucideIcons();
    }

createResponseItem(response) {
    const isSelected = this.selectedResponse === response.id;
    // Render preview as HTML using markdown-it
    const previewHtml = window.markdownit().render(response.preview || "");
    return `
        <div class="response-item ${isSelected ? 'selected' : ''}" data-response-id="${response.id}">
            <div class="response-content">
                <i data-lucide="message-square" class="response-icon"></i>
                <div class="response-details">
                    <div class="response-header">
                        <span class="response-title">${this.escapeHtml(response.eventTitle)}</span>
                        <div class="response-time">
                            <i data-lucide="clock"></i>
                            <span>${response.timestamp ? response.timestamp.toLocaleDateString() : ''}</span>
                        </div>
                    </div>
                    <div class="response-preview">${previewHtml}</div>
                </div>
            </div>
        </div>
    `;
}

    addResponseListeners() {
        const responseItems = document.querySelectorAll('.response-item');
        responseItems.forEach(item => {
            item.addEventListener('click', () => {
                const responseId = item.dataset.responseId;
                this.selectResponse(responseId);
            });
        });
    }

    selectResponse(responseId) {
        this.selectedResponse = responseId;
        
        // Update visual selection
        const responseItems = document.querySelectorAll('.response-item');
        responseItems.forEach(item => {
            item.classList.remove('selected');
            if (item.dataset.responseId === responseId) {
                item.classList.add('selected');
            }
        });
        
        this.updateConnectButton();
    }

    updateConnectButton() {
        const connectBtn = document.getElementById('connectSubmitBtn');
        if (connectBtn) {
            connectBtn.disabled = !this.selectedResponse;
        }
    }

async handleConnectResponse() {
    if (!this.selectedResponse) return;
    const selected = this.responses.find(r => r.id === this.selectedResponse);
    if (!selected) return;

    this.hideConnectModal();

    // Only save minimal info
    const userId = getCurrentUserId() || 'demo-user-1';
    const docMeta = {
        title: selected.eventTitle || "Connected Response",
        content: window.markdownit().render(selected.preview || ""),
        userId,
        sourceType: "response",
        responseId: selected.id,
        eventId: selected.eventId || selected.id
    };

    const { createDocument } = await import('../backend/firebase.js');
    const docId = await createDocument(docMeta);

    window.location.href = `editor.html?documentId=${docId}`;
}

openDocument(docId) {
    window.location.href = `editor.html?documentId=${docId}`;
}
    deleteDocument(docId) {
        this.documents = this.documents.filter(doc => doc.id !== docId);
        this.renderDocuments();
        this.hideDocumentMenu();
    }

    navigateToEditor(docId, responseId = null) {
        // Simulate navigation to editor
        let url = `/editor/${docId}`;
        if (responseId) {
            url += `?responseId=${responseId}`;
        }
        
        console.log(`Navigating to editor: ${url}`);
        alert(`Would navigate to editor for document ${docId}${responseId ? ` with response ${responseId}` : ''}`);
    }

    showDocumentMenu(event, docId) {
    event.stopPropagation();
    
    const dropdown = document.getElementById('documentDropdown');
    if (!dropdown) return;
    
    // Set current document ID for menu actions
    this.currentDocumentId = docId;

    // Set the data-doc-id attribute for the Delete button
    const deleteBtn = dropdown.querySelector('.delete-item');
    if (deleteBtn) {
        deleteBtn.setAttribute('data-doc-id', docId);
    }
    
    // Position the dropdown
    const rect = event.target.getBoundingClientRect();
    dropdown.style.display = 'block';
    dropdown.style.left = `${rect.left - dropdown.offsetWidth + rect.width}px`;
    dropdown.style.top = `${rect.bottom + 5}px`;
    
    // Ensure dropdown stays within viewport
    const dropdownRect = dropdown.getBoundingClientRect();
    if (dropdownRect.right > window.innerWidth) {
        dropdown.style.left = `${window.innerWidth - dropdownRect.width - 10}px`;
    }
    if (dropdownRect.bottom > window.innerHeight) {
        dropdown.style.top = `${rect.top - dropdownRect.height - 5}px`;
    }
}

    hideDocumentMenu() {
        const dropdown = document.getElementById('documentDropdown');
        if (dropdown) {
            dropdown.style.display = 'none';
        }
        this.currentDocumentId = null;
    }

    hideAllModals() {
        this.hideCreateModal();
        this.hideConnectModal();
        this.hideDocumentMenu();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global functions for HTML event handlers
let app;

window.showCreateModal = function() {
    app.showCreateModal();
};

window.hideCreateModal= function() {
    app.hideCreateModal();
}

window.showConnectModal= function() {
    app.showConnectModal();
}

window.hideConnectModal= function() {
    app.hideConnectModal();
}

window.showDocumentMenu = function(event, docId) {
    app.showDocumentMenu(event, docId);
};

window.hideRenameModal = function() {
    app.hideRenameModal();
};

window.openDocument= function(docId = null) {
    const id = docId || app.currentDocumentId;
    if (id) {
        app.openDocument(id);
    }
}

window.deleteDocument = function(docId) {
    // Delete from Firestore
    deleteDocumentFromFirebase(docId).then(() => {
        app.documents = app.documents.filter(doc => doc.id !== docId);
        app.renderDocuments();
        app.hideDocumentMenu();
    });
}

function navigateToEditor() {
    console.log('Navigating to editor home');
    alert('Would navigate to editor home page');
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    app = new DocumentApp();
    const sidebarRoot = document.getElementById('sidebar-root');
    if (sidebarRoot) {
        const sidebar = createSidebar();
        sidebarRoot.appendChild(sidebar.getElement());
    }
});

function showConnectUpgradePopup() {
  if (document.getElementById('connect-upgrade-popup')) return;
  const popup = document.createElement('div');
  popup.id = 'connect-upgrade-popup';
  popup.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(30,41,59,0.55);
    z-index: 99999;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  popup.innerHTML = `
    <div style="
      background: #fff;
      border-radius: 18px;
      box-shadow: 0 8px 32px 0 rgba(30,41,59,0.18);
      padding: 38px 32px 32px 32px;
      max-width: 370px;
      width: 90vw;
      text-align: center;
      position: relative;
      animation: fadeInUp 0.25s;
    ">
      <button id="close-connect-upgrade-popup" style="
        position: absolute;
        top: 16px; right: 16px;
        background: none;
        border: none;
        font-size: 22px;
        color: #64748b;
        cursor: pointer;
        transition: color 0.2s;
      " aria-label="Close">&times;</button>
      <div style="font-size: 38px; margin-bottom: 12px;">🔒</div>
      <div style="font-size: 20px; font-weight: 700; color: #1e293b; margin-bottom: 10px;">
        Connect Responses is a Premium Feature
      </div>
      <div style="font-size: 15px; color: #334155; margin-bottom: 18px;">
        Unfortunately, only <b>Basic</b> and <b>Pro</b> plan members can connect responses from the Response Centre and offer extra context when writing in Doc Live.<br><br>
        Upgrade your plan to unlock this productivity boost and make your writing even smarter!
      </div>
      <button id="upgrade-plan-btn" style="
        background: linear-gradient(90deg,#38bdf8, #7c3aed);
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 12px 28px;
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
        margin-bottom: 6px;
        margin-top: 4px;
        box-shadow: 0 2px 8px 0 rgba(30,41,59,0.08);
      ">See Plans</button>
      <div style="font-size: 13px; color: #64748b; margin-top: 10px;">
        We’re here to help you grow. Thank you for being part of our journey! 🚀
      </div>
    </div>
    <style>
      @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(30px);}
        to { opacity: 1; transform: none;}
      }
    </style>
  `;
  document.body.appendChild(popup);
  document.getElementById('close-connect-upgrade-popup').onclick = () => popup.remove();
  document.getElementById('upgrade-plan-btn').onclick = () => {
    popup.remove();
    if (window.sidebar && typeof window.sidebar.openSettings === 'function') {
      window.sidebar.openSettings();
    }
  };
}

// Handle window resize for responsive behavior
window.addEventListener('resize', () => {
    if (app) {
        app.hideDocumentMenu();
    }
});