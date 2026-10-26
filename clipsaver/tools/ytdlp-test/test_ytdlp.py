"""Prüft die yt-dlp-Aufrufe der App (Engine.java) mit echtem yt-dlp und FFmpeg – ohne Internet.

Ein lokaler Server liefert kleine, mit FFmpeg erzeugte Testdateien; die Format-Liste ist wie bei YouTube
bzw. TikTok aufgebaut (Info-JSON wie von "yt-dlp -J"). Geprüft wird, dass
  * die von der App gewählten Format-IDs geladen und zu MP4 zusammengefügt werden (H.264 bzw. VP9 + AAC),
  * die Ersatz-Sortierung (-S) greift, wenn es die IDs nicht gibt,
  * "Nur Ton" eine MP3 erzeugt und bei TikTok nicht die Hintergrundmusik nimmt,
  * TikTok-Videos nicht mit der Hintergrundmusik zusammengefügt werden,
  * --print-to-file Dateipfad, Größe und Titel liefert und die Fortschrittszeilen zu DownloadService passen.

Aufruf: pip install "yt-dlp==2025.11.12"; python3 tools/ytdlp-test/test_ytdlp.py [pfad/zu/yt-dlp]
"""
import functools
import http.server
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading

YTDLP = sys.argv[1] if len(sys.argv) > 1 else 'yt-dlp'
FAILED = []


def check(cond, what):
    print(('ok    ' if cond else 'FEHLER') + ' ' + what)
    if not cond:
        FAILED.append(what)


def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *args], check=True)


def probe(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', path],
                         capture_output=True, text=True, check=True).stdout
    return sorted(s['codec_type'] + ':' + s['codec_name'] for s in json.loads(out)['streams'])


def make_media(d):
    src_v = ['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25:duration=2']
    tone = lambda hz: ['-f', 'lavfi', '-i', 'sine=frequency=%d:duration=2' % hz]
    ffmpeg(*src_v, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', os.path.join(d, 'v137.mp4'))
    ffmpeg(*src_v, '-c:v', 'libvpx-vp9', '-b:v', '200k', '-an', os.path.join(d, 'v271.webm'))
    ffmpeg(*src_v, '-c:v', 'libvpx-vp9', '-b:v', '200k', '-an', os.path.join(d, 'v313.webm'))
    ffmpeg(*tone(440), '-c:a', 'aac', '-vn', os.path.join(d, 'a140.m4a'))
    ffmpeg(*tone(440), '-c:a', 'libopus', '-vn', os.path.join(d, 'a251.webm'))
    # TikTok: Video mit eigenem Ton (440 Hz) und getrennte Hintergrundmusik (880 Hz)
    ffmpeg(*src_v, *tone(440), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', os.path.join(d, 'tt1080.mp4'))
    ffmpeg(*tone(880), '-c:a', 'aac', os.path.join(d, 'music.m4a'))


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve(d):
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=d))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, 'http://127.0.0.1:%d/' % srv.server_address[1]


def fmt(base, fid, file, ext, vcodec, acodec, w=None, h=None, size=None, **kw):
    f = {'format_id': fid, 'url': base + file, 'ext': ext, 'protocol': 'http', 'vcodec': vcodec, 'acodec': acodec,
         'width': w, 'height': h, 'filesize': size, 'http_headers': {'User-Agent': 'Mozilla/5.0'}}
    f.update(kw)
    return f


def youtube_info(base):
    return {
        'id': 'abcdefghijk', 'title': 'Alpen in 4K\t"Test"\nZeile 2', 'extractor': 'youtube', 'extractor_key': 'Youtube',
        'webpage_url': 'https://www.youtube.com/watch?v=abcdefghijk', 'duration': 2, '_type': 'video',
        'formats': [
            fmt(base, '140', 'a140.m4a', 'm4a', 'none', 'mp4a.40.2', size=40000, abr=129),
            fmt(base, '251', 'a251.webm', 'webm', 'none', 'opus', size=45000, abr=150),
            fmt(base, '137', 'v137.mp4', 'mp4', 'avc1.640028', 'none', 1920, 1080, 400000, fps=25),
            fmt(base, '271', 'v271.webm', 'webm', 'vp9', 'none', 2560, 1440, 900000, fps=25),
            fmt(base, '313', 'v313.webm', 'webm', 'vp9', 'none', 3840, 2160, 2200000, fps=25),
        ],
    }


def tiktok_info(base):
    return {
        'id': '7300000000000000000', 'title': 'TikTok Test', 'extractor': 'TikTok', 'extractor_key': 'TikTok',
        'webpage_url': 'https://www.tiktok.com/@a/video/7300000000000000000', 'duration': 2, '_type': 'video',
        'formats': [
            fmt(base, 'h264_1080p_3100000-0', 'tt1080.mp4', 'mp4', 'h264', 'aac', 1080, 1920, 300000),
            fmt(base, 'audio', 'music.m4a', 'm4a', 'none', 'aac', size=30000),
        ],
    }


def run(work, info, quality, fmt_ids, name):
    """Gleiche Optionen wie Engine.downloadOnce + common() (ohne --js-runtimes/--cookies, mit lokalem FFmpeg)."""
    d = os.path.join(work, name)
    os.makedirs(d)
    info_file = os.path.join(d, 'info.json')
    with open(info_file, 'w') as f:
        json.dump(info, f)
    args = [YTDLP, '--load-info-json', info_file, '--no-playlist']
    if quality == 'audio':
        args += ['-f', (fmt_ids + '/' if fmt_ids else '') + 'ba[format_id!=audio]/b/ba', '-x', '--audio-format', 'mp3', '--audio-quality', '0']
    else:
        sort = 'res:%s,vcodec:%s,acodec:m4a' % (quality, 'h264' if int(quality) <= 1080 else 'vp9')
        args += ['-f', (fmt_ids + '/' if fmt_ids else '') + 'bv*+ba/b', '-S', sort, '--merge-output-format', 'mp4']
    done = os.path.join(d, 'done.txt')
    args += ['-o', os.path.join(d, 'media.%(ext)s'), '--no-mtime', '--newline', '--concurrent-fragments', '4',
             '--print-to-file', 'after_move:%(filepath)s\t%(width)s\t%(height)s\t%(title)j', done,
             '--cache-dir', os.path.join(work, 'cache'), '--socket-timeout', '30', '--retries', '5', '--extractor-retries', '3',
             '--ffmpeg-location', shutil.which('ffmpeg')]
    p = subprocess.run(args, capture_output=True, text=True)
    if p.returncode != 0:
        print(p.stdout, p.stderr)
    line = open(done).read().strip().split('\n')[-1].split('\t') if os.path.exists(done) else ['']
    return p, line


def main():
    work = tempfile.mkdtemp(prefix='clipsaver-ytdlp-')
    media = os.path.join(work, 'media')
    os.makedirs(media)
    make_media(media)
    srv, base = serve(media)
    try:
        yt, tt = youtube_info(base), tiktok_info(base)

        p, line = run(work, yt, '2160', '313+140', 'yt4k')
        check(p.returncode == 0, '4K: yt-dlp ok')
        check(line[0].endswith('media.mp4') and os.path.exists(line[0]), '4K: MP4-Datei laut --print-to-file')
        check(probe(line[0]) == ['audio:aac', 'video:vp9'], '4K: VP9 + AAC in MP4 (%s)' % probe(line[0]))
        check(line[1:3] == ['3840', '2160'], '4K: Breite/Höhe für den Dateinamen')
        check(json.loads(line[3]) == yt['title'], '4K: Titel mit Tab/Zeilenumbruch heil (%(title)j)')
        check(re.search(r'Downloading \d+ format\(s\): (\S+)', p.stdout).group(1) == '313+140', '4K: Formatzeile für den Fortschritt')
        check(p.stdout.count('[download] Destination:') == 2, '4K: zwei Teile (Video, Ton)')
        check('[Merger]' in p.stdout, '4K: Zusammenfügen gemeldet')
        speed = re.search(r'\bat\s+~?\s*([\d.]+\s*[KMG]?i?B/s)', p.stdout)
        check(speed is not None, '4K: Geschwindigkeit erkennbar')

        p, line = run(work, yt, '1440', '271+140', 'yt1440')
        check(probe(line[0]) == ['audio:aac', 'video:vp9'] and line[2] == '1440', '1440p: VP9 1440 + AAC')

        p, line = run(work, yt, '1080', '137+140', 'yt1080')
        check(probe(line[0]) == ['audio:aac', 'video:h264'] and line[2] == '1080', '1080p: H.264 + AAC')

        p, line = run(work, yt, '1080', '999+888', 'ytfallback')
        check(p.returncode == 0 and probe(line[0]) == ['audio:aac', 'video:h264'] and line[2] == '1080',
              'Ersatz: unbekannte IDs → -S wählt H.264 1080p + AAC')
        p, line = run(work, yt, '2160', None, 'ytsort4k')
        check(probe(line[0]) == ['audio:aac', 'video:vp9'] and line[2] == '2160', 'Ersatz: -S res:2160 wählt VP9 4K')

        p, line = run(work, yt, 'audio', '140', 'ytaudio')
        check(line[0].endswith('.mp3') and probe(line[0]) == ['audio:mp3'], 'Nur Ton: MP3')

        p, line = run(work, tt, '1080', 'h264_1080p_3100000-0', 'tt')
        check(re.search(r'Downloading \d+ format\(s\): (\S+)', p.stdout).group(1) == 'h264_1080p_3100000-0', 'TikTok: nur das Video')
        check(probe(line[0]) == ['audio:aac', 'video:h264'], 'TikTok: Video mit eigenem Ton')
        p, line = run(work, tt, '1080', None, 'ttsort')
        check(re.search(r'Downloading \d+ format\(s\): (\S+)', p.stdout).group(1) == 'h264_1080p_3100000-0',
              'TikTok ohne IDs: bv*+ba nimmt nicht die Hintergrundmusik dazu')
        p, line = run(work, tt, 'audio', None, 'ttaudio')
        check(re.search(r'Downloading \d+ format\(s\): (\S+)', p.stdout).group(1) == 'h264_1080p_3100000-0',
              'TikTok Nur Ton: Ton aus dem Video statt Hintergrundmusik')
        check(line[0].endswith('.mp3'), 'TikTok Nur Ton: MP3')
    finally:
        srv.shutdown()
        shutil.rmtree(work, ignore_errors=True)
    print('%d Fehler' % len(FAILED))
    sys.exit(1 if FAILED else 0)


if __name__ == '__main__':
    main()
