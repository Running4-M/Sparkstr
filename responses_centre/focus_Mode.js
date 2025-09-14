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
  markSmartPlanCompleted,
  getSmartPlanMessageCount
} from "../backend/firebase.js";
import { showChatInterface } from "./SmartChat.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

// Application state
let currentStep = 0;
let steps = [];
let eventData = null;

function showFocusHelpLoader() {
  const loader = document.getElementById('focus-help-loader');
  if (loader) loader.style.display = 'flex';
}
function hideFocusHelpLoader() {
  const loader = document.getElementById('focus-help-loader');
  if (loader) loader.style.display = 'none';
}

// Update the existing modalStyles
const modalStyles = document.createElement('style');
modalStyles.textContent = `
  @keyframes scaleIn {
    from { 
      opacity: 0; 
      transform: scale(0.95); 
    }
    to { 
      opacity: 1; 
      transform: scale(1); 
    }
  }
  .animate-scale-in {
    animation: scaleIn 0.2s ease-out;
    transition: opacity 0.2s ease-out;
  }
  #completion-modal {
    display: none;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.2s ease-out, visibility 0.2s ease-out;
  }
  #completion-modal.active {
    display: flex;
    opacity: 1;
    visibility: visible;
  }
`;
document.head.appendChild(modalStyles);

function insertBackButton() {
    const container = document.querySelector('.container');
    if (!container) return;
    let backBtn = document.getElementById('focus-back-btn');
    if (backBtn) return; // Already exists

    backBtn = document.createElement('button');
    backBtn.id = 'focus-back-btn';
    backBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.5rem;">
          <path d="M15 18L9 12l6-6"></path>
        </svg>
        <span>Back to Response View</span>
    `;
    backBtn.style.display = 'flex';
    backBtn.style.alignItems = 'center';
    backBtn.style.gap = '0.5rem';
    backBtn.style.background = 'rgba(156,118,255,0.12)';
    backBtn.style.color = '#a78bfa';
    backBtn.style.border = 'none';
    backBtn.style.borderRadius = '9999px';
    backBtn.style.padding = '0.5rem 1.25rem';
    backBtn.style.fontSize = '1rem';
    backBtn.style.fontWeight = '600';
    backBtn.style.cursor = 'pointer';
    backBtn.style.marginBottom = '1.5rem';

    // Pass eventId as a query param so Responses.html can open the correct response
    const eventId = getEventIdFromUrl();
    backBtn.onclick = () => {
        window.location.href = `/Responses.html?eventId=${encodeURIComponent(eventId)}`;
    };

    container.prepend(backBtn);
}


// Add near the top of the file
function showToast(message) {
  // Create toast element
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in';
  toast.textContent = message;
  
  // Add to document
  document.body.appendChild(toast);
  
  // Remove after 3 seconds
  setTimeout(() => {
    toast.classList.add('animate-fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Add required CSS animations
const toastStyles = document.createElement('style');
toastStyles.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(1rem); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeOut {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(1rem); }
  }
  .animate-fade-in {
    animation: fadeIn 0.3s ease-out;
  }
  .animate-fade-out {
    animation: fadeOut 0.3s ease-out;
  }
`;
document.head.appendChild(toastStyles);




// Update createStepsFromEventData function
function createStepsFromEventData(data) {
  const smartPlan = data.smartPlan;
  // Use stepProgress if available, fallback to progress
  const rawProgress = Array.isArray(smartPlan?.stepProgress)
    ? smartPlan.stepProgress
    : Array.isArray(smartPlan?.progress)
      ? smartPlan.progress
      : [];

  return smartPlan.steps.map((step, index) => ({
    id: index + 1,
    title: step.title || step.description,
    duration: step.duration || '10 mins',
    description: step.description,
    goals: step.goals || [],
    microGoal: step.microGoal,
    managementNote: step.managementNote,
    tip: step.tip,
    isCompleted: rawProgress[index] === true,
    number: index + 1,
    isBreak: step.isBreak === true
  }));
}



// Update init function 
async function init() {
  try {
    // Show loading state
    document.body.classList.add('loading');

    // Initialize Firebase and get user ID
    await initializeFirebase();
    const userId = await getCurrentUserId();
    
    if (!userId) {
      throw new Error('No user authenticated');
    }

    // Fetch event data
    eventData = await fetchEventData();

    const eventTitleEl = document.getElementById('event-title');
if (eventTitleEl && eventData.eventTitle) {
  eventTitleEl.textContent = eventData.eventTitle;
}
    await fillFocusHeaderInfo();
    // Create steps from event data
    steps = createStepsFromEventData(eventData);

// Set currentStep to first incomplete step (or last if all complete)
const firstIncomplete = steps.findIndex(step => !step.isCompleted);
currentStep = firstIncomplete !== -1 ? firstIncomplete : steps.length - 1;

    // Update UI
    updateProgressTracker();
    updateStepCard();
    updateHeader();
    updateActionButtons();
    
    // Add event listeners
    setupEventListeners();

    // Remove loading state
    document.body.classList.remove('loading');

    insertBackButton();
    
  } catch (error) {
    console.error('Error initializing focus mode:', error);
    showToast('Error loading focus mode');
    
    // Redirect to main page if authentication fails
    if (error.message === 'No user authenticated') {
      window.location.href = '/index.html';
    }
  }
}

// Add loading styles
const style = document.createElement('style');
style.textContent = `
  body.loading::before {
    content: '';
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  body.loading::after {
    content: '';
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 40px;
    height: 40px;
    border: 3px solid rgba(156, 118, 255, 0.3);
    border-radius: 50%;
    border-top-color: rgb(156, 118, 255);
    animation: spin 1s linear infinite;
    z-index: 10000;
  }

  @keyframes spin {
    to { transform: translate(-50%, -50%) rotate(360deg); }
  }
`;
document.head.appendChild(style);

// Remove the second setupEventListeners function and update the first one
function setupEventListeners() {
  // Get all required elements
  const elements = {
    doneBtn: document.getElementById('done-btn'),
    skipBtn: document.getElementById('skip-btn'),
    helpBtn: document.getElementById('help-btn'),
    closeModalBtn: document.getElementById('close-modal'),
    continueBtn: document.getElementById('continue-btn'),
    // Remove summaryBtn since it's not in the HTML
  };

  // Check each element exists and log warning if missing
  Object.entries(elements).forEach(([name, element]) => {
    if (!element) {
      console.warn(`Missing element: ${name}`);
      return;
    }
  });

  // Only add listeners if elements exist
  if (elements.doneBtn) elements.doneBtn.addEventListener('click', handleDone);
  if (elements.skipBtn) elements.skipBtn.addEventListener('click', handleSkip);
  if (elements.closeModalBtn) elements.closeModalBtn.addEventListener('click', closeModal);
  if (elements.continueBtn) elements.continueBtn.addEventListener('click', closeModal);
  if (elements.closeModalBtn) elements.closeModalBtn.addEventListener('click', hideModalOnly);
  if (elements.continueBtn) elements.continueBtn.addEventListener('click', closeModal);
  // Add click handler to close modal when clicking outside
  completionModal?.addEventListener('click', (e) => {
    if (e.target === completionModal) {
      closeModal();
    }
  });
}

async function fillFocusHeaderInfo() {
  try {
    const data = await fetchEventData();
    const smartPlan = data.smartPlan || {};
    const stepsArr = Array.isArray(smartPlan.steps) ? smartPlan.steps : [];
    // Use stepProgress from Firebase, fallback to progress if missing
    const stepProgressArr = Array.isArray(smartPlan.stepProgress)
      ? smartPlan.stepProgress
      : Array.isArray(smartPlan.progress)
        ? smartPlan.progress
        : [];
    const totalSteps = stepsArr.length;
    const completedSteps = stepProgressArr.filter(Boolean).length;

    // Priority
    let priority = smartPlan.priority || data.priority || "Normal";
    if (priority === "none") priority = "Normal";

    // Total time: sum all durations (number, in minutes)
    let totalTime = 0;
    for (const step of stepsArr) {
      let dur = step.duration;
      if (typeof dur === "string") dur = parseInt(dur, 10);
      if (!isNaN(dur)) totalTime += dur;
    }
    const totalTimeStr = `${totalTime} mins`;

    // Update DOM
    document.getElementById('completed-steps').textContent = completedSteps;
    document.getElementById('total-steps').textContent = totalSteps;

    // Update info bar (the "30 mins • Focus Priority" text)
    const infoDivs = document.querySelectorAll('.flex.items-center.justify-center.gap-6.text-purple-200 > div');
    if (infoDivs.length > 0) {
      infoDivs[0].querySelector('span.text-sm').textContent = `${totalTimeStr} • ${priority} Priority`;
    }
  } catch (err) {
    console.error('Failed to fill focus header info:', err);
  }
}


// Mock data
const mockSteps = [
    {
        id: 1,
        title: "Outline main topics and gather key visuals for the presentation",
        duration: "10 mins",
        description: "Prioritize key points to maximize impact within limited time",
        goals: [
            "Use bullet points to organize ideas quickly",
            "Ensure clarity and relevance of content"
        ],
        microGoal: "Complete a rough outline with visuals",
        isCompleted: false
    },
    {
        id: 2,
        title: "Practice delivery, focusing on clarity and timing",
        duration: "10 mins", 
        description: "Record a quick run-through to identify improvements",
        goals: [
            "Record a quick run-through to identify improvements",
            "Refine your speaking points and pacing"
        ],
        microGoal: "Deliver a confident 5-minute rehearsal",
        isCompleted: false
    },
    {
        id: 3,
        title: "Deliver the presentation confidently, practicing delivery and engagement",
        duration: "10 mins",
        description: "Focus on maintaining eye contact and engaging your audience",
        goals: [
            "Maintain eye contact and use visuals effectively", 
            "Stay within time limit and engage audience"
        ],
        microGoal: "Complete presentation successfully",
        isCompleted: false
    }
];

// DOM elements
const completedStepsEl = document.getElementById('completed-steps');
const totalStepsEl = document.getElementById('total-steps');
const progressLineEl = document.getElementById('progress-line');
const progressStepsEl = document.getElementById('progress-steps');
const stepCardEl = document.getElementById('step-card');
const doneBtn = document.getElementById('done-btn');
const skipBtn = document.getElementById('skip-btn');
const helpBtn = document.getElementById('help-btn');
const doneTextEl = document.getElementById('done-text');
const completionModal = document.getElementById('completion-modal');
const closeModalBtn = document.getElementById('close-modal');
const continueBtn = document.getElementById('continue-btn');
const summaryBtn = document.getElementById('summary-btn');
const modalCompletedEl = document.getElementById('modal-completed');
const modalTotalEl = document.getElementById('modal-total');
const completionRateEl = document.getElementById('completion-rate');



function updateHeader() {
    const completedSteps = steps.filter(step => step.isCompleted).length;
    completedStepsEl.textContent = completedSteps;
    totalStepsEl.textContent = steps.length;
}

function getStepWindowSize() {
  if (window.innerWidth <= 600) return 4; // Mobile
  return 10; // Desktop
}

// Track the first visible step in the progress bar
let stepWindowStart = 0;

function animateProgressBar() {
  progressStepsEl.classList.add('fade-progress');
  setTimeout(() => progressStepsEl.classList.remove('fade-progress'), 350);
}

// Add this CSS:
const fadeProgressStyle = document.createElement('style');
fadeProgressStyle.textContent = `
  #progress-steps.fade-progress {
    opacity: 0.5;
    transition: opacity 0.35s cubic-bezier(.4,2,.6,1);
  }
  .current-step-accent {
    border-width: 5px !important;
    border-color: #facc15 !important; /* yellow-400 */
    box-shadow: 0 0 0 4px #fde68a, 0 0 16px 4px #facc15aa;
    z-index: 20;
    position: relative;
    transition: box-shadow 0.3s, border-color 0.3s;
  }
`;
document.head.appendChild(fadeProgressStyle);

async function updateProgressTracker() {
  try {
    eventData = await fetchEventData();
    const stepProgress = Array.isArray(eventData.smartPlan?.stepProgress)
      ? eventData.smartPlan.stepProgress
      : (eventData.smartPlan?.progress || []);
    // Sync local steps with Firebase progress
    steps.forEach((step, idx) => {
      step.isCompleted = !!stepProgress[idx];
    });
  } catch (e) {
    showToast("Could not sync progress from cloud.");
  }

  const windowSize = getStepWindowSize();

  progressStepsEl.innerHTML = '';

  // Left arrow
  if (stepWindowStart > 0) {
    const leftArrow = document.createElement('button');
    leftArrow.className = 'progress-arrow left';
    leftArrow.innerHTML = `<span style="font-size:2rem;color:#a78bfa;">&#8592;</span>`;
    leftArrow.onclick = () => {
      animateProgressBar(); // Animate only when paging
      stepWindowStart = Math.max(stepWindowStart - windowSize, 0);
      updateProgressTracker();
    };
    progressStepsEl.appendChild(leftArrow);
  }


  // Render visible steps
  for (let i = stepWindowStart; i < Math.min(stepWindowStart + windowSize, steps.length); i++) {
  const step = steps[i];
  const stepButton = document.createElement('button');
  stepButton.className = 'relative z-10 group transition-all duration-300';
  stepButton.onclick = () => setCurrentStep(i);

  const stepCircle = document.createElement('div');

  if (step.isBreak) {
    // Break step: always break style, accent only if current
    stepCircle.removeAttribute('class');
    Object.assign(stepCircle.style, {
      background: 'linear-gradient(90deg, #2d2a1f 0%, #e0aa3e33 100%)',
      border: i === currentStep ? '5px dashed #e0aa3e' : '2px dashed #e0aa3e',
      color: '#e0aa3e',
      fontStyle: 'italic',
      width: '3rem',
      height: '3rem',
      borderRadius: '9999px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 'bold',
      fontSize: '1.5rem',
      margin: '0 auto',
      boxShadow: i === currentStep ? '0 0 0 4px #e0aa3e33, 0 0 16px 4px #e0aa3e88' : '0 0 0 4px #e0aa3e33'
    });
    if (i === currentStep) stepCircle.classList.add('current-step-accent');
    stepCircle.innerHTML = `<span title="Break">☕</span>`;
  } else if (step.isCompleted) {
    // Completed: green with tick, accent only if current
    stepCircle.className = 'w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-300 bg-green-500 border-green-400 text-white shadow-lg shadow-green-500/30';
    if (i === currentStep) stepCircle.classList.add('current-step-accent');
    stepCircle.innerHTML = `
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <polyline points="20,6 9,17 4,12"></polyline>
      </svg>
    `;
  } else if (i === currentStep) {
    // Current: yellow + accent
    stepCircle.className = 'w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-300 bg-yellow-400 border-yellow-300 text-purple-900 shadow-lg shadow-yellow-400/40 scale-110 current-step-accent';
    stepCircle.innerHTML = `<span class="font-semibold text-sm">${i + 1}</span>`;
  } else {
    // Future: gray/purple
    stepCircle.className = 'w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-300 bg-purple-800/50 border-purple-600 text-purple-300 hover:border-purple-500';
    stepCircle.innerHTML = `<span class="font-semibold text-sm">${i + 1}</span>`;
  }

  const tooltip = document.createElement('div');
  tooltip.className = 'absolute top-14 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200';
  tooltip.innerHTML = `
    <div class="bg-purple-900/90 backdrop-blur-sm text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap max-w-40 text-center">
      ${step.isBreak ? 'Break (Take a coffee!)' : `Step ${i + 1}`}
    </div>
  `;

  stepButton.appendChild(stepCircle);
  stepButton.appendChild(tooltip);
  progressStepsEl.appendChild(stepButton);
}
  // Right arrow
if (stepWindowStart + windowSize < steps.length) {
    const rightArrow = document.createElement('button');
    rightArrow.className = 'progress-arrow right';
    rightArrow.innerHTML = `<span style="font-size:2rem;color:#a78bfa;">&#8594;</span>`;
    rightArrow.onclick = () => {
      animateProgressBar(); // Animate only when paging
      stepWindowStart = Math.min(
        stepWindowStart + windowSize,
        steps.length - windowSize
      );
      if (stepWindowStart < 0) stepWindowStart = 0;
      updateProgressTracker();
    };
    progressStepsEl.appendChild(rightArrow);
  }
}

// Listen for window resize to update window size dynamically
window.addEventListener('resize', () => {
  updateProgressTracker();
});

function updateStepCard() {
    const step = steps[currentStep];
    const stepNumber = currentStep + 1;

    if (step.isBreak) {
    // Improved break card for Focus Mode: bigger, centered image, transparent bg
    stepCardEl.className = 'break-card animate-fade-in';
    stepCardEl.innerHTML = `
        <div class="break-title" style="font-size:2.5rem;font-weight:900;color:#facc15;margin-bottom:0.5rem;letter-spacing:-1px;">Break Time!</div>
        <div class="break-gif-space" style="width:100%;display:flex;align-items:center;justify-content:center;margin:1.5rem 0;">
            <img src="../gifs/Coffee.gif" alt="Break" loading="lazy"
                style="display:block;width:220px;max-width:90vw;height:auto;object-fit:contain;margin:0 auto;background:transparent;box-shadow:none;border-radius:1.5rem;"/>
        </div>
        <div class="break-desc" style="color:#fde68a;font-size:1.25rem;font-weight:500;margin-bottom:0.5rem;">${step.description || 'Take a short break to recharge and refresh your mind.'}</div>
        <div class="break-duration" style="color:#facc15;font-size:1.2rem;font-weight:700;margin-bottom:0.5rem;">Recommended: ${step.duration} minutes</div>
        ${step.tip ? `<div class="break-tip" style="color:#a78bfa;font-size:1.1rem;margin-bottom:0.25rem;"><strong>💡 Tip:</strong> ${step.tip}</div>` : ''}
        ${step.managementNote ? `<div class="break-note" style="color:#fef9c3;font-size:1.05rem;margin-bottom:0.25rem;"><strong>📝 Note:</strong> ${step.managementNote}</div>` : ''}
        ${step.goals && step.goals.length ? `
            <div class="break-goals" style="color:#bbf7d0;font-size:1.1rem;margin-bottom:0.25rem;">
                <strong>Micro Goals:</strong>
                <ul style="margin:0.5em 0 0 1.2em;padding:0;">
                    ${step.goals.map(goal => `<li style="margin-bottom:0.25em;">${goal}</li>`).join('')}
                </ul>
            </div>
        ` : ''}
        ${step.microGoal ? `<div class="break-goals" style="color:#bbf7d0;font-size:1.1rem;"><strong>Micro Goal:</strong> ${step.microGoal}</div>` : ''}
    `;
    return;
}
    // Normal step rendering
    stepCardEl.className = 'step-card animate-fade-in';
    stepCardEl.innerHTML = `
        <!-- Step header -->
        <div class="step-header mb-6">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 bg-yellow-400 text-purple-900 rounded-full flex items-center justify-center font-bold text-base">
                    ${stepNumber}
                </div>
                <div class="step-time flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12,6 12,12 16,14"></polyline>
                    </svg>
                    <span>${step.duration} minutes</span>
                </div>
            </div>
        </div>

        <!-- Step title -->
        <h2 class="step-title mb-2">${step.title}</h2>

        <!-- Step description -->
        <div class="step-description mb-2">${step.description}</div>

        <!-- Details section -->
        <div class="step-details">
            ${step.goals && step.goals.length ? `
                <div class="step-detail goal">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10"></circle>
                        <circle cx="12" cy="12" r="6"></circle>
                        <circle cx="12" cy="12" r="2"></circle>
                    </svg>
                    <div>
                        <div style="font-weight:600;margin-bottom:0.25rem;">Key Focus Points</div>
                        <ul style="margin:0;padding-left:1.1em;">
                            ${step.goals.map(goal => `<li style="margin-bottom:0.25em;">${goal}</li>`).join('')}
                        </ul>
                    </div>
                </div>
            ` : ''}

            ${step.microGoal ? `
                <div class="step-detail tip">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="m12 2-3.09 6.26L2 9.27l5 4.87L5.82 21 12 17.77 18.18 21 17 14.14l5-4.87-6.91-1.01L12 2z"></path>
                    </svg>
                    <div>
                        <div style="font-weight:600;margin-bottom:0.25rem;">Micro Goal</div>
                        <div>${step.microGoal}</div>
                    </div>
                </div>
            ` : ''}

            ${step.tip ? `
                <div class="step-detail tip">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M13 16h-1v-4h-1m1-4h.01"></path>
                        <circle cx="12" cy="12" r="10"></circle>
                    </svg>
                    <div>
                        <div style="font-weight:600;margin-bottom:0.25rem;">Tip</div>
                        <div>${step.tip}</div>
                    </div>
                </div>
            ` : ''}

            ${step.managementNote ? `
                <div class="step-detail note">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                        <path d="M9 9h6v6H9z"></path>
                    </svg>
                    <div>
                        <div style="font-weight:600;margin-bottom:0.25rem;">Note</div>
                        <div>${step.managementNote}</div>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

function updateActionButtons() {
    const isLastStep = currentStep === steps.length - 1;
    doneTextEl.textContent = isLastStep ? 'Complete' : 'Done';
}

function setCurrentStep(stepIndex) {
    if (stepIndex >= 0 && stepIndex < steps.length) {
        currentStep = stepIndex;
        const windowSize = getStepWindowSize();
        // If selected step is outside the window, scroll window to include it
        if (currentStep < stepWindowStart) {
            stepWindowStart = currentStep;
        } else if (currentStep >= stepWindowStart + windowSize) {
            stepWindowStart = currentStep - windowSize + 1;
            if (stepWindowStart < 0) stepWindowStart = 0;
        }
        updateProgressTracker();
        updateStepCard();
        updateActionButtons();
    }
}

// Update handleDone function


// Fix: Only redirect on "Continue", not on close/cross
// Fix: Only close modal, do NOT redirect or mark completed
function hideModalOnly() {
  completionModal.classList.remove('active');
  setTimeout(() => {
    completionModal.classList.add('hidden');
    // Do NOT redirect or update Firestore here!
  }, 200);
}

// Remove redirect from closeModalBtn
if (closeModalBtn) {
  closeModalBtn.removeEventListener('click', closeModal);
  closeModalBtn.addEventListener('click', hideModalOnly);
}

// Loader for "Complete" button
let doneBtnLoader = null;
async function handleDone() {
  // Show loader in button
  if (doneBtn) {
    doneBtnLoader = document.createElement('span');
    doneBtnLoader.className = 'inline-block loader-circle';
    doneBtnLoader.style.cssText = `
      width: 22px; height: 22px; border-radius: 50%;
      border: 3px solid #a78bfa; border-top: 3px solid #facc15;
      display: inline-block; margin-right: 8px; vertical-align: middle;
      animation: spin 1s linear infinite;
    `;
    doneBtn.innerHTML = '';
    doneBtn.appendChild(doneBtnLoader);
  }

  steps[currentStep].isCompleted = true;
  await updateProgressInFirebase(eventData.smartPlan, steps.map(step => step.isCompleted));
  await updateProgressTracker();
  updateHeader();
  updateActionButtons();

  if (currentStep < steps.length - 1) {
    currentStep++;
    updateStepCard();
    updateActionButtons();
    if (doneBtn) doneBtn.innerHTML = '<span id="done-text">Done</span>';
  } else {
    // Remove loader when modal is shown
    showCompletionModal().then(() => {
      if (doneBtn) doneBtn.innerHTML = '<span id="done-text">Complete</span>';
    });
  }
}

// Make sure closeModal only runs on "Continue" button
if (continueBtn) {
  continueBtn.removeEventListener('click', closeModal); // Remove duplicate
  continueBtn.addEventListener('click', closeModal);
}
if (closeModalBtn) {
  closeModalBtn.removeEventListener('click', closeModal); // Remove redirect
  closeModalBtn.addEventListener('click', hideModalOnly);
}



helpBtn.addEventListener('click', async () => {
  try {
    showFocusHelpLoader(); // <-- Show loader
    // 1) Hide focus‐mode UI and start the “transition to chat” animation-class
    document.querySelector('#focus-mode-section').style.display = 'none';
    document.body.classList.add('transition-to-chat');

    // 2) Show (and initialize) the ChatInterface
    showChatInterface();

    // 3) WAIT until ChatInterface.createHTML() has injected #messagesContainer
    await new Promise((resolve) => {
      const check = () => {
        if (document.getElementById('messagesContainer')) {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });

     hideFocusHelpLoader();

    // 4) Fetch smartPlan & determine current step
    const eventData = await fetchEventData();
    const smartPlan = eventData.smartPlan;
    const progress = smartPlan?.progress || [];
    const idx = progress.findIndex((p) => p === false);
    const stepIndex = currentStep; // Use the actual current step

    // 5) Store smartPlan + currentStep + empty history into chatInterface
    window.chatInterface.smartPlan = smartPlan;
    window.chatInterface.currentStep = stepIndex;
    window.chatInterface.chatHistory = [];

    // 6) Grab eventId via getEventIdFromUrl() and userId via getCurrentUserId()
    const eventId = getEventIdFromUrl();
    if (!eventId) throw new Error("No eventId provided in URL");
    const responseId = eventId;
    const userId = getCurrentUserId();
    if (!userId) {
      console.warn("⚠️ User is not authenticated");
      return;
    }

    // 7) Send the very first prompt (“Hey, I just opened…”) with the new payload shape
    const backendURL = "https://my-backend-three-pi.vercel.app/api/focusMode_chat";
    const firstPayload = {
      smartPlan,
      currentStep: stepIndex,
      message: "Hey, I just opened the Smart Plan chat. Can you guide me?",
      history: [],
      responseId,
      userId,
      firstMessage: true
    };

    const response = await fetch(backendURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(firstPayload),
    });

    if (!response.ok || !response.body) {
      console.warn("❌ Initial AI request failed:", await response.text());
      return;
    }

    // 8) Stream the response exactly as fetchAIResponse does:
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullText = "";
    const messageId = `ai-${Date.now()}`;

    window.chatInterface.messages.push({
      id: messageId,
      text: "",
      isUser: false,
      isTyping: true,
    });
    window.chatInterface.renderMessages();

    const target = document.querySelector(
      `[data-message-id="${messageId}"] .ai-text`
    );
    if (!target) {
      console.warn("⚠️ Could not find .ai-text for the initial prompt.");
      return;
    }

    const readChunk = async () => {
      const { done, value } = await reader.read();
      if (done) {
        window.chatInterface.chatHistory.push({
          role: "assistant",
          content: fullText,
        });
        const idx = window.chatInterface.messages.findIndex(
          (m) => m.id === messageId
        );
        if (idx !== -1) {
          window.chatInterface.messages[idx].isTyping = false;
          window.chatInterface.messages[idx].text = fullText;
        }
        window.chatInterface.renderMessages();
        return;
      }

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6);
        if (payload === "[DONE]") continue;
        let parsed;
        try {
          parsed = JSON.parse(payload);
        } catch (err) {
          console.warn("⚠️ Could not JSON.parse initial chunk:", payload);
          continue;
        }
        const delta = parsed.choices?.[0]?.delta?.content || "";
        if (delta.length > 0) {
          fullText += delta;
          const html = md.render(fullText);
          requestAnimationFrame(() => {
            target.innerHTML = html;
            target
              .querySelectorAll(
                "p, div, ul, ol, table, blockquote, pre, hr, li"
              )
              .forEach((el) => {
                el.style.fontSize = "16px";
                el.style.lineHeight = "1.8";
                el.style.margin = "18px 0";
                el.style.textAlign = "left";
              });
            target.querySelectorAll("li").forEach((li) => {
              li.style.margin = "10px 0";
            });
            target.querySelectorAll("code").forEach((codeEl) => {
              codeEl.style.fontSize = "15px";
              codeEl.style.backgroundColor = "#f0f0f0";
              codeEl.style.padding = "2px 6px";
              codeEl.style.borderRadius = "4px";
              codeEl.style.fontFamily = `
                ui-monospace, SFMono-Regular, SF Mono,
                Menlo, Consolas, Liberation Mono, monospace
              `;
            });
            target.querySelectorAll("pre").forEach((pre) => {
              pre.style.backgroundColor = "#f0f0f0";
              pre.style.padding = "12px";
              pre.style.borderRadius = "6px";
              pre.style.overflowX = "auto";
              pre.style.margin = "18px 0";
            });
            target
              .querySelectorAll("pre code")
              .forEach((block) => Prism.highlightElement(block));
          });
        }
      }
      readChunk();
    };

    readChunk();
    window.chatInterface.hasSentFirstPrompt = true;
  } catch (err) {
    hideFocusHelpLoader();
    console.error("💥 Error setting up initial chat prompt:", err);
  }
});





function handleSkip() {
    if (currentStep < steps.length - 1) {
        currentStep++;
        updateProgressTracker();
        updateStepCard();
        updateActionButtons();
    } else {
        showCompletionModal();
    }
}

async function showCompletionModal() {
  const completedSteps = steps.filter(step => step.isCompleted).length;
  const completionRate = Math.round((completedSteps / steps.length) * 100);

  // Get message count from Firebase
  const responseId = getEventIdFromUrl();
  let messageCount = 0;
  if (responseId) {
    messageCount = await getSmartPlanMessageCount(responseId);
  }

  // Update modal content
  modalCompletedEl.textContent = completedSteps;
  modalTotalEl.textContent = steps.length;
  completionRateEl.textContent = `${completionRate}%`;

  // Add stats to modal (add this block if not present)
  let statsDiv = document.getElementById('completion-stats');
  if (!statsDiv) {
    statsDiv = document.createElement('div');
    statsDiv.id = 'completion-stats';
    statsDiv.style.marginTop = "1.5rem";
    statsDiv.style.textAlign = "center";
    completionModal.querySelector('.text-center.mb-6').appendChild(statsDiv);
  }
  statsDiv.innerHTML = `
    <div style="font-size:1.1rem;color:#fde047;font-weight:600;margin-bottom:0.5rem;">
      Steps Completed: ${completedSteps} / ${steps.length}
    </div>
    <div style="font-size:1.1rem;color:#a78bfa;font-weight:600;">
      Total Messages Exchanged: ${messageCount}
    </div>
  `;

  // Show modal with animation
  completionModal.classList.remove('hidden');
  requestAnimationFrame(() => {
    completionModal.classList.add('active');
  });
}

// Make closeModal only close the modal (no redirect, no Firestore)
async function closeModal() {
  completionModal.classList.remove('active');
  setTimeout(() => {
    completionModal.classList.add('hidden');
  }, 200);
}

// Add a new function for "Continue" button logic
async function handleContinue() {
  completionModal.classList.remove('active');
  setTimeout(async () => {
    completionModal.classList.add('hidden');
    // Mark as completed in Firestore
    await markSmartPlanCompleted();
    // Redirect to Responses.html with eventId
    const eventId = getEventIdFromUrl();
    if (eventId) {
      window.location.href = `/Responses.html?eventId=${encodeURIComponent(eventId)}`;
    } else {
      window.location.href = '/Responses.html';
    }
  }, 200);
}

// Update event listeners
if (closeModalBtn) {
  closeModalBtn.removeEventListener('click', closeModal);
  closeModalBtn.addEventListener('click', closeModal);
}
if (continueBtn) {
  continueBtn.removeEventListener('click', closeModal);
  continueBtn.addEventListener('click', handleContinue);
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', init);