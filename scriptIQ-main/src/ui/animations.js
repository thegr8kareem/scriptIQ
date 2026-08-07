/**
 * GSAP animation helpers for ScriptIQ UI polish.
 *
 * Used on landing hero, feature cards, app panel reveals, and score count-ups.
 */
import gsap from "gsap";

/**
 * Staggered hero entrance for landing page elements.
 * @param {ParentNode} root
 */
export function animateHero(root) {
  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
  tl.from(root.querySelector(".hero-badge"), { opacity: 0, y: 20, duration: 0.5 })
    .from(root.querySelector(".hero-title"), { opacity: 0, y: 28, duration: 0.65 }, "-=0.25")
    .from(root.querySelector(".lead"), { opacity: 0, y: 20, duration: 0.5 }, "-=0.35")
    .from(root.querySelectorAll(".hero-actions > *"), { opacity: 0, y: 16, stagger: 0.1, duration: 0.45 }, "-=0.2");
}

/**
 * Scroll-triggered feature card reveals (IntersectionObserver + GSAP).
 * @param {ParentNode} root
 * @returns {() => void} cleanup
 */
export function animateFeatureCards(root) {
  const cards = [...root.querySelectorAll(".feature-card")];
  cards.forEach((card) => gsap.set(card, { opacity: 0, y: 24 }));

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        gsap.to(entry.target, { opacity: 1, y: 0, duration: 0.55, ease: "power2.out" });
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );

  cards.forEach((card) => observer.observe(card));
  return () => observer.disconnect();
}

/**
 * Animate stat counters on the landing page.
 * @param {ParentNode} root
 */
export function animateStats(root) {
  root.querySelectorAll("[data-count-to]").forEach((el) => {
    const target = Number(el.dataset.countTo) || 0;
    const suffix = el.dataset.countSuffix || "";
    const obj = { val: 0 };
    gsap.to(obj, {
      val: target,
      duration: 1.8,
      ease: "power2.out",
      onUpdate: () => {
        el.textContent = Math.round(obj.val) + suffix;
      },
    });
  });
}

/**
 * Stagger app workflow panels into view after auth.
 * @param {ParentNode} root
 */
export function revealAppPanels(root) {
  const panels = root.querySelectorAll(".panel");
  gsap.fromTo(
    panels,
    { opacity: 0, y: 22 },
    { opacity: 1, y: 0, duration: 0.55, stagger: 0.08, ease: "power2.out", clearProps: "transform" }
  );
}

/**
 * Count-up animation for similarity score cards.
 * @param {HTMLElement} el
 * @param {number} targetPercent
 */
export function animateScoreCount(el, targetPercent) {
  if (!el) return;
  const obj = { val: 0 };
  gsap.to(obj, {
    val: targetPercent,
    duration: 0.9,
    ease: "power2.out",
    onUpdate: () => {
      el.textContent = Math.round(obj.val) + "%";
    },
  });
}

/**
 * Pulse the upload drop zone on successful file ingest.
 * @param {HTMLElement} dropZone
 */
export function pulseDropZoneSuccess(dropZone) {
  if (!dropZone) return;
  gsap.fromTo(
    dropZone,
    { boxShadow: "0 0 0 rgba(0,245,212,0)" },
    {
      boxShadow: "0 0 32px rgba(0,245,212,0.45)",
      duration: 0.35,
      yoyo: true,
      repeat: 1,
      clearProps: "boxShadow",
    }
  );
}

/**
 * Fade-in page transition wrapper.
 * @param {HTMLElement} container
 */
export function fadeInPage(container) {
  gsap.fromTo(container, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: "power1.out" });
}

/**
 * Auth card entrance.
 * @param {HTMLElement} card
 */
export function animateAuthCard(card) {
  gsap.fromTo(
    card,
    { opacity: 0, y: 24, scale: 0.98 },
    { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "power3.out" }
  );
}
