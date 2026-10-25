#!/bin/bash
# Nightly MongoDB backup: full gzip dump (app + global catalogue) kept on the
# server for 14 days and copied to the private S3 bucket (encrypted) for 30.
# Installed as /opt/davadesk/backup-mongo.sh, run by /etc/cron.d/davadesk.
#
# Restore (everything):  docker exec -i pharmalogy-mongodb sh -c 'mongorestore -u "$MONGO_INITDB_ROOT_USERNAME" \
#   -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip --drop' < FILE.archive.gz
set -euo pipefail

DIR=/var/backups/davadesk
ENV_FILE=/home/ubuntu/pharmainventory-production/backend-node/.env
KEEP_LOCAL_DAYS=14
KEEP_S3_DAYS=30
TS=$(date -u +%Y%m%d-%H%M%S)
FILE="$DIR/mongo-$TS.archive.gz"

install -d -m 700 "$DIR"
docker exec pharmalogy-mongodb sh -c 'mongodump --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip' > "$FILE.part"
mv "$FILE.part" "$FILE"
chmod 600 "$FILE"
SIZE=$(stat -c %s "$FILE")
# A dump far smaller than expected means something is wrong: keep it, but flag it
[ "$SIZE" -lt 10000000 ] && echo "WARNING: backup only $SIZE bytes"

find "$DIR" -name 'mongo-*.archive.gz' -mtime +$KEEP_LOCAL_DAYS -delete

# Off-server copy
set -a
. <(grep -E '^(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_REGION|AWS_S3_BUCKET)=' "$ENV_FILE" | tr -d '"')
set +a
if [ -n "${AWS_S3_BUCKET:-}" ]; then
  AWS=(docker run --rm -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION="$AWS_REGION" -v "$DIR":/backups:ro amazon/aws-cli)
  "${AWS[@]}" s3 cp "/backups/$(basename "$FILE")" "s3://$AWS_S3_BUCKET/db-backups/$(basename "$FILE")" --sse AES256 --only-show-errors
  OLD=$(date -u -d "-$KEEP_S3_DAYS days" +%Y%m%d)
  for key in $("${AWS[@]}" s3 ls "s3://$AWS_S3_BUCKET/db-backups/" | awk '{print $4}'); do
    d=$(echo "$key" | sed -nE 's/^mongo-([0-9]{8})-.*/\1/p')
    [ -n "$d" ] && [ "$d" -lt "$OLD" ] && "${AWS[@]}" s3 rm "s3://$AWS_S3_BUCKET/db-backups/$key" --only-show-errors
  done
fi
echo "$(date -u +%FT%TZ) backup ok $(basename "$FILE") $SIZE bytes"
