(function () {
  'use strict';
  var main   = document.querySelector('.gallery-main');
  var thumbs = document.querySelectorAll('.thumbs img');

  if (!main || !thumbs.length) return;

  thumbs.forEach(function (thumb) {
    thumb.addEventListener('click', function () {
      main.src = this.src;
      thumbs.forEach(function (t) { t.classList.remove('active'); });
      this.classList.add('active');
    });
  });
}());
