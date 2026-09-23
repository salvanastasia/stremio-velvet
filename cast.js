const CINEMETA = 'https://v3-cinemeta.strem.io'
const TVMAZE_SEARCH = 'https://api.tvmaze.com/search/people'
const TVMAZE_LOOKUP = 'https://api.tvmaze.com/lookup/shows'
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql'
const PERSON_PREFIX = 'velvetp:'
const DEFAULT_CAST_LIMIT = 40

const metaCache = new Map()
const imageCache = new Map()
const castNamesCache = new Map()

async function fetchJson(url, headers = {}) {
    const res = await fetch(url, {
        headers: { Accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`)
    }
    return res.json()
}

async function fetchCinemeta(type, id) {
    const key = `${type}:${id}`
    if (metaCache.has(key)) {
        return metaCache.get(key)
    }

    const data = await fetchJson(`${CINEMETA}/meta/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`)
    const meta = data && data.meta
    if (!meta) {
        throw new Error('Meta non trovato')
    }
    metaCache.set(key, meta)
    return meta
}

async function fetchActorImage(name) {
    if (imageCache.has(name)) {
        return imageCache.get(name)
    }

    try {
        const results = await fetchJson(`${TVMAZE_SEARCH}?q=${encodeURIComponent(name)}`)
        const exact =
            results.find((entry) => entry.person && entry.person.name.toLowerCase() === name.toLowerCase()) ||
            results[0]
        const image =
            (exact && exact.person && exact.person.image && (exact.person.image.medium || exact.person.image.original)) ||
            null
        imageCache.set(name, image)
        return image
    } catch {
        imageCache.set(name, null)
        return null
    }
}

function avatarFallback(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=141418&color=9fdfff&size=512&bold=true`
}

function castNamesFromMeta(meta) {
    const fromCast = Array.isArray(meta.cast) ? meta.cast.filter(Boolean) : []
    const fromLinks = (meta.links || [])
        .filter((link) => link && /^(cast|actor)$/i.test(link.category || '') && link.name)
        .map((link) => link.name)
    return [...new Set([...fromCast, ...fromLinks])]
}

async function fetchTvMazeCast(imdbId) {
    try {
        const show = await fetchJson(`${TVMAZE_LOOKUP}?imdb=${encodeURIComponent(imdbId)}`)
        if (!show || !show.id) return []
        const cast = await fetchJson(`https://api.tvmaze.com/shows/${show.id}/cast`)
        return (cast || [])
            .map((entry) => {
                const name = entry && entry.person && entry.person.name
                if (!name) return null
                const image =
                    (entry.person.image && (entry.person.image.medium || entry.person.image.original)) || null
                if (image) imageCache.set(name, image)
                return name
            })
            .filter(Boolean)
    } catch {
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
        const data = await fetchJson(url, {
            Accept: 'application/sparql-results+json',
            'User-Agent': 'VelvetCast/1.4 (Stremio addon)',
        })
        return (data.results && data.results.bindings ? data.results.bindings : [])
            .map((row) => row.actorLabel && row.actorLabel.value)
            .filter(Boolean)
    } catch {
        return []
    }
}

async function resolveCastNames(type, id, meta) {
    const cacheKey = `${type}:${id}`
    if (castNamesCache.has(cacheKey)) {
        return castNamesCache.get(cacheKey)
    }

    const [tvmaze, wikidata] = await Promise.all([fetchTvMazeCast(id), fetchWikidataCast(id)])
    const cinemeta = castNamesFromMeta(meta || {})
    const names = [...new Set([...tvmaze, ...wikidata, ...cinemeta].filter(Boolean))]
    castNamesCache.set(cacheKey, names)
    return names
}

function toPersonId(name) {
    return PERSON_PREFIX + Buffer.from(String(name), 'utf8').toString('base64url')
}

function fromPersonId(id) {
    if (!String(id).startsWith(PERSON_PREFIX)) return null
    try {
        return Buffer.from(String(id).slice(PERSON_PREFIX.length), 'base64url').toString('utf8')
    } catch {
        return null
    }
}

async function mapWithConcurrency(items, limit, mapper) {
    const out = new Array(items.length)
    let next = 0

    async function worker() {
        while (next < items.length) {
            const index = next
            next += 1
            out[index] = await mapper(items[index], index)
        }
    }

    const workers = Array.from({ length: Math.min(limit, items.length || 1) }, () => worker())
    await Promise.all(workers)
    return out
}

async function getCast(type, id, { limit = DEFAULT_CAST_LIMIT } = {}) {
    const meta = await fetchCinemeta(type, id)
    const names = (await resolveCastNames(type, id, meta)).slice(0, limit)

    const cast = await mapWithConcurrency(names, 5, async (name) => {
        const image = (await fetchActorImage(name)) || avatarFallback(name)
        return {
            name,
            image,
            personId: toPersonId(name),
        }
    })

    return {
        id: meta.id || id,
        type: meta.type || type,
        name: meta.name || id,
        poster: meta.poster || null,
        background: meta.background || null,
        cast,
    }
}

async function getPersonMeta(id) {
    const name = fromPersonId(id)
    if (!name) {
        throw new Error('Persona non valida')
    }
    const image = (await fetchActorImage(name)) || avatarFallback(name)
    return {
        id,
        type: 'channel',
        name,
        poster: image,
        posterShape: 'square',
        background: image,
        description: `${name} — scheda cast Velvet (foto da TVMaze).`,
        links: [
            {
                name: `Cerca ${name}`,
                category: 'Genres',
                url: `stremio:///search?search=${encodeURIComponent(name)}`,
            },
        ],
    }
}

async function getEnrichedMeta(type, id, { publicBase } = {}) {
    const meta = await fetchCinemeta(type, id)
    const names = await resolveCastNames(type, id, meta)
    const links = (Array.isArray(meta.links) ? meta.links : []).filter(
        (link) => !(link && /^(cast|actor)$/i.test(link.category || ''))
    )

    if (publicBase) {
        links.unshift({
            name: 'Cast con foto',
            category: 'Links',
            url: `${publicBase.replace(/\/$/, '')}/cast-ui/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
        })
    }

    for (const name of names.slice(0, DEFAULT_CAST_LIMIT)) {
        links.push({
            name,
            category: 'Cast',
            url: `stremio:///detail/channel/${encodeURIComponent(toPersonId(name))}`,
        })
    }

    return {
        ...meta,
        cast: names,
        links,
    }
}

function renderCastGalleryHtml(payload) {
    const actors = (payload.cast || [])
        .map(
            (actor) => `
      <article class="card" tabindex="0">
        <div class="avatar"><img src="${escapeHtml(actor.image)}" alt="${escapeHtml(actor.name)}" /></div>
        <div class="name">${escapeHtml(actor.name)}</div>
      </article>`
        )
        .join('')

    return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cast · ${escapeHtml(payload.name || '')}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; font-family: Outfit, Arial, Helvetica, sans-serif;
      color: #f4f7fb; background: #000;
      padding: 2.5rem 2rem 3rem;
    }
    h1 { margin: 0 0 .35rem; font-size: clamp(1.6rem, 3vw, 2.4rem); font-weight: 600; }
    p { margin: 0 0 1.75rem; opacity: .65; }
    .rail {
      display: flex; gap: 1.75rem; overflow-x: auto; padding-bottom: .5rem;
      -webkit-overflow-scrolling: touch;
    }
    .card { flex: 0 0 auto; width: 7.25rem; text-align: center; outline: none; }
    .avatar {
      width: 7.25rem; height: 7.25rem; margin: 0 auto .75rem; border-radius: 999px; overflow: hidden;
      border: 1px solid rgba(255,255,255,.28); background: #0a0a0c;
    }
    .avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .name { font-size: .95rem; line-height: 1.25; }
    .empty { opacity: .7; font-size: 1.1rem; }
  </style>
</head>
<body>
  <h1>${escapeHtml(payload.name || 'Cast')}</h1>
  <p>Workaround Fire TV · avatar circolari</p>
  ${actors ? `<div class="rail">${actors}</div>` : `<div class="empty">Nessun attore trovato.</div>`}
</body>
</html>`
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

module.exports = {
    PERSON_PREFIX,
    getCast,
    getEnrichedMeta,
    getPersonMeta,
    fetchCinemeta,
    toPersonId,
    fromPersonId,
    renderCastGalleryHtml,
}
