const path = require('path')
const express = require('express')
const { addonBuilder, getRouter } = require('stremio-addon-sdk')
const landingTemplate = require('stremio-addon-sdk/src/landingTemplate')
const {
    PERSON_PREFIX,
    getCast,
    getEnrichedMeta,
    getPersonMeta,
    renderCastGalleryHtml,
} = require('./cast')

// Stream HTTPS MP4 + cast.
// Fire TV: niente plugin → schede attore (poster) + pagina /cast-ui con avatar.
const MOVIES = [
    {
        id: 'tt1254207',
        name: 'Big Buck Bunny',
        year: '2008',
        description: 'Short Blender. MP4 diretto, parte nel browser.',
        poster: 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Big_buck_bunny_poster_big.jpg',
        url: 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4',
        filename: 'big_buck_bunny_720p_surround.mp4',
    },
    {
        id: 'tt1727587',
        name: 'Sintel',
        year: '2010',
        description: 'Short Blender. MP4 diretto, parte nel browser.',
        poster: 'https://upload.wikimedia.org/wikipedia/commons/8/8f/Sintel_poster.jpg',
        url: 'https://archive.org/download/Sintel/sintel-2048-stereo_512kb.mp4',
        filename: 'sintel-2048-stereo_512kb.mp4',
    },
    {
        id: 'tt0807840',
        name: 'Elephants Dream',
        year: '2006',
        description: 'Short Blender. MP4 diretto, parte nel browser.',
        poster: 'https://upload.wikimedia.org/wikipedia/commons/9/90/Elephants_Dream_s1_proog.jpg',
        url: 'https://archive.org/download/ElephantsDream/ed_hd.mp4',
        filename: 'ed_hd.mp4',
    },
]

const moviesById = new Map(MOVIES.map((movie) => [movie.id, movie]))

let publicBase = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')

function currentPublicBase() {
    return publicBase
}

const manifest = {
    id: 'com.velvet.cinema',
    version: '1.3.0',
    name: 'Velvet',
    description:
        'MP4 open + cast. Su Fire TV: link Cast → foto attore, oppure “Cast con foto” (avatar).',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series', 'channel'],
    idPrefixes: ['tt', PERSON_PREFIX],
    catalogs: [
        {
            type: 'movie',
            id: 'open-movies',
            name: 'Cinema aperto',
        },
    ],
}

const builder = new addonBuilder(manifest)

builder.defineCatalogHandler(({ type, id }) => {
    if (type !== 'movie' || id !== 'open-movies') {
        return Promise.resolve({ metas: [] })
    }

    return Promise.resolve({
        metas: MOVIES.map((movie) => ({
            id: movie.id,
            type: 'movie',
            name: movie.name,
            poster: movie.poster,
            posterShape: 'poster',
            description: movie.description,
            releaseInfo: movie.year,
        })),
    })
})

builder.defineMetaHandler(async ({ type, id }) => {
    if (!id) {
        return { meta: null }
    }

    if (String(id).startsWith(PERSON_PREFIX)) {
        try {
            return { meta: await getPersonMeta(id) }
        } catch {
            return { meta: null }
        }
    }

    if (!String(id).startsWith('tt')) {
        return { meta: null }
    }

    try {
        const meta = await getEnrichedMeta(type || 'movie', id, {
            publicBase: currentPublicBase(),
        })
        return { meta }
    } catch {
        const local = moviesById.get(id)
        if (!local) {
            return { meta: null }
        }
        return {
            meta: {
                id: local.id,
                type: 'movie',
                name: local.name,
                poster: local.poster,
                posterShape: 'poster',
                description: local.description,
                releaseInfo: local.year,
                cast: [],
            },
        }
    }
})

builder.defineStreamHandler(({ type, id }) => {
    const movie = type === 'movie' ? moviesById.get(id) : undefined
    if (!movie) {
        return Promise.resolve({ streams: [] })
    }

    return Promise.resolve({
        streams: [
            {
                name: 'Velvet',
                description: 'MP4 · H.264 · parte nel browser',
                url: movie.url,
                behaviorHints: {
                    notWebReady: false,
                    bingeGroup: 'velvet-mp4',
                    filename: movie.filename,
                },
            },
        ],
    })
})

const addonInterface = builder.getInterface()
const app = express()
const landingHTML = landingTemplate(addonInterface.manifest)

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (!process.env.PUBLIC_BASE_URL) {
        const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http'
        const host = req.get('host')
        if (host) publicBase = `${proto}://${host}`
    }
    next()
})

app.get('/api/cast/:type/:id.json', async (req, res) => {
    try {
        const payload = await getCast(req.params.type, req.params.id)
        res.setHeader('Cache-Control', 'public, max-age=3600')
        res.json(payload)
    } catch (error) {
        res.status(404).json({
            error: 'Cast non disponibile',
            message: error.message,
            cast: [],
        })
    }
})

app.get('/cast-ui/:type/:id', async (req, res) => {
    try {
        const payload = await getCast(req.params.type, req.params.id)
        res.setHeader('content-type', 'text/html; charset=utf-8')
        res.setHeader('Cache-Control', 'public, max-age=600')
        res.end(renderCastGalleryHtml(payload))
    } catch (error) {
        res.status(404).type('html').send(`<h1>Cast non disponibile</h1><p>${error.message}</p>`)
    }
})

app.use(getRouter(addonInterface))
app.use('/theme', express.static(path.join(__dirname, 'theme')))
app.use('/plugins', express.static(path.join(__dirname, 'plugins')))
app.use('/userscripts', express.static(path.join(__dirname, 'userscripts')))
app.get('/', (_, res) => {
    res.setHeader('content-type', 'text/html')
    res.end(landingHTML)
})

module.exports = app

if (require.main === module) {
    const port = Number(process.env.PORT) || 7070
    app.listen(port, '0.0.0.0', () => {
        console.log(`Velvet in ascolto su http://127.0.0.1:${port}/manifest.json`)
        console.log(`Fire TV: usa l'IP LAN del PC, non 127.0.0.1`)
        console.log(`Cast UI: http://127.0.0.1:${port}/cast-ui/movie/tt1375666`)
    })
}
