// The documentation pages' only script: the light and dark switch, and
// named events for Plausible. Everything on the pages works without it.
(function () {
  var root = document.documentElement
  var button = document.getElementById('theme')
  var dark = window.matchMedia('(prefers-color-scheme: dark)')

  // The same key as the front page, so a choice made on one holds on the other.
  try {
    var saved = localStorage.getItem('fotobogen-theme')
    if (saved === 'dark' || saved === 'light') root.setAttribute('data-theme', saved)
  }
  catch (error) { /* private browsing: follow the device */ }

  function current() { return root.getAttribute('data-theme') || (dark.matches ? 'dark' : 'light') }
  function label() {
    var next = current() === 'dark' ? 'Light' : 'Dark'
    button.textContent = next + ' mode'
  }
  function track(name, props) {
    try { window.plausible(name, props ? { props: props } : undefined) }
    catch (error) { /* analytics blocked or not loaded */ }
  }
  window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments) }
  window.plausible.init = window.plausible.init || function (options) { window.plausible.o = options || {} }
  window.plausible.init()

  if (button) {
    label()
    button.addEventListener('click', function () {
      var to = current() === 'dark' ? 'light' : 'dark'
      root.setAttribute('data-theme', to)
      try { localStorage.setItem('fotobogen-theme', to) }
      catch (error) { /* not remembered, but it still switches */ }
      label()
      track('Theme switch', { to: to })
    })
    if (dark.addEventListener) dark.addEventListener('change', label)
  }

  // "GitHub click" (where: docs) and "Author click", as on the front page.
  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('[data-goal]')
    if (link) track(link.getAttribute('data-goal'), link.getAttribute('data-where') ? { where: link.getAttribute('data-where') } : undefined)
  })
})()
