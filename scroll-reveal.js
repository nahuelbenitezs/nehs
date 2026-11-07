export function mountScrollReveal(motionPreference) {
  if (!('IntersectionObserver' in window)) return;

  const panels = document.querySelectorAll('.reveal');
  const entranceThreshold = 0.16;
  let observer;

  function updateMotionPreference() {
    observer?.disconnect();

    if (motionPreference.matches) {
      for (const panel of panels) panel.classList.remove('is-pending');
      return;
    }

    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          entry.target.classList.add('is-pending');
        } else if (entry.intersectionRatio >= entranceThreshold) {
          entry.target.classList.remove('is-pending');
        }
      }
    }, { threshold: [0, entranceThreshold] });

    for (const panel of panels) {
      const { top, bottom } = panel.getBoundingClientRect();
      panel.classList.toggle('is-pending', bottom <= 0 || top >= window.innerHeight);
      observer.observe(panel);
    }
  }

  updateMotionPreference();
  motionPreference.addEventListener('change', updateMotionPreference);
}
