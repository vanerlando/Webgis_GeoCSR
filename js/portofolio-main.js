/* ============================================================
   main.js — Portfolio Page Scripts
   ============================================================ */

(function () {
  'use strict';

  // ─── NAV: change colour when over dark CTA section ───
  const nav = document.getElementById('main-nav');
  const contactSection = document.getElementById('contact');

  if (nav && contactSection) {
    window.addEventListener('scroll', function () {
      const contactTop = contactSection.getBoundingClientRect().top;
      if (contactTop < 80) {
        nav.classList.add('on-dark');
      } else {
        nav.classList.remove('on-dark');
      }
    });
  }
})();
