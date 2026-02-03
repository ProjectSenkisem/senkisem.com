import NavBar from "./components/NavBar";
import Hero from "./components/Hero";
import About from "./components/About";
import Features from "./components/Features";
import Story from "./components/Story";
import Footer from "./components/Footer";

const App = () => {
  return (
    <main className="relative min-h-screen w-screen overflow-x-hidden max-w-full">
      <NavBar/>
      <Hero />
      <About />
      <Features/>
      <Story/>
      <Footer/>
    </main>
  );
};


// ========================================
// SCROLL OPTIMIZATION HELPER
// Add ezt a merch.html vagy App.tsx-hez
// ========================================

class ScrollOptimizer {
    private ticking = false;
    private lastScrollY = 0;
    private scrollingClass = 'scrolling';
    private scrollTimeout: number | null = null;

    constructor() {
        this.init();
    }

    init() {
        // Add scrolling class during scroll for pointer-events optimization
        window.addEventListener('scroll', () => {
            if (!document.body.classList.contains(this.scrollingClass)) {
                document.body.classList.add(this.scrollingClass);
            }

            if (this.scrollTimeout) {
                clearTimeout(this.scrollTimeout);
            }

            this.scrollTimeout = setTimeout(() => {
                document.body.classList.remove(this.scrollingClass);
            }, 150) as unknown as number;
        }, { passive: true });

        // Optimize resize events
        let resizeTimeout: number;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.handleResize();
            }, 250) as unknown as number;
        });
    }

    private handleResize() {
        // Refresh ScrollTriggers if using GSAP
        if (typeof ScrollTrigger !== 'undefined') {
            ScrollTrigger.refresh();
        }
    }

    // Throttled scroll handler
    onScroll(callback: (scrollY: number) => void, fps = 60) {
        const interval = 1000 / fps;
        let lastTime = 0;

        window.addEventListener('scroll', () => {
            const now = Date.now();
            
            if (now - lastTime >= interval) {
                lastTime = now;
                
                if (!this.ticking) {
                    requestAnimationFrame(() => {
                        callback(window.pageYOffset);
                        this.ticking = false;
                    });
                    this.ticking = true;
                }
            }
        }, { passive: true });
    }

    // Intersection Observer helper for lazy loading
    observeLazy(selector: string, callback: (element: Element) => void, options = {}) {
        const defaultOptions = {
            root: null,
            rootMargin: '50px',
            threshold: 0.1,
            ...options
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    callback(entry.target);
                    observer.unobserve(entry.target);
                }
            });
        }, defaultOptions);

        document.querySelectorAll(selector).forEach(el => {
            observer.observe(el);
        });

        return observer;
    }

    // Video lazy loading with play/pause optimization
    optimizeVideos() {
        const videos = document.querySelectorAll('video');
        
        const videoObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const video = entry.target as HTMLVideoElement;
                
                if (entry.isIntersecting) {
                    // In viewport - play if it has autoplay
                    if (video.hasAttribute('autoplay')) {
                        video.play().catch(() => {});
                    }
                } else {
                    // Out of viewport - pause to save resources
                    video.pause();
                }
            });
        }, {
            threshold: 0.25,
            rootMargin: '100px'
        });

        videos.forEach(video => {
            // Set preload to metadata for faster page load
            if (!video.hasAttribute('preload')) {
                video.setAttribute('preload', 'metadata');
            }
            
            videoObserver.observe(video);
        });
    }

    // Optimize product images
    optimizeImages() {
        this.observeLazy('img[loading="lazy"]', (img) => {
            const image = img as HTMLImageElement;
            
            // Force browser to decode image
            if ('decode' in image) {
                image.decode().catch(() => {});
            }
        });
    }

    // Batch DOM updates
    batchUpdate(callback: () => void) {
        requestAnimationFrame(() => {
            callback();
        });
    }

    // Measure performance
    measurePerformance(name: string) {
        if (performance.mark) {
            performance.mark(`${name}-start`);
            
            return () => {
                performance.mark(`${name}-end`);
                performance.measure(name, `${name}-start`, `${name}-end`);
                
                const measure = performance.getEntriesByName(name)[0];
                console.log(`${name}: ${measure.duration.toFixed(2)}ms`);
                
                // Cleanup
                performance.clearMarks(`${name}-start`);
                performance.clearMarks(`${name}-end`);
                performance.clearMeasures(name);
            };
        }
        
        return () => {};
    }
}

// Usage example:
// const scrollOptimizer = new ScrollOptimizer();

// // Optimalize videos
// scrollOptimizer.optimizeVideos();

// // Optimize images
// scrollOptimizer.optimizeImages();

// // Throttled scroll handler
// scrollOptimizer.onScroll((scrollY) => {
//     // Your scroll logic here
//     console.log('Scroll position:', scrollY);
// }, 30); // 30fps

// // Lazy load sections
// scrollOptimizer.observeLazy('.products-section-wrapper', (section) => {
//     section.classList.add('visible');
//     // Initialize products here
// });

// Export for ES modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ScrollOptimizer;
}

// Global for browser
if (typeof window !== 'undefined') {
    (window as any).ScrollOptimizer = ScrollOptimizer;
}
export default App;