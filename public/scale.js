// The overlay pages are laid out on a 1920x1080 canvas - the size of the background images all
// the positions were measured from. This scales that canvas (#stage) to fit whatever size the
// page is shown at (OBS browser source, browser window, ...), keeping the 16:9 shape and
// centering it if the shape doesn't match.

(function () {
  const WIDTH = 1920;
  const HEIGHT = 1080;
  const stage = document.getElementById('stage');

  function fit() {
    const scale = Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT);
    const x = (window.innerWidth - WIDTH * scale) / 2;
    const y = (window.innerHeight - HEIGHT * scale) / 2;
    stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }

  window.addEventListener('resize', fit);
  fit();
})();
