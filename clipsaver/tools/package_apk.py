"""Packt die APK (Ressourcen von aapt2 + Dex-Dateien + native Bibliotheken einer ABI),
richtet sie aus wie zipalign und signiert sie mit APK Signature Scheme v2.

Aufruf: python3 package_apk.py <base.apk> <dex-ordner> <abi> <ausgabe.apk> <schluessel.p12> <passwort> <jni-ordner>...

v2 reicht ab Android 7 (minSdk 24) aus, deshalb gibt es keine v1-(JAR-)Signatur.
Die .so-Dateien dürfen komprimiert sein, weil die App android:extractNativeLibs="true" setzt
(youtubedl-android startet Python, FFmpeg und QuickJS aus dem entpackten Bibliotheksordner).
"""
import hashlib
import io
import os
import struct
import sys
import zipfile

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import pkcs12

ALIGN = 4
SIG_RSA_PKCS1_SHA256 = 0x0103
V2_BLOCK_ID = 0x7109871A
CHUNK = 1024 * 1024
DATE = (2026, 1, 1, 0, 0, 0)


def collect(base_apk, dex_dir, abi, jni_dirs):
    entries = []
    with zipfile.ZipFile(base_apk) as z:
        for info in z.infolist():
            entries.append((info.filename, z.read(info.filename), info.compress_type))
    for name in sorted(os.listdir(dex_dir)):
        if name.endswith('.dex'):
            with open(os.path.join(dex_dir, name), 'rb') as f:
                entries.append((name, f.read(), zipfile.ZIP_DEFLATED))
    found = 0
    for jni in jni_dirs:
        folder = os.path.join(jni, abi)
        if not os.path.isdir(folder):
            continue
        for name in sorted(os.listdir(folder)):
            if name.endswith('.so'):
                with open(os.path.join(folder, name), 'rb') as f:
                    entries.append(('lib/%s/%s' % (abi, name), f.read(), zipfile.ZIP_DEFLATED))
                found += 1
    if not found:
        raise SystemExit('Keine nativen Bibliotheken für ' + abi)
    return entries


def aligned_zip(entries):
    """Schreibt alle Einträge neu; unkomprimierte Daten beginnen an 4-Byte-Grenzen."""
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', allowZip64=False) as z:
        for name, data, compress in entries:
            # resources.arsc muss ab targetSdk 30 unkomprimiert und ausgerichtet sein
            if name == 'resources.arsc' or name.endswith('.png'):
                compress = zipfile.ZIP_STORED
            info = zipfile.ZipInfo(name, date_time=DATE)
            info.compress_type = compress
            info.external_attr = 0o644 << 16
            if compress == zipfile.ZIP_STORED:
                header_end = out.tell() + 30 + len(name.encode('utf-8'))
                pad = (-(header_end + 6)) % ALIGN
                # Extra-Feld 0xD935 = Ausrichtungs-Feld, wie es zipalign schreibt
                info.extra = struct.pack('<HHH', 0xD935, 2 + pad, ALIGN) + b'\0' * pad
            z.writestr(info, data, compresslevel=9 if compress == zipfile.ZIP_DEFLATED else None)
    return out.getvalue()


def find_eocd(data):
    pos = data.rfind(b'PK\x05\x06')
    if pos < 0:
        raise ValueError('Kein ZIP-Ende gefunden')
    cd_size, cd_offset = struct.unpack('<II', data[pos + 12:pos + 20])
    return pos, cd_offset, cd_size


def lp(b):
    """Längen-präfixierter Block (uint32 little endian)."""
    return struct.pack('<I', len(b)) + b


def digest(sections):
    chunks = []
    for sec in sections:
        for i in range(0, len(sec), CHUNK):
            part = sec[i:i + CHUNK]
            chunks.append(hashlib.sha256(b'\xa5' + struct.pack('<I', len(part)) + part).digest())
    return hashlib.sha256(b'\x5a' + struct.pack('<I', len(chunks)) + b''.join(chunks)).digest()


def sign(apk, key, cert):
    eocd_pos, cd_offset, _ = find_eocd(apk)
    entries, cd, eocd = apk[:cd_offset], apk[cd_offset:eocd_pos], apk[eocd_pos:]

    content_digest = digest([entries, cd, eocd])
    cert_der = cert.public_bytes(serialization.Encoding.DER)
    signed_data = (
        lp(lp(struct.pack('<I', SIG_RSA_PKCS1_SHA256) + lp(content_digest)))
        + lp(lp(cert_der))
        + lp(b'')
    )
    signature = key.sign(signed_data, padding.PKCS1v15(), hashes.SHA256())
    pubkey = key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    signer = lp(signed_data) + lp(lp(struct.pack('<I', SIG_RSA_PKCS1_SHA256) + lp(signature))) + lp(pubkey)
    value = lp(lp(signer))

    pair = struct.pack('<Q', 4 + len(value)) + struct.pack('<I', V2_BLOCK_ID) + value
    size = len(pair) + 8 + 16
    block = struct.pack('<Q', size) + pair + struct.pack('<Q', size) + b'APK Sig Block 42'

    new_eocd = bytearray(eocd)
    struct.pack_into('<I', new_eocd, 16, cd_offset + len(block))
    return entries + block + cd + bytes(new_eocd)


def main():
    base, dex_dir, abi, dst, p12, password = sys.argv[1:7]
    jni_dirs = sys.argv[7:]
    with open(p12, 'rb') as f:
        key, cert, _ = pkcs12.load_key_and_certificates(f.read(), password.encode())
    apk = aligned_zip(collect(base, dex_dir, abi, jni_dirs))
    with open(dst, 'wb') as f:
        f.write(sign(apk, key, cert))


if __name__ == '__main__':
    main()
