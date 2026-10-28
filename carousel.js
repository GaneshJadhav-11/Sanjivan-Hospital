/**
 * Sanjivan Hospital — Hero Carousel Component
 * Continuous 5000ms 5-image carousel with smooth fade transitions,
 * 5 navigation dots, Previous / Next arrows, touch swipe, and accessible controls.
 */
(function () {
    'use strict';

    function initHeroCarousel() {
        const carousel = document.querySelector('.hero-carousel');
        if (!carousel) return;

        // Prevent multiple initializations
        if (carousel.dataset.initialized === 'true') return;
        carousel.dataset.initialized = 'true';

        const slides = carousel.querySelectorAll('.carousel-slide');
        const dots = carousel.querySelectorAll('.carousel-dot');
        const prevBtn = carousel.querySelector('#heroPrevBtn');
        const nextBtn = carousel.querySelector('#heroNextBtn');
        const overlay = carousel.querySelector('#heroOverlayContent');

        const totalSlides = slides.length;
        if (totalSlides === 0) return;

        let currentIndex = 0;
        let timer = null;
        const SLIDE_INTERVAL = 5000; // Exact 5000ms requirement

        function updateSlide(newIndex) {
            // Wrap index within 0 .. totalSlides - 1
            currentIndex = (newIndex + totalSlides) % totalSlides;

            // Update slide classes and aria-hidden
            slides.forEach((slide, i) => {
                const isActive = (i === currentIndex);
                slide.classList.toggle('active', isActive);
                slide.setAttribute('aria-hidden', !isActive);
            });

            // Update navigation dots
            dots.forEach((dot, i) => {
                const isActive = (i === currentIndex);
                dot.classList.toggle('active', isActive);
                dot.setAttribute('aria-selected', isActive ? 'true' : 'false');
                dot.tabIndex = isActive ? 0 : -1;
            });

            // Update overlay content for Slides 2-5
            // Slide 1 (index 0) has the native graphic with button hotspots.
            // Slides 2-5 (indices 1-4) display the legible HTML overlay with heading & buttons.
            if (overlay) {
                if (currentIndex === 0) {
                    overlay.classList.remove('visible');
                } else {
                    overlay.classList.add('visible');
                }
            }
        }

        function nextSlide() {
            updateSlide(currentIndex + 1);
        }

        function prevSlide() {
            updateSlide(currentIndex - 1);
        }

        function startTimer() {
            clearTimer();
            timer = setInterval(nextSlide, SLIDE_INTERVAL);
        }

        function clearTimer() {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
        }

        function resetTimer() {
            clearTimer();
            startTimer();
        }

        // Previous and Next button listeners
        if (prevBtn) {
            prevBtn.addEventListener('click', function (e) {
                e.preventDefault();
                prevSlide();
                resetTimer();
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', function (e) {
                e.preventDefault();
                nextSlide();
                resetTimer();
            });
        }

        // Navigation dots listeners
        dots.forEach((dot, idx) => {
            dot.addEventListener('click', function (e) {
                e.preventDefault();
                updateSlide(idx);
                resetTimer();
            });

            // Keyboard navigation on dots (ArrowLeft, ArrowRight)
            dot.addEventListener('keydown', function (e) {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    updateSlide(currentIndex + 1);
                    dots[currentIndex].focus();
                    resetTimer();
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    updateSlide(currentIndex - 1);
                    dots[currentIndex].focus();
                    resetTimer();
                }
            });
        });

        // Touch swipe support for mobile
        let touchStartX = 0;
        let touchStartY = 0;
        carousel.addEventListener('touchstart', function (e) {
            if (e.touches && e.touches.length === 1) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }
        }, { passive: true });

        carousel.addEventListener('touchend', function (e) {
            if (e.changedTouches && e.changedTouches.length === 1) {
                const diffX = touchStartX - e.changedTouches[0].clientX;
                const diffY = touchStartY - e.changedTouches[0].clientY;
                // Only trigger if horizontal swipe is greater than vertical movement
                if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
                    if (diffX > 0) {
                        nextSlide(); // Swiped left -> next slide
                    } else {
                        prevSlide(); // Swiped right -> prev slide
                    }
                    resetTimer();
                }
            }
        }, { passive: true });

        // Pause automatic sliding when tab is not visible, resume when active
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                clearTimer();
            } else {
                startTimer();
            }
        });

        // Clean up on window unload
        window.addEventListener('beforeunload', clearTimer);

        // Initial state
        updateSlide(0);
        startTimer();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHeroCarousel);
    } else {
        initHeroCarousel();
    }
})();
