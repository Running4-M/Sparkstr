// Add Firebase imports at the top
import { 
  fetchEventFromFirebase,
  fetchEvents,
  saveEvent,
  deleteEvent as deleteFirebaseEvent,
  updateEvent as updateFirebaseEvent,
  getCurrentUserId,
  initializeFirebase,
  fetchEventsForToday,
  saveResponse,
  checkExistingResponse,
  firebaseInitPromise,
  fetchResponseByEventId,
  saveUserSettings, // already present

} from "../backend/firebase.js";

import { checkAndUpdateUsage } from "../backend/planUsage.js";
import { PLAN_LIMITS } from "../backend/planLimits.js";
import { loadUserSettings } from "../backend/firebase.js";
async function canEnableEventNotifications() {
  // Check browser permission
  if (Notification.permission !== 'granted') {
    console.log('Notification.permission is not granted');
    return false;
  }
  // Check for FCM token in user settings
  const settings = await loadUserSettings();
  console.log('Settings in canEnableEventNotifications:', settings);
  return !!settings.pushToken;
}
// Checks usage for a given feature for a specific date
async function checkUsageForDay(feature, dateStr) {
  const settings = await loadUserSettings();
  const plan = settings.plan || "free";
  const limits = PLAN_LIMITS[plan];
  const usage = settings.usageByDate?.[dateStr] || {};
  return (usage[feature] || 0) < (limits[feature] || 0);
}
async function incrementUsageForDay(feature, dateStr) {
  const settings = await loadUserSettings();
  if (!settings.usageByDate) settings.usageByDate = {};
  if (!settings.usageByDate[dateStr]) settings.usageByDate[dateStr] = {};
  settings.usageByDate[dateStr][feature] = (settings.usageByDate[dateStr][feature] || 0) + 1;
  await saveUserSettings(settings);
}
// Update state management
const state = {
  events: [],
  currentDate: new Date(),
  selectedDate: new Date(),
  view: 'month',
  showModal: false,
  showEventModal: false,
  selectedEvent: null,
  selectedTime: null,
  modalStep: 0,
  taskType: null,
  taskData: {
    id: '',
    title: '',
    description: '',
    color: 'purple',
    date: '',
    time: '',
    isComplex: false,
    aiEnabled: false,
    notificationsEnabled: false,
    priority: 'none',
    recurrence: 'none',
    aiResponse: '',
    // Add new fields for Firebase integration
    userId: null,
    syncAction: null
  },
  activeTab: 'details'
};

async function shouldShowTutorial() {
  try {
    const settings = await loadUserSettings();
    return !settings?.tutorialSeen;
  } catch (e) {
    return true; // Default to showing if error
  }
}

// Add near the top after state declaration
window.__tutorialEventSaved__ = function() {
  console.log('🎯 Tutorial event saved function called');
  
  try {
    const tour = window.tutorialTour; // Get tour from global scope
    
    if (tour && tour.isActive() && tour.getCurrentStep()?.id === 'save-task') {
      console.log('✅ Advancing tutorial to next step');
      setTimeout(() => {
        tour.next();
      }, 100);
    } else {
      console.log('❌ Tour conditions not met:', {
        tourExists: !!tour,
        isActive: tour?.isActive(),
        currentStepId: tour?.getCurrentStep()?.id
      });
    }
  } catch (error) {
    console.error('Error in tutorial event saved handler:', error);
  }
};


firebaseInitPromise.then(() => {
  if (!getCurrentUserId()) {
    window.location.href = "../Login/signup.html";
  }
});

let templatesLoaded = false;

// Update loadTemplates function
async function loadTemplates() {
  if (templatesLoaded) return true;

  try {
    console.log("📥 Fetching templates...");
    const response = await fetch('./templates.html');
    if (!response.ok) throw new Error('Failed to load templates');

    const templatesHTML = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(templatesHTML, 'text/html');

    // Move <link rel="stylesheet"> into document.head (avoid duplicates)
    const links = doc.querySelectorAll('link[rel="stylesheet"], link[type="text/css"]');
    for (const link of links) {
      // If link has an id, use it to avoid duplicates.
      if (link.id && document.getElementById(link.id)) continue;

      const newLink = document.createElement('link');
      newLink.rel = 'stylesheet';
      if (link.id) newLink.id = link.id;
      // Resolve href relative to current location
      newLink.href = link.getAttribute('href');
      document.head.appendChild(newLink);

      // wait for it to load (safe fallback)
      await new Promise(res => {
        newLink.onload = res;
        // timeout fallback so we don't hang forever
        setTimeout(res, 1200);
      });
    }

    // Move inline <style> blocks too
    const styles = doc.querySelectorAll('style');
    for (const s of styles) {
      const newStyle = document.createElement('style');
      newStyle.textContent = s.textContent;
      document.head.appendChild(newStyle);
    }

    // Create container if missing
    let container = document.getElementById('templateContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'templateContainer';
      container.style.display = 'none'; // keep hidden
      document.body.appendChild(container);
    }

    // Insert only the body content (strip <head>, <html>, etc.)
    const bodyHTML = doc.body ? doc.body.innerHTML : templatesHTML;
    container.innerHTML = bodyHTML;

    // Hide all individual templates (same as before)
    container.querySelectorAll('[id^="template-"]').forEach(t => { t.style.display = 'none'; });

    templatesLoaded = true;
    console.log('✅ Templates loaded and stylesheet(s) applied');

    attachTemplateEvents();
    return true;
  } catch (error) {
    console.error("❌ Error loading templates:", error);
    templatesLoaded = false;
    throw error;
  }
}

function addRecurrenceOptionsListeners() {
  // Weekly/biweekly days
  document.querySelectorAll('input[name="recurrenceDays"]').forEach(cb => {
    cb.addEventListener('change', () => {
      state.taskData.recurrenceDays = Array.from(document.querySelectorAll('input[name="recurrenceDays"]:checked')).map(x => parseInt(x.value));
    });
  });
  // Monthly/yearly repeat by
  const repeatBy = document.getElementById('monthlyRepeatBy');
  if (repeatBy) {
    repeatBy.addEventListener('change', (e) => {
      state.taskData.repeatBy = e.target.value;
    });
  }
  // End options
  document.querySelectorAll('input[name="recurrenceEnd"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.taskData.recurrenceEnd = e.target.value;
      renderRecurrenceOptions();
      addRecurrenceOptionsListeners();
    });
  });
  const countInput = document.getElementById('recurrenceCount');
  if (countInput) {
    countInput.addEventListener('input', (e) => {
      state.taskData.recurrenceCount = parseInt(e.target.value) || 1;
    });
  }
  const untilInput = document.getElementById('recurrenceUntil');
  if (untilInput) {
    untilInput.addEventListener('input', (e) => {
      state.taskData.recurrenceUntil = e.target.value;
    });
  }
}

function generateRecurringDates(startDate, recurrence, maxCount = 100, options = {}) {
  // options: { recurrenceDays, repeatBy, recurrenceEnd, recurrenceCount, recurrenceUntil }
  const dates = [];
  let count = 0;
  let date = new Date(startDate);

  function isAfterUntil(d) {
    if (options.recurrenceUntil) {
      return d > new Date(options.recurrenceUntil);
    }
    return false;
  }

  if (recurrence === 'weekly' || recurrence === 'biweekly') {
    const interval = recurrence === 'weekly' ? 7 : 14;
    const days = Array.isArray(options.recurrenceDays) && options.recurrenceDays.length > 0
      ? options.recurrenceDays
      : [];

    // For each selected weekday, generate occurrences
    let occurrences = 0;
    let current = new Date(date);
    // Find the first week that matches
    while (true) {
      for (let i = 0; i < 7; i++) {
        if (options.recurrenceEnd === 'after' && occurrences >= (options.recurrenceCount || maxCount)) break;
        if (options.recurrenceEnd === 'on' && isAfterUntil(current)) break;
        if (dates.length >= maxCount) break;
        if (days.includes(current.getDay())) {
          dates.push(formatDate(new Date(current)));
          occurrences++;
        }
        current.setDate(current.getDate() + 1);
      }
      // Jump to next week/biweek
      current.setDate(current.getDate() + (interval - 7));
      if (options.recurrenceEnd === 'after' && occurrences >= (options.recurrenceCount || maxCount)) break;
      if (options.recurrenceEnd === 'on' && isAfterUntil(current)) break;
      if (dates.length >= maxCount) break;
    }
    // Sort and trim
    dates.sort();
    if (options.recurrenceEnd === 'after') {
      return dates.slice(0, options.recurrenceCount || maxCount);
    }
    return dates.slice(0, maxCount);
  }

  // Monthly/yearly
  while (true) {
    if (options.recurrenceEnd === 'after' && count >= (options.recurrenceCount || maxCount)) break;
    if (options.recurrenceEnd === 'on' && isAfterUntil(date)) break;
    if (dates.length >= maxCount) break;

    if ((recurrence === 'monthly' || recurrence === 'yearly') && options.repeatBy) {
      if (options.repeatBy === 'date') {
        dates.push(formatDate(new Date(date)));
        count++;
      } else if (options.repeatBy === 'weekday') {
        // Find nth weekday of the month
        const nth = Math.floor((date.getDate() - 1) / 7) + 1;
        let d = new Date(date.getFullYear(), date.getMonth(), 1);
        let weekdayCount = 0;
        while (d.getMonth() === date.getMonth()) {
          if (d.getDay() === date.getDay()) {
            weekdayCount++;
            if (weekdayCount === nth) break;
          }
          d.setDate(d.getDate() + 1);
        }
        if (d.getDate() === date.getDate()) {
          dates.push(formatDate(new Date(date)));
          count++;
        }
      }
    } else if (recurrence === 'daily') {
      dates.push(formatDate(new Date(date)));
      count++;
    } else if (recurrence === 'none') {
      dates.push(formatDate(new Date(date)));
      break;
    }

    // Advance date
    switch (recurrence) {
      case 'daily':
        date.setDate(date.getDate() + 1);
        break;
      case 'monthly':
        date.setMonth(date.getMonth() + 1);
        break;
      case 'yearly':
        date.setFullYear(date.getFullYear() + 1);
        break;
      default:
        return dates;
    }
  }
  return dates;
}



// Add at the top of the file with other state management
const templateStorage = {
  files: new Map(),
  urls: new Map(),
  addFile(templateId, file) {
    this.files.set(templateId, file);
  },
  addUrl(templateId, url) {
    this.urls.set(templateId, url);
  },
  getFile(templateId) {
    return this.files.get(templateId);
  },
  getUrl(templateId) {
    return this.urls.get(templateId);
  },
  clear() {
    this.files.clear();
    this.urls.clear();
  }
};

function attachTemplateEvents() {
  document.querySelectorAll(".upload-container").forEach((container, index) => {
    const templateId = `task-${index + 1}`;
    container.dataset.templateId = templateId;

    // Get elements
    const dropArea       = container.querySelector(".drop-area");
    const uploadBtn      = dropArea.querySelector(".upload-button");
    const fileInput      = dropArea.querySelector("input[type='file']");
    const fileNameDisplay= dropArea.querySelector(".file-name-display");
    const urlArea        = container.querySelector(".url-area");
    const urlButton      = container.querySelector(".url-button");
    const urlInput       = container.querySelector("input[type='url']");
    const urlDisplay     = container.querySelector(".url-display");

    // Style URL input
    urlInput.style.backgroundColor = "#333";
    urlInput.style.color           = "#fff";

    // Responsive mobile tweaks
    function applyMobileStyles(elem) {
      if (window.innerWidth <= 768) {
        elem.style.padding  = "2px 6px";
        elem.style.fontSize = "0.8em";
      }
    }
    [uploadBtn, dropArea, urlInput].forEach(applyMobileStyles);

    // Prevent the file‐input itself from bubbling click up
    fileInput.addEventListener("click", e => e.stopPropagation());

    // 1) Clicking our button → open picker once
    uploadBtn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      fileInput.click();
    });

    // 2) Clicking the rest of the drop‐area (but not the button) → open picker (only if no file yet)
    dropArea.addEventListener("click", e => {
      e.stopPropagation();
      if (e.target === dropArea && !fileInput.files.length) {
        fileInput.click();
      }
    });

function setDisplay(containerElem, text, clearCallback) {
  containerElem.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px;">
      <span class="display-text">${text}</span>
      <button type="button" class="delete-btn" title="Clear">&times;</button>
    </div>
  `;

  const deleteBtn = containerElem.querySelector('.delete-btn');

  // Base styles for delete button
  Object.assign(deleteBtn.style, {
    cursor: 'pointer',
    background: '#fff',
    border: 'none', 
    borderRadius: '50%',
    width: '24px',
    height: '24px',
    flexShrink: '0',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1em',
    lineHeight: '1',
    transition: 'background 0.2s ease'
  });

  // Hover states
  deleteBtn.addEventListener('mouseover', () => {
    deleteBtn.style.background = 'red';
    deleteBtn.style.color = '#fff';
  });
  
  deleteBtn.addEventListener('mouseout', () => {
    deleteBtn.style.background = '#fff';
    deleteBtn.style.color = '#000';
  });

  // Clear action
 deleteBtn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    clearCallback();
    // **THIS LINE removes the active look/state permanently**
    containerElem.classList.remove('active');
  });

  containerElem.classList.add("active");
  containerElem.style.display = "block";
}



    // File handling
    function handleFiles(files) {
      if (!files.length) return;
      const file = files[0];
      templateStorage.addFile(templateId, file);
      setDisplay(fileNameDisplay, `Selected: ${file.name}`, () => {
        fileInput.value = '';
        fileNameDisplay.style.display = 'none';
        dropArea.classList.remove('active');
        templateStorage.files.delete(templateId);
      });
    }
    fileInput.addEventListener("change", e => handleFiles(e.target.files));

    // Drag & drop
    dropArea.addEventListener("dragover", e => {
      e.preventDefault();
      dropArea.style.backgroundColor = "#bbdefb";
    });
    dropArea.addEventListener("dragleave", () => {
      if (!fileNameDisplay.innerHTML) dropArea.style.backgroundColor = "#e3f2fd";
    });
    dropArea.addEventListener("drop", e => {
      e.preventDefault();
      dropArea.style.backgroundColor = "#e3f2fd";
      handleFiles(e.dataTransfer.files);
    });

    // URL handling (unchanged)
    urlButton.addEventListener("click", e => {
      e.stopPropagation();
      if (urlInput.hidden) {
        urlInput.hidden = false;
        urlInput.focus();
        urlButton.textContent = "Submit URL";
      } else {
        const url = urlInput.value.trim();
        if (url) {
          templateStorage.addUrl(templateId, url);
          setDisplay(urlDisplay, `URL: ${url}`, () => {
            urlInput.value = '';
            urlDisplay.style.display = 'none';
            urlArea.classList.remove('active');
            templateStorage.urls.delete(templateId);
          });
          urlArea.classList.add('active');
        }
        urlInput.hidden = true;
        urlButton.textContent = "Paste URL";
      }
    });

  });
}




// Add these helper functions after attachTemplateEvents
function initializeCounters() {
  // Hide all checkboxes
  document.querySelectorAll("input[type='checkbox']").forEach(cb => {
    cb.style.display = 'none';
  });

  document.querySelectorAll(".counter-container").forEach((container, index) => {
    const counterId = `counter-${index + 1}`;
    container.dataset.counterId = counterId;

    const decreaseBtn = container.querySelector(".decrease");
    const increaseBtn = container.querySelector(".increase");
    const counterEl = container.querySelector(".counter");

    if (decreaseBtn && increaseBtn && counterEl) {
      decreaseBtn.addEventListener("click", () => {
        let current = parseInt(counterEl.value, 10) || 0;
        if (current > parseInt(counterEl.min, 10)) {
          counterEl.value = --current;
        }
      });

      increaseBtn.addEventListener("click", () => {
        let current = parseInt(counterEl.value, 10) || 0;
        if (current < parseInt(counterEl.max, 10)) {
          counterEl.value = ++current;
        }
      });

      counterEl.addEventListener("change", () => {
        let current = parseInt(counterEl.value, 10);
        if (isNaN(current) || current < parseInt(counterEl.min, 10)) {
          counterEl.value = counterEl.min;
        } else if (current > parseInt(counterEl.max, 10)) {
          counterEl.value = counterEl.max;
        }
      });
    }
  });
}


function initializeInputRows() {
  function createInputRow(placeholder, name) {
    const row = document.createElement("div");
    row.className = "input-row";
    
    const input = document.createElement("input");
    input.type = "text";
    input.className = "custom-input";
    input.placeholder = placeholder;
    input.name = name;
    
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "Remove";
    removeBtn.onclick = () => row.remove();
    
    row.appendChild(input);
    row.appendChild(removeBtn);
    return row;
  }

  document.querySelectorAll(".add-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      const container = document.getElementById(targetId);
      const placeholder = btn.getAttribute("data-placeholder");
      const name = btn.getAttribute("data-name");
      
      if (container) {
        const newRow = createInputRow(placeholder, name);
        container.appendChild(newRow);
      }
    });
  });
}

function initializeOthersGroups() {
  document.querySelectorAll(".others-group").forEach((group, index) => {
    const othersId = `others-${index + 1}`;
    group.dataset.othersId = othersId;
    
    const othersBtn = group.querySelector(".othersBtn");
    const othersInputContainer = group.querySelector(".othersInputContainer");
    
    if (othersBtn && othersInputContainer) {
      othersBtn.addEventListener("click", () => {
        const isHidden = othersInputContainer.style.display === "none" || !othersInputContainer.style.display;
        othersInputContainer.style.display = isHidden ? "block" : "none";
        group.classList.toggle("toggled", isHidden);
      });
    }
  });
}

// DOM elements
const elements = {
  calendarTitle: document.getElementById('calendarTitle'),
  calendarViewsContainer: document.getElementById('calendarViewsContainer'),
  monthViewBtn: document.getElementById('monthViewBtn'),
  weekViewBtn: document.getElementById('weekViewBtn'),
  dayViewBtn: document.getElementById('dayViewBtn'),
  prevPeriodBtn: document.getElementById('prevPeriodBtn'),
  nextPeriodBtn: document.getElementById('nextPeriodBtn'),
  todayBtn: document.getElementById('todayBtn'),
  addEventBtn: document.getElementById('addEventBtn'),
  taskModal: document.getElementById('taskModal'),
  modalTitle: document.getElementById('modalTitle'),
  modalBody: document.getElementById('modalBody'),
  modalBackBtn: document.getElementById('modalBackBtn'),
  eventDetailsModal: document.getElementById('eventDetailsModal'),
  eventTitle: document.getElementById('eventTitle'),
  detailsTab: document.getElementById('detailsTab'),
  aiTab: document.getElementById('aiTab'),
  eventDetailsContent: document.getElementById('eventDetailsContent'),
  editEventBtn: document.getElementById('editEventBtn'),
  deleteEventBtn: document.getElementById('deleteEventBtn'),
  closeEventDetailsBtn: document.getElementById('closeEventDetailsBtn'),
  closeEventDetailsFooterBtn: document.getElementById('closeEventDetailsFooterBtn'),
  toastContainer: document.getElementById('toastContainer'),
   mobileViewDropdown: document.getElementById('mobileViewDropdown'),
};

// Update initialization
async function init() {
  await initializeFirebase();
  try {
    // Get current user ID
    const userId = getCurrentUserId();
    if (!userId) {
      console.error('No authenticated user');
      return;
    }
    elements.monthViewBtn.addEventListener('click', () => setView('month'));
    elements.weekViewBtn.addEventListener('click', () => setView('week'));
    elements.dayViewBtn.addEventListener('click', () => setView('day'));
    elements.prevPeriodBtn.addEventListener('click', handlePreviousPeriod);
    elements.nextPeriodBtn.addEventListener('click', handleNextPeriod);
    elements.todayBtn.addEventListener('click', handleToday);
    // Mobile dropdown
    if (elements.mobileViewDropdown) {
      elements.mobileViewDropdown.value = state.view;
      elements.mobileViewDropdown.addEventListener('change', (e) => {
        setView(e.target.value);
      });
    }
    // Load events from Firebase
    await loadEvents();
    // Add to the end of renderMonthView, renderWeekView, and renderDayView:

    // Set initial date and view
    updateDateTitle();
    renderCalendar();
    initializeDragAndDrop();
addDropZoneHandlers();
processAIResponses()
    
    // Add event listeners
    if (window.tutorialTour) {
      shouldShowTutorial().then(show => {
        if (show) {
          window.tutorialTour.start();
        }
      });
    } else {
      // Optionally, wait for tutorial.js to load and then check again
      setTimeout(() => {
        if (window.tutorialTour) {
          shouldShowTutorial().then(show => {
            if (show) window.tutorialTour.start();
          });
        }
      }, 1000);
    }
  window.addEventListener('resize', () => {
  if (state.view === 'month') normalizeRowHeights();
});
  } catch (error) {
    console.error('Error initializing calendar:', error);
  }
}

const miniCalendarStyles = `
#miniCalendarOverlay {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(30,30,40,0.7); z-index: 1000; display: flex; align-items: center; justify-content: center;
}
#miniCalendar {
  background: #23232b; border-radius: 1rem; box-shadow: 0 8px 32px rgba(0,0,0,0.25);
  padding: 1.2rem; min-width: 320px; max-width: 95vw; color: #fff; font-family: inherit;
  transition: box-shadow 0.2s;
}
#miniCalendar .mini-header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;
}
#miniCalendar .mini-header button {
  background: none; border: none; color: #b297f4; font-size: 1.5rem; cursor: pointer; padding: 0 0.5rem;
  transition: color 0.2s;
}
#miniCalendar .mini-header button:hover { color: #e17086; }
#miniCalendar .mini-title {
  font-size: 1.1rem; font-weight: 600; letter-spacing: 0.02em;
}
#miniCalendar .mini-grid {
  display: grid; grid-template-columns: repeat(7, 2.2em); gap: 0.25em; justify-content: center;
}
#miniCalendar .mini-day, #miniCalendar .mini-date {
  text-align: center; padding: 0.3em 0; border-radius: 0.5em;
}
#miniCalendar .mini-day { font-size: 0.9em; color: #b297f4; font-weight: 500; }
#miniCalendar .mini-date {
  cursor: pointer; font-size: 1em; background: none; border: none; color: #fff; transition: background 0.15s, color 0.15s;
}
#miniCalendar .mini-date.today { background: #9b87f5; color: #fff; font-weight: 700; }
#miniCalendar .mini-date.selected { background: #e17086; color: #fff; }
#miniCalendar .mini-date.other-month { color: #666; opacity: 0.5; }
#miniCalendar .mini-footer {
  margin-top: 0.7em; text-align: right;
}
#miniCalendar .mini-footer button {
  background: #9b87f5; color: #fff; border: none; border-radius: 0.5em; padding: 0.4em 1.2em; font-size: 1em; cursor: pointer;
  transition: background 0.2s;
}
#miniCalendar .mini-footer button:hover { background: #e17086; }
@media (max-width: 500px) {
  #miniCalendar { min-width: 98vw; padding: 0.5rem; }
  #miniCalendar .mini-grid { grid-template-columns: repeat(7, 1.5em); }
}
`;
// Inject styles if not already present
if (!document.getElementById('miniCalendarStyles')) {
  const style = document.createElement('style');
  style.id = 'miniCalendarStyles';
  style.textContent = miniCalendarStyles;
  document.head.appendChild(style);
}

// Add click handler to calendar title to open mini calendar
elements.calendarTitle.style.cursor = 'pointer';
elements.calendarTitle.title = 'Pick a date';

elements.calendarTitle.addEventListener('click', () => {
  openMiniCalendar(state.currentDate);
});

function openMiniCalendar(selectedDate) {
  // Remove existing overlay if present
  const existing = document.getElementById('miniCalendarOverlay');
  if (existing) existing.remove();

  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'miniCalendarOverlay';

  // State for mini calendar
  let viewDate = new Date(selectedDate);

  function renderMiniCalendar() {
    // Clear overlay
    overlay.innerHTML = '';

    // Header: month/year and navigation
    const header = document.createElement('div');
    header.className = 'mini-header';

    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = '&#8592;';
    prevBtn.onclick = () => { viewDate.setMonth(viewDate.getMonth() - 1); renderMiniCalendar(); };

    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = '&#8594;';
    nextBtn.onclick = () => { viewDate.setMonth(viewDate.getMonth() + 1); renderMiniCalendar(); };

    const yearBtn = document.createElement('button');
    yearBtn.style.fontSize = '1em';
    yearBtn.style.fontWeight = 'bold';
    yearBtn.style.background = 'none';
    yearBtn.style.border = 'none';
    yearBtn.style.color = '#b297f4';
    yearBtn.style.cursor = 'pointer';
    yearBtn.textContent = viewDate.getFullYear();
    yearBtn.onclick = () => showYearPicker();

    const title = document.createElement('span');
    title.className = 'mini-title';
    title.textContent = `${viewDate.toLocaleString(undefined, { month: 'long' })} `;
    title.appendChild(yearBtn);

    header.appendChild(prevBtn);
    header.appendChild(title);
    header.appendChild(nextBtn);

    // Days of week
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const grid = document.createElement('div');
    grid.className = 'mini-grid';
    daysOfWeek.forEach(d => {
      const day = document.createElement('div');
      day.className = 'mini-day';
      day.textContent = d;
      grid.appendChild(day);
    });

    // Dates
    const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const startDay = firstDay.getDay();
    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
    const prevMonthDays = new Date(viewDate.getFullYear(), viewDate.getMonth(), 0).getDate();

    // Fill grid: previous month's days
    for (let i = 0; i < startDay; i++) {
      const d = document.createElement('button');
      d.className = 'mini-date other-month';
      d.disabled = true;
      d.textContent = prevMonthDays - startDay + i + 1;
      grid.appendChild(d);
    }
    // This month's days
    for (let i = 1; i <= daysInMonth; i++) {
      const d = document.createElement('button');
      d.className = 'mini-date';
      d.textContent = i;
      const thisDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), i);
      if (isSameDay(thisDate, new Date())) d.classList.add('today');
      if (isSameDay(thisDate, selectedDate)) d.classList.add('selected');
      d.onclick = () => {
        overlay.remove();
        // Set state and navigate
        state.currentDate = new Date(thisDate);
        state.selectedDate = new Date(thisDate);
        updateDateTitle();
        renderCalendar();
      };
      grid.appendChild(d);
    }
    // Next month's days to fill grid
    const totalCells = startDay + daysInMonth;
    for (let i = 1; i <= (7 - (totalCells % 7 === 0 ? 7 : totalCells % 7)); i++) {
      const d = document.createElement('button');
      d.className = 'mini-date other-month';
      d.disabled = true;
      d.textContent = i;
      grid.appendChild(d);
    }

    // Footer
    const footer = document.createElement('div');
    footer.className = 'mini-footer';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.onclick = () => overlay.remove();
    footer.appendChild(closeBtn);

    // Main calendar container
    const cal = document.createElement('div');
    cal.id = 'miniCalendar';
    cal.appendChild(header);
    cal.appendChild(grid);
    cal.appendChild(footer);

    overlay.appendChild(cal);
    document.body.appendChild(overlay);

    // Dismiss on overlay click
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  }

  // Year picker for fast navigation
  function showYearPicker() {
    const cal = document.getElementById('miniCalendar');
    if (!cal) return;
    cal.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'mini-header';
    const backBtn = document.createElement('button');
    backBtn.innerHTML = '&#8592;';
    backBtn.onclick = () => { renderMiniCalendar(); };
    header.appendChild(backBtn);
    const title = document.createElement('span');
    title.className = 'mini-title';
    title.textContent = 'Pick a year';
    header.appendChild(title);

    cal.appendChild(header);

    const yearsGrid = document.createElement('div');
    yearsGrid.style.display = 'grid';
    yearsGrid.style.gridTemplateColumns = 'repeat(4, 1fr)';
    yearsGrid.style.gap = '0.5em';
    yearsGrid.style.margin = '1em 0';

    const currentYear = viewDate.getFullYear();
    const startYear = currentYear - 7;
    for (let y = startYear; y < startYear + 16; y++) {
      const yBtn = document.createElement('button');
      yBtn.textContent = y;
      yBtn.className = 'mini-date';
      if (y === currentYear) yBtn.classList.add('today');
      yBtn.onclick = () => {
        viewDate.setFullYear(y);
        renderMiniCalendar();
      };
      yearsGrid.appendChild(yBtn);
    }
    cal.appendChild(yearsGrid);

    const footer = document.createElement('div');
    footer.className = 'mini-footer';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.onclick = () => overlay.remove();
    footer.appendChild(closeBtn);
    cal.appendChild(footer);
  }

  renderMiniCalendar();
}

// Update load events function to use Firebase
async function loadEvents() {
  try {
    const events = await fetchEvents();
    state.events = events.map(event => ({
      ...event,
      // Map Firebase fields to calendar fields
      date: event.date,
      time: event.time || '09:00',
      title: event.title,
      description: event.description || '',
      color: event.color || 'purple',
      isComplex: event.isComplex || false,
      aiEnabled: event.aiEnabled || false,
      notificationsEnabled: event.notificationsEnabled || false,
      priority: event.priority || 'none',
      recurrence: event.recurrence || 'none',
      aiResponse: event.aiResponse || '',
      userId: event.userId // <-- ADD THIS LINE
    }));
  } catch (error) {
    console.error('Error loading events from Firebase:', error);
    state.events = [];
  }
}

// Save events to localStorage
function saveEvents() {
  localStorage.setItem('calendarEvents', JSON.stringify(state.events));
}

// Add all event listeners
elements.taskModal.addEventListener('click', function(e) {
  // Back button
  if (e.target.closest('#modalBackBtn')) {
    handleModalBack();
  }
  // Add more as needed for other modal buttons...
});

// For event details modal
elements.eventDetailsModal.addEventListener('click', function(e) {
  if (e.target.closest('#editEventBtn')) {
    handleEditEvent();
  }
  if (e.target.closest('#deleteEventBtn')) {
    handleDeleteEvent();
  }
  if (e.target.closest('#closeEventDetailsBtn') || e.target.closest('#closeEventDetailsFooterBtn')) {
    closeEventDetailsModal();
  }
  if (e.target.closest('#detailsTab')) {
    setActiveTab('details');
  }
  if (e.target.closest('#aiTab')) {
    setActiveTab('ai');
  }
});
console.log('modalBackBtn:', elements.modalBackBtn);
// Set the current view
function setView(view) {
  state.view = view;
  
  // Update active button styling
  elements.monthViewBtn.className = 'px-3 py-1.5 text-sm hover:bg-muted';
  elements.weekViewBtn.className = 'px-3 py-1.5 text-sm hover:bg-muted';
  elements.dayViewBtn.className = 'px-3 py-1.5 text-sm hover:bg-muted';
  if (elements.mobileViewDropdown) {
    elements.mobileViewDropdown.value = view;
  }
  if (view === 'month') {
    elements.monthViewBtn.className = 'px-3 py-1.5 text-sm bg-purple-500 text-white';
  } else if (view === 'week') {
    elements.weekViewBtn.className = 'px-3 py-1.5 text-sm bg-purple-500 text-white';
  } else if (view === 'day') {
    elements.dayViewBtn.className = 'px-3 py-1.5 text-sm bg-purple-500 text-white';
  }
  
  updateDateTitle();
  renderCalendar();
}

// Update the calendar title based on current date and view
function updateDateTitle() {
  const { currentDate, view } = state;
  
  if (view === 'month') {
    elements.calendarTitle.textContent = formatMonthYear(currentDate);
  } else if (view === 'week') {
    const startOfWeek = getStartOfWeek(currentDate);
    const endOfWeek = addDays(startOfWeek, 6);
    elements.calendarTitle.textContent = `${formatDateShort(startOfWeek)} - ${formatDateShort(endOfWeek)}`;
  } else if (view === 'day') {
    elements.calendarTitle.textContent = formatDateFull(state.selectedDate);
  }
}

// Handle previous period button click
function handlePreviousPeriod() {
  const { view, currentDate } = state;
  
  if (view === 'week') {
    state.currentDate = addDays(currentDate, -7);
  } else if (view === 'day') {
    state.currentDate = addDays(currentDate, -1);
    state.selectedDate = new Date(state.currentDate);
  } else if (view === 'month') {
    state.currentDate = addMonths(currentDate, -1);
  }
  
  updateDateTitle();
  renderCalendar();
}

// Handle next period button click
function handleNextPeriod() {
  const { view, currentDate } = state;
  
  if (view === 'week') {
    state.currentDate = addDays(currentDate, 7);
  } else if (view === 'day') {
    state.currentDate = addDays(currentDate, 1);
    state.selectedDate = new Date(state.currentDate);
  } else if (view === 'month') {
    state.currentDate = addMonths(currentDate, 1);
  }
  
  updateDateTitle();
  renderCalendar();
}

// Handle today button click
function handleToday() {
  state.currentDate = new Date();
  state.selectedDate = new Date();
  
  updateDateTitle();
  renderCalendar();
}

function addSimpleSwipeNavigation() {
  let startX = 0;
  let dragging = false;
  let indicatorEl = null;
  const container = elements.calendarViewsContainer;

  // Remove previous listeners to avoid duplicates
  container.removeEventListener('touchstart', container._touchstartHandler || (()=>{}));
  container.removeEventListener('touchmove', container._touchmoveHandler || (()=>{}));
  container.removeEventListener('touchend', container._touchendHandler || (()=>{}));

  // Helper: Show SVG arrow indicator (not emoji)
  function showArrow(dir) {
    if (!indicatorEl) {
      indicatorEl = document.createElement('div');
      indicatorEl.style.position = 'fixed';
      indicatorEl.style.top = '50%';
      indicatorEl.style.transform = 'translateY(-50%)';
      indicatorEl.style.zIndex = 9999;
      indicatorEl.style.pointerEvents = 'none';
      indicatorEl.style.transition = 'opacity 0.2s';
      indicatorEl.style.opacity = '0.85';
      indicatorEl.style.background = 'rgba(60,60,100,0.10)';
      indicatorEl.style.borderRadius = '50%';
      indicatorEl.style.padding = '0.3em';
      indicatorEl.innerHTML = '';
      document.body.appendChild(indicatorEl);
    }
    if (dir === 'left') {
      indicatorEl.style.left = '';
      indicatorEl.style.right = '24px';
      indicatorEl.innerHTML = `
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#b297f4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      `;
    } else if (dir === 'right') {
      indicatorEl.style.right = '';
      indicatorEl.style.left = '24px';
      indicatorEl.innerHTML = `
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#b297f4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      `;
    }
    indicatorEl.style.display = 'block';
    indicatorEl.style.opacity = '0.85';
  }
  function hideArrow() {
    if (indicatorEl) indicatorEl.style.display = 'none';
  }

  // Touch start
  container._touchstartHandler = function(e) {
    if (state.showModal || state.showEventModal) return;
    if (e.touches.length !== 1) return;
    if (e.target.closest('.modal, .modal-overlay, #eventDetailsModal, #taskModal')) return;
    dragging = true;
    startX = e.touches[0].clientX;
  };
  container.addEventListener('touchstart', container._touchstartHandler, { passive: true });

  // Touch move
  container._touchmoveHandler = function(e) {
    if (!dragging) return;
    const dx = e.touches[0].clientX - startX;
    if (dx < -30) {
      showArrow('left');
    } else if (dx > 30) {
      showArrow('right');
    } else {
      hideArrow();
    }
  };
  container.addEventListener('touchmove', container._touchmoveHandler, { passive: true });

  // Touch end
  container._touchendHandler = function(e) {
    if (!dragging) return;
    dragging = false;
    hideArrow();
    const dx = e.changedTouches[0].clientX - startX;
    const threshold = 60;
    if (state.showModal || state.showEventModal) return;
    if (e.target.closest('.modal, .modal-overlay, #eventDetailsModal, #taskModal')) return;
    if (!container.contains(e.target)) return;
    if (dx < -threshold) {
      animateCalendarSwipe('left', () => handleNextPeriod());
    } else if (dx > threshold) {
      animateCalendarSwipe('right', () => handlePreviousPeriod());
    }
  };
  container.addEventListener('touchend', container._touchendHandler, { passive: true });
}

// Add this helper for transition animation
function animateCalendarSwipe(direction, callback) {
  const container = elements.calendarViewsContainer;
  container.style.transition = 'transform 0.3s cubic-bezier(.4,1,.3,1)';
  container.style.transform = direction === 'left' ? 'translateX(-100vw)' : 'translateX(100vw)';
  setTimeout(() => {
    container.style.transition = 'none';
    container.style.transform = 'none';
    callback();
    // Wait for re-render, then fade in
    setTimeout(() => {
      container.style.transition = 'transform 0.3s cubic-bezier(.4,1,.3,1)';
      container.style.transform = direction === 'left' ? 'translateX(100vw)' : 'translateX(-100vw)';
      setTimeout(() => {
        container.style.transform = 'none';
      }, 10);
    }, 10);
  }, 300);
}
function normalizeRowHeights() {
  const rows = document.querySelectorAll('.month-fixed-grid > .grid.grid-cols-7:not(:first-child)');
  const isMobile = window.innerWidth < 768;
  const baseMinHeight = isMobile ? 160 : 160; // default height per row

  rows.forEach(row => {
    // Reset first
    row.style.height = '';
    row.style.minHeight = `${baseMinHeight}px`;
    row.style.maxHeight = '';

    // Check if this row has a "more-events-trigger"
    const hasMoreTrigger = row.querySelector('.more-events-trigger');
    if (hasMoreTrigger) {
      // expand row just enough to fit the trigger and events
      const rowContentHeight = row.scrollHeight;
      row.style.minHeight = rowContentHeight + 20 + "px"; // add a little padding
    }
  });
}

const loader = document.getElementById('calendarLoader');
function showCalendarLoader() {
  if (loader) loader.style.display = 'flex';
}
function hideCalendarLoader() {
  if (loader) loader.style.display = 'none';
}
// Render the calendar based on the current view
function renderCalendar() {
  showCalendarLoader();
  setTimeout(() => {
    const { view } = state;
    if (view === 'month') {
      renderMonthView();
    } else if (view === 'week') {
      renderWeekView();
    } else if (view === 'day') {
      renderDayView();
    }
    // Reinitialize drag and drop after rendering
    initializeDragAndDrop();
    addDropZoneHandlers();

    // Enable swipe on mobile
    if (window.innerWidth < 768 && state.view === 'month') {
  addSimpleSwipeNavigation();
} else {
  // Remove swipe listeners if not in month view
  const container = elements.calendarViewsContainer;
  if (container) {
    container.removeEventListener('touchstart', container._touchstartHandler || (()=>{}));
    container.removeEventListener('touchmove', container._touchmoveHandler || (()=>{}));
    container.removeEventListener('touchend', container._touchendHandler || (()=>{}));
  }
}
    hideCalendarLoader();
  }, 150); // Small delay for smoothness
}
// Update the showMoreEventsPopup function with smart positioning
function showMoreEventsPopup(allEvents, date, clickPosition) {
  // Remove any existing popup
  const existingPopup = document.getElementById('moreEventsPopup');
  if (existingPopup) existingPopup.remove();

  // Create popup container
  const popup = document.createElement('div');
  popup.id = 'moreEventsPopup';
  popup.className = 'fixed bg-[#1f1f23] rounded-lg shadow-xl border border-[#2d2d35] p-4 z-50 backdrop-blur-sm';

  // Format the date for both displays
  const dateObj = parseDate(date);
  const fullDate = formatDateFull(dateObj);
  const dayOfWeek = formatDayOfWeek(dateObj);

  // Add content with updated styling and add button
  popup.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h4 class="text-sm font-medium text-purple-400">${dayOfWeek}</h4>
          <h3 class="text-lg font-medium text-white">${fullDate}</h3>
        </div>
        <div class="flex gap-2">
          <button class="add-event-in-popup" data-add-date="${date}" style="background:#9b87f5;color:#fff;border:none;border-radius:50%;width:32px;height:32px;font-size:1.5em;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.15);" aria-label="Add event">+</button>
          <button class="text-gray-400 hover:text-white transition-colors"
            id="closeMorePopup"
            style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 1.5em; border-radius: 50%; background: rgba(155,135,245,0.08); border: none;"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent opacity-50"></div>
      <div class="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
        ${allEvents.map(event => `
          <div 
            class="calendar-event cursor-pointer rounded-md p-2 transition-all hover:brightness-110 hover:translate-y-[-1px]" 
            style="background-color: ${getColorCode(event.color)}"
            data-event-id="${event.id}"
          >
            <div class="font-medium truncate text-white">${event.title}</div>
            <div class="text-xs text-white/80 flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              ${formatTime(event.time)}
            </div>
            ${event.description ? `<div class="text-xs text-white/60 mt-1 truncate">${event.description}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  // Positioning logic (same as before)
  setTimeout(() => {
    document.addEventListener('mousedown', function closePopup(e) {
      if (!popup.contains(e.target)) {
        popup.style.opacity = '0';
        popup.style.transform = 'scale(0.95)';
        setTimeout(() => {
          popup.remove();
          document.removeEventListener('mousedown', closePopup);
        }, 200);
      }
    });
  }, 10);

  // Get dimensions and calculate position
  const popupRect = popup.getBoundingClientRect();
  const triggerRect = clickPosition.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  // Calculate available space
  const spaceAbove = triggerRect.top;
  const spaceBelow = viewportHeight - triggerRect.bottom;
  const spaceLeft = triggerRect.left;
  const spaceRight = viewportWidth - triggerRect.right;

  // Position popup
  let top, left;
  if (spaceBelow >= popupRect.height || spaceBelow > spaceAbove) {
    top = triggerRect.bottom + window.scrollY + 5;
    popup.style.transformOrigin = 'top';
  } else {
    top = triggerRect.top + window.scrollY - popupRect.height - 5;
    popup.style.transformOrigin = 'bottom';
  }
  if (spaceRight >= popupRect.width) {
    left = triggerRect.left + window.scrollX;
  } else if (spaceLeft >= popupRect.width) {
    left = triggerRect.right + window.scrollX - popupRect.width;
  } else {
    left = Math.max(5, Math.min(viewportWidth - popupRect.width - 5, triggerRect.left));
  }
  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;
  popup.style.width = '320px';
  popup.style.opacity = '0';
  popup.style.transform = 'scale(0.95)';
  popup.style.transition = 'opacity 0.2s ease, transform 0.2s ease';

  requestAnimationFrame(() => {
    popup.style.opacity = '1';
    popup.style.transform = 'scale(1)';
  });

  // Event handlers
  popup.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  document.getElementById('closeMorePopup').addEventListener('click', () => {
    popup.style.opacity = '0';
    popup.style.transform = 'scale(0.95)';
    setTimeout(() => popup.remove(), 200);
  });

  // Add event click handlers
  popup.querySelectorAll('.calendar-event').forEach(eventEl => {
    eventEl.addEventListener('click', () => {
      const eventId = eventEl.getAttribute('data-event-id');
      const event = allEvents.find(e => e.id === eventId);
      if (event) {
        handleEventClick(event);
        popup.style.opacity = '0';
        popup.style.transform = 'scale(0.95)';
        setTimeout(() => popup.remove(), 200);
      }
    });
  });

  // Add event handler for add button in popup
popup.querySelector('.add-event-in-popup').addEventListener('click', (e) => {
  e.stopPropagation();
  const dateStr = e.target.getAttribute('data-add-date');
  state.selectedDate = parseDate(dateStr);
  state.selectedTime = '09:00';
  // Always open the normal modal chooser, regardless of mobile/desktop
  openTaskModal();
  popup.remove();
});
}
// Render month view
function renderMonthView() {
  const { currentDate, events } = state;
  const isMobile = window.innerWidth < 768;

  const monthStart = getStartOfMonth(currentDate);
  const monthEnd = getEndOfMonth(monthStart);
  const startDate = getStartOfWeek(monthStart);

  const rows = [];
  let days = [];
  let day = startDate;

  // Add day headers
  const dayHeaders = [];
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let i = 0; i < 7; i++) {
    dayHeaders.push(`
      <div class="h-10 flex items-center justify-center border-b border-r border-border font-medium text-sm">
        ${daysOfWeek[i]}
      </div>
    `);
  }

  rows.push(`
    <div class="grid grid-cols-7 bg-background/80 sticky top-0 z-10">
      ${dayHeaders.join('')}
    </div>
  `);

  // Create calendar days
  while (day <= monthEnd) {
    for (let i = 0; i < 7; i++) {
      const cloneDay = new Date(day);
      const dayStr = formatDate(cloneDay);

      // Filter events for this day
      const maxEvents = isMobile ? 2 : 3;
const allDayEvents = events.filter(event => event.date === dayStr);
const dayEvents = allDayEvents.slice(0, maxEvents);
const hasMoreEvents = allDayEvents.length >= maxEvents;

      const isCurrentMonth = isSameMonth(day, monthStart);
      const isToday = isSameDay(day, new Date());

      let dayClass = 'p-1 border-b border-r border-border relative';
      if (!isCurrentMonth) {
        dayClass += ' bg-background/50 text-muted-foreground';
      } else if (isToday) {
        dayClass += ' bg-muted/30';
      } else {
        dayClass += ' bg-background';
      }

      let dayContent = `
        <div class="flex justify-between items-start">
          <div class="${isToday ? 'bg-purple-500 text-white rounded-full h-6 w-6 flex items-center justify-center' : ''} text-sm font-medium">
            ${day.getDate()}
          </div>
        </div>
        <div class="mt-1 space-y-1 calendar-day-events" style="position: relative;">
      `;

      // Add events
      dayEvents.forEach(event => {
        const colorCode = getColorCode(event.color);
        dayContent += `
          <div 
            class="calendar-event" 
            style="background-color: ${colorCode}" 
            data-event-id="${event.id}"
            draggable="true"
          >
            <div class="font-medium truncate">${event.title}</div>
            <div class="text-[10px] opacity-80 truncate">${formatTime(event.time)}</div>
          </div>
        `;
      });

      // Add "more" button if needed (and make it more visible)
if (hasMoreEvents) {
  // Always show a visible button, even if "+0 more"
  let moreText;
  if (isMobile) {
    moreText = 'more';
  } else {
    // If exactly maxEvents, show "more"
    moreText = allDayEvents.length === maxEvents
      ? 'more'
      : `+${allDayEvents.length - maxEvents} more`;
  }
  dayContent += `
    <div 
      class="more-events-trigger"
      data-date="${dayStr}"
      style="
        margin-top: 4px;
        width: 100%;
        background: linear-gradient(90deg, rgba(155,135,245,0.18) 60%, rgba(225,112,134,0.15) 100%);
        color: #b297f4;
        font-weight: 500;
        border-radius: 8px;
        padding: 2px 0;
        text-align: center;
        font-size: 0.97em;
        letter-spacing: 0.02em;
        cursor: pointer;
        user-select: none;
        transition: filter 0.15s;
        box-shadow: none;
      "
      aria-label="Show more events"
    >${moreText}</div>
  `;
}

      dayContent += `</div>`;

      days.push(`
        <div 
          class="${dayClass}" 
          data-date="${dayStr}"
        >
          ${dayContent}
        </div>
      `);

      day = addDays(day, 1);
    }

    rows.push(`
      <div class="grid grid-cols-7">
        ${days.join('')}
      </div>
    `);

    days = [];
  }

  elements.calendarViewsContainer.innerHTML = `
    <div class="calendar-grid-month w-full h-full month-fixed-grid">
      ${rows.join('')}
    </div>
  `;
  normalizeRowHeights();

  // Remove all .cell-add-event-btn listeners (no longer needed)

  // Add event listeners for "more" buttons
  const dayCells = elements.calendarViewsContainer.querySelectorAll('[data-date]');
  dayCells.forEach(cell => {
    const moreButton = cell.querySelector('.more-events-trigger');

    // Only add cell click handler if not clicking the more button
    cell.addEventListener('click', (e) => {
      if (!e.target.closest('.more-events-trigger') && !e.target.closest('.calendar-event')) {
        const dateStr = cell.getAttribute('data-date');
        const date = parseDate(dateStr);
        handleDateClick(date);
      }
    });

    if (moreButton) {
      moreButton.addEventListener('click', (e) => {
        e.stopPropagation();
        const dateStr = cell.getAttribute('data-date');
        const allEvents = events.filter(event => event.date === dateStr);
        showMoreEventsPopup(allEvents, dateStr, moreButton);
      });
    }
  });

  // Add event listeners for events
  const eventElements = elements.calendarViewsContainer.querySelectorAll('.calendar-event');
  eventElements.forEach(eventEl => {
    eventEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const eventId = eventEl.getAttribute('data-event-id');
      const event = state.events.find(event => event.id === eventId);
      if (event) {
        handleEventClick(event);
      }
    });
  });
  setTimeout(() => normalizeRowHeights(), 0);
}

// Creative mobile solution: bottom sheet/modal for quick add
function openMobileQuickAddModal(dateStr) {
  // Remove existing modal if present
  let modal = document.getElementById('mobileQuickAddModal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'mobileQuickAddModal';
  modal.style = `
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 9999;
    background: #23232b; border-radius: 1rem 1rem 0 0; box-shadow: 0 -4px 24px rgba(0,0,0,0.25);
    padding: 1.2rem; min-width: 320px; max-width: 100vw; color: #fff; font-family: inherit;
    animation: slideUp 0.2s;
  `;
  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div>
        <strong>Add Event</strong> <span style="font-size:0.9em;">${dateStr}</span>
      </div>
      <button id="closeMobileQuickAdd" style="background:none;border:none;font-size:2em;color:#b297f4;">&times;</button>
    </div>
    <input id="quickAddTitle" type="text" placeholder="Event title" style="width:100%;margin:1em 0;padding:0.5em;border-radius:0.5em;border:none;background:#1f1f23;color:#fff;">
    <button id="quickAddSave" style="width:100%;background:#9b87f5;color:#fff;border:none;border-radius:0.5em;padding:0.7em;font-size:1.1em;">Save</button>
  `;
  document.body.appendChild(modal);

  document.getElementById('closeMobileQuickAdd').onclick = () => modal.remove();
  document.getElementById('quickAddSave').onclick = async () => {
    const title = document.getElementById('quickAddTitle').value.trim();
    if (!title) return;
    await saveEvent({
      title,
      date: dateStr,
      time: '09:00',
      color: 'purple',
      userId: getCurrentUserId(),
      lastUpdated: new Date().toISOString()
    });
    await loadEvents();
    renderCalendar();
    modal.remove();
    showToast('Event added', 'Your event was added.');
  };
}

// Add this new function to help calculate event positions
function calculateEventPositions(events) {
  // Sort events by time
  events.sort((a, b) => a.time.localeCompare(b.time));
  
  // Calculate positions and heights
  const positions = new Map();
  const columns = new Map();
  let maxColumn = 0;

  events.forEach(event => {
    let column = 0;
    while (columns.get(column)?.some(existingEvent => 
      event.time === existingEvent.time)) {
      column++;
    }
    
    maxColumn = Math.max(maxColumn, column);
    positions.set(event.id, column);
    
    if (!columns.has(column)) {
      columns.set(column, []);
    }
    columns.get(column).push(event);
  });

  return {
    positions,
    totalColumns: maxColumn + 1
  };
}

// Render week view
function renderWeekView() {
  const { currentDate, events } = state;
  
  const startDay = getStartOfWeek(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(startDay, i));
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  let html = `
    <div class="grid grid-cols-8 min-w-[800px]">
      <!-- Corner cell -->
      <div class="h-12 border-b border-r border-border sticky top-0 left-0 z-10 bg-background"></div>
      
      <!-- Day headers -->
  `;
  
  // Add day headers
  days.forEach((day, dayIndex) => {
    const isToday = isSameDay(day, new Date());
    
    html += `
      <div 
        class="h-12 border-b border-r border-border text-center sticky top-0 z-10
          ${isToday ? 'bg-muted' : 'bg-background/80'} 
          backdrop-blur-sm"
      >
        <div class="pt-2">
          <div class="text-sm font-medium">${daysOfWeek[dayIndex]}</div>
          <div 
            class="${isToday ? 'bg-purple-500 text-white w-6 h-6 rounded-full flex items-center justify-center mx-auto' : 'text-muted-foreground'} text-xs"
          >
            ${day.getDate()}
          </div>
        </div>
      </div>
    `;
  });
  
  // Add time rows
  hours.forEach((hour) => {
  html += `
    <!-- Time column -->
    <div 
     class="h-16 border-b border-r border-border text-xs text-muted-foreground flex items-start justify-end pr-2 pt-1 sticky left-0 bg-background/80 backdrop-blur-sm z-10 time-col"
    >
      ${hour.toString().padStart(2, '0')}:00
    </div>
  `;
    
    // Day cells for this hour
    days.forEach((day, dayIndex) => {
      const cellDate = new Date(day);
      cellDate.setHours(hour, 0, 0, 0);
      const dateStr = formatDate(cellDate);
      const hourStr = hour.toString().padStart(2, '0');
      
      // Filter events for this time slot
      const cellEvents = events.filter(event => {
  if (!event.date || !event.time) return false;
  const eventDate = event.date;
  const eventHour = parseInt(event.time.split(':')[0], 10);
  return eventDate === dateStr && eventHour === hour;
});
      
      const isToday = isSameDay(day, new Date());
      const isCurrentHour = isToday && new Date().getHours() === hour;
      const bgClass = isCurrentHour ? 'bg-muted/30' : (hour % 2 === 0 ? 'bg-background' : 'bg-background/50');
      
      html += `
        <div 
          class=" h-16 border-b border-r border-border relative ${bgClass}"
          data-date="${dateStr}"
          data-hour="${hourStr}"
        >
      `;
      
      // Current time indicator
      if (isToday && new Date().getHours() === hour) {
        const currentMinutes = new Date().getMinutes();
        const topPosition = (currentMinutes / 60) * 100;
        
        html += `
          <div class="absolute left-0 right-0 border-t-2 border-red-500 z-10" 
              style="top: ${topPosition}%">
            <div class="w-2 h-2 bg-red-500 rounded-full -mt-1 -ml-1"></div>
          </div>
        `;
      }
      
      if (cellEvents.length > 0) {
  const { positions, totalColumns } = calculateEventPositions(cellEvents);
  
  cellEvents.forEach((event) => {
    const colorCode = getColorCode(event.color);
    const column = positions.get(event.id);
    const width = `calc((100% - 8px) / ${totalColumns})`;
    const left = `calc(${column * 100 / totalColumns}% + 4px)`;
    
    html += `
      <div
        class="calendar-event absolute z-10"
        style="
          top: 2px; 
          height: calc(100% - 4px); 
          background-color: ${colorCode};
          width: ${width};
          left: ${left};
        "
        data-event-id="${event.id}"
        draggable="true"
      >
        <div class="font-medium truncate">${event.title}</div>
        <div class="text-xs opacity-80 truncate">${formatTime(event.time)}</div>
      </div>
    `;
  });
}
      
      html += `</div>`;
    });
  });
  
  html += `</div>`;
  
  elements.calendarViewsContainer.innerHTML = html;
  
  // Add event listeners
  const timeSlots = elements.calendarViewsContainer.querySelectorAll('[data-date][data-hour]');
  timeSlots.forEach(slot => {
    slot.addEventListener('click', (e) => {
      if (!e.target.closest('.calendar-event')) {
        const dateStr = slot.getAttribute('data-date');
        const hourStr = slot.getAttribute('data-hour');
        const date = parseDate(dateStr);
        handleTimeSlotClick(date, parseInt(hourStr, 10));
      }
    });
  });
  
  const eventElements = elements.calendarViewsContainer.querySelectorAll('.calendar-event');
  eventElements.forEach(eventEl => {
    eventEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const eventId = eventEl.getAttribute('data-event-id');
      const event = state.events.find(event => event.id === eventId);
      if (event) {
        handleEventClick(event);
      }
    });
  });
}

// Render day view
function renderDayView() {
  const { selectedDate, events } = state;
  
  const hours = Array.from({ length: 24 }, (_, i) => i);
  
  let html = `
    <div class="grid grid-cols-dayview min-w-[800px]">
      <!-- Corner cell -->
      <div class="h-12 border-b border-r border-border sticky top-0 left-0 z-10 bg-background"></div>
      
      <!-- Day header -->
      <div 
        class="h-12 border-b border-r border-border text-center sticky top-0 z-10
          ${isSameDay(selectedDate, new Date()) ? 'bg-muted' : 'bg-background/80'} 
          backdrop-blur-sm"
      >
        <div class="pt-2">
          <div class="text-sm font-medium">${formatDayOfWeek(selectedDate)}</div>
          <div 
            class="${isSameDay(selectedDate, new Date()) ? 'bg-purple-500 text-white w-6 h-6 rounded-full flex items-center justify-center mx-auto' : 'text-muted-foreground'} text-xs"
          >
            ${selectedDate.getDate()}
          </div>
        </div>
      </div>
  `;
  
  // Add time rows
  hours.forEach((hour) => {
    const dateStr = formatDate(selectedDate);
    const hourStr = hour.toString().padStart(2, '0');
    
    html += `
      <!-- Time column -->
      <div 
        class=" h-16 border-b border-r border-border text-xs text-muted-foreground flex items-start justify-end pr-2 pt-1 sticky left-0 bg-background/80 backdrop-blur-sm z-10 time-col"
      >
        ${hourStr}:00
      </div>
      
      <!-- Day cell for this hour -->
      <div 
        class=" h-16 border-b border-r border-border relative ${
          isSameDay(selectedDate, new Date()) && new Date().getHours() === hour 
            ? 'bg-muted/30' 
            : hour % 2 === 0 ? 'bg-background' : 'bg-background/50'
        }"
        data-date="${dateStr}"
        data-hour="${hourStr}"
      >
    `;
    
    // Current time indicator
    if (isSameDay(selectedDate, new Date()) && new Date().getHours() === hour) {
      const currentMinutes = new Date().getMinutes();
      const topPosition = (currentMinutes / 60) * 100;
      
      html += `
        <div class="absolute left-0 right-0 border-t-2 border-red-500 z-10" 
            style="top: ${topPosition}%">
          <div class="w-2 h-2 bg-red-500 rounded-full -mt-1 -ml-1"></div>
        </div>
      `;
    }
    
    // Events
    const cellEvents = events.filter(event => {
  if (!event.date || !event.time) return false;
  const eventDate = event.date;
  const eventHour = parseInt(event.time.split(':')[0], 10);
  return eventDate === dateStr && eventHour === hour;
});
    
    if (cellEvents.length > 0) {
  const { positions, totalColumns } = calculateEventPositions(cellEvents);
  
  cellEvents.forEach((event) => {
    const colorCode = getColorCode(event.color);
    const column = positions.get(event.id);
    const width = `calc((100% - 8px) / ${totalColumns})`;
    const left = `calc(${column * 100 / totalColumns}% + 4px)`;
    
    html += `
      <div
        class="calendar-event absolute z-10"
        style="
          top: 2px; 
          height: calc(100% - 4px); 
          background-color: ${colorCode};
          width: ${width};
          left: ${left};
        "
        data-event-id="${event.id}"
        draggable="true"
      >
        <div class="font-medium truncate">${event.title}</div>
        <div class="text-xs opacity-80 truncate">${formatTime(event.time)}</div>
      </div>
    `;
  });
}
    
    html += `</div>`;
  });
  
  html += `</div>`;
  
  elements.calendarViewsContainer.innerHTML = html;
  
  // Add event listeners
  const timeSlots = elements.calendarViewsContainer.querySelectorAll('[data-date][data-hour]');
  timeSlots.forEach(slot => {
    slot.addEventListener('click', (e) => {
      if (!e.target.closest('.calendar-event')) {
        const dateStr = slot.getAttribute('data-date');
        const hourStr = slot.getAttribute('data-hour');
        const date = parseDate(dateStr);
        handleTimeSlotClick(date, parseInt(hourStr, 10));
      }
    });
  });
  
  const eventElements = elements.calendarViewsContainer.querySelectorAll('.calendar-event');
  eventElements.forEach(eventEl => {
    eventEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const eventId = eventEl.getAttribute('data-event-id');
      const event = state.events.find(event => event.id === eventId);
      if (event) {
        handleEventClick(event);
      }
    });
  });
}

// Update the initializeDragAndDrop function
function initializeDragAndDrop() {
  const events = document.querySelectorAll('.calendar-event');
  
  events.forEach(event => {
    event.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      const eventId = event.getAttribute('data-event-id');
      
      // Find the containing date cell
      const container = event.closest('[data-date]');
      const originalDate = container.getAttribute('data-date');
      const originalHour = container.getAttribute('data-hour');
      
      // Store the event data
      const data = {
        eventId,
        originalDate,
        originalHour,
        view: state.view
      };
      
      e.dataTransfer.setData('application/json', JSON.stringify(data));
      e.dataTransfer.effectAllowed = 'move';
      event.classList.add('dragging');

      // Log the data being set
      console.log('Drag started with data:', data);
    });
    
    event.addEventListener('dragend', () => {
      event.classList.remove('dragging');
      document.querySelectorAll('.drag-over').forEach(el => {
        el.classList.remove('drag-over');
      });
    });
  });
}

// Update the addDropZoneHandlers function
function addDropZoneHandlers() {
  const dropZones = document.querySelectorAll('[data-date]');
  
  dropZones.forEach(zone => {
    zone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    
    zone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove('drag-over');
    });
    
    zone.addEventListener('drop', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  zone.classList.remove('drag-over');
  
  try {
    const data = JSON.parse(e.dataTransfer.getData('application/json'));
    const { eventId, originalDate, originalHour, view } = data;
    const newDate = zone.getAttribute('data-date');
const newHour = zone.getAttribute('data-hour');
// Find the event in current state
    const event = state.events.find(evt => evt.id === eventId);
    if (!event) {
      console.error('Event not found in state:', eventId);
      return;
    }
// --- USAGE CHECKS FOR DRAG-AND-DROP ---
if (!event.isComplex && event.aiEnabled) {
  const allowed = await checkUsageForDay('responsesGeneratedPerDay', newDate);
  if (!allowed) {
    showToast('Limit reached', 'You have reached your daily limit for AI-enabled simple events on this day.', 'error');
    return;
  }
}
if (event.isComplex) {
  const allowedComplex = await checkUsageForDay('complexEventsPerDay', newDate);
  if (!allowedComplex) {
    showToast('Limit reached', 'You have reached your daily limit for complex events on this day.', 'error');
    return;
  }
  const hasAttachment =
    (event.attachments?.files?.length || 0) > 0 ||
    (event.attachments?.urls?.length || 0) > 0;
  if (hasAttachment) {
    const allowedAttach = await checkUsageForDay('complexEventsWithAttachmentPerDay', newDate);
    if (!allowedAttach) {
      showToast('Limit reached', 'You have reached your daily limit for complex events with attachments on this day.', 'error');
      return;
    }
  }
}
    
    // Don't update if dropped in same position
    if (originalDate === newDate && originalHour === newHour) return;

    // Only update date and time
    const updatedData = {
      date: newDate,
      lastUpdated: new Date().toISOString()
    };

    if (state.view !== 'month' && newHour) {
      const originalMinutes = event.time ? event.time.split(':')[1] : '00';
      updatedData.time = `${newHour}:${originalMinutes}`;
    }

    console.log('Updating event:', {
      eventId,
      updates: updatedData
    });

    // Use updateEvent directly for updating
    await updateFirebaseEvent(eventId, updatedData);
    
    // Refresh local state
    await loadEvents();
    
    // Re-render calendar
    renderCalendar();
    
    showToast('Event moved', 'Event has been moved successfully');
  } catch (error) {
    console.error('Error updating event:', error);
    showToast('Error', 'Failed to move event', 'error');
  }
});
  });
}

// Handle date click in month view
function handleDateClick(date) {
  state.selectedDate = date;
  
  if (state.view === 'month') {
    state.selectedTime = '09:00';
    openTaskModal();
  } else {
    state.currentDate = new Date(date);
    updateDateTitle();
    renderCalendar();
  }
}

// Handle time slot click in week/day view
function handleTimeSlotClick(date, hour) {
  state.selectedDate = date;
  state.selectedTime = `${hour.toString().padStart(2, '0')}:00`;
  openTaskModal();
}

// Handle event click
function handleEventClick(event) {
  state.selectedEvent = event;
  openEventDetailsModal(event);
}

// Open task modal
function openTaskModal() {
  resetTaskData();
  state.modalStep = 0;
  updateModalStep();
  elements.taskModal.classList.add('show');
  elements.taskModal.classList.remove('hidden'); // <-- ADD THIS LINE
}

function closeTaskModal() {
  elements.taskModal.classList.remove('show', 'modal-large');
  elements.modalBody.className = 'modal-body'; // Reset modal body classes
  elements.taskModal.classList.add('hidden'); // <-- ADD THIS LINE
}

// Reset task data
function resetTaskData() {
  state.taskData = {
    title: '',
    description: '',
    color: 'purple',
    date: formatDate(state.selectedDate),
    time: state.selectedTime || '09:00',
    isComplex: false,
    aiEnabled: false,
    notificationsEnabled: false,
    priority: 'none',
    recurrence: 'none',
    aiResponse: ''
  };
  
  state.modalStep = 0;
  state.taskType = null;
}

// Handle modal back button
function handleModalBack() {
  console.log('Back button clicked. Current modalStep:', state.modalStep);
  if (state.modalStep === 0) {
    closeTaskModal();
  } else {
    state.modalStep -= 1;
    updateModalStep();
  }
}

function updateModalStep() {
  try {
    // Remove large modal class if not on template step
    if (state.modalStep !== 2) {
      elements.taskModal.classList.remove('modal-large');
      elements.modalBody.className = 'modal-body';
    }

    console.log('Updating modal step:', {
      modalStep: state.modalStep,
      taskType: state.taskType,
      hasSelectedEvent: !!state.selectedEvent
    });

    // Handle editing existing event
    if (state.selectedEvent && state.modalStep === 0) {
      const event = state.selectedEvent;
      state.taskType = event.isComplex ? 'complex' : 'simple';
      state.taskData = { ...event };
      state.modalStep = 1;
      console.log('Initialized edit mode:', state.taskData);
    }

    // Update modal content based on step
    switch (state.modalStep) {
      case 0: // Task type selection
        elements.modalTitle.textContent = 'Choose Task Type';
        elements.modalBody.innerHTML = createTaskTypeSelector();
        
        const simpleBtn = document.getElementById('simpleTaskBtn');
        const complexBtn = document.getElementById('complexTaskBtn');
        
        if (!simpleBtn || !complexBtn) {
          throw new Error('Task type buttons not found');
        }
        
        simpleBtn.addEventListener('click', () => handleSelectTaskType('simple'));
        complexBtn.addEventListener('click', () => handleSelectTaskType('complex'));
        break;

      case 1: // Form step
  if (!state.taskType) {
    throw new Error('No task type selected');
  }

  



        if (state.taskType === 'simple') {
          elements.modalTitle.textContent = 'Add Simple Task';
          elements.modalBody.innerHTML = createSimpleTaskForm();
          addFormEventListeners('simple');
        } else if (state.taskType === 'complex') {
          elements.modalTitle.textContent = 'Add Complex Task (1/3)';
          elements.modalBody.innerHTML = createComplexTaskForm();
          addFormEventListeners('complex');
          // Explicitly add complex task event listeners
          const nextBtn = document.getElementById('complexTaskNextBtn');
          if (!nextBtn) {
            throw new Error('Complex task next button not found');
          }
          addComplexTaskEventListeners();
        }
        break;

      case 2: // Complex task template step
  if (!state.taskType === 'complex') {
    throw new Error('Invalid state: template step for non-complex task');
  }

  elements.modalTitle.textContent = 'Add Complex Task (2/3)';
  elements.taskModal.classList.add('modal-large'); // Add large modal class
  elements.modalBody.className = 'modal-body custom-scrollbar'; // Add scrollbar styles
  elements.modalBody.innerHTML = createComplexTaskTemplate();
  
  if (!templatesLoaded) {
    console.log('Loading templates before continuing...');
    loadTemplates().then(() => {
      elements.modalBody.innerHTML = createComplexTaskTemplate();
      addTemplateEventListeners();
    }).catch(error => {
      console.error('Failed to load templates:', error);
      showToast('Error', 'Failed to load task templates', 'error');
    });
  } else {
    addTemplateEventListeners();
  }
  break;

      case 3: // Complex task settings step
        if (!state.taskType === 'complex') {
          throw new Error('Invalid state: settings step for non-complex task');
        }

        elements.modalTitle.textContent = 'Add Complex Task (3/3)';
        elements.modalBody.innerHTML = createComplexTaskSettings();
        addSettingsEventListeners();
        break;

      default:
        throw new Error(`Invalid modal step: ${state.modalStep}`);
    }

    // Log current state after update
    console.log('Modal step updated:', {
      step: state.modalStep,
      taskType: state.taskType,
      taskData: state.taskData
    });

  } catch (error) {
    console.error('Error in updateModalStep:', error);
    showToast('Error', 'Failed to update modal content', 'error');
    // Optionally reset to initial state
    state.modalStep = 0;
    state.taskType = null;
  }
}

// Handle task type selection
function handleSelectTaskType(type) {
  state.taskType = type;
  state.taskData.isComplex = (type === 'complex');
  state.modalStep = 1;
  updateModalStep();
}

// Create task type selector HTML
function createTaskTypeSelector() {
  return `
    <div class="space-y-6">
      <h3 class="text-xl font-medium text-center text-purple-500">Choose Task Type</h3>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div 
          id="simpleTaskBtn"
          class="border border-border rounded-lg p-4 flex flex-col items-center cursor-pointer hover:bg-muted/20 transition-colors"
        >
          <div class="h-24 w-24 rounded-full bg-purple-500 flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          </div>
          <h4 class="text-lg font-medium">Simple Task</h4>
          <p class="text-sm text-muted-foreground text-center mt-2">
            Quick tasks with basic details and notification options
          </p>
        </div>
        
        <div 
          id="complexTaskBtn"
          class="border border-border rounded-lg p-4 flex flex-col items-center cursor-pointer hover:bg-muted/20 transition-colors"
        >
          <div class="h-24 w-24 rounded-full bg-purple-500 flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </div>
          <h4 class="text-lg font-medium">Complex Task</h4>
          <p class="text-sm text-muted-foreground text-center mt-2">
            Detailed tasks with templates and advanced settings
          </p>
        </div>
      </div>
    </div>
  `;
}

// Create simple task form HTML
function createSimpleTaskForm() {
  return `
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium mb-1" for="title">Title</label>
        <input
          type="text"
          id="title"
          name="title"
          value="${state.taskData.title || ''}"
          class="w-full px-3 py-2 bg-muted/20 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="New task on"
        />
      </div>
      
      <div>
        <label class="block text-sm font-medium mb-1" for="description">Description</label>
        <textarea
          id="description"
          name="description"
          rows="4"
          class="w-full px-3 py-2 bg-muted/20 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          placeholder="Enter task description"
        >${state.taskData.description || ''}</textarea>
      </div>
      
      <div>
        <label class="block text-sm font-medium mb-2">Event Color</label>
        <div id="colorPicker" class="flex items-center space-x-2">
          ${createColorPicker(state.taskData.color)}
        </div>
      </div>
      
      <div>
        <label class="block text-sm font-medium mb-1" for="time">Time</label>
        <input
          type="time"
          id="time"
          name="time"
          value="${state.taskData.time || '09:00'}"
          class="w-full px-3 py-2 bg-muted/20 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      
      <div class="flex items-center justify-between">
        <div class="flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5 mr-2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
          <span class="text-sm">Enable notifications</span>
        </div>
        <label class="toggle-switch">
          <input 
            type="checkbox" 
            id="notificationsEnabled"
            ${state.taskData.notificationsEnabled ? 'checked' : ''}
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
      
      <div class="flex items-center justify-between">
        <div class="flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5 mr-2"><path d="M20 6 9 17l-5-5"/></svg>
          <span class="text-sm">AI assistance</span>
        </div>
        <label class="toggle-switch">
          <input 
            type="checkbox" 
            id="aiEnabled"
            ${state.taskData.aiEnabled ? 'checked' : ''}
          />
          <span class="toggle-slider ai-toggle"></span>
        </label>
      </div>
      
      <div>
        <label class="block text-sm font-medium mb-1" for="recurrence">Recurrence</label>
        <select
          id="recurrence"
          name="recurrence"
          class="w-full px-3 py-2 bg-muted/20 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="none" ${state.taskData.recurrence === 'none' ? 'selected' : ''}>None</option>
          <option value="daily" ${state.taskData.recurrence === 'daily' ? 'selected' : ''}>Daily</option>
          <option value="weekly" ${state.taskData.recurrence === 'weekly' ? 'selected' : ''}>Weekly</option>
          <option value="biweekly" ${state.taskData.recurrence === 'biweekly' ? 'selected' : ''}>Bi-Weekly</option>
          <option value="monthly" ${state.taskData.recurrence === 'monthly' ? 'selected' : ''}>Monthly</option>
          <option value="yearly" ${state.taskData.recurrence === 'yearly' ? 'selected' : ''}>Yearly</option>
        </select>
      </div>
      <div id="recurrenceOptions" class="space-y-2 mt-2">
        <!-- Dynamic recurrence options will be injected here -->
      </div>

      <button 
        id="saveSimpleTaskBtn"
        class="w-full bg-purple-500 text-white rounded-md py-2.5 font-medium hover:bg-purple-600 transition-colors"
      >
        Save
      </button>
    </div>
  `;
}

// Add this new function for AI categorization
async function getAITaskCategory(title, description) {
  const backendUrl = "https://my-backend-three-pi.vercel.app/api/taskCategory";
  
  const prompt = `
    Based on the following task title and description, pick the most appropriate category and task type from the list below:

    Categories and Task Types:
    1. generateList
    2. speechWriting
    3. presentationCreation
    4. meetingPreparation
    5. resumeWriting
    6. coverLetterDraft
    7. interviewPreparation
    8. emailFollowUp
    9. researchSummary
    10. businessPlan
    11. reportWriting
    12. academicEssayWriting
    13. socialMediaPost
    14. productLaunchPlan
    15. salesPitch
    16. brainstormSuggestions
    17. creativeWritingPrompt
    18. healthyRecipeIdeas
    19. diyProjects
    20. conductResearch
    21. learningHelp
    22. emailDraft
    23. revisionHelp
    24. informationSummarise

    Task Title: ${title}
    Task Description: ${description}

    Respond with the most suitable task type (e.g., "brainstormSuggestions") and a brief reason for your choice.
  `;

  try {
    const response = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      throw new Error('Failed to get AI categorization');
    }

    const data = await response.json();
    return {
      taskType: data.taskType.trim().replace(/^"|"$/g, ""),
      reason: data.reason.trim()
    };
  } catch (error) {
    console.error('AI categorization error:', error);
    throw error;
  }
}

// Add this new function for handling edit next button click
async function handleEditNextClick() {
  const title = document.getElementById('title').value;
  const description = document.getElementById('description').value;
  
  if (!title || !description) {
    showToast('Error', 'Please enter both title and description', 'error');
    return;
  }

  try {
    // Update state with form values
    state.taskData = {
      ...state.taskData,
      title,
      description
    };

    // Move to template step
    state.modalStep = 2;
    updateModalStep();

    // Pre-fill template data if it exists
    if (state.taskData.templateData) {
      setTimeout(() => {
        prefillTemplateData(state.taskData.templateData);
      }, 100);
    }
  } catch (error) {
    console.error('Error in edit flow:', error);
    showToast('Error', 'Failed to proceed. Please try again.', 'error');
  }
}

// Create complex task form HTML
function createComplexTaskForm(isEdit = false) {
  return `
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium mb-1" for="title">Title</label>
        <input
          type="text"
          id="title"
          name="title"
          value="${state.taskData.title || ''}"
          class="w-full px-3 py-2 bg-muted/20 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="New task on"
        />
      </div>
      
      <div>
        <label class="block text-sm font-medium mb-1" for="description">Description</label>
        <textarea
          id="description"
          name="description"
          rows="4"
          class="w-full px-3 py-2 bg-muted/20 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          placeholder="Enter task description"
        >${state.taskData.description || ''}</textarea>
      </div>
      
      <div>
        <label class="block text-sm font-medium mb-2">Event Color</label>
        <div id="colorPicker" class="flex items-center space-x-2">
          ${createColorPicker(state.taskData.color)}
        </div>
      </div>
      
      <div>
        <label class="block text-sm font-medium mb-1" for="time">Time</label>
        <input
          type="time"
          id="time"
          name="time"
          value="${state.taskData.time || '09:00'}"
          class="w-full px-3 py-2 bg-muted/20 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      
      ${isEdit ? `
        <button 
          id="editNextBtn"
          class="w-full bg-purple-500 text-white rounded-md py-2.5 font-medium hover:bg-purple-600 transition-colors"
        >
          Next
        </button>
      ` : `
        <button 
          id="complexTaskNextBtn"
          class="w-full bg-purple-500 text-white rounded-md py-2.5 font-medium hover:bg-purple-600 transition-colors"
        >
          <span class="normal-text">Next</span>
          <span class="loading-text hidden">
            <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing...
          </span>
        </button>
      `}
    </div>
  `;
}

// Add event handler for complex task next button:
async function addComplexTaskEventListeners() {
  const nextBtn = document.getElementById('complexTaskNextBtn');
  if (!nextBtn) {
    console.error('Next button not found');
    return;
  }

  nextBtn.addEventListener('click', async () => {
    const title = document.getElementById('title').value;
    const description = document.getElementById('description').value;

    if (!title || !description) {
      showToast('Error', 'Please enter both title and description', 'error');
      return;
    }

    try {
      // Show loading state
      nextBtn.disabled = true;
      nextBtn.querySelector('.normal-text').classList.add('hidden');
      nextBtn.querySelector('.loading-text').classList.remove('hidden');

      // Get AI categorization
      const { taskType, reason } = await getAITaskCategory(title, description);
      console.log('AI Response:', { taskType, reason });

      // Store in state
      state.taskData = {
        ...state.taskData,
        title,
        description,
        aiTaskType: taskType,
        aiReason: reason
      };

      console.log('State updated:', state.taskData);

      // Load templates if not already loaded
      await loadTemplates();
      console.log('Templates loaded');

      // Move to template step
      state.modalStep = 2;
      updateModalStep();

    } catch (error) {
      console.error('Error processing task:', error);
      showToast('Error', 'Failed to process task. Please try again.', 'error');
    } finally {
      // Reset button state
      nextBtn.disabled = false;
      nextBtn.querySelector('.normal-text').classList.remove('hidden');
      nextBtn.querySelector('.loading-text').classList.add('hidden');
    }
  });
}

// Update createComplexTaskTemplate to handle edit mode
function createComplexTaskTemplate() {
  const { aiTaskType, aiReason, id } = state.taskData;
  const isEdit = !!id;
  
  if (!aiTaskType) {
    console.error('No AI task type found in state');
    return `
      <div class="text-center text-red-500">
        Error: Failed to get AI task type
      </div>
    `;
  }

  return `
    <div class="space-y-6">
      <div class="bg-muted/20 rounded-lg p-4 border border-border">
        <h3 class="text-lg font-medium mb-2">AI Task Classification</h3>
        <p class="text-sm text-muted-foreground mb-2">Based on your input, this task has been classified as:</p>
        <div class="font-medium text-purple-500">${aiTaskType}</div>
        ${aiReason ? `<p class="text-sm mt-2">${aiReason}</p>` : ''}
      </div>

      ${isEdit && state.taskData.attachments ? `
        <div class="bg-muted/20 rounded-lg p-4 border border-border">
          <h3 class="text-lg font-medium mb-3">Current Attachments</h3>
          
          ${state.taskData.attachments.files?.length > 0 ? `
            <div class="mb-4">
              <h4 class="text-sm font-medium mb-2">Files</h4>
              <ul class="space-y-2">
                ${state.taskData.attachments.files.map(file => `
                  <li class="flex items-center text-sm text-muted-foreground">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    ${file.fileName}
                  </li>
                `).join('')}
              </ul>
            </div>
          ` : `
            <p class="text-sm text-muted-foreground mb-4">No files attached</p>
          `}

          ${state.taskData.attachments.urls?.length > 0 ? `
            <div>
              <h4 class="text-sm font-medium mb-2">URLs</h4>
              <ul class="space-y-2">
                ${state.taskData.attachments.urls.map(url => `
                  <li class="flex items-center text-sm text-muted-foreground">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    ${url.url}
                  </li>
                `).join('')}
              </ul>
            </div>
          ` : `
            <p class="text-sm text-muted-foreground">No URLs added</p>
          `}
        </div>
      ` : ''}

      <div id="templateContent" class="space-y-4">
        ${getTemplateContent(aiTaskType)}
      </div>

      <button 
        id="templateNextBtn"
        class="w-full bg-purple-500 text-white rounded-md py-2.5 font-medium hover:bg-purple-600 transition-colors"
      >
        Next
      </button>
    </div>
  `;
}

function getTemplateContent(taskType) {
  console.log('Getting template for type:', taskType);
  
  const templateContainer = document.getElementById('templateContainer');
  if (!templateContainer) {
    console.error('Template container not found');
    return '';
  }

  let cleanTaskType = taskType
    .replace(/[^a-zA-Z]/g, '')
    .trim();
  
  const templateId = `template-${cleanTaskType}`;
  const template = templateContainer.querySelector(`#${templateId}`);
  
  if (template) {
    const templateContent = template.cloneNode(true);
    
    // Remove other templates
    templateContent.querySelectorAll('[id^="template-"]').forEach(el => {
      if (el.id !== templateId) {
        el.remove();
      }
    });
    
    // If editing, hide upload containers
    if (state.taskData.id) {
      templateContent.querySelectorAll('.upload-container').forEach(container => {
        container.style.display = 'none';
      });
    }
    
    return templateContent.innerHTML;
  } else {
    return `
      <div class="text-center text-muted-foreground">
        No specific template available for "${cleanTaskType}". 
        You can continue with basic event settings.
      </div>
    `;
  }
}

// Add after getTemplateContent function
function collectTemplateData() {
  const data = {
    formFields: {},
    counters: {},
    attachments: {
      files: [],
      urls: []
    }
  };

  const templateContent = document.getElementById('templateContent');
  
  if (!templateContent) {
    console.error('Template content container not found');
    return data;
  }

  try {
    // Collect form field values
    templateContent.querySelectorAll('input, textarea, select').forEach(element => {
      // Skip file inputs as they're handled separately
      if (element.type === 'file') return;

      const name = element.name;
      if (!name) return;

      if (element.type === 'checkbox') {
        const subcategoryContainer = element.closest('.subcategory-container');
        if (subcategoryContainer) {
          // Group checkboxes by container name
          if (!data.formFields[name]) {
            data.formFields[name] = [];
          }
          if (element.checked) {
            data.formFields[name].push(element.value);
          }
        } else {
          // Regular checkbox
          data.formFields[name] = element.checked;
        }
      } else {
        // Regular inputs, textareas, and selects
        data.formFields[name] = element.value;
      }
    });

    // Collect counter values
    templateContent.querySelectorAll('.counter-container').forEach(counter => {
      const counterId = counter.getAttribute('data-counter-id');
      if (counterId) {
        const counterEl = counter.querySelector('.counter');
        if (counterEl) {
          data.counters[counterId] = parseInt(counterEl.value, 10) || 0;
        }
      }
    });

    // Get attachments from templateStorage instead of DOM
    templateContent.querySelectorAll('.upload-container').forEach(container => {
      const templateId = container.getAttribute('data-template-id');
      if (templateId) {
        // Get files from templateStorage
        const file = templateStorage.getFile(templateId);
        if (file) {
          data.attachments.files.push({
            templateId,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            lastModified: file.lastModified
          });
        }

        // Get URLs from templateStorage
        const url = templateStorage.getUrl(templateId);
        if (url) {
          data.attachments.urls.push({
            templateId,
            url: url,
            addedDate: new Date().toISOString()
          });
        }
      }
    });

    console.log('Collected template data:', data);
    return data;

  } catch (error) {
    console.error('Error collecting template data:', error);
    return data;
  }
}

// Create complex task settings HTML
function createComplexTaskSettings() {
  const isEdit = !!state.taskData.id; // Check if we're editing an existing event

  return `
    <div class="space-y-4">
      <h3 class="text-lg font-medium">Additional Settings</h3>
      
      <div class="flex items-center justify-between">
        <div class="flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5 mr-2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
          <span class="text-sm">Enable notifications</span>
        </div>
        <label class="toggle-switch">
          <input 
            type="checkbox" 
            id="notificationsEnabled"
            ${state.taskData.notificationsEnabled ? 'checked' : ''}
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
      
      <div>
        <label class="block text-sm font-medium mb-1" for="priority">Priority</label>
        <select
          id="priority"
          name="priority"
          class="w-full px-3 py-2 bg-muted/20 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="none" ${state.taskData.priority === 'none' ? 'selected' : ''}>None</option>
          <option value="low" ${state.taskData.priority === 'low' ? 'selected' : ''}>Low</option>
          <option value="medium" ${state.taskData.priority === 'medium' ? 'selected' : ''}>Medium</option>
          <option value="high" ${state.taskData.priority === 'high' ? 'selected' : ''}>High</option>
          <option value="urgent" ${state.taskData.priority === 'urgent' ? 'selected' : ''}>Urgent</option>
        </select>
      </div>
      
      <div>
  <label class="block text-sm font-medium mb-1" for="recurrence">Recurrence</label>
  <select
    id="recurrence"
    name="recurrence"
    class="w-full px-3 py-2 bg-muted/20 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
  >
    <option value="none" ${state.taskData.recurrence === 'none' ? 'selected' : ''}>None</option>
    <option value="daily" ${state.taskData.recurrence === 'daily' ? 'selected' : ''}>Daily</option>
    <option value="weekly" ${state.taskData.recurrence === 'weekly' ? 'selected' : ''}>Weekly</option>
    <option value="biweekly" ${state.taskData.recurrence === 'biweekly' ? 'selected' : ''}>Bi-Weekly</option>
    <option value="monthly" ${state.taskData.recurrence === 'monthly' ? 'selected' : ''}>Monthly</option>
    <option value="yearly" ${state.taskData.recurrence === 'yearly' ? 'selected' : ''}>Yearly</option>
  </select>
</div>
<div id="recurrenceOptions" class="space-y-2 mt-2">
  <!-- Dynamic recurrence options will be injected here -->
</div>
      
      <button 
        id="${isEdit ? 'updateComplexTaskBtn' : 'saveComplexTaskBtn'}"
        class="w-full bg-purple-500 text-white rounded-md py-2.5 font-medium hover:bg-purple-600 transition-colors"
      >
        <span class="normal-text">${isEdit ? 'Update Event' : 'Save Event'}</span>
        <span class="loading-text hidden">
          <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Processing...
        </span>
      </button>
    </div>
  `;
}

// Create color picker HTML
function createColorPicker(selectedColor) {
  const colors = [
    { name: 'purple', code: '#9b87f5' },
    { name: 'lavender', code: '#b297f4' },
    { name: 'violet', code: '#8a6af4' },
    { name: 'blue', code: '#42c2ca' },
    { name: 'pink', code: '#e17086' },
    { name: 'red', code: '#d45454' },
    { name: 'orange', code: '#e8ad51' },
    { name: 'green', code: '#3cb578' },
  ];
  
  return colors.map(color => `
    <button
      class="color-dot ${selectedColor === color.name ? 'selected' : ''}"
      style="background-color: ${color.code}"
      data-color="${color.name}"
      aria-label="Select ${color.name} color"
    ></button>
  `).join('');
}

// Add form event listeners
function addFormEventListeners(type) {
  // Title and description fields
  document.getElementById('title').addEventListener('input', (e) => {
    state.taskData.title = e.target.value;
  });
  
  document.getElementById('description').addEventListener('input', (e) => {
    state.taskData.description = e.target.value;
  });
  
  // Color picker
  const colorDots = document.querySelectorAll('.color-dot');
  colorDots.forEach(dot => {
    dot.addEventListener('click', () => {
      colorDots.forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
      state.taskData.color = dot.getAttribute('data-color');
    });
  });
  
  // Time field if exists
  const timeInput = document.getElementById('time');
  if (timeInput) {
    timeInput.addEventListener('input', (e) => {
      state.taskData.time = e.target.value;
    });
  }
  
  // Toggle switches
  const notificationsToggle = document.getElementById('notificationsEnabled');
if (notificationsToggle) {
  notificationsToggle.addEventListener('change', async (e) => {
    if (e.target.checked) {
      // Check if notifications can be enabled
      const canEnable = await canEnableEventNotifications();
      if (!canEnable) {
        e.target.checked = false;
        showToast(
          "Notifications not enabled",
          "Please enable push notifications in Settings before using event notifications.",
          "error"
        );
        return;
      }
    }
    state.taskData.notificationsEnabled = e.target.checked;
    if (type === 'simple') {
      updateModalStep(); // Refresh the form to show/hide time input
    }
  });
}
  
  const aiToggle = document.getElementById('aiEnabled');
  if (aiToggle) {
    aiToggle.addEventListener('change', (e) => {
      state.taskData.aiEnabled = e.target.checked;
    });
  }
  const recurrenceInput = document.getElementById('recurrence');
if (recurrenceInput) {
  recurrenceInput.addEventListener('change', (e) => {
    state.taskData.recurrence = e.target.value;
  });
}
// After setting up the recurrence select:

if (recurrenceInput) {
  recurrenceInput.addEventListener('change', (e) => {
    state.taskData.recurrence = e.target.value;
    renderRecurrenceOptions();
    addRecurrenceOptionsListeners();
  });
  // Initial render
  renderRecurrenceOptions();
  addRecurrenceOptionsListeners();
}
  // Save or next buttons
  if (type === 'simple') {
    const saveBtn = document.getElementById('saveSimpleTaskBtn');
    if (saveBtn) {
      // Remove any previous listeners to avoid duplicates
      const newSaveBtn = saveBtn.cloneNode(true);
saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
newSaveBtn.addEventListener('click', handleSaveEvent);
    }
  } else if (type === 'complex') {
    addComplexTaskEventListeners();
  }
}

function renderRecurrenceOptions() {
  const recurrence = state.taskData.recurrence || 'none';
  const container = document.getElementById('recurrenceOptions');
  if (!container) return;

  let html = '';

  // Days of week with pill buttons (styled like template)
  if (recurrence === 'weekly' || recurrence === 'biweekly') {
    const days = [
      { name: 'Sun', icon: '🌞' },
      { name: 'Mon', icon: '🌛' },
      { name: 'Tue', icon: '🌮' },
      { name: 'Wed', icon: '🐪' },
      { name: 'Thu', icon: '⚡' },
      { name: 'Fri', icon: '🎉' },
      { name: 'Sat', icon: '🛌' }
    ];
    html += `
      <div class="mb-2">
        <label class="block text-sm font-medium mb-1">Repeat on:</label>
        <div class="subcategory-container flex flex-wrap gap-2">
          ${days.map((d, i) => `
            <label class="subcategory" style="padding: 0.5rem 1rem; border-radius: 2rem; background: rgba(155,135,245,0.08); border: 1px solid #b297f4; cursor: pointer;">
              <input type="checkbox" class="form-checkbox accent-purple-500 rounded focus:ring-2 focus:ring-purple-400" name="recurrenceDays" value="${i}" ${state.taskData.recurrenceDays?.includes(i) ? 'checked' : ''} style="width: 1.1em; height: 1.1em;">
              <span class="flex items-center gap-1 text-sm">${d.icon} <span>${d.name}</span></span>
            </label>
          `).join('')}
        </div>
        <div class="text-xs text-muted-foreground mt-1">Select at least one day.</div>
      </div>
    `;
  }

  // Monthly/yearly repeat by (styled select)
  if (recurrence === 'monthly' || recurrence === 'yearly') {
    const date = state.selectedDate || new Date();
    const dayOfMonth = date.getDate();
    const weekday = date.toLocaleDateString(undefined, { weekday: 'long' });
    html += `
      <div class="mb-2">
        <label class="block text-sm font-medium mb-1">Repeat by:</label>
        <select id="monthlyRepeatBy" class="w-full px-3 py-2 bg-muted/20 border border-border rounded-full focus:outline-none focus:ring-2 focus:ring-primary text-white">
          <option value="date" ${state.taskData.repeatBy === 'date' ? 'selected' : ''}>📅 Day ${dayOfMonth} of the month</option>
          <option value="weekday" ${state.taskData.repeatBy === 'weekday' ? 'selected' : ''}>📆 Every ${weekday} of the month</option>
        </select>
      </div>
    `;
  }

  // End options with pill buttons/radios styled
  if (recurrence !== 'none') {
    html += `
      <div class="mb-2">
        <label class="block text-sm font-medium mb-1">Ends:</label>
        <div class="subcategory-container flex flex-col gap-2">
          <label class="subcategory" style="padding: 0.5rem 1rem; border-radius: 2rem; background: rgba(155,135,245,0.08); border: 1px solid #b297f4; cursor: pointer;">
            <input type="radio" name="recurrenceEnd" value="never" ${!state.taskData.recurrenceEnd || state.taskData.recurrenceEnd === 'never' ? 'checked' : ''} class="accent-purple-500 rounded-full focus:ring-2 focus:ring-purple-400" style="width: 1.1em; height: 1.1em;">
            <span class="flex items-center gap-1 text-sm">♾️ Never</span>
          </label>
          <label class="subcategory" style="padding: 0.5rem 1rem; border-radius: 2rem; background: rgba(155,135,245,0.08); border: 1px solid #b297f4; cursor: pointer;">
            <input type="radio" name="recurrenceEnd" value="after" ${state.taskData.recurrenceEnd === 'after' ? 'checked' : ''} class="accent-purple-500 rounded-full focus:ring-2 focus:ring-purple-400" style="width: 1.1em; height: 1.1em;">
            <span class="flex items-center gap-1 text-sm">🔁 After</span>
            <input type="number" min="1" max="100" id="recurrenceCount"
              class="w-16 px-2 py-1 ml-2 bg-muted/20 border border-border rounded-full focus:outline-none focus:ring-2 focus:ring-primary text-white"
              value="${state.taskData.recurrenceCount || 10}">
            <span class="text-xs">occurrences</span>
          </label>
          <label class="subcategory" style="padding: 0.5rem 1rem; border-radius: 2rem; background: rgba(155,135,245,0.08); border: 1px solid #b297f4; cursor: pointer;">
            <input type="radio" name="recurrenceEnd" value="on" ${state.taskData.recurrenceEnd === 'on' ? 'checked' : ''} class="accent-purple-500 rounded-full focus:ring-2 focus:ring-purple-400" style="width: 1.1em; height: 1.1em;">
            <span class="flex items-center gap-1 text-sm">📆 On date</span>
            <input type="date" id="recurrenceUntil"
              class="px-2 py-1 ml-2 bg-muted/20 border border-border rounded-full focus:outline-none focus:ring-2 focus:ring-primary text-white"
              value="${state.taskData.recurrenceUntil || ''}">
          </label>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function validateRecurrenceBeforeSave() {
  const recurrence = state.taskData.recurrence;
  if ((recurrence === 'weekly' || recurrence === 'biweekly') && (!Array.isArray(state.taskData.recurrenceDays) || state.taskData.recurrenceDays.length === 0)) {
    showToast('Missing Day', 'Please select at least one day for weekly or bi-weekly recurrence.', 'error');
    return false;
  }
  return true;
}

// --- 3. Fun progress phrases for recurring events ---
const funRecurrencePhrases = [
  "Adding all the required events...",
  "Sprinkling your calendar with magic...",
  "Planting recurring seeds...",
  "Looping through time...",
  "Making your future busy...",
  "Multiplying your plans...",
  "Scheduling like a pro...",
  "Filling up your weeks...",
  "Time traveling for you...",
  "Creating a time warp..."
];

// Add after state object
let selectedFiles = {};

// Update the addTemplateEventListeners function
function addTemplateEventListeners() {
  const templateContent = document.getElementById('templateContent');
  if (!templateContent) {
    console.error('Template content container not found');
    return;
  }

  console.log('Adding template event listeners...');

  // Setup next button
  const nextBtn = document.getElementById('templateNextBtn');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const templateData = collectTemplateData(state.taskData.aiTaskType);
      state.taskData.templateData = templateData;
      state.modalStep = 3;
      updateModalStep();
    });
  }

  // Setup file upload containers
  templateContent
  .querySelectorAll('.upload-container')
  .forEach(container => {
    // File handling
    const fileInput       = container.querySelector('input[type="file"]');
    const fileNameDisplay = container.querySelector('.file-name-display');
    const dropArea        = container.querySelector('.drop-area');

    if (fileInput && fileNameDisplay && dropArea) {
      // File input change handler
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        

        const templateId = container.dataset.templateId;
        templateStorage.addFile(templateId, file);

        fileNameDisplay.innerHTML = `
          <span class="display-text">${file.name}</span>
          <button type="button" class="delete-btn" title="Clear">&times;</button>
        `;
        fileNameDisplay.style.display = 'block';
        dropArea.classList.add('active');
      });

      // Drag & drop
      dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.style.backgroundColor = '#bbdefb';
      });

      dropArea.addEventListener('dragleave', () => {
        if (!fileNameDisplay.innerHTML) {
          dropArea.style.backgroundColor = '#e3f2fd';
        }
      });

      dropArea.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropArea.style.backgroundColor = '#e3f2fd';
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          // Restrict only for complex tasks
          
          fileInput.files = files;
          fileInput.dispatchEvent(new Event('change'));
        }
      });

      // Click anywhere (except our delete-btn) to open picker
      dropArea.addEventListener('click', e => {
        if (!e.target.classList.contains('delete-btn')) {
          fileInput.click();
        }
      });
    }

    // URL handling
    const urlButton  = container.querySelector('.url-button');
    const urlInput   = container.querySelector('input[type="url"]');
    const urlDisplay = container.querySelector('.url-display');
    const urlArea    = container.querySelector('.url-area');

    if (urlButton && urlInput && urlDisplay && urlArea) {
      urlButton.addEventListener('click', async (e) => {
        e.stopPropagation();

        if (urlInput.hidden) {
          urlInput.hidden = false;
          urlInput.focus();
          urlButton.textContent = 'Submit URL';
        } else {
          const url = urlInput.value.trim();
          if (url) {
            
            const templateId = container.dataset.templateId;
            templateStorage.addUrl(templateId, url);

            urlDisplay.innerHTML = `
              <span class="display-text">URL: ${url}</span>
              <button type="button" class="delete-btn" title="Clear">&times;</button>
            `;
            urlDisplay.style.display = 'block';
            urlArea.classList.add('active');

            urlInput.hidden = true;
            urlButton.textContent = 'Paste URL';
          }
        }
      });

      urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') urlButton.click();
      });
    }

    // Delegated clear‑button handler
    container.addEventListener('click', (e) => {
      if (!e.target.classList.contains('delete-btn')) return;

      e.preventDefault();
      e.stopPropagation();

      const parent = e.target.closest('.file-name-display, .url-display');
      if (!parent) return;

      if (parent.classList.contains('file-name-display')) {
        fileInput.value = '';
        fileNameDisplay.innerHTML = '';
        fileNameDisplay.style.display = 'none';
        dropArea.classList.remove('active');
        templateStorage.files.delete(container.dataset.templateId);
      } else {
        urlInput.value = '';
        urlDisplay.innerHTML = '';
        urlDisplay.style.display = 'none';
        urlArea.classList.remove('active');
        templateStorage.urls.delete(container.dataset.templateId);
      }
    });
  });

  // Initialize other template features
  initializeCounters();
  initializeInputRows();
  initializeOthersGroups();

  console.log('Template event listeners added successfully');
}

async function loadMammoth() {
  if (window.mammoth && typeof window.mammoth.extractRawText === "function") {
    return window.mammoth;
  }
  // dynamically import the browser build
  await import("https://cdn.jsdelivr.net/npm/mammoth@1.6.2/dist/mammoth.browser.min.js");
  if (!window.mammoth || typeof window.mammoth.extractRawText !== "function") {
    throw new Error("Failed to load Mammoth.js");
  }
  return window.mammoth;
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function extractTextFromFile(eventId, file) {
  if (!file) {
    console.error("No file provided for extraction.");
    return null;
  }

  let extractedText = "";

  try {
    console.log("🗂️ Starting text extraction from file:", file.name);

    // PDF?
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map(item => item.str);
        extractedText += strings.join(" ") + "\n";
      }
    }

    // DOCX?
    else if (file.name.toLowerCase().endsWith(".docx") && window.JSZip) {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      const contentXml = await zip.file("word/document.xml").async("string");

      const xmlDoc = new DOMParser().parseFromString(contentXml, "application/xml");
      const textNodes = [...xmlDoc.getElementsByTagName("w:t")];
      extractedText = textNodes.map(node => node.textContent).join(" ");
    }

    else {
      throw new Error("Unsupported file type. Only PDF and DOCX are supported.");
    }

    console.log("✅ Extraction complete. Sample:", extractedText.slice(0, 100));

    await updateFirebaseEvent(eventId, {
      fileResponse: extractedText || null,
      lastUpdated: new Date().toISOString()
    });

    return extractedText;
  } catch (err) {
    console.error("❌ Error extracting text from file:", err);
    return null;
  }
}


async function extractTextFromURL(eventId, url) {
  if (!url) {
    console.error("No URL provided for extraction.");
    return null;
  }

  try {
    console.log("🕸️ Starting URL extraction for:", url);

    // Call your Vercel serverless function
    const resp = await fetch(`https://my-backend-three-pi.vercel.app/api/parser?url=${encodeURIComponent(url)}`);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} when fetching /api/parser`);
    }

    const data = await resp.json();
    if (!data.text) {
      throw new Error("No `text` field returned from /api/parser");
    }

    console.log("✅ Extraction complete. Sample:", data.text.slice(0, 200));

    // Single write back to Firebase
    await updateFirebaseEvent(eventId, {
      urlResponse: data.text,
      lastUpdated: new Date().toISOString()
    });

    return data.text;
  } catch (err) {
    console.error("❌ Error extracting text from URL:", err);
    return null;
  }
}





// Add settings event listeners
function addSettingsEventListeners() {
  // Toggle switches
  // Toggle switches
  const notificationsEl = document.getElementById('notificationsEnabled');
if (notificationsEl) {
  notificationsEl.addEventListener('change', async (e) => {
    if (e.target.checked) {
      const canEnable = await canEnableEventNotifications();
      if (!canEnable) {
        e.target.checked = false;
        showToast(
          "Notifications not enabled",
          "Please enable push notifications in Settings before using event notifications.",
          "error"
        );
        return;
      }
    }
    state.taskData.notificationsEnabled = e.target.checked;
  });
}

  const aiEnabledEl = document.getElementById('aiEnabled');
  if (aiEnabledEl) {
    aiEnabledEl.addEventListener('change', (e) => {
      state.taskData.aiEnabled = e.target.checked;
    });
  }

  // Select fields
  const priorityEl = document.getElementById('priority');
  if (priorityEl) {
    priorityEl.addEventListener('change', (e) => {
      state.taskData.priority = e.target.value;
    });
  }

  const recurrenceEl = document.getElementById('recurrence');
  if (recurrenceEl) {
    recurrenceEl.addEventListener('change', (e) => {
      state.taskData.recurrence = e.target.value;
      renderRecurrenceOptions();
      addRecurrenceOptionsListeners();
    });
    // Initial render
    renderRecurrenceOptions();
    addRecurrenceOptionsListeners();
  }
  // After setting up the recurrence select:
const recurrenceInput = document.getElementById('recurrence');
if (recurrenceInput) {
  recurrenceInput.addEventListener('change', (e) => {
    state.taskData.recurrence = e.target.value;
    renderRecurrenceOptions();
    addRecurrenceOptionsListeners();
  });
  // Initial render
  renderRecurrenceOptions();
  addRecurrenceOptionsListeners();
}
  
  const isEdit = !!state.taskData.id;
  const buttonId = isEdit ? 'updateComplexTaskBtn' : 'saveComplexTaskBtn';
  const saveButton = document.getElementById(buttonId);
  if (!saveButton) {
    console.error('Save button not found in addSettingsEventListeners');
    return;
  }
// Remove previous listeners by replacing the node
const newSaveButton = saveButton.cloneNode(true);
saveButton.parentNode.replaceChild(newSaveButton, saveButton);

newSaveButton.addEventListener('click', async () => {

  try {
    saveButton.disabled = true;
    saveButton.querySelector('.normal-text').classList.add('hidden');
    saveButton.querySelector('.loading-text').classList.remove('hidden');

    

      // Get all form values
      const formData = {
        title: state.taskData.title,
        description: state.taskData.description,
        color: state.taskData.color,
        date: state.taskData.date || formatDate(state.selectedDate),
        time: state.taskData.time || state.selectedTime || '09:00',
        isComplex: true,
        aiEnabled: document.getElementById('aiEnabled') ? document.getElementById('aiEnabled').checked : false,
notificationsEnabled: document.getElementById('notificationsEnabled') ? document.getElementById('notificationsEnabled').checked : false,
priority: document.getElementById('priority') ? document.getElementById('priority').value : 'none',
recurrence: document.getElementById('recurrence') ? document.getElementById('recurrence').value : 'none',
        aiTaskType: state.taskData.aiTaskType,
        aiReason: state.taskData.aiReason,
        templateData: state.taskData.templateData,
        lastUpdated: new Date().toISOString(),
        attachments: {
          files: Array.from(templateStorage.files.entries()).map(([templateId, file]) => ({
            templateId,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            uploadDate: new Date().toISOString()
          })),
          urls: Array.from(templateStorage.urls.entries()).map(([templateId, url]) => ({
            templateId,
            url,
            addedDate: new Date().toISOString()
          }))
        }
      };

      let eventId;
      if (isEdit) {
        await updateFirebaseEvent(state.taskData.id, formData);
        eventId = state.taskData.id;
      } else {
        // Add userId for new events
        const userId = getCurrentUserId();
        if (!userId) throw new Error('User not authenticated');
        formData.userId = userId;
        
        // Save new event
        eventId = await saveEvent(formData);
      }

      // Process attachments if present
      if (templateStorage.files.size > 0 || templateStorage.urls.size > 0) {
        showToast('Processing', 'Processing attachments...', 'info');

        for (const [templateId, file] of templateStorage.files) {
          console.log(`Processing file for template ${templateId}`);
          const fileResponse = await extractTextFromFile(eventId, file);
          await updateFirebaseEvent(eventId, { 
            [`fileResponse_${templateId}`]: fileResponse 
          });
        }

        for (const [templateId, url] of templateStorage.urls) {
          console.log(`Processing URL for template ${templateId}`);
          const urlResponse = await extractTextFromURL(eventId, url);
          await updateFirebaseEvent(eventId, { 
            [`urlResponse_${templateId}`]: urlResponse 
          });
        }
      }

      // Clear storage and update UI
      templateStorage.clear();
      await loadEvents();
      renderCalendar();
      
      showToast('Success', `Event ${isEdit ? 'updated' : 'created'} successfully`);
      closeTaskModal();

    } catch (error) {
      console.error('Error saving/updating event:', error);
      showToast('Error', 'Failed to save event. Please try again.', 'error');
    } finally {
      saveButton.disabled = false;
      saveButton.querySelector('.normal-text').classList.remove('hidden');
      saveButton.querySelector('.loading-text').classList.add('hidden');
    }
  });
}

// Update handleSaveEvent for simple tasks to include loading state

async function handleSaveEvent(e) {
  if (e) e.preventDefault();
  console.log('🎯 Save event handler started');

  const saveButton = document.getElementById('saveSimpleTaskBtn');
  if (!saveButton) {
    console.error('❌ Save button not found');
    return;
  }

  // --- Validate recurrence selection ---
  if (!validateRecurrenceBeforeSave()) return;

  try {
    console.log('💾 Starting save operation');
    // Show loading state
    saveButton.disabled = true;
    saveButton.innerHTML = `
      <span class="normal-text hidden">Save</span>
      <span class="loading-text">
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Processing...
      </span>
    `;

    const userId = getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');
    const dateStr = formatDate(state.selectedDate);

    const timeInput = document.getElementById('time');
const timeValue = timeInput ? timeInput.value : (state.taskData.time || state.selectedTime || '09:00');

    // Check simple AI-enabled event limit for the selected date
if (!state.taskData.isComplex && state.taskData.aiEnabled) {
  const allowed = await checkUsageForDay('responsesGeneratedPerDay', dateStr);
  if (!allowed) {
    showToast('Limit reached', 'You have reached your daily limit for AI-enabled simple events on this day.', 'error');
    return;
  }
}

// Check complex event limit for the selected date
if (state.taskData.isComplex) {
  const allowedComplex = await checkUsageForDay('complexEventsPerDay', dateStr);
  if (!allowedComplex) {
    showToast('Limit reached', 'You have reached your daily limit for complex events on this day.', 'error');
    return;
  }
  const hasAttachment =
    (state.taskData.attachments?.files?.length || 0) > 0 ||
    (state.taskData.attachments?.urls?.length || 0) > 0;
  if (hasAttachment) {
    const allowedAttach = await checkUsageForDay('complexEventsWithAttachmentPerDay', dateStr);
    if (!allowedAttach) {
      showToast('Limit reached', 'You have reached your daily limit for complex events with attachments on this day.', 'error');
      return;
    }
  }
}

// Check simple AI-enabled event limit for the selected date
if (!state.taskData.isComplex && state.taskData.aiEnabled) {
  const allowed = await checkUsageForDay('responsesGeneratedPerDay', dateStr);
  if (!allowed) {
    showToast('Limit reached', 'You have reached your daily limit for AI-enabled simple events on this day.', 'error');
    return;
  }
}

// Check complex event limit for the selected date
if (state.taskData.isComplex) {
  const allowedComplex = await checkUsageForDay('complexEventsPerDay', dateStr);
  if (!allowedComplex) {
    showToast('Limit reached', 'You have reached your daily limit for complex events on this day.', 'error');
    return;
  }
  const hasAttachment =
    (state.taskData.attachments?.files?.length || 0) > 0 ||
    (state.taskData.attachments?.urls?.length || 0) > 0;
  if (hasAttachment) {
    const allowedAttach = await checkUsageForDay('complexEventsWithAttachmentPerDay', dateStr);
    if (!allowedAttach) {
      showToast('Limit reached', 'You have reached your daily limit for complex events with attachments on this day.', 'error');
      return;
    }
  }
}
    // Prepare attachments
    const processedFiles = [];
    if (state.taskData.isComplex && !state.selectedEvent?.id) {
  const allowed = await checkAndUpdateUsage('complexEventsPerDay');
  if (!allowed) {
    showToast('Limit reached', 'You have reached your daily limit for complex events.', 'error');
    return;
  }
  // Check complex event with attachment limit
  const hasAttachment = (
    (processedFiles.length > 0) ||
    (templateStorage.urls.size > 0)
  );
  if (hasAttachment) {
    const allowedAttach = await checkAndUpdateUsage('complexEventsWithAttachmentPerDay');
    if (!allowedAttach) {
      showToast('Limit reached', 'You have reached your daily limit for complex events with attachments.', 'error');
      return;
    }
  }
}
    for (const [templateId, file] of templateStorage.files) {
      if (file.type && file.type.startsWith("image/")) {
        const base64 = await fileToBase64(file);
        processedFiles.push({
          templateId,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          isImage: true,
          base64,
          uploadDate: new Date().toISOString()
        });
      } else {
        processedFiles.push({
          templateId,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          uploadDate: new Date().toISOString()
        });
      }
    }

    // --- STEP 5 & 6: Gather all recurrence options from state ---
    const recurrenceOptions = {
      recurrenceDays: state.taskData.recurrenceDays || [],
      repeatBy: state.taskData.repeatBy || 'date',
      recurrenceEnd: state.taskData.recurrenceEnd || 'never',
      recurrenceCount: state.taskData.recurrenceCount || 10,
      recurrenceUntil: state.taskData.recurrenceUntil || ''
    };

    // Prepare event data (save all recurrence fields)
    const baseEventData = {
      ...state.taskData,
      userId,
      lastUpdated: new Date().toISOString(),
      templateData: state.taskData.templateData || null,
      isComplex: state.taskType === 'complex',
      attachments: {
        files: processedFiles,
        urls: Array.from(templateStorage.urls.entries()).map(([templateId, url]) => ({
          templateId,
          url,
          addedDate: new Date().toISOString()
        }))
      },
      // Save all recurrence fields
      recurrenceDays: recurrenceOptions.recurrenceDays,
      repeatBy: recurrenceOptions.repeatBy,
      recurrenceEnd: recurrenceOptions.recurrenceEnd,
      recurrenceCount: recurrenceOptions.recurrenceCount,
      recurrenceUntil: recurrenceOptions.recurrenceUntil
    };

    // Recurrence logic
    const recurrence = state.taskData.recurrence || 'none';
    let eventIds = [];

    if (recurrence !== 'none' && !state.selectedEvent?.id) {
      // Only create multiple events if this is a new event, not editing
      const dates = generateRecurringDates(
        formatDate(state.selectedDate),
        recurrence,
        100, // maxCount
        recurrenceOptions
      );
      for (const date of dates) {
        const eventData = {
          ...baseEventData,
          date,
          time: state.selectedTime || '09:00'
        };
        // Remove id if present so Firebase generates a new one
        delete eventData.id;
        const newId = await saveEvent(eventData);
        eventIds.push(newId);

        if (!state.taskData.isComplex && state.taskData.aiEnabled) {
  await incrementUsageForDay('responsesGeneratedPerDay', dateStr);
}
if (state.taskData.isComplex) {
  await incrementUsageForDay('complexEventsPerDay', dateStr);
  const hasAttachment =
    (state.taskData.attachments?.files?.length || 0) > 0 ||
    (state.taskData.attachments?.urls?.length || 0) > 0;
  if (hasAttachment) {
    await incrementUsageForDay('complexEventsWithAttachmentPerDay', dateStr);
  }
}

        // Process files and URLs for each event
        if (templateStorage.files.size > 0 || templateStorage.urls.size > 0) {
          for (const [templateId, file] of templateStorage.files) {
            const fileResponse = await extractTextFromFile(newId, file);
            await updateFirebaseEvent(newId, { [`fileResponse_${templateId}`]: fileResponse });
          }
          for (const [templateId, url] of templateStorage.urls) {
            const urlResponse = await extractTextFromURL(newId, url);
            await updateFirebaseEvent(newId, { [`urlResponse_${templateId}`]: urlResponse });
          }
        }
      }
    } else {
      // Single event (or editing)
      const eventData = {
        ...baseEventData,
        date: formatDate(state.selectedDate),
        time: timeValue
      };
      let eventId;
      if (state.selectedEvent?.id) {
        await updateFirebaseEvent(state.selectedEvent.id, eventData);
        eventId = state.selectedEvent.id;
      } else {
        eventId = await saveEvent(eventData);
      }
      eventIds.push(eventId);

      // Process files and URLs for this event
      if (templateStorage.files.size > 0 || templateStorage.urls.size > 0) {
        for (const [templateId, file] of templateStorage.files) {
          const fileResponse = await extractTextFromFile(eventId, file);
          await updateFirebaseEvent(eventId, { [`fileResponse_${templateId}`]: fileResponse });
        }
        for (const [templateId, url] of templateStorage.urls) {
          const urlResponse = await extractTextFromURL(eventId, url);
          await updateFirebaseEvent(eventId, { [`urlResponse_${templateId}`]: urlResponse });
        }
      }
    }
    // Check complex event limit
  if (state.taskData.isComplex) {
    const allowed = await checkAndUpdateUsage('complexEventsPerDay');
    if (!allowed) {
      showToast('You have reached your daily limit for complex events.', 'error');
      return;
    }
    // Check complex event with attachment limit
    const hasAttachment = (
      (state.taskData.attachments?.files?.length || 0) > 0 ||
      (state.taskData.attachments?.urls?.length || 0) > 0
    );
    if (hasAttachment) {
      const allowedAttach = await checkAndUpdateUsage('complexEventsWithAttachmentPerDay');
      if (!allowedAttach) {
        showToast('You have reached your daily limit for complex events with attachments.', 'error');
        return;
      }
    }
  }
    // Clear storage
    templateStorage.clear();

    // Check tutorial state before closing modal
    console.log('🎯 Checking tutorial state before modal close');
    if (typeof window.__tutorialEventSaved__ === 'function') {
      console.log('📢 Calling tutorial event saved function');
      window.__tutorialEventSaved__();
    } else {
      console.log('❌ Tutorial event saved function not found');
    }
    // Show success message and update UI
    showToast('Event saved', `"${baseEventData.title}" has been ${state.selectedEvent ? 'updated' : 'added'}.`);
    await loadEvents();
    renderCalendar();

// Reset state and close modal
state.selectedEvent = null;
closeTaskModal();
console.log('🔄 Closing modal and updating UI');

  } catch (error) {
    console.error('Error saving event:', error);
    showToast('Error', 'Failed to save event. Please try again.', 'error');
  } finally {
    // Reset button state
    saveButton.disabled = false;
    saveButton.innerHTML = `
      <span class="normal-text">Save</span>
      <span class="loading-text hidden">
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Processing...
      </span>
    `;
  }
}
// Open event details modal
function openEventDetailsModal(event) {
  state.selectedEvent = event;
  
  // Update modal title and content
  elements.eventTitle.textContent = event.title;
  
  // Show/hide AI tab
  elements.aiTab.classList.toggle('hidden', !event.aiEnabled);
  
  // Set active tab
  setActiveTab('details');
  
  // Update content based on active tab
  updateEventDetailsContent();
  
  // Show modal
  elements.eventDetailsModal.classList.add('show');
}

// Close event details modal
function closeEventDetailsModal() {
  elements.eventDetailsModal.classList.remove('show');
  state.selectedEvent = null;
}

// Set active tab in event details modal
function setActiveTab(tab) {
  state.activeTab = tab;
  
  // Update tab styling
  if (tab === 'details') {
    elements.detailsTab.className = 'px-4 py-3 border-b-2 border-purple-500 text-purple-500 text-sm font-medium';
    elements.aiTab.className = 'px-4 py-3 border-b-2 border-transparent hover:border-border text-sm font-medium';
  } else {
    elements.detailsTab.className = 'px-4 py-3 border-b-2 border-transparent hover:border-border text-sm font-medium';
    elements.aiTab.className = 'px-4 py-3 border-b-2 border-purple-500 text-purple-500 text-sm font-medium';
  }
  
  // Update content
  updateEventDetailsContent();
}

// Update event details content based on active tab
async function updateEventDetailsContent() {
  const { selectedEvent, activeTab } = state;
  
  if (!selectedEvent) return;
  
  if (activeTab === 'details') {
    elements.eventDetailsContent.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center">
          <div 
            class="h-6 w-6 rounded-full mr-2"
            style="background-color: ${getColorCode(selectedEvent.color)}"
          ></div>
          <span class="text-sm font-medium">Event Color</span>
        </div>
        
        <div>
          <h3 class="text-sm font-medium mb-1">Description:</h3>
          <div>
  <h3 class="text-sm font-medium mb-1">Description:</h3>
  <div class="markdown-description" style="font-size:1em;">
    ${window.md.render(selectedEvent.description || 'No description')}
  </div>
</div>
        </div>

        ${selectedEvent.attachments ? `
          <div class="border border-border rounded-lg p-4">
            <h3 class="text-sm font-medium mb-3">Attachments</h3>
            
            ${selectedEvent.attachments.files?.length > 0 ? `
              <div class="mb-4">
                <h4 class="text-xs text-muted-foreground mb-2">Files:</h4>
                <ul class="space-y-2">
                  ${selectedEvent.attachments.files.map(file => `
                    <li class="flex items-center text-sm">
                      <svg class="w-4 h-4 mr-2 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                        <polyline points="13 2 13 9 20 9"/>
                      </svg>
                      ${file.fileName}
                    </li>
                  `).join('')}
                </ul>
              </div>
            ` : ''}
            
            ${selectedEvent.attachments.urls?.length > 0 ? `
              <div>
                <h4 class="text-xs text-muted-foreground mb-2">URLs:</h4>
                <ul class="space-y-2">
                  ${selectedEvent.attachments.urls.map(url => `
                    <li class="flex items-center text-sm">
                      <svg class="w-4 h-4 mr-2 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                      </svg>
                      <a href="${url.url}" target="_blank" class="text-purple-500 hover:underline">${url.url}</a>
                    </li>
                  `).join('')}
                </ul>
              </div>
            ` : ''}
          </div>
        ` : ''}
        
        <div class="grid grid-cols-3 gap-4 text-sm">
          <div>
            <h4 class="font-medium">Priority</h4>
            <p class="text-muted-foreground capitalize">
              ${selectedEvent.priority === 'none' ? 'Unset' : selectedEvent.priority}
            </p>
          </div>
          
          <div>
            <h4 class="font-medium">Notification</h4>
            <p class="text-muted-foreground">
              ${selectedEvent.notificationsEnabled ? 'Enabled' : 'Disabled'}
            </p>
          </div>
          
          <div>
            <h4 class="font-medium">AI Assist</h4>
            <p class="text-muted-foreground">
              ${selectedEvent.aiEnabled ? 'Enabled' : 'Disabled'}
            </p>
          </div>
        </div>
        
        ${selectedEvent.isComplex ? `
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <h4 class="font-medium">Date</h4>
              <p class="text-muted-foreground">
                ${formatDateFull(parseDate(selectedEvent.date))}
              </p>
            </div>
            
            <div>
              <h4 class="font-medium">Time</h4>
              <p class="text-muted-foreground">
                ${selectedEvent.time}
              </p>
            </div>
            
            <div>
              <h4 class="font-medium">Recurrence</h4>
              <p class="text-muted-foreground capitalize">
                ${selectedEvent.recurrence === 'none' ? 'None' : selectedEvent.recurrence}
              </p>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  } else {
    try {
      // Show loading state
      elements.eventDetailsContent.innerHTML = `
        <div class="flex items-center justify-center p-8">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
        </div>
      `;

      // Fetch the actual AI response from Firebase
      const response = await fetchResponseByEventId(selectedEvent.id, selectedEvent.userId);

      if (response && response.response) {
        // Use markdown-it to convert markdown to HTML
        const htmlContent = window.md.render(response.response);

        elements.eventDetailsContent.innerHTML = `
          <div class="space-y-4">
            <div class="bg-muted/20 rounded-lg p-4 border border-border">
              <h3 class="text-sm font-medium mb-2">AI Response</h3>
              <div class="prose prose-invert prose-sm max-w-none markdown-content">
                ${htmlContent}
              </div>
            </div>
          </div>
        `;
      } else {
        elements.eventDetailsContent.innerHTML = `
          <div class="bg-muted/20 rounded-lg p-4 border border-border">
            <p class="text-sm text-center text-muted-foreground">
              No AI response available. AI assistance may still be generating a response.
            </p>
          </div>
        `;
      }
    } catch (error) {
      console.error('Error fetching AI response:', error);
      elements.eventDetailsContent.innerHTML = `
        <div class="bg-red-500/10 rounded-lg p-4 border border-red-500/20">
          <p class="text-sm text-center text-red-400">
            Failed to load AI response. Please try again later.
          </p>
        </div>
      `;
    }
  }
}
// Modify the handleEditEvent function
async function handleEditEvent() {
  try {
    const eventId = state.selectedEvent?.id;
    console.log('Edit event clicked, event ID:', eventId);

    if (!eventId) {
      throw new Error('Event ID not found');
    }

    // Get full event data including attachments
    const event = await fetchEventFromFirebase(eventId);
    console.log('Raw event data:', event); // Add this debug log

    // Ensure we're getting the data correctly from the DocumentSnapshot
    const eventData = event.data ? event.data() : event;
    console.log('Parsed event data:', eventData); // Add this debug log

    if (!eventData) {
      throw new Error('Event not found');
    }

    // Force close the event details modal first
    closeEventDetailsModal();

    // FIXED: Explicitly check isComplex property from the event data
    const isComplexTask = Boolean(eventData.isComplex);
    console.log('Is complex task:', isComplexTask, typeof isComplexTask); // Modified debug log

    // Store complete event data in state
    state.taskData = {
      ...eventData,
      id: eventId,
      isComplex: isComplexTask, // Ensure boolean value
      attachments: eventData.attachments || {},
      templateData: eventData.templateData || null,
      aiTaskType: eventData.aiTaskType || null,
      aiReason: eventData.aiReason || null
    };

    // FIXED: Set task type based on isComplex boolean
    state.taskType = isComplexTask ? 'complex' : 'simple';
    console.log('State task data:', state.taskData); // Add this debug log
    console.log('Set task type to:', state.taskType); // Keep this debug log

    if (isComplexTask) {
      // Complex task edit flow
      state.modalStep = 1;
      elements.taskModal.classList.add('show');
      elements.modalTitle.textContent = 'Edit Complex Task (1/3)';
      elements.modalBody.innerHTML = createComplexTaskForm(true); // Pass true for edit mode

      // Pre-fill form data
      const titleInput = document.getElementById('title');
      const descriptionInput = document.getElementById('description');
      const timeInput = document.getElementById('time');
      
      if (titleInput) titleInput.value = eventData.title || '';
      if (descriptionInput) descriptionInput.value = eventData.description || '';
      if (timeInput) timeInput.value = eventData.time || '09:00';
      
      // Set up color picker
      const colorDots = document.querySelectorAll('.color-dot');
      colorDots.forEach(dot => {
        if (dot.getAttribute('data-color') === eventData.color) {
          dot.classList.add('selected');
        }
      });

      // Add basic form event listeners (color picker, input changes, etc.)
      addFormEventListeners('complex');

      // Find the edit next button specifically
      const editNextBtn = document.getElementById('editNextBtn');
      if (!editNextBtn) {
        console.error('Edit next button not found');
        return;
      }

      // Add event listener for the edit next button
      editNextBtn.addEventListener('click', () => {
        // Update state with current form values
        state.taskData = {
          ...state.taskData,
          title: titleInput.value,
          description: descriptionInput.value,
          time: timeInput.value,
          // Preserve existing AI data
          aiTaskType: eventData.aiTaskType,
          aiReason: eventData.aiReason
        };

        console.log('Moving to template step with data:', state.taskData);
        
        // Move to template step
        state.modalStep = 2;
        updateModalStep();

        // Pre-fill template data after small delay
        setTimeout(() => {
          if (state.taskData.templateData) {
            prefillTemplateData(state.taskData.templateData);
          }
        }, 100);
      });
    } else {
      // Handle simple task edit
      state.taskType = 'simple';
      state.modalStep = 1;
      elements.modalTitle.textContent = 'Edit Simple Task';
      elements.modalBody.innerHTML = createEditEventForm(state.taskData);
      elements.taskModal.classList.add('show');
      addEditFormEventListeners();
    }

  } catch (error) {
    console.error('Error preparing event for edit:', error);
    showToast('Error', `Failed to load event data: ${error.message}`, 'error');
  }
}

// Add this new helper function to prefill template data
function prefillTemplateData(templateData) {
  const templateContent = document.getElementById('templateContent');
  if (!templateContent || !templateData) return;

  Object.entries(templateData.formFields || {}).forEach(([key, value]) => {
    const element = templateContent.querySelector(`[name="${key}"]`);
    if (!element) return;

    if (element.type === 'checkbox') {
      if (Array.isArray(value)) {
        value.forEach(val => {
          const checkbox = templateContent.querySelector(`[name="${key}"][value="${val}"]`);
          if (checkbox) checkbox.checked = true;
        });
      } else {
        element.checked = value;
      }
    } else if (element.tagName === 'SELECT') {
      element.value = value;
    } else if (element.type !== 'file') { // Skip file inputs
      element.value = value;
    }
  });

  // Handle file attachments display only
  if (templateData.attachments) {
    templateContent.querySelectorAll('.upload-container').forEach(container => {
      const fileNameDisplay = container.querySelector('.file-name-display');
      const urlDisplay = container.querySelector('.url-display');
      const templateId = container.dataset.templateId;

      // Display file names
      const file = templateData.attachments.files.find(f => f.templateId === templateId);
      if (file && fileNameDisplay) {
        fileNameDisplay.innerHTML = `
          <span class="display-text">File: ${file.fileName}</span>
          <span class="delete-btn" title="Clear">&times;</span>
        `;
        fileNameDisplay.style.display = 'block';
      }

      // Display URLs
      const url = templateData.attachments.urls.find(u => u.templateId === templateId);
      if (url && urlDisplay) {
        urlDisplay.innerHTML = `
          <span class="display-text">URL: ${url.url}</span>
          <span class="delete-btn" title="Clear">&times;</span>
        `;
        urlDisplay.style.display = 'block';
      }
    });
  }
}



// Add this new function to create the edit form HTML
function createEditEventForm(event) {
  return `
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium mb-1" for="title">Title</label>
        <input
          type="text"
          id="title"
          name="title"
          value="${event.title || ''}"
          class="w-full px-3 py-2 bg-muted/20 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      
      <div>
  <label class="block text-sm font-medium mb-1" for="description">Description</label>
  <textarea
    id="description"
    name="description"
    rows="4"
    class="w-full px-3 py-2 bg-muted/20 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
    placeholder="Enter task description"
  >${event.description || ''}</textarea>
</div>
      
      <div>
        <label class="block text-sm font-medium mb-2">Event Color</label>
        <div id="colorPicker" class="flex items-center space-x-2">
          ${createColorPicker(event.color)}
        </div>
      </div>
      
      <div>
        <label class="block text-sm font-medium mb-1" for="date">Date</label>
        <input
          type="date"
          id="date"
          name="date"
          value="${event.date}"
          class="w-full px-3 py-2 bg-muted/20 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      
      <div>
        <label class="block text-sm font-medium mb-1" for="time">Time</label>
        <input
          type="time"
          id="time"
          name="time"
          value="${event.time || '09:00'}"
          class="w-full px-3 py-2 bg-muted/20 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      
      <div class="flex items-center justify-between">
        <div class="flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5 mr-2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
          <span class="text-sm">Notifications</span>
        </div>
        <label class="toggle-switch">
          <input 
            type="checkbox" 
            id="notificationsEnabled"
            ${event.notificationsEnabled ? 'checked' : ''}
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
      
      <div class="flex items-center justify-between">
        <div class="flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5 mr-2"><path d="M20 6 9 17l-5-5"/></svg>
          <span class="text-sm">AI assistance</span>
        </div>
        <label class="toggle-switch">
          <input 
            type="checkbox" 
            id="aiEnabled"
            ${event.aiEnabled ? 'checked' : ''}
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
      
      ${event.isComplex ? `
        <div>
          <label class="block text-sm font-medium mb-1" for="priority">Priority</label>
          <select
            id="priority"
            name="priority"
            class="w-full px-3 py-2 bg-muted/20 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="none" ${event.priority === 'none' ? 'selected' : ''}>None</option>
            <option value="low" ${event.priority === 'low' ? 'selected' : ''}>Low</option>
            <option value="medium" ${event.priority === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="high" ${event.priority === 'high' ? 'selected' : ''}>High</option>
            <option value="urgent" ${event.priority === 'urgent' ? 'selected' : ''}>Urgent</option>
          </select>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-1" for="recurrence">Recurrence</label>
          <select
            id="recurrence"
            name="recurrence"
            class="w-full px-3 py-2 bg-muted/20 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="none" ${event.recurrence === 'none' ? 'selected' : ''}>None</option>
            <option value="daily" ${event.recurrence === 'daily' ? 'selected' : ''}>Daily</option>
            <option value="weekly" ${event.recurrence === 'weekly' ? 'selected' : ''}>Weekly</option>
            <option value="biweekly" ${event.recurrence === 'biweekly' ? 'selected' : ''}>Bi-Weekly</option>
            <option value="monthly" ${event.recurrence === 'monthly' ? 'selected' : ''}>Monthly</option>
            <option value="yearly" ${event.recurrence === 'yearly' ? 'selected' : ''}>Yearly</option>
          </select>
        </div>
      ` : ''}
      
      <div class="flex space-x-2">
        <button 
          id="updateEventBtn"
          class="flex-1 bg-purple-500 text-white rounded-md py-2.5 font-medium hover:bg-purple-600 transition-colors"
        >
          Update Event
        </button>
        <button 
          id="cancelEditBtn"
          class="px-4 py-2.5 border border-border rounded-md hover:bg-muted/20 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  `;
}

// Add this new function to handle edit form event listeners
function addEditFormEventListeners() {
  // Title and description fields
  document.getElementById('title').addEventListener('input', (e) => {
    state.taskData.title = e.target.value;
  });
  
  document.getElementById('description').addEventListener('input', (e) => {
    state.taskData.description = e.target.value;
  });
  
  // Date and time fields
  document.getElementById('date').addEventListener('input', (e) => {
    state.taskData.date = e.target.value;
  });
  
  document.getElementById('time').addEventListener('input', (e) => {
    state.taskData.time = e.target.value;
  });
  
  // Color picker
  const colorDots = document.querySelectorAll('.color-dot');
  colorDots.forEach(dot => {
    dot.addEventListener('click', () => {
      colorDots.forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
      state.taskData.color = dot.getAttribute('data-color');
    });
  });
  
  // Toggle switches
  document.getElementById('notificationsEnabled').addEventListener('change', (e) => {
    state.taskData.notificationsEnabled = e.target.checked;
  });
  
  document.getElementById('aiEnabled').addEventListener('change', (e) => {
    state.taskData.aiEnabled = e.target.checked;
  });
  
  // Priority and recurrence if complex event
  if (state.taskData.isComplex) {
    document.getElementById('priority').addEventListener('change', (e) => {
      state.taskData.priority = e.target.value;
    });
    
    document.getElementById('recurrence').addEventListener('change', (e) => {
      state.taskData.recurrence = e.target.value;
    });
  }
  
// In addEditFormEventListeners(), update the updateEventBtn click handler:

// Update the addEditFormEventListeners() function's updateEventBtn handler
document.getElementById('updateEventBtn').addEventListener('click', async () => {
  const dateStr = state.taskData.date;

  // Check simple AI-enabled event limit for the selected date
  if (!state.taskData.isComplex && state.taskData.aiEnabled) {
    const allowed = await checkUsageForDay('responsesGeneratedPerDay', dateStr);
    if (!allowed) {
      showToast('Limit reached', 'You have reached your daily limit for AI-enabled simple events on this day.', 'error');
      return;
    }
  }

  // Check complex event limit for the selected date
  if (state.taskData.isComplex) {
    const allowedComplex = await checkUsageForDay('complexEventsPerDay', dateStr);
    if (!allowedComplex) {
      showToast('Limit reached', 'You have reached your daily limit for complex events on this day.', 'error');
      return;
    }
    const hasAttachment =
      (state.taskData.attachments?.files?.length || 0) > 0 ||
      (state.taskData.attachments?.urls?.length || 0) > 0;
    if (hasAttachment) {
      const allowedAttach = await checkUsageForDay('complexEventsWithAttachmentPerDay', dateStr);
      if (!allowedAttach) {
        showToast('Limit reached', 'You have reached your daily limit for complex events with attachments on this day.', 'error');
        return;
      }
    }
  }
    try {
      const eventId = state.taskData.id;
      console.log('Updating event with ID:', eventId);
      let needsAIResponse = false;
if (!state.taskData.isComplex && document.getElementById('aiEnabled').checked) {
  // Simple event, AI enabled
  needsAIResponse = true;
}
if (state.taskData.isComplex) {
  // Complex event always needs AI
  needsAIResponse = true;
}
// Only check if editing for today (prevent exploit)
const todayStr = new Date().toISOString().slice(0, 10);
      if (!eventId) {
        throw new Error('No event ID found for update');
      }

      // Gather form data while preserving existing attachments
      const updatedData = {
        id: eventId,
        title: document.getElementById('title').value,
        description: document.getElementById('description').value,
        date: document.getElementById('date').value,
        time: document.getElementById('time').value,
        color: state.taskData.color,
        notificationsEnabled: document.getElementById('notificationsEnabled').checked,
        aiEnabled: document.getElementById('aiEnabled').checked,
        isComplex: state.taskData.isComplex,
        lastUpdated: new Date().toISOString(),
        // Preserve existing attachments and responses
        attachments: state.taskData.attachments || {},
        templateData: state.taskData.templateData || null
      };

      // Preserve file and URL responses
      Object.keys(state.taskData).forEach(key => {
        if (key.startsWith('fileResponse_') || key.startsWith('urlResponse_')) {
          updatedData[key] = state.taskData[key];
        }
      });

      // Add complex event fields if applicable
      if (state.taskData.isComplex) {
        updatedData.priority = document.getElementById('priority').value;
        updatedData.recurrence = document.getElementById('recurrence').value;
      }

      console.log('Sending update with data:', updatedData);

      // Update in Firebase
      await updateFirebaseEvent(eventId, updatedData);

      if (!state.taskData.isComplex && state.taskData.aiEnabled) {
  await incrementUsageForDay('responsesGeneratedPerDay', dateStr);
}
if (state.taskData.isComplex) {
  await incrementUsageForDay('complexEventsPerDay', dateStr);
  const hasAttachment =
    (state.taskData.attachments?.files?.length || 0) > 0 ||
    (state.taskData.attachments?.urls?.length || 0) > 0;
  if (hasAttachment) {
    await incrementUsageForDay('complexEventsWithAttachmentPerDay', dateStr);
  }
}
      
      showToast('Event updated', `"${updatedData.title}" has been updated successfully.`);
      
      await loadEvents();
      renderCalendar();
      
      closeTaskModal();

    } catch (error) {
      console.error('Error updating event:', error);
      showToast('Error', `Failed to update event: ${error.message}`, 'error');
    }
});

  // Cancel button
  document.getElementById('cancelEditBtn').addEventListener('click', () => {
    closeTaskModal();
  });
}

// Update delete event handler
async function handleDeleteEvent() {
  if (!state.selectedEvent) return;

  // Show loader overlay on the event details modal
  let loader = document.createElement('div');
  loader.id = 'deleteEventLoader';
  loader.style = `
    position: fixed;
    top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(30,30,40,0.6);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  loader.innerHTML = `
    <div style="background: #23232b; padding: 2em 3em; border-radius: 1em; box-shadow: 0 8px 32px rgba(0,0,0,0.25); display: flex; flex-direction: column; align-items: center;">
      <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500 mb-4"></div>
      <div style="color: #fff; font-size: 1.1em;">Deleting event...</div>
    </div>
  `;
  elements.eventDetailsModal.appendChild(loader);

  const eventToDelete = state.selectedEvent;

  try {
    await deleteFirebaseEvent(eventToDelete.id);
    await loadEvents();
    renderCalendar();
    showToast('Event deleted', `"${eventToDelete.title}" has been removed.`, 'error');
  } catch (error) {
    console.error('Error deleting event:', error);
    showToast('Error', 'Failed to delete event. Please try again.', 'error');
  } finally {
    // Remove loader and close modal
    const loaderEl = document.getElementById('deleteEventLoader');
    if (loaderEl) loaderEl.remove();
    closeEventDetailsModal();
  }
}

// Show toast notification
function showToast(title, message, type = 'success') {
  // Prevent duplicate toasts with same title/message/type
  const existing = Array.from(document.querySelectorAll('.toast')).find(el =>
    el.querySelector('.toast-title')?.textContent === title &&
    el.querySelector('.toast-description')?.textContent === message &&
    el.classList.contains(`toast-${type}`)
  );
  if (existing) return;

  const toastId = 'toast-' + Date.now();
  const toastEl = document.createElement('div');
  toastEl.id = toastId;
  toastEl.className = `toast toast-${type}`;
  toastEl.innerHTML = `
    <div class="toast-icon">
      ${type === 'success' ? 
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' : 
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/></svg>'}
    </div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-description">${message}</div>
    </div>
    <div class="toast-close" data-toast-id="${toastId}">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
    </div>
  `;
  
  elements.toastContainer.appendChild(toastEl);
  
  // Add close handler
  toastEl.querySelector('.toast-close').addEventListener('click', () => {
    const toast = document.getElementById(toastId);
    if (toast) {
      toast.remove();
    }
  });
  
  // Auto remove after 5 seconds
  setTimeout(() => {
    const toast = document.getElementById(toastId);
    if (toast) {
      toast.remove();
    }
  }, 3000);
}

// Helper functions

// Get color code from color name
function getColorCode(colorName) {
  const colorMap = {
    purple: '#9b87f5',
    lavender: '#b297f4',
    violet: '#8a6af4',
    blue: '#42c2ca',
    pink: '#e17086',
    red: '#d45454',
    orange: '#e8ad51',
    green: '#3cb578',
  };
  
  return colorMap[colorName] || colorMap.purple;
}

// Format date as YYYY-MM-DD
function formatDate(date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

// Parse date from YYYY-MM-DD
function parseDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Format date as Month Year
function formatMonthYear(date) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

// Format date as MMM d
function formatDateShort(date) {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  
  return `${months[date.getMonth()]} ${date.getDate()}${date.getFullYear() !== new Date().getFullYear() ? ', ' + date.getFullYear() : ''}`;
}

// Format date as Weekday, Month Day, Year
function formatDateFull(date) {
  const weekdays = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday',
    'Thursday', 'Friday', 'Saturday'
  ];
  
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// Format day of week
function formatDayOfWeek(date) {
  const weekdays = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday',
    'Thursday', 'Friday', 'Saturday'
  ];
  
  return weekdays[date.getDay()];
}

// Format time (HH:MM)
function formatTime(timeStr) {
  return timeStr;
}

// Date manipulation functions

// Get start of week (Sunday)
function getStartOfWeek(date) {
  const result = new Date(date);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

// Get start of month
function getStartOfMonth(date) {
  const result = new Date(date);
  result.setDate(1);
  return result;
}

// Get end of month
function getEndOfMonth(date) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 1);
  result.setDate(0);
  return result;
}

// Add days to date
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Add months to date
function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

// Check if two dates are the same day
function isSameDay(date1, date2) {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

// Check if two dates are in the same month
function isSameMonth(date1, date2) {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth()
  );
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Add this function to prepare event data for AI
// Helper function to validate event data structure
function validateEventData(event) {
  const requiredFields = ['title', 'description'];
  const missingFields = requiredFields.filter(field => !event[field]);
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }
  
  return true;
}

function prepareEventDataForAI(event) {
  console.log('Starting event data preparation for:', event?.title || 'Unknown event');
  
  try {
    // Validate event object
    if (!event) {
      throw new Error('Event object is undefined or null');
    }

    validateEventData(event);

     // Collect base64 images if present
    let imageBase64s = [];
    if (event.attachments?.files?.length) {
      imageBase64s = event.attachments.files
        .filter(f => f.isImage && f.base64)
        .map(f => ({
          templateId: f.templateId,
          fileName: f.fileName,
          fileType: f.fileType,
          base64: f.base64
        }));
    }

    const data = {
      title: event.title || '',
      description: event.description || '',
      fileTexts: event.fileResponses ?? [],
      urlTexts: event.urlResponses ?? [],
      aiTaskType: event.aiTaskType ?? null,
      templateData: event.templateData ?? null,
      imageBase64s // <-- add this field
    };

    console.log('Initial data structure:', {
      hasTitle: !!data.title,
      hasDescription: !!data.description,
      fileTextsCount: data.fileTexts.length,
      urlTextsCount: data.urlTexts.length,
      aiTaskType: data.aiTaskType
    });

    // Process template data if available
    if (event.templateData) {
      try {
        console.log('Processing template data:', event.templateData);
        data.templateData = Object.entries(event.templateData)
          .map(([key, value]) => {
            const formattedValue = Array.isArray(value) ? value.join(", ") : value;
            console.log(`Formatting template field: ${key}:`, formattedValue);
            return `${key}: ${formattedValue}`;
          })
          .join(", ");
        console.log('Template data processed successfully');
      } catch (templateError) {
        console.error('Template data processing failed:', {
          error: templateError.message,
          stack: templateError.stack,
          templateData: event.templateData
        });
        data.templateData = null;
      }
    } else {
      console.log('No template data available for processing');
    }

    console.log('Final prepared AI data:', data);
    return data;

  } catch (error) {
    console.error('Error in prepareEventDataForAI:', {
      error: error.message,
      stack: error.stack,
      eventData: event
    });
    throw error;
  }
}


async function pollAIProcessingStatus() {
  try {
    // Call backend API to get status (GET request)
    const resp = await fetch('https://my-backend-three-pi.vercel.app/api/checkAndSendEventsForAI');
    const data = await resp.json();

    // Only show toast if events were actually sent for AI response
    if (data.ok && data.processed && data.processed.length > 0) {
      showToast('AI Processing', `Sent ${data.processed.length} events for AI response.`, 'success');
    }
    // No toast if nothing processed (avoid spam)
  } catch (err) {
    // Optionally show error toast if you want
    // showToast('AI Processing Error', err.message, 'error');
    console.error('AI Processing Error:', err);
  }
}

// Call this every minute (or on demand)
setInterval(pollAIProcessingStatus, 60000); // every minute
// Optionally call once on page load
pollAIProcessingStatus();

document.getElementById('mobileSidebarHamburger').addEventListener('click', function () {
  console.log('Hamburger clicked!');
  // If using sidebar.js API:
  if (window.sidebarAPI && typeof window.sidebarAPI.toggle === 'function') {
    window.sidebarAPI.toggle();
    console.log('Sidebar toggled via API');
  } else {
    console.log('Sidebar API not found');
  }
});
    




  