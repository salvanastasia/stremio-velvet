const path = require('path')
const express = require('express')
const { addonBuilder, getRouter } = require('stremio-addon-sdk')
const landingTemplate = require('stremio-addon-sdk/src/landingTemplate')
const { getCast, getEnrichedMeta } = require('./cast')

// Stream HTTPS MP4 per pochi film open. Cast da Cinemeta + foto TVMaze.
// Le card in overlay sulla detail page richiedono il plugin Enhanced (non bastano i meta).
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

const manifest = {
    id: 'com.velvet.cinema',
    version: '1.1.0',
    name: 'Velvet',
    description:
        'MP4 open + cast automatico (Cinemeta). Card attori in overlay: plugin Enhanced velvet-cast.',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
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
    if (!id || !String(id).startsWith('tt')) {
        return Promise.resolve({ meta: null })
    }

    try {
        const meta = await getEnrichedMeta(type || 'movie', id)
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
const port = Number(process.env.PORT) || 7070
const app = express()
const landingHTML = landingTemplate(addonInterface.manifest)

app.use((_, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
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

app.use(getRouter(addonInterface))
app.use('/theme', express.static(path.join(__dirname, 'theme')))
app.use('/plugins', express.static(path.join(__dirname, 'plugins')))
app.get('/', (_, res) => {
    res.setHeader('content-type', 'text/html')
    res.end(landingHTML)
})

app.listen(port, () => {
    console.log(`Velvet in ascolto su http://127.0.0.1:${port}/manifest.json`)
    console.log(`Cast API: http://127.0.0.1:${port}/api/cast/movie/tt1375666.json`)
    console.log(`Plugin: http://127.0.0.1:${port}/plugins/velvet-cast.plugin.js`)
})
