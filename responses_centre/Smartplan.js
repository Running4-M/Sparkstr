import { getCurrentUserId, db, saveSmartPlan } from '../backend/firebase.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { checkAndUpdateUsage } from '../backend/planUsage.js';

const API_BASE_URL = 'https://my-backend-three-pi.vercel.app';


function showToast(message, duration = 3000) {
  const toastContainer = document.getElementById('toast-container');
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('hidden');
    setTimeout(() => {
      toastContainer.removeChild(toast);
    }, 300);
  }, duration);
}

export async function generateSmartPlan(event) {
  // --- PLAN LIMIT CHECK ---
  const allowed = await checkAndUpdateUsage('smartPlanGenPerDay');
  if (!allowed) {
    showToast('You have reached your daily Smart Plan generation limit for your plan.', 4000);
    throw new Error('You have reached your daily Smart Plan generation limit for your plan.');
  }
  try {
    const userId = getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    // Get event data from Firebase
    const eventRef = doc(db, "users", userId, "events", event.id);
    const eventDoc = await getDoc(eventRef);

    let eventData;
    if (eventDoc.exists()) {
      eventData = eventDoc.data();
    } else {
      // Fallback: try to get from responses collection
      const responseRef = doc(db, "users", userId, "responses", event.id);
      const responseDoc = await getDoc(responseRef);
      if (responseDoc.exists()) {
        eventData = responseDoc.data();
        // Patch: set title/description fields if missing
        eventData.title = eventData.eventTitle || eventData.title || '';
        eventData.description = eventData.eventDescription || eventData.description || '';
        eventData.schedule = eventData.schedule || [];
      } else {
        throw new Error('Event not found in database or responses');
      }
    }
    // Get existing response data
    const responseRef = doc(db, "users", userId, "responses", event.id);
    const responseDoc = await getDoc(responseRef);
    const existingResponse = responseDoc.exists() ? responseDoc.data() : null;
    console.log('Existing Response:', existingResponse);

    // Prepare the payload with all necessary data
    const smartPlanPayload = {
      eventId: event.id,
      title: eventData.title,
      description: eventData.description || '',
      schedule: eventData.schedule || [],
      // Get priority from eventData or fallback to response data or default
      priority: eventData.priority || existingResponse?.priority || 'Medium',
      previousAiResponse: existingResponse?.response || '',
      date: eventData.date,
      type: eventData.type || 'general',
      // Include any additional context from the response
      aiTaskType: existingResponse?.aiTaskType || null
    };

    console.log('Smart Plan Payload:', smartPlanPayload);

    // Make the API call with CORS headers
    const response = await fetch(`${API_BASE_URL}/api/smartPlan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': window.location.origin
      },
      credentials: 'include',
      body: JSON.stringify(smartPlanPayload)
    });

    if (!response.ok) {
      throw new Error(`Failed to generate plan: ${response.status}`);
    }

    const { success, smartPlan, timestamp } = await response.json();

    if (!success || !smartPlan) {
      throw new Error('Invalid response from server');
    }

    // Create the complete plan object with metadata
    const completePlan = {
      ...smartPlan,
      metadata: {
        generatedAt: timestamp,
        eventId: event.id,
        version: '1.0',
        isActive: false,
        progress: 0,
        lastModified: null
      }
    };

    // Save the smart plan to Firebase
    await saveSmartPlan(event.id, completePlan);

    return completePlan;

  } catch (error) {
    console.error('Error generating smart plan:', error);
    throw error;
  }
}

// Helper function to render a smart plan step
export function renderSmartPlanStep(step, index, container) {
  const stepElement = document.createElement('div');
  stepElement.className = `smart-plan-step ${step.isBreak ? 'break-step' : ''}`;
  
  stepElement.innerHTML = `
  <div class="step-header">
    <div class="step-number">${index + 1}</div>
    <div class="step-title">${step.description}</div>
    <div class="step-duration">${step.duration} mins</div>
  </div>
  <div class="step-details">
    <div class="tip">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 16v-4"></path>
        <path d="M12 8h.01"></path>
      </svg>
      <span>${step.tip}</span>
    </div>
    <div class="management-note">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
      </svg>
      <span>${step.managementNote}</span>
    </div>
  </div>
  ${!step.isBreak ? `
    <div class="micro-goal">
      <strong>Micro Goal:</strong> ${step.microGoal}
    </div>
  ` : ''}
`;

  container.appendChild(stepElement);
}

// Add styles for the smart plan
const styles = document.createElement('style');
styles.textContent = `
  .smart-plan-container {
    background: linear-gradient(135deg, rgba(156,118,255,0.10) 0%, rgba(224,170,62,0.10) 100%);
    border-radius: 1.25rem;
    padding: 2.5rem 2rem 2rem 2rem;
    margin-bottom: 2rem;
    box-shadow: 0 4px 32px rgba(156,118,255,0.10);
    border: 1.5px solid rgba(156,118,255,0.13);
    color: #fff;
    max-width: 820px;
    margin-left: auto;
    margin-right: auto;
    position: relative;
  }
  .smart-plan-header {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    margin-bottom: 2rem;
    border-bottom: 1px solid rgba(156,118,255,0.13);
    padding-bottom: 1.25rem;
  }
  .smart-plan-title-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.25rem;
  }
  .smart-plan-title {
    font-size: 2rem;
    font-weight: 800;
    color: #fff;
    margin: 0;
    letter-spacing: -0.01em;
  }
  .smart-plan-meta {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 1rem;
    color: #e0aa3e;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }
  .smart-plan-desc {
    color: #cbd5e1;
    font-size: 1.08rem;
    margin: 0.25rem 0 0 0;
    font-weight: 500;
    line-height: 1.6;
    max-width: 700px;
  }
  @media (max-width: 900px) {
    .smart-plan-container {
      padding: 1.25rem 0.5rem;
      max-width: 98vw;
    }
    .smart-plan-title {
      font-size: 1.3rem;
    }
    .smart-plan-header {
      padding-bottom: 0.75rem;
      margin-bottom: 1rem;
    }
  }
  @media (max-width: 600px) {
    .smart-plan-container {
      padding: 0.5rem 0.25rem;
      border-radius: 0.75rem;
    }
    .smart-plan-title {
      font-size: 1.1rem;
    }
    .smart-plan-header {
      padding-bottom: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .smart-plan-desc {
      font-size: 0.92rem;
    }
  }
    .smart-plan-step {
    background: rgba(255,255,255,0.04);
    border-radius: 1.1rem;
    padding: 1.5rem 1.5rem 1.25rem 1.5rem;
    margin-bottom: 1rem;
    border: 1px solid rgba(156,118,255,0.10);
    box-shadow: 0 2px 12px rgba(156,118,255,0.06);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    transition: background 0.2s;
  }
  .smart-plan-step:not(.break-step):hover {
    background: rgba(224,170,62,0.08);
  }
  .break-step {
    background: linear-gradient(120deg, #a78bfa 0%, #6366f1 100%) !important;
    border: 2px dashed #a78bfa !important;
    color: #fff !important;
    opacity: 0.98 !important;
  }
  .step-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }
  .step-number {
    background: rgba(156,118,255,0.18);
    color: #a78bfa;
    padding: 0.25rem 0.85rem;
    border-radius: 9999px;
    font-weight: 700;
    font-size: 1.1rem;
    margin-right: 0.5rem;
  }
  .step-duration {
    color: #e0aa3e;
    font-size: 1rem;
    font-weight: 600;
  }
  .step-title {
    color: #fff;
    font-size: 1.15rem;
    font-weight: 700;
    margin-bottom: 0.25rem;
    line-height: 1.4;
  }
  .step-details {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    color: #cbd5e1;
    font-size: 0.98rem;
    margin-bottom: 0.25rem;
  }
  .tip, .management-note {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    background: rgba(156,118,255,0.07);
    border-radius: 0.5rem;
    padding: 0.5rem 0.75rem;
    font-size: 0.95rem;
    color: #a78bfa;
  }
  .tip svg, .management-note svg {
    min-width: 16px;
    min-height: 16px;
    color: #e0aa3e;
  }
  .micro-goal {
    margin-top: 0.5rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    background: rgba(224,170,62,0.08);
    color: #e0aa3e;
    font-size: 0.98rem;
    font-weight: 600;
  }
  .micro-goal strong {
    color: #e0aa3e;
  }
  @media (max-width: 900px) {
    .smart-plan-step {
      padding: 1rem 0.75rem;
      font-size: 0.98rem;
    }
    .step-title {
      font-size: 1rem;
    }
    .step-details {
      font-size: 0.92rem;
    }
    .micro-goal {
      font-size: 0.92rem;
    }
  }
  @media (max-width: 600px) {
    .smart-plan-step {
      padding: 0.75rem 0.5rem;
      font-size: 0.92rem;
      margin-bottom: 0.5rem;
    }
    .step-title {
      font-size: 0.95rem;
    }
    .step-details {
      font-size: 0.88rem;
    }
    .micro-goal {
      font-size: 0.88rem;
      padding: 0.5rem 0.5rem;
    }
  }
`;

document.head.appendChild(styles);