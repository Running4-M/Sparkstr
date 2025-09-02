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
      <div class="step-duration">${step.duration} mins</div>
    </div>
    <div class="step-content">
      <h4 class="step-title">${step.description}</h4>
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
  .smart-plan-step {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .break-step {
    background: rgba(156, 118, 255, 0.1);
    border-color: rgba(156, 118, 255, 0.2);
  }

  .step-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .step-number {
    background: rgba(156, 118, 255, 0.2);
    color: rgb(156, 118, 255);
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-weight: 600;
  }

  .step-duration {
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.875rem;
  }

  .step-title {
    color: white;
    font-size: 1.125rem;
    font-weight: 600;
    margin-bottom: 1rem;
  }

  .step-details {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    color: rgba(255, 255, 255, 0.8);
    font-size: 0.875rem;
  }

  .tip, .management-note {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .micro-goal {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.875rem;
  }

  .micro-goal strong {
    color: rgb(156, 118, 255);
  }
`;

document.head.appendChild(styles);