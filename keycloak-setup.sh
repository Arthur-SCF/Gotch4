#!/usr/bin/env bash
# Gotch4 — Keycloak realm bootstrap script
# Usage: bash keycloak-setup.sh [admin-password] [user-password] [username]
# REQUIRED: admin-password must be provided (no default). user-password must be provided (no default).

set -e

KC_URL="http://localhost:8080"
ADMIN_PASS="${1}"
USER_PASS="${2}"
USER_NAME="${3:-gotch4}"

# ── Validate passwords are not left as defaults ──────────────────────────────
if [ -z "$ADMIN_PASS" ] || [ "$ADMIN_PASS" = "CHANGE_ME" ]; then
  echo ""
  echo "❌ ERROR: Keycloak admin password must be explicitly provided"
  echo "   Refusing to proceed with default/missing admin password."
  echo ""
  echo "Usage:"
  echo "  bash keycloak-setup.sh <admin-password> <user-password> [username]"
  echo ""
  echo "Example:"
  echo "  bash keycloak-setup.sh 'MySecureAdminPass!' 'MySecureUserPass!' gotch4"
  echo ""
  exit 1
fi

if [ -z "$USER_PASS" ] || [ "$USER_PASS" = "gotch4pass" ] || [ "$USER_PASS" = "CHANGE_ME" ]; then
  echo ""
  echo "❌ ERROR: Keycloak app user password must be explicitly provided"
  echo "   Refusing to proceed with default/missing user password."
  echo ""
  echo "Usage:"
  echo "  bash keycloak-setup.sh <admin-password> <user-password> [username]"
  echo ""
  echo "Example:"
  echo "  bash keycloak-setup.sh 'MySecureAdminPass!' 'MySecureUserPass!' gotch4"
  echo ""
  exit 1
fi

echo "⏳ Fetching admin token..."
TOKEN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=${ADMIN_PASS}&grant_type=password&client_id=admin-cli")
TOKEN_HTTP=$(printf '%s\n' "$TOKEN_RESPONSE" | tail -n1)
TOKEN_BODY=$(printf '%s\n' "$TOKEN_RESPONSE" | sed '$d')

if [ "$TOKEN_HTTP" != "200" ]; then
  echo "❌ Failed to get admin token (HTTP $TOKEN_HTTP)."
  if [ -n "$TOKEN_BODY" ]; then
    echo "Response: $TOKEN_BODY"
  else
    echo "Response body was empty. Is Keycloak running at ${KC_URL}?"
  fi
  exit 1
fi

TOKEN=$(printf '%s' "$TOKEN_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true)

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to parse admin token from response."
  if [ -n "$TOKEN_BODY" ]; then
    echo "Response: $TOKEN_BODY"
  fi
  exit 1
fi
echo "✅ Admin token acquired"

echo ""
echo "⏳ Creating realm 'gotch4'..."
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${KC_URL}/admin/realms" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "realm": "gotch4",
    "enabled": true,
    "accessTokenLifespan": 300,
    "refreshTokenMaxReuse": 0,
    "ssoSessionMaxLifespan": 36000
  }')

if [ "$HTTP" = "201" ]; then
  echo "✅ Realm created"
elif [ "$HTTP" = "409" ]; then
  echo "⚠️  Realm already exists, continuing..."
else
  echo "❌ Failed to create realm (HTTP $HTTP)"
  exit 1
fi

echo ""
echo "⏳ Creating client 'gotch4-spa'..."
CLIENTS_JSON=$(curl -s -G "${KC_URL}/admin/realms/gotch4/clients" \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "clientId=gotch4-spa")
CLIENT_COUNT=$(printf '%s' "$CLIENTS_JSON" | python3 -c "import sys,json; data=json.load(sys.stdin); print(len(data) if isinstance(data, list) else 0)" 2>/dev/null || true)

if [ "${CLIENT_COUNT:-0}" -gt 0 ]; then
  echo "⚠️  Client already exists, continuing..."
else
  CLIENT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${KC_URL}/admin/realms/gotch4/clients" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "clientId": "gotch4-spa",
      "enabled": true,
      "publicClient": true,
      "standardFlowEnabled": true,
      "directAccessGrantsEnabled": false,
      "redirectUris": [
        "http://localhost:3000/auth/callback",
        "http://localhost:5173/auth/callback"
      ],
      "webOrigins": [
        "http://localhost:3000",
        "http://localhost:5173"
      ],
      "attributes": {
        "post.logout.redirect.uris": "http://localhost:3000/##http://localhost:5173/",
        "pkce.code.challenge.method": "S256"
      }
    }')
  CLIENT_HTTP=$(printf '%s\n' "$CLIENT_RESPONSE" | tail -n1)
  CLIENT_BODY=$(printf '%s\n' "$CLIENT_RESPONSE" | sed '$d')

  if [ "$CLIENT_HTTP" = "201" ]; then
    echo "✅ Client created"
  else
    echo "❌ Failed to create client (HTTP $CLIENT_HTTP)"
    if [ -n "$CLIENT_BODY" ]; then
      echo "Response: $CLIENT_BODY"
    fi
    exit 1
  fi
fi

echo ""
echo "⏳ Creating user '${USER_NAME}'..."
USER_STATUS="existing"
USERS_JSON=$(curl -s -G "${KC_URL}/admin/realms/gotch4/users" \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "username=${USER_NAME}" \
  --data-urlencode "exact=true")
USER_COUNT=$(printf '%s' "$USERS_JSON" | python3 -c "import sys,json; data=json.load(sys.stdin); print(len(data) if isinstance(data, list) else 0)" 2>/dev/null || true)

if [ "${USER_COUNT:-0}" -gt 0 ]; then
  echo "⚠️  User already exists. Existing password is kept (no password update performed)."
else
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${KC_URL}/admin/realms/gotch4/users" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"username\": \"${USER_NAME}\",
      \"enabled\": true,
      \"credentials\": [{
        \"type\": \"password\",
        \"value\": \"${USER_PASS}\",
        \"temporary\": false
      }]
    }")

  if [ "$HTTP" = "201" ]; then
    USER_STATUS="created"
    echo "✅ User created"
  else
    echo "❌ Failed to create user (HTTP $HTTP)"
    exit 1
  fi
fi

echo ""
echo "═══════════════════════════════════════"
echo "  ✅ Keycloak setup complete"
echo "═══════════════════════════════════════"
echo ""
echo "  URL:      http://localhost:3000"
echo "  Username: ${USER_NAME}"
if [ "$USER_STATUS" = "created" ]; then
  echo "  Password: ${USER_PASS}"
else
  echo "  Password: unchanged (user already existed before this run)"
fi
echo ""
echo "  Verify realm:"
echo "  curl -s http://localhost:8080/realms/gotch4/.well-known/openid-configuration | python3 -m json.tool | head -5"
echo ""
