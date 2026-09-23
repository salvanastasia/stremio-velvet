/**
 * @name Velvet Cast Cards
 * @description Mostra il cast come card liquid glass in overlay sulla film detail page.
 * @updateUrl https://raw.githubusercontent.com/salvanastasia/stremio-velvet/main/plugins/velvet-cast.plugin.js
 * @version 1.0.0
 * @author Velvet
 */

(function () {
    'use strict'

    const ADDON_BASE = 'http://127.0.0.1:7070'
    const ROOT_ID = 'velvet-cast-root'
    const STYLE_ID = 'velvet-cast-style'
    const CINEMETA = 'https://v3-cinemeta.strem.io'
    const TVMAZE = 'https://api.tvmaze.com/search/people'

    let lastKey = ''
    let loadingKey = ''

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return
        const style = document.createElement('style')
        style.id = STYLE_ID
        style.textContent = `
#${ROOT_ID} {
  position: fixed;
  left: max(1rem, env(safe-area-inset-left));
  right: max(1rem, env(safe-area-inset-right));
  bottom: calc(max(1rem, env(safe-area-inset-bottom)) + 5.5rem);
  z-index: 40;
  pointer-events: none;
  display: none;
}

#${ROOT_ID}.is-visible {
  display: block;
}

#${ROOT_ID} .velvet-cast-panel {
  pointer-events: auto;
  max-width: 72rem;
  margin: 0 auto;
  padding: 0.85rem 1rem 1rem;
  border-radius: 1.25rem;
  border: 1px solid rgba(255,255,255,0.22);
  background:
    linear-gradient(145deg, rgba(255,255,255,0.18), rgba(255,255,255,0.04) 34%, rgba(255,255,255,0.08)),
    rgba(8,8,10,0.42);
  box-shadow:
    0 18px 48px rgba(0,0,0,0.55),
    inset 0 1px 0 rgba(255,255,255,0.45);
  backdrop-filter: blur(28px) saturate(165%);
  -webkit-backdrop-filter: blur(28px) saturate(165%);
  color: rgba(255,255,255,0.94);
  font-family: Outfit, PlusJakartaSans, Arial, Helvetica, sans-serif;
}

#${ROOT_ID} .velvet-cast-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

#${ROOT_ID} .velvet-cast-title {
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.9;
}

#${ROOT_ID} .velvet-cast-sub {
  font-size: 0.8rem;
  opacity: 0.55;
}

#${ROOT_ID} .velvet-cast-rail {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  padding-bottom: 0.15rem;
  scrollbar-width: thin;
}

#${ROOT_ID} .velvet-cast-card {
  flex: 0 0 auto;
  width: 7.5rem;
  border-radius: 1rem;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.06);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.28);
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}

#${ROOT_ID} .velvet-cast-card:hover {
  transform: translateY(-3px) scale(1.02);
  border-color: rgba(159,223,255,0.45);
  box-shadow:
    0 12px 28px rgba(0,0,0,0.45),
    inset 0 1px 0 rgba(255,255,255,0.4);
}

#${ROOT_ID} .velvet-cast-card img {
  display: block;
  width: 100%;
  height: 9.5rem;
  object-fit: cover;
  background: #0a0a0c;
}

#${ROOT_ID} .velvet-cast-card .name {
  padding: 0.55rem 0.55rem 0.7rem;
  font-size: 0.78rem;
  line-height: 1.25;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

#${ROOT_ID} .velvet-cast-empty,
#${ROOT_ID} .velvet-cast-loading {
  font-size: 0.85rem;
  opacity: 0.65;
  padding: 0.35rem 0;
}

@media (max-width: 700px) {
  #${ROOT_ID} {
    bottom: calc(max(0.75rem, env(safe-area-inset-bottom)) + 6.25rem);
  }
  #${ROOT_ID} .velvet-cast-card {
    width: 6.4rem;
  }
  #${ROOT_ID} .velvet-cast-card img {
    height: 8.2rem;
  }
}
`
        document.documentElement.appendChild(style)
    }

    function parseDetailRoute() {
        const path = `${location.pathname || ''}${location.hash || ''}`
        const match = path.match(/\/(?:metadetails|detail)\/(movie|series)\/(tt\d+)/i)
        if (!match) return null
        return { type: match[1].toLowerCase(), id: match[2] }
    }

    function ensureRoot() {
        let root = document.getElementById(ROOT_ID)
        if (!root) {
            root = document.createElement('div')
            root.id = ROOT_ID
            document.body.appendChild(root)
        }
        return root
    }

    function hide() {
        const root = document.getElementById(ROOT_ID)
        if (!root) return
        root.classList.remove('is-visible')
        root.innerHTML = ''
        lastKey = ''
    }

    function render(root, payload, subtitle) {
        const cast = (payload && payload.cast) || []
        root.classList.add('is-visible')
        if (!cast.length) {
            root.innerHTML = `
              <div class="velvet-cast-panel">
                <div class="velvet-cast-head">
                  <div class="velvet-cast-title">Cast</div>
                  <div class="velvet-cast-sub">${subtitle || ''}</div>
                </div>
                <div class="velvet-cast-empty">Nessun attore trovato per questo titolo.</div>
              </div>`
            return
        }

        root.innerHTML = `
          <div class="velvet-cast-panel">
            <div class="velvet-cast-head">
              <div class="velvet-cast-title">Cast</div>
              <div class="velvet-cast-sub">${subtitle || payload.name || ''}</div>
            </div>
            <div class="velvet-cast-rail">
              ${cast
                  .map(
                      (actor) => `
                <article class="velvet-cast-card" title="${escapeHtml(actor.name)}">
                  <img src="${escapeAttr(actor.image)}" alt="${escapeAttr(actor.name)}" loading="lazy" />
                  <div class="name">${escapeHtml(actor.name)}</div>
                </article>`
                  )
                  .join('')}
            </div>
          </div>`
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
    }

    function escapeAttr(value) {
        return escapeHtml(value).replace(/'/g, '&#39;')
    }

    function avatarFallback(name) {
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=141418&color=9fdfff&size=256&bold=true`
    }

    async function enrichImages(names) {
        const cast = []
        for (const name of names.slice(0, 12)) {
            let image = null
            try {
                const res = await fetch(`${TVMAZE}?q=${encodeURIComponent(name)}`)
                if (res.ok) {
                    const data = await res.json()
                    const hit =
                        data.find((entry) => entry.person && entry.person.name.toLowerCase() === name.toLowerCase()) ||
                        data[0]
                    image =
                        hit && hit.person && hit.person.image
                            ? hit.person.image.medium || hit.person.image.original
                            : null
                }
            } catch (_) {
                /* fallback avatar */
            }
            cast.push({ name, image: image || avatarFallback(name) })
        }
        return cast
    }

    async function loadFromAddon(type, id) {
        const res = await fetch(`${ADDON_BASE}/api/cast/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`)
        if (!res.ok) throw new Error('addon cast failed')
        return res.json()
    }

    async function loadFromCinemeta(type, id) {
        const res = await fetch(`${CINEMETA}/meta/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`)
        if (!res.ok) throw new Error('cinemeta failed')
        const data = await res.json()
        const meta = data.meta || {}
        const names = Array.isArray(meta.cast)
            ? meta.cast
            : (meta.links || [])
                  .filter((link) => /^(cast|actor)$/i.test(link.category || ''))
                  .map((link) => link.name)
        return {
            id,
            type,
            name: meta.name || id,
            cast: await enrichImages(names.filter(Boolean)),
        }
    }

    async function sync() {
        ensureStyles()
        const route = parseDetailRoute()
        const onDetails = Boolean(route) && Boolean(document.querySelector('[class*="metadetails"], [class*="meta-preview"]'))

        if (!route || !onDetails) {
            hide()
            return
        }

        const key = `${route.type}:${route.id}`
        if (key === lastKey || key === loadingKey) return

        loadingKey = key
        const root = ensureRoot()
        root.classList.add('is-visible')
        root.innerHTML = `
          <div class="velvet-cast-panel">
            <div class="velvet-cast-head">
              <div class="velvet-cast-title">Cast</div>
            </div>
            <div class="velvet-cast-loading">Carico gli attori…</div>
          </div>`

        try {
            let payload
            try {
                payload = await loadFromAddon(route.type, route.id)
            } catch (_) {
                payload = await loadFromCinemeta(route.type, route.id)
            }
            if (loadingKey !== key) return
            lastKey = key
            render(root, payload, payload.name)
        } catch (error) {
            if (loadingKey !== key) return
            root.innerHTML = `
              <div class="velvet-cast-panel">
                <div class="velvet-cast-head">
                  <div class="velvet-cast-title">Cast</div>
                </div>
                <div class="velvet-cast-empty">Impossibile caricare il cast.</div>
              </div>`
        } finally {
            if (loadingKey === key) loadingKey = ''
        }
    }

    const observer = new MutationObserver(() => {
        window.clearTimeout(sync._t)
        sync._t = window.setTimeout(sync, 180)
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    sync()
})()
