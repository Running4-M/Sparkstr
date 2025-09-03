// signup-ui-fallback.js
// Simple UI-only script to ensure toggle + TOS modal work even if the module fails to load.
// This mirrors the UI logic in signup.js but has no Firebase dependencies.

document.addEventListener('DOMContentLoaded', () => {
  const step1 = document.getElementById('step1');
  const step2 = document.getElementById('step2');
  const primaryBtn = document.getElementById('primaryBtn');
  const backBtn = document.getElementById('backBtn');
  const toggleBtn = document.getElementById('toggleBtn');
  const googleBtn = document.getElementById('googleBtn');
  const googleBtnText = document.getElementById('googleBtnText');
  const cardTitle = document.getElementById('cardTitle');
  const cardDescription = document.getElementById('cardDescription');
  const toggleText = document.getElementById('toggleText');
  const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');

  const tosLink = document.getElementById('tosLink');
  const tosModal = document.getElementById('tosModal');
  const closeTosModal = document.getElementById('closeTosModal');
  const closeTosModal2 = document.getElementById('closeTosModal2');

  // Keep state locally
  let isSignUp = true;
  let currentStep = 1;

  function validateFormSimple() {
    const emailEl = document.getElementById('email');
    const passwordEl = document.getElementById('password');
    const fullNameEl = document.getElementById('fullName');
    const email = emailEl ? emailEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value.trim() : '';
    const fullName = fullNameEl ? fullNameEl.value.trim() : '';

    let isValid = false;
    if (isSignUp && currentStep === 1) {
      isValid = email !== '' && password !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    } else if (isSignUp && currentStep === 2) {
      isValid = fullName !== '';
    } else { // sign in
      isValid = email !== '' && password !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    if (primaryBtn) primaryBtn.disabled = !isValid;
    return isValid;
  }

  function updateUI() {
    if (!cardTitle || !cardDescription || !primaryBtn || !googleBtnText || !toggleText) return;

    if (isSignUp) {
      if (currentStep === 1) {
        cardTitle.textContent = 'Hello, New Friend! 👋';
        cardDescription.textContent = "Let's get you started on your journey";
        primaryBtn.textContent = 'Continue';
        if (googleBtnText) googleBtnText.textContent = 'Sign up with Google';
        toggleText.textContent = 'Already have an account?';
        toggleBtn.textContent = 'Sign in';
        if (step1) step1.classList.remove('hidden');
        if (step2) step2.classList.add('hidden');
        if (backBtn) backBtn.classList.add('hidden');
        if (googleBtn) googleBtn.classList.remove('hidden');
      } else {
        cardTitle.textContent = 'Tell Us About You';
        cardDescription.textContent = 'Just a few more details to complete your profile';
        primaryBtn.textContent = 'Create Account';
        if (googleBtn) googleBtn.classList.add('hidden');
        if (step1) step1.classList.add('hidden');
        if (step2) step2.classList.remove('hidden');
        if (backBtn) backBtn.classList.remove('hidden');
      }
      if (forgotPasswordBtn) forgotPasswordBtn.classList.add('hidden');
    } else {
      cardTitle.textContent = 'Welcome Back! 🎉';
      cardDescription.textContent = 'Great to see you again!';
      primaryBtn.textContent = 'Sign In';
      if (googleBtnText) googleBtnText.textContent = 'Sign in with Google';
      toggleText.textContent = "Don't have an account?";
      toggleBtn.textContent = 'Sign up';
      if (step1) step1.classList.remove('hidden');
      if (step2) step2.classList.add('hidden');
      if (backBtn) backBtn.classList.add('hidden');
      if (googleBtn) googleBtn.classList.remove('hidden');
      if (forgotPasswordBtn) forgotPasswordBtn.classList.remove('hidden');
    }
    validateFormSimple();
  }

  // wire up the primary button to do step navigation for UI (not submitting)
  if (primaryBtn) {
    primaryBtn.addEventListener('click', (e) => {
      // If sign up and step 1 -> go to step 2
      if (isSignUp && currentStep === 1) {
        currentStep = 2;
        updateUI();
        return;
      }
      // For other cases we don't perform auth here (fallback), just keep UI consistent
    });
  }

  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      currentStep = 1;
      updateUI();
    });
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      isSignUp = !isSignUp;
      currentStep = 1;
      // clear inputs
      const emailEl = document.getElementById('email');
      const passwordEl = document.getElementById('password');
      const fullNameEl = document.getElementById('fullName');
      if (emailEl) emailEl.value = '';
      if (passwordEl) passwordEl.value = '';
      if (fullNameEl) fullNameEl.value = '';
      updateUI();
    });
  }

  // simple input listeners for enabling button
  ['email', 'password', 'fullName'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', validateFormSimple);
  });

  // Terms of Service modal handlers
  if (tosLink && tosModal) {
    tosLink.addEventListener('click', (ev) => {
      ev.preventDefault();
      tosModal.classList.remove('hidden');
    });
    if (closeTosModal) closeTosModal.addEventListener('click', () => tosModal.classList.add('hidden'));
    if (closeTosModal2) closeTosModal2.addEventListener('click', () => tosModal.classList.add('hidden'));
    // close when clicking overlay
    tosModal.addEventListener('click', (e) => {
      if (e.target === tosModal) tosModal.classList.add('hidden');
    });
  }

  // initial render
  updateUI();
});
