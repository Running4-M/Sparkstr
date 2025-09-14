// Import date-fns for date management
import { format, addDays, isBefore, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, isToday, isSameDay } from 'https://cdn.skypack.dev/date-fns';
// Add Firebase imports at the top
// Add this to the top of responses.js where other imports are
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
// At the top of your file, update imports
import { 
  fetchEventFromFirebase,
  fetchEvents,
  fetchTodayResponses,
  getCurrentUserId,
  initializeFirebase,
  fetchResponsesByDate,
  getSmartPlan,
  updateSmartPlan,
  fetchEventsInRange,
    fetchResponsesInRange,
} from "../backend/firebase.js";
import { firebaseInitPromise } from "../backend/firebase.js";
document.addEventListener('DOMContentLoaded', () => {
  firebaseInitPromise.then(() => {
    if (!getCurrentUserId()) {
      // Prevent any rendering before redirect
      document.body.innerHTML = '';
      window.location.href = "../Login/signup.html";
    } else {
      // Only initialize the app if authenticated!
      init();
      showLoaderScreen();
      setupEventListeners();
      // No need to call renderDateCards, renderTodayEvents, etc. here;
      // init() already does that.
    }
  });
});

async function shouldShowTutorial() {
  try {
    const { loadUserSettings } = await import("../backend/firebase.js");
    const settings = await loadUserSettings();
    // Show tutorial if not seen yet
    return !settings.tutorialSeen;
  } catch (e) {
    // If error, default to not showing tutorial
    return false;
  }
}
async function markTutorialSeen() {
  try {
    const { loadUserSettings, saveUserSettings } = await import("../backend/firebase.js");
    const settings = await loadUserSettings();
    await saveUserSettings({ ...settings, tutorialSeen: true });
  } catch (e) {}
}

// When user finishes or closes tutorial in responses.js:
markTutorialSeen();

import { generateSmartPlan, renderSmartPlanStep } from "./Smartplan.js";  // Add renderSmartPlanStep to imports
  console.log('hey')
  console.log('window.tutorialTour:', window.tutorialTour);
shouldShowTutorial().then(show => {
  if (show) startTutorialAtStep12();
});

async function startTutorialAtStep12() {
  console.log('[Tutorial] Function called');
  if (!window.tutorialTour) {
    console.error('[Tutorial] window.tutorialTour is not set');
    return;
  }
  if (!document.getElementById('upcoming-events-container')) {
    console.error('[Tutorial] #upcoming-events-container not found');
    return;
  }
  console.log('[Tutorial] Ready to show step 12');
  window.tutorialTour.start();
  window.tutorialTour.show('upcoming-responses');
}
// Add this new function near your other loader functions
function showDateLoader() {
  const loader = document.createElement('div');
  loader.id = 'date-loader';
  loader.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(15, 23, 42, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  `;
  
  loader.innerHTML = `
    <div style="text-align: center;">
      <div style="width: 50px; height: 50px; border: 3px solid #a78bfa; border-top: 3px solid transparent; border-radius: 50%; margin: 0 auto 1rem auto; animation: spin 1s linear infinite;"></div>
      <div style="color: #fff; font-size: 1.1rem;">Loading Events...</div>
    </div>
  `;
  
  document.body.appendChild(loader);
}

function hideDateLoader() {
  const loader = document.getElementById('date-loader');
  if (loader) loader.remove();
}



// Update the init() function to include embers initialization
async function init() {
  try {
    console.log("Starting initialization...");
    
    await initializeFirebase();
    console.log("Firebase initialized");
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const today = new Date();
    document.getElementById('today-date').textContent = formatDate(today, 'weekday long, month long, day');
    
    // Initialize embers background
    initializeEmbers();
    
    console.log("Starting to render views...");
    await renderDateCards();
    await renderTodayEvents();
    await renderUpcomingEvents();
    await renderRecentResponses();
    console.log("Finished rendering views");
    hideLoaderScreen();
    
  } catch (error) {
    console.error("Error initializing application:", error);
  }
}

// Add after imports
const globalStyles = document.createElement('style');
globalStyles.textContent = `
  html, body {
    max-width: 100vw;
    min-height: 100vh;
    margin: 0;
    padding: 0;
    position: relative;
    overflow-x: hidden;
  }

  #embers-canvas {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 0;
    pointer-events: none;
    mix-blend-mode: screen;
    opacity: 0.6;
  }

  #view-container {
    position: relative;
    z-index: 1;
    min-height: 100vh;
    width: 100%;
    background: transparent;
  }

  .view-content {
    position: relative;
    z-index: 1;
    border-radius: 1rem;
    padding: 2rem;
    margin: 1rem;
  }


  #events-view,
  #response-view {
    position: relative;
    z-index: 2;
    padding: 2rem;
    border-radius: 1rem;
    margin: 1rem;
  }

  .carousel-container,
  .today-container,
  .upcoming-container,
  .recent-container {
    background: rgba(26, 26, 46, 0.6);
    border-radius: 1rem;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    backdrop-filter: blur(8px);
  }

  #embers-canvas {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 10; /* Increased z-index */
    pointer-events: none;
    mix-blend-mode: screen;
    opacity: 0.6; /* Added opacity to make embers more subtle */
  }

  #view-container {
    position: relative;
    z-index: 1;
    min-height: 100vh;
    background: transparent;
  }

  .view-content {
    position: relative;
    z-index: 1;
    background: rgba(15, 15, 26, 0.85);
    backdrop-filter: blur(8px);
    border-radius: 1rem;
    padding: 2rem;
    margin: 1rem;
  }

  #calendar-view,
  #events-view,
  #response-view {
    position: relative;
    z-index: 1;
    padding: 2rem;
    border-radius: 1rem;
    margin: 1rem;
  }

  .carousel-container,
  .today-container,
  .upcoming-container,
  .recent-container {
    position: relative;
    z-index: 1;
    background: rgba(26, 26, 46, 0.85);
    border-radius: 1rem;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .carousel-container::-webkit-scrollbar {
    display: none; /* Hide scrollbar Chrome/Safari */
  }

  .carousel-item {
    flex: 0 0 auto;
    width: calc((100vw - 4rem) / 7); /* Divide available space by 7 days */
    min-width: 100px;
    max-width: 140px;
    scroll-snap-align: center;
    padding: 0.5rem;
  }

   @media (min-width: 769px) {
    .carousel-item {
      width: calc(100% / 8); /* Reduce width to show items closer together */
      padding: 0.25rem; /* Reduce padding between items */
    }

    #carousel-content {
      justify-content: center;
      gap: 0.5rem; /* Add smaller gap between items */
    }
  }

  @media (max-width: 768px) {
    .carousel-container {
      padding: 1rem 0.5rem;
    }

    .carousel-item {
      width: calc((100vw - 3rem) / 3); /* Show 3 items on mobile */
    }

    #carousel-content {
      padding: 0 0.25rem;
      gap: 0.25rem;
    }
  }

  @media (min-width: 769px) {
    .carousel-item {
      width: calc(100% / 7); /* Show all 7 items on desktop */
    }

    #carousel-content {
      justify-content: center; /* Center items on desktop */
    }
  }

  /* Add visual indication of scrollable content on mobile */
  @media (max-width: 768px) {
    .carousel-container::after {
      content: '';
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      width: 32px;
      background: linear-gradient(to right, transparent, rgba(15, 15, 26, 0.5));
      pointer-events: none;
    }
  }
  /* Responsive adjustments */
  @media (max-width: 768px) {
    .carousel-container {
      padding: 0 0.5rem;
    }

    #carousel-content {
      gap: 0.5rem;
    }
  }

  
  
`;
document.head.appendChild(globalStyles);

// Update the initializeEmbers function
function initializeEmbers() {
  const canvas = document.createElement('canvas');
  canvas.id = 'embers-canvas';
  
  // Insert canvas before the view-container instead of at body start
  const viewContainer = document.getElementById('view-container');
  viewContainer.parentNode.insertBefore(canvas, viewContainer);
  
  // Start animation
  requestAnimationFrame(drawEmbers);
  
  // Add resize handler
  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });
}

function showLoaderScreen() {
  const loader = document.getElementById('responses-loader');
  if (loader) loader.style.display = 'flex';
}
function hideLoaderScreen() {
  const loader = document.getElementById('responses-loader');
  if (loader) loader.style.display = 'none';
}

// Helper functions
function groupEventsByDay(events) {
  const groupedEvents = {};
  
  events.forEach(event => {
    const dateString = event.date.toDateString();
    
    if (!groupedEvents[dateString]) {
      groupedEvents[dateString] = {
        date: new Date(event.date),
        events: []
      };
    }
    
    groupedEvents[dateString].events.push(event);
  });
  
  return Object.values(groupedEvents).sort((a, b) => a.date - b.date);
}

function getEventColor(date) {
  // Simple algorithm to assign different colors based on the date
  const colors = ['purple', 'teal', 'pink', 'brown'];
  const dayNum = date.getDate() + date.getMonth();
  return colors[dayNum % colors.length];
}

function formatDate(date, format) {
  // Guard against invalid dates
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    console.warn('Invalid date provided to formatDate:', date);
    return 'Invalid Date';
  }

  const options = {};
  
  if (format.includes('weekday')) {
    options.weekday = format.includes('short') ? 'short' : 'long';
  }
  
  if (format.includes('month')) {
    options.month = format.includes('short') ? 'short' : 'long';
  }
  
  if (format.includes('day')) {
    options.day = 'numeric';
  }
  
  if (format.includes('year')) {
    options.year = 'numeric';
  }
  
  try {
    return new Intl.DateTimeFormat('en-US', options).format(date);
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid Date';
  }
}

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

// State management
let state = {
  allEvents: [],
  groupedEvents: [],
  selectedDay: null,
  selectedEvent: null,
  activeView: 'calendar',
  todayEvents: [],
  currentWeekStart: startOfWeek(new Date(), { weekStartsOn: 1 }), // Start on Monday
  responses: [] // To hold additional responses if needed
};




// Add this helper function at the top of your file with other helper functions
function formatDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Update the setupEventListeners function
function setupEventListeners() {
  const carouselNav = document.createElement('div');
  carouselNav.className = 'flex items-center justify-center gap-4 mb-6';

  const prevButton = document.createElement('button');
  prevButton.className = 'carousel-nav-btn';
  prevButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m15 18-6-6 6-6"/>
    </svg>
  `;

  const todayButton = document.createElement('button');
  todayButton.className = 'carousel-today-btn';
  todayButton.textContent = 'Today';

  const nextButton = document.createElement('button');
  nextButton.className = 'carousel-nav-btn';
  nextButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m9 18 6-6-6-6"/>
    </svg>
  `;

  // Add styles to document head
  const style = document.createElement('style');
  style.textContent = `
    .carousel-nav-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 9999px;
      background: rgba(156, 118, 255, 0.1);
      color: rgb(156, 118, 255);
      transition: all 0.2s;
    }

    .carousel-nav-btn:hover {
      background: rgba(156, 118, 255, 0.2);
    }

    .carousel-today-btn {
      padding: 0.5rem 1.5rem;
      background: rgb(156, 118, 255);
      color: white;
      border-radius: 9999px;
      font-size: 0.875rem;
      font-weight: 500;
      transition: all 0.2s;
    }

    .carousel-today-btn:hover {
      background: rgb(137, 94, 255);
    }

    .carousel-container {
      position: relative;
    }

    .carousel-loading {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
      backdrop-filter: blur(4px);
    }

    .carousel-loader {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(156, 118, 255, 0.3);
      border-radius: 50%;
      border-top-color: rgb(156, 118, 255);
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);

  // Add event listeners
  prevButton.addEventListener('click', () => navigateWeeks(-1));
  nextButton.addEventListener('click', () => navigateWeeks(1));
  todayButton.addEventListener('click', goToCurrentWeek);

  carouselNav.appendChild(prevButton);
  carouselNav.appendChild(todayButton);
  carouselNav.appendChild(nextButton);

  // Replace existing navigation buttons
  const existingNav = document.getElementById('carousel-prev').parentElement;
  existingNav.replaceWith(carouselNav);
}

// Add the goToCurrentWeek function
function goToCurrentWeek() {
  state.currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  renderDateCards();
  showToast('Showing current week');
}

// Update the navigateWeeks function to prevent page jumps
function navigateWeeks(direction) {
  const carouselContent = document.getElementById('carousel-content');
  
  // Add transition class
  carouselContent.style.transition = 'opacity 0.2s';
  carouselContent.style.opacity = '0';

  setTimeout(() => {
    // Update current week start date
    state.currentWeekStart = direction > 0 
      ? addWeeks(state.currentWeekStart, 1) 
      : subWeeks(state.currentWeekStart, 1);
    
    // Re-render date cards with the new week
    renderDateCards();
    
    // Restore opacity
    carouselContent.style.opacity = '1';
    
    // Show toast for feedback
    const weekStartStr = format(state.currentWeekStart, 'MMM d');
    const weekEndStr = format(endOfWeek(state.currentWeekStart, { weekStartsOn: 1 }), 'MMM d, yyyy');
    showToast(`Showing week of ${weekStartStr} - ${weekEndStr}`);
  }, 200);
}

async function renderDateCards() {
  const carouselContent = document.getElementById('carousel-content');
  const carouselContainer = carouselContent.parentElement;
  
  // Add loading overlay before starting
  const loadingOverlay = document.createElement('div');
  loadingOverlay.className = 'carousel-loading';
  loadingOverlay.innerHTML = '<div class="carousel-loader"></div>';
  carouselContainer.appendChild(loadingOverlay);

  try {
    const weekDays = eachDayOfInterval({
      start: state.currentWeekStart,
      end: endOfWeek(state.currentWeekStart, { weekStartsOn: 1 })
    });

    // Create temporary placeholder cards
    carouselContent.innerHTML = '';
    weekDays.forEach(date => {
      const placeholderCard = createDateCard(
        date.getDate(),
        format(date, 'MMM'),
        format(date, 'EEE'),
        getEventColor(date),
        null,
        isToday(date),
        date > new Date()
      );

      const carouselItem = document.createElement('div');
      carouselItem.className = 'carousel-item';
      carouselItem.appendChild(placeholderCard);
      carouselContent.appendChild(carouselItem);
    });

    // Fetch all responses for the week in parallel
    const weekStart = formatDateString(state.currentWeekStart);
const weekEnd = formatDateString(endOfWeek(state.currentWeekStart, { weekStartsOn: 1 }));
const allResponsesRaw = await fetchResponsesInRange(weekStart, weekEnd);

// Group responses by day
const allResponses = weekDays.map(date => {
  const responses = allResponsesRaw.filter(r => isSameDay(new Date(r.date), date));
  return { date, responses };
});
    // Update the carousel with actual data
    carouselContent.innerHTML = '';
    allResponses.forEach(({ date, responses }) => {
      const dayEvents = state.groupedEvents.find(group => 
        isSameDay(group.date, date)
      )?.events || [];

      const dateCard = createDateCard(
        date.getDate(),
        format(date, 'MMM'),
        format(date, 'EEE'),
        getEventColor(date),
        responses.length,
        isToday(date),
        date > new Date()
      );

      dateCard.addEventListener('click', () => {
        if (responses.length > 0) {
          handleSelectDay({
            date: date,
            events: dayEvents,
            responses: responses.length
          });
        } else if (dayEvents.length > 0 && !isFutureDate) {
          showToast("No responses for this day yet");
        } else if (date > new Date()) {
          showToast("Cannot view responses for future dates");
        } else {
          showToast("No events or responses for this day");
        }
      });
      const carouselItem = document.createElement('div');
      carouselItem.className = 'carousel-item';
      carouselItem.appendChild(dateCard);
      carouselContent.appendChild(carouselItem);
    });

  } catch (error) {
    console.error('Error rendering date cards:', error);
    showToast('Error loading calendar data');
  } finally {
    // Remove loading overlay after everything is done
    loadingOverlay.remove();
  }
}



// Update createDateCard to handle future dates and response counts
function createDateCard(day, month, weekday, variant, responseCount, isCurrentDay, isFutureDate) {
 const dateCard = document.createElement('div');
  dateCard.className = `date-card date-card-${variant} ${isCurrentDay ? 'today' : ''} ${isFutureDate ? 'future-date' : ''}`;
  
  // Add these style properties
  Object.assign(dateCard.style, {
    width: '100%',
    minWidth: '80px', // Ensure minimum width
    maxWidth: '100%',
    aspectRatio: '3/4', // Maintain consistent aspect ratio
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center'
  });
  
  const dateIndicator = document.createElement('div');
  dateIndicator.className = 'date-indicator';
  dateCard.appendChild(dateIndicator);
  
  if (responseCount > 0) {
    const countBadge = document.createElement('div');
    countBadge.className = 'response-count';
    countBadge.textContent = responseCount;
    dateCard.appendChild(countBadge);
  }
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'flex flex-col items-center justify-center h-full';
  
  const weekdaySpan = document.createElement('span');
  weekdaySpan.className = 'text-sm font-medium text-white-70';
  weekdaySpan.textContent = weekday;
  contentDiv.appendChild(weekdaySpan);
  
  const daySpan = document.createElement('span');
  daySpan.className = 'text-4xl font-bold mt-2';
  daySpan.textContent = day;
  contentDiv.appendChild(daySpan);
  
  const monthSpan = document.createElement('span');
  monthSpan.className = 'text-sm font-medium text-white-70 mt-1';
  monthSpan.textContent = month;
  contentDiv.appendChild(monthSpan);
  
  if (responseCount > 0) {
    const responseInfoDiv = document.createElement('div');
    responseInfoDiv.className = 'mt-4 flex items-center text-white-70';
    
    // Message icon for responses
    responseInfoDiv.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    `;
    
    const countText = document.createElement('span');
    countText.className = 'text-xs';
    countText.textContent = `${responseCount} ${responseCount === 1 ? 'response' : 'responses'}`;
    responseInfoDiv.appendChild(countText);
    
    contentDiv.appendChild(responseInfoDiv);
  }
  
  dateCard.appendChild(contentDiv);
  
  return dateCard;
}


  // Near the top of the function, add:
async function getEventTime(eventId) {
  const eventDetails = await fetchEventFromFirebase(eventId);
  return eventDetails?.data()?.time || 'No time set';
}

async function renderTodayEvents() {
  const todayEventsCardContent = document.querySelector('.today-events .card .card-content');
  if (!todayEventsCardContent) return;
  
  // Clear existing content first
  todayEventsCardContent.innerHTML = '';

  try {
    const todayResponses = await fetchTodayResponses();
    
    // Create a Map to store unique responses by eventId
    const uniqueResponses = new Map();
    
    todayResponses.forEach(response => {
      // Keep only the most recent response for each eventId
      const existingResponse = uniqueResponses.get(response.eventId);
      if (!existingResponse || new Date(response.date) > new Date(existingResponse.date)) {
        uniqueResponses.set(response.eventId, response);
      }
    });

    // Convert Map values back to array and sort by time
    const sortedResponses = Array.from(uniqueResponses.values())
      .sort((a, b) => {
        const timeA = a.eventTime || '00:00';
        const timeB = b.eventTime || '00:00';
        return timeA.localeCompare(timeB);
      });

    if (sortedResponses.length === 0) {
      todayEventsCardContent.innerHTML = `<div class="text-white-70 text-center py-8">No events for today.</div>`;
      return;
    }

    const seenEventIds = new Set();
for (const response of sortedResponses) {
  if (seenEventIds.has(response.eventId)) continue;
  seenEventIds.add(response.eventId);
  const eventTime = await getEventTime(response.eventId);
  const card = document.createElement('div');
      card.className = 'event-card';
      card.tabIndex = 0;
      card.style.position = 'relative';
      card.style.marginBottom = '1.5rem';
      card.style.width = '100%';
      card.style.maxWidth = '100%';
      card.style.boxSizing = 'border-box';
      card.style.transition = 'all 0.2s';
      card.style.boxShadow = '0 4px 32px rgba(156,118,255,0.10)';
      card.style.borderRadius = '1.25rem';
      card.style.padding = '2.25rem 2rem';

      const priorityColor = response.priority === "high" ? "#ef4444" : 
                          response.priority === "medium" ? "#eab308" : "#10b981";

      // Priority indicator (dot)
      const priorityIndicator = document.createElement('div');
      priorityIndicator.style.position = 'absolute';
      priorityIndicator.style.top = '18px';
      priorityIndicator.style.right = '18px';
      priorityIndicator.style.width = '14px';
      priorityIndicator.style.height = '14px';
      priorityIndicator.style.borderRadius = '50%';
      priorityIndicator.style.background = priorityColor;
      priorityIndicator.style.boxShadow = `0 0 0 4px ${priorityColor}22`;
      priorityIndicator.style.border = '2px solid #fff';
      card.appendChild(priorityIndicator);

      // Header
      const header = document.createElement('div');
      header.className = 'event-header';
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      header.style.gap = '1.5rem';
      header.style.marginBottom = '1.5rem';
      
      // Time badge
      const timeBadge = document.createElement('div');
      timeBadge.className = 'time-badge';
      timeBadge.style.background = 'rgba(6,182,212,0.13)';
      timeBadge.style.color = '#06b6d4';
      timeBadge.style.padding = '1rem 0.75rem';
      timeBadge.style.borderRadius = '1rem';
      timeBadge.style.textAlign = 'center';
      timeBadge.style.minWidth = '4.5rem';
      timeBadge.style.fontWeight = '700';
      timeBadge.style.fontSize = '1.1rem';
      timeBadge.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="#06b6d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:2px;">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <div style="font-size:1.1rem;font-weight:700;">${eventTime}</div>
      `;

      // Info
      const info = document.createElement('div');
      info.className = 'event-info';
      info.style.flex = '1';

      const title = document.createElement('h3');
      title.className = 'event-title';
      title.textContent = response.eventTitle || response.title || '(No Title)';
      title.style.fontSize = '1.35rem';
      title.style.fontWeight = '700';
      title.style.marginBottom = '0.5rem';
      title.style.color = '#fff';

      // Description
      const desc = document.createElement('div');
      desc.className = 'event-description';
      desc.textContent = response.eventDescription || response.description || '';
      desc.style.color = '#cbd5e1';
      desc.style.marginBottom = '1rem';

      info.appendChild(title);
      info.appendChild(desc);

      header.appendChild(timeBadge);
      header.appendChild(info);
      card.appendChild(header);

      // AI Preview
      const aiPreview = document.createElement('div');
      aiPreview.className = 'ai-preview';
      aiPreview.style.background = 'rgba(139,92,246,0.06)';
      aiPreview.style.borderRadius = '1rem';
      aiPreview.style.padding = '1.25rem';

      const previewHeader = document.createElement('div');
      previewHeader.className = 'preview-header';
      previewHeader.style.display = 'flex';
      previewHeader.style.alignItems = 'center';
      previewHeader.style.gap = '0.75rem';
      previewHeader.style.marginBottom = '1rem';
      previewHeader.innerHTML = `
        <span class="ai-badge" style="background:linear-gradient(135deg,#9c76ff 0%,#8a5cf6 100%);color:#fff;padding:0.25rem 0.75rem;border-radius:0.5rem;font-size:0.8rem;font-weight:700;">AI</span>
        <span class="ai-label" style="color:#c4b5fd;font-size:0.95rem;font-weight:500;">Preview</span>
      `;

      const aiText = document.createElement('div');
aiText.className = 'ai-text';
const md = window.md || new window.markdownit();
const markdown = response.response
  ? response.response.substring(0, 120) + (response.response.length > 120 ? '...' : '')
  : '';
aiText.innerHTML = md.render(markdown);
aiText.style.color = '#e0e7ff';
aiText.style.fontSize = '1rem';
aiText.style.lineHeight = '1.6';

      aiPreview.appendChild(previewHeader);
      aiPreview.appendChild(aiText);
      card.appendChild(aiPreview);

      // Click handler
      card.addEventListener('click', () => handleSelectResponse(response));

      todayEventsCardContent.appendChild(card);
    }

  } catch (error) {
    todayEventsCardContent.innerHTML = `<div class="text-red-500 text-center py-8">Failed to load events.</div>`;
    console.error("Error rendering today's events:", error);
  }
}


// Add this function to handle Today Event preview clicks

async function handleSelectResponse(response) {
  try {
    showLoader();

    // Fetch complete event details including smart plan
    const eventDetails = await fetchEventFromFirebase(response.eventId);
    const eventData = eventDetails?.data() || {};
    
    // Create a complete event object with all necessary data
    const eventObj = {
      id: response.eventId,
      eventId: response.eventId,
      title: response.eventTitle || eventData.title || 'Untitled Event',
      description: response.eventDescription || eventData.description || '',
      date: response.date ? new Date(response.date) : new Date(),
      time: eventData.time || response.eventTime || 'No time set',
      priority: response.priority || eventData.priority || 'none',
      aiResponse: {
        // Use the response text from the response collection
        text: response.response || eventData.aiResponse?.text || 'No response available',
        resources: response.resources || eventData.aiResponse?.resources || []
      },
      smartPlan: response.smartPlan || eventData.smartPlan || null,
      fromEventCard: true // Add this flag to track source
    };

    // Update state
    state.selectedDay = {
      date: new Date(response.date),
      events: [eventObj],
      responses: [response]
    };
    state.selectedEvent = eventObj;
    state.activeView = 'response';

    // Handle view transition
    document.getElementById('calendar-view')?.classList.add('hidden');
    document.getElementById('events-view')?.classList.add('hidden');
    
    const responseView = document.getElementById('response-view');
    responseView.style.opacity = '0';
    responseView.classList.remove('hidden');
    
    await renderResponseView();
    
    setTimeout(() => {
      responseView.style.transition = 'opacity 0.3s ease';
      responseView.style.opacity = '1';
    }, 50);

  } catch (error) {
    console.error('Error in handleSelectResponse:', error);
    showToast('Error loading response details');
  } finally {
    hideLoader();
  }
}

// Add this loader function if not already present
function showLoader() {
  const loader = document.getElementById('responses-loader');
  if (loader) loader.style.display = 'flex';
}

function hideLoader() {
  const loader = document.getElementById('responses-loader');
  if (loader) loader.style.display = 'none';
}

// Update createResponsePreviewItem to match upcoming event preview style
function createResponsePreviewItem(response) {
  const previewItem = document.createElement('div');
  previewItem.className = 'preview-item';
  previewItem.style.cursor = 'pointer';
  previewItem.style.display = 'flex';
  previewItem.style.alignItems = 'center';
  previewItem.style.background = 'rgba(255,255,255,0.04)';
  previewItem.style.borderRadius = '1rem';
  previewItem.style.padding = '1.25rem 1.5rem';
  previewItem.style.marginBottom = '1rem';
  previewItem.style.transition = 'background 0.2s';

  previewItem.onmouseover = () => previewItem.style.background = 'rgba(156,118,255,0.08)';
  previewItem.onmouseout = () => previewItem.style.background = 'rgba(255,255,255,0.04)';

  // Date badge
  const dateDiv = document.createElement('div');
  dateDiv.style.display = 'flex';
  dateDiv.style.flexDirection = 'column';
  dateDiv.style.alignItems = 'center';
  dateDiv.style.justifyContent = 'center';
  dateDiv.style.background = 'rgba(156,118,255,0.13)';
  dateDiv.style.borderRadius = '0.75rem';
  dateDiv.style.width = '52px';
  dateDiv.style.height = '52px';
  dateDiv.style.marginRight = '1.25rem';

  const dateObj = new Date(response.date);
  const monthSpan = document.createElement('span');
  monthSpan.style.fontSize = '0.85rem';
  monthSpan.style.color = '#a78bfa';
  monthSpan.style.fontWeight = '700';
  monthSpan.textContent = dateObj.toLocaleString('default', { month: 'short' }).toUpperCase();

  const daySpan = document.createElement('span');
  daySpan.style.fontSize = '1.35rem';
  daySpan.style.fontWeight = '800';
  daySpan.style.color = '#fff';
  daySpan.textContent = dateObj.getDate();

  dateDiv.appendChild(monthSpan);
  dateDiv.appendChild(daySpan);

  previewItem.appendChild(dateDiv);

  // Content
  const contentDiv = document.createElement('div');
  contentDiv.style.flex = '1';

  const title = document.createElement('h4');
title.style.fontSize = '1.1rem';
title.style.fontWeight = '700';
title.style.color = '#fff';
title.style.margin = '0 0 0.25rem 0';
console.log('Preview Title:', response.eventTitle, response.title, response);
// Fallback to response.title if eventTitle is missing
title.textContent = response.eventTitle || response.title || '(No Title)';
contentDiv.appendChild(title);
previewItem.appendChild(contentDiv);

  const preview = document.createElement('div');
preview.style.color = '#c4b5fd';
preview.style.fontSize = '0.85rem';
preview.style.margin = '0';
const md = window.md || new window.markdownit();
const previewText = (response.response || '').substring(0, 30) + ((response.response && response.response.length > 30) ? '...' : '');
preview.innerHTML = md.render(previewText);
contentDiv.appendChild(preview);
  

  // Arrow
  const arrow = document.createElement('span');
  arrow.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 12h14"></path>
      <path d="m12 5 7 7-7 7"></path>
    </svg>
  `;
  arrow.style.marginLeft = '1.25rem';
  previewItem.appendChild(arrow);

  // Click handler
  previewItem.addEventListener('click', () => handleSelectResponse(response));

  return previewItem;
}

function createEventItem(event) {
  const eventItem = document.createElement('div');
  eventItem.className = 'event-item';
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'event-content';
  
  const infoDiv = document.createElement('div');
  infoDiv.className = 'event-info';
  
  const title = document.createElement('h3');
  title.textContent = event.title;
  infoDiv.appendChild(title);
  
  const timeDiv = document.createElement('div');
  timeDiv.className = 'event-time';
  
  // Arrow icon
  timeDiv.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 12h14"></path>
      <path d="m12 5 7 7-7 7"></path>
    </svg>
  `;
  
  const timeText = document.createElement('span');
  timeText.textContent = `${event.schedule[0]?.time} - ${event.schedule[event.schedule.length - 1]?.time}`;
  timeDiv.appendChild(timeText);
  
  infoDiv.appendChild(timeDiv);
  contentDiv.appendChild(infoDiv);
  
  const button = document.createElement('button');
  button.className = 'event-arrow';
  
  // Arrow icon
  button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(156, 118, 255)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 12h14"></path>
      <path d="m12 5 7 7-7 7"></path>
    </svg>
  `;
  
  contentDiv.appendChild(button);
  eventItem.appendChild(contentDiv);
  
  return eventItem;
}

// Helper to check if a date is in the future (YYYY-MM-DD)
function isFutureDateStr(dateStr) {
  const today = new Date();
  today.setHours(0,0,0,0);
  const d = new Date(dateStr);
  d.setHours(0,0,0,0);
  return d > today;
}



function createEventDetailsHTML(event) {
  // Color and badge helpers
  const getColorClass = (color) => {
    const colorMap = {
      green: 'background-color: #10b981;',
      blue: 'background-color: #3b82f6;',
      red: 'background-color: #ef4444;',
      purple: 'background-color: #8b5cf6;',
      yellow: 'background-color: #eab308;',
      orange: 'background-color: #f97316;',
      pink: 'background-color: #ec4899;',
      teal: 'background-color: #14b8a6;',
      brown: 'background-color: #a16207;'
    };
    return colorMap[color] || 'background-color: #6b7280;';
  };
  const getPriorityBadgeStyle = (priority) => {
    switch (priority) {
      case 'high': return 'background-color: #dc2626; color: #fef2f2; border-color: #dc2626;';
      case 'medium': return 'background-color: #374151; color: #f9fafb; border-color: #374151;';
      case 'low': return 'background-color: transparent; color: #d1d5db; border: 1px solid #374151;';
      default: return 'background-color: transparent; color: #d1d5db; border: 1px solid #374151;';
    }
  };

  // SVGs
  const calendarSVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>`;
  const clockSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>`;
  const tagSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>`;
  const repeatSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 1 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 23-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
  const brainSVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/></svg>`;
  const bellSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`;
  const alertCircleSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

  // Helper for pretty label
  function prettyLabel(str) {
    return str
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, s => s.toUpperCase())
      .replace(/_/g, ' ');
  }

  // Helper for rendering a field value
  function renderFieldValue(value) {
    if (Array.isArray(value)) {
      if (value.length === 0) return `<span style="color:#64748b;">No value</span>`;
      return value.map(v => `<span style="display:inline-block;background:#312e81;color:#c7d2fe;padding:2px 8px;border-radius:6px;margin-right:6px;font-size:0.92em;">${v}</span>`).join(' ');
    }
    if (typeof value === 'object' && value !== null) {
      // Attachments: files/urls
      if ('files' in value || 'urls' in value) {
        let files = value.files && value.files.length ? value.files.map(f => `<span style="display:inline-block;background:#312e81;color:#c7d2fe;padding:2px 8px;border-radius:6px;margin-right:6px;font-size:0.92em;">${f}</span>`).join(' ') : '<span style="color:#64748b;">No files</span>';
        let urls = value.urls && value.urls.length ? value.urls.map(u => `<a href="${u}" target="_blank" style="color:#818cf8;text-decoration:underline;">${u}</a>`).join(' ') : '<span style="color:#64748b;">No links</span>';
        return `<div style="margin-bottom:4px;"><b>Files:</b> ${files}</div><div><b>Links:</b> ${urls}</div>`;
      }
      // For other objects, show "No value" if empty, else list keys/values
      const keys = Object.keys(value);
      if (keys.length === 0) return `<span style="color:#64748b;">No value</span>`;
      return keys.map(k => `<div style="margin-bottom:2px;"><b>${prettyLabel(k)}:</b> ${renderFieldValue(value[k])}</div>`).join('');
    }
    if (typeof value === 'string') {
      return value.trim() ? value : `<span style="color:#64748b;">No value</span>`;
    }
    if (typeof value === 'number') {
      return value;
    }
    return `<span style="color:#64748b;">No value</span>`;
  }

   // --- Template Section: Dynamic, Pretty Rendering ---
    let templateSection = '';
  if (event.templateData && typeof event.templateData === 'object') {
    const fields = Object.entries(event.templateData);
    templateSection = `
      <div style="background-color: #1e293b; border: 1px solid #334155; border-radius: 8px;">
        <div style="padding: 24px 24px 0 24px;">
          <h3 style="color: #a855f7; font-size: 1.125rem; font-weight: 600; margin: 0 0 16px 0;">Template Details</h3>
        </div>
        <div style="padding: 0 24px 24px 24px; display: flex; flex-direction: column; gap: 18px;">
          ${fields.map(([key, value]) => `
            <div style="display:flex;align-items:flex-start;gap:12px;">
              <div style="min-width:120px;font-weight:600;color:#c4b5fd;font-size:1em;line-height:1.5;">
                ${prettyLabel(key)}
              </div>
              <div style="flex:1;font-size:1em;color:#e5e7eb;line-height:1.6;">
                ${renderFieldValue(value)}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // --- Back button HTML ---
  const backButtonHTML = `
    <button id="event-details-back-btn" style="
      position: absolute;
      top: 32px;
      left: 32px;
      background: rgba(156,118,255,0.12);
      color: #a78bfa;
      border: none;
      border-radius: 9999px;
      padding: 0.5rem 1.25rem;
      font-size: 1rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      z-index: 2000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      transition: background 0.2s;
    " onmouseover="this.style.background='rgba(156,118,255,0.22)'" onmouseout="this.style.background='rgba(156,118,255,0.12)'">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15 18L9 12l6-6"></path>
      </svg>
      Back
    </button>
  `;

   // Remove page title/subtitle and make background full page
 return `
    <div style="position:fixed;inset:0;min-height:100vh;width:100vw;background:#0f172a;z-index:1000;overflow:auto;">
      ${backButtonHTML}
      <div style="max-width: 64rem; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; padding: 32px 0;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 16px;">
            <div style="width: 16px; height: 16px; border-radius: 50%; ${getColorClass(event.color)}"></div>
            <h1 style="font-size: 1.875rem; font-weight: bold; color: white; margin: 0;">${event.title || '(No Title)'}</h1>
          </div>
          <p style="color: #94a3b8; font-size: 1.125rem; margin: 0;">${event.description || ''}</p>
        </div>
        <!-- Basic Event Info ... -->
        <div style="background-color: #1e293b; border: 1px solid #334155; border-radius: 8px;">
          <div style="padding: 24px 24px 0 24px;">
            <h3 style="color: #a855f7; display: flex; align-items: center; gap: 8px; font-size: 1.125rem; font-weight: 600; margin: 0 0 16px 0;">
              ${calendarSVG}
              Event Information
            </h3>
          </div>
          <div style="padding: 0 24px 24px 24px;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                ${calendarSVG.replace('width="20" height="20"', 'width="16" height="16"').replace('currentColor', '#94a3b8')}
                <div>
                  <p style="font-size: 0.875rem; color: #94a3b8; margin: 0 0 4px 0;">Date</p>
                  <p style="color: white; margin: 0;">${event.date || ''}</p>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                ${clockSVG.replace('currentColor', '#94a3b8')}
                <div>
                  <p style="font-size: 0.875rem; color: #94a3b8; margin: 0 0 4px 0;">Time</p>
                  <p style="color: white; margin: 0;">${event.time || ''}</p>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                ${tagSVG.replace('currentColor', '#94a3b8')}
                <div>
                  <p style="font-size: 0.875rem; color: #94a3b8; margin: 0 0 4px 0;">Priority</p>
                  <span style="display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; text-transform: capitalize; ${getPriorityBadgeStyle(event.priority)}">${event.priority || 'none'}</span>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                ${repeatSVG.replace('currentColor', '#94a3b8')}
                <div>
                  <p style="font-size: 0.875rem; color: #94a3b8; margin: 0 0 4px 0;">Recurrence</p>
                  <p style="color: white; margin: 0; text-transform: capitalize;">${event.recurrence || 'none'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- AI & Settings ... -->
        <div style="background-color: #1e293b; border: 1px solid #334155; border-radius: 8px;">
          <div style="padding: 24px 24px 0 24px;">
            <h3 style="color: #a855f7; display: flex; align-items: center; gap: 8px; font-size: 1.125rem; font-weight: 600; margin: 0 0 16px 0;">
              ${brainSVG}
              AI & Settings
            </h3>
          </div>
          <div style="padding: 0 24px 24px 24px;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 16px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                ${brainSVG.replace('width="20" height="20"', 'width="16" height="16"').replace('currentColor', '#94a3b8')}
                <div>
                  <p style="font-size: 0.875rem; color: #94a3b8; margin: 0 0 4px 0;">AI Enabled</p>
                  <p style="color: white; margin: 0;">${event.aiEnabled ? 'Yes' : 'No'}</p>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                ${bellSVG.replace('currentColor', '#94a3b8')}
                <div>
                  <p style="font-size: 0.875rem; color: #94a3b8; margin: 0 0 4px 0;">Notifications</p>
                  <p style="color: white; margin: 0;">${event.notificationsEnabled ? 'Enabled' : 'Disabled'}</p>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                ${alertCircleSVG.replace('currentColor', '#94a3b8')}
                <div>
                  <p style="font-size: 0.875rem; color: #94a3b8; margin: 0 0 4px 0;">Complex Task</p>
                  <p style="color: white; margin: 0;">${event.isComplex ? 'Yes' : 'No'}</p>
                </div>
              </div>
            </div>
            ${event.aiEnabled ? `
            <div style="margin-top: 16px;">
              <h4 style="font-size: 0.875rem; font-weight: 500; color: #cbd5e1; margin: 0 0 8px 0;">AI Task Type</h4>
              <span style="display: inline-block; padding: 4px 12px; border-radius: 4px; background-color: #7c3aed; color: white; font-size: 0.875rem;">${event.aiTaskType || ''}</span>
              <p style="font-size: 0.875rem; color: #94a3b8; margin: 8px 0 0 0;">${event.aiReason || ''}</p>
            </div>
            ` : ''}
          </div>
        </div>
        <!-- Template Data (dynamic) -->
        ${templateSection}
        <!-- Footer Info ... -->
        <div style="background-color: #1e293b; border: 1px solid #334155; border-radius: 8px;">
          <div style="padding: 24px; text-align: center;">
            <div style="font-size: 0.875rem; color: #64748b;">
              Last updated: ${event.lastUpdated ? new Date(event.lastUpdated).toLocaleString() : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}


document.getElementById('view-container').innerHTML = html;

function makeScrollableIfNeeded(container, maxVisible = 3) {
  if (!container) return;
  // Remove previous scroll styles
  container.style.maxHeight = '';
  container.style.overflowY = '';
  container.style.paddingRight = '';
  // If more than maxVisible children, make scrollable
  if (container.children.length > maxVisible) {
    container.style.maxHeight = `${maxVisible * 110}px`; // ~110px per card, adjust as needed
    container.style.overflowY = 'auto';
    container.style.paddingRight = '4px';
  }
}

async function renderUpcomingEvents() {
  const upcomingEventsContainer = document.getElementById('upcoming-events-container');
  if (!upcomingEventsContainer) return;

  upcomingEventsContainer.innerHTML = '';

  try {
    const weekStart = formatDateString(state.currentWeekStart);
const weekEnd = formatDateString(endOfWeek(state.currentWeekStart, { weekStartsOn: 1 }));
const events = await fetchEventsInRange(weekStart, weekEnd);

    // Next 7 days (excluding today)
    const today = new Date();
today.setHours(0, 0, 0, 0);
const weekEndDate = endOfWeek(today, { weekStartsOn: 1 });

const seenEventKeys = new Set();
const dedupedUpcomingEvents = [];
for (const event of events) {
  const eventDate = new Date(event.date);
  eventDate.setHours(0, 0, 0, 0);
  const eventKey = `${event.id}_${eventDate.toISOString().slice(0, 10)}`;
  if (
    eventDate > today &&
    eventDate <= weekEndDate &&
    event.aiEnabled &&
    !seenEventKeys.has(eventKey)
  ) {
    seenEventKeys.add(eventKey);
    dedupedUpcomingEvents.push(event);
  }
}

    if (dedupedUpcomingEvents.length === 0) {
      upcomingEventsContainer.innerHTML = `<div class="text-white-70 text-center py-8">No upcoming AI events.</div>`;
      return;
    }

    dedupedUpcomingEvents.forEach(event => {
      const previewItem = document.createElement('div');
      previewItem.className = 'preview-item';
      previewItem.style.cursor = 'pointer';

      previewItem.addEventListener('click', () => {
        // Show event details view
        document.getElementById('calendar-view')?.classList.add('hidden');
        document.getElementById('events-view')?.classList.add('hidden');
        document.getElementById('response-view')?.classList.add('hidden');
        document.getElementById('view-container').innerHTML = createEventDetailsHTML(event);
        setupEventDetailsBackButton();
       
      });

      const dateDiv = document.createElement('div');
      dateDiv.className = 'preview-date';

      const monthSpan = document.createElement('span');
      monthSpan.className = 'preview-date-month';
      monthSpan.textContent = new Date(event.date).toLocaleString('default', { month: 'short' });
      dateDiv.appendChild(monthSpan);

      const daySpan = document.createElement('span');
      daySpan.className = 'preview-date-day';
      daySpan.textContent = new Date(event.date).getDate();
      dateDiv.appendChild(daySpan);

      previewItem.appendChild(dateDiv);

      const contentDiv = document.createElement('div');
      contentDiv.className = 'preview-content';

      const title = document.createElement('h4');
      title.className = 'preview-title';
      title.textContent = event.title;
      contentDiv.appendChild(title);

      const time = document.createElement('p');
      time.className = 'preview-subtitle';
      time.textContent = event.time || '';
      contentDiv.appendChild(time);

      previewItem.appendChild(contentDiv);

      const arrow = document.createElement('span');
      arrow.className = 'preview-arrow';
      arrow.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14"></path>
          <path d="m12 5 7 7-7 7"></path>
        </svg>
      `;
      previewItem.appendChild(arrow);

      upcomingEventsContainer.appendChild(previewItem);
    });

    // Make scrollable if more than 3
    makeScrollableIfNeeded(upcomingEventsContainer, 3);
  } catch (error) {
    upcomingEventsContainer.innerHTML = `<div class="text-red-500 text-center py-8">Failed to load events.</div>`;
    console.error(error);
  }
}

function restoreCalendarViewHTML() {
  const viewContainer = document.getElementById('view-container');
  viewContainer.innerHTML = `
    <div id="calendar-view">
      <div class="carousel">
        <div id="carousel-content" class="carousel-content"></div>
        <div class="carousel-controls flex items-center justify-center gap-4 mb-6">
          <button id="carousel-prev" class="carousel-nav-btn" type="button" aria-label="Previous Week">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
          </button>
          <button id="carousel-today" class="carousel-today-btn" type="button">Today</button>
          <button id="carousel-next" class="carousel-nav-btn" type="button" aria-label="Next Week">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m9 18 6-6-6-6"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="today-events">
        <div class="glass-effect card">
          <div class="card-header">
            <div class="card-title-container">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="#06b6d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
                <path d="m9 16 2 2 4-4"></path>
              </svg>
              <h2 class="card-title">Today's Events</h2>
            </div>
            <div id="today-date" class="today-date"></div>
          </div>
          <div class="card-content">
            <div id="today-events-container" class="scroll-area"></div>
          </div>
        </div>
        <div class="preview-cards">
          <div class="glass-effect card">
            <div class="card-header">
              <div class="card-title-container">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                <h3 class="card-title-small">Upcoming Events</h3>
              </div>
            </div>
            <div id="upcoming-events-container" class="card-content"></div>
          </div>
          <div class="glass-effect card">
            <div class="card-header">
              <div class="card-title-container">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                  <path d="m9 16 2 2 4-4"></path>
                </svg>
                <h3 class="card-title-small">Recent Responses</h3>
              </div>
            </div>
            <div id="recent-responses-container" class="card-content"></div>
          </div>
        </div>
      </div>
    </div>
    <div id="events-view" class="hidden"></div>
    <div id="response-view" class="hidden"></div>
    <div id="back-button-container" class="hidden"></div>
  `;
}

// Update your back button handler for event details:
function setupEventDetailsBackButton() {
  const backBtn = document.getElementById('event-details-back-btn');
  if (backBtn) {
    backBtn.onclick = (e) => {
      e.preventDefault();
      restoreCalendarViewHTML();
      setupEventListeners();
      renderDateCards();
      renderTodayEvents();
      renderUpcomingEvents();
      renderRecentResponses();
      // If you have sidebar/hamburger logic, call updateSidebarOnViewChange() here
    };
  }
}

async function renderRecentResponses() {
  const recentResponsesContainer = document.getElementById('recent-responses-container');
  recentResponsesContainer.innerHTML = '';

  try {
    const today = new Date();
today.setHours(0, 0, 0, 0);
const monday = startOfWeek(today, { weekStartsOn: 1 });
const yesterday = addDays(today, -1);

const days = eachDayOfInterval({ start: monday, end: yesterday });

const weekStart = formatDateString(monday);
const weekEndStr = formatDateString(yesterday);
const allResponsesRaw = await fetchResponsesInRange(weekStart, weekEndStr);

// Only include responses that match any day in the past week (not today)
let allResponses = allResponsesRaw.filter(r => {
  const rDate = new Date(r.date);
  return days.some(day => isSameDay(rDate, day));
});
    // Deduplicate by eventId + date
    const seen = new Set();
    allResponses = allResponses.filter(r => {
      const key = `${r.eventId}_${r.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by date descending
    allResponses.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (allResponses.length === 0) {
      recentResponsesContainer.innerHTML = `<div class="text-white-70 text-center py-8">No recent responses this week.</div>`;
      return;
    }
    allResponses.slice(0, 5).forEach(response => {
      const previewItem = createResponsePreviewItem(response);
      recentResponsesContainer.appendChild(previewItem);
    });
    makeScrollableIfNeeded(recentResponsesContainer, 3);
  } catch (error) {
    recentResponsesContainer.innerHTML = `<div class="text-red-500 text-center py-8">Failed to load recent responses.</div>`;
    console.error(error);
  }
}

async function handleSelectDay(dayEvent) {
  if (state.selectedDay && state.selectedDay.date.toDateString() === dayEvent.date.toDateString()) {
    handleBackToCalendar();
    return;
  }

  try {
    showDateLoader(); // Show loader before fetching
    
    // Format the date string correctly
    const dateStr = formatDateString(dayEvent.date);
    const responses = await fetchResponsesByDate(dateStr);
    console.log('Fetched responses for date:', dateStr, responses);

    // Convert responses to event format and update state
    state.selectedDay = {
      date: dayEvent.date,
      events: responses,
      responses: responses
    };


      state.activeView = 'events';
      renderEventsView();


  } catch (error) {
    console.error('Error fetching day events:', error);
    showToast('Error loading events');
  } finally {
    hideDateLoader(); // Hide loader when done
  }
}

// Update handleSelectEvent function
async function handleSelectEvent(event) {
  // Ensure we have an event ID
  if (!event.id) {
    console.error('Event has no ID:', event);
    showToast('Invalid event selected');
    return;
  }

  try {
    // Check for existing smart plan
    const existingPlan = await getSmartPlan(event.id);
    
    // Store both the event and the smart plan in state
state.selectedEvent = {
  ...event,
  id: event.id,
  aiResponse: event.aiResponse || {
    text: event.response || event.aiResponse?.text || '',
    resources: event.resources || event.aiResponse?.resources || []
  },
  smartPlan: existingPlan // or event.smartPlan
};
state.activeView = 'response'; // <-- Ensure this is set

    animateViewTransition(() => {
      state.activeView = 'response';
      renderResponseView();
    });
    
    showToast(`Viewing: ${event.title}`);

  } catch (error) {
    console.error('Error loading event details:', error);
    showToast('Error loading event details');
  }
}

function handleBackToCalendar() {
  // Update state
  state.selectedDay = null;
  state.selectedEvent = null;
  state.activeView = 'calendar';

  // Hide other views and show calendar view
  const calendarView = document.getElementById('calendar-view');
  const eventsView = document.getElementById('events-view');
  const responseView = document.getElementById('response-view');

  if (calendarView) calendarView.classList.remove('hidden');
  if (eventsView) eventsView.classList.add('hidden');
  if (responseView) responseView.classList.add('hidden');

  // Re-render calendar view
  renderCalendarView();
}

function handleBackToEvents() {
  if (state.selectedEvent?.fromEventCard) {
    // If coming from event card, go back to calendar view
    animateViewTransition(() => {
      state.selectedDay = null;
      state.selectedEvent = null;
      state.activeView = 'calendar';
      renderCalendarView();
    });
  } else {
    // Otherwise go back to events view
    animateViewTransition(() => {
      state.selectedEvent = null;
      state.activeView = 'events';
      renderEventsView();
    });
  }
}

function animateViewTransition(callback) {
  const viewContainer = document.getElementById('view-container');
  viewContainer.style.opacity = '0';
  viewContainer.style.transform = 'translateY(20px)';
  viewContainer.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
  
  setTimeout(() => {
    callback();
    
    requestAnimationFrame(() => {
      viewContainer.style.opacity = '1';
      viewContainer.style.transform = 'translateY(0)';
    });
  }, 300);
}

function renderCalendarView() {
  // Remove page title/subtitle and hide back button container
  const backBtnContainer = document.getElementById('back-button-container');
  if (backBtnContainer) {
    backBtnContainer.classList.add('hidden');
    backBtnContainer.innerHTML = '';
  }

  const calendarView = document.getElementById('calendar-view');
  const eventsView = document.getElementById('events-view');
  const responseView = document.getElementById('response-view');
  if (calendarView) calendarView.classList.remove('hidden');
  if (eventsView) eventsView.classList.add('hidden');
  if (responseView) responseView.classList.add('hidden');
}
// Update the renderEventsView function to include mobile-friendly containers
async function renderEventsView() {
  // Remove old content and add animated grid background
  const eventsView = document.getElementById('events-view');
  eventsView.innerHTML = '';

  // --- Main container ---
  const container = document.createElement('div');
  container.className = 'container';

  // --- Enhanced Header (Title only, moved up) ---
  const header = document.createElement('div');
  header.className = 'header';
  header.style.marginBottom = '0.5rem';
  header.style.justifyContent = 'flex-start';
  header.style.alignItems = 'flex-start';

  // Back button
  const backButton = document.createElement('a');
  backButton.href = '#';
  backButton.className = 'back-button';
  backButton.innerHTML = `
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
    </svg>
    <span>Back to Intelligence Hub</span>
  `;
  backButton.onclick = (e) => {
  e.preventDefault();
  handleBackToCalendar();
};

  // Title (moved up, no icon, no subtitle)
  const headerContent = document.createElement('div');
  headerContent.className = 'header-content';
  headerContent.innerHTML = `
    <h1 class="main-title" style="font-size:2.2rem;font-weight:800;margin:0;line-height:1.1;">
      Event Response Center
    </h1>
  `;

  header.appendChild(backButton);
  header.appendChild(headerContent);
  container.appendChild(header);

  // --- Date and Stats Header (Firebase stats) ---
  const dateStatsHeader = document.createElement('div');
  dateStatsHeader.className = 'date-stats-header';

  const dateStatsContainer = document.createElement('div');
  dateStatsContainer.className = 'date-stats-container';

  const dateStatsContent = document.createElement('div');
  dateStatsContent.className = 'date-stats-content';

  // Date info
  const dateObj = state.selectedDay?.date || new Date();
  const dateStr = dateObj.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  // --- Fetch stats from Firebase ---
  // We'll show: total events, total responses, completed plans, avg steps per plan
  let totalEvents = 0, totalResponses = 0, completedPlans = 0, avgSteps = 0;
  try {
    const weekStart = formatDateString(state.currentWeekStart);
const weekEnd = formatDateString(endOfWeek(state.currentWeekStart, { weekStartsOn: 1 }));
const events = await fetchEventsInRange(weekStart, weekEnd);
    const responses = state.selectedDay?.events || [];
    totalEvents = events.length;
    totalResponses = responses.length;
    completedPlans = responses.filter(r => Array.isArray(r.smartPlan?.stepProgress) && r.smartPlan.stepProgress.every(Boolean)).length;
    const stepsArr = responses.map(r => Array.isArray(r.smartPlan?.steps) ? r.smartPlan.steps.filter(s => !s.isBreak).length : 0);
    avgSteps = stepsArr.length ? Math.round(stepsArr.reduce((a, b) => a + b, 0) / stepsArr.length) : 0;
  } catch (e) {
    // fallback to 0s
  }

  dateStatsContent.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:0.5rem;">
      <div style="display:flex;align-items:center;gap:0.75rem;">
        <svg class="calendar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:22px;height:22px;">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
        <div>
          <h2 style="font-size:1.25rem;font-weight:700;margin:0;">${dateStr}</h2>
        </div>
      </div>
      <div style="display:flex;gap:2rem;margin-top:0.5rem;flex-wrap:wrap;">
        <div style="display:flex;flex-direction:column;align-items:center;">
          <span style="font-size:1.2rem;font-weight:700;color:#a78bfa;">${totalEvents}</span>
          <span style="font-size:0.95rem;color:#cbd5e1;">Total Events</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;">
          <span style="font-size:1.2rem;font-weight:700;color:#10b981;">${totalResponses}</span>
          <span style="font-size:0.95rem;color:#cbd5e1;">Responses</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;">
          <span style="font-size:1.2rem;font-weight:700;color:#eab308;">${completedPlans}</span>
          <span style="font-size:0.95rem;color:#cbd5e1;">Completed Plans</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;">
          <span style="font-size:1.2rem;font-weight:700;color:#06b6d4;">${avgSteps}</span>
          <span style="font-size:0.95rem;color:#cbd5e1;">Avg Steps/Plan</span>
        </div>
      </div>
    </div>
  `;

  dateStatsContainer.appendChild(dateStatsContent);
  dateStatsHeader.appendChild(dateStatsContainer);
  container.appendChild(dateStatsHeader);

  // --- Responses Grid ---
  const responsesGrid = document.createElement('div');
  responsesGrid.className = 'responses-grid';

  // Render each event as a response card
  (async () => {
    const events = state.selectedDay?.events || [];
    const cards = await Promise.all(events.map((event, idx) => createEnhancedEventCard(event, idx)));
    cards.forEach(card => responsesGrid.appendChild(card));
  })();

  container.appendChild(responsesGrid);

  // --- Place in the view ---
  eventsView.appendChild(container);

  // Update view visibility
  document.getElementById('calendar-view').classList.add('hidden');
  document.getElementById('events-view').classList.remove('hidden');
  document.getElementById('response-view').classList.add('hidden');
}

// --- Enhanced Event Card ---
async function createEnhancedEventCard(response, idx) {
  // Fetch all events once (cache for performance if needed)
  if (!window._allEventsCache) {
    window._allEventsCache = await fetchEvents();
  }
  const allEvents = window._allEventsCache;

  // Find the event that matches this response
  const eventData = allEvents.find(ev => ev.id === response.eventId) || {};

  // Use event title, fallback to response title
  const title = eventData.title || response.eventTitle || '(No Title)';

  // Use event description, fallback to empty
  const description = eventData.description || '';

  // Use event time, fallback to empty
  const time = eventData.time || '';

  // Use event priority, fallback to response priority or 'none'
  const priority = eventData.priority || response.priority || 'none';
  let priorityColor = "#10b981";
  if (priority === "high") priorityColor = "#ef4444";
  else if (priority === "medium") priorityColor = "#eab308";
  else if (priority === "none") priorityColor = "#64748b";

  // Use AI type from event
  const aiType = eventData.aiTaskType || '';

  // Use response for summary
  const summary = response.response
    ? response.response.replace(/(\*\*|__|\*|#)/g, '').substring(0, 120) + (response.response.length > 120 ? '...' : '')
    : 'No summary available.';

  // Steps completed percentage
const smartPlan = response.smartPlan || {};
const stepsArr = Array.isArray(smartPlan.steps) ? smartPlan.steps : [];
const stepProgressArr = Array.isArray(smartPlan.stepProgress) ? smartPlan.stepProgress : [];
// Only count non-break steps for both completed and total
const nonBreakSteps = stepsArr.map((s, i) => ({ ...s, idx: i })).filter(s => !s.isBreak);
const totalSteps = nonBreakSteps.length;
const completedSteps = nonBreakSteps.filter(s => stepProgressArr[s.idx]).length;
const percentComplete = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  // Date badge
  const dateObj = response.date ? new Date(response.date) : new Date();
  const dateBadge = document.createElement('div');
  dateBadge.className = 'date-badge';
  dateBadge.innerHTML = `
    <div class="date-month">${dateObj.toLocaleString('en-US', { month: 'short' }).toUpperCase()}</div>
    <div class="date-day">${dateObj.getDate()}</div>
    <div class="date-year">${dateObj.getFullYear()}</div>
  `;

  // Card container
  const card = document.createElement('div');
  card.className = 'response-card';
  card.style.animationDelay = `${idx * 200}ms`;

  // Click: show details
  card.onclick = () => handleSelectEvent({
    ...eventData,
    ...response,
    smartPlan: smartPlan
  });

  // Card main
  const cardMain = document.createElement('div');
  cardMain.className = 'card-main';

  // Card header
  const cardHeader = document.createElement('div');
  cardHeader.className = 'card-header';

  // Title and meta
  const left = document.createElement('div');
  left.innerHTML = `
    <h3 class="card-title">${title}</h3>
    <div class="card-meta">
      <div class="meta-item">
        <svg class="meta-icon clock-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12,6 12,12 16,14"></polyline>
        </svg>
        <span>${time || '—'}</span>
      </div>
      <div class="meta-item">
        <svg class="meta-icon zap-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2"></polygon>
        </svg>
        <span style="color:${priorityColor};text-transform:capitalize;">${priority}</span>
      </div>
    </div>
  `;

  // Right: Steps completed as percentage
  const right = document.createElement('div');
  right.className = 'card-right';
  right.innerHTML = `
    <div class="ai-score-container">
      <div class="ai-score-circle">
        <svg class="ai-score-bg" viewBox="0 0 36 36">
          <path class="score-bg-path"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
          <path class="score-progress-path"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            stroke-dasharray="${percentComplete}, 100" />
        </svg>
        <div class="ai-score-value">${percentComplete}%</div>
      </div>
      <div class="ai-score-label">Steps Complete</div>
    </div>
    <svg class="chevron-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <polyline points="9,18 15,12 9,6"></polyline>
    </svg>
  `;

  cardHeader.appendChild(left);
  cardHeader.appendChild(right);
  cardMain.appendChild(cardHeader);

  // Description (summary)
  const desc = document.createElement('p');
  desc.className = 'card-description';
  desc.textContent = summary;
  cardMain.appendChild(desc);

  // Info bubbles below summary
  const infoBubbles = document.createElement('div');
  infoBubbles.style.display = 'flex';
  infoBubbles.style.gap = '0.75rem';
  infoBubbles.style.marginTop = '0.5rem';

  // Priority bubble
  const priorityBubble = document.createElement('span');
  priorityBubble.textContent = `Priority: ${priority}`;
  priorityBubble.style.background = priorityColor + '22';
  priorityBubble.style.color = priorityColor;
  priorityBubble.style.padding = '0.25rem 0.75rem';
  priorityBubble.style.borderRadius = '999px';
  priorityBubble.style.fontWeight = '600';
  infoBubbles.appendChild(priorityBubble);

  // AI Task Type bubble (if any)
  if (aiType) {
    const aiTypeBubble = document.createElement('span');
    aiTypeBubble.textContent = `AI Type: ${aiType}`;
    aiTypeBubble.style.background = '#a78bfa22';
    aiTypeBubble.style.color = '#a78bfa';
    aiTypeBubble.style.padding = '0.25rem 0.75rem';
    aiTypeBubble.style.borderRadius = '999px';
    aiTypeBubble.style.fontWeight = '600';
    infoBubbles.appendChild(aiTypeBubble);
  }

  cardMain.appendChild(infoBubbles);

  // Card footer
  const cardFooter = document.createElement('div');
  cardFooter.className = 'card-footer';

  const statusIndicator = document.createElement('div');
  statusIndicator.className = 'status-indicator';
  statusIndicator.innerHTML = `
    <div class="status-badge status-completed">
      <div class="status-dot green"></div>
      <span>Response Generated</span>
    </div>
  `;

  cardFooter.appendChild(statusIndicator);
  cardMain.appendChild(cardFooter);

  // Assemble card
  const cardContent = document.createElement('div');
  cardContent.className = 'card-content';
  cardContent.appendChild(dateBadge);
  cardContent.appendChild(cardMain);

  card.appendChild(cardContent);

  return card;
}



const eventCardStyles = document.createElement('style');
eventCardStyles.textContent = `
  .events-container {
    display: flex;
    flex-direction: column;
    gap: 8rem;          /* Increased gap for parallax effect */
    padding: 25vh 3rem; /* Added top/bottom padding for scroll space */
    max-width: 900px;
    margin: 0 auto;
    position: relative;
    min-height: 100vh;
  }

  .event-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 1.25rem;
    padding: 3rem;      /* Increased padding */
    transition: all 0.4s ease;
    cursor: pointer;
    opacity: 0.5;       /* Dimmed by default */
    transform: scale(0.95);
    will-change: transform, opacity;
  }

  .event-card.active {
    opacity: 1;
    transform: scale(1);
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }

  .event-card:hover {
    background: rgba(255, 255, 255, 0.05);
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.1);
  }

  .event-header {
    display: flex;
    align-items: flex-start;
    gap: 2rem;             /* Increased from 1.25rem */
    margin-bottom: 2rem;   /* Increased from 1.25rem */
  }

  .time-badge {
    background: rgba(156, 118, 255, 0.1);
    color: rgb(156, 118, 255);
    padding: 1rem;         /* Increased from 0.75rem */
    border-radius: 1rem;
    text-align: center;
    min-width: 5rem;       /* Increased from 4rem */
    flex-shrink: 0;
  }

  .time-badge .hour {
    font-size: 1.25rem;
    font-weight: 600;
    line-height: 1.2;
    margin-bottom: 0.25rem;
  }

  .time-badge .period {
    font-size: 0.75rem;
    opacity: 0.9;
    font-weight: 500;
  }

  .event-info {
    flex: 1;
  }

  .event-title {
    color: rgba(255, 255, 255, 0.95);
    font-size: 1.75rem;    /* Increased from 1.1rem */
    font-weight: 700;      /* Increased from 600 */
    margin-bottom: 1rem;   /* Increased from 0.5rem */
    line-height: 1.3;
    letter-spacing: -0.02em;
  }

  .event-time {
    display: flex;
    align-items: center;
    gap: 0.75rem;         /* Increased from 0.5rem */
    color: rgba(255, 255, 255, 0.6);
    font-size: 1rem;      /* Increased from 0.9rem */
    margin-top: 0.5rem;   /* Added spacing */
  }

  .divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.06);
    margin: 2rem 0;       /* Increased from 1.25rem */
  }

  .ai-preview {
    background: rgba(156, 118, 255, 0.03);
    border-radius: 1rem;
    padding: 1.5rem;      /* Increased from 1.25rem */
  }

  .preview-header {
    display: flex;
    align-items: center;
    gap: 1rem;           /* Increased from 0.75rem */
    margin-bottom: 1.25rem; /* Increased from 1rem */
  }


  .ai-badge {
    background: rgba(156, 118, 255, 0.15);
    color: rgb(156, 118, 255);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.35rem 0.75rem;
    border-radius: 0.5rem;
  }

  .ai-label {
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.9rem;
    font-weight: 500;
  }

  .ai-text {
    color: rgba(255, 255, 255, 0.8);
    font-size: 0.95rem;
    line-height: 1.6;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

   .ai-text {
    color: rgba(255, 255, 255, 0.8);
    font-size: 1rem;     /* Increased from 0.95rem */
    line-height: 1.6;
    margin-top: 0.75rem; /* Added spacing */
  }

  @media (min-width: 768px) {
    .events-container {
      grid-template-columns: repeat(2, 1fr);
      gap: 4rem 3rem;   /* Vertical gap 4rem, horizontal gap 3rem */
      padding: 3rem;    /* Increased padding */
    }
  }
    /* Mobile-optimized event card styles */
  @media (max-width: 768px) {
    .events-container {
      gap: 0.75rem;
      padding: 0.75rem;
      min-height: auto;
    }

    .event-card {
      padding: 1rem;
      margin: 0;
      opacity: 1;
      transform: none !important;
      border-radius: 0.75rem;
      min-height: auto;
    }

    .event-header {
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }

    .time-badge {
      padding: 0.5rem;
      min-width: 3.5rem;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .time-badge .hour {
      font-size: 0.875rem;
      margin-bottom: 0;
    }

    .time-badge .period {
      font-size: 0.625rem;
    }

    .event-title {
      font-size: 1rem;
      margin-bottom: 0.25rem;
      line-height: 1.2;
    }

    .event-time {
      font-size: 0.75rem;
    }

    .divider {
      margin: 0.75rem 0;
    }

    .ai-preview {
      padding: 0.75rem;
    }

    .preview-header {
      margin-bottom: 0.5rem;
    }

    .ai-badge {
      padding: 0.25rem 0.5rem;
      font-size: 0.625rem;
    }

    .ai-label {
      font-size: 0.75rem;
    }

    .ai-text {
      font-size: 0.75rem;
      line-height: 1.4;
      -webkit-line-clamp: 2;
    }

    /* Disable parallax and scroll snapping on mobile */
    .events-container {
      scroll-snap-type: none;
      height: auto;
      padding: 0.75rem;
      overflow-y: visible;
    }

    .event-card {
      scroll-snap-align: none;
      margin: 0 0 0.75rem 0;
    }

    .event-card:last-child {
      margin-bottom: 0;
    }
  }
`;
document.head.appendChild(eventCardStyles);

function createEventCard(event) {
  const card = document.createElement('div');
  card.className = 'event-card';

  // Style: glassy, gradient, shadow, border
  card.style.background = 'linear-gradient(135deg, rgba(156,118,255,0.09) 0%, rgba(58,53,95,0.13) 100%)';
  card.style.border = '1.5px solid rgba(156,118,255,0.18)';
  card.style.boxShadow = '0 4px 32px rgba(156,118,255,0.10)';
  card.style.borderRadius = '1.25rem';
  card.style.padding = '2.25rem 2rem';
  card.style.marginBottom = '2rem';
  card.style.transition = 'background 0.2s, box-shadow 0.2s, transform 0.2s';
  card.onmouseover = () => {
    card.style.background = 'linear-gradient(135deg, rgba(156,118,255,0.18) 0%, rgba(58,53,95,0.18) 100%)';
    card.style.boxShadow = '0 8px 48px rgba(156,118,255,0.18)';
    card.style.transform = 'translateY(-4px) scale(1.02)';
  };
  card.onmouseout = () => {
    card.style.background = 'linear-gradient(135deg, rgba(156,118,255,0.09) 0%, rgba(58,53,95,0.13) 100%)';
    card.style.boxShadow = '0 4px 32px rgba(156,118,255,0.10)';
    card.style.transform = 'none';
  };

  const header = document.createElement('div');
  header.className = 'event-header';
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.gap = '1.5rem';
  header.style.marginBottom = '1.5rem';

  // Time badge
  const timeBadge = document.createElement('div');
  timeBadge.className = 'time-badge';
  timeBadge.style.background = 'rgba(156,118,255,0.13)';
  timeBadge.style.color = '#a78bfa';
  timeBadge.style.padding = '1rem 0.75rem';
  timeBadge.style.borderRadius = '1rem';
  timeBadge.style.textAlign = 'center';
  timeBadge.style.minWidth = '4.5rem';
  timeBadge.style.fontWeight = '700';
  timeBadge.style.fontSize = '1.1rem';

  const [time, period] = event.schedule[0].time.split(' ');
  timeBadge.innerHTML = `
    <div class="hour" style="font-size:1.25rem;font-weight:700;">${time}</div>
    <div class="period" style="font-size:0.8rem;opacity:0.8;">${period}</div>
  `;

  const info = document.createElement('div');
  info.className = 'event-info';
  info.style.flex = '1';

  const title = document.createElement('h3');
  title.className = 'event-title';
  title.textContent = event.title;
  title.style.fontSize = '1.35rem';
  title.style.fontWeight = '700';
  title.style.marginBottom = '0.5rem';
  title.style.color = '#fff';

  const timeRange = document.createElement('div');
  timeRange.className = 'event-time';
  timeRange.style.display = 'flex';
  timeRange.style.alignItems = 'center';
  timeRange.style.gap = '0.75rem';
  timeRange.style.color = '#c4b5fd';
  timeRange.style.fontSize = '1rem';
  timeRange.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
    ${event.schedule[0].time} - ${event.schedule[event.schedule.length - 1].time}
  `;

  info.appendChild(title);
  info.appendChild(timeRange);
  header.appendChild(timeBadge);
  header.appendChild(info);
  card.appendChild(header);

  if (event.aiResponse) {
    const divider = document.createElement('div');
    divider.className = 'divider';
    divider.style.height = '1px';
    divider.style.background = 'rgba(156,118,255,0.13)';
    divider.style.margin = '1.5rem 0';
    card.appendChild(divider);

    const aiPreview = document.createElement('div');
    aiPreview.className = 'ai-preview';
    aiPreview.style.background = 'rgba(156,118,255,0.06)';
    aiPreview.style.borderRadius = '1rem';
    aiPreview.style.padding = '1.25rem';

    const previewHeader = document.createElement('div');
    previewHeader.className = 'preview-header';
    previewHeader.style.display = 'flex';
    previewHeader.style.alignItems = 'center';
    previewHeader.style.gap = '0.75rem';
    previewHeader.style.marginBottom = '1rem';
    previewHeader.innerHTML = `
      <span class="ai-badge" style="background:linear-gradient(135deg,#9c76ff 0%,#8a5cf6 100%);color:#fff;padding:0.25rem 0.75rem;border-radius:0.5rem;font-size:0.8rem;font-weight:700;">AI</span>
      <span class="ai-label" style="color:#c4b5fd;font-size:0.95rem;font-weight:500;">Preview</span>
    `;

    const aiText = document.createElement('div');
aiText.className = 'ai-text';
const md = window.md || new window.markdownit();
aiText.innerHTML = md.render(event.aiResponse.text || '');
aiText.style.color = '#e0e7ff';
aiText.style.fontSize = '1rem';
aiText.style.lineHeight = '1.6';

aiPreview.appendChild(previewHeader);
aiPreview.appendChild(aiText);
card.appendChild(aiPreview);
  }

  card.addEventListener('click', () => handleSelectEvent(event));
  return card;
}
function setupParallaxScroll() {
  if (window.innerWidth <= 768) {
    const container = document.querySelector('.events-container');
    if (container) {
      container.style.cssText = `
        padding: 0.75rem;
        height: auto;
        overflow-y: visible;
      `;
    }
    return;
  }
  const cards = document.querySelectorAll('.event-card');
  if (cards.length <= 3) return;

  let options = {
    root: null,
    rootMargin: '-45% 0px -45% 0px',
    threshold: 0
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
        entry.target.style.transform = 'scale(1)';
      } else {
        entry.target.classList.remove('active');
        entry.target.style.transform = 'scale(0.95)';
      }
    });
  }, options);

  cards.forEach(card => observer.observe(card));

  // Add smooth scroll snapping and very large bottom padding
  document.querySelector('.events-container').style.cssText += `
    scroll-snap-type: y mandatory;
    height: 100vh;
    overflow-y: auto;
    padding: 25vh 3rem 150vh 3rem; /* Doubled bottom padding to 150vh */
  `;

  // Add margin to all cards except the last one
  cards.forEach((card, index) => {
    if (index === cards.length - 1) {
      card.style.cssText += `
        scroll-snap-align: center;
        margin: 20vh 0 100vh 0; /* Increased bottom margin to 100vh for last card */
      `;
    } else {
      card.style.cssText += `
        scroll-snap-align: center;
        margin: 20vh 0;
      `;
    }
  });
}

async function checkForExistingSmartPlan(eventId) {
  try {
    const userId = getCurrentUserId();
    const responseRef = doc(db, "users", userId, "responses", eventId);
    const responseDoc = await getDoc(responseRef);
    
    if (responseDoc.exists() && responseDoc.data().smartPlan) {
      return responseDoc.data().smartPlan;
    }
    return null;
  } catch (error) {
    console.error('Error checking for existing smart plan:', error);
    return null;
  }
}

function renderSmartPlanContent(plan, container) {
  // Clear container first
  container.innerHTML = '';
  
  // Create plan container with styling
  const planContainer = document.createElement('div');
  planContainer.className = 'smart-plan-container';
  Object.assign(planContainer.style, {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '0.75rem',
    padding: '1.5rem'
  });
  
  // Add header
  const header = document.createElement('div');
header.className = 'smart-plan-header';

header.innerHTML = `
  <div class="smart-plan-title-row">
    <svg width="32" height="32" fill="none" stroke="#e0aa3e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:0.5rem;">
      <polygon points="5 3 19 12 5 21 5 3"></polygon>
    </svg>
    <span class="smart-plan-title">${plan.title || 'Smart Plan'}</span>
  </div>
  <div class="smart-plan-meta">
    <span>${plan.totalDuration || ''}</span>
    <span style="color:#a78bfa;">•</span>
    <span>${plan.priority || 'Medium'} Priority</span>
  </div>
  <div class="smart-plan-desc">${plan.focusStrategy || plan.description || ''}</div>
`;
  planContainer.appendChild(header);
  
  // Add steps
  const stepsContainer = document.createElement('div');
  stepsContainer.className = 'smart-plan-steps';
  Object.assign(stepsContainer.style, {
    marginTop: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  });
  
  plan.steps.forEach((step, index) => {
    renderSmartPlanStep(step, index, stepsContainer);
  });
  planContainer.appendChild(stepsContainer);
  const controlsContainer = document.createElement('div');
  Object.assign(controlsContainer.style, {
    display: 'flex',
    gap: '1rem',
    marginTop: '2rem',
    borderTop: '1px solid rgba(156, 118, 255, 0.2)',
    paddingTop: '1.5rem'
  });

  // Start Task button
  const startButton = document.createElement('button');
  startButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.5rem;">
      <polygon points="5 3 19 12 5 21 5 3"></polygon>
    </svg>
    Start Task
  `;
  Object.assign(startButton.style, {
    display: 'flex',
    alignItems: 'center',
    padding: '0.75rem 1.5rem',
    backgroundColor: '#e0aa3e',
    color: '#000',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  });

  // Customize button
  const customizeButton = document.createElement('button');
  customizeButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.5rem;">
      <path d="M12 20h9"></path>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
    </svg>
    Customize Plan
  `;
  Object.assign(customizeButton.style, {
    display: 'flex',
    alignItems: 'center',
    padding: '0.75rem 1.5rem',
    backgroundColor: 'rgba(156, 118, 255, 0.1)',
    color: 'rgb(156, 118, 255)',
    border: '1px solid rgba(156, 118, 255, 0.3)',
    borderRadius: '0.5rem',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  });

  // Hover effects
  startButton.onmouseover = () => {
    startButton.style.backgroundColor = '#c99937';
  };
  startButton.onmouseout = () => {
    startButton.style.backgroundColor = '#e0aa3e';
  };

// Update the start button click handler in renderSmartPlanContent
startButton.addEventListener('click', async () => {
  try {
    console.log("Starting focus mode for event:", state.selectedEvent.id);
    
    // Show loading state
    startButton.disabled = true;
    startButton.innerHTML = `
      <svg class="animate-spin" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 6v6l4 2"></path>
      </svg>
      Starting...
    `;

    // Get event ID and encode it for URL
    const eventId = encodeURIComponent(state.selectedEvent.id);
    
    // Redirect to focus mode with event ID
    window.location.href = `focusMode.html?eventId=${eventId}`;

  } catch (error) {
    console.error('Error starting focus mode:', error);
    showToast('Failed to start focus mode');
    
    // Reset button state
    startButton.disabled = false;
    startButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.5rem;">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
      Start Task
    `;
  }
});

  customizeButton.onmouseover = () => {
    customizeButton.style.backgroundColor = 'rgba(156, 118, 255, 0.15)';
  };
  customizeButton.onmouseout = () => {
    customizeButton.style.backgroundColor = 'rgba(156, 118, 255, 0.1)';
  };

  // Customization panel (hidden by default)
  const customizationPanel = document.createElement('div');
  Object.assign(customizationPanel.style, {
    display: 'none',
    marginTop: '1.5rem',
    padding: '1.5rem',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '0.75rem',
    border: '1px solid rgba(156, 118, 255, 0.2)'
  });

  const textarea = document.createElement('textarea');
  textarea.placeholder = 'Describe how you\'d like to modify the plan. For example: "Split step 2 into two separate steps" or "Add a 15-minute break after step 3"';
  Object.assign(textarea.style, {
    width: '100%',
    minHeight: '120px',
    padding: '1rem',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    border: '1px solid rgba(156, 118, 255, 0.2)',
    borderRadius: '0.5rem',
    color: '#fff',
    fontSize: '14px',
    lineHeight: '1.5',
    resize: 'vertical',
    marginBottom: '1rem'
  });

  const updateButton = document.createElement('button');
  updateButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.5rem;">
      <path d="M20 6L9 17l-5-5"></path>
    </svg>
    Update Plan
  `;
  Object.assign(updateButton.style, {
    display: 'flex',
    alignItems: 'center',
    padding: '0.75rem 1.5rem',
    backgroundColor: 'rgb(156, 118, 255)',
    color: '#fff',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  });

  // Hover effect for update button
  updateButton.onmouseover = () => {
    updateButton.style.backgroundColor = 'rgb(137, 94, 255)';
  };
  updateButton.onmouseout = () => {
    updateButton.style.backgroundColor = 'rgb(156, 118, 255)';
  };

  // Event listeners
  customizeButton.addEventListener('click', () => {
    const isHidden = customizationPanel.style.display === 'none';
    customizationPanel.style.display = isHidden ? 'block' : 'none';
    customizeButton.style.backgroundColor = isHidden ? 'rgba(156, 118, 255, 0.2)' : 'rgba(156, 118, 255, 0.1)';
  });

  // Update the updateButton click handler in renderSmartPlanContent
updateButton.addEventListener('click', async () => {
  const customization = textarea.value.trim();
  if (!customization) {
    showToast('Please describe your desired changes');
    return;
  }

  // --- PLAN USAGE CHECK ---
  const allowed = await checkAndUpdateUsage('smartPlanUpdatePerDay');
  if (!allowed) {
    showToast('Limit reached', 'You have reached your daily Smart Plan update limit for your plan.', 'error');
    return;
  }

  try {
    showToast('Updating plan...');
    const API_BASE_URL = 'https://my-backend-three-pi.vercel.app';
    const response = await fetch(`${API_BASE_URL}/api/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': window.location.origin
      },
      credentials: 'include',
      body: JSON.stringify({
        eventId: state.selectedEvent.id,
        currentPlan: state.selectedEvent.smartPlan,
        customization: customization
      })
    });

    if (!response.ok) {
      throw new Error('Failed to update plan');
    }

    const { success, smartPlan } = await response.json();

    if (!success || !smartPlan) {
      throw new Error('Invalid response from server');
    }

    // Update the existing smart plan
    const updatedPlan = await updateSmartPlan(state.selectedEvent.id, smartPlan);

    // Update the UI with the new plan
    state.selectedEvent.smartPlan = updatedPlan;
    renderSmartPlanContent(updatedPlan, container);
    
    showToast('Plan updated successfully');

  } catch (error) {
    console.error('Error updating plan:', error);
    showToast('Failed to update plan');
  }
});

  // Assemble the panels
  customizationPanel.appendChild(textarea);
  customizationPanel.appendChild(updateButton);

  controlsContainer.appendChild(startButton);
  controlsContainer.appendChild(customizeButton);

  // Add everything to the main container
  planContainer.appendChild(controlsContainer);
  planContainer.appendChild(customizationPanel);
  // Add to container
  container.appendChild(planContainer);
}

function renderSmartPlanSection(eventCard, event) {
  const smartPlanContainer = document.createElement('div');
  Object.assign(smartPlanContainer.style, {
    borderTop: '1px solid #6d58b1',
    paddingTop: '1.5rem'
  });

  const smartPlanHeader = document.createElement('div');
  Object.assign(smartPlanHeader.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1.5rem'
  });

  const planTitle = document.createElement('p');
  planTitle.textContent = 'Smart Plan';
  Object.assign(planTitle.style, {
    fontSize: '16px',
    fontWeight: '600',
    color: '#e0aa3e'
  });

  smartPlanHeader.appendChild(planTitle);
  smartPlanContainer.appendChild(smartPlanHeader);

  if (event.smartPlan) {
    // Render existing plan
    renderSmartPlanContent(event.smartPlan, smartPlanContainer);
  } else {
    // Show empty state
    const emptyState = document.createElement('div');
    Object.assign(emptyState.style, {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      backgroundColor: 'rgba(255, 255, 255, 0.03)',
      borderRadius: '0.75rem',
      textAlign: 'center'
    });

    const emptyIcon = document.createElement('div');
    emptyIcon.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: rgba(156, 118, 255, 0.5); margin-bottom: 1rem;">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
      </svg>
    `;
    emptyState.appendChild(emptyIcon);

    const emptyText = document.createElement('p');
    emptyText.textContent = 'No plan generated yet. Click "Generate Plan" to create a step-by-step breakdown of your task.';
    Object.assign(emptyText.style, {
      color: 'rgba(255, 255, 255, 0.5)',
      fontSize: '14px',
      maxWidth: '280px',
      lineHeight: '1.5'
    });
    emptyState.appendChild(emptyText);

    const generateButton = document.createElement('button');
    generateButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
      </svg>
      Generate Plan
    `;
    Object.assign(generateButton.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.5rem 1rem',
      backgroundColor: 'rgba(156, 118, 255, 0.2)',
      color: 'rgb(156, 118, 255)',
      border: '1px solid rgba(156, 118, 255, 0.3)',
      borderRadius: '0.5rem',
      fontSize: '14px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'all 0.2s',
      marginTop: '1.5rem'
    });

    generateButton.addEventListener('click', async () => {
      const allowed = await checkAndUpdateUsage('smartPlanGenPerDay');
  if (!allowed) {
    showToast('Limit reached', 'You have reached your daily limit for smart plan generation.', 'error');
    return;
  }
      try {
    showToast('Generating smart plan...');
    const plan = await generateSmartPlan(event);
    renderSmartPlanContent(plan, smartPlanContainer);
  } catch (error) {
    console.error('Error generating plan:', error);
    showToast('Failed to generate plan');
  }
});

    emptyState.appendChild(generateButton);
    smartPlanContainer.appendChild(emptyState);
  }

  eventCard.appendChild(smartPlanContainer);
}

document.body.style.overflowY = 'auto';
const viewContainer = document.getElementById('view-container');
if (viewContainer) {
  viewContainer.style.overflowY = 'visible';
  viewContainer.style.maxHeight = 'none';
}

// --- Add this style block for renderResponseView-specific styles ---
function injectResponseViewStyles() {
  if (document.getElementById('response-view-theme-styles')) return;
  const style = document.createElement('style');
  style.id = 'response-view-theme-styles';
  style.textContent = `

   /* Make cards 80vw wide and centered on desktop, 100vw on mobile */
    #response-view .ai-prompt-card,
    #response-view .event-info-card,
    #response-view .plan-container {
      width: 80vw !important;
      max-width: 1100px !important;
      min-width: 0 !important;
      margin: 0 auto 1.5rem auto !important;
      box-sizing: border-box !important;
    }
    @media (max-width: 900px) {
      #response-view .ai-prompt-card,
      #response-view .event-info-card,
      #response-view .plan-container {
        width: 98vw !important;
        max-width: 100vw !important;
        padding: 1rem !important;
      }
    }
    @media (max-width: 600px) {
      #response-view .ai-prompt-card,
      #response-view .event-info-card,
      #response-view .plan-container {
        width: 100vw !important;
        max-width: 100vw !important;
        padding: 0.5rem !important;
        border-radius: 0.75rem !important;
        margin: 0 auto 1rem auto !important;
      }
      #response-view .ai-prompt-content {
        font-size: 0.95rem !important;
        line-height: 1.5 !important;
      }
    }
    /* Remove neural badge */
    #response-view .neural-badge { display: none !important; }
    /* Remove AI status in header */
    #response-view .ai-status { display: none !important; }
    /* Reduce vertical spacing for less scroll */
    #response-view .header { margin-bottom: 1.25rem !important; }
    #response-view .main-title { margin-top: 0 !important; }
    #response-view .container { padding-top: 0.5rem !important; }
    #response-view .main-content { gap: 1.5rem !important; }
    #response-view .tab-content { padding-top: 0 !important; }

    /* Only applies inside #response-view */
    #response-view .plan-container {
      max-width: 1100px;
      margin: 0 auto;
      box-shadow: 0 4px 32px rgba(224,170,62,0.10);
      background: rgba(224,170,62,0.07);
      border-radius: 1.5rem;
      padding: 2.5rem 2.5rem 2.5rem 2.5rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      transition: max-width 0.2s;
    }
    #response-view .plan-header svg {
      color: #e0aa3e;
    }
    #response-view .plan-title-header {
      color: #e0aa3e;
    }

    #response-view .initiate-button {
      background: linear-gradient(90deg, #e0aa3e 0%, #a78bfa 100%);
      color: #fff;
      border: none;
      border-radius: 1.25rem;
      padding: 1rem 2.25rem;
      font-weight: 700;
      font-size: 1.1rem;
      cursor: pointer;
      box-shadow: 0 4px 24px rgba(224,170,62,0.13);
      display: flex;
      align-items: center;
      gap: 0.75rem;
      transition: background 0.18s, box-shadow 0.18s;
      letter-spacing: 0.01em;
    }
    #response-view .initiate-button:hover {
      background: linear-gradient(90deg, #a78bfa 0%, #e0aa3e 100%);
      box-shadow: 0 8px 32px rgba(224,170,62,0.16);
    }
    #response-view textarea,
    #response-view #planCustomizeTextarea {
      width: 100%;
      min-height: 100px;
      padding: 1rem;
      background: rgba(0,0,0,0.18);
      border: 1.5px solid rgba(224,170,62,0.18);
      border-radius: 1rem;
      color: #fff;
      font-size: 1rem;
      margin-bottom: 1rem;
      resize: vertical;
      box-sizing: border-box;
      transition: border 0.18s;
    }
    #response-view textarea:focus,
    #response-view #planCustomizeTextarea:focus {
      border: 1.5px solid #e0aa3e;
      outline: none;
    }
    @media (max-width: 900px) {
      #response-view .plan-container {
        max-width: 98vw;
        padding: 1.25rem 0.5rem;
      }
    }
    @media (max-width: 600px) {
      #response-view .plan-container {
        max-width: 100vw;
        padding: 0.5rem 0.25rem;
        border-radius: 0.75rem;
      }
      #response-view .plan-header {
        flex-direction: column;
        gap: 0.5rem !important;
      }
      #response-view textarea,
      #response-view #planCustomizeTextarea {
        font-size: 0.95rem;
        padding: 0.75rem;
        border-radius: 0.75rem;
      }
      #response-view button,
      #response-view .plan-container button {
        font-size: 1rem;
        padding: 0.75rem 1.25rem;
        border-radius: 0.75rem;
      }
    }
      .neural-svg {
            width: 100%;
            height: 100%;
        }

        .neural-node {
            fill: url(#neuralGrad);
            animation: pulse 3s ease-in-out infinite;
        }

        .neural-connection {
            stroke: url(#neuralGrad);
            stroke-width: 0.5;
            opacity: 0.3;
        }

        @keyframes pulse {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 0.8; }
        }

        .container {
            position: relative;
            z-index: 10;
            padding: 1.5rem;
            max-width: 1792px;
            margin: 0 auto;
        }

        /* Enhanced Header */
        .header {
            display: flex;
            align-items: center;
            gap: 1.5rem;
            margin-bottom: 2rem;
        }

        .back-button {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.75rem 1.5rem;
            background: rgba(51, 65, 85, 0.5);
            backdrop-filter: blur(40px);
            border-radius: 1rem;
            border: 1px solid rgba(71, 85, 105, 1);
            color: white;
            text-decoration: none;
            font-weight: 500;
            transition: all 0.3s ease;
            cursor: pointer;
        }

        .back-button:hover {
            border-color: rgba(6, 182, 212, 0.5);
            background: rgba(71, 85, 105, 0.5);
            transform: scale(1.05);
        }

        .back-button svg {
            width: 20px;
            height: 20px;
            transition: transform 0.3s ease;
        }

        .back-button:hover svg {
            transform: translateX(-4px);
        }

        .header-content {
            flex: 1;
        }

        .header-main {
            display: flex;
            align-items: center;
            gap: 1rem;
            margin-bottom: 0.5rem;
        }

        .brain-icon-container {
            position: relative;
            padding: 0.75rem;
            background: linear-gradient(135deg, #06b6d4, #8b5cf6);
            border-radius: 1rem;
        }

        .brain-icon-container::after {
            content: '';
            position: absolute;
            top: -2px;
            right: -2px;
            width: 12px;
            height: 12px;
            background: #10b981;
            border-radius: 50%;
            animation: ping 2s infinite;
        }

        @keyframes ping {
            0% { opacity: 1; transform: scale(1); }
            75%, 100% { opacity: 0; transform: scale(2); }
        }

        .brain-icon {
            width: 24px;
            height: 24px;
            color: white;
        }

        .main-title {
            font-size: 4rem;
            font-weight: bold;
            background: linear-gradient(135deg, #06b6d4, #8b5cf6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .main-subtitle {
            font-size: 1.25rem;
            color: #cbd5e1;
        }

        .ai-status {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.5rem 1rem;
            background: rgba(16, 185, 129, 0.2);
            border-radius: 1rem;
            border: 1px solid rgba(16, 185, 129, 0.3);
        }

        .status-dot {
            width: 8px;
            height: 8px;
            background: #10b981;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }

        .status-text {
            font-size: 0.875rem;
            color: #10b981;
            font-weight: 500;
        }

        /* Navigation Tabs */
        .tabs-container {
            margin-bottom: 2rem;
        }

        .tabs-wrapper {
            background: rgba(51, 65, 85, 0.3);
            backdrop-filter: blur(40px);
            border-radius: 1rem;
            border: 1px solid rgba(71, 85, 105, 1);
            padding: 0.5rem;
        }

        .tabs {
            display: flex;
            gap: 0.5rem;
        }

        .tab {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.75rem 1.5rem;
            border-radius: 0.75rem;
            font-weight: 500;
            transition: all 0.3s ease;
            cursor: pointer;
            color: #94a3b8;
            background: transparent;
            border: none;
        }

        .tab:hover {
            color: white;
            background: rgba(71, 85, 105, 0.5);
        }

        .tab.active {
            background: linear-gradient(135deg, #06b6d4, #8b5cf6);
            color: white;
            box-shadow: 0 10px 20px rgba(6, 182, 212, 0.3);
        }

        .tab svg {
            width: 16px;
            height: 16px;
        }

        /* Main Content Grid */
        .content-grid {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 2rem;
        }

        /* Tab Content */
        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: block;
        }

        /* Overview Tab */
        .overview-container {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
        }

        .event-info-card {
            background: rgba(51, 65, 85, 0.3);
            backdrop-filter: blur(40px);
            border-radius: 1.5rem;
            border: 1px solid rgba(71, 85, 105, 1);
            padding: 2rem;
            transition: all 0.5s ease;
        }

        .event-info-card:hover {
            border-color: rgba(6, 182, 212, 0.3);
        }

        .event-info-header {
            display: flex;
            align-items: center;
            gap: 1rem;
            margin-bottom: 1.5rem;
        }

        .calendar-icon {
            width: 24px;
            height: 24px;
            color: #06b6d4;
        }

        .event-info-content {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            margin-bottom: 0.5rem;
        }

        .event-date {
            font-size: 1.125rem;
            font-weight: 600;
            color: white;
        }

        .active-badge {
            padding: 0.25rem 0.75rem;
            background: rgba(16, 185, 129, 0.2);
            border-radius: 1rem;
            border: 1px solid rgba(16, 185, 129, 0.3);
            font-size: 0.875rem;
            color: #10b981;
        }

        .event-title {
            font-size: 3rem;
            font-weight: bold;
            color: white;
            margin-bottom: 0.5rem;
        }

        .event-description {
            color: #94a3b8;
        }

        /* Event Metrics */
        .event-metrics {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 1.5rem;
            margin-bottom: 2rem;
        }

        .metric-card {
            text-align: center;
            padding: 1rem;
            background: rgba(71, 85, 105, 0.3);
            border-radius: 1rem;
            border: 1px solid rgba(71, 85, 105, 1);
        }

        .metric-value {
            font-size: 2rem;
            font-weight: bold;
            margin-bottom: 0.25rem;
        }

        .metric-value.cyan { color: #06b6d4; }
        .metric-value.green { color: #10b981; }
        .metric-value.purple { color: #8b5cf6; }

        .metric-label {
            font-size: 0.875rem;
            color: #94a3b8;
        }

        /* Smart Plan Section */
        .smart-plan {
            background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(6, 182, 212, 0.1));
            backdrop-filter: blur(10px);
            border-radius: 1.5rem;
            padding: 2rem;
            border: 1px solid rgba(139, 92, 246, 0.2);
            text-align: center;
        }

        .sparkles-container {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #8b5cf6, #06b6d4);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 1.5rem;
        }

        .sparkles-icon {
            width: 40px;
            height: 40px;
            color: white;
            animation: pulse 2s infinite;
        }

        .plan-title {
            font-size: 2rem;
            font-weight: bold;
            color: white;
            margin-bottom: 1rem;
        }

        .plan-description {
            color: #cbd5e1;
            font-size: 1.125rem;
            margin-bottom: 2rem;
        }

        .generate-button {
            padding: 1rem 2rem;
            background: linear-gradient(135deg, #8b5cf6, #06b6d4);
            border-radius: 1rem;
            color: white;
            font-weight: bold;
            font-size: 1.125rem;
            border: none;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .generate-button:hover {
            background: linear-gradient(135deg, #7c3aed, #0891b2);
            transform: scale(1.05);
            box-shadow: 0 20px 40px rgba(139, 92, 246, 0.25);
        }

        .loading-button {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }

        .spinner {
            width: 20px;
            height: 20px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top: 2px solid white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        /* Plan Tab */
        .plan-container {
            background: rgba(51, 65, 85, 0.3);
            backdrop-filter: blur(40px);
            border-radius: 1.5rem;
            border: 1px solid rgba(71, 85, 105, 1);
            padding: 2rem;
        }

        .plan-header {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            margin-bottom: 1.5rem;
        }

        .plan-title-header {
            font-size: 2rem;
            font-weight: bold;
            color: white;
        }

        .plan-phases {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
        }

        /* --- CLARITY-FOCUSED PHASE CARD --- */
.phase-card {
  background: linear-gradient(
    135deg,
    rgba(156,118,255,0.08) 0%,
    rgba(224,170,62,0.08) 100%
  ) !important;
  border-radius: 1.25rem !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
  box-shadow: 0 6px 28px rgba(0,0,0,0.25) !important;
  color: #fff !important;
  padding: 2rem 1.75rem !important;
  margin: 0 auto 2rem auto !important;
  max-width: 820px !important;
  min-height: 200px !important;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}

.phase-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 36px rgba(0,0,0,0.35);
}

/* Header */
.phase-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.phase-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #fff;
  margin: 0;
}

.phase-time {
  padding: 0.25rem 0.75rem;
  background: rgba(6,182,212,0.15);
  border-radius: 0.75rem;
  border: 1px solid rgba(6,182,212,0.25);
  font-size: 0.85rem;
  color: #06b6d4;
  font-weight: 600;
}

/* Description = smaller, lighter */
.phase-description {
  color: #94a3b8;
  font-size: 0.75rem;   /* small */
  line-height: 1.45;

  opacity: 0.85;
  margin: 0.25rem 0 0.5rem 0;
}

/* Details = bigger + spaced out */
.phase-details {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  margin-top: 0.25rem;
}

.phase-detail {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  font-size: 1rem;   /* bigger */
  line-height: 1.6;
  padding: 1rem 1.25rem;
  border-radius: 1rem;
  background: rgba(255,255,255,0.06);
  font-weight: 500;
}

.phase-detail svg {
  flex-shrink: 0;
  opacity: 0.95;
  margin-top: 0.15rem;
  width: 22px;
  height: 22px;
}

.phase-detail.tip {
  border-left: 4px solid #8b5cf6;
  color: #e9d5ff;
  background: rgba(139,92,246,0.12);
}
.phase-detail.note {
  border-left: 4px solid #facc15;
  color: #fef9c3;
  background: rgba(250,204,21,0.12);
}
.phase-detail.goal {
  border-left: 4px solid #22c55e;
  color: #bbf7d0;
  background: rgba(34,197,94,0.12);
}

/* Responsive */
@media (max-width: 900px) {
  .phase-card {
    padding: 1.5rem 1rem !important;
    max-width: 95% !important;
    min-height: 180px !important;
  }
  .phase-title {
    font-size: 1.05rem;
  }
  .phase-description {
    font-size: 0.7rem;
  }
  .phase-detail {
    font-size: 0.92rem;
    padding: 0.85rem 0.75rem;
  }
}

@media (max-width: 600px) {
  .phase-card {
    padding: 1rem 0.75rem !important;
    margin-bottom: 1rem !important;
    border-radius: 0.9rem !important;
    min-height: 160px !important;
  }
  .phase-title {
    font-size: 0.95rem;
  }
  .phase-description {
    font-size: 0.68rem;
  }
  .phase-detail {
    font-size: 0.85rem;
    padding: 0.65rem 0.5rem;
  }
}


    @media (max-width: 900px) {
   .plan-actions-row button,
  #seePlanButton,
  #initiateSessionBtnOverview {
    font-size: 1rem !important;
    padding: 0.55rem 0.5rem !important;
    border-radius: 0.65rem !important;
    min-width: 0 !important;
    width: 100% !important;
    max-width: 100vw !important;
    height: auto !important;
    line-height: 1.2 !important;
  }
}

    .phase-stepper-enhanced-indicator {
      margin: 1.5rem auto 1.5rem auto;
      padding: 1.25rem 2rem;
      background: linear-gradient(90deg, #1e293b 0%, #312e81 100%);
      border-radius: 1.25rem;
      box-shadow: 0 2px 16px rgba(156,118,255,0.08);
      color: #e0e7ff;
      font-size: 1.1rem;
      font-weight: 600;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      border: 1.5px solid rgba(156,118,255,0.13);
      max-width: 540px;
    }
    .phase-stepper-enhanced-indicator button {
      margin-top: 0.5rem;
    }
    /* --- Mobile Swipe Wrapper --- */
    .swipe-phase-wrapper {
      width: 100vw;
      overflow: hidden;
      position: relative;
      touch-action: pan-y;
    }
    .swipe-phase-inner {
      display: flex;
      width: 100vw;
      transition: transform 0.35s cubic-bezier(.4,1.4,.4,1);
      will-change: transform;
    }
    .mobile-step-indicator {
      width: 100vw;
      display: flex;
      justify-content: center;
      align-items: center;
      margin-bottom: 1.5rem;
    }

        /* --- UPDATE PLAN BOX --- */
    .plan-customize {
    background: linear-gradient(135deg, rgba(156,118,255,0.10), rgba(224,170,62,0.10));
    border-radius: 1.25rem;
    padding: 2rem 2rem 1.5rem 2rem;
    margin-top: 2.5rem;
    box-shadow: 0 2px 16px rgba(156,118,255,0.06);
    border: 1.5px solid rgba(156,118,255,0.13);
    color: #e0e7ff;
    font-size: 1.08rem;
    transition: box-shadow 0.2s;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .plan-customize textarea {
    border-radius: 1rem;
    font-size: 1.08rem;
    background: rgba(51,65,85,0.18);
    color: #e0e7ff;
    border: 1.5px solid rgba(156,118,255,0.18);
    padding: 1rem;
    margin-bottom: 1rem;
    font-family: inherit;
    transition: border 0.18s;
    width: 100%;
    resize: vertical;
  }
  .plan-customize textarea:focus {
    border: 1.5px solid #e0aa3e;
    outline: none;
  }
  .plan-customize button {
    border-radius: 1rem;
    font-size: 1.08rem;
    padding: 0.75rem 1.5rem;
    background: linear-gradient(90deg, #e0aa3e 0%, #a78bfa 100%);
    color: #fff;
    font-weight: 700;
    border: none;
    box-shadow: 0 4px 24px rgba(224,170,62,0.13);
    transition: background 0.18s, box-shadow 0.18s;
    margin-top: 0.5rem;
    align-self: flex-end;
  }
  .plan-customize button:hover {
    background: linear-gradient(90deg, #a78bfa 0%, #e0aa3e 100%);
    box-shadow: 0 8px 32px rgba(224,170,62,0.16);
  }
  @media (max-width: 600px) {
    .plan-customize {
      padding: 1rem 0.5rem 1rem 0.5rem;
      border-radius: 0.85rem;
      font-size: 0.98rem;
    }
    .plan-customize textarea {
      font-size: 0.98rem;
      padding: 0.75rem;
      border-radius: 0.75rem;
    }
    .plan-customize button {
      font-size: 0.98rem;
      padding: 0.65rem 1rem;
      border-radius: 0.75rem;
    }
  }

        .check-icon {
            width: 16px;
            height: 16px;
            color: #10b981;
        }

        /* Insights Tab */
        .insights-container {
            background: rgba(51, 65, 85, 0.3);
            backdrop-filter: blur(40px);
            border-radius: 1.5rem;
            border: 1px solid rgba(71, 85, 105, 1);
            padding: 2rem;
        }

        .insights-header {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            margin-bottom: 1.5rem;
        }

        .trending-icon {
            width: 24px;
            height: 24px;
            color: #10b981;
        }

        .insights-title {
            font-size: 2rem;
            font-weight: bold;
            color: white;
        }

        .insights-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 1.5rem;
        }

        .insight-card {
            background: rgba(71, 85, 105, 0.3);
            border-radius: 1rem;
            padding: 1.5rem;
            border: 1px solid rgba(71, 85, 105, 1);
        }

        .success-probability {
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .probability-title {
            font-size: 1.125rem;
            font-weight: bold;
            color: white;
            margin-bottom: 1rem;
        }

        .circular-progress {
            position: relative;
            width: 96px;
            height: 96px;
        }

        .progress-circle {
            width: 96px;
            height: 96px;
            transform: rotate(-90deg);
        }

        .progress-bg {
            fill: none;
            stroke: rgb(51, 65, 85);
            stroke-width: 3;
        }

        .progress-fill {
            fill: none;
            stroke: rgb(16, 185, 129);
            stroke-width: 3;
            stroke-dasharray: 94, 100;
            animation: pulse 2s infinite;
        }

        .progress-text {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.25rem;
            font-weight: bold;
            color: #10b981;
        }

        .optimization-score {
            display: flex;
            flex-direction: column;
        }

        .score-title {
            font-size: 1.125rem;
            font-weight: bold;
            color: white;
            margin-bottom: 1rem;
        }

        .score-metrics {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }

        .score-metric {
            display: flex;
            flex-direction: column;
        }

        .metric-header {
            display: flex;
            justify-content: between;
            margin-bottom: 0.25rem;
        }

        .metric-name {
            font-size: 0.875rem;
            color: #94a3b8;
        }

        .metric-percentage {
            font-size: 0.875rem;
            color: #06b6d4;
        }

        .progress-bar {
            width: 100%;
            height: 8px;
            background: rgb(71, 85, 105);
            border-radius: 4px;
            overflow: hidden;
        }

        .progress-fill-bar {
            height: 100%;
            border-radius: 4px;
        }

        .efficiency-bar {
            background: linear-gradient(135deg, #06b6d4, #3b82f6);
            width: 92%;
        }

        .quality-bar {
            background: linear-gradient(135deg, #8b5cf6, #ec4899);
            width: 89%;
        }

        /* Chat Tab */
        .chat-container {
            background: rgba(51, 65, 85, 0.3);
            backdrop-filter: blur(40px);
            border-radius: 1.5rem;
            border: 1px solid rgba(71, 85, 105, 1);
            padding: 2rem;
        }

        .chat-header {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            margin-bottom: 1.5rem;
        }

        .message-icon {
            width: 24px;
            height: 24px;
            color: #8b5cf6;
        }

        .chat-title {
            font-size: 2rem;
            font-weight: bold;
            color: white;
        }

        .chat-messages {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            margin-bottom: 1.5rem;
        }

        .message {
            display: flex;
        }

        .message.ai {
            justify-content: flex-start;
        }

        .message.user {
            justify-content: flex-end;
        }

        .message-bubble {
            max-width: 75%;
            padding: 1rem;
            border-radius: 1rem;
        }

        .message-bubble.ai {
            background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.2));
            border: 1px solid rgba(139, 92, 246, 0.3);
            color: white;
        }

        .message-bubble.user {
            background: rgba(71, 85, 105, 0.5);
            border: 1px solid rgba(71, 85, 105, 1);
            color: #cbd5e1;
        }

        .chat-input-container {
            display: flex;
            gap: 0.75rem;
        }

        .chat-input {
            flex: 1;
            padding: 0.75rem 1rem;
            background: rgba(71, 85, 105, 0.5);
            border: 1px solid rgba(71, 85, 105, 1);
            border-radius: 0.75rem;
            color: white;
            font-size: 1rem;
        }

        .chat-input::placeholder {
            color: #94a3b8;
        }

        .chat-input:focus {
            outline: none;
            border-color: rgba(6, 182, 212, 0.5);
        }

        .send-button {
            padding: 0.75rem 1.5rem;
            background: linear-gradient(135deg, #8b5cf6, #06b6d4);
            border-radius: 0.75rem;
            color: white;
            font-weight: 500;
            border: none;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .send-button:hover {
            background: linear-gradient(135deg, #7c3aed, #0891b2);
        }

        /* Sidebar */
        .sidebar {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
        }

        .ai-prompt-card {
            background: rgba(51, 65, 85, 0.3);
            backdrop-filter: blur(40px);
            border-radius: 1.5rem;
            border: 1px solid rgba(71, 85, 105, 1);
            padding: 1.5rem;
            transition: all 0.5s ease;
        }

        .ai-prompt-card:hover {
            border-color: rgba(251, 191, 36, 0.3);
        }

        .prompt-header {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            margin-bottom: 1.5rem;
        }

        .star-container {
            padding: 0.5rem;
            background: linear-gradient(135deg, #fbbf24, #f97316);
            border-radius: 0.75rem;
        }

        .star-icon {
            width: 24px;
            height: 24px;
            color: white;
        }

        .prompt-title-section {
            display: flex;
            flex-direction: column;
        }

        .prompt-title {
            font-size: 1.25rem;
            font-weight: bold;
            color: white;
        }

        .neural-badge {
            padding: 0.25rem 0.75rem;
            background: rgba(16, 185, 129, 0.2);
            color: #10b981;
            font-size: 0.875rem;
            border-radius: 1rem;
            border: 1px solid rgba(16, 185, 129, 0.3);
            margin-top: 0.25rem;
            align-self: flex-start;
        }

        .prompt-content {
            background: linear-gradient(135deg, rgba(51, 65, 85, 0.8), rgba(71, 85, 105, 0.8));
            backdrop-filter: blur(10px);
            border-radius: 1rem;
            padding: 1.5rem;
            border: 1px solid rgba(71, 85, 105, 0.5);
            margin-bottom: 1.5rem;
        }

        .prompt-steps {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            color: #cbd5e1;
        }

        .prompt-step {
            display: flex;
            align-items: flex-start;
            gap: 0.75rem;
        }

        .step-number {
            flex-shrink: 0;
            width: 24px;
            height: 24px;
            background: linear-gradient(135deg, #fbbf24, #f97316);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.75rem;
            font-weight: bold;
            color: #1f2937;
        }

        .step-text {
            font-size: 0.875rem;
        }

        .enhanced-protocol {
            padding: 1rem;
            background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.2));
            border-radius: 0.75rem;
            border: 1px solid rgba(16, 185, 129, 0.3);
            margin-bottom: 1.5rem;
        }

        .protocol-header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.5rem;
        }

        .brain-small-icon {
            width: 20px;
            height: 20px;
            color: #10b981;
        }

        .protocol-title {
            color: #10b981;
            font-weight: 600;
        }

        .protocol-text {
            color: rgba(16, 185, 129, 0.8);
            font-size: 0.875rem;
        }

        .initiate-button {
            width: 100%;
            padding: 1rem 1.5rem;
            background: linear-gradient(135deg, #f97316, #dc2626);
            border-radius: 1rem;
            color: white;
            font-weight: bold;
            font-size: 1.125rem;
            border: none;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.75rem;
        }

        .initiate-button:hover {
            background: linear-gradient(135deg, #ea580c, #b91c1c);
            transform: scale(1.02);
            box-shadow: 0 20px 40px rgba(249, 115, 22, 0.25);
        }

        .zap-icon {
            width: 20px;
            height: 20px;
        }

        /* Mobile Responsive Styles */
        @media (max-width: 1024px) {
            .content-grid {
                grid-template-columns: 1fr;
                gap: 1.5rem;
            }

            .main-title {
                font-size: 3rem;
            }

            .event-title {
                font-size: 2.5rem;
            }
        }

        @media (max-width: 768px) {
            .container {
                padding: 1rem;
            }

            .header {
                flex-direction: column;
                align-items: flex-start;
                gap: 1rem;
            }

            .back-button {
                align-self: flex-start;
                padding: 0.5rem 1rem;
                font-size: 0.875rem;
            }

            .back-button svg {
                width: 16px;
                height: 16px;
            }

            .main-title {
                font-size: 2.5rem;
            }

            .main-subtitle {
                font-size: 1rem;
            }

            .tabs {
                flex-direction: column;
                gap: 0.25rem;
            }

            .tab {
                justify-content: center;
                padding: 0.75rem 1rem;
            }

            .event-metrics {
                grid-template-columns: 1fr;
                gap: 1rem;
            }

            .event-title {
                font-size: 2rem;
            }

            .plan-title {
                font-size: 1.5rem;
            }

            .plan-description {
                font-size: 1rem;
            }

            .insights-grid {
                grid-template-columns: 1fr;
            }

            .circular-progress,
            .progress-circle {
                width: 80px;
                height: 80px;
            }

            .message-bubble {
                max-width: 90%;
            }

            .chat-input-container {
                flex-direction: column;
                gap: 0.5rem;
            }

            .send-button {
                align-self: stretch;
            }
        }

        @media (max-width: 480px) {
            .container {
                padding: 0.5rem;
            }

            .event-info-card,
            .plan-container,
            .insights-container,
            .chat-container,
            .ai-prompt-card {
                border-radius: 1rem;
                padding: 1rem;
            }

            .main-title {
                font-size: 2rem;
            }

            .main-subtitle {
                font-size: 0.875rem;
            }

            .event-title {
                font-size: 1.5rem;
            }

            .tabs {
                gap: 0.125rem;
            }

            .tab {
                padding: 0.5rem 0.75rem;
                font-size: 0.875rem;
            }

            .tab svg {
                width: 14px;
                height: 14px;
            }

            .metric-value {
                font-size: 1.5rem;
            }

            .plan-title,
            .insights-title,
            .chat-title {
                font-size: 1.5rem;
            }

            .back-button span {
                display: none;
            }

            .prompt-steps {
                gap: 0.75rem;
            }

            .step-text {
                font-size: 0.75rem;
            }

            .circular-progress,
            .progress-circle {
                width: 64px;
                height: 64px;
            }

            .progress-text {
                font-size: 1rem;
            }
        }

        @media (max-width: 320px) {
            .main-title {
                font-size: 1.75rem;
            }

            .event-title {
                font-size: 1.25rem;
            }

            .tab {
                padding: 0.4rem 0.5rem;
                font-size: 0.75rem;
            }

            .metric-value {
                font-size: 1.25rem;
            }

            .metric-label {
                font-size: 0.75rem;
            }

            .plan-title,
            .insights-title,
            .chat-title {
                font-size: 1.25rem;
            }

            .step-text {
                font-size: 0.7rem;
            }
        }
            @media (max-width: 600px) {
  #response-view .ai-prompt-card .prompt-content {
    font-size: 0.95rem !important;
    line-height: 1.5 !important;
  }
}

.response-back-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 1.5rem;
  background: rgba(156,118,255,0.13);
  color: #a78bfa;
  border: none;
  border-radius: 9999px;
  font-size: 1.08rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(156,118,255,0.08);
  transition: background 0.2s, color 0.2s;
}
.response-back-btn:hover {
  background: rgba(156,118,255,0.22);
  color: #fff;
}
@media (max-width: 600px) {
  .response-back-btn {
    font-size: 0.95rem;
    padding: 0.5rem 1rem;
    margin-bottom: 1rem;
  }
  .response-back-btn svg {
    width: 18px !important;
    height: 18px !important;
  }
  .response-back-btn span {
    display: none !important;
  }
}
  `;
  document.head.appendChild(style);
}

function showPlanLoadingOverlayWithMessages(planContainer) {
  let overlay = planContainer.querySelector('.plan-loading-overlay');
  const messages = [
    "This may take a minute...",
    "All good things take time.",
    "Crafting your personalized plan...",
    "Almost there, hang tight!",
    "AI is thinking deeply for you...",
    "Optimizing your steps for success..."
  ];
  let idx = 0;
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'plan-loading-overlay';
    Object.assign(overlay.style, {
  position: 'absolute',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(24,24,36,0.85)',
  zIndex: 9999, // <-- Higher z-index
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '1.5rem',
  transition: 'opacity 0.2s',
  flexDirection: 'column',
  minHeight: '340px', // <-- Increased height
  height: '340px',    // <-- Increased height
});
    overlay.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:1.5rem;">
        <div class="spinner" style="width:48px;height:48px;border:5px solid #a78bfa;border-top:5px solid #e0aa3e;border-radius:50%;animation:spin 1s linear infinite;"></div>
        <div class="plan-loader-message" style="color:#fff;font-size:1.25rem;font-weight:600;">${messages[0]}</div>
      </div>
      <style>
        @keyframes spin { to { transform: rotate(360deg); } }
      </style>
    `;
    planContainer.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  // Message rotation
  const msgDiv = overlay.querySelector('.plan-loader-message');
  overlay._interval = setInterval(() => {
    idx = (idx + 1) % messages.length;
    msgDiv.textContent = messages[idx];
  }, 2200);
  // Store interval for cleanup
  overlay._cleanup = () => clearInterval(overlay._interval);
}

function hidePlanLoadingOverlay(planContainer) {
  const overlay = planContainer.querySelector('.plan-loading-overlay');
  if (overlay) {
    overlay.style.display = 'none';
    if (overlay._cleanup) overlay._cleanup();
  }
  // Also remove progress loader
  const progressEl = planContainer.querySelector('.plan-progress-timeline');
  if (progressEl && progressEl._cleanup) progressEl._cleanup();
}

function showPlanProgressHorizontal(container, isPlanReadyCallback) {
  // Remove previous progress if any
  const old = container.querySelector('.plan-progress-timeline');
  if (old) old.remove();

  const planProgressSteps = [
    "Initializing",
    "Gathering Info",
    "Analysing",
    "Optimizing",
    "Finalizing",
    "Done!"
  ];

  let planProgressStepIdx = 0;
  let planProgressFinished = false;
  let planProgressExtraStepActive = false;
  let planProgressInterval = null;

  // Create wrapper
  const wrapper = document.createElement("div");
  wrapper.className = "plan-progress-timeline";
  wrapper.style.marginTop = "1.5rem";
  wrapper.style.marginBottom = "0.5rem";
  wrapper.style.display = "flex";
  wrapper.style.justifyContent = "center";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "1.2rem";
  wrapper.style.background = "none";
  wrapper.style.boxShadow = "none";
  wrapper.style.borderRadius = "0";
  wrapper.style.padding = "0";
  wrapper.style.zIndex = "10000";

  wrapper.innerHTML = planProgressSteps.map((step, idx) => `
    <div class="progress-step" data-step="${idx}" style="flex:1;display:flex;flex-direction:column;align-items:center;">
      <div class="progress-circle">${idx + 1}</div>
      <div class="progress-label">${step}</div>
    </div>
  `).join('');

  container.appendChild(wrapper);

  // Animate steps
  planProgressInterval = setInterval(async () => {
    if (planProgressStepIdx < planProgressSteps.length) {
      const stepEl = wrapper.querySelector(`[data-step="${planProgressStepIdx}"]`);
      if (stepEl) {
        stepEl.classList.add("completed", "active");
        if (planProgressStepIdx > 0) {
          const prevEl = wrapper.querySelector(`[data-step="${planProgressStepIdx - 1}"]`);
          if (prevEl) prevEl.classList.remove("active");
        }
      }
      planProgressStepIdx++;
    } else {
      // At last step, check if plan is ready
      if (typeof isPlanReadyCallback === "function" && !(await isPlanReadyCallback())) {
        if (!planProgressExtraStepActive) {
          planProgressExtraStepActive = true;
          // Add extra step
          const extraStep = document.createElement("div");
          extraStep.className = "progress-step extra resolving";
          extraStep.innerHTML = `
            <div class="progress-circle" style="background:#f59e42;border-color:#f59e42;color:#fff;">!</div>
            <div class="progress-label" style="color:#f59e42;">Resolving challenge...</div>
          `;
          wrapper.appendChild(extraStep);
          setTimeout(() => {
            extraStep.classList.add("completed");
          }, 3000);
        }
      } else {
        // Progress finished, hide loader
        clearInterval(planProgressInterval);
        wrapper.remove();
      }
    }
  }, 1000);

  // Attach cleanup for later
  wrapper._cleanup = () => {
    clearInterval(planProgressInterval);
    wrapper.remove();
  };
}

// Add styles once
if (!document.getElementById("plan-progress-style")) {
  const style = document.createElement("style");
  style.id = "plan-progress-style";
  style.textContent = `
.plan-progress-timeline {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1.2rem;
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
  background: none !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  padding: 0 !important;
}
.progress-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  opacity: 0.6;
  transition: all .3s ease;
}
.progress-circle {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--progress-inactive);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  background: transparent;
  color: var(--progress-inactive);
  transition: all .3s ease;
  margin-bottom: 2px;
  writing-mode: vertical-lr; /* <-- Ensures numbers are upright */
  transform: rotate(0deg);   /* <-- Ensures numbers are not rotated */
}
.progress-label {
  font-size: 10px;
  margin-top: 2px;
  text-align: center;
  line-height: 1.2;
  font-weight: 500;
  color: var(--progress-inactive);
  transition: all .3s ease;
}
.progress-step.completed .progress-circle {
  background: var(--progress-completed);
  border-color: var(--progress-completed);
  color: #fff;
  box-shadow: 0 0 4px var(--progress-completed-glow);
}
.progress-step.completed .progress-label {
  color: var(--progress-completed);
  font-weight: 600;
  opacity: 1;
}
.progress-step.active .progress-circle {
  background: var(--progress-active);
  border-color: var(--progress-active);
  color: #fff;
  box-shadow: 0 0 4px var(--progress-active-glow);
}
.progress-step.active .progress-label {
  color: var(--progress-active);
  font-weight: 700;
  opacity: 1;
}
.progress-step.extra.resolving .progress-circle {
  background: #f59e42;
  border-color: #f59e42;
  color: #fff;
  box-shadow: 0 0 6px #f59e4255;
}
.progress-step.extra.resolving .progress-label {
  color: #f59e42;
  font-weight: 700;
  opacity: 1;
}
/* Light theme vars */
:root {
  --progress-inactive: #d1d5db;
  --progress-active: #6366f1;
  --progress-completed: #22c55e;
  --progress-active-glow: #6366f155;
  --progress-completed-glow: #22c55e55;
}
/* Dark theme overrides */
.dark {
  --progress-inactive: #52525b;
  --progress-active: #6366f1;
  --progress-completed: #22c55e;
  --progress-active-glow: #6366f155;
  --progress-completed-glow: #22c55e55;
}
  `;
  document.head.appendChild(style);
}

// --- Helper: Reset stepProgress for a new plan ---
function resetStepProgress(plan) {
  if (!plan || !Array.isArray(plan.steps)) return [];
  // All steps (including breaks) are set to false
  return plan.steps.map(() => false);
}

// --- Helper: Count steps including breaks ---
function countAllSteps(plan) {
  if (!plan || !Array.isArray(plan.steps)) return 0;
  return plan.steps.length;
}

function renderResponseView(fromUpcomingEvent = false) {
  injectResponseViewStyles();

  const responseView = document.getElementById('response-view');
  responseView.innerHTML = '';

 

  const backButtonContainer = document.getElementById('back-button-container');
backButtonContainer.classList.add('hidden');
backButtonContainer.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'container';
  container.style.maxWidth = '1792px';
  container.style.margin = '0 auto';
  container.style.padding = '0.5rem 0 0 0';

  const backBtn = document.createElement('button');
backBtn.className = 'response-back-btn';
backBtn.innerHTML = `
  <svg width="22" height="22" fill="none" stroke="#a78bfa" stroke-width="2" viewBox="0 0 24 24" style="margin-right:0.5rem;">
    <path d="M15 18l-6-6 6-6"/>
  </svg>
  <span>Back to Response Center</span>
`;
backBtn.onclick = (e) => {
  e.preventDefault();
  handleBackToEvents();
};
// Only show if not already in the response center
if (state.activeView === 'response') {
  container.prepend(backBtn);
}

  // --- Enhanced Header ---
  const header = document.createElement('div');
  header.className = 'header';
  header.style.marginBottom = '1.25rem';

  // Main title only, no AI status
  const headerContent = document.createElement('div');
  headerContent.className = 'header-content';
    const eventName = state.selectedEvent?.title || '(No Title)';

  headerContent.innerHTML = `
    <h1 class="main-title" style="font-size:2.2rem;font-weight:800;margin:0 0 0.25rem 0;line-height:1.1;">Welcome to your response for ${eventName}!</h1>
  `;

  header.appendChild(headerContent);

  // --- Tabs ---
  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'tabs-container';
  tabsContainer.innerHTML = `
    <div class="tabs-wrapper">
      <div class="tabs">
        <button class="tab active" data-tab="overview">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M9 21h6M12 3a8 8 0 0 1 8 8c0 2.5-1.5 4.5-3 5.5V19a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-2.5C5.5 15.5 4 13.5 4 11a8 8 0 0 1 8-8z"></path>
          </svg>
          Overview
        </button>
        <button class="tab" data-tab="plan">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M9 21h6M12 3a8 8 0 0 1 8 8c0 2.5-1.5 4.5-3 5.5V19a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-2.5C5.5 15.5 4 13.5 4 11a8 8 0 0 1 8-8z"></path>
          </svg>
          AI Plan
        </button>
      </div>
    </div>
  `;

  // --- Overview Tab ---
  const overviewTab = document.createElement('div');
  overviewTab.id = 'overview';
  overviewTab.className = 'tab-content active';

  // --- Plan Tab ---
  const planTab = document.createElement('div');
  planTab.id = 'plan';
  planTab.className = 'tab-content';

  // --- Content Grid ---
  const contentGrid = document.createElement('div');
  contentGrid.className = 'content-grid';
  contentGrid.style.display = 'flex';
  contentGrid.style.flexDirection = 'column';
  contentGrid.style.alignItems = 'center';
  contentGrid.style.gap = '1.5rem';

  // --- Main Content ---
  const mainContent = document.createElement('div');
  mainContent.className = 'main-content';
  mainContent.style.width = '100%';
  mainContent.style.maxWidth = '800px';
  mainContent.style.display = 'flex';
  mainContent.style.flexDirection = 'column';
  mainContent.style.alignItems = 'center';
  mainContent.style.gap = '1.5rem';

  mainContent.appendChild(overviewTab);
  mainContent.appendChild(planTab);

  contentGrid.appendChild(mainContent);

  container.appendChild(header);
  container.appendChild(tabsContainer);
  container.appendChild(contentGrid);

  // --- If NO plan, show event info card and AI prompt card ---
  if (!state.selectedEvent.smartPlan) {
    // Event Info Card
    const eventInfoCard = document.createElement('div');
    eventInfoCard.className = 'event-info-card';
    eventInfoCard.style.width = '80vw';
    eventInfoCard.style.maxWidth = '1100px';
    eventInfoCard.style.margin = '0 auto 1.5rem auto';
    eventInfoCard.style.boxSizing = 'border-box';

    eventInfoCard.innerHTML = `
      <div class="event-info-header">
        <svg class="calendar-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
        </svg>
        <div>
          <div class="event-info-content">
            <span class="event-date">${formatDate(state.selectedEvent.date, 'weekday short, month short, day')}</span>
            <div class="active-badge">Active Event</div>
          </div>
          <h2 class="event-title">${state.selectedEvent.title || '(No Title)'}</h2>
          <p class="event-description">${state.selectedEvent.description || ''}</p>
        </div>
      </div>
      <div class="event-metrics" id="event-metrics">
        <div class="metric-card">
          <div class="metric-value cyan">–</div>
          <div class="metric-label">Total Time</div>
        </div>
        <div class="metric-card">
          <div class="metric-value green">–</div>
          <div class="metric-label">Steps</div>
        </div>
        <div class="metric-card">
          <div class="metric-value purple">–</div>
          <div class="metric-label">Completed</div>
        </div>
      </div>
      <div class="smart-plan" style="margin-top:2rem;">
        <div class="sparkles-container">
          <svg class="sparkles-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M5 3l1.5 1.5L5 6 3.5 4.5 5 3zM12 4l1.5 1.5L12 7 10.5 5.5 12 4zM19 3l1.5 1.5L19 6 17.5 4.5 19 3zM5 12l1.5 1.5L5 15 3.5 13.5 5 12zM12 11l1.5 1.5L12 14 10.5 12.5 12 11zM19 12l1.5 1.5L19 15 17.5 13.5 19 12zM5 21l1.5-1.5L5 18l-1.5 1.5L5 21zM12 20l1.5-1.5L12 17l-1.5 1.5L12 20zM19 21l1.5-1.5L19 18l-1.5 1.5L19 21z"></path>
          </svg>
        </div>
        <h3 class="plan-title">Your Personal Planning Engine</h3>
        <p class="plan-description">
          Using your event information and AI-generated responses, a personalized plan will be created to break down your task into smaller, manageable steps. Support and assistance with each step of your <span style="color:gold; font-weight:bold;">Smart Plan</span> will be provided only if you wish.
        </p>
        <button class="generate-button" id="generateButton">
          Generate Smart Plan
        </button>
    `;
    overviewTab.appendChild(eventInfoCard);
  } else {
    // If plan exists, show a "plan generated" box with tick and "See Plan" button, and update metrics
    const eventInfoCard = document.createElement('div');
    eventInfoCard.className = 'event-info-card';
    const plan = state.selectedEvent.smartPlan;
    // Calculate metrics (steps includes breaks)
    const totalTime = plan.totalDuration || (
      plan.steps ? plan.steps.reduce((sum, s) => sum + (s.duration || 0), 0) + ' mins' : '–'
    );
    const numSteps = countAllSteps(plan);
    const completedSteps = Array.isArray(plan.stepProgress)
      ? plan.stepProgress.filter(Boolean).length
      : 0;
    eventInfoCard.innerHTML = `
      <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;">
        <div style="background:linear-gradient(135deg,#10b981,#a78bfa);border-radius:50%;width:48px;height:48px;display:flex;align-items:center;justify-content:center;">
          <svg width="32" height="32" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 12 18 8 14"></polyline>
          </svg>
        </div>
        <div>
          <div style="font-size:1.25rem;font-weight:700;color:#10b981;">Plan Generated</div>
          <div style="color:#cbd5e1;font-size:1rem;">Your AI plan is ready!</div>
        </div>
      </div>
      <div class="event-metrics" id="event-metrics">
        <div class="metric-card">
          <div class="metric-value cyan">${totalTime}</div>
          <div class="metric-label">Total Time</div>
        </div>
        <div class="metric-card">
          <div class="metric-value green">${numSteps}</div>
          <div class="metric-label">Steps</div>
        </div>
        <div class="metric-card">
          <div class="metric-value purple">${completedSteps}</div>
          <div class="metric-label">Completed</div>
        </div>
      </div>
      <div class="plan-actions-row" style="display:flex;gap:1rem;margin-top:2rem;flex-wrap:wrap;">
    <button class="generate-button" id="seePlanButton" ">
      See Smart Plan
    </button>
    <button class="initiate-button" id="initiateSessionBtnOverview" ">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.5rem;">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
      Initiate Session
    </button>
  </div>
    `;
    if (!document.getElementById('plan-actions-row-style')) {
  const style = document.createElement('style');
  style.id = 'plan-actions-row-style';
  style.textContent = `
    .plan-actions-row {
      display: flex;
      gap: 1rem;
      margin-top: 2rem;
      flex-wrap: wrap;
    }
    @media (max-width: 600px) {
      .plan-actions-row {
        flex-direction: column;
        gap: 0.75rem;
      }
      .plan-actions-row button {
        width: 100%;
        min-width: 0;
      }
    }
  `;
  document.head.appendChild(style);
}
    overviewTab.appendChild(eventInfoCard);
  }

  // --- AI Prompt Card (always shown, but content changes if plan exists) ---
  const aiPromptCard = document.createElement('div');
  // --- Prompt Theme Toggle for AI Prompt Content ---
const promptThemeToggle = document.createElement('div');
promptThemeToggle.style.display = 'flex';
promptThemeToggle.style.justifyContent = 'flex-end';
promptThemeToggle.style.alignItems = 'center';
promptThemeToggle.style.marginBottom = '0.5rem';
promptThemeToggle.style.width = '100%';
promptThemeToggle.style.position = 'relative';
promptThemeToggle.style.zIndex = '10';
promptThemeToggle.id = 'prompt-theme-toggle-container';

promptThemeToggle.innerHTML = `
  <label style="font-weight:600;color:#a78bfa;margin-right:0.75rem;">Prompt Theme:</label>
  <select id="promptThemeSelect" style="
    border-radius: 999px;
    padding: 0.4rem 1.1rem;
    font-size: 1rem;
    background: rgba(30,41,59,0.92);
    color: #a78bfa;
    border: 1.5px solid rgba(71,85,105,0.45);
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    font-weight: 600;
    outline: none;
    cursor: pointer;
    transition: background 0.2s;
  ">
    <option value="default">Default</option>
    <option value="light">Light</option>
    <option value="dark">Dark</option>
  </select>
`;
  aiPromptCard.className = 'ai-prompt-card';
  aiPromptCard.style.width = '80vw';
  aiPromptCard.style.maxWidth = '1100px';
  aiPromptCard.style.margin = '0 auto 1.5rem auto';
  aiPromptCard.style.boxSizing = 'border-box';
  aiPromptCard.style.background = 'rgba(156,118,255,0.10)';
  aiPromptCard.style.border = '1.5px solid rgba(156,118,255,0.18)';
  aiPromptCard.style.borderRadius = '1rem';
  aiPromptCard.style.padding = '2.5rem';

const aiResponseMarkdown = state.selectedEvent.aiResponse?.text || 'No AI response available.';
const aiResponseHtml = window.md.render(aiResponseMarkdown);

aiPromptCard.innerHTML = `
  <div class="prompt-header" style="display:flex;align-items:center;gap:1rem;margin-bottom:1.25rem;">
    <div class="star-container">
      <svg class="star-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:28px;height:28px;">
        <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path>
      </svg>
    </div>
    <div class="prompt-title-section">
      <h2 class="prompt-title" style="font-size:1.25rem;font-weight:700;color:#a78bfa;">
        Response for your ${eventName} Event
      </h2>
    </div>
  </div>
  <div class="prompt-content ai-prompt-content" style="
    background: linear-gradient(135deg, rgba(156,118,255,0.10) 0%, rgba(224,170,62,0.08) 100%);
    color: #e5e7eb;
    font-size:1.1rem;
    line-height:1.8;
    border-radius: 1rem;
    padding: 1.5rem 1.25rem;
    box-shadow: 0 2px 12px rgba(156,118,255,0.04);
  ">
    ${aiResponseHtml}
  </div>
  ${
    state.selectedEvent.aiResponse?.resources?.length
      ? `<div style="margin-top:1.25rem;">
          <div style="color:#a78bfa;font-weight:600;margin-bottom:0.5rem;">Resources:</div>
          <ul style="padding-left:1.25rem;color:#e5e7eb;font-size:15px;">
            ${state.selectedEvent.aiResponse.resources.map(r => `<li>${r}</li>`).join('')}
          </ul>
        </div>`
      : ''
  }
`;
  overviewTab.appendChild(aiPromptCard);
  // --- Insert the toggle above the prompt card ---
overviewTab.insertBefore(promptThemeToggle, aiPromptCard);

// --- Prompt Theme Toggle Logic ---
const promptThemeSelect = promptThemeToggle.querySelector('#promptThemeSelect');
const promptContent = aiPromptCard.querySelector('.prompt-content');

function setPromptTheme(theme) {
  if (!promptContent) return;
  if (theme === 'light') {
    promptContent.style.background = '#fff';
    promptContent.style.color = '#111';
    promptContent.style.boxShadow = '0 2px 12px #e5e7eb33';
    promptContent.style.border = '1.5px solid #e5e7eb';
  } else if (theme === 'dark') {
    promptContent.style.background = '#000';
    promptContent.style.color = '#fff';
    promptContent.style.boxShadow = '0 2px 12px #222';
    promptContent.style.border = '1.5px solid #222';
  } else {
    promptContent.style.background = 'linear-gradient(135deg, rgba(156,118,255,0.10) 0%, rgba(224,170,62,0.08) 100%)';
    promptContent.style.color = '#e5e7eb';
    promptContent.style.boxShadow = '0 2px 12px rgba(156,118,255,0.04)';
    promptContent.style.border = '1.5px solid rgba(156,118,255,0.18)';
  }
}

// Set default on load
setPromptTheme('default');

promptThemeSelect.addEventListener('change', (e) => {
  setPromptTheme(e.target.value);
});

// Responsive: center toggle on mobile
function updatePromptTogglePosition() {
  const container = document.getElementById('prompt-theme-toggle-container');
  if (!container) return;
  if (window.innerWidth < 700) {
    container.style.justifyContent = 'center';
    container.style.marginBottom = '1rem';
  } else {
    container.style.justifyContent = 'flex-end';
    container.style.marginBottom = '0.5rem';
  }
}
window.addEventListener('resize', updatePromptTogglePosition);
updatePromptTogglePosition();

  // --- Plan Tab Content ---
  if (state.selectedEvent.smartPlan) {
    const plan = state.selectedEvent.smartPlan;
planTab.innerHTML = `
  <div class="plan-container" id="planContainer" style="position:relative;">
    <div class="plan-header" style="display:flex;flex-direction:column;align-items:flex-start;gap:0.5rem;margin-bottom:2rem;">
      <div style="display:flex;align-items:center;gap:1rem;">
        <h2 class="plan-title-header">
          ${plan.title || 'Smart Plan'}
        </h2>
      </div>
      <div class="plan-focus-strategy">
        ${plan.focusStrategy || ''}
      </div>
    </div>
    <div class="plan-phases" id="planPhases"></div>
    <div class="plan-customize" id="planCustomize" style="margin-top:2.5rem;width:100%;"></div>
  </div>
`;
  } else {
    planTab.innerHTML = `
      <div class="plan-container" id="planContainer" style="
        min-height: 320px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
        color: #e0aa3e;
        font-weight: 600;
        text-align: center;
        position:relative;
      ">
        No plan generated yet.
      </div>
    `;
  }

  // --- Assemble DOM ---
  mainContent.appendChild(overviewTab);
  mainContent.appendChild(planTab);

  contentGrid.appendChild(mainContent);

  container.appendChild(header);
  container.appendChild(tabsContainer);
  container.appendChild(contentGrid);

  responseView.appendChild(container);

  // --- Tab switching logic ---
  const tabButtons = container.querySelectorAll('.tab');
  tabButtons.forEach(btn => {
    btn.onclick = () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      mainContent.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
      mainContent.querySelector(`#${btn.getAttribute('data-tab')}`).classList.add('active');
    };
  });

  // --- Generate Plan logic ---
  const generateBtn = container.querySelector('#generateButton');
if (generateBtn) {
  generateBtn.onclick = async () => {
    // Switch to AI Plan tab immediately
    const planTabBtn = container.querySelector('.tab[data-tab="plan"]');
    if (planTabBtn) planTabBtn.click();

    // Show BOTH plan loading overlay and progress tracker
    const planContainer = planTab.querySelector('#planContainer') || overviewTab.querySelector('.smart-plan');
    showPlanLoadingOverlayWithMessages(planContainer);
// Show progress tracker just below loader
showPlanProgressHorizontal(planContainer, async () => {
  return !!state.selectedEvent.smartPlan;
});

    try {
      const plan = await generateSmartPlan(state.selectedEvent);
      if (!plan || !plan.steps || !plan.steps.length) throw new Error('Plan is empty or invalid');
      plan.stepProgress = resetStepProgress(plan);
      await updateSmartPlan(state.selectedEvent.id, plan);
      state.selectedEvent.smartPlan = plan;
      hidePlanLoadingOverlay(planContainer);
const progressEl = planContainer.querySelector('.plan-progress-timeline');
if (progressEl && progressEl._cleanup) progressEl._cleanup();
      renderResponseView(fromUpcomingEvent);
      setTimeout(() => {
        const planTabBtn2 = container.querySelector('.tab[data-tab="plan"]');
        if (planTabBtn2) planTabBtn2.click();
      }, 100);
    } catch (e) {
      showToast('Failed to generate plan');
      hidePlanLoadingOverlay(planContainer);
      hidePlanProgress();
    }
  };
}

  // --- See Plan button logic ---
  const seePlanBtn = container.querySelector('#seePlanButton');
  if (seePlanBtn) {
    seePlanBtn.onclick = () => {
      const planTabBtn = container.querySelector('.tab[data-tab="plan"]');
      if (planTabBtn) planTabBtn.click();
    };
  }

  // --- Render plan if it exists ---
  if (state.selectedEvent.smartPlan) {
    renderPlanPhases(state.selectedEvent.smartPlan, planTab.querySelector('#planPhases'));
    // --- Add Customize Plan box at the bottom of Plan tab ---
    const planCustomize = planTab.querySelector('#planCustomize');
    planCustomize.innerHTML = `
      <textarea id="planCustomizeTextarea" placeholder="Describe how you'd like to modify the plan. E.g. 'Remove step 4' or 'Add a break after step 2'"></textarea>
      <button id="planCustomizeBtn">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:0.5rem;">
          <path d="M20 6L9 17l-5-5"></path>
        </svg>
        Update Plan
      </button>
    `;
    const planContainer = planTab.querySelector('#planContainer');
    planTab.querySelector('#planCustomizeBtn').onclick = async () => {
      const customization = planTab.querySelector('#planCustomizeTextarea').value.trim();
      if (!customization) {
        showToast('Please describe your desired changes');
        return;
      }
      showPlanLoadingOverlay(planContainer, "Updating Plan...");
      try {
        showToast('Updating plan...');
        const API_BASE_URL = 'https://my-backend-three-pi.vercel.app';
        const response = await fetch(`${API_BASE_URL}/api/update`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': window.location.origin
          },
          credentials: 'include',
          body: JSON.stringify({
            eventId: state.selectedEvent.id,
            currentPlan: state.selectedEvent.smartPlan,
            customization: customization
          })
        });
        if (!response.ok) throw new Error('Failed to update plan');
        const { success, smartPlan } = await response.json();
        if (!success || !smartPlan) throw new Error('Invalid response from server');
        // Reset stepProgress for new plan (all steps incomplete)
        smartPlan.stepProgress = resetStepProgress(smartPlan);
        const updatedPlan = await updateSmartPlan(state.selectedEvent.id, smartPlan);
        state.selectedEvent.smartPlan = updatedPlan;
        renderResponseView(fromUpcomingEvent);
        showToast('Plan updated successfully');
      } catch (error) {
        showToast('Failed to update plan');
        hidePlanLoadingOverlay(planContainer);
      }
    };
  }

  // --- Initiate Session logic ---
  const initiateBtn = container.querySelector('#initiateSessionBtnOverview');
  if (initiateBtn) {
    initiateBtn.onclick = () => {
      const eventId = encodeURIComponent(state.selectedEvent.id);
      window.location.href = `focusMode.html?eventId=${eventId}`;
    };
  }

  document.getElementById('calendar-view')?.classList.add('hidden');
  document.getElementById('events-view')?.classList.add('hidden');
  document.getElementById('response-view')?.classList.remove('hidden');
}

// Helper to render plan phases in the plan tab
function renderPlanPhases(plan, planPhasesContainer) {
  if (!plan || !plan.steps || !plan.steps.length) {
    planPhasesContainer.innerHTML = `<div style="color:#94a3b8;text-align:center;">No plan generated yet.</div>`;
    return;
  }

  // --- DESKTOP: Stepper with Prev/Next on sides, indicator & show-all below card ---
  if (window.innerWidth >= 900) {
    let currentStep = 0;
    let showAll = false;

    // --- Calculate max card height for all steps ---
    let maxHeight = 0;
    const tempDiv = document.createElement('div');
    tempDiv.style.visibility = 'hidden';
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-9999px';
    tempDiv.style.top = '-9999px';
    tempDiv.style.width = '600px';
    tempDiv.style.pointerEvents = 'none';
    document.body.appendChild(tempDiv);

    plan.steps.forEach((step, idx) => {
      const isBreak = step.isBreak;
      const card = document.createElement('div');
      card.className = 'phase-card' + (isBreak ? ' phase-break' : '');
      card.style.width = '100%';
      card.style.maxWidth = '600px';
      card.style.margin = '0 auto';
      card.innerHTML = renderPhaseCardContent(step, idx, isBreak);
      tempDiv.appendChild(card);
      maxHeight = Math.max(maxHeight, card.offsetHeight);
      tempDiv.removeChild(card);
    });
    document.body.removeChild(tempDiv);

    function renderDesktopStepper() {
      planPhasesContainer.innerHTML = '';
      planPhasesContainer.classList.add('stepper');

      if (showAll) {
        // Show all steps vertically with gap, larger cards
        const allContainer = document.createElement('div');
        allContainer.style.display = 'flex';
        allContainer.style.flexDirection = 'column';
        allContainer.style.gap = '2.5rem';
        allContainer.style.alignItems = 'center';
        allContainer.style.width = '100%';
        plan.steps.forEach((step, idx) => {
          const isBreak = step.isBreak;
          const phaseCard = document.createElement('div');
          phaseCard.className = 'phase-card' + (isBreak ? ' phase-break' : '');
          phaseCard.style.maxWidth = '600px';
          phaseCard.style.width = '100%';
          phaseCard.style.margin = '0 auto';
          phaseCard.style.minHeight = maxHeight + 'px';
          phaseCard.style.height = maxHeight + 'px';
          phaseCard.innerHTML = renderPhaseCardContent(step, idx, isBreak);
          allContainer.appendChild(phaseCard);
        });
        planPhasesContainer.appendChild(allContainer);
      } else {
        // Stepper: prev/next on sides, card in center
        const stepperRow = document.createElement('div');
        stepperRow.style.display = 'flex';
        stepperRow.style.alignItems = 'center';
        stepperRow.style.justifyContent = 'center';
        stepperRow.style.gap = '2.5rem';

        // Prev button
        const prevBtn = document.createElement('button');
        prevBtn.className = 'phase-stepper-arrow';
        prevBtn.disabled = currentStep === 0;
        prevBtn.innerHTML = `<svg width="36" height="36" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>`;
        prevBtn.onclick = () => { if (currentStep > 0) { currentStep--; renderDesktopStepper(); } };
        stepperRow.appendChild(prevBtn);

        // Card
        const step = plan.steps[currentStep];
const isBreak = step.isBreak;
const phaseCard = document.createElement('div');
phaseCard.className = 'phase-card' + (isBreak ? ' phase-break' : '');
phaseCard.style.maxWidth = '600px';
phaseCard.style.width = '100%';
phaseCard.style.margin = '0 auto';
// Ensure same height and width as largest card
phaseCard.style.minHeight = maxHeight + 'px';
phaseCard.style.height = maxHeight + 'px';
phaseCard.innerHTML = renderPhaseCardContent(step, currentStep, isBreak);
stepperRow.appendChild(phaseCard);

        // Next button
        const nextBtn = document.createElement('button');
        nextBtn.className = 'phase-stepper-arrow';
        nextBtn.disabled = currentStep === plan.steps.length - 1;
        nextBtn.innerHTML = `<svg width="36" height="36" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>`;
        nextBtn.onclick = () => { if (currentStep < plan.steps.length - 1) { currentStep++; renderDesktopStepper(); } };
        stepperRow.appendChild(nextBtn);

        planPhasesContainer.appendChild(stepperRow);
      }

      // Step indicator (below card, vertical)
      const indicatorWrapper = document.createElement('div');
      indicatorWrapper.style.display = 'flex';
      indicatorWrapper.style.flexDirection = 'column';
      indicatorWrapper.style.alignItems = 'center';
      indicatorWrapper.style.margin = '1.5rem 0 0.5rem 0';

      const indicator = document.createElement('div');
      indicator.style.display = 'flex';
      indicator.style.justifyContent = 'center';
      indicator.style.alignItems = 'center';
      indicator.style.gap = '0.5rem';
      indicator.innerHTML = showAll
        ? `<span style="color:#a78bfa;font-weight:600;">All Steps (${plan.steps.length})</span>`
        : `<span style="color:#a78bfa;font-weight:600;">Step ${currentStep + 1} of ${plan.steps.length}</span>`;
      indicatorWrapper.appendChild(indicator);

      // Show All / Collapse button (vertical layout)
      const showAllBtn = document.createElement('button');
      showAllBtn.textContent = showAll ? 'Collapse Steps' : 'Show All Steps';
      showAllBtn.className = 'phase-stepper-showall-btn';
      showAllBtn.onclick = () => { showAll = !showAll; renderDesktopStepper(); };
      indicatorWrapper.appendChild(showAllBtn);

      planPhasesContainer.appendChild(indicatorWrapper);
    }

    renderDesktopStepper();
    return;
  }

  // --- MOBILE: Tinder-style swipe, no buttons, compact indicator, smaller cards ---
let currentStep = 0;
let startX = 0;
let deltaX = 0;
let isDragging = false;

function renderMobilePhase() {
  planPhasesContainer.innerHTML = '';
  planPhasesContainer.classList.remove('stepper');

  // Card wrapper
  const cardWrapper = document.createElement('div');
  cardWrapper.style.position = 'relative';
  cardWrapper.style.width = '100vw';
  cardWrapper.style.height = 'auto';
  cardWrapper.style.overflow = 'visible';
  cardWrapper.style.display = 'flex';
  cardWrapper.style.justifyContent = 'center';

  // Only show the current card
  const step = plan.steps[currentStep];
  const isBreak = step.isBreak;
  const card = document.createElement('div');
  card.className = 'phase-card' + (isBreak ? ' phase-break' : '');
  card.style.width = '92vw';
  card.style.maxWidth = '340px';
  card.style.minWidth = '0';
  card.style.boxSizing = 'border-box';
  card.style.boxShadow = isBreak
    ? '0 2px 16px rgba(156,118,255,0.08)'
    : '0 6px 32px rgba(24,24,36,0.25)';
  card.innerHTML = renderPhaseCardContent(step, currentStep, isBreak);

  // Touch events for swipe
  card.addEventListener('touchstart', (e) => {
    isDragging = true;
    startX = e.touches[0].clientX;
    card.style.transition = 'none';
  });
  card.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    deltaX = e.touches[0].clientX - startX;
    card.style.transform = `translateX(${deltaX}px) rotate(${deltaX / 18}deg) scale(1.02)`;
  });
  card.addEventListener('touchend', () => {
    isDragging = false;
    card.style.transition = 'transform 0.35s cubic-bezier(.4,1.4,.4,1)';
    if (Math.abs(deltaX) > 60) {
      if (deltaX < 0 && currentStep < plan.steps.length - 1) currentStep++;
      else if (deltaX > 0 && currentStep > 0) currentStep--;
    }
    deltaX = 0;
    card.style.transform = `translateX(0) scale(1)`;
    setTimeout(renderMobilePhase, 250);
  });

  cardWrapper.appendChild(card);
  planPhasesContainer.appendChild(cardWrapper);

  // Step indicator (compact, below card)
  const indicator = document.createElement('div');
  indicator.style.display = 'flex';
  indicator.style.justifyContent = 'center';
  indicator.style.alignItems = 'center';
  indicator.style.gap = '0.5rem';
  indicator.style.margin = '0.5rem 0 0.5rem 0';
  indicator.innerHTML = `<span style="color:#a78bfa;font-weight:600;">Step ${currentStep + 1} of ${plan.steps.length}</span>`;
  planPhasesContainer.appendChild(indicator);
}

renderMobilePhase();

  // Helper: render phase card content
function renderPhaseCardContent(step, idx, isBreak) {
  if (isBreak) {
    // BREAK STEP: Match Focus Mode
    return `
      <div class="break-title">Break Time!</div>
      <div class="break-gif-space">
        <img src="../gifs/Coffee.gif" alt="Break" loading="lazy"/>
      </div>
      <div class="break-desc">${step.description || 'Take a short break to recharge and refresh your mind.'}</div>
      <div class="break-duration">Recommended: ${step.duration ? `${step.duration} minutes` : '5 minutes'}</div>
      ${step.tip ? `<div class="break-tip"><strong>💡 Tip:</strong> ${step.tip}</div>` : ''}
      ${step.managementNote ? `<div class="break-note"><strong>📝 Note:</strong> ${step.managementNote}</div>` : ''}
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
  }
  // NON-BREAK STEP: Large, spaced-out details
  return `
    <div class="phase-header">
      <h3 class="phase-title">${step.title || `Step ${step.number || idx + 1}`}</h3>
      <span class="phase-time">${step.duration ? `${step.duration} min${step.duration > 1 ? 's' : ''}` : ''}</span>
    </div>
    <div class="phase-description">${step.description || ''}</div>
    <div class="phase-details">
      <div class="phase-detail tip">
        <svg width="22" height="22" fill="none" stroke="#a78bfa" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        <span><strong>Tip:</strong> ${step.tip || ''}</span>
      </div>
      <div class="phase-detail note">
        <svg width="22" height="22" fill="none" stroke="#fbbf24" stroke-width="2" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
        <span><strong>Management Note:</strong> ${step.managementNote || ''}</span>
      </div>
      <div class="phase-detail goal">
        <svg width="22" height="22" fill="none" stroke="#10b981" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
        <span><strong>Micro Goal:</strong> ${step.microGoal || ''}</span>
      </div>
    </div>
  `;
}

  renderMobilePhase();
}

function cleanupFocusMode() {
  if (typeof state.focusModeCleanup === 'function') {
    state.focusModeCleanup();
    state.focusModeCleanup = null;
  }
}








// Update the drawEmbers function
// Update the drawEmbers function
function drawEmbers() {
  const canvas = document.getElementById('embers-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const embers = Array.from({ length: 50 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    radius: Math.random() * 2 + 1,
    baseOpacity: Math.random() * 0.3 + 0.2, // Slightly increased base opacity
    opacity: Math.random() * 0.3 + 0.2,
    speedY: Math.random() * -1 - 0.3,
    speedX: (Math.random() - 0.5) * 0.3,
    flicker: Math.random() * 0.02
  }));

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    embers.forEach(e => {
      // Create a subtle glow effect
      const gradient = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.radius * 2);
      gradient.addColorStop(0, `rgba(255, 140, 0, ${e.opacity})`);
      gradient.addColorStop(1, 'rgba(255, 140, 0, 0)');
      
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius * 2, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
      
      // Core of the ember with increased opacity
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 180, 0, ${e.opacity * 1.8})`; // Increased opacity multiplier
      ctx.fill();
      
      // Update position
      e.y += e.speedY;
      e.x += e.speedX;
      
      // Gentle flicker around base opacity
      e.opacity = e.baseOpacity + (Math.random() - 0.5) * e.flicker;
      
      // Only reset position, keep opacity consistent
      if (e.y < -10 || e.x < -10 || e.x > canvas.width + 10) {
        e.y = canvas.height + 10;
        e.x = Math.random() * canvas.width;
        // Don't reset opacity to maintain consistency
      }
    });
    
    requestAnimationFrame(animate);
  }

  animate();
}
