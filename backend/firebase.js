import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
  setDoc,
  orderBy,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging.js";
import { 
  GoogleAuthProvider,
  signInWithPopup 
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { 
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

// ─── CONFIG & STATE ─────────────────────────────────────────────────────────
const BACKEND_URL = "https://my-backend-three-pi.vercel.app/api";


// Firebase initialization variables
let db, auth, messaging;
let currentUserId = null;
let googleConnected = false;

// ─── INITIALIZE FIREBASE ────────────────────────────────────────────────────
async function initializeFirebase() {
  // 1) fetch config
  const response       = await fetch(`${BACKEND_URL}/firebaseConfig`);
  const firebaseConfig = await response.json();

  // 2) init
  const app     = initializeApp(firebaseConfig);
  db           = getFirestore(app);
  auth         = getAuth(app);
  messaging    = getMessaging(app);
  console.log("Firebase initialized successfully.");

  // 3) return a Promise that only resolves once onAuthStateChanged fires
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(
      auth,
      async (user) => {
        if (!user) {
          currentUserId   = null;
          googleConnected = false;
          console.log("User signed out — disabled Google sync.");
        } else {
          currentUserId = user.uid;
          console.log("User signed in:", currentUserId);

          try {
            const token = await user.getIdToken();
            const r     = await fetch(`${BACKEND_URL}/isGoogleConnected`, {
              method:  "GET",
              headers: { Authorization: `Bearer ${token}` }
            });
            const { connected } = await r.json();
            googleConnected = Boolean(connected);
            console.log("Google Calendar connected:", googleConnected);
          } catch (err) {
            googleConnected = false;
            console.error("Error checking Google connection:", err);
          }
        }

        unsub();   // stop listening after first call
        resolve(); // now initializeFirebase() truly finishes
      },
      (err) => {
        unsub();
        reject(err);
      }
    );
  });
}

// ─── KICK OFF FIREBASE INIT ─────────────────────────────────────────────────
const firebaseInitPromise = initializeFirebase()
  .then(() => console.log("Firebase + auth state initialized"))
  .catch(err => console.error("Failed to init Firebase:", err));


// Helper to get the current logged-in UID
function getCurrentUserId() {
  return currentUserId;
}

// Fetch a specific event by its Google event ID from the user's subcollection
async function fetchEventFromFirebase(eventId) {
  try {
    const userId = getCurrentUserId();
    if (!userId) throw new Error("User not authenticated.");
    const eventRef = doc(db, "users", userId, "events", eventId);
    const eventDoc = await getDoc(eventRef);

    if (eventDoc.exists()) {
      return eventDoc;
    } else {
      console.error("No event found with ID:", eventId);
      return null;
    }
  } catch (error) {
    console.error("Error fetching event from Firebase:", error);
    return null;
  }
}

// ─── EVERY FIREBASE‐USING FUNCTION MUST AWAIT THIS ─────────────────────────
async function fetchEvents() { 
  // block here until init+auth+googleConnected done
  await firebaseInitPromise;

  const userId = getCurrentUserId();
  if (!userId) throw new Error("User not authenticated.");

  const snap = await getDocs(collection(db, "users", userId, "events"));
  
  // Retrieve events and handle color assignment
  let events = snap.docs.map(d => {
    const data = d.data();
    let color = "blue"; // Default fallback color

    // Assign color based on eventData or groupColor
    if (data.color) {
      color = data.color;
    } else if (data.groupColor) {
      color = data.groupColor;
    }

    // Return event with color added to the object
    return {
      id: d.id,
      ...data,
      color // <-- add color property here
    };
  });

  console.log("🔍 fetchEvents – googleConnected =", googleConnected);
  console.log("🔍 fetchEvents – before filter:", events.length);

  // If googleConnected is true, filter out deleted events
  if (googleConnected) {
    events = events.filter(e => e.syncAction !== "delete");
    console.log("🔍 fetchEvents – after filter:", events.length);
  }

  return events;
}






// ─── CREATE EVENT ───────────────────────────────────────────────────────────
async function saveEvent(eventData) {
  await firebaseInitPromise;

  try {
    const userId = getCurrentUserId();
    if (!userId) throw new Error("User not authenticated.");

    console.log("Saving event for userId:", userId);

    const eventsCol = collection(db, "users", userId, "events");

    const payload = {
      ...eventData,
      userId
    };

    // REMOVE Google sync fields
    // No need to set googleEventId or syncAction

    const docRef = await addDoc(eventsCol, payload);

    console.log("Event added with ID:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("Error adding event:", error.message);
    throw error;
  }
}


// Color‐aware save wrapper (unchanged logic)
async function saveEventToFirebase(eventData) {
  let color = null;

  // 1. Check if eventData.color exists and is not null/undefined
  if (eventData.color) {
    color = eventData.color;
  }
  // 2. Otherwise check for groupColor
  else if (eventData.groupColor) {
    color = eventData.groupColor;
  }
  // 3. Otherwise if event has a group, try inheriting from another event in that group
  else if (eventData.group) {
    const existingGroupEvent = (await fetchEvents()).find(e => e.group === eventData.group);
    color = existingGroupEvent ? existingGroupEvent.color : "#77DD77";  // light green fallback if group exists but no previous color
  }
  // 4. If no color, no groupColor, no group → just set to blue
  else {
    color = "#4285F4"; // nice Google blue
  }

  // Set the decided color
  eventData.color = color;

  // Save the event
  await saveEvent(eventData);
}


// 2) UPDATE → mark for Google update
// ─── UPDATE EVENT ───────────────────────────────────────────────────────────
async function updateEvent(eventId, updatedData) {
  await firebaseInitPromise;
  try {
    if (!eventId) throw new Error("Invalid eventId.");
    const userId = getCurrentUserId();
    if (!userId) throw new Error("User not authenticated.");

    const ref  = doc(db, "users", userId, "events", eventId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Event not found.");

    const payload = { ...updatedData };
    // REMOVE Google sync fields
    // No need to set syncAction

    await updateDoc(ref, payload);
    console.log("Event updated:", eventId);
  } catch (error) {
    console.error("Error updating event:", error);
    throw error;
  }
}

// 3) DELETE → flag for Google delete (don’t remove locally yet)

// ─── DELETE EVENT ───────────────────────────────────────────────────────────
async function deleteEvent(eventId) {
  await firebaseInitPromise;
  try {
    const userId = getCurrentUserId();
    if (!userId) throw new Error("User not authenticated.");

    const ref  = doc(db, "users", userId, "events", eventId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Event not found.");

    // Always perform a hard delete
    await deleteDoc(ref);
    console.log("Event permanently deleted:", eventId);
  } catch (error) {
    console.error("Error deleting event:", error);
    throw error;
  }
}

// Fetch events for a specific date from the user's subcollection,
// ─── FETCH EVENTS FOR TODAY ─────────────────────────────────────────────────
async function fetchEventsForToday(dateStr) {
  await firebaseInitPromise;
  console.log("Fetching events for today:", dateStr);
  try {
    const userId = getCurrentUserId();
    if (!userId) throw new Error("User not authenticated.");

    const eventsCollection = collection(db, "users", userId, "events");
    const todayQuery = query(
      eventsCollection,
      where("date", "==", dateStr)
    );
    const querySnapshot = await getDocs(todayQuery);

    // Map + conditionally filter
    let events = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    if (googleConnected) {
      events = events.filter(event => event.syncAction !== "delete");
    }

    console.log("Today's events fetched:", events);
    return events;
  } catch (error) {
    console.error("Error fetching today's events:", error.message);
    return [];
  }
}

async function fetchEventsInRange(startDateStr, endDateStr) {
  await firebaseInitPromise;
  const userId = getCurrentUserId();
  if (!userId) throw new Error("User not authenticated.");

  const eventsCollection = collection(db, "users", userId, "events");
  const q = query(
    eventsCollection,
    where("date", ">=", startDateStr),
    where("date", "<=", endDateStr)
  );
  const querySnapshot = await getDocs(q);

  let events = querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  if (googleConnected) {
    events = events.filter(event => event.syncAction !== "delete");
  }

  return events;
}

// Response‐related functions stay on root if you like
async function saveResponse(responseData) {
  try {
    const userId = getCurrentUserId();
    if (!userId) throw new Error("User not authenticated.");
    
    if (
      !responseData.isLoading &&
      (!responseData.response ||
        responseData.response.trim() === "" ||
        responseData.response === "AI responses fetched and saved successfully")
    ) {
      console.warn("Invalid response — not saving.");
      return;
    }

    // Check if eventId exists in responseData
    if (!responseData.eventId) {
      throw new Error("eventId is required in responseData");
    }

    // Use setDoc instead of addDoc to specify the document ID
    const responseRef = doc(db, "users", userId, "responses", responseData.eventId);
    await setDoc(responseRef, { ...responseData, userId });
    
    console.log("Response saved with event ID:", responseData.eventId);
    return { id: responseData.eventId };
  } catch (error) {
    console.error("Error saving response:", error);
  }
}

async function updateResponse(docId, data) {
  const docRef = doc(db, "responses", docId);
  await updateDoc(docRef, data);
}

async function getResponsesByDateAndTitle(date, title) {
  const userId = getCurrentUserId();
  const responsesCollection = collection(db, "users", userId, "responses");
  const q = query(
    responsesCollection,
    where("userId", "==", userId),
    where("date", "==", date),
    where("eventTitle", "==", title)
  );
  const querySnapshot = await getDocs(q);
  if (!querySnapshot.empty) {
    return querySnapshot.docs[0].data();
  }
  return null;
}

async function fetchTodayResponses() {
  console.log("Starting fetchTodayResponses");
  
  await firebaseInitPromise;
  
  const userId = getCurrentUserId();
  console.log("Got userId:", userId);
  
  if (!userId) {
    console.log("No userId found, returning empty array");
    return [];
  }
  
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const dateString = `${year}-${month}-${day}`;
  
  console.log("Fetching responses for date:", dateString);
  
  const responsesCollection = collection(db, "users", userId, "responses");
  
  const q = query(
    responsesCollection,
    where("date", "==", dateString)
  );

  try {
    const querySnapshot = await getDocs(q);
    const seen = new Set();
    const responses = [];

    querySnapshot.docs.forEach(doc => {
      const response = {
        id: doc.id,
        ...doc.data()
      };
      
      // Only add if we haven't seen this eventId before
      if (!seen.has(response.eventId)) {
        seen.add(response.eventId);
        responses.push(response);
      }
    });
    
    console.log("Found responses:", responses);
    return responses;
    
  } catch (error) {
    console.error("Error fetching today's responses:", error);
    return [];
  }
}

async function fetchResponseByEventId(eventId, userId) {
  try {
    if (!userId) throw new Error("User ID required to fetch response.");
    const responseDoc = await getDoc(doc(db, "users", userId, "responses", eventId));
    if (responseDoc.exists()) {
      return responseDoc.data();
    }
    return null;
  } catch (error) {
    console.error("Error fetching response by eventId:", error);
    return null;
  }
}

// Update the checkExistingResponse function
async function checkExistingResponse(eventId) {
  try {
    const userId = getCurrentUserId();
    // Try to get the document directly using eventId as the doc ID
    const responseDoc = await getDoc(doc(db, "users", userId, "responses", eventId));
    return responseDoc.exists();
  } catch (error) {
    console.error('Error checking for existing response:', error);
    return false;
  }
}

async function fetchResponsesByDate(date) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const responsesRef = collection(db, 'users', userId, 'responses');
    const q = query(
      responsesRef,
      where('date', '==', date)
    );
    
    const querySnapshot = await getDocs(q);
    const responses = [];
    
    querySnapshot.forEach((doc) => {
      responses.push({
        id: doc.id,
        ...doc.data()
      });
    });

    console.log(`[fetchResponsesByDate] Queried date: ${date}, found:`, responses.length, responses);
    return responses;
  } catch (error) {
    console.error('Error fetching responses by date:', error);
    return [];
  }
}

async function fetchResponsesInRange(startDateStr, endDateStr) {
  await firebaseInitPromise;
  const userId = getCurrentUserId();
  if (!userId) throw new Error("User not authenticated.");

  const responsesCollection = collection(db, "users", userId, "responses");
  const q = query(
    responsesCollection,
    where("date", ">=", startDateStr),
    where("date", "<=", endDateStr)
  );
  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

async function fetchAllResponses() {
    await firebaseInitPromise;
    const userId = getCurrentUserId();
    if (!userId) throw new Error("User not authenticated.");

    const responsesCollection = collection(db, "users", userId, "responses");
    const q = query(responsesCollection, orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
}

// Add this new function with your other Firebase functions
async function saveSmartPlan(responseId, smartPlanData) {
  try {
    const userId = getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    // Get the response document reference
    const responseRef = doc(db, "users", userId, "responses", responseId);
    
    // Update the response document to include the smart plan
    await updateDoc(responseRef, {
      smartPlan: {
        ...smartPlanData,
        updatedAt: new Date().toISOString()
      }
    });

    console.log('Smart Plan saved successfully for response:', responseId);
    return true;
  } catch (error) {
    console.error('Error saving Smart Plan:', error);
    throw error;
  }
}

async function getSmartPlan(eventId) {
  try {
    const userId = getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const responseRef = doc(db, "users", userId, "responses", eventId);
    const responseDoc = await getDoc(responseRef);

    if (responseDoc.exists() && responseDoc.data().smartPlan) {
      return responseDoc.data().smartPlan;
    }
    return null;
  } catch (error) {
    console.error('Error fetching Smart Plan:', error);
    return null;
  }
}
async function updateSmartPlan(responseId, smartPlanUpdates) {
  try {
    const userId = getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const responseRef = doc(db, "users", userId, "responses", responseId);
    const responseDoc = await getDoc(responseRef);

    if (!responseDoc.exists()) {
      throw new Error('Response document not found');
    }

    const currentData = responseDoc.data();
    const updatedSmartPlan = {
      ...currentData.smartPlan,
      ...smartPlanUpdates,
      metadata: {
        ...currentData.smartPlan.metadata,
        lastModified: new Date().toISOString()
      }
    };

    await updateDoc(responseRef, {
      smartPlan: updatedSmartPlan
    });

    console.log('Smart Plan updated successfully for response:', responseId);
    return updatedSmartPlan;
  } catch (error) {
    console.error('Error updating Smart Plan:', error);
    throw error;
  }
}

async function getSmartPlanMessageCount(responseId) {
  try {
    const userId = getCurrentUserId();
    if (!userId) return 0;
    const chatCol = collection(db, "users", userId, "responses", responseId, "smartplan_chat");
    const snap = await getDocs(chatCol);
    return snap.size;
  } catch (err) {
    console.error("Error counting smartplan messages:", err);
    return 0;
  }
}

let completionMarked = false; // Prevent double marking

async function markSmartPlanCompleted() {
  if (completionMarked) return;
  completionMarked = true;
  try {
    const responseId = getEventIdFromUrl();
    if (!responseId) return;
    await updateResponse(responseId, { completed: true });
  } catch (err) {
    console.error("Failed to mark smart plan as completed:", err);
  }
}

// Add near the top of the file
function getEventIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('eventId');
}

// Update fetchEventData function
async function fetchEventData() {
  try {
    const eventId = getEventIdFromUrl();
    if (!eventId) throw new Error('No event ID provided');

    const userId = await getCurrentUserId();
    if (!userId) throw new Error('No user authenticated');

    // Get event from users/{userId}/responses/{eventId}
    const responseRef = doc(db, "users", userId, "responses", eventId);
    const responseDoc = await getDoc(responseRef);

    if (!responseDoc.exists()) {
      throw new Error('Event not found');
    }

    return responseDoc.data();
  } catch (error) {
    console.error('Error fetching event data:', error);
    throw error;
  }
}

// Update the function to accept the needed data
async function updateProgressInFirebase(smartPlanData, stepsProgress) {
  try {
    const eventId = getEventIdFromUrl();

    const cleanedProgress = Array.isArray(stepsProgress)
      ? [...stepsProgress]
      : Object.values(stepsProgress);

    const updatedPlan = {
      ...smartPlanData,
      stepProgress: cleanedProgress // ✅ renamed
    };

    await updateSmartPlan(eventId, updatedPlan);
  } catch (error) {
    console.error('Error updating progress:', error);
  }
}

async function createNewChat() {
  try {
    const userId = getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const chatRef = await addDoc(collection(db, "users", userId, "chats"), {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      title: "New Chat", // We'll update this with first message content
      userId
    });

    return chatRef.id;
  } catch (error) {
    console.error('Error creating new chat:', error);
    throw error;
  }
}

async function saveMessage(chatId, message) {
  try {
    const userId = getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    // Add message to messages subcollection
    const messageRef = await addDoc(
      collection(db, "users", userId, "chats", chatId, "messages"),
      {
        ...message,
        timestamp: new Date().toISOString()
      }
    );

    // Only update chat title if it's the first message (title is still "New Chat")
    if (message.isUser) {
      const chatDocRef = doc(db, "users", userId, "chats", chatId);
      const chatDocSnap = await getDoc(chatDocRef);
      if (chatDocSnap.exists()) {
        const chatData = chatDocSnap.data();
        if (chatData.title === "New Chat") {
          const title = message.content.substring(0, 50) + (message.content.length > 50 ? "..." : "");
          await updateDoc(chatDocRef, {
            title,
            updatedAt: new Date().toISOString()
          });
        }
      }
    }

    return messageRef.id;
  } catch (error) {
    console.error('Error saving message:', error);
    throw error;
  }
}

async function loadChat(chatId) {
  try {
    const userId = getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    // Get messages for this chat
    const messagesQuery = query(
      collection(db, "users", userId, "chats", chatId, "messages"),
      orderBy("timestamp", "asc")
    );

    const querySnapshot = await getDocs(messagesQuery);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error loading chat:', error);
    throw error;
  }
}

async function loadChatList() {
  try {
    const userId = getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const chatsQuery = query(
      collection(db, "users", userId, "chats"),
      orderBy("updatedAt", "desc")
    );

    const querySnapshot = await getDocs(chatsQuery);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error loading chat list:', error);
    return [];
  }
}

// Add this new function
async function deleteChat(chatId) {
  try {
    const userId = getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');
    console.log('Deleting chat for user:', userId);

    const messagesRef = collection(db, "users", userId, "chats", chatId, "messages");
    const messagesSnapshot = await getDocs(messagesRef);
    const batch = writeBatch(db);

    messagesSnapshot.docs.forEach(doc => batch.delete(doc.ref));

    const chatRef = doc(db, "users", userId, "chats", chatId);
    batch.delete(chatRef);

    await batch.commit();
    console.log('Batch commit complete');
    return true;
  } catch (error) {
    console.error('Error deleting chat:', error);
    throw error;
  }
}


// Add function to update chat title
async function updateChatTitle(chatId, newTitle) {
  try {
    const userId = getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const chatRef = doc(db, "users", userId, "chats", chatId);
    await updateDoc(chatRef, {
      title: newTitle,
      updatedAt: new Date().toISOString()
    });

    return true;
  } catch (error) {
    console.error('Error updating chat title:', error);
    throw error;
  }
}

// Save a message to smartplan_chat subcollection under a response
async function saveSmartPlanChatMessage(responseId, message) {
  await firebaseInitPromise;
  const userId = getCurrentUserId();
  if (!userId) throw new Error('User not authenticated');
  const db = getFirestore();
  const chatCol = collection(db, "users", userId, "responses", responseId, "smartplan_chat");
  return await addDoc(chatCol, {
    ...message,
    timestamp: new Date().toISOString()
  });
}

// --- DOCUMENTS ---

// Create a new document under users/{userId}/documents
async function createDocument(titleOrMeta, content, userId) {
    await firebaseInitPromise;
    let docData;
    if (typeof titleOrMeta === "object" && titleOrMeta !== null) {
        docData = { ...titleOrMeta, createdAt: Date.now(), lastModified: Date.now() };
    } else {
        docData = {
            title: titleOrMeta,
            content,
            userId,
            createdAt: Date.now(),
            lastModified: Date.now()
        };
    }
    const docRef = await addDoc(
        collection(db, "users", docData.userId, "documents"),
        docData
    );
    return docRef.id;
}

// Update document content in users/{userId}/documents/{documentId}
async function updateDocumentContent(documentId, newContent) {
    await firebaseInitPromise;

    const userId = getCurrentUserId();
    if (!userId) throw new Error("User not authenticated.");
    const docRef = doc(db, "users", userId, "documents", documentId);
    await updateDoc(docRef, {
        content: newContent,
        lastModified: Date.now()
    });
}

// Update only the title of a document in users/{userId}/documents/{documentId}
async function updateDocumentTitle(documentId, newTitle) {
    await firebaseInitPromise;
    const userId = getCurrentUserId();
    if (!userId) throw new Error("User not authenticated.");
    const docRef = doc(db, "users", userId, "documents", documentId);
    await updateDoc(docRef, {
        title: newTitle,
        lastModified: Date.now()
    });
}

// Get all documents for the current user from users/{userId}/documents
async function fetchDocuments() {
    await firebaseInitPromise;

    const userId = getCurrentUserId();
    if (!userId) throw new Error("User not authenticated.");
    const docsSnap = await getDocs(collection(db, "users", userId, "documents"));
    return docsSnap.docs.map(doc => {
        const data = doc.data();
        // Convert lastModified to Date object if it's a number or string
        let lastModified = data.lastModified;
        if (typeof lastModified === "number") {
            lastModified = new Date(lastModified);
        } else if (typeof lastModified === "string" && !isNaN(Number(lastModified))) {
            lastModified = new Date(Number(lastModified));
        } else if (typeof lastModified === "string") {
            lastModified = new Date(lastModified);
        } else if (!lastModified) {
            lastModified = new Date();
        }
        return {
            id: doc.id,
            ...data,
            lastModified
        };
    });
}

// Get a single document from users/{userId}/documents/{documentId}
async function fetchDocument(documentId) {
    await firebaseInitPromise;

    const userId = getCurrentUserId();
    if (!userId) throw new Error("User not authenticated.");
    const docSnap = await getDoc(doc(db, "users", userId, "documents", documentId));
    if (!docSnap.exists()) return null;
    const data = docSnap.data();
    let lastModified = data.lastModified;
    if (typeof lastModified === "number") {
        lastModified = new Date(lastModified);
    } else if (typeof lastModified === "string" && !isNaN(Number(lastModified))) {
        lastModified = new Date(Number(lastModified));
    } else if (typeof lastModified === "string") {
        lastModified = new Date(lastModified);
    } else if (!lastModified) {
        lastModified = new Date();
    }
    return {
        id: docSnap.id,
        ...data,
        lastModified
    };
}

// --- HISTORY ---

// Save an AI action to users/{userId}/documents/{documentId}/history
async function saveDocumentHistory(documentId, action, aiResponse) {
    await firebaseInitPromise;

    const userId = getCurrentUserId();
    if (!userId) throw new Error("User not authenticated.");
    const historyRef = collection(db, "users", userId, "documents", documentId, "history");
    const docRef = await addDoc(historyRef, {
        action,
        aiResponse,
        timestamp: new Date().toISOString()
    });
    return docRef.id;
}

// Fetch all history items from users/{userId}/documents/{documentId}/history
async function fetchDocumentHistory(documentId) {
    await firebaseInitPromise;

    const userId = getCurrentUserId();
    if (!userId) throw new Error("User not authenticated.");
    const historySnap = await getDocs(collection(db, "users", userId, "documents", documentId, "history"));
    return historySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Fetch a single history item from users/{userId}/documents/{documentId}/history/{historyId}
async function fetchHistoryItem(documentId, historyId) {
    await firebaseInitPromise;

    const userId = getCurrentUserId();
    if (!userId) throw new Error("User not authenticated.");
    const docSnap = await getDoc(doc(db, "users", userId, "documents", documentId, "history", historyId));
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
}

// --- CHAT ---

// Save a chat message under users/{userId}/documents/{documentId}/history/{historyId}/chats/{chatId}/messages
async function saveChatMessage(documentId, historyId, role, content, attachment = null) {
    await firebaseInitPromise;
    const userId = getCurrentUserId();
    if (!userId) throw new Error("User not authenticated.");
    const messagesRef = collection(
        db,
        "users",
        userId,
        "documents",
        documentId,
        "history",
        historyId,
        "messages"
    );
    await addDoc(messagesRef, {
        role,
        content,
        attachment: attachment || null,
        timestamp: new Date().toISOString()
    });
}

// Fetch all chat messages from users/{userId}/documents/{documentId}/history/{historyId}/chats/{chatId}/messages
async function fetchChatMessages(documentId, historyId) {
    await firebaseInitPromise;
    const userId = getCurrentUserId();
    if (!userId) throw new Error("User not authenticated.");
    const messagesSnap = await getDocs(
        collection(
            db,
            "users",
            userId,
            "documents",
            documentId,
            "history",
            historyId,
            "messages"
        )
    );
    return messagesSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}
async function deleteDocument(documentId) {
    await firebaseInitPromise;
    const userId = getCurrentUserId();
    if (!userId) throw new Error("User not authenticated.");
    await deleteDoc(doc(db, "users", userId, "documents", documentId));
}
// Delete a history item and all its messages
async function deleteDocumentHistory(documentId, historyId) {
    await firebaseInitPromise;
    const userId = getCurrentUserId();
    if (!userId) throw new Error("User not authenticated.");
    const historyRef = doc(db, "users", userId, "documents", documentId, "history", historyId);

    // Delete all messages under this history
    const messagesRef = collection(db, "users", userId, "documents", documentId, "history", historyId, "messages");
    const messagesSnap = await getDocs(messagesRef);
    const batch = writeBatch(db);
    messagesSnap.forEach(msgDoc => batch.delete(msgDoc.ref));
    batch.delete(historyRef);
    await batch.commit();
}

async function saveUserSettings(settings) {
  await firebaseInitPromise;
  const userId = getCurrentUserId();
  if (!userId) throw new Error("User not authenticated.");
  await setDoc(doc(db, "users", userId, "settings", "profile"), {
    ...settings,
    updatedAt: new Date().toISOString()
  });
}

// Load user settings
async function loadUserSettings() {
  await firebaseInitPromise;
  const userId = getCurrentUserId();
  if (!userId) throw new Error("User not authenticated.");
  const docSnap = await getDoc(doc(db, "users", userId, "settings", "profile"));
  return docSnap.exists() ? docSnap.data() : {};
}

// --- FEEDBACK: Anyone can submit, only admin can read/delete/update ---

async function submitFeedback({ type, title, body }) {
  await addDoc(collection(db, "feedback"), {
    type,
    title,
    body,
    createdAt: new Date().toISOString(),
    status: "inbox" // default status for dashboard
  });
}

async function getAllFeedback() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  // Only admin can read (enforced by rules)
  const q = query(collection(db, "feedback"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function updateFeedbackStatus(feedbackId, status) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  await updateDoc(doc(db, "feedback", feedbackId), { status });
}

async function deleteFeedback(feedbackId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  await deleteDoc(doc(db, "feedback", feedbackId));
}
async function updateFeedbackFolder(feedbackId, folderId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  await updateDoc(doc(db, "feedback", feedbackId), { folderId });
}

// Remove folder assignment (move back to inbox/working)
async function clearFeedbackFolder(feedbackId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  await updateDoc(doc(db, "feedback", feedbackId), { folderId: null });
}
async function signInWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // Check if this is a new user
    const userDoc = await getDoc(doc(db, "users", user.uid));
    
    if (!userDoc.exists()) {
      // Create new user document
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        createdAt: new Date().toISOString(),
        plan: "free"
      });

      // Create user profile
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await setDoc(doc(db, "users", user.uid, "settings", "profile"), {
        name: user.displayName || '',
        email: user.email,
        plan: "free",
        planStartedAt: new Date().toISOString(),
        usage: {
          events: 0,
          responses: 0,
          documents: 0,
          lastUsageReset: new Date().toISOString().slice(0, 10)
        },
        timezone: timezone,
        tutorialSeen: false
      });
    }

    return user;
  } catch (error) {
    console.error("Error signing in with Google:", error);
    throw error;
  }
}

// Add near other user-related functions
async function deleteUserAccount() {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    // Try to delete first
    try {
      // Batch delete all user data
      const userId = getCurrentUserId();
      const batch = writeBatch(db);

      // Delete all chats and messages
      const chatsSnap = await getDocs(collection(db, "users", userId, "chats"));
      for (const chatDoc of chatsSnap.docs) {
        const messagesSnap = await getDocs(collection(db, "users", userId, "chats", chatDoc.id, "messages"));
        messagesSnap.docs.forEach(msgDoc => {
          batch.delete(msgDoc.ref);
        });
        batch.delete(chatDoc.ref);
      }

      // Delete all responses
      const responsesSnap = await getDocs(collection(db, "users", userId, "responses"));
      responsesSnap.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      // Delete all documents
      const documentsSnap = await getDocs(collection(db, "users", userId, "documents"));
      documentsSnap.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      // Delete user settings
      const settingsSnap = await getDocs(collection(db, "users", userId, "settings"));
      settingsSnap.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      // Delete Stripe customer data
      const subsSnap = await getDocs(collection(db, "customers", userId, "subscriptions"));
      subsSnap.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      // Delete customer document
      const customerDoc = doc(db, "customers", userId);
      batch.delete(customerDoc);

      // Delete user document
      batch.delete(doc(db, "users", userId));

      // Commit all deletions
      await batch.commit();

      // Finally delete the user authentication
      await user.delete();

    } catch (error) {
      // If error is requires-recent-login, show reauthentication dialog
      if (error.code === 'auth/requires-recent-login') {
        // Show reauthentication modal
        const reAuthModal = document.createElement('div');
        reAuthModal.innerHTML = `
          <div class="reauth-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;">
            <div style="background:#1e293b;border-radius:12px;padding:24px;max-width:400px;width:90%;">
              <h3 style="color:white;font-size:18px;margin:0 0 16px 0;">Please Sign In Again</h3>
              <p style="color:#94a3b8;margin:0 0 20px 0;line-height:1.5;">
                For security reasons, please sign in again to delete your account.
              </p>
              ${user.providerData[0].providerId === 'google.com' ? `
                <button id="googleReAuthBtn" style="width:100%;background:#fff;color:#1a1a1a;border:none;padding:12px;border-radius:8px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" style="width:18px;height:18px;">
                  Sign in with Google
                </button>
              ` : `
                <form id="reAuthForm" style="display:flex;flex-direction:column;gap:12px;">
                  <input type="email" id="reAuthEmail" value="${user.email}" readonly style="padding:8px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#e2e8f0;">
                  <input type="password" id="reAuthPassword" placeholder="Enter your password" style="padding:8px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#e2e8f0;">
                  <button type="submit" style="width:100%;background:#3b82f6;color:white;border:none;padding:12px;border-radius:8px;font-weight:600;cursor:pointer;">
                    Sign In
                  </button>
                </form>
              `}
              <button id="cancelReAuthBtn" style="width:100%;background:#475569;color:white;border:none;padding:12px;border-radius:8px;font-weight:600;cursor:pointer;margin-top:12px;">
                Cancel
              </button>
            </div>
          </div>
        `;

        document.body.appendChild(reAuthModal);

        try {
          await new Promise((resolve, reject) => {
            // Handle Google reauth
            const googleReAuthBtn = document.getElementById('googleReAuthBtn');
            if (googleReAuthBtn) {
              googleReAuthBtn.onclick = async () => {
                try {
                  const provider = new GoogleAuthProvider();
                  await reauthenticateWithPopup(user, provider);
                  resolve();
                } catch (err) {
                  reject(err);
                }
              };
            }

            // Handle email/password reauth
            const reAuthForm = document.getElementById('reAuthForm');
            if (reAuthForm) {
              reAuthForm.onsubmit = async (e) => {
                e.preventDefault();
                const password = document.getElementById('reAuthPassword').value;
                try {
                  const credential = EmailAuthProvider.credential(user.email, password);
                  await reauthenticateWithCredential(user, credential);
                  resolve();
                } catch (err) {
                  reject(err);
                }
              };
            }

            // Handle cancel
            document.getElementById('cancelReAuthBtn').onclick = () => {
              reject(new Error('Cancelled by user'));
            };
          });

          // If reauthentication successful, retry deletion
          reAuthModal.remove();
          return await deleteUserAccount();

        } catch (reAuthError) {
          reAuthModal.remove();
          throw new Error('Account deletion cancelled: ' + reAuthError.message);
        }
      } else {
        throw error; // Re-throw other errors
      }
    }

  } catch (error) {
    console.error('Failed to delete account:', error);
    // Show user-friendly error
    const message = error.code === 'auth/requires-recent-login' 
      ? 'For security reasons, you need to sign in again to delete your account.'
      : 'Failed to delete account. Please try again.';
    throw new Error(message);
  }
}
function getMessagingInstance() {
  return messaging;
}

async function saveLandingPageSubmission(userData) {
  await firebaseInitPromise;
  try {
    const submissionRef = collection(db, "landingpage");
    const docRef = await addDoc(submissionRef, {
      ...userData,
      timestamp: new Date().toISOString(),
      status: "pending"
    });
    return docRef.id;
  } catch (error) {
    console.error("Error saving landing page submission:", error);
    throw error;
  }
}

// Exports
export {
  initializeFirebase,
  getCurrentUserId,
  fetchEventFromFirebase,
  fetchEvents,
  saveEvent,
  saveEventToFirebase,
  updateEvent,
  deleteEvent,
  fetchEventsForToday,
  saveResponse,
  updateResponse,
  getResponsesByDateAndTitle,
  fetchTodayResponses,
  checkExistingResponse,
  fetchResponsesByDate,
  saveSmartPlan,
  getSmartPlan,
  updateSmartPlan,
  fetchEventData,
  updateProgressInFirebase,
  getEventIdFromUrl,
  createNewChat,
  saveMessage,
  loadChat,
  loadChatList,
  deleteChat,
  updateChatTitle,
  saveSmartPlanChatMessage,
    createDocument,
  updateDocumentContent,
  fetchDocuments,
  fetchDocument,
  saveDocumentHistory,
  fetchDocumentHistory,
  fetchHistoryItem,
  saveChatMessage,
  fetchChatMessages,
  deleteDocument,
  deleteDocumentHistory,
  fetchAllResponses,
  updateDocumentTitle,
  getSmartPlanMessageCount,
  markSmartPlanCompleted,
  saveUserSettings,
  loadUserSettings,
  fetchResponseByEventId,
  fetchResponsesInRange,
  fetchEventsInRange,
  submitFeedback,
  getAllFeedback,
  updateFeedbackStatus,
  deleteFeedback,
  updateFeedbackFolder,
  clearFeedbackFolder,
  signInWithGoogle,
  deleteUserAccount,
  getMessagingInstance,
  saveLandingPageSubmission,
  // Firebase initialization promise
  firebaseInitPromise,
  // Firebase services
  auth,
  getToken,
  onMessage,
  db
};


