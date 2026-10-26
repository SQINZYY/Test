"""Erzeugt web/data/catalog.json aus dem "Spotify Tracks Dataset" (114.000 Zeilen, CSV).

Aufruf: python3 -I klangwelt/tools/build_catalog.py <dataset.csv> [ausgabe.json]

Quelle: https://huggingface.co/datasets/maharshipandya/spotify-tracks-dataset (auch auf Kaggle;
Spiegel mit CC0: github.com/sai-chaitanya-reddy/spotify-tracks-dataset). Spalten: track_id, artists
(mit ";" getrennt), album_name, track_name, popularity, duration_ms, explicit, danceability, energy,
key, loudness, mode, speechiness, acousticness, instrumentalness, liveness, valence, tempo,
time_signature, track_genre.

Gleiche Songs (Titel + Künstler) kommen im Datensatz oft mehrfach vor (verschiedene Alben/Genres):
behalten wird die beliebteste Fassung, die Genres werden zusammengeführt. Sortiert nach Beliebtheit.

Format (spaltenweise, damit die Datei klein bleibt und schnell lädt):
  ids     ein String, 22 Zeichen pro Song (Spotify-Track-ID)
  q       ein String, 8 Zeichen pro Song: Beliebtheit, Tanzbarkeit, Energie, Stimmung (valence),
          Akustik, Instrumental, Sprache, Live – jeweils 0..90 als Zeichen ALPHABET[i]
  x       ein Zeichen pro Song: Tonart*2 + Dur(1)/Moll(0) + 24 bei "explicit"
  names, artists (Liste), ta (Künstler-Index oder Liste), albums, albumArtist, al (Album-Index),
  genres, tg (Genre-Index oder Liste), dur (Sekunden), tempo (BPM, ganzzahlig)
"""
import csv
import json
import sys

# 91 druckbare ASCII-Zeichen ohne " und \ – passt unverändert in JSON-Strings
ALPHABET = ''.join(chr(c) for c in range(35, 127) if c != 92)
assert len(ALPHABET) == 91
FEATURES = ['danceability', 'energy', 'valence', 'acousticness', 'instrumentalness', 'speechiness', 'liveness']


def q(v):
    return ALPHABET[max(0, min(90, round(float(v) * 90)))]


def main(src, dst):
    best = {}
    with open(src, encoding='utf-8', newline='') as f:
        for r in csv.DictReader(f):
            name = (r['track_name'] or '').strip()
            artists = [a.strip() for a in (r['artists'] or '').split(';') if a.strip()]
            if not name or not artists or len(r['track_id']) != 22:
                continue
            key = (name.lower(), tuple(a.lower() for a in artists))
            pop = int(r['popularity'])
            cur = best.get(key)
            if cur is None:
                best[key] = {'r': r, 'name': name, 'artists': artists, 'pop': pop, 'genres': [r['track_genre']]}
                continue
            if r['track_genre'] not in cur['genres']:
                cur['genres'].append(r['track_genre'])
            if pop > cur['pop']:
                cur.update(r=r, pop=pop)

    songs = sorted(best.values(), key=lambda s: (-s['pop'], s['name'].lower()))
    genres = sorted({g for s in songs for g in s['genres']})
    gidx = {g: i for i, g in enumerate(genres)}
    artists, aidx = [], {}
    albums, albumArtist, alidx = [], [], {}

    def artist_index(name):
        if name not in aidx:
            aidx[name] = len(artists)
            artists.append(name)
        return aidx[name]

    out = {k: [] for k in ('names', 'ta', 'al', 'tg', 'dur', 'tempo')}
    ids, qs, xs = [], [], []
    for s in songs:
        r = s['r']
        ta = [artist_index(a) for a in s['artists']]
        album = (r['album_name'] or '').strip() or s['name']
        akey = (album.lower(), ta[0])
        if akey not in alidx:
            alidx[akey] = len(albums)
            albums.append(album)
            albumArtist.append(ta[0])
        ids.append(r['track_id'])
        out['names'].append(s['name'])
        out['ta'].append(ta[0] if len(ta) == 1 else ta)
        out['al'].append(alidx[akey])
        tg = sorted(gidx[g] for g in s['genres'])
        out['tg'].append(tg[0] if len(tg) == 1 else tg)
        out['dur'].append(round(int(r['duration_ms']) / 1000))
        out['tempo'].append(round(float(r['tempo'])))
        qs.append(ALPHABET[round(s['pop'] * 0.9)] + ''.join(q(r[f]) for f in FEATURES))
        mode = 1 if r['mode'] == '1' else 0
        explicit = 24 if r['explicit'] == 'True' else 0
        key = int(r['key']) if r['key'].isdigit() and int(r['key']) < 12 else 0
        xs.append(ALPHABET[key * 2 + mode + explicit])

    catalog = {
        'v': 1,
        'source': 'Spotify Tracks Dataset (maharshipandya, Hugging Face/Kaggle) – Daten über die Spotify Web API gesammelt',
        'count': len(songs),
        'alphabet': ALPHABET,
        'genres': genres,
        'artists': artists,
        'albums': albums,
        'albumArtist': albumArtist,
        'ids': ''.join(ids),
        'q': ''.join(qs),
        'x': ''.join(xs),
        **out,
    }
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(catalog, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(songs)} Songs, {len(artists)} Künstler, {len(albums)} Alben, {len(genres)} Genres -> {dst}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'catalog.json')
