const CINEMETA = 'https://v3-cinemeta.strem.io'
const TVMAZE_SEARCH = 'https://api.tvmaze.com/search/people'
const PERSON_PREFIX = 'velvetp:'

const metaCache = new Map()
const imageCache = new Map()

async function fetchJson(url) {
    const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
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

async function getCast(type, id, { limit = 12 } = {}) {
    const meta = await fetchCinemeta(type, id)
    const names = castNamesFromMeta(meta).slice(0, limit)

    const cast = await mapWithConcurrency(names, 4, async (name) => {
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
        description: `${name} — scheda cast Velvet (foto da TVMaze). Apri dai link Cast di un film.`,
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
    const names = castNamesFromMeta(meta)
    const links = (Array.isArray(meta.links) ? meta.links : []).filter(
        (link) => !(link && /^(cast|actor)$/i.test(link.category || ''))
    )

    if (publicBase) {
        links.unshift({
            name: 'Cast con foto',
            category: 'Cast',
            url: `${publicBase.replace(/\/$/, '')}/cast-ui/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
        })
    }

    for (const name of names) {
        const personId = toPersonId(name)
        links.push({
            name,
            category: 'Cast',
            url: `stremio:///detail/channel/${encodeURIComponent(personId)}`,
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
      background-image:
        radial-gradient(900px 500px at 10% -10%, rgba(159,223,255,.16), transparent 55%),
        radial-gradient(700px 420px at 90% 0%, rgba(125,255,200,.08), transparent 50%);
      padding: 2.5rem 2rem 3rem;
    }
    h1 { margin: 0 0 .35rem; font-size: clamp(1.6rem, 3vw, 2.4rem); font-weight: 600; }
    p { margin: 0 0 1.75rem; opacity: .65; }
    .rail {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
      gap: 1.25rem 1rem;
    }
    .card {
      text-align: center; border-radius: 1.25rem; padding: .85rem .6rem 1rem;
      border: 1px solid rgba(255,255,255,.18);
      background: linear-gradient(145deg, rgba(255,255,255,.14), rgba(255,255,255,.04));
      box-shadow: 0 16px 40px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.35);
      backdrop-filter: blur(22px) saturate(160%);
      outline: none;
    }
    .card:focus, .card:hover {
      border-color: rgba(159,223,255,.55);
      transform: translateY(-3px) scale(1.03);
    }
    .avatar {
      width: 7.5rem; height: 7.5rem; margin: 0 auto .75rem; border-radius: 999px; overflow: hidden;
      border: 1px solid rgba(255,255,255,.28);
      box-shadow: 0 12px 28px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.35);
      background: #0a0a0c;
    }
    .avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .name { font-size: .95rem; line-height: 1.25; }
    .empty { opacity: .7; font-size: 1.1rem; }
  </style>
</head>
<body>
  <h1>${escapeHtml(payload.name || 'Cast')}</h1>
  <p>Workaround Fire TV · avatar circolari</p>
  ${
      actors
          ? `<div class="rail">${actors}</div>`
          : `<div class="empty">Nessun attore trovato.</div>`
  }
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
