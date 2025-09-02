import { loadUserSettings, saveUserSettings } from "./firebase.js";
import { PLAN_LIMITS } from "./planLimits.js";

/**
 * Checks and updates usage for a given feature.
 * @param {string} feature - The usage key, e.g. "eventCreationPerDay"
 * @returns {Promise<boolean>} - true if allowed, false if over limit
 */
export async function checkAndUpdateUsage(feature) {
  const settings = await loadUserSettings();
  const plan = settings.plan || "free";
  const limits = PLAN_LIMITS[plan];
  const usage = settings.usage || {};
  const today = new Date().toISOString().slice(0, 10);

  // Block feature if plan limit is 0
  if ((limits[feature] || 0) === 0) {
    return false;
  }

  // Reset usage if it's a new day
  if (usage.lastUsageReset !== today) {
    for (const key in usage) {
      if (key.endsWith("PerDay")) usage[key] = 0;
    }
    usage.lastUsageReset = today;
  }

  // Check limit
  if ((usage[feature] || 0) >= (limits[feature] || 0)) {
    return false; // Over limit
  }

  // Increment and save
  usage[feature] = (usage[feature] || 0) + 1;
  await saveUserSettings({ ...settings, usage });
  return true;
}

/**
 * Decrement usage for a given feature (e.g. when deleting an event).
 * @param {string} feature
 * @returns {Promise<void>}
 */
export async function decrementUsage(feature) {
  const settings = await loadUserSettings();
  const usage = settings.usage || {};
  if (usage[feature] && usage[feature] > 0) {
    usage[feature] -= 1;
    await saveUserSettings({ ...settings, usage });
  }
}