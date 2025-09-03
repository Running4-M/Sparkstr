      // Global variables
let scrollY = 0;
let expandedCard = null;

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    initializeScrollEffects();
    initializeFutureCards();
    initializeParallaxEffects();
    initializeLineAnimation();
    const getStartedBtn = document.querySelector('.cta-buttons .btn-hero.btn-glow');
    if (getStartedBtn) {
        getStartedBtn.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.href = 'pricing';
        });
    }
});

// Scroll to story section
function scrollToStory() {
    window.scrollTo({ 
        top: window.innerHeight, 
        behavior: 'smooth' 
    });
}

// Initialize scroll effects
function initializeScrollEffects() {
    window.addEventListener('scroll', function() {
        scrollY = window.scrollY;
        updateParallaxElements();
        updateLineAnimation();
        updateScrollIndicator();
    });
}

// Update parallax elements
function updateParallaxElements() {
    // Hero section particles
    const particles = document.querySelectorAll('.particle');
    const parallaxRates = [
        { x: 0.1, y: 0.05 },   // particle-1
        { x: -0.15, y: 0.08 }, // particle-2
        { x: 0.12, y: -0.06 }, // particle-3
        { x: -0.08, y: 0.12 }, // particle-4
        { x: 0.18, y: -0.09 }, // particle-5
        { x: -0.11, y: 0.07 }  // particle-6
    ];

    particles.forEach((particle, index) => {
        if (parallaxRates[index]) {
            const rate = parallaxRates[index];
            particle.style.transform = `translate(${scrollY * rate.x}px, ${scrollY * rate.y}px)`;
        }
    });

    const ctaOrbs = document.querySelectorAll('.cta-orb');
    const ctaOrbRates = [
        { x: 0.25, y: 0.12 },   // cta-orb-1
        { x: -0.22, y: -0.13 }, // cta-orb-2
        { x: 0.18, y: -0.18 }   // cta-orb-3
    ];

    ctaOrbs.forEach((orb, index) => {
        if (ctaOrbRates[index]) {
            const rate = ctaOrbRates[index];
            orb.style.transform = `translate(${scrollY * rate.x}px, ${scrollY * rate.y}px)`;
        }
    });

    const ctaParticles = document.querySelectorAll('.cta-particle');
    const ctaParticleRates = [
        { x: 0.32, y: 0.22 },   // cta-particle-1
        { x: -0.28, y: 0.19 },  // cta-particle-2
        { x: 0.38, y: -0.22 }   // cta-particle-3
    ];

    ctaParticles.forEach((particle, index) => {
        if (ctaParticleRates[index]) {
            const rate = ctaParticleRates[index];
            particle.style.transform = `translate(${scrollY * rate.x}px, ${scrollY * rate.y}px)`;
        }
    });

    // Scroll indicator parallax
    const scrollIndicator = document.querySelector('.scroll-indicator');
    if (scrollIndicator) {
        scrollIndicator.style.transform = `translate(-50%, ${scrollY * 0.3}px)`;
    }
}



// Initialize future cards functionality
function initializeFutureCards() {
    const futureCards = document.querySelectorAll('.future-card');
    
    futureCards.forEach((card, index) => {
        card.addEventListener('click', function() {
            toggleCard(index);
        });
    });
}

// Toggle card expansion
function toggleCard(index) {
    const cards = document.querySelectorAll('.future-card');
    cards.forEach((card, i) => {
        if (i === index) {
            card.classList.toggle('expanded');
        } else {
            card.classList.remove('expanded');
        }
    });
}



// Utility function for smooth scrolling
function smoothScrollTo(target) {
    const element = document.querySelector(target);
    if (element) {
        const offsetTop = element.offsetTop - 80; // Account for any fixed header
        window.scrollTo({
            top: offsetTop,
            behavior: 'smooth'
        });
    }
}

// Handle window resize
window.addEventListener('resize', function() {
    // Recalculate any size-dependent elements
    updateParallaxElements();
});

// Performance optimization: throttle scroll events
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Apply throttling to scroll handler
window.addEventListener('scroll', throttle(function() {
    scrollY = window.scrollY;
    updateParallaxElements();
    updateLineAnimation();
    updateScrollIndicator();
}, 16)); // ~60fps

// Add CSS custom properties support for older browsers
function addCSSSupport() {
    // Add any necessary polyfills or fallbacks here
    if (!CSS.supports('background-clip', 'text')) {
        // Fallback for older browsers that don't support background-clip: text
        const textElements = document.querySelectorAll('.hero-title-text, .hero-slogan, .cta-title-highlight');
        textElements.forEach(element => {
            element.style.color = 'hsl(267, 100%, 75%)';
        });
    }
}

// Initialize CSS support
document.addEventListener('DOMContentLoaded', addCSSSupport);

// Handle prefers-reduced-motion
function handleReducedMotion() {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    
    if (prefersReducedMotion.matches) {
        // Disable animations for users who prefer reduced motion
        const style = document.createElement('style');
        style.innerHTML = `
            *, *::before, *::after {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.01ms !important;
            }
        `;
        document.head.appendChild(style);
    }
}

// Initialize reduced motion handling
document.addEventListener('DOMContentLoaded', handleReducedMotion);

// Add keyboard navigation for accessibility
function initializeKeyboardNavigation() {
    document.addEventListener('keydown', function(e) {
        // Handle keyboard navigation for future cards
        if (e.key === 'Enter' || e.key === ' ') {
            const focusedElement = document.activeElement;
            if (focusedElement.classList.contains('future-card')) {
                e.preventDefault();
                const index = Array.from(document.querySelectorAll('.future-card')).indexOf(focusedElement);
                toggleCard(index);
            }
        }
    });
}

// Initialize keyboard navigation
document.addEventListener('DOMContentLoaded', initializeKeyboardNavigation);

// Add focus management for accessibility
function initializeFocusManagement() {
    const futureCards = document.querySelectorAll('.future-card');
    
    futureCards.forEach(card => {
        // Make cards focusable
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        card.setAttribute('aria-expanded', 'false');
        
        card.addEventListener('focus', function() {
            this.style.outline = '2px solid hsl(267, 57%, 50%)';
            this.style.outlineOffset = '2px';
        });
        
        card.addEventListener('blur', function() {
            this.style.outline = 'none';
        });
        
        // Update aria-expanded when card state changes
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const isExpanded = card.classList.contains('expanded');
                    card.setAttribute('aria-expanded', isExpanded);
                }
            });
        });
        
        observer.observe(card, { attributes: true });
    });
}

// Initialize focus management
document.addEventListener('DOMContentLoaded', initializeFocusManagement);

// Export functions for potential external use
window.CatalystLanding = {
    scrollToStory,
    toggleCard,
    smoothScrollTo
};
(function() {
    const canvas = document.getElementById('hero-embers-canvas');
    if (!canvas) return;
    let embers = [];
    let speedMultiplier = 1;
    let lastScrollY = window.scrollY;

    function resize() {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    function createEmber() {
    const w = canvas.width, h = canvas.height;
    return {
        x: Math.random() * w,
        y: Math.random() * h, // Start anywhere vertically
        radius: Math.random() * 2 + 1.5,
        opacity: Math.random() * 0.25 + 0.25,
        speedY: -(Math.random() * 0.7 + 0.5),
        speedX: (Math.random() - 0.5) * 0.2,
        flicker: Math.random() * 0.02
    };
}

    function setupEmbers() {
        embers = [];
        for (let i = 0; i < 38; i++) embers.push(createEmber());
    }
    setupEmbers();

    function animate() {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        embers.forEach(e => {
            // Glow
            const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.radius * 2.5);
            grad.addColorStop(0, `rgba(255, 140, 0, ${e.opacity})`);
            grad.addColorStop(1, 'rgba(255, 140, 0, 0)');
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.radius * 2.5, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();
            // Core
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 180, 0, ${e.opacity * 1.5})`;
            ctx.fill();
            // Move
            e.y += e.speedY * speedMultiplier;
            e.x += e.speedX * speedMultiplier;
            e.opacity += (Math.random() - 0.5) * e.flicker;
            e.opacity = Math.max(0.18, Math.min(0.38, e.opacity));
            if (e.y < -10 || e.x < -10 || e.x > canvas.width + 10) {
                Object.assign(e, createEmber());
                e.y = canvas.height + 10;
            }
        });
        requestAnimationFrame(animate);
    }
    animate();

    // Speed up embers when scrolling past hero section
    window.addEventListener('scroll', () => {
    const hero = document.querySelector('.hero-section');
    if (!hero) return;
    const rect = hero.getBoundingClientRect();
    const windowH = window.innerHeight;
    if (rect.bottom < 0) {
        speedMultiplier = 3.5;
    } else if (rect.top < -rect.height * 0.5) {
        speedMultiplier = 2.2;
    } else if (rect.top < 0) {
        speedMultiplier = 1.2 + Math.abs(rect.top) / (rect.height * 0.7);
    } else {
        speedMultiplier = 1;
    }
});
})();
 // Interactive Plan Demo functionality
        document.addEventListener('DOMContentLoaded', function() {
    const addToCalendarBtn = document.getElementById('add-to-calendar-btn');
    const initialState = document.getElementById('initial-state');
    const loadingState = document.getElementById('loading-state');
    const successState = document.getElementById('success-state');
    const confettiContainer = document.getElementById('confetti-container');
    const planningOverlay = document.getElementById('planning-overlay');

    let isClicked = false;
    let showConfetti = false;

    addToCalendarBtn.addEventListener('click', function() {
        if (isClicked) return;
        
        isClicked = true;
        
        // Hide initial state, show loading
        initialState.classList.add('hidden');
        loadingState.classList.remove('hidden');

        setTimeout(() => {
            // Hide loading, show confetti and success
            loadingState.classList.add('hidden');
            confettiContainer.classList.remove('hidden');
            successState.classList.remove('hidden');
            
            // Remove the overlay with a fade effect
            planningOverlay.style.opacity = '0';
            setTimeout(() => {
                planningOverlay.style.display = 'none';
            }, 300);
            
            // Generate confetti
            generateConfetti();
            
            setTimeout(() => {
                // Reset states after 2 seconds
                isClicked = false;
                showConfetti = false;
                
                successState.classList.add('hidden');
                confettiContainer.classList.add('hidden');
                confettiContainer.innerHTML = '';
                initialState.classList.remove('hidden');
            }, 2000);
        }, 500);
    });

    function generateConfetti() {
        for (let i = 0; i < 20; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'absolute animate-bounce-gentle';
            confetti.textContent = '🎉';
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.top = Math.random() * 100 + '%';
            confetti.style.animationDelay = Math.random() * 2 + 's';
            confetti.style.fontSize = '24px';
            confettiContainer.appendChild(confetti);
        }
    }
    // Image Modal functionality
const modal = document.getElementById('imageModal');
const modalImg = document.getElementById('modalImage');
const closeBtn = document.querySelector('.close-modal');

// Make all images clickable
document.querySelectorAll('img').forEach(img => {
    img.onclick = function() {
        modal.classList.add('active');
        modalImg.src = this.src;
    }
});

// Close modal when clicking the close button or outside the image
closeBtn.onclick = function() {
    modal.classList.remove('active');
}

modal.onclick = function(e) {
    if (e.target === modal) {
        modal.classList.remove('active');
    }
}
const slides = document.querySelectorAll('.carousel-slide');
    const dots = document.querySelectorAll('.dot');
    const prevBtn = document.querySelector('.carousel-arrow.prev');
    const nextBtn = document.querySelector('.carousel-arrow.next');
    let currentSlide = 0;

    function showSlide(index) {
        slides.forEach(slide => slide.classList.remove('active'));
        dots.forEach(dot => dot.classList.remove('active'));
        
        slides[index].classList.add('active');
        dots[index].classList.add('active');
    }

    function nextSlide() {
        currentSlide = (currentSlide + 1) % slides.length;
        showSlide(currentSlide);
    }

    function prevSlide() {
        currentSlide = (currentSlide - 1 + slides.length) % slides.length;
        showSlide(currentSlide);
    }

    // Event listeners
    prevBtn.addEventListener('click', prevSlide);
    nextBtn.addEventListener('click', nextSlide);

    // Dot navigation
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            currentSlide = index;
            showSlide(currentSlide);
        });
    });
     const mobileMenuButton = document.querySelector('.mobile-menu-button');
    const mobileMenu = document.querySelector('.mobile-menu');

    mobileMenuButton.addEventListener('click', function() {
        mobileMenu.classList.toggle('show');
    });

    // Close menu when clicking outside
    document.addEventListener('click', function(e) {
        if (!mobileMenu.contains(e.target) && !mobileMenuButton.contains(e.target)) {
            mobileMenu.classList.remove('show');
        }
    });
    // Modal handlers
    const modalTriggers = document.querySelectorAll('[data-modal]');
    const modals = document.querySelectorAll('.policy-modal');
    const modalCloseButtons = document.querySelectorAll('.modal-close');

    modalTriggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            const modalId = `${trigger.dataset.modal}Modal`;
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.add('show');
                document.body.style.overflow = 'hidden';
            }
        });
    });

    modalCloseButtons.forEach(button => {
        button.addEventListener('click', () => {
            const modal = button.closest('.policy-modal');
            modal.classList.remove('show');
            document.body.style.overflow = '';
        });
    });

    // Close modal when clicking outside
    modals.forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
                document.body.style.overflow = '';
            }
        });
    });

    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            modals.forEach(modal => {
                modal.classList.remove('show');
                document.body.style.overflow = '';
            });
        }
    });

});
