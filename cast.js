const CINEMETA = 'https://v3-cinemeta.strem.io'
const TVMAZE_SEARCH = 'https://api.tvmaze.com/search/people'

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
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=141418&color=9fdfff&size=256&bold=true`
}

function castNamesFromMeta(meta) {
    if (Array.isArray(meta.cast) && meta.cast.length) {
        return meta.cast.filter(Boolean)
    }

    const fromLinks = (meta.links || [])
        .filter((link) => link && /^(cast|actor)$/i.test(link.category || '') && link.name)
        .map((link) => link.name)

    return [...new Set(fromLinks)]
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

    const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
    await Promise.all(workers)
    return out
}

async function getCast(type, id, { limit = 12 } = {}) {
    const meta = await fetchCinemeta(type, id)
    const names = castNamesFromMeta(meta).slice(0, limit)

    const cast = await mapWithConcurrency(names, 4, async (name) => {
        const image = (await fetchActorImage(name)) || avatarFallback(name)
        return { name, image }
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

async function getEnrichedMeta(type, id) {
    const meta = await fetchCinemeta(type, id)
    const names = castNamesFromMeta(meta)
    const links = Array.isArray(meta.links) ? meta.links.slice() : []

    for (const name of names) {
        const exists = links.some((link) => link.category === 'Cast' && link.name === name)
        if (!exists) {
            links.push({
                name,
                category: 'Cast',
                url: `stremio:///search?search=${encodeURIComponent(name)}`,
            })
        }
    }

    return {
        ...meta,
        cast: names,
        links,
    }
}

module.exports = {
    getCast,
    getEnrichedMeta,
    fetchCinemeta,
}
