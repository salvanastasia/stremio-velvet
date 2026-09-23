# Velvet — Stremio addon + tema + cast plugin

Addon Stremio con film open in MP4 (riproducibili nel browser), tema liquid glass e plugin cast in overlay.

## Link

| Cosa | URL |
|------|-----|
| Repo | https://github.com/salvanastasia/stremio-velvet |
| Plugin cast (Enhanced) | https://raw.githubusercontent.com/salvanastasia/stremio-velvet/main/plugins/velvet-cast.plugin.js |
| Tema CSS | https://raw.githubusercontent.com/salvanastasia/stremio-velvet/main/theme/velvet.theme.css |

L’addon Node va avviato in locale (o deployato): Stremio non può usare un file GitHub come server.

```bash
npm install
npm start
```

Manifest locale: `http://127.0.0.1:7070/manifest.json`

## Plugin cast (Stremio Enhanced)

1. Settings → Open Plugins Folder  
2. Salva `velvet-cast.plugin.js` (dal raw link sopra)  
3. Riavvia Enhanced  
4. Apri un film: card cast in basso sulla detail page  

Il plugin prova prima `http://127.0.0.1:7070/api/cast/...`; se l’addon non è su, usa Cinemeta + TVMaze.

## Tema

Copia `theme/velvet.theme.css` nella cartella temi di Stremio Enhanced, oppure installalo con Stylus su `web.stremio.com`.
