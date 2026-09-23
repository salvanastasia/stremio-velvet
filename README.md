# Velvet — Stremio addon + tema + cast plugin

Addon Stremio con film open in MP4 (riproducibili nel browser), tema liquid glass e plugin cast in overlay.

## Link

| Cosa | URL |
|------|-----|
| Repo | https://github.com/salvanastasia/stremio-velvet |
| Plugin cast (Enhanced) | https://raw.githubusercontent.com/salvanastasia/stremio-velvet/main/plugins/velvet-cast.plugin.js |
| Userscript (Stremio Web) | https://raw.githubusercontent.com/salvanastasia/stremio-velvet/main/userscripts/velvet-cast.user.js |
| Tema CSS | https://raw.githubusercontent.com/salvanastasia/stremio-velvet/main/theme/velvet.theme.css |

L’addon Node va avviato in locale (o deployato): Stremio non può usare un file GitHub come server.

```bash
npm install
npm start
```

Manifest locale: `http://127.0.0.1:7070/manifest.json`

## Cast con avatar (obbligatorio)

Stremio ufficiale **non disegna** foto/card del cast: mostra solo i nomi come link.
Per gli avatar circolari serve uno di questi:

### A) Stremio Enhanced
1. Settings → Open Plugins Folder  
2. Scarica [velvet-cast.plugin.js](https://raw.githubusercontent.com/salvanastasia/stremio-velvet/main/plugins/velvet-cast.plugin.js)  
3. Riavvia Enhanced  
4. Apri un film (es. Inception): avatar sotto i dettagli  

### B) Stremio Web ufficiale
1. Installa Tampermonkey / Violentmonkey  
2. Nuovo script da URL:  
   https://raw.githubusercontent.com/salvanastasia/stremio-velvet/main/userscripts/velvet-cast.user.js  
3. Ricarica `web.stremio.com` e apri un film  

Il cast arriva da Cinemeta + foto TVMaze (HTTPS). L’addon locale è opzionale.

## Fire TV (workaround senza plugin)

Su Fire TV non si possono iniettare avatar nella UI. Velvet espone due percorsi **nativi**:

1. **Link Cast** sul film → apre la scheda attore con **poster/foto grande** (meta `channel` / `velvetp:…`)
2. **“Cast con foto”** → apre la pagina `/cast-ui/...` nel browser della TV con **avatar circolari**

Importante: da Fire TV **non** usare `127.0.0.1` (è la TV stessa). Usa l’IP LAN del PC, es.:

`http://192.168.1.20:7070/manifest.json`

Oppure pubblica l’addon online (Vercel/Beamup) e installa quell’URL HTTPS.
