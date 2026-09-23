// ==UserScript==
// @name         Velvet Cast Avatars
// @namespace    https://github.com/salvanastasia/stremio-velvet
// @version      1.2.0
// @description  Avatar circolari del cast sulla detail page di Stremio Web
// @author       Velvet
// @match        https://web.stremio.com/*
// @match        https://app.strem.io/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/salvanastasia/stremio-velvet/main/userscripts/velvet-cast.user.js
// @downloadURL  https://raw.githubusercontent.com/salvanastasia/stremio-velvet/main/userscripts/velvet-cast.user.js
// ==/UserScript==

(function () {
    'use strict'

    const ROOT_ID = 'velvet-cast-root'
    const STYLE_ID = 'velvet-cast-style'
    const CINEMETA = 'https://v3-cinemeta.strem.io'
    const TVMAZE = 'https://api.tvmaze.com/search/people'
    const ADDON_CANDIDATES = [
        typeof localStorage !== 'undefined' ? localStorage.getItem('velvetAddonBase') : null,
        'http://127.0.0.1:7070',
        'http://localhost:7070',
    ].filter(Boolean)

    let lastKey = ''
    let loadingKey = ''

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return
        const style = document.createElement('style')
        style.id = STYLE_ID
        style.textContent = `
#${ROOT_ID} {
  display: none;
  width: 100%;
  margin: 1.25rem 0 0;
  padding: 0;
  z-index: 30;
  font-family: Outfit, PlusJakartaSans, Arial, Helvetica, sans-serif;
  color: rgba(255,255,255,0.94);
}

#${ROOT_ID}.is-visible { display: block; }

#${ROOT_ID}.velvet-cast-floating {
  position: fixed;
  left: max(1rem, env(safe-area-inset-left));
  right: max(1rem, env(safe-area-inset-right));
  bottom: calc(max(1rem, env(safe-area-inset-bottom)) + 5.75rem);
  width: auto;
  margin: 0;
  pointer-events: none;
}

#${ROOT_ID}.velvet-cast-floating .velvet-cast-panel {
  pointer-events: auto;
  max-width: 72rem;
  margin: 0 auto;
}

#${ROOT_ID} .velvet-cast-panel {
  padding: 1rem 1.1rem 1.15rem;
  border-radius: 1.35rem;
  border: 1px solid rgba(255,255,255,0.22);
  background:
    linear-gradient(145deg, rgba(255,255,255,0.18), rgba(255,255,255,0.04) 34%, rgba(255,255,255,0.08)),
    rgba(8,8,10,0.48);
  box-shadow:
    0 18px 48px rgba(0,0,0,0.55),
    inset 0 1px 0 rgba(255,255,255,0.45);
  backdrop-filter: blur(28px) saturate(165%);
  -webkit-backdrop-filter: blur(28px) saturate(165%);
}

#${ROOT_ID} .velvet-cast-title {
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.85;
  margin-bottom: 0.9rem;
}

#${ROOT_ID} .velvet-cast-rail {
  display: flex;
  gap: 1rem;
  overflow-x: auto;
  padding: 0.15rem 0.1rem 0.35rem;
  scrollbar-width: thin;
}

#${ROOT_ID} .velvet-cast-card {
  flex: 0 0 auto;
  width: 5.5rem;
  text-align: center;
  background: transparent;
  border: 0;
  color: inherit;
  cursor: default;
}

#${ROOT_ID} .velvet-cast-avatar {
  width: 5.5rem;
  height: 5.5rem;
  border-radius: 999px;
  overflow: hidden;
  margin: 0 auto 0.55rem;
  border: 1px solid rgba(255,255,255,0.28);
  box-shadow:
    0 10px 28px rgba(0,0,0,0.45),
    inset 0 1px 0 rgba(255,255,255,0.35);
  background: #0a0a0c;
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}

#${ROOT_ID} .velvet-cast-card:hover .velvet-cast-avatar {
  transform: translateY(-2px) scale(1.04);
  border-color: rgba(159,223,255,0.55);
  box-shadow:
    0 14px 32px rgba(0,0,0,0.5),
    0 0 0 1px rgba(159,223,255,0.2),
    inset 0 1px 0 rgba(255,255,255,0.45);
}

#${ROOT_ID} .velvet-cast-avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

#${ROOT_ID} .velvet-cast-card .name {
  font-size: 0.72rem;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  opacity: 0.9;
}

#${ROOT_ID} .velvet-cast-empty,
#${ROOT_ID} .velvet-cast-loading {
  font-size: 0.85rem;
  opacity: 0.65;
}
`
        document.documentElement.appendChild(style)
    }

    function parseDetailRoute() {
        const haystack = [
            location.href,
            location.hash,
            location.pathname,
            location.search,
        ].join(' ')
        const match = haystack.match(/\/(?:metadetails|detail)\/(movie|series)\/(tt\d+)/i)
            || haystack.match(/[?&#/](movie|series)[/:](tt\d+)/i)
        if (!match) return null
        return { type: match[1].toLowerCase(), id: match[2] }
    }

    function findMountPoint() {
        return (
            document.querySelector('[class*="meta-preview"]') ||
            document.querySelector('[class*="metadetails-content"]') ||
            document.querySelector('[class*="metadetails"]') ||
            null
        )
    }

    function ensureRoot() {
        let root = document.getElementById(ROOT_ID)
        if (!root) {
            root = document.createElement('section')
            root.id = ROOT_ID
            root.setAttribute('aria-label', 'Cast')
        }

        const mount = findMountPoint()
        if (mount) {
            root.classList.remove('velvet-cast-floating')
            if (root.parentElement !== mount) mount.appendChild(root)
        } else {
            root.classList.add('velvet-cast-floating')
            if (root.parentElement !== document.body) document.body.appendChild(root)
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
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=141418&color=9fdfff&size=256&bold=true&rounded=true`
    }

    function render(root, payload) {
        const cast = (payload && payload.cast) || []
        root.classList.add('is-visible')
        if (!cast.length) {
            root.innerHTML = `
              <div class="velvet-cast-panel">
                <div class="velvet-cast-title">Cast</div>
                <div class="velvet-cast-empty">Nessun attore trovato per questo titolo.</div>
              </div>`
            return
        }

        root.innerHTML = `
          <div class="velvet-cast-panel">
            <div class="velvet-cast-title">Cast · ${escapeHtml(payload.name || '')}</div>
            <div class="velvet-cast-rail">
              ${cast
                  .map(
                      (actor) => `
                <article class="velvet-cast-card" title="${escapeHtml(actor.name)}">
                  <div class="velvet-cast-avatar">
                    <img src="${escapeAttr(actor.image)}" alt="${escapeAttr(actor.name)}" loading="lazy" />
                  </div>
                  <div class="name">${escapeHtml(actor.name)}</div>
                </article>`
                  )
                  .join('')}
            </div>
          </div>`
    }

    async function enrichImages(names) {
        const unique = [...new Set(names.filter(Boolean))].slice(0, 16)
        const cast = await Promise.all(
            unique.map(async (name) => {
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
                    /* avatar fallback */
                }
                return { name, image: image || avatarFallback(name) }
            })
        )
        return cast
    }

    async function loadFromAddon(type, id) {
        let lastError
        for (const base of ADDON_CANDIDATES) {
            try {
                const res = await fetch(
                    `${base}/api/cast/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`,
                    { signal: AbortSignal.timeout(2500) }
                )
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                return await res.json()
            } catch (error) {
                lastError = error
            }
        }
        throw lastError || new Error('addon cast failed')
    }

    async function loadFromCinemeta(type, id) {
        const res = await fetch(`${CINEMETA}/meta/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`)
        if (!res.ok) throw new Error('cinemeta failed')
        const data = await res.json()
        const meta = data.meta || {}
        const fromCast = Array.isArray(meta.cast) ? meta.cast : []
        const fromLinks = (meta.links || [])
            .filter((link) => /^(cast|actor)$/i.test(link.category || ''))
            .map((link) => link.name)
        const names = [...new Set([...fromCast, ...fromLinks].filter(Boolean))]
        return {
            id,
            type,
            name: meta.name || id,
            cast: await enrichImages(names),
        }
    }

    async function sync() {
        ensureStyles()
        const route = parseDetailRoute()
        if (!route) {
            hide()
            return
        }

        const key = `${route.type}:${route.id}`
        if (key === lastKey || key === loadingKey) {
            ensureRoot()
            return
        }

        loadingKey = key
        const root = ensureRoot()
        root.classList.add('is-visible')
        root.innerHTML = `
          <div class="velvet-cast-panel">
            <div class="velvet-cast-title">Cast</div>
            <div class="velvet-cast-loading">Carico gli attori…</div>
          </div>`

        try {
            let payload
            try {
                payload = await loadFromCinemeta(route.type, route.id)
            } catch (_) {
                payload = await loadFromAddon(route.type, route.id)
            }
            if (loadingKey !== key) return
            lastKey = key
            render(ensureRoot(), payload)
        } catch (_) {
            if (loadingKey !== key) return
            ensureRoot().innerHTML = `
              <div class="velvet-cast-panel">
                <div class="velvet-cast-title">Cast</div>
                <div class="velvet-cast-empty">Impossibile caricare il cast.</div>
              </div>`
        } finally {
            if (loadingKey === key) loadingKey = ''
        }
    }

    const observer = new MutationObserver(() => {
        window.clearTimeout(sync._t)
        sync._t = window.setTimeout(sync, 120)
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    setInterval(sync, 1500)
    sync()
})()
