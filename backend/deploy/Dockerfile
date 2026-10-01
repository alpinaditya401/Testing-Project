# AquaSmart backend — PHP + SQLite
#
# Memakai Apache + mod_php, BUKAN `php -S`.
# API.md baris 88: "Jangan menjalankan server built-in PHP di alamat publik."
# Server built-in itu single-threaded dan memang tidak ditujukan untuk produksi.
#
# Build:  docker build -f deploy/Dockerfile -t aquasmart-api .
# Run:    docker run -p 8080:8080 -v aquasmart-data:/data --env-file .env aquasmart-api
#
# Jalankan dari folder backend (folder yang berisi server/ dan web/).

FROM php:8.3-apache

# pdo_sqlite sudah dikompilasi ke dalam PHP di image resmi (--with-pdo-sqlite),
# jadi cukup diperiksa, bukan dipasang. docker-php-ext-install pdo_sqlite justru
# mengompilasi ulang dari sumber dan gagal, karena header libsqlite3-dev sudah
# dibuang image resmi setelah build-nya selesai.
RUN php -m | grep -q '^pdo_sqlite$' \
 && php -m | grep -q '^session$' \
 && a2enmod rewrite headers

# Produksi: tampilkan error ke log, jangan ke response body.
RUN { \
      echo 'display_errors=Off'; \
      echo 'log_errors=On'; \
      echo 'error_log=/dev/stderr'; \
      echo 'expose_php=Off'; \
      echo 'post_max_size=1M'; \
      echo 'upload_max_filesize=1M'; \
      echo 'session.cookie_httponly=1'; \
      echo 'session.use_strict_mode=1'; \
    } > /usr/local/etc/php/conf.d/aquasmart.ini

WORKDIR /var/www/html
COPY server/ ./server/
COPY web/ ./web/

# Front controller dibuat saat build, bukan ditambahkan ke repo.
#
# Kenapa perlu: router.php baris 26 memakai `return false` untuk menyerahkan
# file statis ke server — itu idiom khas `php -S` dan tidak berarti apa-apa di
# Apache. Aturan rewrite di bawah membuat Apache melayani file yang benar-benar
# ada SEBELUM PHP dipanggil, sehingga cabang itu tidak pernah tercapai dan
# router hanya menangani /api/ serta rute SPA.
RUN printf '<?php\nrequire __DIR__ . "/../server/router.php";\n' > ./web/index.php

# Direktori data harus bisa ditulis www-data — SQLite WAL membuat file -wal dan
# -shm di direktori yang sama, jadi izin pada file saja tidak cukup.
# Tanpa instruksi VOLUME: Railway menolaknya dan memasang volume sendiri di /data.
# Lokal: docker run -v aquasmart-data:/data ...
RUN mkdir -p /data && chown -R www-data:www-data /data ./server ./web

ENV AQUASMART_DB_PATH=/data/aquasmart.sqlite \
    AQUASMART_SESSION_SECURE=1 \
    AQUASMART_APP_ENV=production \
    APACHE_DOCUMENT_ROOT=/var/www/html/web \
    PORT=8080

RUN { \
      echo 'ServerTokens Prod'; \
      echo 'ServerSignature Off'; \
      echo 'TraceEnable Off'; \
      echo '<Directory /var/www/html/web>'; \
      echo '  Options -Indexes +FollowSymLinks'; \
      echo '  AllowOverride None'; \
      echo '  Require all granted'; \
      echo '  DirectoryIndex index.html index.php'; \
      echo '  RewriteEngine On'; \
      echo '  # File yang benar-benar ada dilayani Apache langsung.'; \
      echo '  RewriteCond %{REQUEST_FILENAME} -f'; \
      echo '  RewriteRule ^ - [L]'; \
      echo '  # Sisanya (API dan rute SPA) ke front controller.'; \
      echo '  RewriteRule ^ /index.php [L]'; \
      echo '</Directory>'; \
      echo '# server/ tidak boleh dijangkau dari web.'; \
      echo '<Directory /var/www/html/server>'; \
      echo '  Require all denied'; \
      echo '</Directory>'; \
    } > /etc/apache2/conf-available/aquasmart.conf \
 && a2enconf aquasmart

# Railway dan Render menyuntikkan $PORT saat runtime, jadi port tidak bisa
# dipatok saat build. Volume Railway dipasang oleh root di atas /data dan
# menimpa izin dari build, jadi direktori data di-chown lagi setiap start.
#
# Runtime container Railway tidak menerapkan whiteout OCI, sehingga berkas yang
# dihapus di layer belakangan muncul lagi. Staf Railway mengakuinya sebagai bug
# yang belum diperbaiki:
# https://station.railway.com/questions/files-that-never-existed-on-the-image-ge-5f629342
# Image resmi mematikan mpm_event dengan a2dismod di layer tersendiri, jadi di
# Railway symlink-nya hidup lagi dan Apache berhenti dengan AH00534 "More than
# one MPM loaded". MPM karena itu ditetapkan ulang saat start, bukan saat build.
# a2dismod harus lebih dulu: a2enmod menolak mpm_prefork selama mpm_event aktif.
# Keduanya keluar dengan kode 0 kalau keadaannya sudah benar, jadi set -e tidak
# terpicu. configtest menghentikan start.sh sebelum exec kalau masih ada MPM
# kedua dari sumber lain.
RUN printf '%s\n' \
  '#!/bin/sh' \
  'set -e' \
  ': "${PORT:=8080}"' \
  'DATA_DIR="$(dirname "${AQUASMART_DB_PATH:-/data/aquasmart.sqlite}")"' \
  'mkdir -p "$DATA_DIR" && chown -R www-data:www-data "$DATA_DIR"' \
  'sed -ri "s/^Listen .*/Listen ${PORT}/" /etc/apache2/ports.conf' \
  'sed -ri "s!<VirtualHost \\*:[0-9]+>!<VirtualHost *:${PORT}>!" /etc/apache2/sites-available/000-default.conf' \
  'sed -ri "s!DocumentRoot /var/www/html!DocumentRoot ${APACHE_DOCUMENT_ROOT}!" /etc/apache2/sites-available/000-default.conf' \
  'a2dismod -q mpm_event mpm_worker' \
  'a2enmod -q mpm_prefork' \
  'apache2ctl configtest' \
  'exec apache2-foreground' \
  > /usr/local/bin/start.sh && chmod +x /usr/local/bin/start.sh

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD php -r 'exit(@file_get_contents("http://127.0.0.1:".(getenv("PORT")?:8080)."/api/health") ? 0 : 1);'

CMD ["/usr/local/bin/start.sh"]
