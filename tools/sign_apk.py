"""Packt eine APK (4-Byte-Ausrichtung wie zipalign) und signiert sie mit APK Signature Scheme v2.

Aufruf: python3 sign_apk.py <eingabe.apk> <classes.dex> <ausgabe.apk> <schluessel.p12> <passwort>

v2 reicht ab Android 7 (minSdk 24) aus, deshalb gibt es keine v1-(JAR-)Signatur.
"""
import hashlib
import io
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


def aligned_zip(src_apk, dex_path):
    """Schreibt alle Einträge neu; unkomprimierte Daten beginnen an 4-Byte-Grenzen."""
    entries = []
    with zipfile.ZipFile(src_apk) as z:
        for info in z.infolist():
            if info.filename == 'classes.dex':
                continue
            entries.append((info.filename, z.read(info.filename), info.compress_type))
    with open(dex_path, 'rb') as f:
        entries.append(('classes.dex', f.read(), zipfile.ZIP_DEFLATED))

    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w') as z:
        for name, data, compress in entries:
            # resources.arsc muss ab targetSdk 30 unkomprimiert und ausgerichtet sein
            if name == 'resources.arsc' or name.endswith('.png'):
                compress = zipfile.ZIP_STORED
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = compress
            info.external_attr = 0o644 << 16
            if compress == zipfile.ZIP_STORED:
                header_end = out.tell() + 30 + len(name.encode('utf-8'))
                pad = (-(header_end + 6)) % ALIGN
                # Extra-Feld 0xD935 = Ausrichtungs-Feld, wie es zipalign schreibt
                info.extra = struct.pack('<HHH', 0xD935, 2 + pad, ALIGN) + b'\0' * pad
            z.writestr(info, data)
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
    src, dex, dst, p12, password = sys.argv[1:6]
    with open(p12, 'rb') as f:
        key, cert, _ = pkcs12.load_key_and_certificates(f.read(), password.encode())
    apk = aligned_zip(src, dex)
    with open(dst, 'wb') as f:
        f.write(sign(apk, key, cert))


if __name__ == '__main__':
    main()
