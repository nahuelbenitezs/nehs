const dialog = document.querySelector('#video-dialog');
const player = dialog.querySelector('.video-player');
const title = dialog.querySelector('#video-title');
const youtubeLink = dialog.querySelector('.dialog-link');
let openedFrom;

if (typeof dialog.showModal === 'function' && location.protocol !== 'file:') {
  for (const link of document.querySelectorAll('[data-video]')) {
    link.setAttribute('aria-haspopup', 'dialog');

    link.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      event.preventDefault();
      openedFrom = link;
      title.textContent = link.querySelector('.video-name').textContent;
      youtubeLink.href = link.href;
      dialog.showModal();

      const videoId = new URL(link.href).searchParams.get('v');
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`;
      iframe.title = title.textContent;
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.allowFullscreen = true;
      player.replaceChildren(iframe);
    });
  }

  dialog.addEventListener('close', () => {
    player.replaceChildren();
    openedFrom.focus({ preventScroll: true });
  });
}

const stage = document.querySelector('.character-stage');
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');

if (location.protocol !== 'file:') {
  import('./scroll-reveal.js')
    .then(({ mountScrollReveal }) => mountScrollReveal(motionPreference))
    .catch(() => {});
}

if (stage && location.protocol !== 'file:') {
  const loadCharacter = () => {
    import('./character.js?v=3')
      .then(({ mountCharacter }) => mountCharacter(stage, motionPreference))
      .catch(() => stage.classList.remove('is-rendered'));
  };

  if ('IntersectionObserver' in window) {
    const stageObserver = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      stageObserver.disconnect();
      loadCharacter();
    }, { rootMargin: '160px' });
    stageObserver.observe(stage);
  } else {
    loadCharacter();
  }
}
