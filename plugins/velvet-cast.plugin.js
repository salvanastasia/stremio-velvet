/**
 * @name Velvet Cast Cards
 * @description Avatar circolari del cast (lista completa) sulla film detail page.
 * @updateUrl https://raw.githubusercontent.com/salvanastasia/stremio-velvet/main/plugins/velvet-cast.plugin.js
 * @version 1.4.0
 * @author Velvet
 */

(function () {
    'use strict'

    const ROOT_ID = 'velvet-cast-root'
    const STYLE_ID = 'velvet-cast-style'
    const CINEMETA = 'https://v3-cinemeta.strem.io'
    const TVMAZE_SEARCH = 'https://api.tvmaze.com/search/people'
    const TVMAZE_LOOKUP = 'https://api.tvmaze.com/lookup/shows'
    const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql'
    const CAST_LIMIT = 40
    const SKELETON_COUNT = 8
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
/* Nasconde il blocco Cast nativo di Stremio */
[class*="meta-links-container"].velvet-native-cast-hidden,
.velvet-native-cast-hidden {
  display: none !important;
}

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
  border: none;
  outline: none;
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
  flex-wrap: nowrap;
  gap: 1.75rem;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.2rem 0.15rem 0.55rem;
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
}

#${ROOT_ID} .velvet-cast-card {
  flex: 0 0 auto;
  width: 6.75rem;
  text-align: center;
  background: transparent;
  border: 0;
  color: inherit;
  cursor: default;
}

#${ROOT_ID} .velvet-cast-avatar {
  width: 6.75rem;
  height: 6.75rem;
  border-radius: 999px;
  overflow: hidden;
  margin: 0 auto 0.55rem;
  border: 1px solid rgba(255,255,255,0.28);
  box-shadow: none;
  background: #0a0a0c;
  transition: transform 180ms ease, border-color 180ms ease;
}

#${ROOT_ID} .velvet-cast-card:hover .velvet-cast-avatar {
  transform: translateY(-2px) scale(1.04);
  border-color: rgba(159,223,255,0.55);
}

#${ROOT_ID} .velvet-cast-avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

#${ROOT_ID} .velvet-cast-card .name {
  font-size: 0.74rem;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  opacity: 0.9;
}

#${ROOT_ID} .velvet-cast-empty {
  font-size: 0.85rem;
  opacity: 0.65;
}

#${ROOT_ID} .velvet-skel-avatar {
  width: 6.75rem;
  height: 6.75rem;
  border-radius: 999px;
  margin: 0 auto 0.55rem;
  border: 1px solid rgba(255,255,255,0.12);
  background: linear-gradient(
    90deg,
    rgba(255,255,255,0.06) 0%,
    rgba(255,255,255,0.16) 45%,
    rgba(255,255,255,0.06) 100%
  );
  background-size: 200% 100%;
  animation: velvet-skel-shine 1.15s ease-in-out infinite;
}

#${ROOT_ID} .velvet-skel-name {
  height: 0.7rem;
  width: 78%;
  margin: 0 auto;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    rgba(255,255,255,0.06) 0%,
    rgba(255,255,255,0.14) 45%,
    rgba(255,255,255,0.06) 100%
  );
  background-size: 200% 100%;
  animation: velvet-skel-shine 1.15s ease-in-out infinite;
}

@keyframes velvet-skel-shine {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
`
        document.documentElement.appendChild(style)
    }

    function hideNativeCast() {
        const blocks = document.querySelectorAll('[class*="meta-links-container"]')
        blocks.forEach((block) => {
            if (block.closest(`#${ROOT_ID}`)) return
            const label = block.querySelector('[class*="label-container"]')
            const text = ((label && label.textContent) || '').trim()
            if (/^cast$/i.test(text)) {
                block.classList.add('velvet-native-cast-hidden')
                block.style.setProperty('display', 'none', 'important')
            }
        })
    }

    function parseDetailRoute() {
        const haystack = [location.href, location.hash, location.pathname, location.search].join(' ')
        const match =
            haystack.match(/\/(?:metadetails|detail)\/(movie|series)\/(tt\d+)/i) ||
            haystack.match(/[?&#/](movie|series)[/:](tt\d+)/i)
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

    function renderSkeleton(root, title) {
        root.classList.add('is-visible')
        const items = Array.from({ length: SKELETON_COUNT }, () => `
          <article class="velvet-cast-card" aria-hidden="true">
            <div class="velvet-skel-avatar"></div>
            <div class="velvet-skel-name"></div>
          </article>`).join('')
        root.innerHTML = `
          <div class="velvet-cast-panel">
            <div class="velvet-cast-title">Cast${title ? ` · ${escapeHtml(title)}` : ''}</div>
            <div class="velvet-cast-rail">${items}</div>
          </div>`
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
        const unique = [...new Set(names.filter(Boolean))].slice(0, CAST_LIMIT)
        const cast = await Promise.all(
            unique.map(async (name) => {
                let image = null
                try {
                    const res = await fetch(`${TVMAZE_SEARCH}?q=${encodeURIComponent(name)}`)
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
                    /* fallback */
                }
                return { name, image: image || avatarFallback(name) }
            })
        )
        return cast
    }

    async function fetchTvMazeCast(imdbId) {
        try {
            const showRes = await fetch(`${TVMAZE_LOOKUP}?imdb=${encodeURIComponent(imdbId)}`)
            if (!showRes.ok) return []
            const show = await showRes.json()
            if (!show || !show.id) return []
            const castRes = await fetch(`https://api.tvmaze.com/shows/${show.id}/cast`)
            if (!castRes.ok) return []
            const cast = await castRes.json()
            return (cast || [])
                .map((entry) => {
                    const name = entry && entry.person && entry.person.name
                    if (!name) return null
                    return {
                        name,
                        image:
                            (entry.person.image && (entry.person.image.medium || entry.person.image.original)) ||
                            null,
                    }
                })
                .filter(Boolean)
        } catch (_) {
            return []
        }
    }

    async function fetchWikidataCast(imdbId) {
        const query = `
SELECT ?actorLabel WHERE {
  ?film wdt:P345 "${imdbId}".
  ?film wdt:P161 ?actor.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,it". }
}
LIMIT 80`
        try {
            const url = `${WIKIDATA_SPARQL}?format=json&query=${encodeURIComponent(query)}`
            const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json' } })
            if (!res.ok) return []
            const data = await res.json()
            return (data.results && data.results.bindings ? data.results.bindings : [])
                .map((row) => row.actorLabel && row.actorLabel.value)
                .filter(Boolean)
        } catch (_) {
            return []
        }
    }

    async function loadFromAddon(type, id) {
        let lastError
        for (const base of ADDON_CANDIDATES) {
            try {
                const res = await fetch(
                    `${base}/api/cast/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`,
                    { signal: AbortSignal.timeout(8000) }
                )
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                return await res.json()
            } catch (error) {
                lastError = error
            }
        }
        throw lastError || new Error('addon cast failed')
    }

    async function loadFullCast(type, id) {
        const metaRes = await fetch(`${CINEMETA}/meta/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`)
        if (!metaRes.ok) throw new Error('cinemeta failed')
        const metaData = await metaRes.json()
        const meta = metaData.meta || {}
        const title = meta.name || id

        const [tvmazePeople, wikidataNames] = await Promise.all([
            fetchTvMazeCast(id),
            fetchWikidataCast(id),
        ])

        const fromMeta = [
            ...(Array.isArray(meta.cast) ? meta.cast : []),
            ...((meta.links || [])
                .filter((link) => /^(cast|actor)$/i.test(link.category || ''))
                .map((link) => link.name)),
        ]

        const byName = new Map()
        for (const person of tvmazePeople) {
            byName.set(person.name.toLowerCase(), person)
        }
        for (const name of [...wikidataNames, ...fromMeta].filter(Boolean)) {
            const key = name.toLowerCase()
            if (!byName.has(key)) byName.set(key, { name, image: null })
        }

        const names = [...byName.values()].slice(0, CAST_LIMIT)
        const needImages = names.filter((person) => !person.image).map((person) => person.name)
        const imaged = needImages.length ? await enrichImages(needImages) : []
        const imageMap = new Map(imaged.map((person) => [person.name.toLowerCase(), person.image]))

        return {
            id,
            type,
            name: title,
            cast: names.map((person) => ({
                name: person.name,
                image: person.image || imageMap.get(person.name.toLowerCase()) || avatarFallback(person.name),
            })),
        }
    }

    async function sync() {
        ensureStyles()
        hideNativeCast()

        const route = parseDetailRoute()
        if (!route) {
            hide()
            return
        }

        const key = `${route.type}:${route.id}`
        if (key === lastKey || key === loadingKey) {
            ensureRoot()
            hideNativeCast()
            return
        }

        loadingKey = key
        const root = ensureRoot()
        renderSkeleton(root)

        try {
            let payload
            try {
                payload = await loadFullCast(route.type, route.id)
            } catch (_) {
                payload = await loadFromAddon(route.type, route.id)
            }
            if (loadingKey !== key) return
            lastKey = key
            render(ensureRoot(), payload)
            hideNativeCast()
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
        hideNativeCast()
        window.clearTimeout(sync._t)
        sync._t = window.setTimeout(sync, 120)
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    setInterval(() => {
        hideNativeCast()
        sync()
    }, 1500)
    sync()
})()
