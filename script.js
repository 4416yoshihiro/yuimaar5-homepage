const header = document.querySelector("[data-header]");
const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector("#site-nav");

function syncHeader() {
  header.classList.toggle("is-scrolled", window.scrollY > 8);
}

navToggle.addEventListener("click", () => {
  const isOpen = siteNav.classList.toggle("is-open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
});

siteNav.addEventListener("click", (event) => {
  if (event.target.matches("a")) {
    siteNav.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
  }
});

window.addEventListener("scroll", syncHeader, { passive: true });
syncHeader();
